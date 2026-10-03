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

## D-011: WhatsApp extension pairing and token authentication

**Date:** 2026-10-02

**Decision:** The extension pairs through TrueContact-issued codes and pushes batches with a
bearer token — WhatsApp credentials never exist anywhere in the flow:

- `POST /api/pairing/start` (web session) creates an 8-character code from an unambiguous
  alphabet, valid for 10 minutes, shown in the web UI.
- `POST /api/pairing/exchange` (extension) takes `{ code, extensionId }` and returns a bearer
  token (`tc_…`, 30-day TTL); pairing codes are single-use. Only the token's SHA-256 hash is
  stored.
- `POST /api/imports/extension` (bearer token) accepts the shared `importBatchSchema` payload
  (`source: whatsapp` + normalized contacts), stores it exactly like any other intake, and
  enqueues it; the consumer passes WhatsApp batches through the shared contract instead of a
  file parser.
- Tokens are revocable by deleting the row; `last_used_at` updates on every push.

**Confirmed by user:** 2026-10-02 (v1 scope D-004; pairing contract in `shared/src/pairing.ts`).

## D-012: WhatsApp capture scope (extension v1)

**Date:** 2026-10-02

**Decision:** The extension captures only what WhatsApp Web legitimately renders:

- The content script reads chat-list rows (`#pane-side [role="listitem"]`) — best effort against
  WhatsApp's DOM — and emits normalized contacts: `externalId` = the chat JID from `data-id`,
  the display name from the row title, and a phone (`+<digits>`) for numeric `@c.us` JIDs.
  Groups and non-contact rows are skipped; only currently rendered rows are captured — no
  scrolling, no access to WhatsApp's internal storage.
- The popup sends `pair` / `scan` / `status` messages; the background service worker owns the
  bearer token in `browser.storage.local` and performs the pushes.
- The manifest allows `storage` plus host permissions for the local API origin
  (`http://localhost:8787/*`); the deployed TrueContact origin is added at deploy time.

**Confirmed by user:** 2026-10-02 (v1 scope D-004; pairing protocol D-011).

## D-013: Free-tier limit enforcement

**Date:** 2026-10-02

**Decision:** The v1 free tier limits **lifetime imported contacts** per account:

- The limit comes from the `FREE_IMPORT_LIMIT` Worker var (default 1000 when unset/invalid).
- Enforcement is at **intake**: a new import (file or extension push) is rejected with `402`
  when the account's `imported_contact` usage is already at or above the limit. Batches already
  accepted may push usage slightly past the limit — the gate is "start no new import", not a
  per-contact cliff.
- Exports remain unlimited in v1; usage is reported on `GET /api/imports`
  (`usage.importedContacts` / `usage.limit`) and shown on the imports page.
- Changing limits is configuration, not code; billing stays out of v1 (D-004).

**Confirmed by user:** 2026-10-02 (v1 scope D-004).

## D-014: Promo site scope, content, and deploy

**Date:** 2026-10-02

**Decision:** The promo site is a single static Astro landing page whose section order is
recorded in `docs/product.md` ("Promo site"), deployed as the assets-only Worker
`truecontact-site` with the manual `pnpm deploy` procedure in the `ship-release` skill. It sends
visitors to the product through one primary CTA ("Open TrueContact") that reads the product
origin from a single site-side config constant (`site/src/config.ts`), overridable at build time
via `PUBLIC_APP_URL` and filled at deploy (phase 4); custom domain and canonical URL are
deploy-time decisions. The page requires no client-side JavaScript, makes no product API calls,
and shares only brand constants from `shared/` (D-001 dependency rule).

**Rejected**

- Waitlist/form backend — v1 has no email provider (D-004) and it adds product surface for no
  launch need.
- CMS — the copy is fixed and source-controlled; there is nothing an editor would manage.
- Multi-page IA (privacy/FAQ pages) in v1 — one page carries the story; split later if the copy
  outgrows it.
- Client-side interactivity — nothing on the page requires it; static stays fast and robust.

**Confirmed by user:** 2026-10-02 (phase-3 stack reviewed and merged — PRs #14–#18).

## D-015: Production hostnames (prakashsewani.com)

**Date:** 2026-10-02

**Decision:** The product and promo site deploy on Cloudflare Worker Custom Domains under the
existing `prakashsewani.com` zone (already on Cloudflare; the apex and `www` stay the personal
portfolio, email routing untouched):

- Promo site: `truecontact.prakashsewani.com` (`truecontact-site` Worker).
- Product app: `app.truecontact.prakashsewani.com` (`truecontact` Worker); `BETTER_AUTH_URL`
  and the site's `PUBLIC_APP_URL` both use `https://app.truecontact.prakashsewani.com`.
- The extension's `host_permissions` adds the app host; the `*.workers.dev` hostnames remain a
  fallback for smoke tests. Custom Domains create their DNS records and certificates
  automatically, including for the multi-level subdomain (the generated Advanced Certificate
  needs no ACM subscription — verified against the Workers custom-domains docs).

If a dedicated product domain is bought later: add it as a Custom Domain, redirect the old
hosts, and update the three origin values (`BETTER_AUTH_URL`, `PUBLIC_APP_URL`, extension host
permission).

**Rejected:** the apex or `www` for the product (they serve the live portfolio); buying a second
domain now (unneeded cost; the migration stays cheap).

**Confirmed by user:** 2026-10-02 (chose the product-named scheme over `app.prakashsewani.com`
and deferring to a future domain).

## D-016: Deployments through Cloudflare Workers Builds

**Date:** 2026-10-02

**Decision:** Product and promo-site deployments move from hand-run `wrangler deploy` commands
to Cloudflare's Git integration (Workers Builds). Both Workers build and deploy automatically
when `main` moves. CI (`pnpm check`) remains the PR gate and `main` stays PR-only, so a deploy
happens exactly when a release merge lands — plus the release workflow's version-bump push,
which redeploys identical code as a harmless second build.

**Per-Worker connections** (production branch `main`, preview builds off):

| Worker | Root directory | Build command | Deploy command | Build variables |
|---|---|---|---|---|
| `truecontact` | `product` | `pnpm install --frozen-lockfile && pnpm build` | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` | `SKIP_DEPENDENCY_INSTALL=1`, `PNPM_VERSION=12.8.1` |
| `truecontact-site` | `site` | `pnpm install --frozen-lockfile && pnpm build` | `npx wrangler deploy` | `SKIP_DEPENDENCY_INSTALL=1`, `PNPM_VERSION=12.8.1`, `PUBLIC_APP_URL=https://app.truecontact.prakashsewani.com` |

- Install is explicit (`SKIP_DEPENDENCY_INSTALL=1` plus `pnpm install` in the build command)
  because each build runs inside a pnpm workspace subdirectory; `PNPM_VERSION` pins the pnpm
  that wrote `pnpm-lock.yaml` (12.8.1). Node stays on the build image default (24.x), which
  satisfies the repo's `engines >=22` floor.
- The `truecontact` build authenticates with a custom API token that extends Cloudflare's
  generated build token with **D1: Edit** (the deploy command applies migrations) and
  **Workers Queues: Edit** (the Worker binds a queue).
- One-time setup stays manual and dashboard-driven: create D1 `truecontact`, R2
  `truecontact-imports`, and queue `truecontact-imports`; set `BETTER_AUTH_SECRET` (secret) and
  `BETTER_AUTH_URL` on the Worker. The real `database_id` must be committed to
  `product/wrangler.jsonc` before the first build.
- Manual `wrangler deploy` remains the emergency path; rollback is the Workers Builds version
  rollback (dashboard) or `wrangler rollback`. The release flow itself — labeled `dev → main`
  PR, version bump, tag, GitHub release — is unchanged. The extension build and store upload
  stay manual.

**Why:** the user asked for push-to-`main` automation through Cloudflare's own pipeline instead
of hand-run deploys. Workers Builds owns account auth (generated token), deploys next to the
resource configuration (bindings, routes, custom domains), and gives per-Worker build logs and
retries without introducing a second CI system or a long-lived account credential.

**Rejected**

- Keeping manual `wrangler deploy` runs — the drift and toil the change removes.
- A GitHub Actions deploy job with a `CLOUDFLARE_API_TOKEN` secret — duplicates the release
  workflow's job and adds a long-lived account token to manage.
- Preview builds on non-production branches — every branch push would build both Workers;
  `pnpm check` in CI already gates PRs, so previews stay off.
- Automating the Chrome Web Store submission — no Git-integrated path; stays manual.

**Confirmed by user:** 2026-10-02 (chose dashboard-configured Workers Builds on `main` over
manual deploys).

**Supersedes:** the manual-deploy clauses in D-002, D-014, and D-015. One-time resource
creation, secrets, and rollbacks remain manual, documented in the `ship-release` skill.

## D-017: Worker names aligned to the deployed Workers

**Date:** 2026-10-02

**Decision:** The launch setup created the dashboard Workers as `true-contact` (product) and
`true-contact-site` (promo site). The repo configs (`product/wrangler.jsonc`,
`site/wrangler.jsonc`) now use the same names so `wrangler` CLI commands (secrets, deployments,
rollback) target the deployed Workers. D-016's table records the originally planned
`truecontact` / `truecontact-site` names — the first deploys already worked because Workers
Builds matches the connected Worker name automatically (`WRANGLER_CI_OVERRIDE_NAME`).

**Why:** Workers cannot be renamed, so the repo aligns to the dashboard; equal names remove the
silent trap where CLI commands fail with "Worker does not exist".

**Confirmed by user:** 2026-10-02 (names set during the dashboard launch setup).

## D-018: Chunked, resumable import processing

**Date:** 2026-10-02

**Decision:** Import processing becomes cursor-based slices after the first real import
(~1,100 contacts) exceeded the queue consumer's 15-minute wall-clock limit mid-run: the whole
import ran in one invocation, was killed before it could record an error, and the queue's
retry restarted it from scratch — leaving the import stuck at `processing` with ~200 contacts
done. On the Workers **Free** plan (10 ms CPU, 50 subrequests and 100k requests per day; the
user chose to stay on it) the redesign works inside those ceilings:

- Each queue message carries `{ importId, cursor }`; an invocation processes one slice of
  `IMPORT_CHUNK_SIZE` contacts (default 5 — bounded so ~8 D1 calls per contact stay under the
  50-subrequest ceiling), persists progress, then enqueues the next slice.
- `imports` grows `cursor`, `total`, and `progress_at` (migration 0003) for progress display,
  stall detection, and resume; slices run strictly one at a time.
- Idempotency: a slice skips contacts whose observation already exists for that import
  (`external_id` match — always set for WhatsApp batches; file records without an id can
  duplicate at most one partially-processed slice). Stats are derived from the database at
  finalize, and the usage row uses the import id as its primary key, so retried finals can't
  double-count.
- Failure policy: the queue handler retries transient failures while queue `attempts` remain
  and marks the import `failed` on the terminal attempt; a session-authenticated
  `POST /api/imports/:id/resume` re-enqueues from the persisted cursor for stalled imports.
- `GET /api/imports` and `:id` expose `cursor`/`total`/`progressAt` so the UI shows progress
  and a resume affordance instead of an indefinite "processing".

**Supersedes:** D-009's single-invocation processing and its "no automatic retry / mark failed
in catch" policy (platform kills bypass the catch — the queue's retry lifecycle is the honest
signal). D-009's matching, adoption, and conflict rules stand. Everything else about intake is
unchanged.

**Rejected:** processing a whole import per invocation (dies at the wall-clock limit);
marking failed on caught errors only (misses platform kills); slices of 25-50 (exceed the
subrequest ceiling on Free); Workers Paid (user's call — the design works on Free, just
slower).

**Confirmed by user:** 2026-10-02 (stay on Free plan; processing messaging should be
progress-based rather than a fixed window).

## D-019: Personal-only access with admin approval

**Date:** 2026-10-02

**Decision:** Until there is funding to run TrueContact as a free public service, it operates
as a personal project with gated access:

- Registration stays open, but a new account has **no product access** until the admin approves
  it: every authenticated product route (contacts, review actions, imports, export, pairing)
  returns `403 pending approval` for unapproved accounts; the bearer-token extension import
  checks membership too.
- Membership lives in a new `memberships` table (`user_id` PK, `role` `admin | member`,
  `status` `pending | approved | rejected`, `decided_at/by`). A missing row means `pending` —
  no signup hook needed.
- Migration `0004` creates the table and promotes **every account existing at migration time**
  to admin/approved (in production that is exactly the current user) — self-contained and
  disaster-recoverable. Accounts created after it stay pending until approved.
- Admin API: `GET /api/admin/users`, `POST /api/admin/users/:id/approve`, `POST
  /api/admin/users/:id/reject` (admins cannot be demoted through these routes). The SPA gains a
  waiting screen for pending/rejected accounts, a Members page for admins, and `GET /api/me`
  reports `{ membership }` so it can route itself.
- No email notifications (no email provider in v1 — D-004): pending users see the waiting
  screen; the admin sees the pending list in the app.
- Opening to the public later is a configuration change (approve-by-default), not a rebuild.

**Why:** the owner wants a personal/friends-only stage while the core loop proves itself and
funding is secured; public signups would otherwise consume the free-tier D1/R2/Queues quota
and expose an unfinished product.

**Rejected:** invite codes (more moving parts than admin approval at this scale); closing
registration entirely (the owner would have to create every account by hand); an env-var
allowlist (no audit trail, awkward to change).

**Confirmed by user:** 2026-10-02 ("personal only project… admin approves new joinings… free
to the world once funded").

## D-020: In-page WhatsApp capture via WA-JS for phone numbers

**Date:** 2026-10-02

**Decision:** The connector keeps its no-credentials posture but reads phone numbers through
WhatsApp Web's own in-page store using **@wppconnect/wa-js 4.6.1** (Apache-2.0), bundled into the
extension's main-world script:

- On scan, the connector calls `WPP.contact.list()` and, for LID contacts without a number,
  `WPP.contact.getPnLidEntry(id)` — WhatsApp's own LID→phone mapping. The existing DOM/React-state
  capture remains as the fallback (names, and any numbers it can see).
- Still no WhatsApp credentials, no QR/session login; nothing leaves the user's browser except the
  push to their own account; message content is never read.
- Trade-off accepted: coupling to WhatsApp Web internals (WA-JS tracks versions; if it breaks, the
  connector still works — name-only — until updated).

**Why:** live testing showed most chats arrive as `@lid` identifiers that carry no number in the
DOM; the number lives in WhatsApp's contact store. Session-based libraries (Baileys,
whatsapp-web.js, WAHA, Evolution) would require every user to hand over a WhatsApp session —
breaking the product's core promise and, per 2026 reporting, putting users' own accounts at
elevated ban risk. WA-JS runs against the session the user already has open, with no custody.

**Supersedes:** D-012's "no access to WhatsApp's internal storage" clause — the store is read
locally, in the user's own already-open browser session; everything else in D-012 stands.

**Confirmed by user:** 2026-10-02 (chose the WA-JS upgrade over session-based libraries).

**Refinement (2026-10-02):** the connector pushes the **saved address book only**
(`WPP.contact.list({ onlyMyContacts: true })`), folds the duplicate `@lid`/`@c.us` records into
one per phone number, and skips Meta AI (`13135550002@c.us`) and the account's own card. The
verbose console diagnostics used while debugging capture were removed once verified (PR #41).

## D-021: Personal stage — no import limits

**Date:** 2026-10-02

**Decision:** The free-tier import gate from D-013 is removed while TrueContact is a personal
project: no account has an import cap. Usage operations are still recorded (the counters stay
accurate for later), but the `FREE_IMPORT_LIMIT` variable and the `402` intake gate are gone,
and the Imports page reports the running count without a ceiling. Rate limiting and pricing are
deferred to the official-shipping backlog (revisit D-013 at that point).

**Why:** the user's call — with access already gated behind admin approval (D-019), a second
quota gate only gets in the way of the owner's own imports.

**Supersedes:** D-013 (free-tier limit enforcement) for the personal stage.

**Confirmed by user:** 2026-10-02 ("since we are a personal app now dont limit shit… add to
backlog when officially shipping add rate limiting and pricing").

## D-022: One UI system — MUI in the app, React-rendered MUI on the site

**Date:** 2026-10-02

**Decision:** The product web app adopts **MUI** (`@mui/material` 9.4.0 with
`@emotion/react`/`@emotion/styled` 11.14.0) as its component system, and the promo site renders
the **same components** through Astro's React integration (`@astrojs/react`) instead of
copy-matching styles. A new workspace package `ui/` (`@truecontact/ui`) owns the shared theme
(brand palette, radii, typography, light/dark schemes) and the components both frontends render:

- App: `ThemeProvider` + `CssBaseline`; interactive controls (buttons, inputs, selects) move to
  MUI components themed to the existing brand values (green `#2f6f4f` light / `#6fbf94` dark).
- Site: CTAs and buttons become the shared component. Static usage renders server-side with no
  hydration; a React island only ships JS where interaction is genuinely needed.
- Both surfaces keep `prefers-color-scheme` light/dark behaviour through the shared theme.
- Layout/marketing CSS stays; the hand-rolled `.button-*` styles retire in favour of the
  component (`product/src/web/styles.css` keeps only structural styles).

**Why:** buttons had drifted across three hand-rolled style systems (app CSS, site CSS, extension
popup), and the user asked for uniform controls across site and app ("for site and app please use
uniform buttons, use a ui framework like chakra or mui"). One shared component keeps a single
source of truth; MUI was picked over Chakra for component breadth and ecosystem maturity; React
islands were picked over token-sharing so the surfaces share components, not lookalikes.

**Rejected:** copy-matching CSS between the two apps (drifts); tokens-only sharing (lookalikes,
and the user explicitly chose literal reuse); Chakra UI 3.37.0 (smaller ecosystem, more churn);
making the promo site a SPA (needless runtime for static marketing pages).

**Trade-offs accepted:** the site build now pulls React + MUI at build time (output stays static
HTML; only explicitly hydrated islands ship JS); the app bundle grows with MUI (~tens of kB).

**Confirmed by user:** 2026-10-02 (chose "MUI" for the app and "React islands in Astro" for the
site when asked).

**Implementation note:** Astro renders framework components as independent React roots, so a
parent `ThemeProvider` cannot pass context into component children — the shared button therefore
bundles the provider with itself (`ThemedButton`), keeping static usage zero-hydration.

## D-023: Import slices — batched, scan-free, statement-budgeted

**Date:** 2026-10-03

**Decision:** The queue consumer reconciles a slice with bounded, batched D1 work instead of
per-contact statements plus per-slice full-graph scans. The audit (2026-10-03) showed the
Free-plan D1 limits (5M rows read/day, 100k rows written/day; rows read = rows *scanned*; every
index entry counts as a written row) were exhausted by development imports: each 5-contact slice
re-scanned **all** identities of the user and the import's observations written so far —
O(M × T/C + T²/C) per import — and each contact cost ~6–10 unbatched statements, which is what
forced `C = 5` under the 50-queries/invocation ceiling.

- One `env.DB.batch()` per slice carries the writes (multi-row inserts, grouped updates), with
  statements per slice capped at ~45 so the Free-plan ceiling holds under either reading of the
  platform docs; `IMPORT_CHUNK_SIZE` default 5 → 40 (`MAX_CHUNK_SIZE` 200).
- Candidate matching becomes batched blocking-key lookups against the existing
  `identity_values(user_id, kind, normalized_value)` index, plus one identity fetch by id for
  the candidate set; name-only proposal candidates use a new indexed `identities.normalized_name`
  (maintained at every identity write; legacy rows backfilled lazily with exact TypeScript
  normalization) instead of loading every identity per slice. Candidate ordering keeps the
  existing semantics (most matched identifiers, then oldest identity, stable on ties) — the
  loader preserves it deterministically in memory rather than relying on SQL row order.
- The reconcile decision runs in Worker memory against loaded candidate state (a pure planner in
  `product/src/domain`, shared with the single-record action paths), on a slice-scoped key set:
  candidate matches, similarity scores, and blocking results are never persisted.
- `observation_identifiers` writes stop — no product query reads the table, and the identifiers
  remain in `observations.payload`. `observations_user_id_idx` and
  `observations_normalized_name_idx` are dropped as unused write amplification.
- Schema (migration 0005): `observations.record_key` + `(user_id, record_key, created_at)` index,
  `observations.content_hash`, `identities.normalized_name` + `(user_id, normalized_name)` index;
  all nullable and additive.
- Retried and stale slices converge: slice processing is idempotent (D-024), and a redelivery
  whose cursor trails the job's cursor is acknowledged without work.

**Rejected:** keeping the per-slice scans with a bigger chunk (the scans grow with the graph and
would still dominate); a Durable Object or KV staging layer for candidates (new infrastructure
for a problem D1 batches solve at v1 scale); relying on Workers Paid (the user stays on Free —
the design fits); batching only the writes (reads were the quota killer).

**Confirmed by user:** 2026-10-03 (approved the D1 import-efficiency plan; stacked-PR delivery).

## D-024: Source-record idempotency — one observation per distinct source state

**Date:** 2026-10-03

**Decision:** A repeated import of an unchanged source record appends nothing. Every observation
carries a source-scoped `record_key` — `<kind>:x:<externalId>` when the source provides a stable
id (WhatsApp JID, vCard UID), otherwise `<kind>:f:<sha256>` of the canonical state (normalized
name + sorted normalized identifiers + notes) — and a `content_hash` of that same state. Each
slice looks the prior state up by key (one indexed query per key set) and:

- **Unchanged** (hash equal): refresh the existing observation's `observedAt` only. No new
  observation, identifier, link, value, or history row. A canonical value the user deleted stays
  deleted on re-import; `lastObservedAt` stays honest via the refreshed `observedAt`.
- **Changed** (same key, different hash): append a new observation with the full payload —
  provenance keeps "what did the source report" per state — and auto-link it to the identity
  that owns the prior observation for that key (new link method `source_record`, status inherited
  from the prior link), then adopt values/conflicts/history exactly as the exact-identifier path
  does.
- **Absent**: today's reconciliation (identifier match → auto/proposed; exactly one name match →
  proposed; otherwise new identity).

Fingerprint keys never collapse records without at least one identifier (two name-only "Dad"
records stay two observations). `record_key` is scoped to `(user_id, kind)` — two WhatsApp
accounts would share one namespace (known limitation). Migration 0005 backfills `record_key` for
existing `external_id` rows; legacy rows without a hash compare their payload once on the next
sighting, then hash going forward.

**Why:** every re-import previously appended observation + identifiers + link + `observed` event
per contact (~14 rows written, index-amplified — a 493-contact re-scan wrote ~7k rows and read
~150k), so a development day of scans exhausted the Free plan and failed a release deploy.

**Rejected:** no dedupe (the status quo); overwriting the observation row for changed states
(loses the prior payload — the source's story must stay per state); fingerprint-dedupe without
identifiers (risks collapsing distinct people); a separate `source_records` table (two nullable
columns + one index already carry the property).

**Confirmed by user:** 2026-10-03 (same plan approval).
