import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reply } from '../../src/domain';

const harness = vi.hoisted(() => ({
  handler: undefined as
    undefined | ((message: unknown, sender: { id: string; url: string }) => Promise<Reply>),
  stored: {} as Record<string, unknown>,
  session: {} as Record<string, unknown>,
  ping: vi.fn(),
  fetchSnapshot: vi.fn(),
  toolbar: undefined as undefined | (() => void),
  openTab: vi.fn().mockResolvedValue(undefined),
  broadcast: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('webextension-polyfill', () => ({
  default: {
    action: {
      onClicked: {
        addListener: (handler: () => void) => {
          harness.toolbar = handler;
        },
      },
    },
    tabs: { create: harness.openTab },
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      onMessage: {
        addListener: (handler: typeof harness.handler) => {
          harness.handler = handler;
        },
      },
      sendMessage: harness.broadcast,
    },
    storage: {
      local: {
        get: async () => harness.stored,
        set: async (value: Record<string, unknown>) => {
          Object.assign(harness.stored, value);
        },
        remove: async (key: string) => {
          delete harness.stored[key];
        },
      },
      session: {
        get: async () => harness.session,
        set: async (value: Record<string, unknown>) => {
          Object.assign(harness.session, value);
        },
        remove: async (key: string) => {
          delete harness.session[key];
        },
      },
    },
  },
}));
vi.mock('../../src/security/up-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/security/up-api')>();
  return { ...actual, ping: harness.ping, fetchSnapshot: harness.fetchSnapshot };
});
const trusted = { id: 'test-extension', url: 'chrome-extension://test-extension/index.html' };
async function message(input: unknown, sender = trusted) {
  if (!harness.handler) throw new Error('Background not initialized');
  return harness.handler(input, sender);
}
const setup = {
  kind: 'setup',
  token: 'up:yeah:only-a-fake-test-token',
  passphrase: 'a long test passphrase here',
};
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  harness.stored = {};
  harness.session = {};
  harness.ping.mockReset().mockResolvedValue(undefined);
  harness.fetchSnapshot.mockReset();
  harness.broadcast.mockClear();
  await import('../../src/background');
});
afterEach(() => vi.useRealTimers());
describe('extension session boundary', () => {
  it('opens a full browser tab from the toolbar', () => {
    harness.toolbar?.();
    expect(harness.openTab).toHaveBeenCalledWith({ url: trusted.url });
  });
  it('rejects websites, foreign extensions and non-UI extension paths', async () => {
    for (const sender of [
      { id: 'test-extension', url: 'https://example.com/' },
      { id: 'other', url: trusted.url },
      { id: 'test-extension', url: 'chrome-extension://test-extension/background.js' },
    ]) {
      expect(await message({ kind: 'status' }, sender)).toMatchObject({
        kind: 'error',
        message: 'Request blocked.',
      });
    }
  });
  it('persists only encrypted credentials and clears access at the five-minute deadline', async () => {
    expect(await message(setup)).toEqual({ kind: 'ok' });
    expect(JSON.stringify(harness.stored)).not.toContain(setup.token);
    expect(JSON.stringify(harness.stored)).not.toContain(setup.passphrase);
    expect(await message({ kind: 'status' })).toMatchObject({ unlocked: true, configured: true });
    await vi.advanceTimersByTimeAsync(300_001);
    expect(await message({ kind: 'snapshot' })).toMatchObject({ kind: 'error', locked: true });
    expect(harness.broadcast).toHaveBeenCalledWith({ kind: 'locked' });
  });
  it('prevents in-flight requests from restoring a locked session', async () => {
    await message(setup);
    let complete: ((value: unknown) => void) | undefined;
    harness.fetchSnapshot.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const pending = message({ kind: 'snapshot' });
    await message({ kind: 'lock' });
    complete?.({ accounts: [], transactions: [] });
    expect(await pending).toMatchObject({ kind: 'error', locked: true });
  });
  it('does not overwrite an existing vault and disconnect deletes it', async () => {
    await message(setup);
    expect(await message(setup)).toMatchObject({ kind: 'error' });
    expect(await message({ kind: 'reset' })).toEqual({ kind: 'ok' });
    expect(harness.stored).toEqual({});
    expect(await message({ kind: 'status' })).toMatchObject({ unlocked: false, configured: false });
  });
  it('keeps the unlock backoff when an idle service worker restarts', async () => {
    await message(setup);
    await message({ kind: 'lock' });
    expect(await message({ kind: 'unlock', passphrase: 'not the passphrase' })).toMatchObject({
      kind: 'error',
    });
    vi.resetModules();
    await import('../../src/background');
    expect(await message({ kind: 'unlock', passphrase: setup.passphrase })).toMatchObject({
      kind: 'error',
      message: 'Please wait before trying another passphrase.',
    });
    await vi.advanceTimersByTimeAsync(2_001);
    expect(await message({ kind: 'unlock', passphrase: setup.passphrase })).toEqual({ kind: 'ok' });
    expect(harness.session).toEqual({});
  });
  it('lets reads run in parallel', async () => {
    await message(setup);
    let complete: ((value: unknown) => void) | undefined;
    harness.fetchSnapshot.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const first = message({ kind: 'snapshot' });
    const second = message({ kind: 'snapshot' });
    complete?.({ accounts: [], transactions: [], syncedAt: '', since: '' });
    expect((await first).kind).not.toBe('error');
    expect((await second).kind).not.toBe('error');
  });
  it('names the failed request instead of blaming the token', async () => {
    await message(setup);
    expect(await message({ kind: 'api', operation: { op: 'transaction', id: '../x' } })).toEqual({
      kind: 'error',
      message: 'UpDeck couldn’t send that request to Up. Refresh and try again.',
      locked: false,
    });
  });
});
