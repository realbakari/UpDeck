import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@cloudflare/kumo/components/input';
import { Button } from '@cloudflare/kumo/components/button';
import { MagnifyingGlass, ArrowsClockwise } from '@phosphor-icons/react';
import { useBank } from '../bank-context';
import { type Account, type Transaction, summarize } from '../domain';
import type { Category, Operation } from '../api-model';
import { toTransaction } from '../normalize';
import { TransactionList } from './TransactionList';

export function BankTransactions({
  accounts,
  money,
  onSelect,
  initialAccount = '',
  initialTag = '',
  revision,
}: {
  accounts: Account[];
  money: (n: number) => string;
  onSelect: (id: string) => void;
  initialAccount?: string;
  initialTag?: string;
  revision: number;
}) {
  const { call } = useBank();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [account, setAccount] = useState(initialAccount);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState(initialTag);
  const [search, setSearch] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [days, setDays] = useState(30);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const version = ++epoch.current;
      setBusy(true);
      setError('');
      try {
        let catalog = categories;
        if (!catalog.length) {
          const result = await call({ op: 'categories' });
          if (result.kind === 'categories') {
            catalog = result.page.data;
            if (version === epoch.current) setCategories(catalog);
          }
        }
        const from = since
          ? new Date(`${since}T00:00:00`)
          : days
            ? new Date(new Date().setHours(0, 0, 0, 0))
            : null;
        if (from && !since) from.setDate(from.getDate() - days + 1);
        const operation: Operation = {
          op: 'transactions',
          pageSize: 50,
          cursor,
          accountId: account || undefined,
          category: category || undefined,
          tag: tag.trim() || undefined,
          status: status === 'HELD' || status === 'SETTLED' ? status : undefined,
          since: from?.toISOString(),
          until: until ? new Date(`${until}T23:59:59.999`).toISOString() : undefined,
        };
        const result = await call(operation);
        if (version !== epoch.current || result.kind !== 'transactions') return;
        const names = new Map(catalog.map((c) => [c.id, c.attributes.name]));
        const incoming = result.page.data.map((t) => toTransaction(t, names));
        setRows((old) =>
          cursor ? [...new Map([...old, ...incoming].map((t) => [t.id, t])).values()] : incoming,
        );
        setNext(result.page.links.next);
      } catch (e) {
        if (version === epoch.current)
          setError(e instanceof Error ? e.message : 'Couldn’t load transactions. Try again.');
      } finally {
        if (version === epoch.current) setBusy(false);
      }
    },
    [call, account, status, category, tag, since, until, days, categories],
  );
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, [account, status, category, days, revision]);
  const visible = rows.filter((t) =>
    `${t.description} ${t.category} ${t.details?.attributes.rawText ?? ''} ${t.details?.relationships.tags.data.map((t) => t.id).join(' ') ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const totals = summarize(rows);
  return (
    <>
      <div className="flow-summary">
        <div>
          <span>Money in {next ? '(loaded)' : ''}</span>
          <h2>{money(totals.incoming)}</h2>
        </div>
        <div>
          <span>Money out {next ? '(loaded)' : ''}</span>
          <h2>{money(totals.spent)}</h2>
        </div>
        <div>
          <span>Difference</span>
          <h2>{money(totals.incoming - totals.spent)}</h2>
        </div>
      </div>
      <p className="plain-note">
        {next
          ? 'More history is available. Totals and merchant search cover loaded transactions only.'
          : 'All transactions for these filters are loaded.'}{' '}
        Own-account transfers are excluded from totals. Pending outgoings and incoming refunds are
        included.
      </p>
      <div className="transaction-toolbar">
        <div className="search-field">
          <MagnifyingGlass size={18} />
          <Input
            aria-label="Search transactions"
            placeholder="Search loaded merchants, categories, tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="period-control" aria-label="History period">
          {[7, 30, 90, 0].map((value) => (
            <button
              key={value}
              aria-pressed={days === value}
              onClick={() => {
                setSince('');
                setUntil('');
                setDays(value);
              }}
            >
              {value ? `${value} days` : 'All time'}
            </button>
          ))}
        </div>
      </div>
      <form
        className="bank-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Account
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.joint ? ' · 2Up' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Held & settled</option>
            <option value="HELD">Pending</option>
            <option value="SETTLED">Settled</option>
          </select>
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.relationships.parent.data ? '↳ ' : ''}
                {c.attributes.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          maxLength={100}
          placeholder="Exact tag name"
        />
        <Input
          label="From"
          type="date"
          value={since}
          onChange={(e) => {
            setSince(e.target.value);
            setDays(0);
          }}
        />
        <Input
          label="To"
          type="date"
          value={until}
          onChange={(e) => {
            setUntil(e.target.value);
            setDays(0);
          }}
        />
        <Button type="submit" variant="secondary" disabled={busy}>
          <ArrowsClockwise size={16} />
          {busy ? 'Loading…' : 'Apply filters'}
        </Button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="results-caption">
        {visible.length} matching transactions · {rows.length} loaded
        {next ? ' · More available' : ''}
      </div>
      <TransactionList transactions={visible} money={money} onSelect={onSelect} />
      {next && (
        <div className="load-more">
          <Button variant="secondary" disabled={busy} onClick={() => void load(next)}>
            {busy ? 'Loading…' : 'Load older transactions'}
          </Button>
        </div>
      )}
    </>
  );
}
