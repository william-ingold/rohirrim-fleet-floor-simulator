import { afterEach, expect, test } from '@jest/globals';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase, migrate } from '../dist/persistence/database.js';
import { WorldService } from '../dist/floors/world-service.js';

const resources = [];
afterEach(() => {
  const cleanup = resources.splice(0);
  for (const { db } of cleanup) if (db.open) db.close();
  for (const directory of new Set(cleanup.map(r => r.directory))) rmSync(directory, { recursive: true, force: true });
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
  expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
  expect(db.pragma('synchronous', { simple: true })).toBe(2);
  expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
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

test('D02: failure AFTER snapshot update cannot consume MOVE or battery; later retry starts from saved state', () => {
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

function simulateSavedPlaying(db, service) {
  const id = prepared(service);
  service.act(id, { type: 'FINISH_SETUP' });
  service.act(id, { type: 'STEP' });
  // Represents a previous process's committed Play; no scheduler/presence added.
  db.transaction(() => {
    db.prepare("UPDATE worlds SET snapshot_json = json_set(snapshot_json, '$.lifecycle', 'PLAYING'), revision = revision + 1 WHERE id = ?").run(id);
    db.prepare("INSERT INTO world_history SELECT id, revision, json_extract(snapshot_json, '$.tick'), updated_at, '{\"type\":\"PLAY\",\"tickIntervalMs\":1000}', '{}' FROM worlds WHERE id = ?").run(id);
  }).immediate();
  return id;
}

test('D04: startup durably pauses Playing once, preserving actual tick, battery, queues and t0', () => {
  const { db, service, path, directory } = fixture();
  const id = simulateSavedPlaying(db, service);
  const before = service.get(id);
  const baseline = db.prepare('SELECT t0_json FROM worlds').get();
  const previousHistory = service.history(id).entries;
  db.close();
  const reopened = openDatabase(path);
  resources.push({ db: reopened, directory });
  const restarted = new WorldService(reopened);
  expect(restarted.get(id)).toMatchObject({ revision: before.revision + 1, state: { ...before.state, lifecycle: 'PAUSED' } });
  const entries = restarted.history(id).entries;
  expect(entries.slice(0, -1)).toEqual(previousHistory);
  expect(entries.at(-1)).toMatchObject({ revision: before.revision + 1, tick: 1, action: { type: 'PAUSE', reason: 'SERVER_RESTART' } });
  expect(reopened.prepare('SELECT t0_json FROM worlds').get()).toEqual(baseline);
  expect(new WorldService(reopened).get(id)).toEqual(restarted.get(id));
});

test('D04/D02: failed recovery blocks startup and rolls back every recovery world', () => {
  const { db, service } = fixture();
  const first = simulateSavedPlaying(db, service);
  const second = simulateSavedPlaying(db, service);
  const before = db.prepare('SELECT * FROM worlds ORDER BY id').all();
  const history = db.prepare('SELECT * FROM world_history ORDER BY world_id, revision').all();
  db.exec("CREATE TRIGGER fail_recovery BEFORE INSERT ON world_history WHEN json_extract(NEW.action_json, '$.reason') = 'SERVER_RESTART' AND (SELECT COUNT(*) FROM worlds WHERE json_extract(snapshot_json, '$.lifecycle') = 'PAUSED') = 2 BEGIN SELECT RAISE(ABORT, 'recovery write fault'); END");
  expect(() => new WorldService(db)).toThrow('recovery write fault');
  expect(db.prepare('SELECT * FROM worlds ORDER BY id').all()).toEqual(before);
  expect(db.prepare('SELECT * FROM world_history ORDER BY world_id, revision').all()).toEqual(history);
  db.exec('DROP TRIGGER fail_recovery');
  const recovered = new WorldService(db);
  expect(recovered.get(first).state.lifecycle).toBe('PAUSED');
  expect(recovered.get(second).state.lifecycle).toBe('PAUSED');
});

test.each(['SETTING_UP', 'PAUSED', 'ENDED'])('D04: startup retains saved %s without revision/history churn', lifecycle => {
  const { db, service } = fixture();
  const id = prepared(service);
  if (lifecycle !== 'SETTING_UP') service.act(id, { type: 'FINISH_SETUP' });
  if (lifecycle === 'ENDED') service.act(id, { type: 'END' });
  const before = service.get(id), history = service.history(id);
  const reopened = new WorldService(db);
  expect(reopened.get(id)).toEqual(before);
  expect(reopened.history(id)).toEqual(history);
});

test.each([
  ['battery', "json_set(snapshot_json, '$.robots[0].battery', -1)"],
  ['GOTO progress', "json_set(snapshot_json, '$.robots[0].queue[0]', json('{\"type\":\"GOTO\",\"target\":{\"x\":2,\"y\":0},\"consecutiveNoPathTicks\":3}'))"],
  ['duplicate identity', "json_set(snapshot_json, '$.robots[1]', json_extract(snapshot_json, '$.robots[0]'))"],
])('D01: startup rejects corrupt %s without overwriting saved data', (_name, expression) => {
  const { db, service } = fixture();
  prepared(service);
  db.exec(`UPDATE worlds SET snapshot_json = ${expression}`);
  const before = db.prepare('SELECT * FROM worlds').all();
  expect(() => new WorldService(db)).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
  expect(db.prepare('SELECT * FROM worlds').all()).toEqual(before);
});

test('D01: unsupported snapshot version rejects startup and reads, leaving data untouched', () => {
  const { db, service } = fixture();
  const id = prepared(service);
  db.prepare('UPDATE worlds SET snapshot_version = 2').run();
  const before = db.prepare('SELECT * FROM worlds').all();
  expect(() => service.get(id)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_SNAPSHOT_VERSION' }));
  expect(() => new WorldService(db)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_SNAPSHOT_VERSION' }));
  expect(db.prepare('SELECT * FROM worlds').all()).toEqual(before);
});

test('D03: a failed SQL migration rolls back schema and ledger; startup cannot use it', () => {
  const { db, directory } = fixture();
  const migrationsPath = join(directory, 'migrations');
  mkdirSync(migrationsPath);
  copyFileSync(new URL('../migrations/001_worlds.sql', import.meta.url), join(migrationsPath, '001_worlds.sql'));
  writeFileSync(join(migrationsPath, '002_bad.sql'), 'CREATE TABLE partial (id TEXT); INSERT INTO missing_table VALUES (1);');
  expect(() => migrate(db, pathToFileURL(`${migrationsPath}/`))).toThrow();
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'partial'").all()).toEqual([]);
  expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
  // Failure when introducing the very first schema leaves no application tables.
  const fresh = openDatabase(join(directory, 'fresh.sqlite'));
  resources.push({ db: fresh, directory });
  expect(() => migrate(fresh, pathToFileURL(`${migrationsPath}/`))).toThrow();
  expect(fresh.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([]);
  db.prepare("INSERT INTO schema_migrations VALUES (999, 'time')").run();
  expect(() => new WorldService(db)).toThrow('Unsupported or duplicate SQL migration version');
});

test('application history pages preserve a stable catch-up boundary and numeric revision ordering', () => {
  const { service } = fixture();
  const id = prepared(service);
  const first = service.history(id, { afterRevision: 0, throughRevision: 3, limit: 2 });
  expect(first.entries.map(e => e.revision)).toEqual([1, 2]);
  expect(first).toMatchObject({ nextAfterRevision: 2, hasMore: true });
  service.act(id, { type: 'FINISH_SETUP' });
  const second = service.history(id, { afterRevision: first.nextAfterRevision, throughRevision: 3, limit: 2 });
  expect(second.entries.map(e => e.revision)).toEqual([3]);
  expect(second).toMatchObject({ nextAfterRevision: 3, hasMore: false });
  expect(service.history(id, { afterRevision: 3, throughRevision: 3 })).toEqual({ entries: [], nextAfterRevision: 3, hasMore: false });
  for (const query of [{ limit: 0 }, { limit: 501 }, { afterRevision: -1 }, { afterRevision: 1.5 }, { throughRevision: 5 }, { afterRevision: 3, throughRevision: 2 }]) {
    expect(() => service.history(id, query)).toThrow(expect.objectContaining({ code: 'INVALID_REQUEST' }));
  }
});

test('D02: failed save preserves active GOTO failure progress and idle charger battery across reopen', () => {
  const { db, service, path, directory } = fixture();
  const id = prepared(service);
  service.act(id, { type: 'SET_OBSTACLE', position: { x: 2, y: 0 }, enabled: true });
  service.act(id, { type: 'FINISH_SETUP' });
  service.act(id, { type: 'STEP' });
  service.act(id, { type: 'SET_CHARGER', position: { x: 1, y: 0 }, enabled: true });
  service.act(id, { type: 'STEP' });
  const before = service.get(id), history = service.history(id);
  expect(before.state.robots[0]).toMatchObject({ battery: 100, queue: [{ type: 'GOTO', consecutiveNoPathTicks: 1 }] });
  failHistory(db);
  expect(() => service.act(id, { type: 'STEP' })).toThrow('injected history failure');
  db.close();
  const reopened = openDatabase(path);
  resources.push({ db: reopened, directory });
  const restored = new WorldService(reopened);
  expect(restored.get(id)).toEqual(before);
  expect(restored.history(id)).toEqual(history);
  reopened.exec('DROP TRIGGER fail_history');
  expect(restored.act(id, { type: 'STEP' }).state.robots[0].queue[0].consecutiveNoPathTicks).toBe(2);
});

test('L02/L03: independent callers use latest durable state; End is terminal and repeated End is a no-op', () => {
  const { db, service } = fixture();
  const secondCaller = new WorldService(db);
  const id = service.create(2, 1).worldId;
  service.act(id, { type: 'PLACE_ROBOT', position: { x: 0, y: 0 } });
  secondCaller.act(id, { type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'RIGHT' }] });
  service.act(id, { type: 'FINISH_SETUP' });
  expect(secondCaller.act(id, { type: 'STEP' }).state.robots[0].facing).toBe('EAST');
  const ended = service.act(id, { type: 'END' });
  expect(secondCaller.act(id, { type: 'END' })).toEqual({ ...ended, historyEntries: [] });
  const history = service.history(id);
  for (const action of [{ type: 'STEP' }, { type: 'CLEAR_QUEUE', robotId: 'R1' }, { type: 'PLACE_ROBOT', position: { x: 1, y: 0 } }, { type: 'CANCEL' }]) {
    expect(() => secondCaller.act(id, action)).toThrow(expect.objectContaining({ code: 'INVALID_LIFECYCLE' }));
  }
  expect(service.get(id)).toEqual({ ...ended, historyEntries: [] });
  expect(service.history(id)).toEqual(history);
});

test('D01: finalized snapshot without t0 rejects startup', () => {
  const { db, service } = fixture();
  service.create();
  db.exec("UPDATE worlds SET snapshot_json = json_set(snapshot_json, '$.lifecycle', 'PAUSED')");
  expect(() => new WorldService(db)).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
});

test('D02: an error at COMMIT rolls back snapshot/history; the service never retries automatically', () => {
  const { db, service } = fixture();
  const id = prepared(service);
  service.act(id, { type: 'FINISH_SETUP' });
  const before = service.get(id), history = service.history(id);
  db.exec('CREATE TABLE commit_fault (world_id TEXT REFERENCES worlds(id) DEFERRABLE INITIALLY DEFERRED)');
  let attempts = 0;
  db.function('count_attempt', () => { attempts++; return 'missing-world'; });
  db.exec('CREATE TRIGGER fail_commit AFTER INSERT ON world_history BEGIN INSERT INTO commit_fault VALUES (count_attempt()); END');
  expect(() => service.act(id, { type: 'STEP' })).toThrow(expect.objectContaining({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }));
  expect(attempts).toBe(1);
  expect(db.inTransaction).toBe(false);
  expect(service.get(id)).toEqual(before);
  expect(service.history(id)).toEqual(history);
  expect(db.prepare('SELECT * FROM commit_fault').all()).toEqual([]);
});

test('D02: another writer prevents an action; releasing the lock permits a later explicit retry', () => {
  const { db, service, path, directory } = fixture();
  const id = prepared(service);
  const secondDb = openDatabase(path);
  resources.push({ db: secondDb, directory });
  const second = new WorldService(secondDb);
  secondDb.pragma('busy_timeout = 1');
  const before = service.get(id);
  db.exec('BEGIN IMMEDIATE');
  try {
    expect(() => second.act(id, { type: 'FINISH_SETUP' })).toThrow(expect.objectContaining({ code: 'SQLITE_BUSY' }));
    expect(service.get(id)).toEqual(before);
  } finally { db.exec('ROLLBACK'); }
  expect(second.act(id, { type: 'FINISH_SETUP' })).toMatchObject({ revision: before.revision + 1, state: { lifecycle: 'PAUSED' } });
});
