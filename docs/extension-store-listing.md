# Chrome Web Store listing — TrueContact connector

Copy-paste content for the first submission. Fill the **dashboard email** with your own address
(Google uses it for policy notices; you can keep it private by not ticking "show publicly").

## Basics

- **Name:** TrueContact — WhatsApp contact importer
- **Summary (≤132 characters):** Import your WhatsApp Web contacts into TrueContact with a pairing code. No WhatsApp password, no OTP, no message access.
- **Category:** Productivity · **Language:** English
- **Homepage:** https://truecontact.prakashsewani.com
- **Privacy policy URL:** https://truecontact.prakashsewani.com/privacy

## Detailed description

TrueContact is a personal contact book for people whose contacts are scattered across phones,
WhatsApp, and old exports. It gathers observations from each source, reconciles them into one
canonical contact per person, and keeps the history of every change — with you in control of
every decision.

This connector is the WhatsApp source. It reads the contact information WhatsApp Web already
renders (names, chat identifiers, and phone numbers where WhatsApp shows them) and pushes it to
your own TrueContact account so it can be reconciled with everything else you've imported.

- No WhatsApp password, OTP, or session secrets — ever.
- Pair once with a short code from your TrueContact account, then scan whenever you want a fresh
  observation.
- Nothing is read until you click "Scan", and nothing is sent anywhere except your own TrueContact
  account.
- Disconnect at any time from the extension.

TrueContact is in a personal preview: new accounts are approved by the owner before they get
access. Don't have an account yet? Start at https://app.truecontact.prakashsewani.com.

## Single purpose

The extension has one purpose: importing contact information from WhatsApp Web into the user's
own TrueContact account.

## Permission justifications

- **`storage`** — stores the TrueContact URL and the pairing token so the connector can push
  updates without asking you to pair again.
- **Host permission `https://web.whatsapp.com/*`** — reads the contact list WhatsApp Web already
  displays when you click "Scan". It does not read messages or any other WhatsApp data.
- **Host permission `https://app.truecontact.prakashsewani.com/*`** — sends the captured contacts
  to the user's own TrueContact account over HTTPS.

## Data usage (dashboard disclosures)

- **What is collected:** contact information displayed by WhatsApp Web (display names, chat
  identifiers, and phone numbers where shown) — only when the user clicks "Scan".
- **Where it goes:** transmitted over HTTPS only to the user's own TrueContact account. It is not
  sold, not used for advertising, and not transferred to third parties.
- **Retention & deletion:** the user can disconnect the extension at any time and export or delete
  their data from the TrueContact app.

## Screenshots

At least one 1280×800 (or 640×400) screenshot is required. Suggested shot: the paired popup with
the green TrueContact icon, on WhatsApp Web.

How to take it: load the unpacked build (`extension/.output/chrome-mv3`), open the popup on
WhatsApp Web, and use your OS screenshot tool; crop/pad to exactly 1280×800.

## Publishing checklist

1. `pnpm --filter @truecontact/extension zip` → upload `extension/.output/truecontactextension-*.zip`.
2. Fill the drafted listing text above; set the privacy policy URL.
3. Submit for review.
4. Once live, set build variables so the site and app link straight to the listing:
   `PUBLIC_EXTENSION_URL` (site) and `VITE_EXTENSION_URL` (product) — see the ship-release skill.
