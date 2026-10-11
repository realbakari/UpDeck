import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowUpRight,
  ArrowsClockwise,
  Check,
  Coins,
  CreditCard,
  Eye,
  EyeSlash,
  GearSix,
  House,
  LockKey,
  MagnifyingGlass,
  Moon,
  PiggyBank,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  Info,
  Target,
  TrendUp,
  Wallet,
  X,
} from '@phosphor-icons/react';
import { BankProvider } from './bank-context';
import { BankTransactions } from './components/BankTransactions';
import { Accounts, CategoriesAndTags, Receipts } from './components/BankLibrary';
import { Connections } from './components/Connections';
import { TransactionDetails } from './components/TransactionDetails';
import { TransactionList } from './components/TransactionList';
import { toTransaction } from './normalize';
import { Bank, ChartLineUp, Paperclip, Tag, PlugsConnected } from '@phosphor-icons/react';
import { Insights, SafeToSpendCard, useInsights } from './components/Insights';
import { demoSnapshot } from './demo';
import { isExtension, onSessionLocked, send } from './bridge';
import {
  money,
  periodTransactions,
  roundUpTotal,
  saverLabel,
  summarize,
  tokenSchema,
  passphraseSchema,
  type Account,
  type Snapshot,
  type Transaction,
} from './domain';
import { SpendingChart } from './components/SpendingChart';
import { version } from '../package.json';
import { applyTheme, followSystemTheme, readTheme, saveTheme } from './theme';

type Page =
  | 'Overview'
  | 'Insights'
  | 'Transactions'
  | 'Savers'
  | 'Accounts'
  | 'Receipts'
  | 'Categories & tags'
  | 'Connections'
  | 'Settings';
type Session =
  { kind: 'locked' } | { kind: 'demo'; data: Snapshot } | { kind: 'live'; data: Snapshot };
type Plan = { id: string; target: number };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const demoTargets: Plan[] = [
  { id: 'japan', target: 500000 },
  { id: 'rain', target: 500000 },
  { id: 'home', target: 2500000 },
];
const nav = [
  { name: 'Overview', icon: House },
  { name: 'Insights', icon: ChartLineUp },
  { name: 'Transactions', icon: ArrowsClockwise },
  { name: 'Savers', icon: PiggyBank },
  { name: 'Accounts', icon: Bank },
  { name: 'Receipts', icon: Paperclip },
  { name: 'Categories & tags', icon: Tag },
  { name: 'Connections', icon: PlugsConnected },
] satisfies { name: Page; icon: typeof House }[];
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';

export default function App() {
  const [session, setSession] = useState<Session>(() =>
    isExtension ? { kind: 'locked' } : { kind: 'demo', data: demoSnapshot() },
  );
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [transactionRevision, setTransactionRevision] = useState(0);
  const [historyAccount, setHistoryAccount] = useState('');
  const [historyTag, setHistoryTag] = useState('');
  const [page, setPage] = useState<Page>('Overview');
  const [configured, setConfigured] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [plans, setPlans] = useState<Plan[]>(isExtension ? [] : demoTargets);
  const [goal, setGoal] = useState<Account | null>(null);
  const [goalValue, setGoalValue] = useState('');
  const [goalError, setGoalError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.dataset.mode === 'dark');
  useEffect(() => {
    const stop = followSystemTheme();
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.dataset.mode === 'dark'),
    );
    observer.observe(document.documentElement, { attributeFilter: ['data-mode'] });
    applyTheme(readTheme());
    return () => {
      stop();
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (transactionId) window.scrollTo({ top: 0 });
  }, [transactionId]);
  const requestEpoch = useRef(0);
  const viewMoney = (amount: number) => (hidden ? '••••' : money(amount));
  const clear = useCallback(() => {
    requestEpoch.current++;
    setSession({ kind: 'locked' });
    setTransactionId(null);
    setHistoryAccount('');
    setHistoryTag('');
    setPlans([]);
    setGoal(null);
    setGoalValue('');
    setGoalError('');
    setError('');
    setNotice('');
  }, []);
  const lock = useCallback(async () => {
    clear();
    if (isExtension)
      try {
        await send({ kind: 'lock' });
      } catch {
        /* The local view is already cleared. */
      }
  }, [clear]);
  useEffect(() => {
    if (!isExtension) return;
    let disposed = false;
    let remove: (() => void) | undefined;
    void onSessionLocked(clear).then((cleanup) => {
      if (disposed) cleanup();
      else remove = cleanup;
    });
    return () => {
      disposed = true;
      remove?.();
    };
  }, [clear]);
  const refresh = useCallback(async () => {
    const epoch = ++requestEpoch.current;
    setBusy(true);
    setError('');
    try {
      const reply = await send({ kind: 'snapshot' });
      if (epoch === requestEpoch.current && reply.kind === 'snapshot')
        setSession({ kind: 'live', data: reply.data });
    } catch (e) {
      if (epoch === requestEpoch.current) setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!isExtension) return;
    let cancelled = false;
    void send({ kind: 'status' })
      .then((reply) => {
        if (cancelled || reply.kind !== 'status') return;
        setConfigured(reply.configured);
        if (reply.unlocked) void refresh();
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  useEffect(() => {
    if (session.kind !== 'live') return;
    const timeout = setTimeout(() => void lock(), 5 * 60_000);
    const check = async () => {
      try {
        const reply = await send({ kind: 'status' });
        if (reply.kind === 'status' && !reply.unlocked) clear();
      } catch {
        clear();
      }
    };
    const interval = setInterval(() => void check(), 10_000);
    const visibility = () => {
      if (document.visibilityState === 'hidden') void lock();
      else void check();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [session.kind, lock, clear]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  const demo = session.kind === 'demo';
  const data = session.kind !== 'locked' ? session.data : null;
  const accounts = data?.accounts ?? [];
  const savers = accounts.filter((a) => a.type === 'SAVER');
  const transactions = periodTransactions(data?.transactions ?? [], days);
  const summary = summarize(transactions);
  const spendBalance = accounts
    .filter((a) => a.type === 'TRANSACTIONAL')
    .reduce((n, a) => n + a.balance, 0);
  const savedBalance = savers.reduce((n, a) => n + a.balance, 0);
  const pooled = accounts.filter((a) => a.type !== 'HOME_LOAN');
  const roundUps = roundUpTotal(transactions);
  const roundUpCount = transactions.filter((t) => t.details?.attributes.roundUp).length;
  const top = summary.categories[0];
  const headings: Record<Page, [string, string]> = {
    Overview: summary.spent
      ? [
          `${viewMoney(summary.spent)} out in ${days} days.`,
          top
            ? `${viewMoney(top[1])} of that was ${top[0]}.`
            : 'Transfers between your own accounts don’t count as spending.',
        ]
      : [
          `Nothing spent in ${days} days.`,
          'Transfers between your own accounts don’t count as spending.',
        ],
    Insights: ['Insights', 'Payday, subscriptions and what’s changed, worked out on this device.'],
    Transactions: ['Transactions', 'Search, filter and open anything Up has on record.'],
    Savers: ['Savers', `${viewMoney(savedBalance)} across ${plural(savers.length, 'Saver')}.`],
    Accounts: ['Accounts', 'Spending, Savers, 2Up and home loans, as Up reports them.'],
    Receipts: [
      'Receipts',
      'Files attached to your transactions in Up. Download links are temporary and open on Up’s file host.',
    ],
    'Categories & tags': ['Categories & tags', 'Up’s categories, plus the tags you’ve added.'],
    Connections: ['Connections', 'Check your token and manage Up webhooks.'],
    Settings: ['Settings & privacy', 'What UpDeck keeps on this device, and how to remove it.'],
  };
  const [title, subtitle] = data ? headings[page] : [page, ''];
  const connect = () => {
    clear();
    setPage('Overview');
  };
  const startDemo = () => {
    requestEpoch.current++;
    setSession({ kind: 'demo', data: demoSnapshot() });
    setPlans(demoTargets);
    setPage('Overview');
    setError('');
  };
  const editGoal = (account: Account) => {
    setGoal(account);
    setGoalValue(String((plans.find((p) => p.id === account.id)?.target ?? 0) / 100 || ''));
    setGoalError('');
  };
  const saveGoal = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d+(\.\d{1,2})?$/.test(goalValue) || Number(goalValue) <= 0 || Number(goalValue) > 1e9) {
      setGoalError('Enter an amount between $0.01 and $1 billion, with up to two decimal places.');
      return;
    }
    if (!goal) return;
    setPlans((old) => [
      ...old.filter((p) => p.id !== goal.id),
      { id: goal.id, target: Math.round(Number(goalValue) * 100) },
    ]);
    setGoal(null);
    setNotice('Target set.');
  };
  const resetDialog = (
    <Dialog.Root open={resetOpen} onOpenChange={setResetOpen}>
      <Dialog className="deck-dialog">
        <Dialog.Title>Disconnect Up?</Dialog.Title>
        <Dialog.Description>
          This removes your encrypted token from this browser. To cancel the token itself, revoke it
          in the Up app.
        </Dialog.Description>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setResetOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              try {
                await send({ kind: 'reset' });
                clear();
                setConfigured(false);
                setResetOpen(false);
              } catch (e) {
                setError(errorText(e));
                setResetOpen(false);
              }
            }}
          >
            Disconnect
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
  if (!data)
    return (
      <LockScreen
        configured={configured}
        error={error}
        onConnected={async () => {
          clear();
          setConfigured(true);
          await refresh();
        }}
        onDemo={startDemo}
        onForgot={() => setResetOpen(true)}
        dialog={resetDialog}
      />
    );
  return (
    <BankProvider
      key={session.kind}
      mode={session.kind === 'live' ? 'live' : 'demo'}
      initial={data ?? demoSnapshot()}
    >
      <div className="app-shell">
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage('Overview');
            }}
            aria-label="UpDeck home"
          >
            <span className="brand-mark">
              <span />
              <span />
              <span />
            </span>
            UpDeck
          </a>
          <div className="nav-caption">Your money</div>
          <nav aria-label="Main navigation">
            {nav.map((item) => (
              <button
                key={item.name}
                className={`nav-link ${page === item.name ? 'active' : ''}`}
                onClick={() => {
                  setTransactionId(null);
                  setHistoryAccount('');
                  setHistoryTag('');
                  setPage(item.name);
                }}
                aria-current={page === item.name ? 'page' : undefined}
              >
                <item.icon size={20} weight={page === item.name ? 'fill' : 'regular'} />
                {item.name}
                {page === item.name && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button
              className={`nav-link ${page === 'Settings' ? 'active' : ''}`}
              onClick={() => {
                setTransactionId(null);
                setPage('Settings');
              }}
            >
              <GearSix size={20} />
              Settings & privacy
            </button>
            <div className="privacy-caption">
              <ShieldCheck size={16} />
              Token encrypted on this device
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <span>UpDeck</span>
              <span>/</span>
              <strong>{page}</strong>
            </div>
            <div className="top-actions">
              <span className={`status-pill ${demo ? 'demo' : ''}`}>
                <span />
                {demo ? 'Sample data' : data ? 'Connected to Up' : 'Locked'}
              </span>
              <Button
                variant="ghost"
                shape="square"
                aria-label={dark ? 'Use light mode' : 'Use dark mode'}
                onClick={() => saveTheme(dark ? 'light' : 'dark')}
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </Button>
              <Button
                variant="ghost"
                shape="square"
                aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
                onClick={() => setHidden(!hidden)}
              >
                {hidden ? <EyeSlash size={20} /> : <Eye size={20} />}
              </Button>
              {data && (
                <Button
                  variant="ghost"
                  shape="square"
                  aria-label="Lock UpDeck"
                  onClick={() => void lock()}
                >
                  <LockKey size={19} />
                </Button>
              )}
            </div>
          </header>
          <main>
            {demo && (
              <div className="demo-banner">
                <span>
                  <Info size={16} />
                  You’re looking at sample data. None of these people or dollars are real.
                </span>
                <button onClick={connect}>
                  Connect Up <ArrowRight size={15} />
                </button>
              </div>
            )}
            {transactionId ? (
              <TransactionDetails
                accounts={accounts}
                id={transactionId}
                onClose={() => setTransactionId(null)}
                money={viewMoney}
                hidden={hidden}
                onUpdated={(updated, categories) => {
                  const transaction = toTransaction(
                    updated,
                    new Map(categories.map((c) => [c.id, c.attributes.name])),
                  );
                  setSession((old) =>
                    old.kind === 'locked'
                      ? old
                      : {
                          ...old,
                          data: {
                            ...old.data,
                            transactions: old.data.transactions.map((t) =>
                              t.id === transaction.id ? transaction : t,
                            ),
                          },
                        },
                  );
                  setTransactionRevision((value) => value + 1);
                }}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {data
                        ? `${demo ? 'Sample data' : 'Synced'} at ${new Date(data.syncedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
                        : new Date().toLocaleDateString('en-AU', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          })}
                    </div>
                    <h1>{title}</h1>
                    {subtitle && <p>{subtitle}</p>}
                  </div>
                  {data && page !== 'Settings' && (
                    <Button
                      variant="secondary"
                      className="refresh-button"
                      disabled={busy}
                      onClick={() => {
                        if (demo) {
                          setSession({ kind: 'demo', data: demoSnapshot() });
                          setNotice('Sample data refreshed.');
                        } else void refresh();
                      }}
                    >
                      <ArrowsClockwise size={16} className={busy ? 'spin' : ''} />
                      {busy ? 'Refreshing' : 'Refresh'}
                    </Button>
                  )}
                </div>
                {error && (
                  <div className="error-banner" role="alert">
                    {error}
                    <button aria-label="Dismiss error" onClick={() => setError('')}>
                      <X />
                    </button>
                  </div>
                )}
                <>
                  {page === 'Overview' && data && (
                    <>
                      <OverviewSafe
                        data={data}
                        money={viewMoney}
                        onMore={() => setPage('Insights')}
                      />
                      <section className="balance-card" aria-label="Account balances">
                        <div className="balance-card-top">
                          <span className="mini-label">
                            <Wallet size={18} />
                            Total balance
                          </span>
                          {roundUps > 0 && (
                            <span className="roundup-chip">
                              <Coins size={16} weight="duotone" />
                              <strong>{viewMoney(roundUps)}</strong> rounded up in {days} days
                            </span>
                          )}
                        </div>
                        <h2 className="total-balance">{viewMoney(spendBalance + savedBalance)}</h2>
                        <p className="balance-summary">
                          <span>
                            <strong>{viewMoney(spendBalance)}</strong> to spend
                          </span>
                          <span>
                            <strong>{viewMoney(savedBalance)}</strong> in{' '}
                            {plural(savers.length, 'Saver')}
                          </span>
                          {accounts.length > pooled.length && <span>Home loans not included</span>}
                        </p>
                        <AccountSplit
                          accounts={pooled}
                          hidden={hidden}
                          money={viewMoney}
                          onMore={() => setPage('Accounts')}
                        />
                      </section>
                      <div className="section-heading">
                        <h2>Spending</h2>
                        <Period days={days} onChange={setDays} />
                      </div>
                      <section className="insights-grid">
                        <div className="panel spending-panel">
                          <div className="panel-heading">
                            <div>
                              <span className="muted">Money out</span>
                              <h2 className="spending-value">{viewMoney(summary.spent)}</h2>
                            </div>
                            <span className="soft-pill">
                              <ArrowUpRight size={15} />
                              Last {days} days
                            </span>
                          </div>
                          <SpendingChart transactions={transactions} days={days} hidden={hidden} />
                          <div className="chart-footer">
                            <span>
                              <span className="legend-dot" />
                              Spending, including pending
                            </span>
                            <span>Own-account transfers excluded</span>
                          </div>
                        </div>
                        <div className="panel categories-panel">
                          <div className="panel-heading">
                            <h3>Where it went</h3>
                            <ShoppingBag size={19} />
                          </div>
                          <CategoryList
                            categories={summary.categories}
                            spent={summary.spent}
                            money={viewMoney}
                          />
                          <button className="text-link" onClick={() => setPage('Transactions')}>
                            All transactions <ArrowRight size={16} />
                          </button>
                        </div>
                      </section>
                      <div className="section-heading">
                        <div className="heading-with-tag">
                          <h2>Savers</h2>
                          <span className="count-tag">{savers.length}</span>
                        </div>
                        <button className="text-link" onClick={() => setPage('Savers')}>
                          All savers <ArrowRight size={16} />
                        </button>
                      </div>
                      <section className="saver-grid">
                        {savers.slice(0, 3).map((account) => (
                          <SaverCard
                            key={account.id}
                            account={account}
                            target={plans.find((p) => p.id === account.id)?.target}
                            money={viewMoney}
                            hidden={hidden}
                            onEdit={() => editGoal(account)}
                          />
                        ))}
                        {!savers.length && (
                          <div className="panel empty-state">
                            Create a Saver in the Up app to see it here.
                          </div>
                        )}
                      </section>
                      <div className="section-heading">
                        <h2>Latest transactions</h2>
                        <button className="text-link" onClick={() => setPage('Transactions')}>
                          All transactions <ArrowRight size={16} />
                        </button>
                      </div>
                      <TransactionList
                        transactions={transactions.slice(0, 5)}
                        money={viewMoney}
                        onSelect={setTransactionId}
                      />
                    </>
                  )}
                  {page === 'Insights' && data && <Insights data={data} money={viewMoney} />}
                  {page === 'Transactions' && data && (
                    <BankTransactions
                      key={`${session.kind}-${historyAccount}-${historyTag}`}
                      accounts={accounts}
                      money={viewMoney}
                      onSelect={setTransactionId}
                      initialAccount={historyAccount}
                      initialTag={historyTag}
                      revision={transactionRevision}
                    />
                  )}
                  {page === 'Accounts' && data && (
                    <Accounts
                      money={viewMoney}
                      onHistory={(id) => {
                        setHistoryAccount(id);
                        setHistoryTag('');
                        setPage('Transactions');
                      }}
                    />
                  )}
                  {page === 'Receipts' && data && <Receipts onTransaction={setTransactionId} />}
                  {page === 'Categories & tags' && data && (
                    <CategoriesAndTags
                      onTag={(tag) => {
                        setHistoryTag(tag);
                        setHistoryAccount('');
                        setPage('Transactions');
                      }}
                    />
                  )}
                  {page === 'Connections' && data && <Connections />}
                  {page === 'Savers' && data && (
                    <>
                      {roundUps > 0 && (
                        <div className="saver-intro">
                          <Coins size={28} weight="duotone" />
                          <p>
                            <strong>{viewMoney(roundUps)}</strong> in Round-Ups over the last {days}{' '}
                            days, from {plural(roundUpCount, 'purchase')}.
                          </p>
                        </div>
                      )}
                      <section className="saver-grid saver-page">
                        {savers.map((account) => (
                          <SaverCard
                            key={account.id}
                            account={account}
                            target={plans.find((p) => p.id === account.id)?.target}
                            money={viewMoney}
                            hidden={hidden}
                            onEdit={() => editGoal(account)}
                          />
                        ))}
                      </section>
                      {!savers.length && (
                        <div className="panel empty-state">
                          <PiggyBank size={32} />
                          <h3>No Savers yet</h3>
                          <p>Create a Saver in the Up app, then refresh.</p>
                        </div>
                      )}
                      <div className="plain-note">
                        <ShieldCheck size={18} />
                        Targets you set here last until UpDeck locks. They never move money or
                        change your Savers in Up.
                      </div>
                    </>
                  )}
                  {page === 'Settings' && (
                    <section className="settings-grid">
                      <div className="panel settings-card">
                        <h2>What UpDeck keeps</h2>
                        <p>
                          Your token is encrypted on this device with your passphrase. Balances and
                          transactions stay in memory, only while UpDeck is unlocked.
                        </p>
                        <ul className="privacy-list">
                          <li>Direct connection to Up’s API</li>
                          <li>Category, tag and webhook changes only after you confirm</li>
                          <li>No analytics. No advertising. No UpDeck servers.</li>
                          <li>Automatic lock after five minutes</li>
                          <li>No access to the websites you visit</li>
                        </ul>
                        <a
                          className="text-link"
                          href="https://developer.up.com.au/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          About the Up API <ArrowSquareOut size={16} />
                        </a>
                      </div>
                      <div className="settings-stack">
                        <div className="panel settings-card">
                          <h3>Your connection</h3>
                          {demo ? (
                            <>
                              <p>
                                You’re using sample data. Connect your own token to see your money.
                              </p>
                              <Button className="primary-button" onClick={connect}>
                                Connect Up
                                <ArrowRight size={16} />
                              </Button>
                            </>
                          ) : (
                            <>
                              <p>
                                Your token is encrypted on this device. Disconnecting removes it
                                from this browser.
                              </p>
                              <Button
                                variant="secondary-destructive"
                                onClick={() => setResetOpen(true)}
                              >
                                Disconnect Up
                              </Button>
                            </>
                          )}
                        </div>
                        <div className="panel settings-card">
                          <h3>A note on security</h3>
                          <p>
                            Use a unique, strong passphrase. Encryption protects the saved token; it
                            can’t protect an unlocked UpDeck on a compromised device.
                          </p>
                          <p>
                            Disconnecting deletes the local vault. Revoke the token in Up’s Data
                            sharing settings to invalidate it at the bank.
                          </p>
                        </div>
                        <div className="settings-version">
                          <span className="brand-small">UpDeck</span>
                          <span>Version {version} · Bakari Mustafa</span>
                        </div>
                      </div>
                    </section>
                  )}
                </>
              </>
            )}
            <footer>
              <span>UpDeck is an independent project. It isn’t made or endorsed by Up.</span>
            </footer>
          </main>
        </div>
        <Dialog.Root
          open={Boolean(goal)}
          onOpenChange={(open) => {
            if (!open) setGoal(null);
          }}
        >
          <Dialog className="deck-dialog">
            <Dialog.Title>Set a target</Dialog.Title>
            <Dialog.Description>
              For {goal ? saverLabel(goal.name).name : 'your Saver'}. It lasts until UpDeck locks
              and doesn’t change anything in Up.
            </Dialog.Description>
            <form onSubmit={saveGoal} className="dialog-form">
              <Input
                label="Target amount (AUD)"
                inputMode="decimal"
                placeholder="5,000"
                value={goalValue}
                onChange={(e) => setGoalValue(e.target.value)}
                required
              />
              {goalError && (
                <p className="form-error" role="alert">
                  {goalError}
                </p>
              )}
              <div className="dialog-actions">
                <Button variant="secondary" type="button" onClick={() => setGoal(null)}>
                  Cancel
                </Button>
                <Button className="primary-button" type="submit">
                  Set target <Target size={17} />
                </Button>
              </div>
            </form>
          </Dialog>
        </Dialog.Root>
        {resetDialog}
        {notice && (
          <div className="toast" role="status">
            <Check size={18} />
            {notice}
          </div>
        )}
      </div>
    </BankProvider>
  );
}

function Period({ days, onChange }: { days: number; onChange: (value: number) => void }) {
  return (
    <div className="period-control" aria-label="Time period">
      {[7, 30, 90].map((value) => (
        <button key={value} onClick={() => onChange(value)} aria-pressed={days === value}>
          {value} days
        </button>
      ))}
    </div>
  );
}
function CategoryList({
  categories,
  spent,
  money: format,
}: {
  categories: [string, number][];
  spent: number;
  money: (n: number) => string;
}) {
  if (!spent) return <p className="empty-copy">Nothing spent in this period.</p>;
  return (
    <div className="categories">
      {categories.slice(0, 4).map(([name, value], i) => (
        <div className="category" key={name}>
          <div>
            <span>
              <i className={`category-dot color-${i}`} />
              {name}
            </span>
            <strong>{format(value)}</strong>
          </div>
          <div className="category-track">
            <div className={`color-${i}`} style={{ width: `${(value / spent) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function OverviewSafe({
  data,
  money: format,
  onMore,
}: {
  data: Snapshot;
  money: (n: number) => string;
  onMore: () => void;
}) {
  const { safe, pay } = useInsights(data);
  return (
    <SafeToSpendCard safe={safe} source={pay?.source} money={format} compact onMore={onMore} />
  );
}
function AccountSplit({
  accounts,
  hidden,
  money: format,
  onMore,
}: {
  accounts: Account[];
  hidden: boolean;
  money: (n: number) => string;
  onMore: () => void;
}) {
  const total = accounts.reduce((n, a) => n + Math.max(0, a.balance), 0);
  if (!total) return null;
  const share = (cents: number) => Math.max(0, cents) / total;
  // Real decks can hold a dozen Savers. Name the big ones; fold the rest into one entry.
  const sorted = [...accounts].sort((x, y) => y.balance - x.balance);
  const major = sorted.filter((a) => share(a.balance) >= 0.05).slice(0, 5);
  const rest = sorted.filter((a) => !major.includes(a));
  const restBalance = rest.reduce((n, a) => n + a.balance, 0);
  const percent = (cents: number) => {
    const value = share(cents) * 100;
    return value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
  };
  return (
    <div className="account-split">
      {!hidden && (
        <div className="split-bar" aria-hidden="true">
          {major.map((a, i) => (
            <span key={a.id} className={`split-${i % 4}`} style={{ flexGrow: a.balance }} />
          ))}
          {restBalance > 0 && <span className="split-rest" style={{ flexGrow: restBalance }} />}
        </div>
      )}
      <ul aria-label="Balance by account">
        {major.map((a, i) => {
          const { emoji, name } = saverLabel(a.name);
          return (
            <li key={a.id}>
              <span className="split-name">
                <i className={`split-${i % 4}`} />
                {emoji && <span aria-hidden="true">{emoji}</span>}
                <span className="split-label">{name}</span>
              </span>
              <strong>{format(a.balance)}</strong>
              <small>
                {a.type === 'SAVER' ? 'Saver' : 'Spending'}
                {a.joint && ' · 2Up'}
                {!hidden && ` · ${percent(a.balance)}`}
              </small>
            </li>
          );
        })}
        {rest.length > 0 && (
          <li>
            <span className="split-name">
              <i className="split-rest" />
              <span className="split-label">
                {major.length ? `${rest.length} more` : plural(rest.length, 'account')}
              </span>
            </span>
            <strong>{format(restBalance)}</strong>
            <button type="button" className="text-link" onClick={onMore}>
              See all accounts <ArrowRight size={13} />
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
function SaverCard({
  account,
  target,
  money: format,
  onEdit,
  hidden,
}: {
  account: Account;
  target?: number;
  money: (n: number) => string;
  onEdit: () => void;
  hidden: boolean;
}) {
  const { emoji, name } = saverLabel(account.name);
  const percent = target
    ? Math.min(100, Math.max(0, Math.floor((account.balance / target) * 100)))
    : 0;
  const complete = target !== undefined && account.balance >= target;
  const status = !target
    ? 'No target yet'
    : hidden
      ? 'Progress hidden'
      : complete
        ? account.balance > target
          ? `${format(account.balance - target)} over target.`
          : 'Target reached.'
        : `${percent}% there · ${format(target - account.balance)} to go`;
  return (
    <article className={`saver-card${complete && !hidden ? ' complete' : ''}`}>
      <div className="saver-top">
        <span className="saver-icon" aria-hidden="true">
          {emoji ?? <PiggyBank size={24} />}
        </span>
        <button aria-label={`Set target for ${name}`} onClick={onEdit}>
          <SlidersHorizontal size={19} />
        </button>
      </div>
      <h3>{name}</h3>
      <div className="saver-amount">
        <strong>{format(account.balance)}</strong>
        {target && <span>of {format(target)}</span>}
      </div>
      {target !== undefined && (
        <div
          className="saver-progress"
          role="progressbar"
          aria-label={`${name} target progress`}
          aria-valuenow={hidden ? undefined : percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${hidden ? 0 : percent}%` }} />
        </div>
      )}
      <div className="saver-bottom">
        <span>{status}</span>
        {complete ? (
          <Check size={16} />
        ) : (
          <button className="text-link" onClick={onEdit}>
            {target ? 'Edit target' : 'Set target'}
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      {account.joint && <span className="joint-label">2Up · Joint account</span>}
    </article>
  );
}
function LockScreen({
  configured,
  error,
  onConnected,
  onDemo,
  onForgot,
  dialog,
}: {
  configured: boolean;
  error: string;
  onConnected: () => Promise<void>;
  onDemo: () => void;
  onForgot: () => void;
  dialog: React.ReactNode;
}) {
  return (
    <div className="lock-screen">
      <main className="lock-card">
        <span className="brand lock-brand" aria-label="UpDeck">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          UpDeck
        </span>
        <h1>{configured ? 'Unlock UpDeck' : 'Connect Up'}</h1>
        <p className="lock-lede">
          {configured
            ? 'Enter your passphrase to see your money.'
            : 'Your spending, Savers and Round-Ups in a browser tab, straight from the Up API.'}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {isExtension ? (
          <AuthForm configured={configured} onConnected={onConnected} onForgot={onForgot} />
        ) : (
          <div className="preview-explainer">
            <h2>You’re in the web preview</h2>
            <p>
              Connecting to Up only works in the installed extension. Here you can explore with
              sample data.
            </p>
            <Button className="primary-button" onClick={onDemo}>
              Explore the demo <ArrowRight size={17} />
            </Button>
          </div>
        )}
        {isExtension && (
          <button className="text-link demo-link" onClick={onDemo}>
            Try it with sample data
          </button>
        )}
        <p className="lock-trust">
          <ShieldCheck size={16} />
          UpDeck can’t move money. Your token is encrypted on this device and only ever sent to Up.
        </p>
      </main>
      <p className="lock-footer">
        UpDeck is an independent project. It isn’t made or endorsed by Up.
      </p>
      {dialog}
    </div>
  );
}
function AuthForm({
  configured,
  onConnected,
  onForgot,
}: {
  configured: boolean;
  onConnected: () => Promise<void>;
  onForgot: () => void;
}) {
  const [token, setToken] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!configured) {
      if (!tokenSchema.safeParse(token).success) {
        setError('That doesn’t look like an Up personal access token. It starts with up:');
        return;
      }
      if (!passphraseSchema.safeParse(passphrase).success) {
        setError('Choose a passphrase of at least 14 characters.');
        return;
      }
      if (passphrase !== confirm) {
        setError('Those passphrases don’t match.');
        return;
      }
    }
    setBusy(true);
    const request = configured
      ? ({ kind: 'unlock', passphrase } satisfies Parameters<typeof send>[0])
      : ({ kind: 'setup', token: token.trim(), passphrase } satisfies Parameters<typeof send>[0]);
    setToken('');
    setPassphrase('');
    setConfirm('');
    try {
      await send(request);
      await onConnected();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="dialog-form lock-form" onSubmit={submit}>
      {!configured && (
        <>
          <Input
            label="Up personal access token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="up:yeah:…"
            required
            maxLength={4096}
            autoFocus
          />
          <a className="token-help" href="https://api.up.com.au/" target="_blank" rel="noreferrer">
            Get a token from Up <ArrowSquareOut size={15} />
          </a>
        </>
      )}
      <Input
        label={configured ? 'Passphrase' : 'Create a passphrase'}
        type="password"
        autoComplete={configured ? 'current-password' : 'new-password'}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        description={
          configured ? undefined : 'At least 14 characters. Four random words work well.'
        }
        required
        maxLength={256}
        autoFocus={configured}
      />
      {!configured && (
        <Input
          label="Repeat your passphrase"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          maxLength={256}
        />
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button type="submit" className="primary-button" disabled={busy}>
        {busy
          ? configured
            ? 'Unlocking…'
            : 'Checking with Up…'
          : configured
            ? 'Unlock'
            : 'Connect & encrypt'}
        <ArrowRight size={18} />
      </Button>
      <p className="form-footnote">
        {configured ? (
          <>
            Locks after five minutes.{' '}
            <button type="button" className="text-link" onClick={onForgot}>
              Forgot your passphrase?
            </button>
          </>
        ) : (
          'We can’t recover a forgotten passphrase. Keep it somewhere safe.'
        )}
      </p>
    </form>
  );
}
