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
