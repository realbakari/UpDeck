# UpDeck privacy policy

_Last updated: 2 October 2026_

I'm Bakari Mustafa, and I built UpDeck: a free, open-source browser extension that shows your own Up bank data in a browser tab. It isn't made, endorsed or reviewed by Up or Bendigo and Adelaide Bank.

## The short version

- UpDeck has no server. I never receive your token, your passphrase or any of your banking data.
- Your Up personal access token is encrypted on your device with a passphrase only you know.
- Your token is only ever sent to Up's API, at `https://api.up.com.au`.
- There are no analytics, ads, trackers or third-party scripts.

## What UpDeck stores on your device

| What                                                                                                                             | Where                                                           | Why                                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| Your Up personal access token, encrypted (AES-256-GCM, key derived from your passphrase with PBKDF2-SHA-256, 600,000 iterations) | The extension's local storage                                   | So you can unlock UpDeck without pasting your token again |
| A counter of recent wrong passphrases                                                                                            | The extension's session storage, cleared when the browser quits | To slow down passphrase guessing                          |
| Light or dark theme choice                                                                                                       | The page's local storage                                        | To remember your preference                               |

Your passphrase is never stored. Balances, transactions, insights and Saver targets are kept in memory only while UpDeck is unlocked, and are cleared when it locks (after five minutes, when you lock it, or when the browser suspends the extension).

## What UpDeck sends, and to whom

UpDeck talks to one service: Up's API at `https://api.up.com.au`, using your token.

- **Reading:** accounts, balances, transactions, categories, tags, receipts (attachments) and webhook details.
- **Changing, only after you confirm each change:** a transaction's category, adding or removing tags, and creating, testing or deleting webhooks.
- UpDeck can't move money. Up's API has no way to make payments or transfers.

Two actions involve other addresses, both only when you choose them:

- **Opening a receipt** opens a temporary download link that Up provides, on Up's file host. Your token isn't sent with it.
- **Creating a webhook** asks Up to send transaction events to a web address you enter. Up sends those events directly to that address, which should be a server you control. UpDeck itself never contacts it.

## Insights and exports

Safe-to-spend, subscription detection, spending comparisons, 2Up splits and tag totals are worked out inside your browser from data already loaded. CSV exports are created on your device and saved wherever you choose. Nothing is uploaded to produce them.

## Removing your data

- **Settings → Disconnect Up** deletes the encrypted token from the browser.
- Uninstalling UpDeck removes everything it stored.
- To cancel the token itself, revoke it in the Up app or at [api.up.com.au](https://api.up.com.au/).

## Changes

If I change this policy, I'll publish the new version with the source code and update the date at the top.

## Contact

Questions or security reports: open an issue at [github.com/realbakari/UpDeck](https://github.com/realbakari/UpDeck/issues). Never include your token, passphrase or banking details.
