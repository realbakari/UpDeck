import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeOperation } from '../../src/security/up-api';
import { operationSchema, transactionResource, type Operation } from '../../src/api-model';

const money = { currencyCode: 'AUD', valueInBaseUnits: -625 };
const transaction = {
  id: 't1',
  attributes: {
    description: 'Coffee',
    amount: money,
    status: 'SETTLED',
    createdAt: '2026-10-01T01:00:00Z',
    isCategorizable: true,
  },
  relationships: { account: { data: { id: 'a1' } }, tags: { data: [{ id: 'Food' }] } },
};
const category = {
  id: 'c1',
  attributes: { name: 'Coffee' },
  relationships: { parent: { data: { id: 'parent' } } },
};
const account = {
  id: 'a1',
  attributes: {
    displayName: 'Spending',
    accountType: 'TRANSACTIONAL',
    ownershipType: 'JOINT',
    balance: money,
  },
};
const attachment = {
  id: 'r1',
  attributes: {
    createdAt: null,
    fileURL: null,
    fileURLExpiresAt: '2026-10-01T01:00:00Z',
    fileExtension: null,
    fileContentType: null,
  },
  relationships: { transaction: { data: null } },
};
const webhook = {
  id: 'w1',
  attributes: {
    url: 'https://receiver.example/up/events',
    description: 'Mine',
    createdAt: '2026-10-01T01:00:00Z',
  },
};
const event = {
  id: 'e1',
  attributes: { eventType: 'PING', createdAt: '2026-10-01T01:00:00Z' },
  relationships: { webhook: { data: { id: 'w1' } } },
};
const log = {
  id: 'l1',
  attributes: {
    request: { body: '{}' },
    response: { statusCode: 200, body: 'OK' },
    deliveryStatus: 'DELIVERED',
    createdAt: '2026-10-01T01:00:00Z',
  },
  relationships: { webhookEvent: { data: { id: 'e1' } } },
};
const page = (data: unknown) => ({ data: [data], links: { next: null, prev: null } });
const run = (operation: Operation) =>
  executeOperation(operation, 'synthetic-test-token', new AbortController().signal);
afterEach(() => vi.unstubAllGlobals());

describe('all documented API operations', () => {
  const reads: [Operation, string, unknown][] = [
    [
      { op: 'accounts', accountType: 'SAVER', ownershipType: 'JOINT', pageSize: 20 },
      '/accounts',
      page(account),
    ],
    [{ op: 'account', id: 'a1' }, '/accounts/a1', { data: account }],
    [
      {
        op: 'transactions',
        status: 'SETTLED',
        category: 'c1',
        tag: 'Food & fun',
        since: '2026-09-01T00:00:00Z',
        until: '2026-10-01T00:00:00Z',
      },
      '/transactions',
      page(transaction),
    ],
    [{ op: 'transactions', accountId: 'a1' }, '/accounts/a1/transactions', page(transaction)],
    [{ op: 'transaction', id: 't1' }, '/transactions/t1', { data: transaction }],
    [{ op: 'attachments' }, '/attachments', page(attachment)],
    [{ op: 'attachment', id: 'r1' }, '/attachments/r1', { data: attachment }],
    [{ op: 'categories', parent: 'parent' }, '/categories', page(category)],
    [{ op: 'category', id: 'c1' }, '/categories/c1', { data: category }],
    [{ op: 'tags', pageSize: 25 }, '/tags', page({ id: 'Food' })],
    [{ op: 'ping' }, '/util/ping', { meta: { id: 'user1', statusEmoji: '⚡️' } }],
    [{ op: 'webhooks' }, '/webhooks', page(webhook)],
    [{ op: 'webhook', id: 'w1' }, '/webhooks/w1', { data: webhook }],
    [{ op: 'webhookLogs', id: 'w1' }, '/webhooks/w1/logs', page(log)],
  ];
  it.each(reads)('reads %j through its fixed route', async (op, path, response) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetcher);
    await run(op);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url.pathname).toBe('/api/v1' + path);
    expect(options).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    if (op.op === 'transactions' && !op.accountId) {
      expect(url.searchParams.get('filter[tag]')).toBe('Food & fun');
      expect(url.searchParams.get('filter[status]')).toBe('SETTLED');
      expect(url.searchParams.get('filter[category]')).toBe('c1');
      expect(url.searchParams.get('filter[since]')).toBe(op.since);
      expect(url.searchParams.get('filter[until]')).toBe(op.until);
    }
    if (op.op === 'accounts') {
      expect(url.searchParams.get('filter[accountType]')).toBe('SAVER');
      expect(url.searchParams.get('filter[ownershipType]')).toBe('JOINT');
      expect(url.searchParams.get('page[size]')).toBe('20');
    }
    if (op.op === 'categories') expect(url.searchParams.get('filter[parent]')).toBe('parent');
  });
  const writes: [Operation, string, string, unknown, unknown][] = [
    [
      { op: 'categorize', id: 't1', categoryId: 'c1', confirmed: true },
      'PATCH',
      '/transactions/t1/relationships/category',
      { data: { type: 'categories', id: 'c1' } },
      null,
    ],
    [
      { op: 'addTags', id: 't1', tags: ['Work'], confirmed: true },
      'POST',
      '/transactions/t1/relationships/tags',
      { data: [{ type: 'tags', id: 'Work' }] },
      null,
    ],
    [
      { op: 'removeTags', id: 't1', tags: ['Food'], confirmed: true },
      'DELETE',
      '/transactions/t1/relationships/tags',
      { data: [{ type: 'tags', id: 'Food' }] },
      null,
    ],
    [
      { op: 'createWebhook', url: webhook.attributes.url, description: 'Mine', confirmed: true },
      'POST',
      '/webhooks',
      { data: { attributes: { url: webhook.attributes.url, description: 'Mine' } } },
      { data: { ...webhook, attributes: { ...webhook.attributes, secretKey: 'one-time-secret' } } },
    ],
    [{ op: 'deleteWebhook', id: 'w1', confirmed: true }, 'DELETE', '/webhooks/w1', undefined, null],
    [
      { op: 'pingWebhook', id: 'w1', confirmed: true },
      'POST',
      '/webhooks/w1/ping',
      undefined,
      { data: event },
    ],
  ];
  it.each(writes)(
    'submits %j with the documented method and body',
    async (op, method, path, body, response) => {
      const fetcher = vi.fn().mockImplementation((url: URL, options: RequestInit) => {
        if (options.method === 'GET')
          return Promise.resolve(
            Response.json({ data: url.pathname.includes('categories') ? category : transaction }),
          );
        return Promise.resolve(
          response ? Response.json(response) : new Response(null, { status: 204 }),
        );
      });
      vi.stubGlobal('fetch', fetcher);
      const result = await run(op);
      const [url, options] = fetcher.mock.calls.at(-1)!;
      expect(url.pathname).toBe('/api/v1' + path);
      expect(options.method).toBe(method);
      expect(options.body ? JSON.parse(options.body) : undefined).toEqual(body);
      if (op.op === 'createWebhook')
        expect(result).toMatchObject({
          kind: 'webhook',
          data: { attributes: { secretKey: 'one-time-secret' } },
        });
    },
  );
  it('can clear a category and refuses parent categories or ineligible transactions', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: transaction }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    await run({ op: 'categorize', id: 't1', categoryId: null, confirmed: true });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ data: null });
    fetcher.mockReset().mockResolvedValue(
      Response.json({
        data: {
          ...transaction,
          attributes: { ...transaction.attributes, isCategorizable: false },
        },
      }),
    );
    await expect(
      run({ op: 'categorize', id: 't1', categoryId: 'c1', confirmed: true }),
    ).rejects.toThrow('cannot be categorised');
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json({ data: transaction }))
      .mockResolvedValueOnce(
        Response.json({ data: { ...category, relationships: { parent: { data: null } } } }),
      );
    await expect(
      run({ op: 'categorize', id: 't1', categoryId: 'parent', confirmed: true }),
    ).rejects.toThrow('child category');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('enforces the six-tag limit before writing', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: transaction }));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      run({ op: 'addTags', id: 't1', tags: ['1', '2', '3', '4', '5', '6'], confirmed: true }),
    ).rejects.toThrow('six tags');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('follows opaque cursors but blocks destination and endpoint changes', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(page(transaction)));
    vi.stubGlobal('fetch', fetcher);
    const cursor = 'https://api.up.com.au/api/v1/transactions?page%5Bafter%5D=opaque';
    await run({ op: 'transactions', cursor });
    expect(fetcher.mock.calls[0][0].href).toBe(cursor);
    fetcher.mockClear();
    for (const cursor of [
      'https://evil.example/api/v1/transactions',
      'https://api.up.com.au/api/v1/webhooks',
    ])
      await expect(run({ op: 'transactions', cursor })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation and rejects unsafe URLs, IDs and dates', () => {
    for (const op of [
      { op: 'deleteWebhook', id: 'w1' },
      { op: 'addTags', id: 't1', tags: ['Work'], confirmed: false },
      { op: 'transaction', id: '../webhooks' },
      { op: 'transactions', since: 'yesterday' },
      ...[
        'http://receiver.example',
        'https://127.0.0.1',
        'https://a.local',
        'https://user:password@receiver.example',
      ].map((url) => ({ op: 'createWebhook', url, description: 'x', confirmed: true })),
    ])
      expect(operationSchema.safeParse(op).success).toBe(false);
  });
  it('never retries an ambiguous write and never displays an upstream body', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('secret'));
    vi.stubGlobal('fetch', fetcher);
    await expect(run({ op: 'deleteWebhook', id: 'w1', confirmed: true })).rejects.toThrow(
      'result of this change is unknown',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(new Response('secret', { status: 429 }));
    await expect(run({ op: 'ping' })).rejects.toThrow('request limit');
  });
  it('preserves receipt details and rejects unsafe monetary values', () => {
    const detail = transactionResource.parse({
      ...transaction,
      attributes: {
        ...transaction.attributes,
        note: { text: 'Receipt note' },
        foreignAmount: { currencyCode: 'JPY', valueInBaseUnits: -650 },
        roundUp: { amount: money, boostPortion: null },
        cashback: { description: 'Reward', amount: { ...money, valueInBaseUnits: 20 } },
      },
    });
    expect(detail.attributes.note?.text).toBe('Receipt note');
    expect(detail.attributes.foreignAmount?.currencyCode).toBe('JPY');
    for (const amount of [
      { ...money, valueInBaseUnits: 0.1 },
      { ...money, valueInBaseUnits: Number.MAX_SAFE_INTEGER + 1 },
      { ...money, currencyCode: 'USD' },
    ])
      expect(
        transactionResource.safeParse({
          ...transaction,
          attributes: { ...transaction.attributes, amount },
        }).success,
      ).toBe(false);
  });
});
