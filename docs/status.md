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

**Phase:** post-launch iteration — v1.2.0 live; the phone-capture stack (#38/#39) is merged to
`dev`; UI unification (D-022) is in progress.

**Done since v1.0.0:** chunked/resumable imports (D-018); personal-only access with admin
approvals (D-019); store prep — connector icons + popup UX, privacy page, listing copy; phone
capture through WhatsApp Web's in-page store via WA-JS (D-020); the personal-stage import cap
removed (D-021); capture corrected to the address book only, `@lid`/`@c.us` folded per phone, and
Meta AI + the account's own card filtered; connector console diagnostics removed (PR #41);
releases v1.1.0/v1.2.0 deployed through Workers Builds (`true-contact` / `true-contact-site`).

**Verified (2026-10-02):** live `/api/health` ok; a real session scan pushed **493 unique
contacts** (every externalId `@c.us`, no duplicates, Meta AI and self absent); `pnpm check` green
on the merged stack and on the UI slice (#42) — the built site HTML carries the brand theme
(`#2f6f4f` / `#6fbf94` dark) with zero hydration.

**Blocked by:** nothing.

**In review:** #41 (quiet connector console), #42 (shared UI system, D-022) — both target `dev`.

**Next action:** merge #41 and #42 to `dev`, then cut the **v1.2.1** release PR
(`release:minor`) from `dev` to `main`.

---

## Backlog (official shipping)

- **Rate limiting + pricing** — replace the removed personal-stage import gate (revisit D-013
  with D-021).
- **Store listing live** — publish the extension zip (`extension/.output/truecontactextension-*.zip`),
  then set `PUBLIC_EXTENSION_URL` / `VITE_EXTENSION_URL` so the site and app link to it.
- **Site pricing copy** — the promo site still describes the old free-tier cap; revisit with the
  pricing work.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
