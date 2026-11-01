import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../dist/persistence/database.js';
import { WorldService } from '../dist/floors/world-service.js';
import { CommittedActions, CommittedUpdates } from '../dist/floors/committed-actions.js';
import { Playback } from '../dist/playback/playback.js';

export class Clock {
  time = 0; next = 0; jobs = new Map();
  now = () => this.time;
  setTimeout = (run, delay) => { const id = ++this.next; this.jobs.set(id, { run, at: this.time + delay }); return id; };
  clearTimeout = id => this.jobs.delete(id);
  advance(ms) {
    const end = this.time + ms;
    while (true) {
      const job = [...this.jobs].sort((a, b) => a[1].at - b[1].at || a[0] - b[0]).find(([, j]) => j.at <= end);
      if (!job) break;
      this.time = job[1].at; this.jobs.delete(job[0]); job[1].run();
    }
    this.time = end;
  }
}
const resources = [];
afterEach(() => { for (const f of resources.splice(0)) { f.playback.close(); f.db.close(); rmSync(f.directory, { recursive: true, force: true }); } });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'fleet-playback-')), db = openDatabase(join(directory, 'world.sqlite'));
  const worlds = new WorldService(db), updates = new CommittedUpdates(), actions = new CommittedActions(worlds, updates), clock = new Clock();
  const playback = new Playback(worlds, actions, clock);
  const id = actions.create(2, 1).worldId;
  actions.act(id, { type: 'PLACE_ROBOT', position: { x: 0, y: 0 }, facing: 'EAST' });
  actions.act(id, { type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'MOVE' }, { type: 'LEFT' }] });
  actions.act(id, { type: 'FINISH_SETUP' });
  const f = { directory, db, worlds, updates, actions, clock, playback, id }; resources.push(f); return f;
}
const play = f => f.playback.act(f.id, { type: 'PLAY', tickIntervalMs: 1000 });

test('S03/S09: one generation, repeated Play interval unchanged, Pause/End reject stale callbacks', () => {
  const f = fixture();
  expect(() => play(f)).toThrow();
  f.playback.register(f.id); play(f);
  expect(f.playback.interval(f.id)).toBe(1000);
  const stale = [...f.clock.jobs.values()].find(j => j.at === 1000).run;
  const repeated = f.playback.act(f.id, { type: 'PLAY', tickIntervalMs: 100 });
  expect(repeated.historyEntries).toEqual([]); expect(f.playback.interval(f.id)).toBe(1000);
  f.clock.advance(1000);
  expect(f.worlds.get(f.id).state).toMatchObject({ tick: 1, robots: [{ battery: 99, queue: [{ type: 'LEFT' }] }] });
  f.playback.act(f.id, { type: 'PAUSE' });
  expect(f.playback.interval(f.id)).toBeNull();
  play(f); stale(); expect(f.worlds.get(f.id).state.tick).toBe(1);
  f.playback.act(f.id, { type: 'END' }); stale(); f.clock.advance(5000);
  expect(f.worlds.get(f.id).state).toMatchObject({ tick: 1, lifecycle: 'ENDED' });
  expect(f.playback.interval(f.id)).toBeNull();
  expect(f.db.prepare('SELECT snapshot_json FROM worlds').get().snapshot_json).not.toContain('Interval');
});

test('S04/S05/S06/S07: renewal has no audit, one client remains, closed grace and reconnect require Play after expiry', () => {
  const f = fixture(), first = f.playback.register(f.id), second = f.playback.register(f.id);
  play(f); f.clock.advance(5000);
  const before = f.worlds.get(f.id);
  expect(f.playback.renew(f.id, second)).toEqual({ worldId: f.id, revision: before.revision, expiresInMs: 15000 });
  expect(f.worlds.get(f.id)).toEqual(before);
  f.playback.disconnect(first);
  expect(() => f.playback.renew(f.id, first)).toThrow();
  f.clock.advance(10000); expect(f.worlds.get(f.id).state.lifecycle).toBe('PLAYING');
  f.playback.disconnect(second);
  f.clock.advance(4000); const replacement = f.playback.register(f.id);
  f.clock.advance(1000); expect(f.worlds.get(f.id).state.lifecycle).toBe('PLAYING');
  f.playback.disconnect(replacement); f.clock.advance(14000);
  const paused = f.worlds.get(f.id);
  expect(paused.state.lifecycle).toBe('PAUSED'); expect(paused.state.tick).toBe(33);
  expect(f.worlds.history(f.id).entries.at(-1).action).toEqual({ type: 'PAUSE', reason: 'NO_CLIENTS' });
  expect(() => f.playback.renew(f.id, replacement)).toThrow();
  f.playback.register(f.id); f.clock.advance(1000); expect(f.worlds.get(f.id)).toEqual(paused);
  expect(f.playback.interval(f.id)).toBeNull();
});

test('S02/S08/S10: failed tick stops without consuming queue or fabricating Pause; recovery is Pause then Play', () => {
  const f = fixture(), errors = [], events = [];
  f.playback.subscribeErrors(e => errors.push(e)); f.updates.subscribe(e => events.push(e));
  f.playback.register(f.id); play(f); const before = f.worlds.get(f.id);
  f.db.exec("CREATE TRIGGER fail_tick BEFORE INSERT ON world_history BEGIN SELECT RAISE(ABORT, 'private error'); END");
  f.clock.advance(1000);
  expect(f.worlds.get(f.id)).toEqual(before); expect(events).toHaveLength(1);
  expect(errors).toEqual([{ worldId: f.id, error: { code: 'INTERNAL_ERROR', message: 'Playback stopped due to an error' } }]);
  expect(f.playback.error(f.id)).toEqual(errors[0]); expect(f.playback.interval(f.id)).toBeNull();
  expect(play(f).historyEntries).toEqual([]); expect(f.playback.interval(f.id)).toBeNull();
  expect(() => f.playback.act(f.id, { type: 'PAUSE' })).toThrow();
  f.db.exec('DROP TRIGGER fail_tick');
  f.playback.act(f.id, { type: 'PAUSE' }); expect(f.playback.error(f.id)).toBeUndefined();
  play(f); f.clock.advance(1000); expect(f.worlds.get(f.id).state.tick).toBe(1);
});

test('S03: a Pause issued during post-commit tick publication prevents the next automatic tick', () => {
  const f = fixture(); f.playback.register(f.id); play(f);
  f.updates.subscribe(e => { if (e.type === 'WORLD_COMMITTED' && e.world.state.tick === 1 && e.world.state.lifecycle === 'PLAYING') f.playback.act(f.id, { type: 'PAUSE' }); });
  f.clock.advance(5000);
  expect(f.worlds.get(f.id).state).toMatchObject({ tick: 1, lifecycle: 'PAUSED' });
  expect(f.worlds.history(f.id).entries.slice(-2).map(e => e.action.type)).toEqual(['AUTOMATIC_TICK', 'PAUSE']);
});
