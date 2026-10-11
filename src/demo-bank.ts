import {
  transactionResource,
  operationSchema,
  type Operation,
  type ApiResult,
  type BankAccount,
  type Category,
  type BankTransaction,
  type Webhook,
  type Attachment,
} from './api-model';
import type { Snapshot } from './domain';

export function createDemoBank(snapshot: Snapshot): (operation: Operation) => Promise<ApiResult> {
  const categories: Category[] = [
    {
      id: 'lifestyle',
      attributes: { name: 'Lifestyle' },
      relationships: { parent: { data: null }, children: { data: [] } },
    },
  ];
  const categoryId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  for (const name of new Set(snapshot.transactions.map((t) => t.category)))
    categories.push({
      id: categoryId(name),
      attributes: { name },
      relationships: { parent: { data: { id: 'lifestyle' } }, children: { data: [] } },
    });
  categories[0].relationships.children.data = categories.slice(1).map((c) => ({ id: c.id }));
  const accounts: BankAccount[] = snapshot.accounts.map((a) => ({
    id: a.id,
    attributes: {
      displayName: a.name,
      accountType: a.type,
      ownershipType: a.joint ? 'JOINT' : 'INDIVIDUAL',
      balance: { currencyCode: 'AUD', valueInBaseUnits: a.balance },
      createdAt: '2023-06-01T00:00:00Z',
    },
  }));
  const transactions: BankTransaction[] = snapshot.transactions.map((t, i) =>
    transactionResource.parse({
      id: t.id,
      attributes: {
        description: t.description,
        amount: { currencyCode: 'AUD', valueInBaseUnits: t.amount },
        createdAt: t.createdAt,
        status: t.pending ? 'HELD' : 'SETTLED',
        rawText: t.description.toUpperCase() + ' AU',
        isCategorizable: t.amount < 0,
        settledAt: t.pending ? null : t.createdAt,
        cardPurchaseMethod:
          t.amount < 0 ? { method: 'CONTACTLESS', cardNumberSuffix: '4242' } : null,
        transactionType: t.amount < 0 ? 'Purchase' : 'Direct Credit',
        note: i === 0 ? { text: 'Team coffee. Claim on expenses.' } : null,
        roundUp: t.details?.attributes.roundUp ?? null,
        performingCustomer: t.details?.attributes.performingCustomer ?? null,
        foreignAmount:
          i === 3 ? { currencyCode: 'JPY', valueInBaseUnits: -4800, value: '-4800' } : null,
      },
      relationships: {
        account: { data: { id: t.accountId } },
        category: { data: { id: categoryId(t.category) } },
        tags: { data: t.details?.relationships.tags.data ?? [] },
        attachment: { data: i === 0 ? { id: 'demo-receipt' } : null },
      },
    }),
  );
  const attachments: Attachment[] = [
    {
      id: 'demo-receipt',
      attributes: {
        createdAt: snapshot.syncedAt,
        fileURL: null,
        fileURLExpiresAt: snapshot.syncedAt,
        fileExtension: 'pdf',
        fileContentType: 'application/pdf',
      },
      relationships: { transaction: { data: { id: transactions[0]?.id ?? 'demo-0' } } },
    },
  ];
  const webhooks: Webhook[] = [];
  const find = <T extends { id: string }>(values: T[], id: string) => {
    const value = values.find((v) => v.id === id);
    if (!value) throw new Error('Sample item not found.');
    return value;
  };
  const paginate = <T>(
    items: T[],
    operation: { cursor?: string; pageSize?: number },
    path: string,
  ) => {
    const start = operation.cursor
      ? Number(new URL(operation.cursor).searchParams.get('demoOffset') ?? 0)
      : 0;
    const size = operation.pageSize ?? 20;
    return {
      data: items.slice(start, start + size),
      links: {
        next:
          start + size < items.length
            ? `https://api.up.com.au/api/v1/${path}?demoOffset=${start + size}`
            : null,
        prev:
          start > 0
            ? `https://api.up.com.au/api/v1/${path}?demoOffset=${Math.max(0, start - size)}`
            : null,
      },
    };
  };
  return async (input) => {
    const operation = operationSchema.parse(input);
    switch (operation.op) {
      case 'accounts':
        return {
          kind: 'accounts',
          page: paginate(
            accounts.filter(
              (a) =>
                (!operation.accountType || a.attributes.accountType === operation.accountType) &&
                (!operation.ownershipType ||
                  a.attributes.ownershipType === operation.ownershipType),
            ),
            operation,
            'accounts',
          ),
        };
      case 'account':
        return { kind: 'account', data: find(accounts, operation.id) };
      case 'transactions':
        return {
          kind: 'transactions',
          page: paginate(
            transactions.filter(
              (t) =>
                (!operation.accountId ||
                  t.relationships.account.data?.id === operation.accountId) &&
                (!operation.status || t.attributes.status === operation.status) &&
                (!operation.category ||
                  t.relationships.category.data?.id === operation.category ||
                  operation.category === 'lifestyle') &&
                (!operation.tag ||
                  t.relationships.tags.data.some((tag) => tag.id === operation.tag)) &&
                (!operation.since || t.attributes.createdAt >= operation.since) &&
                (!operation.until || t.attributes.createdAt <= operation.until),
            ),
            operation,
            operation.accountId ? `accounts/${operation.accountId}/transactions` : 'transactions',
          ),
        };
      case 'transaction':
        return { kind: 'transaction', data: structuredClone(find(transactions, operation.id)) };
      case 'categories':
        return {
          kind: 'categories',
          page: {
            data: categories.filter(
              (c) => !operation.parent || c.relationships.parent.data?.id === operation.parent,
            ),
            links: { next: null, prev: null },
          },
        };
      case 'category':
        return { kind: 'category', data: find(categories, operation.id) };
      case 'categorize': {
        const t = find(transactions, operation.id);
        if (!t.attributes.isCategorizable)
          throw new Error('This transaction cannot be categorised.');
        t.relationships.category.data = operation.categoryId ? { id: operation.categoryId } : null;
        return { kind: 'saved' };
      }
      case 'tags':
        return {
          kind: 'tags',
          page: paginate(
            [
              ...new Set(
                transactions.flatMap((t) => t.relationships.tags.data.map((tag) => tag.id)),
              ),
            ]
              .sort()
              .map((id) => ({ id })),
            operation,
            'tags',
          ),
        };
      case 'addTags': {
        const t = find(transactions, operation.id);
        const labels = [
          ...new Set([...t.relationships.tags.data.map((tag) => tag.id), ...operation.tags]),
        ];
        if (labels.length > 6) throw new Error('A transaction can have at most six tags.');
        t.relationships.tags.data = labels.map((id) => ({ id }));
        return { kind: 'saved' };
      }
      case 'removeTags': {
        const t = find(transactions, operation.id);
        t.relationships.tags.data = t.relationships.tags.data.filter(
          (tag) => !operation.tags.includes(tag.id),
        );
        return { kind: 'saved' };
      }
      case 'attachments':
        return { kind: 'attachments', page: paginate(attachments, operation, 'attachments') };
      case 'attachment':
        return { kind: 'attachment', data: find(attachments, operation.id) };
      case 'webhooks':
        return { kind: 'webhooks', page: paginate(webhooks, operation, 'webhooks') };
      case 'webhook':
        return { kind: 'webhook', data: find(webhooks, operation.id) };
      case 'createWebhook': {
        if (webhooks.length >= 10) throw new Error('Up permits up to ten webhooks.');
        const hook = {
          id: crypto.randomUUID(),
          attributes: {
            url: operation.url,
            description: operation.description,
            createdAt: new Date().toISOString(),
          },
        };
        webhooks.push(hook);
        return {
          kind: 'webhook',
          data: {
            ...hook,
            attributes: { ...hook.attributes, secretKey: 'demo-secret-not-for-production' },
          },
        };
      }
      case 'deleteWebhook': {
        const index = webhooks.findIndex((h) => h.id === operation.id);
        if (index >= 0) webhooks.splice(index, 1);
        return { kind: 'saved' };
      }
      case 'pingWebhook':
        return {
          kind: 'webhookEvent',
          data: {
            id: crypto.randomUUID(),
            attributes: { eventType: 'PING', createdAt: new Date().toISOString() },
            relationships: { webhook: { data: { id: operation.id } } },
          },
        };
      case 'webhookLogs':
        return { kind: 'webhookLogs', page: { data: [], links: { next: null, prev: null } } };
      case 'ping':
        return { kind: 'ping', meta: { id: 'demo-session', statusEmoji: '⚡️' } };
    }
  };
}
