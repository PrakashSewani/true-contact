# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | complete — merged to `dev` in PRs #2–#12 |
| 3 | Promo site: the site that explains it and sends people to it | complete — merged to `dev` in PRs #14–#18 |
| 4 | Launch: first release tagged, site deployed | complete — v1.0.0 released; both Workers live (2026-10-02) |

## Current handoff

**Phase:** post-launch iteration — **v1.3.0 released and deployed** (contacts list search, filters,
and sorting — D-025; deploys ran via the emergency path — Workers Builds is producing no builds,
dashboard check outstanding).

**Done since v1.0.0:** chunked/resumable imports (D-018); personal-only access with admin
approvals (D-019); store prep — connector icons + popup UX, privacy page, listing copy; phone
capture through WhatsApp Web's in-page store via WA-JS (D-020); the personal-stage import cap
removed (D-021); capture corrected to the address book only, `@lid`/`@c.us` folded per phone, and
Meta AI + the account's own card filtered; console diagnostics removed (#41); one shared UI system
for the app and the site, with the owner credited (D-022, #42); the promo site presents the closed
beta (no store links until the public launch); the product Worker recovered to the v1.2.2 build
after its v1.2.1 and v1.2.2 builds failed at the D1 migration gate during the quota exhaustion
(manual deploy, 2026-10-03); D1 import-efficiency work (D-023/D-024): the audit, migration 0005,
batched scan-free reconciliation, and source-record idempotency — released as v1.2.3 and deployed
via the emergency path (Workers Builds produced no builds for the release); contacts list rebuilt
with client-side search, filters, and sorting (D-025, #58) — released as v1.3.0, same deploy
situation.

**Verified (2026-10-02):** live `/api/health` ok; a real session scan pushed **493 unique
contacts** (every externalId `@c.us`, no duplicates, Meta AI and self absent); `pnpm check` green
on `dev`; the `v1.2.2` release workflow completed green and `main` is at `1.2.2`; the built site
HTML carries the brand theme (`#2f6f4f` / `#6fbf94` dark) with zero hydration, and the
closed-beta copy (no Chrome links, apply-for-access CTAs).

**Verified (2026-10-03):** product Worker deployment `60addd06` is live (last pre-fix deploy
2026-10-02 15:51 UTC; v1.2.1 shipped 18:03 UTC, v1.2.2 18:19 UTC), serving the MUI build
(`index-D9O31UDi.js`, was `index-C8KDKltO.js`) with `/api/health` ok; the promo site serves the
closed-beta copy; remote D1 reports no pending migrations.

**Verified (2026-10-03, D1 stack):** `pnpm check` green with 78 Workers-pool tests. Budget tests
observe a 60-contact fresh slice within ≤ 50 statements / ≤ 1.6k rows written, an unchanged
60-contact re-import within ≤ 10 statements / ≤ 120 rows written and zero new
observations/links/events, and a redelivered slice at 1 statement / 0 rows written; candidate
queries use the intended tenant-scoped indexes (`EXPLAIN QUERY PLAN` assertions).

**Reset (2026-10-03):** production D1 was cleared for a fresh start — usage counters, pairing
codes, extension tokens, and sessions wiped; accounts, memberships, and the migration ledger kept
(pre-wipe Time Travel bookmark recorded).

**Verified (2026-10-03, v1.3.0):** release workflow green (tag + GitHub release `v1.3.0`); product
deployed manually as `a8df0ecb` — the served bundle (`index-CMMuLFX2.js`, was `index-D4MjaH10.js`)
contains the new contacts UI and `/api/health` is ok; `pnpm check` green with 84 Workers-pool
tests on the contacts-list PR.

**Blocked by:** nothing.

**Next action:** re-pair the extension and run the first real import — check its `stats` line
(rows read/written, unchanged/updated) against the old ~150k-read re-scan — then check the Workers
Builds dashboard for why the v1.2.3/v1.3.0 pushes produced no builds (deploys fell back to the
emergency path). Then the shipping backlog (rate limiting + pricing, public launch).

---

## Backlog (official shipping)

- **Rate limiting + pricing** — replace the removed personal-stage import gate (revisit D-013
  with D-021).
- **Public launch: publish the extension with the app** — the connector ships together with the
  public app (the site hides store links until then). On that day: publish the store listing and
  set `PUBLIC_EXTENSION_URL` (site — the config already reads it) and `VITE_EXTENSION_URL`
  (product) so both link straight to it.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
