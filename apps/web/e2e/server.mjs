import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../../api/dist/http/application.js';
const directory = process.env.FLEET_BROWSER_DB ? null : mkdtempSync(join(tmpdir(), 'fleet-browser-'));
const app = await createApplication(process.env.FLEET_BROWSER_DB ?? join(directory, 'worlds.sqlite'));
await app.listen(3000, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); if (directory) rmSync(directory, { recursive: true, force: true }); process.exit(0); });
