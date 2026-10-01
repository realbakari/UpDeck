import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test('insights explain payday, subscriptions, changes and export a safe CSV', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Safe to spend' })).toContainText(
    'Safe to spend until payday',
  );
  await page.getByRole('button', { name: 'See how this is worked out' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Bills due before payday' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Spotify went up $1.00');
  await expect(page.getByText('May have stopped')).toBeVisible();
  await expect(page.locator('.changed-panel')).toContainText('mostly Uber Eats on Fridays');
  await expect(page.locator('.twoup-panel')).toContainText('Sam');
  await page.getByRole('button', { name: /^Load FY/ }).click();
  await expect(page.getByRole('rowheader', { name: 'Work', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await (await download).path();
  const csv = await readFile(file, 'utf8');
  expect(csv).toContain(
    'Date,Description,Category,Tags,Amount (AUD),Status,Account,Transaction ID',
  );
  expect(csv).toContain('Officeworks');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('hidden amounts hide insight figures too', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide amounts', exact: true }).click();
  await expect(page.locator('.safe-amount')).toHaveText('••••');
});
