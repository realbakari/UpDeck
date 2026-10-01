import { z } from 'zod/v3';
export const apiMoney = z.object({
  currencyCode: z.string().length(3),
  value: z.string().optional(),
  valueInBaseUnits: z.number().int().safe(),
});
export const relation = z.object({
  data: z.object({ id: z.string(), type: z.string().optional() }).nullable(),
});
const nullableRelation = relation.default({ data: null });
export const accountResource = z.object({
  id: z.string(),
  type: z.literal('accounts').optional(),
  attributes: z.object({
    displayName: z.string(),
    accountType: z.enum(['TRANSACTIONAL', 'SAVER', 'HOME_LOAN']),
    ownershipType: z.enum(['INDIVIDUAL', 'JOINT']),
    balance: apiMoney.extend({ currencyCode: z.literal('AUD') }),
    createdAt: z.string().optional(),
  }),
});
export const transactionResource = z.object({
  id: z.string(),
  type: z.literal('transactions').optional(),
  attributes: z.object({
    description: z.string(),
    amount: apiMoney.extend({ currencyCode: z.literal('AUD') }),
    createdAt: z.string().datetime({ offset: true }),
    status: z.enum(['HELD', 'SETTLED']),
    rawText: z.string().nullable().default(null),
    message: z.string().nullable().default(null),
    isCategorizable: z.boolean().default(false),
    holdInfo: z
      .object({ amount: apiMoney, foreignAmount: apiMoney.nullable() })
      .nullable()
      .default(null),
    roundUp: z
      .object({ amount: apiMoney, boostPortion: apiMoney.nullable() })
      .nullable()
      .default(null),
    cashback: z.object({ description: z.string(), amount: apiMoney }).nullable().default(null),
    foreignAmount: apiMoney.nullable().default(null),
    cardPurchaseMethod: z
      .object({ method: z.string(), cardNumberSuffix: z.string().nullable() })
      .nullable()
      .default(null),
    settledAt: z.string().nullable().default(null),
    transactionType: z.string().nullable().default(null),
    note: z.object({ text: z.string() }).nullable().default(null),
    performingCustomer: z.object({ displayName: z.string() }).nullable().default(null),
    deepLinkURL: z.string().nullable().default(null),
  }),
  relationships: z.object({
    account: relation,
    transferAccount: nullableRelation,
    category: nullableRelation,
    parentCategory: nullableRelation,
    tags: z.object({ data: z.array(z.object({ id: z.string() })) }).default({ data: [] }),
    attachment: nullableRelation,
  }),
});
export const categoryResource = z.object({
  id: z.string(),
  attributes: z.object({ name: z.string() }),
  relationships: z
    .object({
      parent: nullableRelation,
      children: z.object({ data: z.array(z.object({ id: z.string() })) }).default({ data: [] }),
    })
    .default({ parent: { data: null }, children: { data: [] } }),
});
export const attachmentResource = z.object({
  id: z.string(),
  attributes: z.object({
    createdAt: z.string().nullable(),
    fileURL: z.string().nullable(),
    fileURLExpiresAt: z.string(),
    fileExtension: z.string().nullable(),
    fileContentType: z.string().nullable(),
  }),
  relationships: z.object({ transaction: relation }),
});
export const tagResource = z.object({ id: z.string() });
export const webhookResource = z.object({
  id: z.string(),
  attributes: z.object({
    url: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
    secretKey: z.string().optional(),
  }),
});
export const webhookEventResource = z.object({
  id: z.string(),
  attributes: z.object({
    eventType: z.enum([
      'PING',
      'TRANSACTION_CREATED',
      'TRANSACTION_SETTLED',
      'TRANSACTION_DELETED',
    ]),
    createdAt: z.string(),
  }),
  relationships: z.object({ webhook: relation, transaction: relation.optional() }),
});
export const webhookLogResource = z.object({
  id: z.string(),
  attributes: z.object({
    request: z.object({ body: z.string() }),
    response: z.object({ statusCode: z.number().int(), body: z.string() }).nullable(),
    deliveryStatus: z.enum(['DELIVERED', 'UNDELIVERABLE', 'BAD_RESPONSE_CODE']),
    createdAt: z.string(),
  }),
  relationships: z.object({ webhookEvent: relation }),
});
export const pageLinks = z
  .object({ next: z.string().nullable().default(null), prev: z.string().nullable().default(null) })
  .default({ next: null, prev: null });
export function resourcePage<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: z.array(schema), links: pageLinks });
}
export type BankAccount = z.infer<typeof accountResource>;
export type BankTransaction = z.infer<typeof transactionResource>;
export type Category = z.infer<typeof categoryResource>;
export type Attachment = z.infer<typeof attachmentResource>;
export type Webhook = z.infer<typeof webhookResource>;
export type WebhookLog = z.infer<typeof webhookLogResource>;
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-]+$/);
const cursor = z.string().max(8192).optional();
const paging = { cursor, pageSize: z.number().int().min(1).max(100).optional() };
const label = z.string().trim().min(1).max(100);
const date = z.string().datetime({ offset: true }).optional();
export const publicHttpsUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !/^localhost$|\.localhost$|\.local$|^\[|^\d+\.\d+\.\d+\.\d+$|^\d+$/.test(url.hostname) &&
      url.hostname.includes('.')
    );
  }, 'Use a public HTTPS address with no embedded credentials.');
export const operationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('accounts'),
    ...paging,
    accountType: z.enum(['TRANSACTIONAL', 'SAVER', 'HOME_LOAN']).optional(),
    ownershipType: z.enum(['INDIVIDUAL', 'JOINT']).optional(),
  }),
  z.object({ op: z.literal('account'), id }),
  z.object({
    op: z.literal('transactions'),
    ...paging,
    accountId: id.optional(),
    since: date,
    until: date,
    status: z.enum(['HELD', 'SETTLED']).optional(),
    category: id.optional(),
    tag: label.optional(),
  }),
  z.object({ op: z.literal('transaction'), id }),
  z.object({ op: z.literal('attachments'), ...paging }),
  z.object({ op: z.literal('attachment'), id }),
  z.object({ op: z.literal('categories'), parent: id.optional() }),
  z.object({ op: z.literal('category'), id }),
  z.object({
    op: z.literal('categorize'),
    id,
    categoryId: id.nullable(),
    confirmed: z.literal(true),
  }),
  z.object({ op: z.literal('tags'), ...paging }),
  z.object({
    op: z.literal('addTags'),
    id,
    tags: z.array(label).min(1).max(6),
    confirmed: z.literal(true),
  }),
  z.object({
    op: z.literal('removeTags'),
    id,
    tags: z.array(label).min(1).max(6),
    confirmed: z.literal(true),
  }),
  z.object({ op: z.literal('ping') }),
  z.object({ op: z.literal('webhooks'), ...paging }),
  z.object({ op: z.literal('webhook'), id }),
  z.object({
    op: z.literal('createWebhook'),
    url: publicHttpsUrl.pipe(z.string().max(300)),
    description: z.string().max(64),
    confirmed: z.literal(true),
  }),
  z.object({ op: z.literal('deleteWebhook'), id, confirmed: z.literal(true) }),
  z.object({ op: z.literal('pingWebhook'), id, confirmed: z.literal(true) }),
  z.object({ op: z.literal('webhookLogs'), id, ...paging }),
]);
export type Operation = z.infer<typeof operationSchema>;
export const apiResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('accounts'), page: resourcePage(accountResource) }),
  z.object({ kind: z.literal('account'), data: accountResource }),
  z.object({ kind: z.literal('transactions'), page: resourcePage(transactionResource) }),
  z.object({ kind: z.literal('transaction'), data: transactionResource }),
  z.object({ kind: z.literal('attachments'), page: resourcePage(attachmentResource) }),
  z.object({ kind: z.literal('attachment'), data: attachmentResource }),
  z.object({ kind: z.literal('categories'), page: resourcePage(categoryResource) }),
  z.object({ kind: z.literal('category'), data: categoryResource }),
  z.object({ kind: z.literal('tags'), page: resourcePage(tagResource) }),
  z.object({ kind: z.literal('webhooks'), page: resourcePage(webhookResource) }),
  z.object({ kind: z.literal('webhook'), data: webhookResource }),
  z.object({ kind: z.literal('webhookLogs'), page: resourcePage(webhookLogResource) }),
  z.object({ kind: z.literal('webhookEvent'), data: webhookEventResource }),
  z.object({
    kind: z.literal('ping'),
    meta: z.object({ id: z.string(), statusEmoji: z.string() }),
  }),
  z.object({ kind: z.literal('saved') }),
]);
export type ApiResult = z.infer<typeof apiResultSchema>;
