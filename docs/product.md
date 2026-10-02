# Product

## What it is

TrueContact is a personal source of truth for a user's contacts. Contact information is scattered
across phones, messaging platforms, cloud address books, exports, and old devices — and those
sources disagree with each other. TrueContact gathers observations from those sources, builds a
**canonical Contact Identity** for each person, preserves the history of how that information
changed over time, and lets the user decide what their canonical contact book should be.

The core architectural principle: **the Contact Identity Graph is the product.** WhatsApp,
phones, Google, and every other service are merely sources of observations; each one sits behind
a source adapter so that adding, changing, or losing a source never requires rebuilding the core.

## Who it's for

Anyone whose contact information lives in more than one place — phone address book, WhatsApp,
Google Contacts, iCloud, old exports — and who wants one reliable, reviewable answer to "what is
the right information for this person?"

## Access (personal-only stage)

TrueContact is a personal project until it can run as a free public service (D-019).
Registration is open, but a new account gets no product access until the admin approves it —
product APIs return `403` while pending, and the app shows a waiting screen (no email
notifications in v1; there is no email provider). The admin — the project owner — reviews new
accounts from the in-app **Members** page and approves or rejects them. When funding exists,
opening TrueContact to the public is a configuration change, not a rebuild.

## The problem it solves

Contact management assumes one system is authoritative. In reality, every source drifts:

- A contact exists in WhatsApp but not on the phone.
- A contact exists on the phone but disappears from a later WhatsApp import.
- The same person appears under different names, or multiple times.
- Phone numbers change; new numbers and emails appear.
- A contact is accidentally deleted or modified in one source.
- A previously unknown contact appears months later.

Today's alternatives are worse: they trust a single source, silently overwrite or merge records,
keep no history, can't reconcile across sources, or require handing contact data to a vendor.
TrueContact instead preserves observations from every source, reconciles them against the
identity graph, and surfaces what changed, when, which source contained the change, and which
information conflicts — with the user in control of every decision that alters canonical data.

## Non-goals

- Not a CRM and not a team tool — this is personal contact infrastructure.
- No source is the product. WhatsApp integration is one adapter, and the architecture must not
  depend on WhatsApp-specific behavior, APIs, or policies.
- TrueContact never requests or stores third-party credentials — no WhatsApp passwords, OTPs,
  authentication secrets, or session credentials.
- No silent destructive merges or overwrites. Suggestions are automated; decisions that change
  canonical data require user authorization.
- Contact data is never sold or used for advertising.
- Not a messaging client — it manages contact information, not conversations.
- **Explicitly out of v1:** device synchronization (writing contacts back to phones), payments
  and billing (usage is tracked; billing and rate limiting are deferred to official shipping —
  D-021), and source adapters beyond WhatsApp, vCard, and CSV.

## Success looks like

The one workflow that must feel right for the first release:

1. A user creates an account, then imports contacts from WhatsApp (via the browser extension's
   pairing flow) and/or a vCard/CSV file.
2. TrueContact normalizes the import, matches it against the existing identity graph, and shows
   what it found: new contacts, matches, duplicates, conflicts, and possible matches worth
   reviewing.
3. The user reviews a suggestion or conflict, confirms a merge (or splits an incorrect one), and
   edits canonical information — each decision recorded in history.
4. The user opens a contact and sees its story: when it first appeared, when it was last observed
   in each source, what changed, and where sources disagree.
5. The user exports the canonical contact book as vCard or CSV.

"Done" for the first release means: both import paths work end to end, reconciliation produces
reviewable output (never silent canonical changes), merge/split/history are usable, export works,
the free-tier usage limit is enforced, and the repository's check command and CI are green.

## Promo site

The promo site is the product's front door: one page that explains what TrueContact is, why
scattered contact data is a problem, how the core loop works, and what makes it trustworthy —
then sends visitors to the product. It deploys independently of the product: no product runtime
code, no product API calls, only brand constants shared through `shared/`.

Section order (single page):

1. **Hero** — the promise, the primary call to action, and a secondary "how it works" anchor.
2. **The problem** — sources drift and disagree: exists here, missing there; different names;
   changed numbers; silent overwrites elsewhere.
3. **How it works** — the core loop in four steps: import → reconcile → review → own it
   (history + export).
4. **Trust and privacy** — no third-party credentials, non-destructive automation, every
   canonical change is a user decision, data is never sold, export means no lock-in.
5. **WhatsApp connector** — capture from WhatsApp Web through the extension and a pairing code;
   no WhatsApp password, OTP, or session secret is ever requested.
6. **Pricing** — free to start: no billing in the personal stage and no import cap (D-021);
   pricing and rate limiting are revisited when the app opens publicly.
7. **FAQ and footer** — short answers (credentials, where data lives, export, sources) and the
   closing call to action.

The primary CTA ("Open TrueContact") points at the product origin
(`app.truecontact.prakashsewani.com`; a single site-side constant in `site/src/config.ts`,
overridable at build time with `PUBLIC_APP_URL`). No forms and no waitlist backend in v1
(D-014, D-015).

Deploy-ready means: `pnpm check` green; a single static page that needs no client-side
JavaScript; accessible semantics and focus states; responsive from ~360px; deployed as-is by the
procedure in the `ship-release` skill.
