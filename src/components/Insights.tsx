import { useMemo, useRef, useState } from 'react';
import { Button } from '@cloudflare/kumo/components/button';
import {
  ArrowDown,
  ArrowUp,
  CalendarBlank,
  DownloadSimple,
  Lightning,
  ShieldCheck,
  UsersThree,
} from '@phosphor-icons/react';
import type { Snapshot, Transaction } from '../domain';
import { saverLabel } from '../domain';
import {
  financialYear,
  findPay,
  findRecurring,
  jointSplit,
  safeToSpend,
  tagTotals,
  transactionsCsv,
  whatChanged,
  type Recurring,
  type SafeToSpend,
} from '../insights';
import { useBank } from '../bank-context';
import { toTransaction } from '../normalize';
import { MerchantIcon } from './MerchantIcon';

type Money = (cents: number) => string;
const shortDate = (date: Date) =>
  date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

/** Shared by Overview and Insights so both read the same numbers. */
export function useInsights(data: Snapshot, now = new Date(data.syncedAt)) {
  return useMemo(() => {
    const coverage = new Date(data.since);
    const recurring = findRecurring(data.transactions, now);
    const pay = findPay(data.transactions, now);
    return {
      recurring,
      pay,
      safe: pay
        ? safeToSpend(data.accounts, data.transactions, pay, recurring, now, coverage)
        : null,
      changed: whatChanged(data.transactions, now, coverage),
      splits: jointSplit(data.accounts, data.transactions),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}

export function SafeToSpendCard({
  safe,
  source,
  money,
  compact = false,
  onMore,
}: {
  safe: SafeToSpend | null;
  source?: string;
  money: Money;
  compact?: boolean;
  onMore?: () => void;
}) {
  if (!safe)
    return (
      <section className="panel safe-card" aria-label="Safe to spend">
        <span className="mini-label">
          <CalendarBlank size={18} />
          Safe to spend
        </span>
        <p className="safe-empty">
          No regular pay found yet. UpDeck looks for income of $100 or more from the same payer, at
          least twice, on a weekly, fortnightly or monthly rhythm.
        </p>
      </section>
    );
  const pace =
    safe.typical === null
      ? null
      : safe.spent <= safe.typical
        ? { ahead: true, by: safe.typical - safe.spent }
        : { ahead: false, by: safe.spent - safe.typical };
  return (
    <section className="panel safe-card" aria-label="Safe to spend">
      <div className="safe-top">
        <span className="mini-label">
          <CalendarBlank size={18} />
          Safe to spend until payday
        </span>
        <span className="safe-payday">
          {safe.daysLeft} {safe.daysLeft === 1 ? 'day' : 'days'} · {shortDate(safe.payday)}
        </span>
      </div>
      <div className="safe-main">
        <strong className={`safe-amount ${safe.safe < 0 ? 'negative' : ''}`}>
          {money(safe.safe)}
        </strong>
        {safe.safe > 0 ? (
          <span>
            about <strong>{money(safe.perDay)}</strong> a day
          </span>
        ) : (
          <span>Bills due before payday are more than your spending balance.</span>
        )}
      </div>
      <p className="safe-maths">
        {money(safe.balance)} in Spending, less {money(safe.billsTotal)} in{' '}
        {safe.bills.length === 1 ? '1 bill' : `${safe.bills.length} bills`} due before{' '}
        {source ? `${source} pays you` : 'payday'}.
      </p>
      {pace && (
        <p className={`safe-pace ${pace.ahead ? 'ahead' : 'behind'}`}>
          {pace.ahead ? <ArrowDown size={15} /> : <ArrowUp size={15} />}
          {pace.by < 500
            ? 'Spending right on your usual pace for this point in the cycle.'
            : pace.ahead
              ? `${money(pace.by)} less than usual by this point in your pay cycle.`
              : `${money(pace.by)} more than usual by this point in your pay cycle.`}
        </p>
      )}
      {!compact && safe.bills.length > 0 && (
        <ul className="safe-bills" aria-label="Bills due before payday">
          {safe.bills.map((bill) => (
            <li key={`${bill.merchant}-${bill.due.getTime()}`}>
              <MerchantIcon name={bill.merchant} category={bill.category} />
              <span>{bill.merchant}</span>
              <span className="muted">{shortDate(bill.due)}</span>
              <strong>{money(bill.amount)}</strong>
            </li>
          ))}
        </ul>
      )}
      {compact && onMore && (
        <button type="button" className="text-link" onClick={onMore}>
          See how this is worked out
        </button>
      )}
    </section>
  );
}

function Subscriptions({ recurring, money }: { recurring: Recurring[]; money: Money }) {
  const active = recurring.filter((r) => !r.stopped);
  const yearly = active.reduce((n, r) => n + r.annual, 0);
  const rises = active.filter((r) => r.priceChange && r.priceChange.to > r.priceChange.from);
  return (
    <section aria-labelledby="subscriptions-title">
      <div className="section-heading">
        <h2 id="subscriptions-title">Subscriptions & bills</h2>
        {active.length > 0 && (
          <span className="muted">
            {active.length} active · {money(yearly)} a year
          </span>
        )}
      </div>
      {rises.length > 0 && (
        <p className="insight-callout" role="note">
          <Lightning size={16} weight="fill" />
          {rises
            .map((r) => `${r.merchant} went up ${money(r.priceChange!.to - r.priceChange!.from)}`)
            .join(' · ')}
          .
        </p>
      )}
      {recurring.length ? (
        <div className="panel recurring-list">
          {recurring.map((r) => (
            <div className={`recurring-row ${r.stopped ? 'stopped' : ''}`} key={r.key}>
              <MerchantIcon name={r.merchant} category={r.category} />
              <div className="recurring-name">
                <strong>{r.merchant}</strong>
                <span>
                  {r.cadence} · {r.count} charges
                  {r.priceChange && ` · was ${money(r.priceChange.from)}`}
                </span>
              </div>
              <div className="recurring-next">
                {r.stopped ? (
                  <span className="status-tag">May have stopped</span>
                ) : (
                  <span>Next {shortDate(r.next)}</span>
                )}
              </div>
              <div className="recurring-amount">
                <strong>{money(r.amount)}</strong>
                <span>{money(r.annual)}/yr</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel empty-copy">
          Nothing regular yet. Subscriptions show up after two charges on a steady rhythm.
        </p>
      )}
    </section>
  );
}

function WhatChanged({
  changed,
  money,
}: {
  changed: ReturnType<typeof whatChanged>;
  money: Money;
}) {
  return (
    <section aria-labelledby="changed-title">
      <div className="section-heading">
        <h2 id="changed-title">What changed</h2>
        {changed && (
          <span className="muted">
            Last 30 days, against the {changed.windows * 30} days before
          </span>
        )}
      </div>
      {!changed ? (
        <p className="panel empty-copy">Comparisons need at least 60 days of history.</p>
      ) : (
        <div className="panel changed-panel">
          <p className="changed-total">
            {money(changed.current)} spent, against a usual {money(changed.usual)}.
          </p>
          {changed.changes.length ? (
            <ul>
              {changed.changes.map((c) => (
                <li key={c.category} className={c.delta > 0 ? 'up' : 'down'}>
                  {c.delta > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                  <span>
                    <strong>
                      {c.category} {c.delta > 0 ? '+' : '−'}
                      {money(Math.abs(c.delta))}
                    </strong>
                    {c.merchant &&
                      (c.delta < 0 && c.merchant.current === 0 ? (
                        <>, no {c.merchant.name} this time</>
                      ) : (
                        <>
                          , mostly {c.merchant.name}
                          {c.weekday && ` on ${c.weekday}`}
                        </>
                      ))}
                    . Usually {money(c.usual)}.
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing moved much.</p>
          )}
        </div>
      )}
    </section>
  );
}

function TwoUp({ splits, money }: { splits: ReturnType<typeof jointSplit>; money: Money }) {
  if (!splits.length) return null;
  return (
    <section aria-labelledby="twoup-title">
      <div className="section-heading">
        <h2 id="twoup-title">2Up split</h2>
        <span className="muted">Last 90 days</span>
      </div>
      {splits.map(({ account, total, people }) => (
        <div className="panel twoup-panel" key={account.id}>
          <span className="mini-label">
            <UsersThree size={18} />
            {saverLabel(account.name).name} · {money(total)} spent
          </span>
          <div className="split-bar" aria-hidden="true">
            {people.map((p, i) => (
              <span key={p.name} className={`split-${i % 4}`} style={{ flexGrow: p.spent }} />
            ))}
          </div>
          <ul>
            {people.map((p, i) => (
              <li key={p.name}>
                <i className={`split-${i % 4}`} />
                {p.name}
                <strong>{money(p.spent)}</strong>
                <span className="muted">{Math.round((p.spent / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

const MAX_PAGES = 60;
function YearReport({ data, money }: { data: Snapshot; money: Money }) {
  const { call, demo } = useBank();
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [partial, setPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const year = financialYear(new Date(data.syncedAt), offset);
  const totals = useMemo(() => (rows ? tagTotals(rows) : []), [rows]);
  async function load(nextOffset: number) {
    const version = ++epoch.current;
    setOffset(nextOffset);
    setRows(null);
    setError('');
    setBusy(true);
    const fy = financialYear(new Date(data.syncedAt), nextOffset);
    try {
      const catalog = await call({ op: 'categories' });
      const names = new Map(
        catalog.kind === 'categories'
          ? catalog.page.data.map((c) => [c.id, c.attributes.name])
          : [],
      );
      const loaded: Transaction[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const result = await call({
          op: 'transactions',
          pageSize: 100,
          cursor,
          since: fy.start.toISOString(),
          until: new Date(Math.min(fy.end.getTime(), Date.now())).toISOString(),
        });
        if (result.kind !== 'transactions' || version !== epoch.current) return;
        loaded.push(...result.page.data.map((t) => toTransaction(t, names)));
        cursor = result.page.links.next ?? undefined;
        pages++;
      } while (cursor && pages < MAX_PAGES);
      setPartial(Boolean(cursor));
      setRows(loaded);
    } catch (e) {
      if (version === epoch.current)
        setError(e instanceof Error ? e.message : 'Couldn’t load the financial year. Try again.');
    } finally {
      if (version === epoch.current) setBusy(false);
    }
  }
  function download() {
    if (!rows) return;
    const names = new Map(data.accounts.map((a) => [a.id, saverLabel(a.name).name]));
    const blob = new Blob(['﻿', transactionsCsv(rows, names)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `updeck-${year.label.replace(/\W+/g, '-').toLowerCase()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return (
    <section aria-labelledby="report-title">
      <div className="section-heading">
        <h2 id="report-title">Tax time & tags</h2>
        <div className="period-control" aria-label="Financial year">
          {[0, -1].map((value) => (
            <button
              key={value}
              aria-pressed={offset === value}
              disabled={busy}
              onClick={() => void load(value)}
            >
              {financialYear(new Date(data.syncedAt), value).label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel report-panel">
        <p className="muted">
          Totals for each tag across the Australian financial year (1 July to 30 June), plus a CSV
          of every transaction for your accountant or spreadsheet. Tag work expenses in Up and
          they’ll add up here.
        </p>
        {!rows && !busy && (
          <Button className="primary-button" onClick={() => void load(offset)}>
            Load {year.label}
          </Button>
        )}
        {busy && (
          <p className="plain-note" role="status">
            Loading {year.label} from {demo ? 'sample data' : 'Up'}…
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {rows && (
          <>
            <p>
              <strong>{rows.length}</strong> transactions in {year.label}
              {partial && ' (stopped at 6,000; export covers what loaded)'}.
            </p>
            {totals.length ? (
              <table className="report-table">
                <thead>
                  <tr>
                    <th scope="col">Tag</th>
                    <th scope="col">Transactions</th>
                    <th scope="col">Spent</th>
                    <th scope="col">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((t) => (
                    <tr key={t.tag}>
                      <th scope="row">{t.tag}</th>
                      <td>{t.count}</td>
                      <td>{money(t.spent)}</td>
                      <td>{t.received ? money(t.received) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No tagged transactions in this year yet.</p>
            )}
            <Button variant="secondary" onClick={download}>
              <DownloadSimple size={16} />
              Download CSV
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

export function Insights({ data, money }: { data: Snapshot; money: Money }) {
  const { recurring, pay, safe, changed, splits } = useInsights(data);
  return (
    <div className="insights">
      <SafeToSpendCard safe={safe} source={pay?.source} money={money} />
      <Subscriptions recurring={recurring} money={money} />
      <WhatChanged changed={changed} money={money} />
      <TwoUp splits={splits} money={money} />
      <YearReport data={data} money={money} />
      <p className="plain-note">
        <ShieldCheck size={18} />
        Worked out in your browser from your Up data. Nothing here is sent anywhere.
      </p>
    </div>
  );
}
