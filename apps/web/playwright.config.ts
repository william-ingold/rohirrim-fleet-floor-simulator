import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.FLEET_BROWSER_DB ??= join(mkdtempSync(join(tmpdir(), 'fleet-browser-')), 'worlds.sqlite');
const apiPort = Number(process.env.FLEET_TEST_API_PORT ?? 3000);
const webPort = Number(process.env.FLEET_TEST_WEB_PORT ?? 5173);
for (const port of [apiPort, webPort]) if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Browser test ports must be integers from 1 to 65535');
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: `http://127.0.0.1:${webPort}`, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node e2e/server.mjs', port: apiPort, reuseExistingServer: false, timeout: 15000 },
    { command: `npm exec -- vite preview --host 127.0.0.1 --port ${webPort} --strictPort`, url: `http://127.0.0.1:${webPort}`, reuseExistingServer: false },
  ],
});
