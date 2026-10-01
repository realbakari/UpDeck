import browser from 'webextension-polyfill';
import { z } from 'zod/v3';
import { requestSchema, type Reply } from './domain';
import type { Operation } from './api-model';
import { decryptToken, encryptToken } from './security/vault';
import { executeOperation, fetchSnapshot, ping, UpError } from './security/up-api';

browser.action.onClicked.addListener(() => {
  void browser.tabs.create({ url: browser.runtime.getURL('index.html') });
});

let token: string | null = null;
let expiresAt = 0;
let generation = 0;
let controller = new AbortController();
let busy = false;
let lockTimer: ReturnType<typeof setTimeout> | undefined;
const SESSION_MS = 5 * 60_000;
const READ_OPERATIONS = new Set<Operation['op']>([
  'accounts',
  'account',
  'transactions',
  'transaction',
  'attachments',
  'attachment',
  'categories',
  'category',
  'tags',
  'ping',
  'webhooks',
  'webhook',
  'webhookLogs',
]);
// Kept in session storage so restarting an idle service worker doesn't reset the backoff.
const guardSchema = z.object({ attempts: z.number().int().min(0), retryAfter: z.number() });
async function readGuard() {
  const stored = await browser.storage.session.get('unlockGuard');
  const parsed = guardSchema.safeParse(stored.unlockGuard);
  return parsed.success ? parsed.data : { attempts: 0, retryAfter: 0 };
}
function lock() {
  token = null;
  expiresAt = 0;
  generation++;
  controller.abort();
  controller = new AbortController();
  clearTimeout(lockTimer);
  void browser.runtime.sendMessage({ kind: 'locked' }).catch(() => undefined);
}
function startSession(value: string) {
  token = value;
  expiresAt = Date.now() + SESSION_MS;
  clearTimeout(lockTimer);
  lockTimer = setTimeout(lock, SESSION_MS);
}
export function allowedSender(sender: browser.Runtime.MessageSender) {
  if (sender.id !== browser.runtime.id || !sender.url) return false;
  const url = new URL(sender.url);
  return url.href === browser.runtime.getURL('index.html');
}
browser.runtime.onMessage.addListener(
  async (input: unknown, sender: browser.Runtime.MessageSender): Promise<Reply> => {
    if (!allowedSender(sender)) return { kind: 'error', message: 'Request blocked.', locked: true };
    if (expiresAt && Date.now() >= expiresAt) lock();
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) {
      const kind = (input as { kind?: unknown } | null)?.kind;
      // Field paths only: never log the values, which may be credentials.
      const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
      console.warn(`UpDeck rejected a ${String(kind)} request. Invalid: ${fields || 'shape'}`);
      return {
        kind: 'error',
        message:
          kind === 'setup'
            ? 'Check your token (it starts with up:) and use a passphrase of at least 14 characters.'
            : kind === 'unlock'
              ? 'Enter your passphrase.'
              : 'UpDeck couldn’t send that request to Up. Refresh and try again.',
        locked: !token,
      };
    }
    const request = parsed.data;
    if (request.kind === 'lock') {
      lock();
      return { kind: 'ok' };
    }
    if (request.kind === 'status') {
      const stored = await browser.storage.local.get('vault');
      return { kind: 'status', configured: Boolean(stored.vault), unlocked: Boolean(token) };
    }
    // Reads may overlap. Anything that changes the vault, the session or bank data runs alone.
    const exclusive =
      request.kind !== 'snapshot' &&
      !(request.kind === 'api' && READ_OPERATIONS.has(request.operation.op));
    if (exclusive && busy)
      return {
        kind: 'error',
        message: 'Another change is finishing. Try again in a moment.',
        locked: !token,
      };
    if (exclusive) busy = true;
    const epoch = generation;
    const activeSignal = controller.signal;
    try {
      switch (request.kind) {
        case 'reset':
          lock();
          await browser.storage.local.remove('vault');
          return { kind: 'ok' };
        case 'setup': {
          if ((await browser.storage.local.get('vault')).vault)
            throw new UpError(
              'Disconnect the current token in Settings before connecting a new one.',
            );
          await ping(request.token, activeSignal);
          const vault = await encryptToken(request.token, request.passphrase);
          if (generation !== epoch) throw new UpError('UpDeck locked part-way through. Try again.');
          await browser.storage.local.set({ vault });
          if (generation !== epoch)
            throw new UpError('UpDeck locked part-way through. Unlock it to continue.');
          startSession(request.token);
          return { kind: 'ok' };
        }
        case 'unlock': {
          const guard = await readGuard();
          if (Date.now() < guard.retryAfter)
            throw new UpError('Please wait before trying another passphrase.');
          const stored = await browser.storage.local.get('vault');
          let value: string;
          try {
            value = await decryptToken(stored.vault, request.passphrase);
          } catch {
            const attempts = guard.attempts + 1;
            const retryAfter = Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
            await browser.storage.session.set({ unlockGuard: { attempts, retryAfter } });
            throw new UpError('That passphrase didn’t work. Wait a moment and try again.');
          }
          if (generation !== epoch) throw new UpError('UpDeck locked part-way through. Try again.');
          await browser.storage.session.remove('unlockGuard');
          startSession(value);
          return { kind: 'ok' };
        }
        case 'snapshot': {
          if (!token) throw new UpError('UpDeck is locked. Unlock it to refresh.');
          const data = await fetchSnapshot(token, activeSignal);
          if (generation !== epoch || Date.now() >= expiresAt)
            throw new UpError('UpDeck is locked. Unlock it to continue.');
          return { kind: 'snapshot', data };
        }
        case 'api': {
          if (!token) throw new UpError('UpDeck is locked. Unlock it to continue.');
          const result = await executeOperation(request.operation, token, activeSignal);
          if (generation !== epoch || Date.now() >= expiresAt)
            throw new UpError(
              'Your session ended. Refresh to check the result before repeating an action.',
            );
          return { kind: 'api', result };
        }
      }
    } catch (error) {
      if (error instanceof UpError && error.expired) lock();
      return {
        kind: 'error',
        message:
          error instanceof UpError ? error.message : 'Couldn’t load your data safely. Try again.',
        locked: !token,
      };
    } finally {
      if (exclusive) busy = false;
    }
  },
);
