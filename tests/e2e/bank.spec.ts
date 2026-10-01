import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('transaction page supports reviewed category and tag changes with real merchant logos', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.brand-icon').first()).toBeVisible();
  await page.getByRole('button', { name: 'View Everyday Coffee transaction', exact: true }).click();
  const receipt = page.locator('.transaction-page');
  await expect(receipt.getByText('A good start to the morning.', { exact: true })).toBeVisible();
  await expect(receipt.getByText('Round-Up', { exact: true })).toBeVisible();
  await receipt.getByLabel('Category', { exact: true }).selectOption({ label: 'Groceries' });
  await receipt.getByRole('button', { name: 'Review change' }).click();
  await page.getByRole('button', { name: 'Confirm change' }).click();
  await expect(receipt.getByText('Sample transaction updated.', { exact: true })).toBeVisible();
  await receipt.getByRole('textbox', { name: 'New transaction tag' }).fill('Weekend');
  await receipt.getByRole('button', { name: 'Add tag', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm change' }).click();
  await receipt.getByRole('button', { name: 'Remove tag Weekend' }).click();
  await page.getByRole('button', { name: 'Confirm change' }).click();
  await expect(receipt.getByRole('button', { name: 'Remove tag Weekend' })).toHaveCount(0);
  await receipt.getByRole('button', { name: 'Back' }).click();
  await expect(
    page.getByRole('button', { name: 'View Everyday Coffee transaction' }),
  ).toContainText('Groceries');
});

test('webhook lifecycle keeps the one-time secret through log refresh and removes subscriptions', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByText(/Demo connection · checked/)).toBeVisible();
  await page.getByRole('button', { name: 'New webhook' }).click();
  await page
    .getByRole('textbox', { name: 'HTTPS endpoint' })
    .fill('https://receiver.example/up/events');
  await page.getByRole('textbox', { name: 'Description' }).fill('Test receiver');
  await page.getByRole('checkbox', { name: /I control this server/ }).check();
  await page.getByRole('button', { name: 'Review connection' }).click();
  await expect(page.getByText(/even when UpDeck is locked or closed/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel('Webhook signing secret')).toHaveValue(
    'demo-secret-not-for-production',
  );
  await page.getByRole('button', { name: 'Refresh logs', exact: true }).click();
  await expect(page.getByLabel('Webhook signing secret')).toHaveValue(
    'demo-secret-not-for-production',
  );
  await page.getByRole('button', { name: 'Close webhook details' }).click();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText(/Ping queued at/)).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No outgoing webhooks' })).toBeVisible();
});

test('full-page bank screens are accessible and fit a small viewport', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Transactions', 'Accounts', 'Receipts', 'Categories & tags', 'Connections']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      name,
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      name,
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1100 });
  }
});
