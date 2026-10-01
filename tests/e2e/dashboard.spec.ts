import { test, expect } from '@playwright/test';

test('demo navigation, search, time range, amount privacy, goals and locking', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /out in 30 days\.$/ })).toBeVisible();
  await expect(page.getByText('Sample data', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide amounts', exact: true }).click();
  await expect(page.locator('.total-balance')).toHaveText('••••');
  await page.getByRole('button', { name: 'Show amounts', exact: true }).click();
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search transactions' }).fill('coffee');
  await expect(page.locator('.transaction-merchant strong').first()).toHaveText('Everyday Coffee');
  await page.getByRole('textbox', { name: 'Search transactions' }).fill('does not exist');
  await expect(page.getByRole('heading', { name: 'No transactions match' })).toBeVisible();
  await page.getByRole('button', { name: 'Savers', exact: true }).click();
  await page.getByRole('button', { name: 'Set target for Tokyo ramen tour' }).click();
  await page.getByRole('textbox', { name: 'Target amount (AUD)' }).fill('6000');
  await page.getByRole('button', { name: 'Set target', exact: true }).click();
  await expect(page.getByText('of $6,000.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lock UpDeck', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Connect Up' })).toBeVisible();
  await expect(page.locator('.balance-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('preview never accepts real credentials and full page fits a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 600 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect Up', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You’re in the web preview' })).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('period controls change the displayed spending total', async ({ page }) => {
  await page.goto('/');
  const before = await page.locator('.spending-value').textContent();
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  expect(await page.locator('.spending-value').textContent()).not.toBe(before);
  await expect(page.getByRole('button', { name: '7 days', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
