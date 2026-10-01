import { toTransaction } from '../normalize';
import { z } from 'zod/v3';
import type { Snapshot } from '../domain';
import {
  accountResource,
  transactionResource,
  categoryResource,
  attachmentResource,
  tagResource,
  webhookResource,
  webhookEventResource,
  webhookLogResource,
  resourcePage,
  type Operation,
  type ApiResult,
} from '../api-model';

const BASE = 'https://api.up.com.au/api/v1/';
const envelope = z.object({
  data: z.array(z.unknown()),
  links: z.object({ next: z.string().nullable() }).optional(),
});

export class UpError extends Error {
  constructor(
    message: string,
    public readonly expired = false,
  ) {
    super(message);
  }
}
export function safeApiUrl(input: string) {
  const url = new URL(input, BASE);
  if (
    url.origin !== 'https://api.up.com.au' ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/api\/v1\/(?:accounts(?:\/[a-zA-Z0-9_-]+(?:\/transactions)?)?|transactions(?:\/[a-zA-Z0-9_-]+(?:\/relationships\/(?:category|tags))?)?|attachments(?:\/[a-zA-Z0-9_-]+)?|categories(?:\/[a-zA-Z0-9_-]+)?|tags|util\/ping|webhooks(?:\/[a-zA-Z0-9_-]+(?:\/(?:logs|ping))?)?)$/.test(
      url.pathname,
    )
  ) {
    throw new UpError('Up returned an unexpected link. The request was blocked.');
  }
  return url;
}
async function request(
  input: string,
  token: string,
  signal: AbortSignal,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<unknown> {
  const url = safeApiUrl(input);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    });
  } catch {
    throw new UpError(
      method === 'GET'
        ? 'Couldn’t reach Up. Check your connection and try again.'
        : 'The result of this change is unknown. Refresh and check Up before trying again.',
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new UpError(
      'Your Up token has expired or was revoked. Reconnect with a new token.',
      true,
    );
  if (response.status === 429)
    throw new UpError('Up’s request limit was reached. Wait a minute before refreshing.');
  if (response.status === 404)
    throw new UpError('That item was not found. It may have been removed.');
  if (response.status === 400 || response.status === 422)
    throw new UpError(
      'Up could not accept this change. Check the fields, category eligibility and tag/webhook limits.',
    );
  if (!response.ok)
    throw new UpError(
      method === 'GET'
        ? 'Up isn’t responding right now. Try again shortly.'
        : 'The result of this change is unknown. Refresh before trying again.',
    );
  if (response.status === 204) return null;
  return response.json();
}
export async function ping(token: string, signal: AbortSignal) {
  await request('util/ping', token, signal);
}
async function list(path: string, token: string, signal: AbortSignal) {
  const all: unknown[] = [];
  const visited = new Set<string>();
  let next: string | null = path;
  const expectedPath = safeApiUrl(path).pathname;
  while (next) {
    const url = safeApiUrl(next);
    if (url.pathname !== expectedPath || visited.has(url.href) || visited.size >= 100) {
      throw new UpError('Couldn’t load a complete history. Try again later.');
    }
    visited.add(url.href);
    const page = envelope.parse(await request(url.href, token, signal));
    all.push(...page.data);
    next = page.links?.next ?? null;
  }
  return all;
}
export async function fetchSnapshot(
  token: string,
  signal: AbortSignal,
  now = new Date(),
): Promise<Snapshot> {
  const since = new Date(now);
  since.setDate(since.getDate() - 89);
  since.setHours(0, 0, 0, 0);
  const query = new URLSearchParams({ 'page[size]': '100', 'filter[since]': since.toISOString() });
  const [rawAccounts, rawTransactions, rawCategories] = await Promise.all([
    list('accounts?page[size]=100', token, signal),
    list(`transactions?${query}`, token, signal),
    list('categories', token, signal),
  ]);
  const names = new Map(
    z
      .array(categoryResource)
      .parse(rawCategories)
      .map((c) => [c.id, c.attributes.name]),
  );
  return {
    accounts: z
      .array(accountResource)
      .parse(rawAccounts)
      .map((a) => ({
        id: a.id,
        name: a.attributes.displayName,
        type: a.attributes.accountType,
        balance: a.attributes.balance.valueInBaseUnits,
        joint: a.attributes.ownershipType === 'JOINT',
      })),
    transactions: z
      .array(transactionResource)
      .parse(rawTransactions)
      .map((t) => toTransaction(t, names)),
    syncedAt: now.toISOString(),
    since: since.toISOString(),
  };
}

export async function executeOperation(
  operation: Operation,
  token: string,
  signal: AbortSignal,
): Promise<ApiResult> {
  const one = async <T extends z.ZodTypeAny>(path: string, schema: T): Promise<z.output<T>> =>
    schema.parse(z.object({ data: z.unknown() }).parse(await request(path, token, signal)).data);
  const page = async <T extends z.ZodTypeAny>(path: string, schema: T, cursor?: string) => {
    const target = cursor ?? path;
    if (safeApiUrl(target).pathname !== safeApiUrl(path).pathname)
      throw new UpError('Up returned an unexpected page link. The request was blocked.');
    return resourcePage(schema).parse(await request(target, token, signal));
  };
  const query = (filters: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== undefined) params.set(key, String(value));
    return `?${params}`;
  };
  const write = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) =>
    request(path, token, signal, method, body);
  switch (operation.op) {
    case 'accounts':
      return {
        kind: 'accounts',
        page: await page(
          'accounts' +
            query({
              'page[size]': operation.pageSize ?? 100,
              'filter[accountType]': operation.accountType,
              'filter[ownershipType]': operation.ownershipType,
            }),
          accountResource,
          operation.cursor,
        ),
      };
    case 'account':
      return { kind: 'account', data: await one(`accounts/${operation.id}`, accountResource) };
    case 'transactions': {
      if (
        operation.since &&
        operation.until &&
        new Date(operation.since) > new Date(operation.until)
      )
        throw new UpError('The start date must be before the end date.');
      const path = operation.accountId
        ? `accounts/${operation.accountId}/transactions`
        : 'transactions';
      return {
        kind: 'transactions',
        page: await page(
          path +
            query({
              'page[size]': operation.pageSize ?? 100,
              'filter[since]': operation.since,
              'filter[until]': operation.until,
              'filter[status]': operation.status,
              'filter[category]': operation.category,
              'filter[tag]': operation.tag,
            }),
          transactionResource,
          operation.cursor,
        ),
      };
    }
    case 'transaction':
      return {
        kind: 'transaction',
        data: await one(`transactions/${operation.id}`, transactionResource),
      };
    case 'attachments':
      return {
        kind: 'attachments',
        page: await page(
          'attachments' + query({ 'page[size]': operation.pageSize ?? 100 }),
          attachmentResource,
          operation.cursor,
        ),
      };
    case 'attachment':
      return {
        kind: 'attachment',
        data: await one(`attachments/${operation.id}`, attachmentResource),
      };
    case 'categories':
      return {
        kind: 'categories',
        page: await page(
          'categories' + query({ 'filter[parent]': operation.parent }),
          categoryResource,
        ),
      };
    case 'category':
      return { kind: 'category', data: await one(`categories/${operation.id}`, categoryResource) };
    case 'tags':
      return {
        kind: 'tags',
        page: await page(
          'tags' + query({ 'page[size]': operation.pageSize ?? 100 }),
          tagResource,
          operation.cursor,
        ),
      };
    case 'categorize': {
      const transaction = await one(`transactions/${operation.id}`, transactionResource);
      if (!transaction.attributes.isCategorizable)
        throw new UpError('This transaction cannot be categorised.');
      if (operation.categoryId) {
        const category = await one(`categories/${operation.categoryId}`, categoryResource);
        if (!category.relationships.parent.data)
          throw new UpError('Choose a child category, not a top-level category.');
      }
      await write(`transactions/${operation.id}/relationships/category`, 'PATCH', {
        data: operation.categoryId ? { type: 'categories', id: operation.categoryId } : null,
      });
      return { kind: 'saved' };
    }
    case 'addTags':
    case 'removeTags': {
      const tags = [...new Set(operation.tags)];
      if (operation.op === 'addTags') {
        const transaction = await one(`transactions/${operation.id}`, transactionResource);
        if (new Set([...transaction.relationships.tags.data.map((t) => t.id), ...tags]).size > 6)
          throw new UpError('A transaction can have up to six tags. Remove a tag first.');
      }
      await write(
        `transactions/${operation.id}/relationships/tags`,
        operation.op === 'addTags' ? 'POST' : 'DELETE',
        { data: tags.map((id) => ({ type: 'tags', id })) },
      );
      return { kind: 'saved' };
    }
    case 'ping':
      return {
        kind: 'ping',
        ...z
          .object({ meta: z.object({ id: z.string(), statusEmoji: z.string() }) })
          .parse(await request('util/ping', token, signal)),
      };
    case 'webhooks':
      return {
        kind: 'webhooks',
        page: await page(
          'webhooks' + query({ 'page[size]': operation.pageSize ?? 100 }),
          webhookResource,
          operation.cursor,
        ),
      };
    case 'webhook':
      return { kind: 'webhook', data: await one(`webhooks/${operation.id}`, webhookResource) };
    case 'createWebhook':
      return {
        kind: 'webhook',
        ...z.object({ data: webhookResource }).parse(
          await write('webhooks', 'POST', {
            data: {
              attributes: { url: operation.url, description: operation.description || null },
            },
          }),
        ),
      };
    case 'deleteWebhook':
      await write(`webhooks/${operation.id}`, 'DELETE');
      return { kind: 'saved' };
    case 'pingWebhook':
      return {
        kind: 'webhookEvent',
        ...z
          .object({ data: webhookEventResource })
          .parse(await write(`webhooks/${operation.id}/ping`, 'POST')),
      };
    case 'webhookLogs':
      return {
        kind: 'webhookLogs',
        page: await page(
          `webhooks/${operation.id}/logs` + query({ 'page[size]': operation.pageSize ?? 100 }),
          webhookLogResource,
          operation.cursor,
        ),
      };
  }
}
