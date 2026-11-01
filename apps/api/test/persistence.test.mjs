import { afterEach, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, migrate } from '../dist/persistence/database.js';
import { WorldService } from '../dist/floors/world-service.js';

const resources = [];
afterEach(() => {
  for (const { db, directory } of resources.splice(0)) {
    if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'rohirrim-b3-'));
  const path = join(directory, 'worlds.sqlite');
  const db = openDatabase(path);
  resources.push({ db, directory });
  const service = new WorldService(db);
  return { db, service, path, directory };
}
function prepared(service) {
  const { worldId } = service.create(3, 2);
  service.act(worldId, { type: 'PLACE_ROBOT', position: { x: 0, y: 0 }, robotId: 'R1', facing: 'EAST' });
  service.act(worldId, { type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'MOVE' }, { type: 'GOTO', target: { x: 2, y: 0 } }] });
  return worldId;
}
function failHistory(db) {
  db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON world_history BEGIN SELECT RAISE(ABORT, 'injected history failure'); END");
}

test('D03: creation commits revision 1, CREATE history and null t0, migrations run once', () => {
  const { db, service } = fixture();
  const result = service.create();
  expect(result).toMatchObject({ revision: 1, snapshotVersion: 1, state: { width: 10, height: 8, tick: 0, lifecycle: 'SETTING_UP' } });
  expect(result.historyEntries).toEqual([expect.objectContaining({ worldId: result.worldId, revision: 1, tick: 0, action: { type: 'CREATE', width: 10, height: 8 }, effects: {} })]);
  expect(db.prepare('SELECT t0_json FROM worlds').get()).toEqual({ t0_json: null });
  expect(service.get(result.worldId).historyEntries).toEqual([]);
  migrate(db);
  expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
});

test('D02: a failing CREATE history insert leaves no world behind', () => {
  const { db, service } = fixture();
  failHistory(db);
  expect(() => service.create()).toThrow('injected history failure');
  expect(db.prepare('SELECT * FROM worlds').all()).toEqual([]);
});

test('D02/L01: failed Finish Setup rolls back snapshot, revision, t0 and history', () => {
  const { db, service } = fixture();
  const id = prepared(service);
  const before = service.get(id);
  failHistory(db);
  expect(() => service.act(id, { type: 'FINISH_SETUP' })).toThrow('injected history failure');
  expect(service.get(id)).toEqual(before);
  expect(db.prepare('SELECT t0_json FROM worlds').get().t0_json).toBeNull();
  expect(service.history(id).entries).toHaveLength(3);
});

test('D02: failure AFTER snapshot update cannot consume MOVE or charge; later retry starts from saved state', () => {
  const { db, service } = fixture();
  const id = prepared(service);
  service.act(id, { type: 'FINISH_SETUP' });
  const before = service.get(id);
  const baseline = db.prepare('SELECT t0_json FROM worlds').get();
  // The history trigger observes the already-written tick inside the transaction.
  db.exec("CREATE TRIGGER fail_tick BEFORE INSERT ON world_history WHEN (SELECT json_extract(snapshot_json, '$.tick') FROM worlds WHERE id = NEW.world_id) = 1 BEGIN SELECT RAISE(ABORT, 'snapshot written before failure'); END");
  expect(() => service.act(id, { type: 'STEP' })).toThrow('snapshot written before failure');
  expect(service.get(id)).toEqual(before);
  expect(db.prepare('SELECT t0_json FROM worlds').get()).toEqual(baseline);
  expect(service.history(id).entries).toHaveLength(4);
  db.exec('DROP TRIGGER fail_tick');
  const result = service.act(id, { type: 'STEP' });
  expect(result).toMatchObject({ revision: 5, state: { tick: 1, robots: [{ position: { x: 1, y: 0 }, battery: 99, queue: [{ type: 'GOTO', consecutiveNoPathTicks: 0 }] }] } });
  expect(result.historyEntries[0].effects.outcomes).toEqual([{ robotId: 'R1', position: { x: 1, y: 0 }, facing: 'EAST', battery: 99, movement: { status: 'SUCCEEDED' }, command: { status: 'COMPLETED', type: 'MOVE' } }]);
});

test('L01/L03/L04: baseline stays immutable, rejected/no-op actions do not write; idle ticks do', () => {
  const { db, service } = fixture();
  const id = prepared(service);
  const before = service.get(id);
  expect(() => service.act(id, { type: 'RESIZE', width: 1, height: 1 })).toThrow();
  expect(service.get(id)).toEqual(before);
  service.act(id, { type: 'FINISH_SETUP' });
  const baseline = db.prepare('SELECT t0_json FROM worlds').get();
  const paused = service.get(id);
  expect(service.act(id, { type: 'PAUSE' })).toEqual(paused);
  expect(() => service.act(id, { type: 'RESIZE', width: 4, height: 4 })).toThrow();
  service.act(id, { type: 'CLEAR_QUEUE', robotId: 'R1' });
  const cleared = service.get(id);
  expect(service.act(id, { type: 'CLEAR_QUEUE', robotId: 'R1' })).toEqual(cleared);
  expect(service.act(id, { type: 'STEP' })).toMatchObject({ revision: cleared.revision + 1, state: { tick: 1, lifecycle: 'PAUSED' } });
  expect(db.prepare('SELECT t0_json FROM worlds').get()).toEqual(baseline);
  expect(() => db.prepare('UPDATE worlds SET t0_json = NULL WHERE id = ?').run(id)).toThrow();
});

test('D01: complete state and GOTO progress survive file close/reopen', () => {
  const { db, service, path, directory } = fixture();
  const id = prepared(service);
  service.act(id, { type: 'SET_CHARGER', position: { x: 0, y: 0 }, enabled: true });
  service.act(id, { type: 'SET_OBSTACLE', position: { x: 2, y: 0 }, enabled: true });
  service.act(id, { type: 'FINISH_SETUP' });
  service.act(id, { type: 'STEP' });
  service.act(id, { type: 'STEP' });
  const expected = service.get(id);
  expect(expected.state.robots[0]).toMatchObject({ battery: 99, queue: [{ type: 'GOTO', consecutiveNoPathTicks: 1 }] });
  const baseline = db.prepare('SELECT t0_json FROM worlds').get();
  db.close();
  const reopened = openDatabase(path);
  resources.push({ db: reopened, directory });
  const restored = new WorldService(reopened);
  expect(restored.get(id)).toEqual(expected);
  expect(reopened.prepare('SELECT t0_json FROM worlds').get()).toEqual(baseline);
  expect(restored.act(id, { type: 'STEP' }).state.robots[0].queue[0].consecutiveNoPathTicks).toBe(2);
});

test('D03: SQL enforces valid JSON, foreign keys, unique revisions and immutable retained history', () => {
  const { db, service } = fixture();
  const { worldId } = service.create();
  expect(() => db.prepare("UPDATE worlds SET snapshot_json = 'bad'").run()).toThrow();
  expect(() => db.prepare('INSERT INTO world_history SELECT * FROM world_history').run()).toThrow();
  expect(() => db.prepare("INSERT INTO world_history VALUES ('missing', 1, 0, 'time', '{}', '{}')").run()).toThrow();
  expect(() => db.prepare("UPDATE world_history SET action_json = '{}'").run()).toThrow();
  expect(() => db.prepare('DELETE FROM world_history WHERE world_id = ?').run(worldId)).toThrow();
});

test('L05: Cancel disposes only a draft atomically; a deletion fault preserves draft and history', () => {
  const { db, service } = fixture();
  const id = prepared(service);
  db.exec("CREATE TRIGGER fail_disposal BEFORE DELETE ON world_history BEGIN SELECT RAISE(ABORT, 'delete fault'); END");
  const before = service.get(id);
  expect(() => service.act(id, { type: 'CANCEL' })).toThrow('delete fault');
  expect(service.get(id)).toEqual(before);
  expect(service.history(id).entries).toHaveLength(3);
  db.exec('DROP TRIGGER fail_disposal');
  expect(service.act(id, { type: 'CANCEL' })).toEqual({ worldId: id, cancelled: true });
  expect(() => service.get(id)).toThrow(expect.objectContaining({ code: 'WORLD_NOT_FOUND' }));
  expect(db.prepare('SELECT * FROM world_history').all()).toEqual([]);
  const finalized = service.create().worldId;
  service.act(finalized, { type: 'FINISH_SETUP' });
  expect(() => service.act(finalized, { type: 'CANCEL' })).toThrow(expect.objectContaining({ code: 'INVALID_LIFECYCLE' }));
});
