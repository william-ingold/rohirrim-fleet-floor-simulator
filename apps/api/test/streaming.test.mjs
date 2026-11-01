import { afterEach, expect, jest, test } from '@jest/globals';
import request from 'supertest';
import { get } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../dist/http/application.js';
import { WorldService } from '../dist/floors/world-service.js';
import { CommittedActions } from '../dist/floors/committed-actions.js';
import { Playback } from '../dist/playback/playback.js';
import { openDatabase } from '../dist/persistence/database.js';
import { Clock } from './helpers/clock.mjs';

const resources = [];
afterEach(async () => {
  jest.restoreAllMocks();
  for (const f of resources.splice(0)) {
    for (const s of f.streams) s.close();
    await f.app.close(); f.db.close();
    rmSync(f.directory, { recursive: true, force: true });
    expect(f.clock.jobs.size).toBe(0);
  }
});
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'fleet-sse-')), path = join(directory, 'world.sqlite'), clock = new Clock();
  const app = await createApplication(path, { clock });
  const f = { directory, app, clock, db: openDatabase(path), streams: [] }; resources.push(f);
  await app.listen(0, '127.0.0.1');
  f.api = request(app.getHttpServer()); f.url = await app.getUrl();
  f.id = (await f.api.post('/api/worlds').send({ width: 2, height: 1 }).expect(201)).body.worldId;
  await act(f, { type: 'FINISH_SETUP' }).expect(200);
  return f;
}
function act(f, action) { return f.api.post(`/api/worlds/${f.id}/actions`).send(action); }
async function stream(f, headers = {}) {
  return await new Promise((resolve, reject) => {
    const req = get(`${f.url}/api/worlds/${f.id}/events`, { headers }, res => {
      let buffer = ''; const events = [], waiters = [];
      const s = {
        events, res, ended: false,
        close: () => { res.destroy(); req.destroy(); },
        wait: count => new Promise((yes, no) => {
          const timer = setTimeout(() => no(new Error(`Expected ${count} frames, got ${events.length}`)), 2000);
          const check = () => { if (events.length >= count) { clearTimeout(timer); yes(events); } };
          waiters.push(check); check();
        }),
      };
      res.setEncoding('utf8');
      res.on('end', () => { s.ended = true; });
      res.on('data', text => {
        buffer += text;
        while (buffer.includes('\n\n')) {
          const end = buffer.indexOf('\n\n'), frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const fields = Object.fromEntries(frame.split('\n').map(line => { const colon = line.indexOf(':'); return [line.slice(0, colon), line.slice(colon + 1).trimStart()]; }));
          events.push({ ...fields, data: JSON.parse(fields.data) });
          for (const check of waiters) check();
        }
      });
      f.streams.push(s); resolve(s);
    });
    req.on('error', reject);
  });
}

test('S01/S02/S09: real SSE ready/snapshot IDs, buffered subscribe race, commit order and running metadata', async () => {
  const f = await fixture(), worlds = f.app.get(WorldService), actions = f.app.get(CommittedActions);
  const original = worlds.get.bind(worlds);
  jest.spyOn(worlds, 'get').mockImplementationOnce(id => {
    actions.act(id, { type: 'STEP' }); // included in snapshot; buffered duplicate must drop
    const snapshot = original(id);
    actions.act(id, { type: 'STEP' }); // newer than snapshot; must survive
    return snapshot;
  });
  const s = await stream(f); await s.wait(3);
  expect(s.res.headers['content-type']).toContain('text/event-stream');
  expect(s.events.map(e => e.event)).toEqual(['stream.ready', 'world.snapshot', 'world.updated']);
  expect(s.events.map(e => e.id)).toEqual([undefined, '3', '4']);
  expect(s.events[1].data).toMatchObject({ revision: 3, runningTickIntervalMs: null, state: { tick: 1 } });
  const played = (await act(f, { type: 'PLAY', tickIntervalMs: 100 }).expect(200)).body;
  expect(played.runningTickIntervalMs).toBe(100); await s.wait(4);
  expect(s.events[3].data).toEqual(played);
  f.clock.advance(100); await s.wait(5);
  expect(s.events[4]).toMatchObject({ id: '6', data: { runningTickIntervalMs: 100, state: { tick: 3 } } });
  const paused = (await act(f, { type: 'PAUSE' }).expect(200)).body;
  await s.wait(6); expect(s.events[5].data).toEqual(paused); expect(paused.runningTickIntervalMs).toBeNull();
  expect(f.db.prepare('SELECT revision FROM worlds WHERE id = ?').get(f.id).revision).toBe(7);
});

test('S02/S08/S10: rollback emits only scheduler.error, reconnect gets current state/error, Pause then Play recovers', async () => {
  const f = await fixture(), s = await stream(f); await s.wait(2);
  await act(f, { type: 'PLAY', tickIntervalMs: 100 }).expect(200); await s.wait(3);
  f.db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON world_history BEGIN SELECT RAISE(ABORT, 'private fault'); END");
  f.clock.advance(100); await s.wait(4);
  expect(s.events[3]).toEqual({ event: 'scheduler.error', data: { worldId: f.id, error: { code: 'INTERNAL_ERROR', message: 'Playback stopped due to an error' } } });
  expect((await f.api.get(`/api/worlds/${f.id}`).expect(200)).body).toMatchObject({ revision: 3, runningTickIntervalMs: null, state: { lifecycle: 'PLAYING', tick: 0 } });
  const reconnect = await stream(f, { 'Last-Event-ID': '99999' }); await reconnect.wait(3);
  expect(reconnect.events.map(e => e.event)).toEqual(['stream.ready', 'world.snapshot', 'scheduler.error']);
  expect(reconnect.events[1]).toMatchObject({ id: '3', data: { runningTickIntervalMs: null } });
  expect(reconnect.events[0].data.subscriptionId).not.toBe(s.events[0].data.subscriptionId);
  expect((await act(f, { type: 'PLAY', tickIntervalMs: 500 }).expect(200)).body.runningTickIntervalMs).toBeNull();
  await act(f, { type: 'PAUSE' }).expect(500);
  f.db.exec('DROP TRIGGER fail_history');
  await act(f, { type: 'PAUSE' }).expect(200); await act(f, { type: 'PLAY', tickIntervalMs: 500 }).expect(200);
  f.clock.advance(500); await reconnect.wait(6);
  expect(reconnect.events.at(-1).data.state.tick).toBe(1);
});

test('S04/S05/S06/S07: HTTP presence validation, disconnect grace, persisted expiry and reconnect without resume', async () => {
  const f = await fixture(), s = await stream(f); await s.wait(2);
  const expected = JSON.parse(readFileSync(new URL('./fixtures/stream-initial.json', import.meta.url), 'utf8'));
  const normalized = JSON.parse(JSON.stringify(s.events).replaceAll(f.id, '<worldId>').replaceAll(s.events[0].data.subscriptionId, '<subscriptionId>'));
  expect(normalized).toEqual(expected);
  const subscriptionId = s.events[0].data.subscriptionId;
  const presence = body => f.api.post(`/api/worlds/${f.id}/presence`).send(body);
  expect((await presence({ subscriptionId }).expect(200)).body).toEqual({ worldId: f.id, revision: 2, expiresInMs: 15000 });
  for (const body of [{}, { subscriptionId: 42 }, { subscriptionId, extra: true }, { subscriptionId: 'unknown' }]) await presence(body).expect(400);
  await act(f, { type: 'PLAY', tickIntervalMs: 5000 }).expect(200);
  s.close();
  // An HTTP round trip lets the server observe socket close before renewal.
  await f.api.get(`/api/worlds/${f.id}`).expect(200);
  await presence({ subscriptionId }).expect(400);
  f.clock.advance(14999); expect(f.app.get(WorldService).get(f.id).state.lifecycle).toBe('PLAYING');
  f.clock.advance(1); expect(f.app.get(WorldService).get(f.id).state.lifecycle).toBe('PAUSED');
  const next = await stream(f); await next.wait(2);
  expect(next.events[1].data).toMatchObject({ runningTickIntervalMs: null, state: { lifecycle: 'PAUSED', tick: 2 } });
  await presence({ subscriptionId }).expect(400);
  expect((await f.api.get(`/api/worlds/${f.id}/history`).expect(200)).body.entries.at(-1).action).toEqual({ type: 'PAUSE', reason: 'NO_CLIENTS' });
});

test('L05/S07: Cancel closes all draft streams, invalidates IDs; missing stream returns JSON 404', async () => {
  const f = await fixture();
  f.id = (await f.api.post('/api/worlds').expect(201)).body.worldId;
  const a = await stream(f), b = await stream(f); await a.wait(2); await b.wait(2);
  await act(f, { type: 'CANCEL' }).expect(200);
  await f.api.get(`/api/worlds/${f.id}/events`).expect(404);
  await f.api.post(`/api/worlds/${f.id}/presence`).send({ subscriptionId: a.events[0].data.subscriptionId }).expect(404);
  expect(f.app.get(Playback).interval(f.id)).toBeNull();
  expect(a.res.destroyed || a.ended).toBe(true); expect(b.res.destroyed || b.ended).toBe(true);
});

test('S06/S07/S09: shutdown closes an active stream and timers; actual Play restart requires explicit resume', async () => {
  const f = await fixture(), s = await stream(f); await s.wait(2);
  await act(f, { type: 'PLAY', tickIntervalMs: 100 }).expect(200);
  f.clock.advance(100); await s.wait(4);
  const before = f.app.get(WorldService).get(f.id);
  await f.app.close(); expect(f.clock.jobs.size).toBe(0);
  f.app = await createApplication(join(f.directory, 'world.sqlite'), { clock: f.clock });
  await f.app.listen(0, '127.0.0.1'); f.api = request(f.app.getHttpServer()); f.url = await f.app.getUrl();
  const next = await stream(f); await next.wait(2);
  expect(next.events[1].data).toMatchObject({ revision: before.revision + 1, runningTickIntervalMs: null, state: { lifecycle: 'PAUSED', tick: 1 } });
  const history = (await f.api.get(`/api/worlds/${f.id}/history`).expect(200)).body.entries;
  expect(history.at(-1).action).toEqual({ type: 'PAUSE', reason: 'SERVER_RESTART' });
  f.clock.advance(1000); expect(f.app.get(WorldService).get(f.id).state.tick).toBe(1);
});

test('S08/A02/A03: lost delivery does not affect commit; reconnect and bounded history recover the missed revision', async () => {
  const f = await fixture(), s = await stream(f); await s.wait(2);
  const previous = s.events[1].data.revision;
  s.close();
  const committed = (await act(f, { type: 'STEP' }).expect(200)).body;
  expect(committed.revision).toBe(previous + 1);
  const next = await stream(f, { 'Last-Event-ID': String(previous) }); await next.wait(2);
  expect(next.events[1].data).toMatchObject({ revision: committed.revision, state: committed.state });
  const history = (await f.api.get(`/api/worlds/${f.id}/history?afterRevision=${previous}&throughRevision=${committed.revision}&limit=1`).expect(200)).body;
  expect(history.entries).toEqual(committed.historyEntries); expect(history.hasMore).toBe(false);
});
