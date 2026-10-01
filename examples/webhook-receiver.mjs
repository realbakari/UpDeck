import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validSignature(rawBody, signature, secret) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function openInbox(path) {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL, received_at TEXT NOT NULL,
    payload TEXT NOT NULL, processed_at TEXT
  )`);
  const insert = db.prepare(
    'INSERT INTO events (id, event_type, received_at, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
  );
  return {
    save(event, rawBody) {
      return insert.run(
        event.id,
        event.attributes.eventType,
        new Date().toISOString(),
        rawBody.toString('utf8'),
      ).changes;
    },
    close() {
      db.close();
    },
  };
}

export function acceptEvent(rawBody, signature, secret, webhookId, inbox) {
  if (!validSignature(rawBody, signature, secret)) return 401;
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8')).data;
  } catch {
    return 400;
  }
  const kinds = ['PING', 'TRANSACTION_CREATED', 'TRANSACTION_SETTLED', 'TRANSACTION_DELETED'];
  const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
  if (
    !event ||
    event.type !== 'webhook-events' ||
    !validId(event.id) ||
    !kinds.includes(event.attributes?.eventType) ||
    typeof event.attributes.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(event.attributes.createdAt)) ||
    event.relationships?.webhook?.data?.id !== webhookId
  )
    return 400;
  if (event.attributes.eventType !== 'PING' && !validId(event.relationships?.transaction?.data?.id))
    return 400;
  try {
    inbox.save(event, rawBody);
  } catch {
    return 503;
  }
  return 200;
}

export function receiver({ secret, webhookId, inbox }) {
  if (!secret || !webhookId)
    throw new Error('A signing secret and expected webhook ID are required.');
  return createServer(
    { requestTimeout: 15_000, headersTimeout: 10_000, maxHeaderSize: 8192 },
    async (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      if (request.method !== 'POST' || request.url !== '/up/events') {
        response.writeHead(404).end();
        request.resume();
        return;
      }
      let size = 0;
      const chunks = [];
      try {
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 256 * 1024) {
            response.writeHead(413).end();
            request.destroy();
            return;
          }
          chunks.push(chunk);
        }
        const status = acceptEvent(
          Buffer.concat(chunks),
          request.headers['x-up-authenticity-signature'],
          secret,
          webhookId,
          inbox,
        );
        response.writeHead(status).end(status === 200 ? 'OK' : 'Rejected');
      } catch {
        if (!response.headersSent) response.writeHead(400).end();
      }
    },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.umask(0o077);
  const secret = process.env.UP_WEBHOOK_SECRET;
  const webhookId = process.env.UP_WEBHOOK_ID;
  if (!secret || !webhookId)
    throw new Error('Set UP_WEBHOOK_SECRET and UP_WEBHOOK_ID through your server secret manager.');
  const inbox = openInbox(process.env.UP_WEBHOOK_DB || './up-events.sqlite');
  const server = receiver({ secret, webhookId, inbox });
  server.listen(8787, '127.0.0.1', () =>
    console.log(
      'Up webhook receiver listening on 127.0.0.1:8787; configure your HTTPS reverse proxy.',
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () =>
      server.close(() => {
        inbox.close();
        process.exit(0);
      }),
    );
}
