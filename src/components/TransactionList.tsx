import { MagnifyingGlass } from '@phosphor-icons/react';
import type { Transaction } from '../domain';
import { MerchantIcon } from './MerchantIcon';
export function TransactionList({
  transactions,
  money: format,
  onSelect,
}: {
  transactions: Transaction[];
  money: (n: number) => string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="panel transactions-panel">
      {transactions.length ? (
        transactions.map((t) => (
          <button
            type="button"
            className="transaction-row transaction-button"
            key={t.id}
            onClick={() => onSelect?.(t.id)}
            aria-label={`View ${t.description} transaction`}
          >
            <MerchantIcon
              name={t.description}
              category={t.category}
              incoming={t.amount > 0}
              transfer={t.transfer}
            />
            <span className="transaction-merchant">
              <strong>{t.description}</strong>
              <span>
                {t.transfer ? 'Between your accounts' : t.category}
                {t.pending && <em>Pending</em>}
                {t.details?.relationships.attachment.data && <em>Receipt</em>}
              </span>
            </span>
            <span className="transaction-date">
              {new Date(t.createdAt).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
            <strong
              className={`transaction-amount ${t.transfer ? '' : t.amount > 0 ? 'positive' : t.amount < 0 ? 'negative' : ''}`}
            >
              {t.amount > 0 && '+'}
              {format(t.amount)}
            </strong>
          </button>
        ))
      ) : (
        <div className="empty-state">
          <MagnifyingGlass size={28} />
          <h3>No transactions match</h3>
          <p>Try another search or a different time period.</p>
        </div>
      )}
    </div>
  );
}
