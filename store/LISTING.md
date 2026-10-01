# UpDeck 1.0.0: store submission

Everything to paste into the Chrome Web Store, Firefox Add-ons (AMO) and, optionally, Microsoft Edge Add-ons. Files referenced here are produced by `npm run release` in `release/`.

## Before you submit

1. **Push this project to [github.com/realbakari/UpDeck](https://github.com/realbakari/UpDeck)** on the `main` branch. The privacy policy URL below only works once `PRIVACY.md` is public.
2. **Chrome:** register a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) (one-time registration fee) and verify your contact email. For trader status, a free personal project is normally "non-trader".
3. **Firefox:** sign in to the [Add-on Developer Hub](https://addons.mozilla.org/developers/).
4. **Edge (optional):** register in [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/). The Chrome zip works unchanged.
5. **Name risk:** "Up" is a brand of Bendigo and Adelaide Bank. The name, summary and description say "unofficial" and "for Up", as the Chrome Web Store's impersonation policy asks, and no Up logo is used anywhere. A store or Up could still raise a trademark concern about "UpDeck"; renaming is the fix if that happens.

## Files

| Upload                     | Chrome                                | Firefox                    | Edge                                  |
| -------------------------- | ------------------------------------- | -------------------------- | ------------------------------------- |
| Extension package          | `updeck-chrome-1.0.0.zip`             | `updeck-firefox-1.0.0.zip` | `updeck-chrome-1.0.0.zip`             |
| Source code (reviewers)    | n/a                                   | `updeck-source-1.0.0.zip`  | n/a                                   |
| Store icon (128×128)       | `store/icon-128.png`                  | (taken from the package)   | `store/icon-300.png`                  |
| Screenshots (1280×800)     | 1, 2, 3, 4, 6 (Chrome allows five)    | all six                    | 1, 2, 3, 4, 6                         |
| Small promo tile (440×280) | `store/tiles/small-promo-440x280.png` | n/a                        | `store/tiles/small-promo-440x280.png` |
| Marquee (1400×560)         | `store/tiles/marquee-1400x560.png`    | n/a                        | `store/tiles/marquee-1400x560.png`    |

Screenshots, in order:

1. `1-overview.png`: Overview with safe to spend and total balance
2. `2-insights-payday.png`: Safe to spend until payday, with the bills that come out first
3. `3-insights-subscriptions.png`: Subscriptions & bills and What changed
4. `4-transaction.png`: A transaction, with Round-Up and the category and tags editor
5. `5-what-changed-dark.png`: Dark mode: What changed, 2Up split, tax time
6. `6-connect.png`: Connecting: token, passphrase, and the sample-data option

All screenshots are the real app with built-in sample data, which is labelled on screen.

## Shared copy

**Name:** UpDeck: unofficial dashboard for Up

**Summary (119 characters):**

> Unofficial dashboard for Up: payday, subscriptions and spending, worked out on your device. Not made or endorsed by Up.

**Description:**

```text
UpDeck shows your Up money in a full browser tab: balances, spending and Savers, plus the things the Up app doesn't work out for you.

SAFE TO SPEND UNTIL PAYDAY
UpDeck spots your regular pay, takes out the bills due before it lands, and shows what's left and what that comes to per day. It also tells you whether this pay cycle is running ahead of or behind your usual.

SUBSCRIPTIONS AND BILLS
Every charge on a steady weekly, fortnightly, monthly or quarterly rhythm, with what it costs you a year. Price rises are flagged, and so are subscriptions that seem to have stopped.

WHAT CHANGED
The last 30 days against the months before, in plain sentences, like "Takeaway +$145.30, mostly Uber Eats on Fridays."

ALSO
• Transactions with search and filters. Open one to see its Round-Up, card, foreign amount, note and receipt.
• Change a transaction's category or tags. You review every change before it's sent to Up.
• Savers with your own targets, a 2Up split showing who spent what, and tag totals for the Australian financial year with a CSV export for tax time.
• Hide amounts with one click. Light and dark mode.

PRIVATE BY DESIGN
• Your Up token is encrypted on your device with a passphrase only you know (AES-256-GCM, PBKDF2 with 600,000 iterations). UpDeck locks itself after five minutes.
• The only server UpDeck talks to is Up's API. There's no UpDeck server, no analytics, no ads and no trackers.
• UpDeck can't move money.
• Open source under the MIT licence: https://github.com/realbakari/UpDeck

GETTING STARTED
1. Create a personal access token in the Up app's Data sharing settings, or at https://api.up.com.au
2. Open UpDeck from the toolbar, paste the token and choose a passphrase.
Want a look first? "Try it with sample data" opens every screen with made-up numbers.

UpDeck is an independent project. It isn't made, endorsed or reviewed by Up or Bendigo and Adelaide Bank. Up's API is for personal use: use your own token and never share it.
```

## Chrome Web Store

**Store listing tab**

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| Description    | Shared description above                                  |
| Category       | Tools                                                     |
| Language       | English (Australia), or English if that's the only option |
| Homepage URL   | https://github.com/realbakari/UpDeck                      |
| Support URL    | https://github.com/realbakari/UpDeck/issues               |
| Mature content | No                                                        |

**Privacy tab**

Single purpose:

> Shows the user's own Up bank accounts, transactions and spending insights in a browser tab, using the Up personal access token they provide.

Permission justifications:

| Permission                                | Justification                                                                                                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                 | Stores the user's Up personal access token, encrypted with their passphrase (AES-256-GCM), so they don't have to paste it each time. Session storage holds a counter of failed unlock attempts to slow down guessing. Nothing else is stored. |
| Host permission `https://api.up.com.au/*` | The only server UpDeck contacts. It reads the user's accounts and transactions from Up's documented API and, only after the user confirms, updates a transaction's category or tags or manages the user's webhooks.                           |

Remote code: **No, I am not using remote code.** All JavaScript ships in the package. The content security policy only allows scripts from the extension itself.

Data usage. Tick:

- **Authentication information**: the Up personal access token, stored encrypted on the device and sent only to Up's API.
- **Financial and payment information**: balances and transactions read from Up and shown to the user. Kept in memory only while UpDeck is unlocked.

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: https://github.com/realbakari/UpDeck/blob/main/PRIVACY.md

**Distribution tab:** Free · Public · All regions (Up customers travel, and the extension only works with an Up token anyway).

**Test instructions:** paste the "Chrome Web Store" section of `REVIEWER-NOTES.md`.

## Firefox Add-ons (AMO)

| Field             | Value                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Name              | UpDeck: unofficial dashboard for Up                                                                           |
| Add-on URL        | `updeck`                                                                                                      |
| Summary           | The shared summary above                                                                                      |
| Description       | The shared description above                                                                                  |
| Categories        | Other                                                                                                         |
| Support website   | https://github.com/realbakari/UpDeck/issues                                                                   |
| License           | MIT License                                                                                                   |
| Privacy policy    | Paste the contents of `PRIVACY.md`                                                                            |
| Source code       | Upload `updeck-source-1.0.0.zip` when asked whether the add-on uses minified or bundled code (answer **Yes**) |
| Notes to reviewer | Paste the "Firefox Add-ons" section of `REVIEWER-NOTES.md`                                                    |

Data collection: the Firefox manifest declares `authenticationInfo` (the token is sent to Up to authenticate) and `financialAndPaymentInfo` (category and tag changes send transaction details back to Up). Firefox shows these to users at install time.

## Microsoft Edge Add-ons (optional)

Upload `updeck-chrome-1.0.0.zip`, reuse the Chrome description, privacy policy URL and screenshots, and paste the Chrome reviewer notes into "Notes for certification". Use `store/icon-300.png` for the 300×300 logo.

## After publishing (optional)

Up keeps a [list of community projects](https://github.com/up-banking/api/blob/master/community/EXAMPLES.md) and accepts additions by pull request. They'll show their standard notice that Up isn't affiliated with community apps and users should vet the code.
