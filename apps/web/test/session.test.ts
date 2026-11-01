import { describe, expect, it, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { Session } from '../src/lib/session.js';
import type { Transport } from '../src/lib/client.js';
import type { HistoryEntry, StreamEvent, WorldResponse } from '../src/lib/types.js';
import fixture from '../../api/test/fixtures/goto-step.json';
const entry = (revision: number): HistoryEntry => ({ ...fixture.response.historyEntries[0], worldId: 'w', revision } as HistoryEntry);
const snapshot = (revision: number, historyEntries: HistoryEntry[] = []): WorldResponse => ({ ...fixture.response, worldId: 'w', revision, historyEntries } as WorldResponse);
function harness() {
  let event!: (e: StreamEvent) => void; let lost!: () => void;
  const close = vi.fn();
  const transport: Transport = {
    create: vi.fn(), get: vi.fn(async () => snapshot(5)), act: vi.fn(async () => snapshot(6, [entry(6)])),
    history: vi.fn(async (_id, after, through) => ({ entries: Array.from({ length: through - after }, (_, i) => entry(after + i + 1)), nextAfterRevision: through, hasMore: false })),
    presence: vi.fn(async () => ({ worldId: 'w', revision: 5, expiresInMs: 15000 })),
    subscribe: vi.fn((_id, next, onLost) => { event = next; lost = onLost; return close; }),
  };
  const session = new Session(transport);
  return { session, transport, close, event: (e: StreamEvent) => event(e), lost: () => lost() };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());
describe('committed browser session', () => {
  it('keeps history contiguous independently from duplicate and out-of-order snapshots (U05)', async () => {
    const h = harness(); h.session.open('w');
    h.event({ type: 'world.snapshot', data: snapshot(5) }); await flush();
    expect(get(h.session).historyCursor).toBe(5);
    h.event({ type: 'world.updated', data: snapshot(8, [entry(8)]) });
    h.event({ type: 'world.updated', data: snapshot(6, [entry(6)]) });
    await flush();
    expect(get(h.session).world?.revision).toBe(8);
    expect(get(h.session).history.map(e => e.revision)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(h.transport.history).toHaveBeenCalledWith('w', 5, 8);
    h.session.dispose();
  });
  it('replaces heartbeat IDs even for equal state revisions, stops old renewals and tears down (U06/S07)', async () => {
    vi.useFakeTimers(); const h = harness(); h.session.open('w');
    h.event({ type: 'stream.ready', data: { worldId: 'w', subscriptionId: 'first' } });
    h.event({ type: 'world.snapshot', data: snapshot(5) });
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.transport.presence).toHaveBeenLastCalledWith('w', 'first');
    h.event({ type: 'stream.ready', data: { worldId: 'w', subscriptionId: 'second' } });
    h.event({ type: 'world.snapshot', data: snapshot(5) });
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.transport.presence).toHaveBeenLastCalledWith('w', 'second');
    h.session.dispose(); const calls = vi.mocked(h.transport.presence).mock.calls.length;
    await vi.advanceTimersByTimeAsync(20000);
    expect(h.transport.presence).toHaveBeenCalledTimes(calls); expect(h.close).toHaveBeenCalled();
  });
  it('checks lost streams, reconnects and never sends automatic Play (S06/U06)', async () => {
    vi.useFakeTimers(); const h = harness(); h.session.open('w');
    h.event({ type: 'world.snapshot', data: snapshot(5) }); h.lost(); await flush();
    expect(get(h.session).connection).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.transport.subscribe).toHaveBeenCalledTimes(2);
    expect(h.transport.act).not.toHaveBeenCalled(); h.session.dispose();
  });
  it('refreshes after an ambiguous mutation without retrying it or inventing changes (U04)', async () => {
    const h = harness(); h.session.open('w'); h.event({ type: 'world.snapshot', data: snapshot(5) }); await flush();
    vi.mocked(h.transport.act).mockRejectedValueOnce(new TypeError('network lost'));
    await h.session.act({ type: 'STEP' });
    expect(h.transport.act).toHaveBeenCalledTimes(1);
    expect(h.transport.get).toHaveBeenCalled(); expect(get(h.session).error).toContain("couldn't confirm");
    expect(get(h.session).world?.revision).toBe(5); h.session.dispose();
  });
});

describe('session recovery boundaries', () => {
  it('finds a lost final update from heartbeat revision and fetches history (S08)', async () => {
    vi.useFakeTimers(); const h = harness(); h.session.open('w'); h.event({ type: 'world.snapshot', data: snapshot(5) }); await flush();
    h.event({ type: 'stream.ready', data: { worldId: 'w', subscriptionId: 'current' } });
    vi.mocked(h.transport.presence).mockResolvedValue({ worldId: 'w', revision: 7, expiresInMs: 15000 });
    vi.mocked(h.transport.get).mockResolvedValue(snapshot(7));
    await vi.advanceTimersByTimeAsync(5000);
    expect(get(h.session).world?.revision).toBe(7); expect(get(h.session).historyCursor).toBe(7); h.session.dispose();
  });
  it('allows one mutation at a time and never updates state before commitment (U04)', async () => {
    const h = harness(); h.session.open('w'); h.event({ type: 'world.snapshot', data: snapshot(5) }); await flush();
    let finish!: (world: WorldResponse) => void;
    vi.mocked(h.transport.act).mockImplementationOnce(() => new Promise(resolve => finish = resolve));
    const pending = h.session.act({ type: 'STEP' });
    expect(get(h.session).pending).toBe('STEP'); expect(get(h.session).world?.revision).toBe(5);
    expect(await h.session.act({ type: 'STEP' })).toBe(false); expect(h.transport.act).toHaveBeenCalledTimes(1);
    finish(snapshot(6, [entry(6)])); await pending; expect(get(h.session).pending).toBe(''); expect(get(h.session).world?.revision).toBe(6); h.session.dispose();
  });
  it('keeps scheduler error separate from saved Playing until Pause commits (S10/U08)', async () => {
    const h = harness(); const playing = { ...snapshot(5), runningTickIntervalMs: 500, state: { ...snapshot(5).state, lifecycle: 'PLAYING' as const } };
    h.session.open('w'); h.event({ type: 'world.snapshot', data: playing });
    h.event({ type: 'scheduler.error', data: { worldId: 'w', error: { code: 'INTERNAL_ERROR', message: 'Playback stopped due to an error' } } });
    h.event({ type: 'world.updated', data: playing });
    expect(get(h.session).world?.state.lifecycle).toBe('PLAYING'); expect(get(h.session).world?.runningTickIntervalMs).toBeNull(); expect(get(h.session).stopped).toBe(true);
    h.event({ type: 'world.updated', data: snapshot(6) }); expect(get(h.session).stopped).toBe(false); h.session.dispose();
  });
  it('retains a fixed history boundary across pages while newer state arrives (U05)', async () => {
    const h = harness(); let page!: (result: { entries: HistoryEntry[]; nextAfterRevision: number; hasMore: boolean }) => void;
    vi.mocked(h.transport.history).mockImplementationOnce(() => new Promise(resolve => page = resolve));
    h.session.open('w'); h.event({ type: 'world.snapshot', data: snapshot(5) });
    h.event({ type: 'world.updated', data: snapshot(8, [entry(8)]) });
    page({ entries: [entry(1), entry(2)], nextAfterRevision: 2, hasMore: true }); await flush();
    expect(h.transport.history).toHaveBeenNthCalledWith(2, 'w', 2, 5);
    expect(get(h.session).historyCursor).toBe(8); h.session.dispose();
  });
});

it('keeps last tick context through Pause but drops it on skipped revisions or resync', async () => {
  const h = harness(); const at = (revision: number, tick: number) => ({ ...snapshot(revision), state: { ...snapshot(revision).state, tick } });
  h.session.open('w'); h.event({ type: 'world.snapshot', data: at(5, 0) }); await flush();
  h.event({ type: 'world.updated', data: at(6, 1) }); expect(get(h.session).adjacent).toBe(true);
  h.event({ type: 'world.updated', data: at(7, 1) }); expect(get(h.session).previous?.state.tick).toBe(0);
  h.event({ type: 'world.updated', data: at(10, 2) }); expect(get(h.session).adjacent).toBe(false); expect(get(h.session).previous).toBeNull();
  h.session.dispose();
});
