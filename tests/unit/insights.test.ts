import { describe, expect, it } from 'vitest';
import { transactionResource } from '../../src/api-model';
import type { Account, Transaction } from '../../src/domain';
import {
  financialYear,
  findPay,
  findRecurring,
  jointSplit,
  safeToSpend,
  tagTotals,
  transactionsCsv,
  whatChanged,
} from '../../src/insights';

const now = new Date('2026-10-02T12:00:00+10:00');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
let seq = 0;
function tx(description: string, amount: number, ago: number, extra: Partial<Transaction> = {}) {
  return {
    id: `t${seq++}`,
    description,
    amount,
    createdAt: daysAgo(ago),
    category: 'Shopping',
    accountId: 'spend',
    pending: false,
    transfer: false,
    ...extra,
  } satisfies Transaction;
}
const details = (t: Transaction, tags: string[], who?: string) =>
  transactionResource.parse({
    id: t.id,
    attributes: {
      description: t.description,
      amount: { currencyCode: 'AUD', valueInBaseUnits: t.amount },
      createdAt: t.createdAt,
      status: 'SETTLED',
      performingCustomer: who ? { displayName: who } : null,
    },
    relationships: {
      account: { data: { id: t.accountId } },
      tags: { data: tags.map((id) => ({ id })) },
    },
  });

describe('subscription radar', () => {
  it('finds monthly charges, flags a price rise and a stopped subscription', () => {
    const found = findRecurring(
      [
        tx('Spotify', -1299, 64),
        tx('Spotify', -1299, 33),
        tx('Spotify', -1399, 3),
        tx('Stan', -1200, 88),
        tx('Stan', -1200, 58),
      ],
      now,
    );
    const spotify = found.find((r) => r.merchant === 'Spotify');
    expect(spotify).toMatchObject({
      cadence: 'Monthly',
      amount: 1399,
      annual: 16788,
      priceChange: { from: 1299, to: 1399 },
      stopped: false,
    });
    expect(found.find((r) => r.merchant === 'Stan')?.stopped).toBe(true);
  });
  it('ignores irregular shopping and varying amounts', () => {
    const found = findRecurring(
      [
        tx('Woolworths', -8640, 60),
        tx('Woolworths', -4210, 30),
        tx('Woolworths', -12000, 1),
        tx('Bunnings', -5000, 50),
        tx('Bunnings', -5000, 9),
        tx('Everyday Coffee', -650, 14),
        tx('Everyday Coffee', -650, 7),
      ],
      now,
    );
    expect(found).toEqual([]);
  });
  it('never treats incoming money or own-account transfers as a subscription', () => {
    expect(
      findRecurring(
        [
          tx('Rent split', 50000, 61),
          tx('Rent split', 50000, 31),
          tx('Transfer to Rainy day', -5000, 30, { transfer: true }),
          tx('Transfer to Rainy day', -5000, 0, { transfer: true }),
        ],
        now,
      ),
    ).toEqual([]);
  });
});

describe('pay and safe to spend', () => {
  const history = [
    tx('ACME PTY LTD', 285000, 30),
    tx('ACME PTY LTD', 285000, 16),
    tx('ACME PTY LTD', 285000, 2),
    tx('Mum', 2000, 10),
    tx('Netflix', -1899, 25),
    tx('Groceries', -40000, 29),
    tx('Groceries', -30000, 15),
    tx('Groceries', -10000, 1),
  ];
  it('detects a fortnightly pay and the next payday', () => {
    const pay = findPay(history, now);
    expect(pay).toMatchObject({ source: 'ACME PTY LTD', cadence: 'Fortnightly', amount: 285000 });
    expect(pay?.next.toISOString()).toBe(daysAgo(-12));
  });
  it('returns null when there is no regular income', () => {
    expect(findPay([tx('Gift', 5000, 3), tx('Refund', 20000, 40)], now)).toBeNull();
  });
  it('takes bills due before payday out of the spending balance', () => {
    const pay = findPay(history, now)!;
    const accounts: Account[] = [
      { id: 'spend', name: 'Spending', type: 'TRANSACTIONAL', balance: 100000, joint: false },
      { id: 'joint', name: '2Up', type: 'TRANSACTIONAL', balance: 900000, joint: true },
      { id: 'save', name: 'Saver', type: 'SAVER', balance: 500000, joint: false },
    ];
    const netflix = {
      ...findRecurring([tx('Netflix', -1899, 25), tx('Netflix', -1899, 55)], now)[0],
    };
    const result = safeToSpend(accounts, history, pay, [netflix], now);
    expect(result.balance).toBe(100000);
    expect(result.bills).toEqual([expect.objectContaining({ merchant: 'Netflix', amount: 1899 })]);
    expect(result.safe).toBe(100000 - 1899);
    expect(result.daysLeft).toBe(12);
    expect(result.perDay).toBe(Math.floor((100000 - 1899) / 12));
    expect(result.spent).toBe(10000);
    expect(result.typical).toBe(35000);
  });
});

describe('what changed', () => {
  it('names the category, the merchant behind it and the busy weekday', () => {
    const fridays = [1, 8, 15, 22].map((n) => {
      const t = tx('Uber Eats', -3500, n, { category: 'Takeaway' });
      const d = new Date(now);
      d.setDate(d.getDate() - n);
      while (d.getDay() !== 5) d.setDate(d.getDate() - 1);
      return { ...t, createdAt: d.toISOString() };
    });
    const result = whatChanged(
      [
        ...fridays,
        tx('Uber Eats', -3500, 45, { category: 'Takeaway' }),
        tx('Woolworths', -9000, 5, { category: 'Groceries' }),
        tx('Woolworths', -9000, 40, { category: 'Groceries' }),
        tx('Woolworths', -9000, 70, { category: 'Groceries' }),
      ],
      now,
      new Date(daysAgo(89)),
    );
    expect(result?.windows).toBe(2);
    expect(result?.changes[0]).toMatchObject({
      category: 'Takeaway',
      merchant: { name: 'Uber Eats' },
      weekday: 'Fridays',
    });
    expect(result?.changes.some((c) => c.category === 'Groceries')).toBe(false);
  });
  it('needs at least one fully covered earlier window', () => {
    expect(whatChanged([tx('A', -100, 3)], now, new Date(daysAgo(20)))).toBeNull();
  });
});

describe('reports', () => {
  it('uses the Australian financial year', () => {
    expect(financialYear(now).label).toBe('FY 2026–27');
    expect(financialYear(new Date('2027-03-01T00:00:00+11:00')).label).toBe('FY 2026–27');
    expect(financialYear(now, -1).start.getFullYear()).toBe(2025);
  });
  it('totals tags and splits 2Up spending by person', () => {
    const work = tx('Officeworks', -4500, 3);
    const lunch = tx('Lunch', -2000, 2, { accountId: 'joint' });
    const dinner = tx('Dinner', -6000, 1, { accountId: 'joint' });
    const rows = [
      { ...work, details: details(work, ['Work']) },
      { ...lunch, details: details(lunch, ['Work'], 'Alex') },
      { ...dinner, details: details(dinner, [], 'Sam') },
    ];
    expect(tagTotals(rows)).toEqual([{ tag: 'Work', spent: 6500, received: 0, count: 2 }]);
    const [split] = jointSplit(
      [{ id: 'joint', name: '2Up Spending', type: 'TRANSACTIONAL', balance: 0, joint: true }],
      rows,
    );
    expect(split.people).toEqual([
      { name: 'Sam', spent: 6000 },
      { name: 'Alex', spent: 2000 },
    ]);
  });
  it('writes CSV that spreadsheets cannot execute', () => {
    const csv = transactionsCsv(
      [tx('=HYPERLINK("http://evil.example")', -100, 1), tx('Café, "the good one"', -650, 2)],
      new Map([['spend', 'Spending']]),
    );
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'Date,Description,Category,Tags,Amount (AUD),Status,Account,Transaction ID',
    );
    expect(lines[1]).toContain('"Café, ""the good one"""');
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
    expect(lines[2]).toContain(',-1.00,');
  });
});
