// On-device analysis of an Up snapshot. Everything here is pure and runs in the browser:
// no transaction, merchant or amount ever leaves the device to produce these insights.
import type { Account, Transaction } from './domain';

const DAY = 86_400_000;
const days = (ms: number) => ms / DAY;
const at = (t: Transaction) => new Date(t.createdAt).getTime();
const outgoing = (t: Transaction) => !t.transfer && t.amount < 0;
export const merchantKey = (description: string) =>
  description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

type Cadence = { days: number; label: string; perYear: number };
const CADENCES: Cadence[] = [
  { days: 7, label: 'Weekly', perYear: 52 },
  { days: 14, label: 'Fortnightly', perYear: 26 },
  { days: 30.44, label: 'Monthly', perYear: 12 },
  { days: 91.31, label: 'Quarterly', perYear: 4 },
];
/** A series is regular only when every gap is close to one standard cadence. */
function cadenceOf(gaps: number[]): Cadence | null {
  if (!gaps.length) return null;
  const typical = median(gaps);
  const cadence = CADENCES.find((c) => Math.abs(typical - c.days) <= Math.max(2, c.days * 0.12));
  if (!cadence) return null;
  const tolerance = Math.max(3, cadence.days * 0.2);
  return gaps.every((gap) => Math.abs(gap - cadence.days) <= tolerance) ? cadence : null;
}
/** Groups by merchant and keeps one charge per day, oldest first. */
function series(transactions: Transaction[]) {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = merchantKey(t.description);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const sorted = items.sort((a, b) => at(a) - at(b));
    const daily = sorted.filter(
      (t, i) =>
        i === 0 ||
        new Date(t.createdAt).toDateString() !== new Date(sorted[i - 1].createdAt).toDateString(),
    );
    return { key, items: daily };
  });
}

export type Recurring = {
  key: string;
  merchant: string;
  category: string;
  amount: number;
  cadence: string;
  cadenceDays: number;
  annual: number;
  count: number;
  last: Date;
  next: Date;
  priceChange: { from: number; to: number } | null;
  stopped: boolean;
};
/** Subscriptions and bills: same merchant, regular gaps, steady amounts. */
export function findRecurring(transactions: Transaction[], now = new Date()): Recurring[] {
  const found: Recurring[] = [];
  for (const { key, items } of series(transactions.filter(outgoing))) {
    if (items.length < 2) continue;
    const gaps = items.slice(1).map((t, i) => days(at(t) - at(items[i])));
    const cadence = cadenceOf(gaps);
    if (!cadence) continue;
    // Weekly habits (a Friday coffee) need more evidence than a monthly bill.
    if (cadence.days < 10 && items.length < 3) continue;
    const amounts = items.map((t) => -t.amount);
    const typical = median(amounts);
    const spread = cadence.days < 10 ? 0.05 : 0.2;
    if (!amounts.every((a) => Math.abs(a - typical) <= typical * spread)) continue;
    const latest = items[items.length - 1];
    const previous = items[items.length - 2];
    const amount = -latest.amount;
    const before = -previous.amount;
    const next = new Date(at(latest) + cadence.days * DAY);
    found.push({
      key,
      merchant: latest.description,
      category: latest.category,
      amount,
      cadence: cadence.label,
      cadenceDays: cadence.days,
      annual: Math.round(amount * cadence.perYear),
      count: items.length,
      last: new Date(at(latest)),
      next,
      priceChange: amount !== before ? { from: before, to: amount } : null,
      stopped: days(now.getTime() - next.getTime()) > Math.max(5, cadence.days * 0.5),
    });
  }
  return found.sort((a, b) => b.annual - a.annual);
}

export type Pay = {
  source: string;
  amount: number;
  cadence: string;
  cadenceDays: number;
  last: Date;
  next: Date;
};
/** Regular income of at least $100 from the same payer. Picks the biggest yearly earner. */
export function findPay(transactions: Transaction[], now = new Date()): Pay | null {
  const incoming = transactions.filter(
    (t) => !t.transfer && !t.pending && t.amount >= 10_000 && at(t) <= now.getTime(),
  );
  let best: (Pay & { yearly: number }) | null = null;
  for (const { items } of series(incoming)) {
    if (items.length < 2) continue;
    const gaps = items.slice(1).map((t, i) => days(at(t) - at(items[i])));
    const cadence = cadenceOf(gaps);
    if (!cadence || cadence.days > 31) continue;
    const amounts = items.map((t) => t.amount);
    const typical = median(amounts);
    if (!amounts.every((a) => Math.abs(a - typical) <= typical * 0.35)) continue;
    const latest = items[items.length - 1];
    let next = at(latest) + cadence.days * DAY;
    // A late or skipped pay rolls forward rather than showing a date in the past.
    while (next <= now.getTime()) next += cadence.days * DAY;
    const yearly = typical * cadence.perYear;
    if (!best || yearly > best.yearly)
      best = {
        source: latest.description,
        amount: latest.amount,
        cadence: cadence.label,
        cadenceDays: cadence.days,
        last: new Date(at(latest)),
        next: new Date(next),
        yearly,
      };
  }
  if (!best) return null;
  const { yearly: _yearly, ...pay } = best;
  return pay;
}

export type SafeToSpend = {
  balance: number;
  bills: { merchant: string; category: string; amount: number; due: Date }[];
  billsTotal: number;
  safe: number;
  perDay: number;
  daysLeft: number;
  payday: Date;
  spent: number;
  typical: number | null;
};
/**
 * What's left in personal spending accounts after recurring charges due before the next pay,
 * spread over the days until then. Pace compares this cycle with earlier cycles at the same point.
 */
export function safeToSpend(
  accounts: Account[],
  transactions: Transaction[],
  pay: Pay,
  recurring: Recurring[],
  now = new Date(),
  coverageStart?: Date,
): SafeToSpend {
  const balance = accounts
    .filter((a) => a.type === 'TRANSACTIONAL' && !a.joint)
    .reduce((n, a) => n + a.balance, 0);
  const until = pay.next.getTime();
  const bills: SafeToSpend['bills'] = [];
  for (const r of recurring) {
    if (r.stopped) continue;
    for (let due = r.next.getTime(); due <= until; due += r.cadenceDays * DAY)
      if (due > now.getTime())
        bills.push({
          merchant: r.merchant,
          category: r.category,
          amount: r.amount,
          due: new Date(due),
        });
  }
  bills.sort((a, b) => a.due.getTime() - b.due.getTime());
  const billsTotal = bills.reduce((n, b) => n + b.amount, 0);
  const safe = balance - billsTotal;
  // Calendar days, so "12 days" matches the date shown beside it.
  const midnight = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const daysLeft = Math.max(1, Math.round(days(midnight(until) - midnight(now.getTime()))));
  const spentBetween = (from: number, to: number) =>
    transactions
      .filter((t) => outgoing(t) && at(t) >= from && at(t) < to)
      .reduce((n, t) => n - t.amount, 0);
  const start = pay.last.getTime();
  const elapsed = now.getTime() - start;
  const earliest = coverageStart?.getTime() ?? Math.min(...transactions.map(at));
  const earlier: number[] = [];
  for (let k = 1; k <= 6; k++) {
    const from = start - k * pay.cadenceDays * DAY;
    if (from < earliest) break;
    earlier.push(spentBetween(from, from + elapsed));
  }
  return {
    balance,
    bills,
    billsTotal,
    safe,
    perDay: safe > 0 ? Math.floor(safe / daysLeft) : 0,
    daysLeft,
    payday: pay.next,
    spent: spentBetween(start, now.getTime() + 1),
    typical: earlier.length
      ? Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length)
      : null,
  };
}

export type Change = {
  category: string;
  current: number;
  usual: number;
  delta: number;
  merchant: { name: string; delta: number; current: number } | null;
  weekday: string | null;
};
const WEEKDAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];
/**
 * The last 30 days against the average of earlier 30-day windows the snapshot fully covers.
 * Reports the categories that moved most, the merchant behind each move, and its busiest weekday.
 */
export function whatChanged(
  transactions: Transaction[],
  now = new Date(),
  coverageStart?: Date,
  windowDays = 30,
): { current: number; usual: number; windows: number; changes: Change[] } | null {
  const end = now.getTime();
  const span = windowDays * DAY;
  const earliest = (coverageStart?.getTime() ?? Math.min(...transactions.map(at))) - DAY;
  const inWindow = (k: number) =>
    transactions.filter(
      (t) => outgoing(t) && at(t) > end - (k + 1) * span && at(t) <= end - k * span,
    );
  const baselines: Transaction[][] = [];
  for (let k = 1; k <= 3 && end - (k + 1) * span >= earliest; k++) baselines.push(inWindow(k));
  if (!baselines.length) return null;
  const current = inWindow(0);
  const sumBy = (items: Transaction[], key: (t: Transaction) => string) => {
    const totals = new Map<string, number>();
    for (const t of items) totals.set(key(t), (totals.get(key(t)) ?? 0) - t.amount);
    return totals;
  };
  const average = (key: (t: Transaction) => string) => {
    const totals = new Map<string, number>();
    for (const window of baselines)
      for (const [k, v] of sumBy(window, key))
        totals.set(k, (totals.get(k) ?? 0) + v / baselines.length);
    return totals;
  };
  const nowByCategory = sumBy(current, (t) => t.category);
  const usualByCategory = average((t) => t.category);
  const nowByMerchant = sumBy(current, (t) => `${t.category}\u0000${t.description}`);
  const usualByMerchant = average((t) => `${t.category}\u0000${t.description}`);
  const changes: Change[] = [];
  for (const category of new Set([...nowByCategory.keys(), ...usualByCategory.keys()])) {
    const cur = nowByCategory.get(category) ?? 0;
    const usual = Math.round(usualByCategory.get(category) ?? 0);
    const delta = cur - usual;
    if (Math.abs(delta) < Math.max(2000, usual * 0.2)) continue;
    let merchant: Change['merchant'] = null;
    for (const key of new Set([...nowByMerchant.keys(), ...usualByMerchant.keys()])) {
      const [cat, name] = key.split('\u0000');
      if (cat !== category) continue;
      const d = (nowByMerchant.get(key) ?? 0) - Math.round(usualByMerchant.get(key) ?? 0);
      if (
        Math.sign(d) === Math.sign(delta) &&
        (!merchant || Math.abs(d) > Math.abs(merchant.delta))
      )
        merchant = { name, delta: d, current: nowByMerchant.get(key) ?? 0 };
    }
    let weekday: string | null = null;
    if (merchant && delta > 0) {
      const visits = current.filter(
        (t) => t.category === category && t.description === merchant?.name,
      );
      const byDay = sumBy(visits, (t) => String(new Date(t.createdAt).getDay()));
      const total = visits.reduce((n, t) => n - t.amount, 0);
      const [day, spend] = [...byDay].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (visits.length >= 3 && day !== undefined && spend >= total * 0.5)
        weekday = WEEKDAYS[Number(day)];
    }
    changes.push({ category, current: cur, usual, delta, merchant, weekday });
  }
  const total = (items: Transaction[]) => items.reduce((n, t) => n - t.amount, 0);
  return {
    current: total(current),
    usual: Math.round(baselines.reduce((n, w) => n + total(w), 0) / baselines.length),
    windows: baselines.length,
    changes: changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4),
  };
}

/** Australian financial year: 1 July to 30 June. `offset` -1 is last financial year. */
export function financialYear(now = new Date(), offset = 0) {
  const startYear = (now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1) + offset;
  const start = new Date(startYear, 6, 1);
  const end = new Date(startYear + 1, 5, 30, 23, 59, 59, 999);
  return { start, end, label: `FY ${startYear}–${String(startYear + 1).slice(2)}` };
}
const tagsOf = (t: Transaction) => t.details?.relationships.tags.data.map((tag) => tag.id) ?? [];
export function tagTotals(transactions: Transaction[]) {
  const totals = new Map<string, { tag: string; spent: number; received: number; count: number }>();
  for (const t of transactions) {
    if (t.transfer) continue;
    for (const tag of tagsOf(t)) {
      const row = totals.get(tag) ?? { tag, spent: 0, received: 0, count: 0 };
      if (t.amount < 0) row.spent -= t.amount;
      else row.received += t.amount;
      row.count++;
      totals.set(tag, row);
    }
  }
  return [...totals.values()].sort((a, b) => b.spent - a.spent);
}

/** Who spent what on 2Up, using the customer Up records against each joint transaction. */
export function jointSplit(accounts: Account[], transactions: Transaction[]) {
  return accounts
    .filter((a) => a.joint && a.type === 'TRANSACTIONAL')
    .map((account) => {
      const people = new Map<string, number>();
      for (const t of transactions)
        if (t.accountId === account.id && outgoing(t)) {
          const who = t.details?.attributes.performingCustomer?.displayName ?? 'Unknown';
          people.set(who, (people.get(who) ?? 0) - t.amount);
        }
      const total = [...people.values()].reduce((a, b) => a + b, 0);
      return {
        account,
        total,
        people: [...people]
          .map(([name, spent]) => ({ name, spent }))
          .sort((a, b) => b.spent - a.spent),
      };
    })
    .filter((split) => split.total > 0);
}

// Spreadsheet apps execute cells that start with these characters as formulas.
const FORMULA = /^[=+\-@\t\r]/;
const cell = (value: string) => {
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};
/** CSV for spreadsheets and accountants, guarded against formula injection from merchant names. */
export function transactionsCsv(transactions: Transaction[], accountNames: Map<string, string>) {
  const header = [
    'Date',
    'Description',
    'Category',
    'Tags',
    'Amount (AUD)',
    'Status',
    'Account',
    'Transaction ID',
  ];
  const rows = [...transactions]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((t) => [
      new Date(t.createdAt).toISOString().slice(0, 10),
      t.description,
      t.category,
      tagsOf(t).join('; '),
      (t.amount / 100).toFixed(2),
      t.pending ? 'Held' : 'Settled',
      accountNames.get(t.accountId) ?? t.accountId,
      t.id,
    ]);
  return [header, ...rows]
    .map((row) => row.map((v, i) => (i === 4 ? v : cell(v))).join(','))
    .join('\r\n');
}
