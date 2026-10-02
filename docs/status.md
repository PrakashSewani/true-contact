# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | in progress — scaffolded + verified; PR `bootstrap/phase-0-1` awaiting merge to `dev` |
| 2 | Product: the core workflow, end to end | not started |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 1 — scaffolded and verified; awaiting the bootstrap PR merge to `dev`.

**Done this session:** captured the brief (`docs/product.md`); recorded D-001 (stack with
live-resolved versions), D-004 (v1 scope, billing deferred), D-005 (release deploy key);
scaffolded the pnpm workspace — `product/` (Hono + React SPA in one Worker, better-auth on D1,
R2 + Queues bindings, Drizzle migration, 7 passing tests), `extension/` (WXT MV3 skeleton),
`site/` (Astro landing placeholder), `shared/` (normalized-contact + pairing contracts);
wired `pnpm check`, CI, the label-driven release workflow (`scripts/release.mjs`), created the
`release:*` labels, protected `dev` and `main`, and stored the release deploy key.

**Verified:** `pnpm check` green from the root; `wrangler dev` serves `/api/health`, 401 `/api/me`,
and the SPA, with register → session → `/api/me` working through the Vite proxy (and wrong
password → 401); `wxt dev`/`wxt build` produce MV3 output; `astro dev`/`astro build` serve the
placeholder; local D1 migration applies; release script exercised in a scratch copy (minor/patch,
invalid arg, changelog section); workflows validated (YAML parse + jq/awk snippets run);
deploy-key bypass proven with a throwaway ruleset + branch (then deleted).

**Blocked by:** nothing. The first real release is still unproven end to end because no release
has happened yet (no `v*` tag exists).

**Next action:** merge the bootstrap PR to `dev` (CI runs on it), then start phase 2 with the
contact-graph domain schema (identities, observations, links, conflicts, history).

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
