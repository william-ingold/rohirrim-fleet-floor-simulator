import { expect, test } from '@jest/globals';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import request from 'supertest';

function launch(databasePath, port, host) {
  return spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: { ...process.env, DATABASE_PATH: databasePath, PORT: port, ...(host === undefined ? {} : { HOST: host }) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
}
test.each([undefined, '127.0.0.2', '0.0.0.0'])('B4 executable listens with HOST=%s after recovery and SIGTERM closes cleanly, preserving the saved world', async host => {
  const directory = mkdtempSync(join(tmpdir(), 'fleet-bootstrap-'));
  const child = launch(join(directory, 'world.sqlite'), '0', host);
  const exited = once(child, 'exit');
  let output = '', errors = '';
  child.stderr.on('data', data => { errors += data; });
  try {
    const url = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/Listening on (http:\/\/[^\s]+)/);
        if (match) resolve(match[1]);
      });
      child.once('exit', code => reject(new Error(`Exited ${code}: ${errors}`)));
      child.once('error', reject);
    });
    const address = new URL(url);
    // Nest reports loopback for the wildcard bind; a second loopback address
    // also proves that HOST is honored rather than silently using the default.
    expect(address.hostname).toBe(host === '0.0.0.0' ? '127.0.0.1' : host ?? '127.0.0.1');
    const response = await request(address.origin).post('/api/worlds').send({ width: 1, height: 1 }).expect(201);
    expect(response.body).toMatchObject({ revision: 1, runningTickIntervalMs: null });
    child.kill('SIGTERM');
    expect(await exited).toEqual([null, 'SIGTERM']);
    const { createApplication } = await import('../dist/http/application.js');
    const app = await createApplication(join(directory, 'world.sqlite'));
    try {
      await app.init();
      expect((await request(app.getHttpServer()).get(`/api/worlds/${response.body.worldId}`).expect(200)).body.revision).toBe(1);
    } finally { await app.close(); }
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    rmSync(directory, { recursive: true, force: true });
  }
}, 15000);

test('B4 executable rejects invalid port before creating a database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fleet-bootstrap-'));
  try {
    const child = launch(join(directory, 'world.sqlite'), 'invalid');
    let errors = '';
    child.stderr.on('data', data => { errors += data; });
    expect(await once(child, 'exit')).toEqual([1, null]);
    expect(errors).toContain('PORT');
    expect(existsSync(join(directory, 'world.sqlite'))).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
