# Decisions

Append-only log of settled decisions. New entries get the next number, a date, and a sentence of
context. If a decision is reversed, add a new entry that supersedes the old one — never edit
history. The agent records decisions here **before** implementing them (see `AGENTS.md`, rule 2).

## D-001: Stack selection — TrueContact

**Date:** 2026-10-02

**Decision:** A pnpm workspace, TypeScript across every package, with three deliverables and a
shared contract package:

**Shape**

- `product/` — React SPA + Hono API deployed as **one Cloudflare Worker** (Workers static
  assets). D1 (SQLite) via Drizzle ORM for the contact graph; R2 for temporary raw imports;
  Queues for chunked import/reconciliation processing (keeps work inside Workers CPU limits).
- `extension/` — Manifest V3 browser extension built with WXT + React. The WhatsApp source
  adapter; consumes the shared contract; never requests or stores WhatsApp credentials.
- `site/` — static promo site built with Astro. Deploys independently; imports nothing from the
  product runtime.
- `shared/` — zod schemas + TypeScript types for the normalized contact record, pairing
  protocol, and API contract, plus brand constants.

**Versions (all resolved live from the registries on 2026-10-02; pinned via lockfile)**

- Node 24.21.0 (LTS "Krypton"; local v24.19.0), pnpm 12.8.1, engines `>=22`
- TypeScript 6.0.3; Biome 2.5.15 for lint + format
- Runtime: hono 4.13.12, better-auth 1.7.7, drizzle-orm 0.45.3, zod 4.6.5, react 19.3.0 /
  react-dom 19.3.0, react-router 8.4.0
- Build/dev: vite 8.3.2, @vitejs/plugin-react 6.1.1, wrangler 4.146.0, drizzle-kit 0.31.11,
  astro 7.3.5, @astrojs/check 0.9.10, wxt 0.21.4, @wxt-dev/module-react 1.2.2
- Tests: vitest 4.1.11 + @cloudflare/vitest-pool-workers 0.22.0 (with @vitest/runner and
  @vitest/snapshot 4.1.11)
- Two deliberate non-latest choices, both from live peer-range checks: Vitest **4.1.11** (the
  Workers pool supports `^4.1.0`; latest 5.0.3 is out of range) and TypeScript **6.0.3**
  (`@astrojs/check` supports `^5 || ^6`; latest 7.0.2 is not yet supported).

**Auth:** better-auth stored in D1, email + password. Email verification is deferred until an
email provider exists (none in v1) — recorded in the product brief's v1 boundary. No third-party
auth vendor holds identities.

**Billing:** usage operations are tracked through the domain and free-tier limits are enforced
from configuration; no payment integration in v1.

**Deployment and CI:** deployments are manual via `wrangler` (see the `ship-release` skill).
GitHub Actions: `ci.yml` runs the check command on PRs to `dev`; `release.yml` runs only for
merged PRs to `main`, requires exactly one `release:*` label, bumps the root `package.json`
version, creates the `v<version>` tag, and publishes a GitHub release.

**Rejected**

- Next.js/Vercel + Neon Postgres — adds a vendor and still needs a separate job runner for
  imports; SSR buys nothing for a login-walled app.
- Fly.io/Railway + Node/Postgres — simplest long-job model, but gives up the Cloudflare cost and
  ops profile and the existing Cloudflare tooling.
- React Router 7 framework mode / TanStack Start on Workers — no SSR need; Hono + SPA is fewer
  layers.
- CRXJS (cross-browser lag) and Plasmo (more framework than needed) for the extension.
- ESLint + Prettier — Biome covers both with one configuration.
- Durable Objects — queue + chunking is sufficient at v1 scale.
- Changesets — single-version repo; the label-driven bump script is the honest fit.
- Stripe in v1 — deferred by product decision (see D-004).

**Confirmed by user:** 2026-10-02 (hosting, auth, and billing answers; stack approved with the
scaffolding plan).

## D-002: Branching and automated releases

**Date:** 2026-09-26

**Decision:** `dev` is the default integration branch. Agent changes use feature branches and
pull requests targeting `dev`; releases flow from `dev` to `main`. Release-related workflows run
only after changes merge to `main`. A release PR must carry exactly one of
`release:patch`, `release:minor`, or `release:major`; the release automation applies that bump to
the chosen stack's version source, creates a matching `v<version>` tag, and publishes a GitHub
release. A merge without a release label does not publish a release. `dev` carries unreleased
work between releases and may match `main` immediately after one. Product/site deployment remains
manual. The concrete automation is wired during bootstrap after the stack and version source are
chosen.

## D-003: Agent operating model

**Date:** 2026-09-26

**Decision:** The primary agent acts as senior architect and owns requirements analysis,
architecture, documentation, code generation, integration, testing, and final verification.
Subagents are optional and restricted to one sequential, read-only discovery or evidence-gathering
request; they do not implement, make decisions, edit documentation, or verify changes.

## D-004: v1 scope and monetization deferral

**Date:** 2026-10-02

**Decision:** The first release ships the core contact-identity loop — import (WhatsApp extension
and vCard/CSV files) → normalization → reconciliation against the identity graph → review of
matches, duplicates, conflicts, and possible matches → merge/split/edit with user authorization →
history → export — plus the WhatsApp browser extension. Explicitly deferred beyond v1: device
synchronization (writing contacts back to phones), payment/billing integration (usage operations
are tracked and free-tier limits enforced; no money changes hands), and source adapters beyond
WhatsApp, vCard, and CSV.

**Why:** the Contact Identity Graph is the product; billing and device sync are capabilities
layered on top and would add scope (webhooks, plan states, write-path safety) before the core
workflow is proven. Keeping sources to two paths (one live adapter + file imports) proves the
adapter boundary without multiplying integration risk. Auth is self-hosted email + password so
no vendor holds user identities, matching the privacy posture.

**Confirmed by user:** 2026-10-02 (v1 scope, hosting, auth, and billing questions).

## D-005: Release push authentication on a personal repository

**Date:** 2026-10-02

**Decision:** The `main` branch ruleset requires pull requests. GitHub does not allow personal
repositories to list the GitHub Actions app as a bypass actor (`Integration` bypass needs an
organization; classic-protection bypass actors are org-only too). The release workflow therefore
authenticates its version-bump push with a **repository-scoped deploy key** (`truecontact-release`,
write access, added 2026-10-02) stored as the `RELEASE_DEPLOY_KEY` Actions secret, and the
`main-protection` ruleset grants deploy keys bypass (`actor_id: null` = deploy keys as a class).

Verified 2026-10-02 with a probe branch carrying an identical ruleset: a push with the deploy key
succeeded through the required-PR rule, then the probe ruleset and branch were deleted.

**Alternatives rejected:** the owner's personal access token (broad scope, another long-lived
credential), an unprotected `main` (loses force-push/deletion protection), auto-merge bot PRs
(GitHub Actions events from `GITHUB_TOKEN` do not trigger follow-up workflows — fragile).

**Security note:** deploy keys are scoped to this single repository and are revocable; rotate by
adding a new key, updating the secret, and deleting the old key.

## D-006: Contact-graph schema and increment semantics

**Date:** 2026-10-02

**Decision:** Phase 2 opens with the contact-graph domain schema and the increment semantics that
decide what the review queue contains. Semantics first:

- New unknown people become identities automatically from their first observation; that
  observation seeds the canonical values and its link.
- Exact normalized identifier matches (phone/email) link automatically (`auto` status); fuzzy
  matches are `proposed` for review.
- Non-conflicting values from an import are absorbed into canonical automatically, each with
  provenance and an append-only history event.
- Competing values become `conflicts` rows; canonical data is never overwritten until the user
  resolves the conflict. Merges and splits are user actions only.

**Schema** (Drizzle migration `0001`; every graph table carries `user_id` for tenant scoping;
text UUID primary keys and integer-second timestamps, consistent with the auth tables):

- `identities` — canonical contact; `merged_into_id` tombstones merges instead of deleting.
- `identity_values` — canonical phones/emails as rows with `normalized_value` indexed, so
  blocking works for user-entered values that have no observation.
- `observations` — one normalized record per intake (full `payload` JSON + `normalized_name`),
  linked to its `import` and `source`.
- `observation_identifiers` — indexed normalized phone/email per observation: the blocking keys.
- `identity_links` — observation ↔ identity with `confidence`, `method`
  (`exact_identifier` | `name_similarity` | `manual` | `new_identity`), and `status`
  (`auto` | `proposed` | `confirmed` | `rejected`); one identity per observation.
- `conflicts` — competing value for a canonical field with provenance and resolution state.
- `history_events` — append-only: actor, type, payload, timestamp.
- `sources` + `imports` — connections and jobs (status, R2 raw key, stats).
- `usage_operations` — append-only per-account operation counts; limits enforced by query.

**Rejected**

- Canonical values as JSON columns — normalized values could not be indexed for blocking, and
  user-entered values would have no observation to hang provenance off.
- Integer autoincrement IDs — would mix ID styles with the auth tables.
- ULIDs — sortability is not needed for public IDs at v1 scale; no new dependency.
- Strict review of every import change — non-conflicting additions are non-destructive; they
  apply automatically and stay visible through provenance and history.
- Identifiers stored only inside the observation JSON — blocking queries need indexed rows.

**Confirmed by user:** 2026-10-02 (auto-add plus review conflicts; auto-link exact matches).

## D-007: File import parsers and formats

**Date:** 2026-10-02

**Decision:** vCard and CSV file imports are parsed by pure functions in `product/src/domain`
(`parseVCard`, `parseCsv`) that produce `NormalizedContact` records through the shared contract.

- **vCard:** `vcf@2.1.2` (MIT), chosen after testing 2.1/3.0/4.0 samples: it parses all three,
  including folded lines and TYPE params. A thin adapter in our code decodes QUOTED-PRINTABLE
  (with charset), strips `tel:` URI prefixes, maps TYPE params to labels, unescapes vCard text,
  uses the card UID as `externalId`, and falls back FN → N for the display name. The library
  ships no types, so we keep a minimal local declaration.
- **CSV:** `papaparse@5.7.0` (MIT, zero dependencies) with `@types/papaparse@5.5.2`.
- **CSV dialect:** case-insensitive header aliases — name / full name / display name / contact
  name, first name + last name, any `phone…` / `mobile…` / `tel…` / `cell…` column,
  `email…` / `e-mail…` column, notes; delimiter auto-detected (comma/semicolon/tab); multi-value
  cells split on `;`. A recognized name column (or first/last) is required.

Both parsers return `{ contacts, skipped }`: malformed records never throw — they are skipped
with an index and a reason so an import can report them.

**Rejected**

- `vcard4@4.0.5` — parses only version 4.0 and fails on the 3.0/2.1 files phones actually export
  (verified empirically).
- `csv-parse@7.0.3` — Node-oriented, ~1.6 MB unpacked, more surface than the job needs.
- Hand-rolled parsers for both — we would own the edge cases for no gain over MIT libraries that
  tested correctly against real-world samples.
- Header-less CSVs treated positionally — ambiguous; a recognized name column is required.

**Confirmed by user:** 2026-10-02 (vcf + thin adapter; papaparse; aliases + auto-detect).

## D-008: Stacked PR delivery for phase work

**Date:** 2026-10-02

**Decision:** Phase work is delivered as a stack of pull requests: each slice branches off the
previous slice's branch and its PR targets that branch until the base is merged, at which point
it is retargeted to `dev` (merge commits keep the diff clean). Slices do not wait for merges
between them. Because stacked PRs target feature branches, `.github/workflows/ci.yml` now runs
`pnpm check` on **every** pull request (and on pushes to `dev`).

**Confirmed by user:** 2026-10-02 ("complete all phases and stack the PRs all at once").

## D-009: Import intake and reconciliation semantics

**Date:** 2026-10-02

**Decision:** A file import flows through intake (API) and processing (queue consumer):

**Intake** — `POST /api/imports` (session-authenticated) accepts `{ fileName, content }`, detects
the source kind (`.vcf`/`.vcard` → vCard, `.csv` → CSV, content sniffing as the fallback), stores
the raw payload in R2 at `imports/{userId}/{importId}`, creates the `sources` + `imports` rows
(status `pending`), and enqueues `{ importId }`. `GET /api/imports` and `GET /api/imports/:id`
report jobs and stats.

**Processing** — the consumer parses the raw payload with the domain parsers and reconciles each
observation:

- Exact normalized identifier match (phone/email) → auto-link (`auto`, `exact_identifier`,
  confidence 1). Two or more matching identities → a **proposed** link to the best candidate
  (most matched identifiers, then oldest identity).
- No identifier match but exactly one identity with the same normalized name → proposed link
  (`name_similarity`, confidence 0.5).
- Otherwise a new identity is created and seeded (`new_identity`, `auto`).
- Auto-linked identities adopt new phone/email values (`value_added` history); a differing
  display name opens one `conflicts` row per proposed value (canonical unchanged, deduplicated
  against open conflicts); notes are adopted only when canonical notes are empty — notes never
  auto-conflict in v1. Values from proposed links are adopted when the user confirms.
- Identifiers are normalized at write time (`normalizePhoneForMatch` strips to digits, emails
  lowercase) so blocking works for both the observation and canonical sides.

**Failure policy** — processing errors mark the import `failed` with the error text and the
message is acked: no automatic retry, so partial processing is never repeated (D1 has no
interactive transactions; an idempotent replay is future work). An import counts once in
`usage_operations` (`imported_contact`, quantity = contacts processed).

**Rejected:** retrying failed imports now (duplicate partial writes without transactions);
auto-linking ambiguous multi-identity matches (breaks the user-decides guarantee); notes
conflicts in v1 (noisy, no canonical impact); whole-file parsing in the request (CPU belongs in
the queue consumer per the architecture).

**Confirmed by user:** 2026-10-02 (v1 scope D-004 and increment semantics D-006).

## D-010: Review action semantics

**Date:** 2026-10-02

**Decision:** The review loop's write actions (session-authenticated, tenant-scoped; every change
appends a user-actor history event):

- **Confirm a proposed link** — the link becomes `confirmed`; the observation's values are
  adopted onto the identity (same rules as D-009); recorded as `link_confirmed`.
- **Reject a proposed link** — the observation becomes its own contact: the link row is
  repointed to a newly created identity (`method: manual`, `confirmed`), and the original
  identity records `link_rejected`. Repointing preserves the one-link-per-observation invariant.
- **Resolve a conflict** — `keep_existing` (canonical unchanged), `use_proposed`, or `custom`
  with a value. Adopting a value updates the canonical field and writes `value_changed` +
  `conflict_resolved`. v1 resolves `display_name` conflicts; other fields return 400 until the
  UI needs them.
- **Merge identities** — values move (duplicates dropped), links move (`proposed` →
  `confirmed`), open conflicts move, the source identity is tombstoned (`merged_into_id`), and
  both sides record `merged`.
- **Split an identity** — selected observations are repointed to a new identity seeded with
  their values and confirmed links; `split` on the source, `created` on the new identity.
- **Edit canonical data** — displayName/notes changes and value add/remove write
  `value_changed` / `value_added` / `value_removed` with actor `user`.

**Confirmed by user:** 2026-10-02 (review-loop requirements in `docs/product.md`; D-004/D-006).
