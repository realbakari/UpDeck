# Security

UpDeck runs entirely in your browser with your own Up personal access token. There's no UpDeck server, and the only place it sends requests is `https://api.up.com.au`. This is how I've built it to keep the token and your banking data safe, and where the limits are.

## Reporting a problem

Please [open an issue](https://github.com/realbakari/UpDeck/issues) without any token, passphrase or banking details. If you think your token has leaked, revoke it in the Up app straight away.

## The token

- You paste the token into a password field. It goes over the extension's internal messaging to the background script, and the field is cleared. The background never sends the token back to the page.
- It's encrypted with Web Crypto: AES-256-GCM with a random 96-bit IV and an authenticated format label. The key comes from your passphrase through PBKDF2-HMAC-SHA-256 with 600,000 iterations and a random 128-bit salt, and can't be exported. The passphrase is never saved.
- The only things stored are the encrypted token (`storage.local`), a failed-unlock counter (`storage.session`, cleared when the browser quits) and your light/dark choice (`localStorage`). No plaintext token, passphrase, transactions or balances are saved.
- The stored record is validated before decryption, and its key-derivation settings are fixed, so a tampered record can't force unlimited work.
- A session lasts five minutes. The deadline is checked on every request even if a timer runs late. Locking aborts requests in flight and throws away their results, and every open UpDeck tab locks too. A tab also locks when you switch away from it.
- Wrong passphrases trigger a growing delay. It's kept in session storage, so restarting an idle service worker doesn't reset it.
- While unlocked, the token and your data live in JavaScript memory. Strings can't be reliably wiped, so I clear byte buffers where I can, but garbage collection, memory dumps, swap and backups are outside the extension's control.

## Talking to Up

- Manifest V3 with two permissions: `storage` and `https://api.up.com.au/*`. No content scripts, no access to your browsing, no web-accessible resources and no external messaging.
- The background only accepts messages from UpDeck's own `index.html`. Every message is schema-checked and names a typed operation. The page can't pick a URL or HTTP method.
- Requests are limited to an allowlist of Up's documented endpoints on that exact origin. Pagination links must stay on the endpoint they started on; anything unexpected, looping or too long is refused.
- Requests send no cookies or referrer, don't follow redirects, aren't cached and time out after 20 seconds. Error bodies and the token are never logged or shown.
- The only changes UpDeck can make are a transaction's category, its tags, and webhooks. Each one needs a confirmation step in the UI. Changes run one at a time and are never retried automatically, because Up may already have applied one that timed out; UpDeck asks you to refresh and check instead. Reads can run in parallel.
- The content security policy only allows scripts and fonts from the package and connections to Up, and blocks plugins, forms and framing. There's no `eval` and no remote code. Inline styles are allowed for layout and charts.
- Validation uses `zod/v3`, which doesn't rely on `eval`. Merchant and account names are rendered as React text, never as HTML.
- In Firefox, the manifest declares `authenticationInfo` (the token is sent to Up) and `financialAndPaymentInfo` (category and tag changes go back to Up), using [Mozilla's data consent categories](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). Nothing goes to me or anyone else.
- The web preview can't connect to Up and has no token field. Its data is made up.

## Insights and exports

- Pay detection, subscriptions, comparisons, the 2Up split and tag totals are worked out in the page from data that's already loaded. No analytics, AI or other service sees your transactions.
- CSV files are built on your device. Cells starting with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading `'`, so spreadsheet apps don't run merchant names as formulas.

## Receipts, logos and webhooks

- Merchant logos ship inside the extension. Merchant names are never sent to a logo service.
- Receipt download links from Up are temporary. They stay in memory and only open when you click, in a new tab with `noopener` and `noreferrer`. Only public HTTPS links without embedded credentials are accepted, and the token is never added. The file host sees the download, and the browser may keep it in its history.
- A webhook tells Up to send event IDs and timestamps to a server you choose, even while UpDeck is locked or removed. UpDeck explains this before you create one. Removing the extension doesn't delete webhooks; delete them in Connections.
- A webhook's signing secret is shown once, kept in memory while its details are open, and cleared when you close them or UpDeck locks. Copying it puts it on your clipboard. It's never stored.
- The example receiver in `examples/` checks Up's HMAC signature before parsing, records each event once, and only then acknowledges it. It's a separate server you'd run yourself. Its database isn't encrypted, so protect that server.

## Limits

- Encryption protects the saved token, not an unlocked UpDeck on a device with malware, a compromised browser, a bad future dependency, or someone using your unlocked computer.
- A weak passphrase can be guessed offline if someone copies the encrypted record. The unlock delay only slows guessing inside the extension.
- An Up token isn't read-only. Outside UpDeck, a stolen token can do more than UpDeck does, so use Up's expiry and revoke controls.
- UpDeck has automated tests for encryption, the API boundary, sessions and the UI. It hasn't had an independent security audit or penetration test.
