import { test, expect, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import type { WorldResponse } from '../src/lib/types.js';

declare global { interface Window { reviewUpdates: WorldResponse[]; reviewSources: EventSource[] } }
type SavedRow = { revision: number; snapshot_json: string; t0_json: string };
const cell = (page: Page, x: number, y: number) => page.getByRole('gridcell', { name: new RegExp(`^x ${x}, y ${y},`) });
test.beforeEach(async ({ page }) => {
  // Observe the real stream used by the app, without replacing transport or responses.
  await page.addInitScript(() => {
    const observed = window;
    observed.reviewUpdates = []; observed.reviewSources = [];
    const NativeSource = window.EventSource;
    window.EventSource = class extends NativeSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options); observed.reviewSources.push(this);
        this.addEventListener('world.updated', event => observed.reviewUpdates.push(JSON.parse(event.data)));
      }
    };
  });
});
async function create(page: Page) {
  await page.goto('/'); await page.getByLabel('Width', { exact: true }).fill('2'); await page.getByLabel('Height', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Create world', exact: true }).click();
  await expect(page.getByText('✓ Live', { exact: true })).toBeVisible();
  return new URL(page.url()).searchParams.get('world')!;
}

test('review D02/S02: UI Step rolls back on history failure, then commits SQLite and SSE together', async ({ page }) => {
  const id = await create(page), db = new Database(process.env.FLEET_BROWSER_DB!);
  try {
    await cell(page, 0, 0).click(); await expect(cell(page, 0, 0)).toHaveAccessibleName(/R1/); await cell(page, 0, 0).click();
    await page.getByRole('button', { name: 'Face East', exact: true }).click();
    await expect(cell(page, 0, 0)).toHaveAccessibleName(/facing East/);
    await page.getByRole('button', { name: '↑ Forward', exact: true }).click();
    await page.getByRole('button', { name: 'Finish Setup', exact: true }).click();
    await expect(page.locator('[aria-current="step"]')).toHaveText('Paused');
    const row = () => db.prepare<[string], SavedRow>('SELECT revision, snapshot_json, t0_json FROM worlds WHERE id = ?').get(id)!;
    const before = row();
    await expect.poll(() => page.evaluate(() => (window).reviewUpdates.at(-1)?.revision)).toBe(before.revision);
    const updatesBefore = await page.evaluate(() => (window).reviewUpdates.length);
    db.exec("CREATE TRIGGER review_fail_step BEFORE INSERT ON world_history WHEN json_extract(NEW.action_json, '$.type') = 'STEP' BEGIN SELECT RAISE(ABORT, 'review history failure'); END");
    const rejected = page.waitForResponse(response => response.url().endsWith('/actions') && response.request().postDataJSON().type === 'STEP');
    await page.getByRole('button', { name: 'Step', exact: true }).click();
    expect((await rejected).status()).toBe(500);
    await expect(page.getByText('An internal error occurred', { exact: true })).toBeVisible();
    expect(row()).toEqual(before);
    expect(db.prepare<[string], { revision: number }>('SELECT MAX(revision) AS revision FROM world_history WHERE world_id = ?').get(id)!.revision).toBe(before.revision);
    await expect(cell(page, 0, 0)).toHaveAccessibleName(/R1 facing East, battery 100/);
    await expect(page.getByLabel('Selected robot').getByText('MOVE', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window).reviewUpdates.length)).toBe(updatesBefore);
    db.exec('DROP TRIGGER review_fail_step');
    const committed = page.waitForResponse(response => response.url().endsWith('/actions') && response.request().postDataJSON().type === 'STEP');
    await page.getByRole('button', { name: 'Step', exact: true }).click();
    const response: WorldResponse = await (await committed).json();
    await expect(cell(page, 1, 0)).toHaveAccessibleName(/R1 facing East, battery 99/);
    await expect.poll(() => page.evaluate(() => (window).reviewUpdates.at(-1))).toEqual(response);
    const saved = row(); expect(saved.revision).toBe(before.revision + 1);
    expect(JSON.parse(saved.snapshot_json)).toEqual(response.state); expect(saved.t0_json).toBe(before.t0_json);
    const history = await (await page.request.get(`/api/worlds/${id}/history?afterRevision=${before.revision}&throughRevision=${saved.revision}`)).json();
    expect(history.entries).toEqual(response.historyEntries);
    expect(response.state.robots[0]?.queue).toEqual([]);
  } finally { db.exec('DROP TRIGGER IF EXISTS review_fail_step'); db.close(); }
});

test('review S08/S10: reconnect clears scheduler warning after another tab resumes playback', async ({ page, context }) => {
  await create(page); await page.getByRole('button', { name: 'Finish Setup', exact: true }).click();
  const second = await context.newPage(); await second.goto(page.url());
  await expect(second.getByText('✓ Live', { exact: true })).toBeVisible();
  const db = new Database(process.env.FLEET_BROWSER_DB!);
  try {
    db.exec("CREATE TRIGGER review_fail_tick BEFORE INSERT ON world_history WHEN json_extract(NEW.action_json, '$.type') = 'AUTOMATIC_TICK' BEGIN SELECT RAISE(ABORT, 'review tick failure'); END");
    await page.getByLabel('Next Play interval', { exact: true }).fill('100');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Playback stopped due to an error.', { exact: true })).toBeVisible();
    await page.route('**/events', route => route.abort());
    await page.evaluate(() => { for (const source of (window).reviewSources) { source.close(); source.dispatchEvent(new Event('error')); } });
    await expect(page.getByText('↻ Reconnecting', { exact: true })).toBeVisible();
    db.exec('DROP TRIGGER review_fail_tick');
    await second.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(second.locator('[aria-current="step"]')).toHaveText('Paused');
    await second.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(second.getByText('Running at 1000 ms', { exact: true })).toBeVisible();
    await page.unroute('**/events');
    await expect(page.getByText('✓ Live', { exact: true })).toBeVisible();
    await expect(page.getByText('Running at 1000 ms', { exact: true })).toBeVisible();
    await expect(page.getByText('Playback stopped due to an error.', { exact: true })).toHaveCount(0);
    await second.getByRole('button', { name: 'Pause', exact: true }).click();
  } finally { db.exec('DROP TRIGGER IF EXISTS review_fail_tick'); db.close(); await second.close(); }
});
