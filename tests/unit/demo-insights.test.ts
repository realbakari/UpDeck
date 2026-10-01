import { expect, it } from 'vitest';
import { demoSnapshot } from '../../src/demo';
import {
  findPay,
  findRecurring,
  jointSplit,
  safeToSpend,
  tagTotals,
  whatChanged,
} from '../../src/insights';

it('sample data exercises every insight', () => {
  const now = new Date('2026-10-02T12:00:00+10:00');
  const data = demoSnapshot(now);
  const recurring = findRecurring(data.transactions, now);
  expect(recurring.map((r) => r.merchant).sort()).toEqual(
    ['Aussie Broadband', 'Anytime Fitness', 'Netflix', 'Spotify', 'Stan'].sort(),
  );
  expect(recurring.find((r) => r.merchant === 'Spotify')?.priceChange).toEqual({
    from: 1299,
    to: 1399,
  });
  expect(recurring.find((r) => r.merchant === 'Stan')?.stopped).toBe(true);
  const pay = findPay(data.transactions, now);
  expect(pay?.source).toBe('ACME Studio Pty Ltd');
  const safe = safeToSpend(
    data.accounts,
    data.transactions,
    pay!,
    recurring,
    now,
    new Date(data.since),
  );
  expect(safe.bills.length).toBeGreaterThan(0);
  expect(safe.typical).not.toBeNull();
  const changed = whatChanged(data.transactions, now, new Date(data.since));
  expect(changed?.changes.find((c) => c.category === 'Takeaway')?.weekday).toBe('Fridays');
  expect(tagTotals(data.transactions).map((t) => t.tag)).toEqual(
    expect.arrayContaining(['Work', 'Work travel']),
  );
  expect(
    jointSplit(data.accounts, data.transactions)[0]
      .people.map((p) => p.name)
      .sort(),
  ).toEqual(['Alex', 'Sam']);
});
