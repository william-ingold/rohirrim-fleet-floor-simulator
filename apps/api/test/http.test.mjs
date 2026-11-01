import { afterEach, expect, test } from '@jest/globals';
import request from 'supertest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../dist/http/application.js';
import { CommittedActions, CommittedUpdates } from '../dist/floors/committed-actions.js';
import { openDatabase } from '../dist/persistence/database.js';

const resources = [];
afterEach(async () => {
  for (const { app, db, directory } of resources.splice(0)) {
    await app?.close();
    if (db?.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
async function fixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'fleet-http-'));
  const resource = { directory };
  resources.push(resource);
  const path = join(directory, 'world.sqlite');
  resource.app = await createApplication(path, options);
  await resource.app.init();
  resource.db = openDatabase(path);
  resource.api = request(resource.app.getHttpServer());
  return resource;
}
async function create(api, dimensions = {}) {
  return (await api.post('/api/worlds').send(dimensions).expect(201)).body;
}
function act(api, id, action) { return api.post(`/api/worlds/${id}/actions`).send(action); }
async function prepared(api) {
  const { worldId } = await create(api, { width: 2, height: 1 });
  await act(api, worldId, { type: 'PLACE_ROBOT', position: { x: 0, y: 0 } }).expect(200);
  await act(api, worldId, { type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'MOVE' }] }).expect(200);
  await act(api, worldId, { type: 'FINISH_SETUP' }).expect(200);
  return worldId;
}

test('A01: create/read envelopes include scheduler metadata, CREATE history and no baseline', async () => {
  const { api } = await fixture();
  const created = await create(api);
  expect(created).toMatchObject({ revision: 1, snapshotVersion: 1, runningTickIntervalMs: null, state: { width: 10, height: 8, tick: 0, lifecycle: 'SETTING_UP' } });
  expect(created.historyEntries).toEqual([expect.objectContaining({ revision: 1, action: { type: 'CREATE', width: 10, height: 8 } })]);
  expect(Object.keys(created).sort()).toEqual(['historyEntries', 'revision', 'runningTickIntervalMs', 'snapshotVersion', 'state', 'worldId']);
  expect((await api.get(`/api/worlds/${created.worldId}`).expect(200)).body).toEqual({ ...created, historyEntries: [] });
});

test('A01/A02/L02/L03: latest-state Step succeeds when blocked; lifecycle errors and no-ops preserve revision', async () => {
  const { api } = await fixture();
  const id = await prepared(api);
  const result = (await act(api, id, { type: 'STEP' }).expect(200)).body;
  expect(result).toMatchObject({ revision: 5, state: { tick: 1, lifecycle: 'PAUSED', robots: [{ battery: 100, queue: [] }] } });
  expect(result.historyEntries[0].effects.outcomes[0].movement).toEqual({ status: 'BLOCKED', reason: 'OUT_OF_BOUNDS' });
  expect((await act(api, id, { type: 'PAUSE' }).expect(200)).body).toEqual({ ...result, historyEntries: [] });
  expect((await act(api, id, { type: 'STEP' }).expect(200)).body.revision).toBe(6);
  const ended = (await act(api, id, { type: 'END' }).expect(200)).body;
  expect((await act(api, id, { type: 'END' }).expect(200)).body).toEqual({ ...ended, historyEntries: [] });
  expect((await act(api, id, { type: 'STEP' }).expect(409)).body.error.code).toBe('INVALID_LIFECYCLE');
});

test.each([
  null, [], { type: 'BOGUS' }, { type: 'STEP', expectedRevision: 1 },
  { type: 'PAUSE', reason: 'SERVER_RESTART' },
  { type: 'PLACE_ROBOT', position: { x: '0', y: 0 } },
  { type: 'PLACE_ROBOT', position: { x: 0, y: 0 }, battery: 10 },
  { type: 'SET_CHARGER', position: { x: 0, y: 0 }, enabled: 'true' },
  { type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'MOVE' }, { type: 'GOTO', target: { x: 1, y: 0 }, consecutiveNoPathTicks: 2 }] },
  { type: 'PLAY', tickIntervalMs: 99 }, { type: 'PLAY', tickIntervalMs: 100.5 },
])('A01: rejects malformed/privileged action atomically: %j', async payload => {
  const { api } = await fixture();
  const created = await create(api);
  const response = await act(api, created.worldId, payload).expect(400);
  expect(response.body).toEqual({ error: { code: 'INVALID_REQUEST', message: expect.any(String) } });
  expect((await api.get(`/api/worlds/${created.worldId}`).expect(200)).body.revision).toBe(1);
});

test('A01: malformed JSON, create fields, unknown world and illegal placement have stable envelopes', async () => {
  const { api } = await fixture();
  for (const body of [{ width: '2' }, { width: 21 }, { state: {} }]) {
    expect((await api.post('/api/worlds').send(body).expect(400)).body.error.code).toBe('INVALID_REQUEST');
  }
  expect((await api.post('/api/worlds').set('Content-Type', 'application/json').send('{').expect(400)).body.error.code).toBe('INVALID_REQUEST');
  expect((await api.get('/api/worlds/missing').expect(404)).body.error.code).toBe('WORLD_NOT_FOUND');
  const { worldId } = await create(api, { width: 1, height: 1 });
  expect((await act(api, worldId, { type: 'PLACE_ROBOT', position: { x: 1, y: 0 } }).expect(422)).body.error.code).toBe('INVALID_PLACEMENT');
});

test('A02/D02/L01: failed tick or Finish Setup returns only an error and durable state is unchanged', async () => {
  const { api, db } = await fixture();
  const id = await prepared(api);
  const before = (await api.get(`/api/worlds/${id}`)).body;
  const baseline = db.prepare('SELECT t0_json FROM worlds WHERE id = ?').get(id);
  db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON world_history BEGIN SELECT RAISE(ABORT, 'secret injected fault'); END");
  expect((await act(api, id, { type: 'STEP' }).expect(500)).body).toEqual({ error: { code: 'INTERNAL_ERROR', message: expect.any(String) } });
  expect((await api.get(`/api/worlds/${id}`)).body).toEqual(before);
  expect(db.prepare('SELECT t0_json FROM worlds WHERE id = ?').get(id)).toEqual(baseline);
  db.exec('DROP TRIGGER fail_history');
  const draft = await create(api);
  db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON world_history BEGIN SELECT RAISE(ABORT, 'secret injected fault'); END");
  await act(api, draft.worldId, { type: 'FINISH_SETUP' }).expect(500);
  expect(db.prepare('SELECT t0_json FROM worlds WHERE id = ?').get(draft.worldId).t0_json).toBeNull();
});

test('L05: failed draft disposal preserves history; successful Cancel returns receipt then 404', async () => {
  const { api, db } = await fixture();
  const { worldId } = await create(api);
  db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON world_history BEGIN SELECT RAISE(ABORT, 'delete fault'); END");
  await act(api, worldId, { type: 'CANCEL' }).expect(500);
  expect((await api.get(`/api/worlds/${worldId}/history`).expect(200)).body.entries).toHaveLength(1);
  db.exec('DROP TRIGGER fail_delete');
  expect((await act(api, worldId, { type: 'CANCEL' }).expect(200)).body).toEqual({ worldId, cancelled: true });
  await api.get(`/api/worlds/${worldId}`).expect(404);
  await api.get(`/api/worlds/${worldId}/history`).expect(404);
  const id = await prepared(api);
  await act(api, id, { type: 'CANCEL' }).expect(409);
});

test('A03: history retains upper boundary across commits; invalid/duplicate cursors reject', async () => {
  const { api } = await fixture();
  const id = await prepared(api);
  const page = (await api.get(`/api/worlds/${id}/history?afterRevision=0&throughRevision=4&limit=2`).expect(200)).body;
  expect(page.entries.map(e => e.revision)).toEqual([1, 2]);
  expect(page).toMatchObject({ nextAfterRevision: 2, hasMore: true });
  await act(api, id, { type: 'STEP' }).expect(200);
  const next = (await api.get(`/api/worlds/${id}/history?afterRevision=2&throughRevision=4&limit=2`).expect(200)).body;
  expect(next.entries.map(e => e.revision)).toEqual([3, 4]);
  expect(next).toMatchObject({ nextAfterRevision: 4, hasMore: false });
  for (const query of ['limit=0', 'limit=501', 'limit=1.5', 'afterRevision=-1', 'throughRevision=999', 'afterRevision=3&throughRevision=2', 'limit=1&limit=2', 'extra=1']) {
    expect((await api.get(`/api/worlds/${id}/history?${query}`).expect(400)).body.error.code).toBe('INVALID_REQUEST');
  }
});


test('A02/S02 seam: publication sees committed rows, is ordered, skips no-ops/rollback and survives delivery errors', async () => {
  const errors = [];
  const { api, db, app } = await fixture({ onDeliveryError: error => errors.push(error.message) });
  const updates = app.get(CommittedUpdates), observed = [];
  const stopBroken = updates.subscribe(() => { throw new Error('delivery failed'); });
  updates.subscribe(event => {
    expect(db.inTransaction).toBe(false);
    if (event.type === 'WORLD_COMMITTED') {
      const { worldId, revision } = event.world;
      expect(db.prepare('SELECT revision FROM worlds WHERE id = ?').get(worldId).revision).toBe(revision);
      expect(db.prepare('SELECT revision FROM world_history WHERE world_id = ? AND revision = ?').get(worldId, revision).revision).toBe(revision);
      observed.push(revision);
      event.world.historyEntries.length = 0;
    } else {
      expect(db.prepare('SELECT id FROM worlds WHERE id = ?').get(event.worldId)).toBeUndefined();
      observed.push('cancelled');
    }
  });
  const created = await create(api);
  expect(created.historyEntries).toHaveLength(1);
  const id = created.worldId;
  await act(api, id, { type: 'FINISH_SETUP' }).expect(200);
  await act(api, id, { type: 'PAUSE' }).expect(200);
  db.exec("CREATE TRIGGER fail_publish BEFORE INSERT ON world_history BEGIN SELECT RAISE(ABORT, 'fault'); END");
  await act(api, id, { type: 'STEP' }).expect(500);
  db.exec('DROP TRIGGER fail_publish');
  await act(api, id, { type: 'STEP' }).expect(200);
  expect(observed).toEqual([1, 2, 3]);
  expect(errors).toEqual(['delivery failed', 'delivery failed', 'delivery failed']);
  stopBroken();
  const draft = await create(api);
  await act(api, draft.worldId, { type: 'CANCEL' }).expect(200);
  expect(observed).toEqual([1, 2, 3, 1, 'cancelled']);
  expect(errors).toHaveLength(3);
});

test('A01: omitted creation body uses defaults; large legal queues have no transport item cap', async () => {
  const { api } = await fixture();
  const { worldId } = (await api.post('/api/worlds').expect(201)).body;
  await act(api, worldId, { type: 'PLACE_ROBOT', position: { x: 0, y: 0 } }).expect(200);
  const commands = Array.from({ length: 8000 }, () => ({ type: 'LEFT' }));
  const response = await act(api, worldId, { type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands }).expect(200);
  expect(response.body.state.robots[0].queue).toHaveLength(8000);
});

test('A01: real writer lock maps to 503; corruption/version failures map to 500 without leaking data', async () => {
  const { api, db } = await fixture();
  const { worldId } = await create(api);
  // The independent connection holds a real writer lock for one HTTP action.
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = await act(api, worldId, { type: 'FINISH_SETUP' }).expect(503);
    expect(result.body).toEqual({ error: { code: 'PERSISTENCE_UNAVAILABLE', message: expect.any(String) } });
  } finally { db.exec('ROLLBACK'); }
  expect((await api.get(`/api/worlds/${worldId}`)).body.revision).toBe(1);
  db.exec('UPDATE worlds SET snapshot_version = 2');
  expect((await api.get(`/api/worlds/${worldId}`).expect(500)).body.error.code).toBe('UNSUPPORTED_SNAPSHOT_VERSION');
  db.exec("UPDATE worlds SET snapshot_version = 1, snapshot_json = json_set(snapshot_json, '$.width', 0)");
  expect((await api.get(`/api/worlds/${worldId}`).expect(500)).body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } });
}, 15000);

test('D04: application restart commits recovery before exposing HTTP; corrupt saved data prevents startup', async () => {
  const resource = await fixture();
  const { api, db, directory } = resource;
  const id = await prepared(api);
  await act(api, id, { type: 'STEP' }).expect(200);
  const before = (await api.get(`/api/worlds/${id}`)).body;
  const baseline = db.prepare('SELECT t0_json FROM worlds WHERE id = ?').get(id);
  // Persist a previous process Play; no playback bypass is added to production.
  db.transaction(() => {
    db.prepare("UPDATE worlds SET revision = revision + 1, snapshot_json = json_set(snapshot_json, '$.lifecycle', 'PLAYING') WHERE id = ?").run(id);
    db.prepare("INSERT INTO world_history SELECT id, revision, json_extract(snapshot_json, '$.tick'), updated_at, '{\"type\":\"PLAY\",\"tickIntervalMs\":1000}', '{}' FROM worlds WHERE id = ?").run(id);
  }).immediate();
  await resource.app.close();
  resource.app = await createApplication(join(directory, 'world.sqlite'));
  await resource.app.init();
  resource.api = request(resource.app.getHttpServer());
  const recovered = (await resource.api.get(`/api/worlds/${id}`).expect(200)).body;
  expect(recovered).toEqual({ ...before, revision: before.revision + 2 });
  expect(db.prepare('SELECT t0_json FROM worlds WHERE id = ?').get(id)).toEqual(baseline);
  const history = (await resource.api.get(`/api/worlds/${id}/history`).expect(200)).body.entries;
  expect(history.at(-1).action).toEqual({ type: 'PAUSE', reason: 'SERVER_RESTART' });
  await resource.app.close();
  db.exec('UPDATE worlds SET snapshot_version = 99');
  await expect(createApplication(join(directory, 'world.sqlite'))).rejects.toMatchObject({ code: 'UNSUPPORTED_SNAPSHOT_VERSION' });
  expect(db.prepare('SELECT revision FROM worlds WHERE id = ?').get(id).revision).toBe(recovered.revision);
});


test('A01/A02: frozen-contract GOTO request/response fixture matches the public JSON seam', async () => {
  const { api } = await fixture();
  const example = JSON.parse(readFileSync(new URL('./fixtures/goto-step.json', import.meta.url), 'utf8'));
  const { worldId } = await create(api, example.create);
  let result;
  for (const action of example.actions) result = (await act(api, worldId, action).expect(200)).body;
  expect(result.historyEntries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  result.worldId = '<worldId>';
  result.historyEntries[0].worldId = '<worldId>';
  result.historyEntries[0].timestamp = '<timestamp>';
  expect(result).toEqual(example.response);
});

test('L01/L04: HTTP edits preserve t0; shrinking past queued targets rejects the whole resize', async () => {
  const { api, db } = await fixture();
  const { worldId } = await create(api, { width: 3, height: 1 });
  await act(api, worldId, { type: 'PLACE_ROBOT', position: { x: 0, y: 0 } }).expect(200);
  await act(api, worldId, { type: 'ENQUEUE_COMMANDS', robotId: 'R1', commands: [{ type: 'GOTO', target: { x: 2, y: 0 } }] }).expect(200);
  await act(api, worldId, { type: 'RESIZE', width: 2, height: 1 }).expect(400);
  expect((await api.get(`/api/worlds/${worldId}`)).body).toMatchObject({ revision: 3, state: { width: 3 } });
  await act(api, worldId, { type: 'FINISH_SETUP' }).expect(200);
  const baseline = db.prepare('SELECT t0_json FROM worlds WHERE id = ?').get(worldId);
  await act(api, worldId, { type: 'SET_CHARGER', position: { x: 1, y: 0 }, enabled: true }).expect(200);
  await act(api, worldId, { type: 'CLEAR_QUEUE', robotId: 'R1' }).expect(200);
  await act(api, worldId, { type: 'RESIZE', width: 4, height: 1 }).expect(409);
  await act(api, worldId, { type: 'PLAY', tickIntervalMs: 1000 }).expect(409);
  expect(db.prepare('SELECT t0_json FROM worlds WHERE id = ?').get(worldId)).toEqual(baseline);
});

test('post-commit seam queues reentrant commits and isolates subscribers and diagnostics', async () => {
  const { api, app } = await fixture({ onDeliveryError: () => { throw new Error('diagnostics failed'); } });
  const { worldId } = await create(api);
  const actions = app.get(CommittedActions), updates = app.get(CommittedUpdates);
  const observed = [];
  const stop = updates.subscribe(event => {
    if (event.type === 'WORLD_COMMITTED' && event.world.revision === 2) actions.act(worldId, { type: 'STEP' });
  });
  updates.subscribe(() => { throw new Error('delivery failed'); });
  updates.subscribe(event => observed.push(event.world.revision));
  await act(api, worldId, { type: 'FINISH_SETUP' }).expect(200);
  expect(observed).toEqual([2, 3]);
  stop();
  await act(api, worldId, { type: 'STEP' }).expect(200);
  expect(observed).toEqual([2, 3, 4]);
});

test('A01: non-JSON request bodies cannot silently create a default world', async () => {
  const { api, db } = await fixture();
  const response = await api.post('/api/worlds').set('Content-Type', 'text/plain').send('{"width":1}').expect(400);
  expect(response.body.error.code).toBe('INVALID_REQUEST');
  expect(db.prepare('SELECT COUNT(*) AS count FROM worlds').get().count).toBe(0);
});
