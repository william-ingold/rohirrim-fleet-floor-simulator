import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../dist/persistence/database.js';
import { WorldService } from '../dist/floors/world-service.js';
import { CommittedActions, CommittedUpdates } from '../dist/floors/committed-actions.js';
import { Playback } from '../dist/playback/playback.js';

import { Clock } from './helpers/clock.mjs';
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

test('S04/S07: an already queued expiry callback cannot expire a renewed lease early', () => {
  const f = fixture(), id = f.playback.register(f.id);
  const stale = [...f.clock.jobs.values()][0].run;
  play(f); f.clock.advance(5000); f.playback.renew(f.id, id);
  stale();
  expect(f.playback.renew(f.id, id).expiresInMs).toBe(15000);
  expect(f.worlds.get(f.id).state.lifecycle).toBe('PLAYING');
});

test('S05: overdue scheduled tick rechecks presence before any movement even when expiry timer has not run', () => {
  const f = fixture(); f.playback.register(f.id); play(f);
  const tick = [...f.clock.jobs.values()].find(j => j.at === 1000).run;
  f.clock.time = 15000; tick();
  expect(f.worlds.get(f.id).state).toMatchObject({ tick: 0, lifecycle: 'PAUSED', robots: [{ queue: [{ type: 'MOVE' }, { type: 'LEFT' }] }] });
});

test('S05/S10: failed no-clients Pause stops scheduling, preserves Playing and surfaces an error without retry', () => {
  const f = fixture(); f.playback.register(f.id); play(f);
  f.db.exec("CREATE TRIGGER fail_pause BEFORE INSERT ON world_history WHEN json_extract(NEW.action_json, '$.type') = 'PAUSE' BEGIN SELECT RAISE(ABORT, 'fault'); END");
  f.clock.advance(15000);
  const before = f.worlds.get(f.id);
  expect(before.state.lifecycle).toBe('PLAYING'); expect(f.playback.interval(f.id)).toBeNull();
  expect(f.playback.error(f.id).error.code).toBe('INTERNAL_ERROR');
  f.clock.advance(15000); expect(f.worlds.get(f.id)).toEqual(before);
});

test('S10: real writer lock surfaces PERSISTENCE_UNAVAILABLE; committed End clears stopped status', () => {
  const f = fixture(); f.playback.register(f.id); play(f);
  const before = f.worlds.get(f.id), competing = openDatabase(join(f.directory, 'world.sqlite'));
  f.db.pragma('busy_timeout = 0'); competing.exec('BEGIN IMMEDIATE');
  try { f.clock.advance(1000); } finally { competing.exec('ROLLBACK'); competing.close(); }
  expect(f.playback.error(f.id).error.code).toBe('PERSISTENCE_UNAVAILABLE');
  expect(f.worlds.get(f.id)).toEqual(before);
  f.playback.act(f.id, { type: 'END' }); expect(f.playback.error(f.id)).toBeUndefined();
});

test('S04/S05: a timer firing just before its monotonic deadline reschedules expiry independently of ticks', () => {
  const f = fixture(), id = f.playback.register(f.id); play(f);
  f.clock.advance(500); f.playback.renew(f.id, id);
  f.clock.advance(14999);
  const [handle, job] = [...f.clock.jobs].find(([, j]) => j.at === 15500);
  f.clock.jobs.delete(handle); job.run(); // emulate an early host timer; it has already left the timer queue
  f.clock.advance(1);
  expect(f.worlds.get(f.id).state.lifecycle).toBe('PAUSED');
});
