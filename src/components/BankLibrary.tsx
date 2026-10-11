import { useEffect, useRef, useState } from 'react';
import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { ArrowRight, ArrowSquareOut, Bank, Paperclip, Tag, X } from '@phosphor-icons/react';
import { useBank } from '../bank-context';
import { publicHttpsUrl, type BankAccount, type Category, type Attachment } from '../api-model';

export function Accounts({
  money,
  onHistory,
}: {
  money: (n: number) => string;
  onHistory: (id: string) => void;
}) {
  const { call } = useBank();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [type, setType] = useState('');
  const [ownership, setOwnership] = useState('');
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<BankAccount | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  async function load(cursor?: string) {
    const version = ++epoch.current;
    setBusy(true);
    setError('');
    try {
      const result = await call({
        op: 'accounts',
        cursor,
        accountType:
          type === 'SAVER' || type === 'HOME_LOAN' || type === 'TRANSACTIONAL' ? type : undefined,
        ownershipType: ownership === 'JOINT' || ownership === 'INDIVIDUAL' ? ownership : undefined,
      });
      if (version === epoch.current && result.kind === 'accounts') {
        setAccounts((old) => (cursor ? [...old, ...result.page.data] : result.page.data));
        setNext(result.page.links.next);
      }
    } catch (e) {
      if (version === epoch.current)
        setError(e instanceof Error ? e.message : 'Couldn’t load accounts. Try again.');
    } finally {
      if (version === epoch.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, [type, ownership]);
  return (
    <>
      <div className="bank-filters">
        <label>
          Account type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All accounts</option>
            <option value="TRANSACTIONAL">Spending</option>
            <option value="SAVER">Savers</option>
            <option value="HOME_LOAN">Home loans</option>
          </select>
        </label>
        <label>
          Ownership
          <select value={ownership} onChange={(e) => setOwnership(e.target.value)}>
            <option value="">Personal & 2Up</option>
            <option value="INDIVIDUAL">Personal</option>
            <option value="JOINT">2Up joint accounts</option>
          </select>
        </label>
        <Button variant="secondary" disabled={busy} onClick={() => void load()}>
          Refresh accounts
        </Button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="account-grid">
        {accounts.map((a) => (
          <article className="panel account-tile" key={a.id}>
            <div className="panel-heading">
              <span className="icon-circle green">
                <Bank size={22} />
              </span>
              <span className="soft-pill">
                {a.attributes.ownershipType === 'JOINT' ? '2Up · Joint' : 'Personal'}
              </span>
            </div>
            <h3>{a.attributes.displayName}</h3>
            <h2>{money(a.attributes.balance.valueInBaseUnits)}</h2>
            <p>
              {a.attributes.accountType === 'HOME_LOAN'
                ? 'Home loan balance'
                : a.attributes.accountType === 'SAVER'
                  ? 'Saver balance'
                  : 'Available balance'}
            </p>
            <div className="tile-actions">
              <button
                className="text-link"
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const detail = await call({ op: 'account', id: a.id });
                    if (detail.kind === 'account') setSelected(detail.data);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Couldn’t load account. Try again.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Account details
              </button>
              <button className="text-link" onClick={() => onHistory(a.id)}>
                Transactions <ArrowRight size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!accounts.length && !busy && <p className="empty-state">No accounts match these filters.</p>}
      {next && (
        <div className="load-more">
          <Button disabled={busy} onClick={() => void load(next)}>
            More accounts
          </Button>
        </div>
      )}
      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog className="deck-dialog">
          <Dialog.Title>{selected?.attributes.displayName ?? 'Account details'}</Dialog.Title>
          <Dialog.Description>Your account as reported by Up.</Dialog.Description>
          {selected && (
            <dl className="detail-grid">
              <dt>Balance</dt>
              <dd>{money(selected.attributes.balance.valueInBaseUnits)}</dd>
              <dt>Type</dt>
              <dd>{selected.attributes.accountType}</dd>
              <dt>Ownership</dt>
              <dd>{selected.attributes.ownershipType}</dd>
              <dt>Opened</dt>
              <dd>
                {selected.attributes.createdAt
                  ? new Date(selected.attributes.createdAt).toLocaleDateString('en-AU')
                  : 'Not provided'}
              </dd>
              <dt>ID</dt>
              <dd>{selected.id}</dd>
            </dl>
          )}
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        </Dialog>
      </Dialog.Root>
    </>
  );
}

export function CategoriesAndTags({ onTag }: { onTag: (value: string) => void }) {
  const { call } = useBank();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [parent, setParent] = useState('');
  const [parents, setParents] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Category | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    void (async () => {
      try {
        const result = await call({ op: 'categories', parent: parent || undefined });
        if (!active) return;
        if (result.kind === 'categories') {
          setCategories(result.page.data);
          if (!parent) setParents(result.page.data.filter((c) => !c.relationships.parent.data));
        }
        const labels = await call({ op: 'tags' });
        if (active && labels.kind === 'tags') {
          setTags(labels.page.data.map((t) => t.id));
          setNext(labels.page.links.next);
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'Couldn’t load categories. Try again.');
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [call, parent]);
  return (
    <div className="library-grid">
      <section className="panel library-panel">
        <div className="panel-heading">
          <h2>Up categories</h2>
          <select
            aria-label="Parent category"
            value={parent}
            onChange={(e) => setParent(e.target.value)}
          >
            <option value="">All categories</option>
            {parents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.attributes.name}
              </option>
            ))}
          </select>
        </div>
        <p className="plain-note">
          Up defines the categories. Choose a child category when editing a transaction.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="category-library">
          {categories.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const detail = await call({ op: 'category', id: c.id });
                  if (detail.kind === 'category') setSelected(detail.data);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Couldn’t load category. Try again.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <span>
                {c.relationships.parent.data ? '↳' : '●'} {c.attributes.name}
              </span>
              <span>{c.relationships.parent.data ? 'Category' : 'Parent'}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel library-panel">
        <h2>
          <Tag size={21} />
          Your tags
        </h2>
        <p className="plain-note">
          Open a tag to see its transactions. Add or remove tags from a transaction’s receipt.
        </p>
        <div className="tag-list">
          {tags.map((tag) => (
            <button className="tag-chip" key={tag} onClick={() => onTag(tag)}>
              {tag}
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
        {!tags.length && <p className="plain-note">No tags yet. Start with a transaction.</p>}
        {next && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await call({ op: 'tags', cursor: next });
                if (result.kind === 'tags') {
                  setTags((old) => [...old, ...result.page.data.map((t) => t.id)]);
                  setNext(result.page.links.next);
                }
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Couldn’t load tags. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            More tags
          </Button>
        )}
      </section>
      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog className="deck-dialog">
          <Dialog.Title>{selected?.attributes.name ?? 'Category'}</Dialog.Title>
          <Dialog.Description>
            {selected?.relationships.parent.data
              ? 'A transaction category defined by Up.'
              : 'A top-level group. Select one of its child categories to categorise a transaction.'}
          </Dialog.Description>
          <dl className="detail-grid">
            <dt>ID</dt>
            <dd>{selected?.id}</dd>
            <dt>Parent</dt>
            <dd>{selected?.relationships.parent.data?.id ?? 'Top level'}</dd>
            <dt>Children</dt>
            <dd>{selected?.relationships.children.data.map((c) => c.id).join(', ') || 'None'}</dd>
          </dl>
          <Button onClick={() => setSelected(null)}>Close</Button>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}

export function Receipts({ onTransaction }: { onTransaction: (id: string) => void }) {
  const { call, demo } = useBank();
  const [items, setItems] = useState<Attachment[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<Attachment | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  async function load(cursor?: string) {
    const version = ++epoch.current;
    setBusy(true);
    setError('');
    try {
      const result = await call({ op: 'attachments', cursor });
      if (version === epoch.current && result.kind === 'attachments') {
        setItems((old) => (cursor ? [...old, ...result.page.data] : result.page.data));
        setNext(result.page.links.next);
      }
    } catch (e) {
      if (version === epoch.current)
        setError(e instanceof Error ? e.message : 'Couldn’t load receipts. Try again.');
    } finally {
      if (version === epoch.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, []);
  const url =
    selected?.attributes.fileURL &&
    publicHttpsUrl.safeParse(selected.attributes.fileURL).success &&
    new Date(selected.attributes.fileURLExpiresAt) > new Date()
      ? selected.attributes.fileURL
      : null;
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-grid">
        {items.map((item) => (
          <article className="panel account-tile" key={item.id}>
            <span className="icon-circle peach">
              <Paperclip size={22} />
            </span>
            <h3>{item.attributes.fileExtension?.toUpperCase() ?? 'Attachment'} receipt</h3>
            <p>
              {item.attributes.createdAt
                ? new Date(item.attributes.createdAt).toLocaleDateString('en-AU')
                : 'Date not provided'}
            </p>
            <p>{item.attributes.fileContentType ?? 'Unknown file type'}</p>
            <div className="tile-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const result = await call({ op: 'attachment', id: item.id });
                    if (result.kind === 'attachment') setSelected(result.data);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Couldn’t load receipt. Try again.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Receipt details
              </Button>
              {item.relationships.transaction.data && (
                <button
                  className="text-link"
                  onClick={() => onTransaction(item.relationships.transaction.data?.id ?? '')}
                >
                  Transaction <ArrowRight size={16} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!items.length && !busy && (
        <div className="empty-state">
          <Paperclip size={35} />
          <h3>No receipts attached yet</h3>
          <p>Upload a receipt in Up and it will be available here.</p>
        </div>
      )}
      {next && (
        <div className="load-more">
          <Button disabled={busy} onClick={() => void load(next)}>
            More receipts
          </Button>
        </div>
      )}
      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog className="deck-dialog">
          <Dialog.Title>Attached receipt</Dialog.Title>
          <Dialog.Description>
            {demo
              ? 'A sample attachment. No real file is downloaded.'
              : 'This temporary link opens on Up’s file host. Your API token is never sent with it.'}
          </Dialog.Description>
          <dl className="detail-grid">
            <dt>Type</dt>
            <dd>{selected?.attributes.fileContentType}</dd>
            <dt>Expires</dt>
            <dd>
              {selected
                ? new Date(selected.attributes.fileURLExpiresAt).toLocaleString('en-AU')
                : ''}
            </dd>
            <dt>ID</dt>
            <dd>{selected?.id}</dd>
          </dl>
          {url ? (
            <a className="text-link" href={url} target="_blank" rel="noreferrer">
              Open at {new URL(url).hostname} <ArrowSquareOut size={17} />
            </a>
          ) : (
            <p className="plain-note">
              {demo
                ? 'Sample file, unavailable for download.'
                : 'No usable file link. Close and request fresh receipt details.'}
            </p>
          )}
          <div className="dialog-actions">
            <Button onClick={() => setSelected(null)}>Close</Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
