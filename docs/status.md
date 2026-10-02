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
| 4 | Launch: first release tagged, site deployed | in progress |

## Current handoff

**Phase:** 3 — complete: the promo-site stack merged to `dev` (#14–#18) and was re-verified
against the docs, end to end.

**Done this stack:** phase-3 review — the site matches the recorded section order and the D-015
hostnames are wired (product route, site route, extension host permission); this slice records
the verification result in the tracker and the hostnames in `docs/architecture.md`, and closes
D-014's user confirmation.

**Verified:** `pnpm check` exit 0 (typecheck ×4, Biome clean, Vitest 61/61, all builds,
wrangler dry-run); CI green on #14–#18 and on the `dev` merge; browser re-smoke on the built
site — 1280px light + dark, 375px mobile with no horizontal overflow, FAQ toggle, skip-link
focus, and an axe audit at WCAG 2 A/AA with 0 violations.

**Blocked by:** nothing — phase 3 is closed.

**Next action:** phase 4 — launch: the Workers Builds deploy setup (next slice) and the labeled
`release:major` `dev` → `main` release PR (v1.0.0).

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
