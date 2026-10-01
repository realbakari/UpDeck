import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptToken, decryptToken } from '../../src/security/vault';
import { fetchSnapshot, ping, safeApiUrl } from '../../src/security/up-api';
import {
  periodTransactions,
  roundUpTotal,
  saverLabel,
  summarize,
  type Transaction,
} from '../../src/domain';
import { transactionResource } from '../../src/api-model';

const token = 'up:yeah:test-token-used-only-in-tests';
const passphrase = 'four unrelated words here';
afterEach(() => vi.unstubAllGlobals());
describe('local token vault', () => {
  it('round trips without storing plaintext and randomizes each encryption', async () => {
    const a = await encryptToken(token, passphrase);
    const b = await encryptToken(token, passphrase);
    expect(JSON.stringify(a)).not.toContain(token);
    expect(a.salt).not.toEqual(b.salt);
    expect(a.iv).not.toEqual(b.iv);
    expect(await decryptToken(a, passphrase)).toBe(token);
  });
  it('rejects a wrong passphrase and modified ciphertext', async () => {
    const vault = await encryptToken(token, passphrase);
    await expect(decryptToken(vault, 'not the correct passphrase')).rejects.toThrow();
    vault.ciphertext[0] ^= 1;
    await expect(decryptToken(vault, passphrase)).rejects.toThrow();
  });
  it('rejects weak passphrases and unbounded KDF parameters', async () => {
    await expect(encryptToken(token, 'short')).rejects.toThrow();
    const vault = await encryptToken(token, passphrase);
    await expect(decryptToken({ ...vault, iterations: 2 ** 32 }, passphrase)).rejects.toThrow();
  });
});
describe('bank API boundary', () => {
  it.each([
    'https://evil.example/api/v1/accounts',
    'https://api.up.com.au.evil.example/api/v1/accounts',
    'http://api.up.com.au/api/v1/accounts',
    'https://user:pass@api.up.com.au/api/v1/accounts',
    'https://api.up.com.au/api/v1/payments',
    'https://api.up.com.au/api/v1/accounts#secret',
    '//evil.example/accounts',
  ])('blocks unexpected destinations: %s', (input) => {
    expect(() => safeApiUrl(input)).toThrow();
  });
  it('sends read requests with no cookies, caching or redirect following', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ meta: {} }));
    vi.stubGlobal('fetch', fetcher);
    await ping(token, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://api.up.com.au/api/v1/util/ping'),
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      }),
    );
  });
  it('does not expose response bodies or tokens in auth errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(token, { status: 401 })));
    await expect(ping(token, new AbortController().signal)).rejects.toMatchObject({
      expired: true,
      message: expect.not.stringContaining(token),
    });
  });
  it('blocks malicious pagination before another authenticated request', async () => {
    const fetcher = vi.fn().mockImplementation((url: URL) =>
      Promise.resolve(
        Response.json({
          data: [],
          links: {
            next: url.pathname.endsWith('/accounts') ? 'https://evil.example/steal' : null,
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchSnapshot(token, new AbortController().signal)).rejects.toThrow(
      'unexpected link',
    );
    expect(fetcher.mock.calls.every((call) => call[0].origin === 'https://api.up.com.au')).toBe(
      true,
    );
  });
  it('follows opaque pagination and converts validated integer money', async () => {
    const fetcher = vi.fn().mockImplementation((url: URL) => {
      if (url.pathname.endsWith('/accounts'))
        return Promise.resolve(
          Response.json({
            data: [
              {
                id: 'one',
                attributes: {
                  displayName: 'Everyday',
                  accountType: 'TRANSACTIONAL',
                  ownershipType: 'INDIVIDUAL',
                  balance: { currencyCode: 'AUD', valueInBaseUnits: 12345 },
                },
              },
            ],
            links: { next: null },
          }),
        );
      if (url.pathname.endsWith('/categories'))
        return Promise.resolve(Response.json({ data: [], links: { next: null } }));
      return Promise.resolve(
        Response.json({
          data: [],
          links: {
            next: url.searchParams.has('page[after]')
              ? null
              : 'https://api.up.com.au/api/v1/transactions?page%5Bafter%5D=opaque',
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchSnapshot(token, new AbortController().signal);
    expect(result.accounts[0].balance).toBe(12345);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: 't',
  description: 'Test',
  amount: -100,
  createdAt: '2026-10-01T02:00:00Z',
  category: 'Groceries',
  accountId: 'a',
  pending: false,
  transfer: false,
  ...overrides,
});
describe('money calculations', () => {
  it('excludes own-account transfers, includes held outgoings and excludes held income', () => {
    const result = summarize([
      transaction({ amount: -1234 }),
      transaction({ amount: -500, transfer: true }),
      transaction({ amount: 500, transfer: true }),
      transaction({ amount: -321, pending: true }),
      transaction({ amount: 10000 }),
      transaction({ amount: 150, pending: true }),
    ]);
    expect(result).toEqual({ spent: 1555, incoming: 10000, categories: [['Groceries', 1555]] });
  });
  it('handles an empty history and excludes future transactions', () => {
    expect(summarize([])).toEqual({ spent: 0, incoming: 0, categories: [] });
    expect(
      periodTransactions(
        [
          transaction({ createdAt: '2027-01-01T00:00:00Z' }),
          transaction({ createdAt: '2025-01-01T00:00:00Z' }),
        ],
        30,
        new Date('2026-10-01T00:00:00Z'),
      ),
    ).toEqual([]);
  });
});
describe('fun, but true', () => {
  it('totals Round-Ups from Up transaction details only', () => {
    const details = (cents: number | null) =>
      transactionResource.parse({
        id: 't',
        attributes: {
          description: 'Coffee',
          amount: { currencyCode: 'AUD', valueInBaseUnits: -450 },
          createdAt: '2026-10-01T00:00:00+10:00',
          status: 'SETTLED',
          roundUp:
            cents === null
              ? null
              : { amount: { currencyCode: 'AUD', valueInBaseUnits: cents }, boostPortion: null },
        },
        relationships: { account: { data: { id: 'spend' } } },
      });
    expect(
      roundUpTotal([
        transaction({ details: details(-50) }),
        transaction({ details: details(-125) }),
        transaction({ details: details(null) }),
        transaction({}),
      ]),
    ).toBe(175);
  });
  it('reads the Saver emoji Up stores at the start of the name', () => {
    expect(saverLabel('🏝️ Holiday')).toEqual({ emoji: '🏝️', name: 'Holiday' });
    expect(saverLabel('👩🏽‍💻 New laptop')).toEqual({ emoji: '👩🏽‍💻', name: 'New laptop' });
    expect(saverLabel('Rainy day')).toEqual({ emoji: null, name: 'Rainy day' });
    expect(saverLabel('🐷')).toEqual({ emoji: '🐷', name: '🐷' });
  });
});
