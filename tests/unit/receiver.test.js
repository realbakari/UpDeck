import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acceptEvent, openInbox, validSignature } from '../../examples/webhook-receiver.mjs';
const secret = 'synthetic-signing-secret';
const fixture = {
  data: {
    type: 'webhook-events',
    id: 'event-1',
    attributes: { eventType: 'TRANSACTION_CREATED', createdAt: '2026-10-01T00:00:00Z' },
    relationships: {
      webhook: { data: { id: 'hook-1' } },
      transaction: { data: { id: 'transaction-1' } },
    },
  },
};
const body = Buffer.from(JSON.stringify(fixture));
const sign = (value) => createHmac('sha256', secret).update(value).digest('hex');
let directory;
afterEach(() => {
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
});
describe('optional webhook receiver', () => {
  it('verifies the exact raw bytes and refuses malformed signatures', () => {
    expect(validSignature(body, sign(body), secret)).toBe(true);
    for (const signature of [undefined, [], '0'.repeat(63), 'z'.repeat(64), '0'.repeat(64)])
      expect(validSignature(body, signature, secret)).toBe(false);
    expect(validSignature(Buffer.concat([body, Buffer.from(' ')]), sign(body), secret)).toBe(false);
  });
  it('acknowledges only durable events and deduplicates across restarts', () => {
    directory = mkdtempSync(join(tmpdir(), 'updeck-inbox-'));
    const path = join(directory, 'inbox.sqlite');
    let inbox = openInbox(path);
    expect(acceptEvent(body, sign(body), secret, 'hook-1', inbox)).toBe(200);
    expect(inbox.save(fixture.data, body)).toBe(0);
    inbox.close();
    inbox = openInbox(path);
    expect(inbox.save(fixture.data, body)).toBe(0);
    inbox.close();
    expect(
      acceptEvent(body, sign(body), secret, 'hook-1', {
        save() {
          throw new Error('disk full');
        },
      }),
    ).toBe(503);
  });
  it('rejects unsigned payloads, another webhook and malformed events before persistence', () => {
    const inbox = {
      save() {
        throw new Error('Should not persist');
      },
    };
    expect(acceptEvent(body, '0'.repeat(64), secret, 'hook-1', inbox)).toBe(401);
    expect(acceptEvent(body, sign(body), secret, 'other-hook', inbox)).toBe(400);
    const malformed = Buffer.from('{');
    expect(acceptEvent(malformed, sign(malformed), secret, 'hook-1', inbox)).toBe(400);
    const missingTransaction = Buffer.from(
      JSON.stringify({
        data: { ...fixture.data, relationships: { webhook: { data: { id: 'hook-1' } } } },
      }),
    );
    expect(acceptEvent(missingTransaction, sign(missingTransaction), secret, 'hook-1', inbox)).toBe(
      400,
    );
  });
});
