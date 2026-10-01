import { useEffect, useRef, useState } from 'react';
import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Input } from '@cloudflare/kumo/components/input';
import { ArrowLeft, ArrowSquareOut, Paperclip, X } from '@phosphor-icons/react';
import {
  publicHttpsUrl,
  type BankTransaction,
  type Category,
  type Operation,
  type Attachment,
  type apiMoney,
} from '../api-model';
import { useBank } from '../bank-context';
import { MerchantIcon } from './MerchantIcon';
import type { z } from 'zod/v3';

export function formatForeign(amount: z.infer<typeof apiMoney>) {
  const formatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: amount.currencyCode,
  });
  const exponent = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return `${formatter.format(amount.valueInBaseUnits / 10 ** exponent)} ${amount.currencyCode}`;
}
const friendly = (value: string | null | undefined) =>
  value
    ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replaceAll('_', ' ')
    : 'Not provided';
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not settled';
const safeDeepLink = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'up:' ||
      (url.protocol === 'https:' && ['up.com.au', 'app.up.com.au'].includes(url.hostname))
      ? url.href
      : null;
  } catch {
    return null;
  }
};

export function TransactionDetails({
  id,
  onClose,
  money,
  hidden,
  onUpdated,
  accounts = [],
}: {
  accounts?: { id: string; name: string }[];
  id: string | null;
  onClose: () => void;
  money: (n: number) => string;
  hidden: boolean;
  onUpdated: (value: BankTransaction, categories: Category[]) => void;
}) {
  const { call, demo } = useBank();
  const accountName = (accountId?: string) =>
    accounts.find((a) => a.id === accountId)?.name ?? accountId ?? 'Not provided';
  const [transaction, setTransaction] = useState<BankTransaction | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [receipt, setReceipt] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<{ operation: Operation; summary: string } | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    const version = ++epoch.current;
    setTransaction(null);
    setReceipt(null);
    setPending(null);
    setError('');
    setNotice('');
    setTag('');
    if (!id) return;
    setBusy(true);
    void (async () => {
      try {
        const detail = await call({ op: 'transaction', id });
        const catalog = await call({ op: 'categories' });
        if (epoch.current !== version) return;
        if (detail.kind === 'transaction') {
          setTransaction(detail.data);
          setCategory(detail.data.relationships.category.data?.id ?? '');
        }
        if (catalog.kind === 'categories') setCategories(catalog.page.data);
      } catch (e) {
        if (epoch.current === version)
          setError(e instanceof Error ? e.message : 'Couldn’t load this transaction. Try again.');
      } finally {
        if (epoch.current === version) setBusy(false);
      }
    })();
    return () => {
      epoch.current++;
    };
  }, [id, call]);
  async function save() {
    if (!pending || !id) return;
    setBusy(true);
    setError('');
    const version = epoch.current;
    try {
      await call(pending.operation);
      const updated = await call({ op: 'transaction', id });
      if (version !== epoch.current) return;
      if (updated.kind === 'transaction') {
        setTransaction(updated.data);
        onUpdated(updated.data, categories);
      }
      setPending(null);
      setTag('');
      setNotice(demo ? 'Sample transaction updated.' : 'Saved to Up.');
    } catch (e) {
      if (version === epoch.current) {
        setError(e instanceof Error ? e.message : 'Couldn’t save that change. Try again.');
        setPending(null);
      }
    } finally {
      if (version === epoch.current) setBusy(false);
    }
  }
  const attrs = transaction?.attributes;
  const link = safeDeepLink(attrs?.deepLinkURL ?? null);
  const receiptUrl =
    receipt?.attributes.fileURL &&
    publicHttpsUrl.safeParse(receipt.attributes.fileURL).success &&
    new Date(receipt.attributes.fileURLExpiresAt) > new Date()
      ? receipt.attributes.fileURL
      : null;
  return (
    <>
      <section className="transaction-page" aria-labelledby="transaction-title">
        <button type="button" className="text-link back-link" onClick={onClose} disabled={busy}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="transaction-hero">
          <MerchantIcon
            name={attrs?.description ?? ''}
            category={
              categories.find((c) => c.id === transaction?.relationships.category.data?.id)
                ?.attributes.name
            }
            incoming={(attrs?.amount.valueInBaseUnits ?? 0) > 0}
            transfer={Boolean(transaction?.relationships.transferAccount.data)}
          />
          <div>
            <h1 id="transaction-title">{attrs?.description ?? 'Transaction'}</h1>
            <p>
              {demo
                ? 'Sample transaction. Changes stay in this demo.'
                : 'Everything Up knows about this transaction.'}
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {busy && !attrs && (
          <p className="plain-note" role="status">
            Loading transaction…
          </p>
        )}
        {attrs && transaction && (
          <>
            <h2
              className={`receipt-amount ${transaction?.relationships.transferAccount.data ? '' : attrs.amount.valueInBaseUnits < 0 ? 'negative' : 'positive'}`}
            >
              {money(attrs.amount.valueInBaseUnits)}
            </h2>
            <span className="soft-pill">
              {attrs.status === 'HELD' ? 'Pending' : 'Settled'} · {friendly(attrs.transactionType)}
            </span>
            <dl className="detail-grid">
              <dt>When</dt>
              <dd>{date(attrs.createdAt)}</dd>
              <dt>Settled</dt>
              <dd>{date(attrs.settledAt)}</dd>
              <dt>Account</dt>
              <dd>{accountName(transaction.relationships.account.data?.id)}</dd>
              {transaction.relationships.transferAccount.data && (
                <>
                  <dt>Transfer account</dt>
                  <dd>{accountName(transaction.relationships.transferAccount.data.id)}</dd>
                </>
              )}
              {attrs.foreignAmount && (
                <>
                  <dt>Foreign amount</dt>
                  <dd>{hidden ? '••••' : formatForeign(attrs.foreignAmount)}</dd>
                </>
              )}
              {attrs.roundUp && (
                <>
                  <dt>Round-Up</dt>
                  <dd>
                    {money(attrs.roundUp.amount.valueInBaseUnits)}
                    {attrs.roundUp.boostPortion &&
                      ` (${money(attrs.roundUp.boostPortion.valueInBaseUnits)} boost)`}
                  </dd>
                </>
              )}
              {attrs.cashback && (
                <>
                  <dt>Cashback</dt>
                  <dd>
                    {money(attrs.cashback.amount.valueInBaseUnits)} · {attrs.cashback.description}
                  </dd>
                </>
              )}
              {attrs.holdInfo && (
                <>
                  <dt>Original hold</dt>
                  <dd>
                    {money(attrs.holdInfo.amount.valueInBaseUnits)}
                    {attrs.holdInfo.foreignAmount &&
                      ` / ${hidden ? '••••' : formatForeign(attrs.holdInfo.foreignAmount)}`}
                  </dd>
                </>
              )}
              {attrs.cardPurchaseMethod && (
                <>
                  <dt>Payment method</dt>
                  <dd>
                    {friendly(attrs.cardPurchaseMethod.method)}
                    {attrs.cardPurchaseMethod.cardNumberSuffix &&
                      ` · ${hidden ? '••••' : attrs.cardPurchaseMethod.cardNumberSuffix}`}
                  </dd>
                </>
              )}
              {attrs.performingCustomer && (
                <>
                  <dt>Paid by</dt>
                  <dd>{attrs.performingCustomer.displayName}</dd>
                </>
              )}
              {attrs.message && (
                <>
                  <dt>Message</dt>
                  <dd>{attrs.message}</dd>
                </>
              )}
              {attrs.note && (
                <>
                  <dt>Your note</dt>
                  <dd>{attrs.note.text}</dd>
                </>
              )}
              {attrs.rawText && (
                <>
                  <dt>Bank description</dt>
                  <dd>{attrs.rawText}</dd>
                </>
              )}
              {transaction.relationships.parentCategory.data && (
                <>
                  <dt>Parent category</dt>
                  <dd>
                    {categories.find(
                      (c) => c.id === transaction.relationships.parentCategory.data?.id,
                    )?.attributes.name ?? transaction.relationships.parentCategory.data.id}
                  </dd>
                </>
              )}
              <dt>Transaction ID</dt>
              <dd>{transaction.id}</dd>
            </dl>
            <section className="receipt-section">
              <h3>Category & tags</h3>
              <label className="field-label" htmlFor="receipt-category">
                Category
              </label>
              <div className="inline-controls">
                <select
                  id="receipt-category"
                  value={category}
                  disabled={!attrs.isCategorizable || busy}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Uncategorised</option>
                  {categories
                    .filter((c) => c.relationships.parent.data)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.attributes.name}
                      </option>
                    ))}
                </select>
                <Button
                  variant="secondary"
                  disabled={
                    busy ||
                    !attrs.isCategorizable ||
                    category === (transaction.relationships.category.data?.id ?? '')
                  }
                  onClick={() =>
                    setPending({
                      operation: {
                        op: 'categorize',
                        id: transaction.id,
                        categoryId: category || null,
                        confirmed: true,
                      },
                      summary: `Change this transaction to ${categories.find((c) => c.id === category)?.attributes.name ?? 'Uncategorised'} in ${demo ? 'the demo' : 'Up'}?`,
                    })
                  }
                >
                  Review change
                </Button>
              </div>
              {!attrs.isCategorizable && (
                <p className="plain-note">Up does not allow categories on this transaction.</p>
              )}
              <div className="tag-list">
                {transaction.relationships.tags.data.map((t) => (
                  <span className="tag-chip" key={t.id}>
                    {t.id}
                    <button
                      disabled={busy}
                      aria-label={`Remove tag ${t.id}`}
                      onClick={() =>
                        setPending({
                          operation: {
                            op: 'removeTags',
                            id: transaction.id,
                            tags: [t.id],
                            confirmed: true,
                          },
                          summary: `Remove the “${t.id}” tag from this transaction?`,
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
              <form
                className="inline-controls"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tag.trim())
                    setPending({
                      operation: {
                        op: 'addTags',
                        id: transaction.id,
                        tags: [tag.trim()],
                        confirmed: true,
                      },
                      summary: `Add the “${tag.trim()}” tag to this transaction?`,
                    });
                }}
              >
                <Input
                  aria-label="New transaction tag"
                  placeholder="Add a tag…"
                  value={tag}
                  maxLength={100}
                  onChange={(e) => setTag(e.target.value)}
                />
                <Button
                  variant="secondary"
                  type="submit"
                  disabled={busy || !tag.trim() || transaction.relationships.tags.data.length >= 6}
                >
                  Add tag
                </Button>
              </form>
              <p className="plain-note">
                Up supports up to six tags per transaction. Notes are visible here but can only be
                edited in Up.
              </p>
            </section>
            {transaction.relationships.attachment.data && (
              <section className="receipt-section">
                <h3>
                  <Paperclip size={18} />
                  Attached receipt
                </h3>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    const attachmentId = transaction.relationships.attachment.data?.id;
                    if (!attachmentId) return;
                    setBusy(true);
                    setError('');
                    const version = epoch.current;
                    try {
                      const result = await call({ op: 'attachment', id: attachmentId });
                      if (version === epoch.current && result.kind === 'attachment')
                        setReceipt(result.data);
                    } catch (e) {
                      if (version === epoch.current)
                        setError(
                          e instanceof Error ? e.message : 'Couldn’t load the receipt. Try again.',
                        );
                    } finally {
                      if (version === epoch.current) setBusy(false);
                    }
                  }}
                >
                  Get receipt link
                </Button>
                {receipt && (
                  <p className="plain-note">
                    {receiptUrl ? (
                      <a href={receiptUrl} target="_blank" rel="noreferrer">
                        Open {receipt.attributes.fileExtension ?? 'receipt'} at{' '}
                        {new URL(receiptUrl).hostname} <ArrowSquareOut size={15} />
                      </a>
                    ) : demo ? (
                      'Sample receipt. No real file is attached.'
                    ) : (
                      'No valid download link. Refresh the receipt to request a new link.'
                    )}
                  </p>
                )}
              </section>
            )}
            {link && (
              <a className="text-link" href={link} target="_blank" rel="noreferrer">
                Open in the Up app <ArrowSquareOut size={16} />
              </a>
            )}
            {notice && (
              <p className="success-note" role="status">
                {notice}
              </p>
            )}
          </>
        )}
      </section>
      <Dialog.Root
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        <Dialog className="deck-dialog">
          <Dialog.Title>Update this transaction?</Dialog.Title>
          <Dialog.Description>{pending?.summary ?? ''}</Dialog.Description>
          <div className="dialog-actions">
            <Button variant="secondary" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button className="primary-button" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Confirm change'}
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
