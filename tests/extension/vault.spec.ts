import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Recorded = { method: string; path: string; search: string; body: unknown; auth: string };

test('packaged extension talks to the Up API for reads and reviewed changes', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'updeck-test-'));
  const extension = resolve('dist/chrome');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.UPDECK_CHROMIUM_EXECUTABLE,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    // A synthetic Up API inside this disposable profile. It serves the documented resource
    // shapes, keeps state between calls and records every request the background makes.
    await worker.evaluate(() => {
      const requests: Recorded[] = [];
      Reflect.set(globalThis, '__upRequests', requests);
      const transactionId = 'b6bfd3c4-2f7f-4c1a-9a4f-1e1f6c3f2a10';
      const state = { category: 'takeaway', tags: ['Pizza Night'] };
      const related = (type: string, id: string | null) => ({
        data: id ? { type, id } : null,
        links: id ? { related: `https://api.up.com.au/api/v1/${type}/${id}` } : undefined,
      });
      const category = (id: string, name: string, parent: string | null) => ({
        type: 'categories',
        id,
        attributes: { name },
        relationships: {
          parent: related('categories', parent),
          children: { data: parent ? [] : [{ type: 'categories', id: 'takeaway' }] },
        },
      });
      const categories = [
        category('good-life', 'Good Life', null),
        category('takeaway', 'Takeaway', 'good-life'),
        category('groceries', 'Groceries', 'home'),
      ];
      const transaction = () => ({
        type: 'transactions',
        id: transactionId,
        attributes: {
          status: 'SETTLED',
          rawText: 'UBER *EATS SYDNEY',
          description: 'Uber Eats',
          message: null,
          isCategorizable: true,
          holdInfo: null,
          roundUp: {
            amount: { currencyCode: 'AUD', value: '-0.55', valueInBaseUnits: -55 },
            boostPortion: null,
          },
          cashback: null,
          amount: { currencyCode: 'AUD', value: '-23.45', valueInBaseUnits: -2345 },
          foreignAmount: null,
          cardPurchaseMethod: { method: 'CARD_ON_FILE', cardNumberSuffix: '0001' },
          settledAt: '2026-09-30T10:00:00+10:00',
          createdAt: '2026-09-30T09:00:00+10:00',
          transactionType: 'Purchase',
          note: null,
          performingCustomer: { displayName: 'Test' },
          deepLinkURL: 'up://transaction/test',
        },
        relationships: {
          account: related('accounts', 'test-account'),
          transferAccount: { data: null },
          category: related('categories', state.category),
          parentCategory: related(
            'categories',
            state.category === 'groceries' ? 'home' : 'good-life',
          ),
          tags: { data: state.tags.map((id) => ({ type: 'tags', id })) },
          attachment: { data: null },
        },
      });
      const account = {
        type: 'accounts',
        id: 'test-account',
        attributes: {
          displayName: 'Spending',
          accountType: 'TRANSACTIONAL',
          ownershipType: 'INDIVIDUAL',
          balance: { currencyCode: 'AUD', value: '123.45', valueInBaseUnits: 12345 },
          createdAt: '2024-01-01T00:00:00+10:00',
        },
      };
      const page = (data: unknown[]) => Response.json({ data, links: { prev: null, next: null } });
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        if (url.origin !== 'https://api.up.com.au') throw new Error('Unexpected destination');
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        const headers = new Headers(init?.headers);
        requests.push({
          method,
          path: url.pathname,
          search: url.search,
          body,
          auth: headers.get('Authorization') ?? '',
        });
        const path = url.pathname.replace('/api/v1/', '');
        if (path === 'util/ping') return Response.json({ meta: { id: 'ping', statusEmoji: '⚡️' } });
        if (path === 'accounts') return page([account]);
        if (path === 'accounts/test-account') return Response.json({ data: account });
        if (path === 'transactions' || path === 'accounts/test-account/transactions')
          return page([transaction()]);
        if (path === `transactions/${transactionId}`) return Response.json({ data: transaction() });
        if (path === 'categories') return page(categories);
        const one = categories.find((c) => path === `categories/${c.id}`);
        if (one) return Response.json({ data: one });
        if (path === `transactions/${transactionId}/relationships/category`) {
          state.category = body.data.id;
          return new Response(null, { status: 204 });
        }
        if (path === `transactions/${transactionId}/relationships/tags`) {
          const ids = body.data.map((t: { id: string }) => t.id);
          state.tags =
            method === 'POST'
              ? [...new Set([...state.tags, ...ids])]
              : state.tags.filter((t) => !ids.includes(t));
          return new Response(null, { status: 204 });
        }
        if (path === 'tags') return page(state.tags.map((id) => ({ type: 'tags', id })));
        return page([]);
      };
    });
    const requests = () =>
      worker.evaluate(() => Reflect.get(globalThis, '__upRequests') as Recorded[]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${id}/index.html`);

    // Connect: the lock screen is the form.
    await expect(page.getByRole('heading', { level: 1, name: 'Connect Up' })).toBeVisible();
    await page.getByLabel('Up personal access token').fill('up:yeah:synthetic-test-token-only');
    await page.getByLabel('Create a passphrase').fill('only a synthetic test passphrase');
    await page.getByLabel('Repeat your passphrase').fill('only a synthetic test passphrase');
    await page.getByRole('button', { name: 'Connect & encrypt' }).click();
    await expect(page.locator('.total-balance')).toHaveText('$123.45');
    expect(
      (await requests()).every((r) => r.auth === 'Bearer up:yeah:synthetic-test-token-only'),
    ).toBe(true);
    const storage = await worker.evaluate(async () =>
      Reflect.get(globalThis, 'chrome').storage.local.get(null),
    );
    expect(Object.keys(storage)).toEqual(['vault']);
    expect(JSON.stringify(storage)).not.toContain('synthetic-test-token');
    expect(JSON.stringify(storage)).not.toContain('synthetic test passphrase');

    // Lock and unlock.
    await page.getByRole('button', { name: 'Lock UpDeck', exact: true }).click();
    await expect(page.locator('.total-balance')).toHaveCount(0);
    await page.getByLabel('Passphrase', { exact: true }).fill('only a synthetic test passphrase');
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.total-balance')).toHaveText('$123.45');

    // Every data page reads through the background's validated `api` request.
    await page.getByRole('button', { name: 'Transactions', exact: true }).click();
    await expect(page.locator('.transaction-merchant strong').first()).toHaveText('Uber Eats');
    await expect(page.getByRole('img', { name: 'Uber Eats' }).first()).toBeVisible();
    for (const name of ['Accounts', 'Receipts', 'Categories & tags', 'Connections']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.locator('main h1')).toHaveText(name);
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    // Financial-year report pages through Up with the documented date filters.
    await page.getByRole('button', { name: 'Insights', exact: true }).click();
    await expect(page.locator('main h1')).toHaveText('Insights');
    await page.getByRole('button', { name: /^Load FY/ }).click();
    await expect(page.getByText(/1 transactions in FY/)).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Pizza Night' })).toBeVisible();
    const yearRequest = (await requests()).find(
      (r) => r.path === '/api/v1/transactions' && r.search.includes('filter%5Buntil%5D'),
    );
    // 1 July in the browser's time zone, which this test shares.
    const fyStart = new Date(
      new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1,
      6,
      1,
    );
    expect(new URLSearchParams(yearRequest?.search).get('filter[since]')).toBe(
      fyStart.toISOString(),
    );
    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await page.getByRole('button', { name: 'Check connection' }).click();
    await expect(page.getByText(/Connected · checked/)).toBeVisible();

    // Reviewed changes reach Up as the documented requests.
    await page.getByRole('button', { name: 'Transactions', exact: true }).click();
    await page.getByRole('button', { name: 'View Uber Eats transaction' }).click();
    const detail = page.locator('.transaction-page');
    await expect(detail.getByRole('heading', { level: 1, name: 'Uber Eats' })).toBeVisible();
    await expect(detail.getByText('Spending', { exact: true })).toBeVisible();
    await detail.getByLabel('Category', { exact: true }).selectOption({ label: 'Groceries' });
    await detail.getByRole('button', { name: 'Review change' }).click();
    await page.getByRole('button', { name: 'Confirm change' }).click();
    await expect(detail.getByText('Saved to Up.', { exact: true })).toBeVisible();
    await detail.getByRole('textbox', { name: 'New transaction tag' }).fill('Weekend');
    await detail.getByRole('button', { name: 'Add tag', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm change' }).click();
    await expect(detail.getByRole('button', { name: 'Remove tag Weekend' })).toBeVisible();
    await detail.getByRole('button', { name: 'Remove tag Pizza Night' }).click();
    await page.getByRole('button', { name: 'Confirm change' }).click();
    await expect(detail.getByRole('button', { name: 'Remove tag Pizza Night' })).toHaveCount(0);
    await expect
      .poll(async () => (await requests()).filter((r) => r.method !== 'GET').length)
      .toBe(3);
    const writes = (await requests()).filter((r) => r.method !== 'GET');
    expect(writes.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'PATCH',
        path: '/api/v1/transactions/b6bfd3c4-2f7f-4c1a-9a4f-1e1f6c3f2a10/relationships/category',
        body: { data: { type: 'categories', id: 'groceries' } },
      },
      {
        method: 'POST',
        path: '/api/v1/transactions/b6bfd3c4-2f7f-4c1a-9a4f-1e1f6c3f2a10/relationships/tags',
        body: { data: [{ type: 'tags', id: 'Weekend' }] },
      },
      {
        method: 'DELETE',
        path: '/api/v1/transactions/b6bfd3c4-2f7f-4c1a-9a4f-1e1f6c3f2a10/relationships/tags',
        body: { data: [{ type: 'tags', id: 'Pizza Night' }] },
      },
    ]);
    await detail.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: 'View Uber Eats transaction' })).toContainText(
      'Groceries',
    );

    // Disconnect removes the vault.
    await page.getByRole('button', { name: 'Settings & privacy' }).click();
    await page.getByRole('button', { name: 'Disconnect Up' }).click();
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Connect Up' })).toBeVisible();
    const empty = await worker.evaluate(async () =>
      Reflect.get(globalThis, 'chrome').storage.local.get(null),
    );
    expect(empty).toEqual({});
    expect(errors).toEqual([]);
    const action = await worker.evaluate(
      () => Reflect.get(globalThis, 'chrome').runtime.getManifest().action,
    );
    expect(action.default_popup).toBeUndefined();
    expect(action.default_title).toBe('Open UpDeck');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
