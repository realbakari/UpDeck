import { transactionResource } from './api-model';
import type { Snapshot, Transaction } from './domain';

type Extra = { account?: string; tags?: string[]; who?: string; pending?: boolean; at?: Date };
/** Builds the Up resource a real transaction would carry: Round-Up, tags and who paid. */
function withDetails(t: Transaction, extra: Extra): Transaction {
  const cents = Math.abs(t.amount) % 100;
  const roundUp = t.amount < 0 && cents && t.accountId === 'spend';
  const details = transactionResource.parse({
    id: t.id,
    attributes: {
      description: t.description,
      amount: { currencyCode: 'AUD', valueInBaseUnits: t.amount },
      createdAt: t.createdAt,
      status: t.pending ? 'HELD' : 'SETTLED',
      roundUp: roundUp
        ? { amount: { currencyCode: 'AUD', valueInBaseUnits: cents - 100 }, boostPortion: null }
        : null,
      performingCustomer: extra.who ? { displayName: extra.who } : null,
    },
    relationships: {
      account: { data: { id: t.accountId } },
      tags: { data: (extra.tags ?? []).map((id) => ({ id })) },
    },
  });
  return { ...t, details };
}

export function demoSnapshot(now = new Date()): Snapshot {
  const transactions: Transaction[] = [];
  const add = (
    description: string,
    category: string,
    amount: number,
    daysAgo: number,
    hour: number,
    extra: Extra = {},
  ) => {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, 12, 0, 0);
    if (date >= now) date.setTime(now.getTime() - (transactions.length + 2) * 60_000);
    if (extra.at) date.setTime(extra.at.getTime());
    const t: Transaction = {
      id: `demo-${transactions.length}`,
      description,
      category,
      amount,
      createdAt: date.toISOString(),
      accountId: extra.account ?? 'spend',
      pending: extra.pending ?? false,
      transfer: false,
    };
    transactions.push(withDetails(t, extra));
  };
  // Everyday spending: eleven places on rotation, amounts that wobble like real life.
  const everyday: [string, string, number, Extra?][] = [
    ['Woolworths', 'Groceries', 8640],
    ['Onda bar & eatery', 'Pubs & bars', 4850],
    ['Myki top up', 'Public transport', 2500, { tags: ['Work travel'] }],
    ['Coles', 'Groceries', 4275],
    ['Market Lane', 'Restaurants & cafes', 580],
    ['Cinema Nova', 'Events & gigs', 2400],
    ['IKEA', 'Homeware', 4300],
    ['Officeworks', 'Technology', 3890, { tags: ['Work'] }],
    ['Readings', 'Books & news', 2995],
    ['Chemist Warehouse', 'Health & medical', 2160],
    ['Lune Croissanterie', 'Restaurants & cafes', 1250],
  ];
  for (let i = 1; i < 88; i++) {
    const [description, category, base, extra] = everyday[i % everyday.length];
    const wobble = 0.75 + ((i * 37) % 50) / 100;
    add(description, category, -Math.round((base * wobble) / 5) * 5, i, 9 + (i % 9), extra);
  }
  // Pay lands every second Thursday.
  for (const ago of [2, 16, 30, 44, 58, 72, 86])
    add('ACME Studio Pty Ltd', 'Income', 285000, ago, 6);
  // Subscriptions and bills: Spotify went up, Stan quietly stopped.
  for (const [ago, amount] of [
    [64, 1299],
    [33, 1299],
    [3, 1399],
  ])
    add('Spotify', 'TV, music & streaming', -amount, ago, 4);
  for (const ago of [73, 42, 12]) add('Netflix', 'TV, music & streaming', -1899, ago, 4);
  for (const ago of [83, 52, 22]) add('Aussie Broadband', 'Internet', -8900, ago, 7);
  for (const ago of [89, 75, 61, 47, 33, 19, 5])
    add('Anytime Fitness', 'Fitness & wellbeing', -3295, ago, 5);
  for (const ago of [88, 58]) add('Stan', 'TV, music & streaming', -1200, ago, 4);
  add('AGL Energy', 'Utilities', -31800, 80, 8);
  // Friday takeaway crept up this month.
  for (let ago = 0; ago < 88; ago++) {
    const day = new Date(now);
    day.setDate(day.getDate() - ago);
    if (day.getDay() === 5 && (ago < 30 || ago % 4 === 0))
      add('Uber Eats', 'Takeaway', -(3295 + ((ago * 53) % 900)), ago, 19);
  }
  // 2Up: two people, one joint spending account.
  for (let i = 0; i < 12; i++)
    add(
      i % 3 ? 'Coles' : 'Dan Murphy’s',
      i % 3 ? 'Groceries' : 'Booze',
      -(6400 + ((i * 71) % 2600)),
      2 + i * 7,
      17,
      { account: 'joint', who: i % 2 ? 'Sam' : 'Alex' },
    );
  // The most recent purchase is a coffee that's still pending.
  add('Everyday Coffee', 'Restaurants & cafes', -650, 0, 8, {
    pending: true,
    at: new Date(now.getTime() - 60_000),
  });
  transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const since = new Date(now);
  since.setDate(since.getDate() - 89);
  since.setHours(0, 0, 0, 0);
  return {
    accounts: [
      { id: 'spend', name: 'Spending', type: 'TRANSACTIONAL', balance: 124650, joint: false },
      { id: 'joint', name: '2Up Spending', type: 'TRANSACTIONAL', balance: 41250, joint: true },
      { id: 'japan', name: '🍜 Tokyo ramen tour', type: 'SAVER', balance: 324000, joint: false },
      { id: 'rain', name: '☔ Rainy day', type: 'SAVER', balance: 500000, joint: false },
      { id: 'home', name: '🏡 House deposit', type: 'SAVER', balance: 1865000, joint: false },
      { id: 'gifts', name: '🎁 Birthdays', type: 'SAVER', balance: 18000, joint: false },
      { id: 'rego', name: '🚗 Rego', type: 'SAVER', balance: 4210, joint: false },
      { id: 'gig', name: '🎟️ Festival', type: 'SAVER', balance: 0, joint: false },
    ],
    transactions,
    syncedAt: now.toISOString(),
    since: since.toISOString(),
  };
}
