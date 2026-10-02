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

**Phase:** post-launch iteration — **v1.2.1 released** (tag + GitHub release published; Workers
Builds deploy `true-contact` / `true-contact-site` from `main`).

**Done since v1.0.0:** chunked/resumable imports (D-018); personal-only access with admin
approvals (D-019); store prep — connector icons + popup UX, privacy page, listing copy; phone
capture through WhatsApp Web's in-page store via WA-JS (D-020); the personal-stage import cap
removed (D-021); capture corrected to the address book only, `@lid`/`@c.us` folded per phone, and
Meta AI + the account's own card filtered; console diagnostics removed (#41); one shared UI system
for the app and the site, with the owner credited (D-022, #42); releases v1.1.0–v1.2.1 deployed
through Workers Builds; the promo site now presents the closed beta (no store links until the
public launch).

**Verified (2026-10-02):** live `/api/health` ok; a real session scan pushed **493 unique
contacts** (every externalId `@c.us`, no duplicates, Meta AI and self absent); `pnpm check` green
on `dev`; the `v1.2.1` release workflow completed green and `main` is at `1.2.1`; the built site
HTML carries the brand theme (`#2f6f4f` / `#6fbf94` dark) with zero hydration.

**Blocked by:** nothing.

**Next action:** land the closed-beta site copy (`site/closed-beta-copy`) and ship it with the
next release; the public launch then publishes the extension store listing.

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
