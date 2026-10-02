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

**Phase:** 4 — launch, in progress: deploy model recorded (D-016); the one-time Cloudflare setup
is next.

**Done this stack:** phase-3 review recorded (status, architecture hostnames, D-014 confirmed);
deployments move to Cloudflare Workers Builds — per-Worker connection settings and the one-time
dashboard setup steps recorded in the `ship-release` skill (D-016).

**Verified:** `pnpm check` exit 0 (typecheck ×4, Biome clean, Vitest 61/61, all builds,
wrangler dry-run); CI green on #14–#18 and on the `dev` merge; phase-3 browser re-smoke —
1280px light + dark, 375px mobile without horizontal overflow, FAQ toggle, skip-link focus, axe
clean (WCAG 2 A/AA, 0 violations).

**Blocked by:** the one-time Cloudflare setup — create D1/R2/Queues; the D1 database ID must be
wired into `product/wrangler.jsonc` and reach `main` before the builds connect (a connection's
first build deploys whatever `main` currently holds).

**Next action:** wire the real D1 id (next slice), then open the `release:major` `dev` → `main`
release PR (v1.0.0); after it merges, connect Workers Builds per the `ship-release` skill and
verify the first deploy.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
