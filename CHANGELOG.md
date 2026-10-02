# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-10-02

### Added

- Data deletion: "Delete all data" on the Imports page clears contacts, imports, and history for
  the signed-in account (usage counters stay, since they track the free-tier limit).

## [1.1.0] - 2026-10-02

### Added

- Chrome Web Store prep: extension icon set, a popup that locks the pairing URL once connected and
  offers Disconnect, a notice (and disabled scan) when opened outside WhatsApp Web, a site privacy
  policy page, extension install links on the site and the app's Imports page, and the store
  listing copy (`docs/extension-store-listing.md`).

### Changed

- Worker names in the repo configs now match the deployed Workers (`true-contact`,
  `true-contact-site`) so `wrangler` CLI commands target them correctly (D-017).

### Fixed

- WhatsApp connector: chat capture reads chat IDs from WhatsApp's page state (the DOM no longer
  carries them) — covering the full chat and contact lists, not just rendered rows — and a scan
  that finds nothing reports what the capture actually saw.
- WhatsApp connector: phone numbers are now captured for LID-based contacts too (WhatsApp exposes
  the number on the page's contact model), and the popup reports how many contacts came with
  numbers.
- Contacts list and export no longer fail for accounts with more than 100 contacts (the D1
  bound-parameter limit broke the batch queries).

## [1.0.0] - 2026-10-02

### Added

- pnpm workspace scaffold: `product/` (Hono API + React SPA on a Cloudflare Worker with D1, R2,
  and Queues bindings), `extension/` (WXT Manifest V3), `site/` (Astro), `shared/` (zod contracts
  and brand constants).
- better-auth email/password authentication on D1 with the initial migration, plus a
  session-guarded placeholder SPA.
- `pnpm check` (typecheck + lint + tests + build) and Workers-pool Vitest tests: health endpoint,
  session guard, register → session → authenticated read, and normalization unit tests.
- CI workflow for PRs to `dev`/`main`; label-driven release workflow for merges to `main`
  (version bump, changelog, tag, GitHub release) with deploy-key push authentication.
- Repository settings: `release:*` labels, `dev` branch protection, and a `main-protection`
  ruleset.
- Contact-graph schema (migration `0001`): identities, canonical values, observations, links,
  conflicts, append-only history, sources/imports, and usage counters.
- vCard and CSV file imports: pure parsers in the domain package plus session-authenticated
  intake (raw payload to R2, chunked queue processing).
- Reconciliation pipeline: the queue consumer auto-links exact phone/email matches, proposes
  name matches, absorbs non-conflicting values with provenance, and opens conflicts — canonical
  data is never overwritten silently.
- Contacts and review API: contact list and contact story, review queue, and the write actions
  (confirm/reject a link, resolve a conflict, merge, split, edit canonical data) — each recorded
  as a history event.
- Web UI: contacts list, contact story, review queue, and imports page with pairing code and
  free-tier usage.
- vCard and CSV export of the canonical contact book.
- WhatsApp connector: WXT Manifest V3 extension (popup pairing, chat-list capture) with the
  pairing-code + bearer-token API (migration `0002`) and the extension import endpoint.
- Free-tier usage limits: `FREE_IMPORT_LIMIT` variable (default 1000), an intake gate returning
  `402` once lifetime imported-contact usage reaches the limit, and usage reporting on
  `GET /api/imports`.
- Promo site: a deploy-ready single static landing page (Astro, no client-side JavaScript) with
  the hero identity-card proof, problem compare, the four-step loop, trust panels, WhatsApp
  connector, pricing, FAQ, and footer; light/dark schemes; favicon and robots.txt.
- Production hostnames: Worker Custom Domains `truecontact.prakashsewani.com` (promo site) and
  `app.truecontact.prakashsewani.com` (product), with the extension host permission and the
  deploy checklist wired for them (D-015).

### Changed

- Renamed the template to TrueContact; replaced the brief, stack decision, architecture, and
  development docs with the real ones (`docs/decisions.md` D-001, D-004, D-005).
- Deployments: `main` now builds and deploys both Workers through Cloudflare Workers Builds
  (D-016); the product deploy applies D1 migrations before `wrangler deploy`, and manual wrangler
  runs are reserved for rollback/emergency.
