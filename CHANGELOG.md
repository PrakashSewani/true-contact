# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- Renamed the template to TrueContact; replaced the brief, stack decision, architecture, and
  development docs with the real ones (`docs/decisions.md` D-001, D-004, D-005).
