# Optional Up webhook receiver

This example is separate from the extension. UpDeck does not need a backend. Use this only if you want Up to send event identifiers and timestamps to **your own HTTPS server**.

Requires Node.js 24. It uses the built-in SQLite module and no additional dependencies. It verifies `X-Up-Authenticity-Signature` against the exact raw bytes with HMAC-SHA-256 and constant-time comparison. It validates the expected webhook ID and event shape, writes to a durable SQLite inbox with a unique event ID, then acknowledges with HTTP 200. Retries of an already-stored event are acknowledged without inserting another row. A failed durable write receives 503 so Up can retry.

1. Place the receiver on a server you control. Configure a trusted reverse proxy to expose only `POST /up/events` over HTTPS, forwarding to `127.0.0.1:8787`. Apply request-size and rate limits at the proxy. Disable request-body logging.
2. Create a webhook in UpDeck's **Connections** screen using that HTTPS URL. Save the one-time signing secret and webhook ID in your server's secret manager.
3. Inject `UP_WEBHOOK_SECRET`, `UP_WEBHOOK_ID` and optionally `UP_WEBHOOK_DB` into the receiver process environment, then run `node examples/webhook-receiver.mjs`. Do not pass secrets on the command line or commit them.
4. Send a test from UpDeck and inspect its delivery logs. The receiver is never started or deployed by the extension.

SQLite uses WAL and `synchronous=FULL`; protect the database, WAL, filesystem and backups. Files are private to the server user but database contents are **not encrypted by this example**. Use encrypted storage and appropriate retention. The HTTP body is capped at 256 KiB and request time at 15 seconds, below Up's documented 30-second delivery timeout. The receiver does not log payloads, signatures or secrets.

The inbox deliberately separates acceptance from processing. Your own worker can read unprocessed rows, handle `PING`, fetch the latest transaction by ID for `TRANSACTION_CREATED` / `TRANSACTION_SETTLED`, remove its local record for `TRANSACTION_DELETED`, then mark `processed_at`. Keep processing idempotent. Deleted transactions cannot be fetched. Do not trust or follow arbitrary URLs from payloads. No bank API token is needed to receive events, and none is included in this example.

Up can retry events and rare settlement transitions can arrive as deletion plus creation. Retain event IDs for your replay/deduplication policy. This is a working receiver foundation, not a managed queue, deployment or transaction-sync service. Test and operate the server before relying on it. See [Up's webhook documentation](https://developer.up.com.au/#webhooks).
