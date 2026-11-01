import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const screenshots = process.env.FLEET_TEST_SCREENSHOTS ?? '../../docs/handoff/phase5/screenshots';
const cell = (page: Page, x: number, y: number) => page.getByRole('gridcell', { name: new RegExp(`^x ${x}, y ${y},`) });
async function create(page: Page, width = 10, height = 8) {
  await page.goto('/'); await page.getByLabel('Width', { exact: true }).fill(String(width)); await page.getByLabel('Height', { exact: true }).fill(String(height));
  await page.getByRole('button', { name: 'Create world', exact: true }).click();
  await expect(page.getByText('✓ Live', { exact: true })).toBeVisible();
}
async function image(page: Page, name: string) { await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: `${screenshots}/${name}.png`, fullPage: !name.includes('mobile') }); }
test('setup facing and deletion sync across tabs, survive refresh, and work on mobile', async ({ page, context }) => {
  await create(page, 3, 3);
  await cell(page, 1, 1).click(); await expect(cell(page, 1, 1)).toHaveAccessibleName(/R1/);
  await cell(page, 1, 1).click();
  await page.getByRole('button', { name: '↑ Forward', exact: true }).click();
  const second = await context.newPage(); await second.goto(page.url());
  await expect(second.getByText('✓ Live', { exact: true })).toBeVisible();
  await cell(second, 1, 1).click();
  await page.getByRole('button', { name: 'Face West', exact: true }).click();
  await expect(cell(second, 1, 1)).toHaveAccessibleName(/R1 facing West/);
  await page.reload(); await expect(cell(page, 1, 1)).toHaveAccessibleName(/R1 facing West/);
  await page.setViewportSize({ width: 390, height: 844 });
  await cell(page, 1, 1).click(); await page.getByRole('button', { name: 'Inspect robot', exact: true }).click();
  await expect(page.getByLabel('Selected robot').getByText('MOVE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete robot', exact: true }).click();
  await expect(cell(page, 1, 1)).toHaveAccessibleName(/empty/);
  await expect(cell(second, 1, 1)).toHaveAccessibleName(/empty/);
  await expect(second.getByRole('button', { name: 'Delete robot', exact: true })).toHaveCount(0);
  await page.reload(); await expect(cell(page, 1, 1)).toHaveAccessibleName(/empty/);
  await cell(second, 1, 1).click(); await expect(cell(second, 1, 1)).toHaveAccessibleName(/R1 facing North, battery 100/);
  await expect(second.getByRole('heading', { name: 'R1', exact: true })).toHaveCount(0);
  await cell(second, 1, 1).click();
  await second.getByRole('button', { name: 'Finish Setup', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Delete robot', exact: true })).toHaveCount(0);
  await expect(second.getByRole('button', { name: 'Face West', exact: true })).toHaveCount(0);
  await second.close();
});
test('real create/setup/step/play/pause/refresh/end flow and keyboard focus', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await create(page); await image(page, '01-setup-desktop');
  await cell(page, 2, 1).click(); await expect(cell(page, 2, 1)).toHaveAccessibleName(/R1 facing North/);
  await cell(page, 2, 1).click();
  await page.getByRole('button', { name: '↑ Forward', exact: true }).click();
  await expect(page.getByLabel('Selected robot').getByText('MOVE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish Setup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Step', exact: true }).click(); await expect(cell(page, 2, 2)).toHaveAccessibleName(/R1 facing North, battery 99/);
  await page.getByLabel('Next Play interval', { exact: true }).fill('500');
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await expect(page.getByText('Running at 500 ms', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText('Running at 500 ms', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Next Play interval', { exact: true })).toHaveValue('1000');
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await expect(page.locator('[aria-current="step"]')).toHaveText('Paused');
  await cell(page, 2, 2).click(); await image(page, '02-paused-desktop');
  await cell(page, 2, 2).focus(); await page.keyboard.press('c'); await page.keyboard.press('ArrowRight'); await expect(cell(page, 3, 2)).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'End', exact: true }).click(); await expect(page.getByRole('button', { name: 'Create another world', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '↑ Forward', exact: true })).toHaveAttribute('aria-disabled', 'true');
  expect(errors).toEqual([]);
});
test('20 × 20 remains inspectable at desktop and 390 px with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await create(page, 20, 20);
  const id = new URL(page.url()).searchParams.get('world')!;
  for (let i = 0; i < 60; i++) {
    const response = await page.request.post(`/api/worlds/${id}/actions`, { data: { type: 'PLACE_ROBOT', position: { x: i % 20, y: 19 - Math.floor(i / 20) } } }); expect(response.ok()).toBe(true);
  }
  await expect(page.getByRole('heading', { name: 'All robots (60)', exact: true })).toBeVisible();
  await cell(page, 19, 19).click(); await expect(cell(page, 19, 19)).toHaveAccessibleName(/R20/);
  await page.getByRole('button', { name: 'Large (44 px)', exact: true }).click(); await image(page, '03-dense-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(cell(page, 19, 19)).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const size = await cell(page, 19, 19).boundingBox(); expect(size!.width).toBeGreaterThanOrEqual(30);
  await image(page, '04-dense-mobile');
  await expect(page.getByRole('button', { name: 'Inspect robot', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand history', exact: true })).toBeVisible();
});
test('reconnect after last-client pause never resumes automatically', async ({ page, context }) => {
  await create(page, 2, 2); await page.getByRole('button', { name: 'Finish Setup', exact: true }).click();
  await page.getByLabel('Next Play interval', { exact: true }).fill('100'); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByText('Running at 100 ms', { exact: true })).toBeVisible(); const url = page.url();
  await page.goto('about:blank');
  // This real-time wait intentionally exercises the server's actual 15-second lease expiry.
  await page.waitForTimeout(16000); await page.goto(url);
  await expect(page.locator('[aria-current="step"]')).toHaveText('Paused');
  await expect(page.getByText(/Playback paused while no tabs were connected/)).toBeVisible();
  const tick = await page.locator('.tick').textContent(); await page.waitForTimeout(350); expect(await page.locator('.tick').textContent()).toBe(tick);
});
test('another tab cancelling a draft returns to creation after confirmed 404', async ({ page, context }) => {
  await create(page); const second = await context.newPage(); await second.goto(page.url());
  await expect(second.getByText('✓ Live', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(second.getByText('This draft is no longer available.', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(second.getByRole('button', { name: 'Create world', exact: true })).toBeVisible(); await second.close();
});

test('history keeps its scroll position while real ticks arrive, and presence renews', async ({ page }) => {
  let renewals = 0; page.on('request', request => { if (request.url().endsWith('/presence')) renewals++; });
  await create(page, 3, 3); await page.getByRole('button', { name: 'Finish Setup', exact: true }).click();
  await page.getByLabel('Next Play interval', { exact: true }).fill('100'); await page.getByRole('button', { name: 'Play', exact: true }).click();
  const rows = page.getByRole('region', { name: 'Committed history entries', exact: true });
  await expect.poll(() => rows.locator('details').count(), { timeout: 10000 }).toBeGreaterThan(35);
  await rows.evaluate(element => element.scrollTop = 40); const top = await rows.evaluate(element => element.scrollTop);
  await expect.poll(() => rows.locator('details').count()).toBeGreaterThan(45);
  expect(await rows.evaluate(element => element.scrollTop)).toBe(top);
  await expect(page.getByRole('button', { name: 'Jump to latest ↓', exact: true })).toBeVisible();
  await expect.poll(() => renewals, { timeout: 10000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});

test('real scheduler failure preserves Playing and recovers with Pause then Play', async ({ page }) => {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(process.env.FLEET_BROWSER_DB!);
  try {
    await create(page, 2, 2); await page.getByRole('button', { name: 'Finish Setup', exact: true }).click();
    db.exec("CREATE TRIGGER browser_fail_tick BEFORE INSERT ON world_history WHEN json_extract(NEW.action_json, '$.type') = 'AUTOMATIC_TICK' BEGIN SELECT RAISE(ABORT, 'browser tick failure'); END");
    await page.getByLabel('Next Play interval', { exact: true }).fill('100'); await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByText('Playback stopped due to an error.', { exact: true })).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText('Playing'); await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
    await image(page, '05-scheduler-error');
    db.exec('DROP TRIGGER browser_fail_tick');
    await page.getByRole('button', { name: 'Pause', exact: true }).click(); await expect(page.locator('[aria-current="step"]')).toHaveText('Paused');
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await expect(page.locator('.tick')).not.toHaveText('Tick 0');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  } finally { db.exec('DROP TRIGGER IF EXISTS browser_fail_tick'); db.close(); }
});

test('reduced motion commits movement immediately and keeps default mobile controls usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await create(page);
  await cell(page, 2, 1).click(); await expect(cell(page, 2, 1)).toHaveAccessibleName(/R1/); await cell(page, 2, 1).click();
  await page.getByRole('button', { name: '↑ Forward', exact: true }).click(); await page.getByRole('button', { name: 'Finish Setup', exact: true }).click();
  await page.getByRole('button', { name: 'Step', exact: true }).click(); await expect(cell(page, 2, 2)).toHaveAccessibleName(/R1 facing North, battery 99/);
  const travelling = await page.evaluate(() => document.getAnimations().filter(animation => animation.effect instanceof KeyframeEffect && animation.effect.getKeyframes().some(frame => 'transform' in frame)).length);
  expect(travelling).toBe(0); await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Go to…', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await image(page, '06-default-mobile');
});
