import { z } from 'zod/v3';
import { apiResultSchema, operationSchema, transactionResource } from './api-model';

const cents = z.number().int().safe();
export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['SAVER', 'TRANSACTIONAL', 'HOME_LOAN']),
  balance: cents,
  joint: z.boolean(),
});
export const transactionSchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: cents,
  createdAt: z.string().datetime({ offset: true }),
  category: z.string(),
  accountId: z.string(),
  pending: z.boolean(),
  transfer: z.boolean(),
  details: transactionResource.optional(),
});
export const snapshotSchema = z.object({
  accounts: z.array(accountSchema),
  transactions: z.array(transactionSchema),
  syncedAt: z.string(),
  since: z.string(),
});
export type Account = z.infer<typeof accountSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export const tokenSchema = z
  .string()
  .trim()
  .min(20)
  .max(4096)
  .regex(/^up:[A-Za-z0-9:_./+=-]+$/, 'Enter a valid Up personal access token.');
export const passphraseSchema = z.string().min(14, 'Use at least 14 characters.').max(256);
export const requestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status') }),
  z.object({ kind: z.literal('setup'), token: tokenSchema, passphrase: passphraseSchema }),
  z.object({ kind: z.literal('unlock'), passphrase: z.string().min(1).max(256) }),
  z.object({ kind: z.literal('snapshot') }),
  z.object({ kind: z.literal('lock') }),
  z.object({ kind: z.literal('reset') }),
  z.object({ kind: z.literal('api'), operation: operationSchema }),
]);
export type Request = z.infer<typeof requestSchema>;
export const replySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status'), configured: z.boolean(), unlocked: z.boolean() }),
  z.object({ kind: z.literal('snapshot'), data: snapshotSchema }),
  z.object({ kind: z.literal('ok') }),
  z.object({ kind: z.literal('api'), result: apiResultSchema }),
  z.object({ kind: z.literal('error'), message: z.string(), locked: z.boolean() }),
]);
export type Reply = z.infer<typeof replySchema>;

export function money(value: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value / 100);
}
export function periodTransactions(transactions: Transaction[], days: number, now = new Date()) {
  const since = new Date(now);
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);
  return transactions.filter((t) => new Date(t.createdAt) >= since && new Date(t.createdAt) <= now);
}
export function summarize(transactions: Transaction[]) {
  const external = transactions.filter((t) => !t.transfer);
  const spent = external.reduce((sum, t) => sum + Math.max(0, -t.amount), 0);
  const incoming = external.reduce((sum, t) => sum + (t.pending ? 0 : Math.max(0, t.amount)), 0);
  const categories = new Map<string, number>();
  for (const t of external)
    if (t.amount < 0) categories.set(t.category, (categories.get(t.category) ?? 0) - t.amount);
  return { spent, incoming, categories: [...categories].sort((a, b) => b[1] - a[1]) };
}
export function roundUpTotal(transactions: Transaction[]) {
  return transactions.reduce(
    (sum, t) => sum + Math.abs(t.details?.attributes.roundUp?.amount.valueInBaseUnits ?? 0),
    0,
  );
}
const leadingEmoji =
  /^(\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|[\u{fe0f}\u{1f3fb}-\u{1f3ff}])*)\s*/u;
/** Up Saver names usually start with the emoji chosen in the app. */
export function saverLabel(name: string) {
  const match = leadingEmoji.exec(name);
  return match
    ? { emoji: match[1], name: name.slice(match[0].length) || name }
    : { emoji: null, name };
}
