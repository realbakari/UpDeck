# Up API coverage

Checked against the [official API reference](https://developer.up.com.au/) on 1 October 2026. The adapter implements all **20 documented HTTP operations**, plus an optional receiver for webhook callbacks. Account-scoped and global transaction lists share one typed operation. This is coverage of the public API, not every feature of the Up mobile app.

| Method and path under `/api/v1`                   | UpDeck interface                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /accounts`                                   | Accounts, account type and individual/joint filters, pagination; overview cash balances           |
| `GET /accounts/{id}`                              | Account details, opening date, ownership and balance                                              |
| `GET /accounts/{id}/transactions`                 | Account → Transactions, with the same filters as global history                                   |
| `GET /attachments`                                | Receipts library, pagination                                                                      |
| `GET /attachments/{id}`                           | Fresh temporary download link, expiry and file metadata; linked transaction                       |
| `GET /categories`                                 | Categories & tags, parent filter; transaction category picker                                     |
| `GET /categories/{id}`                            | Category details, parent and children                                                             |
| `PATCH /transactions/{id}/relationships/category` | Reviewed category change or clear; rejects ineligible transactions and parent categories          |
| `GET /tags`                                       | Tags library with pagination; click a tag to filter history                                       |
| `POST /transactions/{id}/relationships/tags`      | Reviewed tag addition, unique labels, six-tag limit                                               |
| `DELETE /transactions/{id}/relationships/tags`    | Reviewed tag removal                                                                              |
| `GET /transactions`                               | Full history, opaque pagination, account/status/category/tag/date filters                         |
| `GET /transactions/{id}`                          | Complete transaction receipt and relationships                                                    |
| `GET /util/ping`                                  | Initial token validation and connection health check                                              |
| `GET /webhooks`                                   | Connections list with pagination                                                                  |
| `POST /webhooks`                                  | HTTPS endpoint setup, persistent-sharing disclosure and review, one-time signing secret           |
| `GET /webhooks/{id}`                              | Details and creation date                                                                         |
| `DELETE /webhooks/{id}`                           | Reviewed deletion                                                                                 |
| `POST /webhooks/{id}/ping`                        | Reviewed asynchronous test; delivery checked separately in logs                                   |
| `GET /webhooks/{id}/logs`                         | Delivery outcome, request/response body and status, pagination                                    |
| `POST {yourWebhookURL}` (callback)                | Optional Node receiver example, raw-body HMAC verification, durable event inbox and deduplication |

## Transaction detail fields

Description, raw bank text, message, held/settled status, created/settled time, transaction type, AUD amount, foreign amount, hold amount and foreign hold amount, round-up and boost, cashback amount and description, card purchase method and suffix, note, performing customer's display name, account/transfer account/category/parent category/tag/attachment relationships, and Up deep link. Financial calculations use validated integer base units. Foreign values use the currency's minor-unit exponent.

Up's public transaction schema does **not** return merchant logo URLs. UpDeck matches merchant names against 51 logos bundled from Simple Icons and uses an icon for the Up category otherwise. A match is a best guess from the name, not a verified merchant identity. No transaction descriptions are sent to a logo provider.

## Pagination and history

The overview loads all pages for its 90-day window, up to a defensive limit of 100 pages per endpoint; excessive or cyclic pagination fails explicitly. The Transactions screen can browse all time, loading additional pages on demand. Search and totals clearly refer to loaded rows when more history remains. Account, tag, receipt, webhook and delivery-log lists support additional pages. Cursors are opaque and must remain on the expected Up endpoint; no token follows a redirect or an external cursor.

## Public API limits

There are no public operations here for payments, creating accounts or Savers, changing Saver goals, modifying notes, uploading attachments, editing merchant branding, Pay Splitting, automatic transfers, Upcoming or the app's Spendable Balance. UpDeck displays available account balances and provides its own session-only Saver targets. It does not fabricate these mobile-app features or make undocumented requests.

Webhook subscriptions persist at Up when the extension is locked, disconnected or removed. Delete a webhook in Connections to stop it. The extension cannot receive an inbound public webhook or provide always-on background syncing. See [the optional receiver](../examples/README.md).

## Testing

Contract tests cover every operation above with mocked responses: routes, write bodies, pagination, confirmation, eligibility, limits, errors and money validation. The packaged-extension test runs the real background script against a mocked Up API and checks the exact category, tag and financial-year requests it sends. I use UpDeck with my own Up account, but the automated tests never touch a real one, and I haven't tested real webhook deliveries.
