# Reviewer notes

## Chrome Web Store

Paste into **Test instructions** (or the notes field):

```text
UpDeck is an unofficial dashboard for customers of Up, an Australian bank. It uses Up's public API with the user's own personal access token. It is not affiliated with Up.

HOW TO TEST WITHOUT AN UP ACCOUNT
1. Click the toolbar icon. A full tab opens with the connect screen.
2. Click "Try it with sample data". Every screen works with built-in, clearly labelled sample data: Overview, Insights, Transactions (open any transaction), Savers, Accounts, Receipts, Categories & tags, Connections and Settings. Category and tag changes in sample mode stay in memory, and no network requests are made.
3. The moon/sun button switches light and dark mode. The eye button hides all amounts. The lock button returns to the connect screen.

WHY THERE ARE NO TEST CREDENTIALS
A live connection needs an Up bank account, which is only available to Australian residents. Up's API Acceptable Use Policy forbids sharing a personal access token with anyone (https://up.com.au/api-acceptable-use-policy/), so I can't provide one.

WHAT THE LIVE MODE DOES
- The token is checked against https://api.up.com.au/api/v1/util/ping, then encrypted with the user's passphrase (AES-256-GCM, PBKDF2-SHA-256, 600,000 iterations) and saved in chrome.storage.local. The passphrase is never stored. The session locks after five minutes.
- The only host contacted is https://api.up.com.au. Requests omit cookies and referrers, reject redirects and time out after 20 seconds. URLs come from an allowlist of Up's documented endpoints.
- Changes (a transaction's category or tags, webhooks) are only sent after the user confirms a dialog. The API can't move money.
- No content scripts, no access to the user's browsing, no remote code, no analytics. Script source is limited to the package by the extension's content security policy.

Source code (MIT): https://github.com/realbakari/UpDeck
Privacy policy: https://github.com/realbakari/UpDeck/blob/main/PRIVACY.md
```

## Firefox Add-ons

Paste into **Notes to reviewer**:

```text
UpDeck is an unofficial dashboard for customers of Up, an Australian bank, using Up's public API with the user's own personal access token. Not affiliated with Up.

TESTING
Click the toolbar button, then "Try it with sample data" on the first screen. All screens work with labelled sample data and make no network requests. A live connection needs an Australian Up bank account, and Up's API policy forbids sharing tokens (https://up.com.au/api-acceptable-use-policy/), so no test credentials can be provided.

SOURCE CODE AND BUILD
The package is built with Vite (React + TypeScript) and esbuild, so it's bundled and minified, not obfuscated. Source: updeck-source-1.0.0.zip (also at https://github.com/realbakari/UpDeck).

Build on Node 24 and npm 11:
  npm ci
  npm run build
The Firefox package is written to dist/firefox/. It should match the uploaded updeck-firefox-1.0.0.zip. All dependencies come from npm through package-lock.json; nothing is downloaded at build time apart from those packages.
Optional: "npm test" runs the unit tests.

LINTER WARNINGS
web-ext lint reports 0 errors and 2 UNSAFE_VAR_ASSIGNMENT warnings in assets/index-*.js. Both are inside the bundled react-dom library, in its handling of dangerouslySetInnerHTML. UpDeck's own code never uses innerHTML, dangerouslySetInnerHTML, eval or new Function. Merchant names and other bank data are rendered as React text, which is escaped.

DATA AND NETWORK
- Only host: https://api.up.com.au (host permission). The only other permission is "storage".
- The token is encrypted with the user's passphrase (Web Crypto AES-256-GCM, PBKDF2-SHA-256, 600,000 iterations) and kept in storage.local. Session storage holds a failed-unlock counter. Banking data stays in memory while unlocked.
- data_collection_permissions declares authenticationInfo (the token is sent to Up) and financialAndPaymentInfo (category and tag changes are sent back to Up). Nothing goes to me or any other third party.
- Background script: messages are accepted only from the extension's own index.html, validated against a schema, and turned into requests from a fixed list of Up API endpoints.
```
