import type { Transaction } from './domain';
import type { BankTransaction } from './api-model';

export function toTransaction(
  t: BankTransaction,
  names: Map<string, string> = new Map(),
): Transaction {
  if (t.attributes.amount.currencyCode !== 'AUD')
    throw new Error('Unexpected account currency. Amounts were not combined.');
  return {
    id: t.id,
    description: t.attributes.description,
    amount: t.attributes.amount.valueInBaseUnits,
    createdAt: t.attributes.createdAt,
    pending: t.attributes.status === 'HELD',
    accountId: t.relationships.account.data?.id ?? '',
    transfer: Boolean(t.relationships.transferAccount.data),
    category:
      names.get(t.relationships.category.data?.id ?? '') ??
      t.relationships.category.data?.id ??
      'Uncategorised',
    details: t,
  };
}
