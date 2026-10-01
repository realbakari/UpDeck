import { replySchema, type Request } from './domain';
import { z } from 'zod/v3';

export const isExtension = [
  'chrome-extension:',
  'moz-extension:',
  'safari-web-extension:',
].includes(location.protocol);
export async function send(request: Request) {
  if (!isExtension)
    throw new Error('Install the extension to connect Up. This preview only has sample data.');
  const { default: browser } = await import('webextension-polyfill');
  const reply = replySchema.parse(await browser.runtime.sendMessage(request));
  if (reply.kind === 'error') throw new Error(reply.message);
  return reply;
}
export async function onSessionLocked(callback: () => void) {
  const { default: browser } = await import('webextension-polyfill');
  const eventSchema = z.object({ kind: z.literal('locked') });
  const listener = (
    message: unknown,
    sender: import('webextension-polyfill').Runtime.MessageSender,
  ) => {
    if (sender.id === browser.runtime.id && eventSchema.safeParse(message).success) callback();
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
