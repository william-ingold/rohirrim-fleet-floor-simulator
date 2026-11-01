import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.FLEET_BROWSER_DB ??= join(mkdtempSync(join(tmpdir(), 'fleet-browser-')), 'worlds.sqlite');
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node e2e/server.mjs', port: 3000, reuseExistingServer: false, timeout: 15000 },
    { command: 'npm exec -- vite preview --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
  ],
});
