# Verification: 1.0.0, 2 October 2026

- `npm run check`: 81 unit tests pass (encryption, background session and messaging, the API client, insights, CSV safety and the webhook receiver), plus the strict type check and Chrome and Firefox builds.
- `npm run test:e2e`: 11 browser tests pass. They cover navigation, search, filters, hiding amounts, Saver targets, locking, the credential-free web preview, transaction pages with category and tag changes, webhooks, Insights with the CSV download, and narrow screens. Automated WCAG 2.1 AA checks pass in light and dark mode on Overview, Insights, Transactions, Savers, the lock screen and the API screens. That isn't a full manual accessibility audit.
- `npm run test:extension`: the packaged Chrome extension in a throwaway profile, against a mocked Up API. It connects, checks only the encrypted token is stored, locks, unlocks, loads every data page, runs the financial-year report, makes category and tag changes (checking the exact PATCH, POST and DELETE requests), and disconnects.
- `web-ext lint` on the Firefox package: 0 errors, 2 `UNSAFE_VAR_ASSIGNMENT` warnings inside React DOM's own `innerHTML` handling. UpDeck's code doesn't use `innerHTML`, `dangerouslySetInnerHTML` or `eval`.
- Reproducible build: unzipping `updeck-source-1.0.0.zip` and running `npm ci && npm run build` on Node 24 produces a Firefox package identical to `updeck-firefox-1.0.0.zip`.

Not covered by automated tests: a real Up account, real webhook deliveries, Firefox, Edge and Brave at runtime, store review, and Safari. There hasn't been an independent security audit.
