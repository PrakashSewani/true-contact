# Architecture

## Shape

One pnpm workspace, TypeScript everywhere. Four packages:

| Package | Role |
|---|---|
| `product/` | The web application: React SPA + Hono API compiled into **one Cloudflare Worker** |
| `extension/` | Manifest V3 browser extension (WXT + React): the WhatsApp source adapter |
| `site/` | Static promo site (Astro); renders shared UI components via `@astrojs/react` (D-022); deploys independently of the product |
| `shared/` | The only cross-package code: normalized-contact + pairing schemas (zod), brand constants |
| `ui/` | Shared UI system (D-022): the MUI theme (brand palette, radii, typography, light/dark) and the components both frontends render |

Dependencies: `product → shared, ui`; `extension → shared`; `site → shared, ui`; `shared`
depends only on zod; `ui` depends only on React + MUI and on no other package. The site and the
extension never import product runtime code, and the product never imports
adapter internals — the extension is one source adapter, not a dependency of the core.

## Components

| Piece | Where | Responsibility |
|---|---|---|
| Web app | `product/src/web` | React SPA: auth screens, contacts list and contact story, review queue, imports page (pairing + usage) |
| API | `product/src/api` | Hono app: `/api/health`, better-auth handler at `/api/auth/*`, session-guarded product routes, bearer-token extension import |
| Auth | `product/src/api/auth.ts` | better-auth on D1, email + password; email verification is deferred until an email provider exists |
| Domain | `product/src/domain` | Pure contact logic: normalization, matching helpers, vCard/CSV parsing, vCard/CSV export rendering |
| Database | `product/src/db/schema.ts` | Drizzle schema: auth tables plus the contact graph (identities, observations, links, conflicts, history, pairing) |
| Import pipeline | `product/src/imports` + `IMPORTS_QUEUE` consumer | Intake, batched per-slice reconciliation (blocking-key lookups + in-memory planning, one `db.batch()` per slice), idempotent re-imports by source record (D-023/D-024), usage accounting (no limits in the personal stage — D-021) |
| Raw imports | `IMPORTS_BUCKET` (R2) | Temporary raw payloads; minimized retention, never the canonical store |
| WhatsApp connector | `extension/` | Captures legitimately available WhatsApp Web contact data and pushes normalized batches |
| Shared UI | `ui/` | MUI theme + components (buttons, fields) consumed by both the app and the promo site (D-022) |
| Promo site | `site/` | Static Astro landing page; shared UI components rendered through React with no hydration for static use (D-022); assets-only Worker `true-contact-site`; deploys independently from `main` (D-016) |

Bindings in `product/wrangler.jsonc`: `DB` (D1), `IMPORTS_BUCKET` (R2), `IMPORTS_QUEUE`
(Queues producer + consumer), `ASSETS` (SPA, `run_worker_first: ["/api/*"]`).

## Data flow

1. A source adapter (extension or file importer) produces `NormalizedContact` batches using the
   shared zod contract.
2. The API validates the batch, stores the raw payload in R2, records an import job, and enqueues
   to `IMPORTS_QUEUE`.
3. The queue consumer normalizes records and reconciles a slice in Worker memory after batched
   lookups by blocking keys (normalized phone/email, name similarity): unchanged source records
   only refresh their observation's `observedAt` (D-024); changed or new records write
   observations, links, conflicts, and history events, and unknown people become new identities.
   Automated steps are **non-destructive**.
4. The web app presents new contacts, matches, and conflicts. Non-conflicting values are absorbed
   automatically (with provenance); the user confirms merges, splits, and conflict resolutions —
   every overwrite is an explicit user action and appends a history event (actor + timestamp).
5. Exports render the canonical graph as vCard/CSV.
6. Usage operations are counted per account as a running total (no limits are enforced in the
   personal stage — D-021; rate limiting is deferred to official shipping).

## Domain model

Defined in `product/src/db/schema.ts`; every graph row carries `user_id` for tenant scoping, with
text UUID primary keys and integer-second timestamps matching the auth tables. Migration `0001`
creates the graph:

- `identities` — canonical contact; `merged_into_id` tombstones merges instead of deleting;
  `normalized_name` (indexed with `user_id`) serves name-based candidate lookups (D-023).
- `identity_values` — canonical phones/emails, normalized for blocking and editable without an
  observation source; the `(user_id, kind, normalized_value)` index serves the batched blocking
  lookups.
- `observations` — one normalized record per distinct source-record state (`record_key` +
  `content_hash`), full payload preserved; an unchanged sighting refreshes `observedAt` (D-024).
- `observation_identifiers` — indexed normalized phone/email per observation (migration 0001);
  the import pipeline no longer writes it (D-023) — blocking reads use `identity_values`, and
  the identifiers remain in the observation payload.
- `identity_links` — observation ↔ identity; confidence, method, status
  (`auto | proposed | confirmed | rejected`); one identity per observation.
- `conflicts` — competing value for a canonical field with provenance and resolution state.
- `history_events` — append-only: actor, type, payload, timestamp.
- `sources` + `imports` — connections and jobs (status, R2 raw key, stats).
- `usage_operations` — per-account operation counts; limits enforced by query.

Auth tables (`user`, `session`, `account`, `verification`) exist alongside; migration `0002` adds
the pairing tables (`pairing_codes`, `extension_tokens`) — D-011.

## Boundaries and invariants

- **Tenant isolation:** every query is scoped to the authenticated user; no cross-tenant reads.
- **No third-party credentials:** WhatsApp passwords, OTPs, or session secrets are never requested
  or stored. Pairing tokens are TrueContact-issued, short-lived, and scoped to the web session.
- **No silent destructive changes:** automated reconciliation may associate and suggest; merges,
  splits, and canonical overwrites require user authorization. History is append-only.
- **Raw import minimization:** raw payloads live in R2 only as long as needed to process the
  import; the canonical graph + history are the persistent data, and users can delete their data.
- **No secondary use:** contact data is never sold or used for advertising.
- **Source-agnostic core:** a new source means a new adapter producing the shared contract —
  `product/src/domain` must never branch on a concrete provider.

## Operational notes

- `compatibility_date` is pinned to `2026-08-22` because the Workers vitest pool's bundled workerd
  supports no newer date (checked 2026-10-02). Bump it together with `wrangler` and the pool.
- D1's 10 GB per-database ceiling is far away at v1 scale; revisit if the graph approaches it.
- Imports run as queue chunks (slices run one at a time, D-018); no Durable Objects yet (not
  needed at v1 scale). A slice issues one `db.batch()` with ≤ ~45 statements and reads only its
  own blocking keys and candidates; `IMPORT_CHUNK_SIZE` defaults to 40 (D-023). Each import
  records counters plus D1 rows read/written in `imports.stats` — counters only, never contact
  data (D-023/D-024).
- Main-branch builds pin `PNPM_VERSION=12.8.1` and install the workspace explicitly
  (`SKIP_DEPENDENCY_INSTALL=1`); the `truecontact` deploy command applies D1 migrations before
  `wrangler deploy` (D-016).

## Branch and release flow

- `dev` is the default integration branch; changes arrive through PRs targeting `dev`.
- `.github/workflows/ci.yml` runs `pnpm check` on every pull request and on pushes to `dev`
  (stacked PRs target feature branches; see D-008).
- Releases are a PR from `dev` to `main` carrying exactly one `release:patch|minor|major` label.
- The first release needed a one-time history reconciliation: `main` (a template-only root) and
  `dev` (its own root) had no common history, so `main` was merged into `dev` with
  `git merge -s ours` (PR #25, which changes no files) — release PRs are possible from then on.
- On merge to `main`, `.github/workflows/release.yml` validates the single label, runs
  `scripts/release.mjs` (bumps the root `package.json` version and opens a new CHANGELOG section),
  runs `pnpm check`, commits the bump, tags `v<version>`, pushes, and publishes a GitHub release.
  A merge without a release label publishes nothing.
- After each release, a `main` → `dev` sync PR (branch `sync/main-after-<version>`) brings the
  version bump and changelog section back into `dev`, keeping the next release's notes honest.
- The push to `main` authenticates with a repository-scoped deploy key (`truecontact-release`,
  write access) stored as the `RELEASE_DEPLOY_KEY` Actions secret — see `docs/decisions.md` D-005.
- Merges to `main` deploy both Workers through Cloudflare Workers Builds (root directories
  `product`/`site`, production branch `main`, preview builds off — D-016); setup, secrets, and
  rollback are in `.commandcode/skills/ship-release/SKILL.md`.

## Repository settings (configured 2026-10-02)

- Labels: `release:patch`, `release:minor`, `release:major`.
- `dev` branch protection (classic): require a pull request (0 approvals), no force pushes,
  no deletions.
- `main` ruleset `main-protection`: require a pull request (0 approvals), no force pushes,
  no deletions; deploy keys bypass (used by the release workflow).
- Deploy key `truecontact-release` (write access); Actions secret `RELEASE_DEPLOY_KEY`.

## Production hostnames (D-015)

- Product app: `app.truecontact.prakashsewani.com` → Worker `true-contact` (Custom Domain route
  in `product/wrangler.jsonc`).
- Promo site: `truecontact.prakashsewani.com` → Worker `true-contact-site` (Custom Domain route
  in `site/wrangler.jsonc`).
- The WhatsApp extension's `host_permissions` include the app origin; the `*.workers.dev`
  hostnames remain a smoke-test fallback.

Custom Domains create their DNS records and certificates automatically when the Worker first
deploys.
