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

**Phase:** 4 — launch, in progress: deploy model recorded (D-016), resources created and the D1
id wired — the release and the Workers Builds connection are next.

**Done this stack:** phase-3 review recorded (status, architecture hostnames, D-014 confirmed);
deployments move to Cloudflare Workers Builds — per-Worker connection settings and the one-time
dashboard setup steps recorded in the `ship-release` skill (D-016); dashboard resources created
(`truecontact` D1, `truecontact-imports`) and the real `database_id` wired into
`product/wrangler.jsonc`.

**Verified:** `pnpm check` exit 0 (typecheck ×4, Biome clean, Vitest 61/61, all builds,
wrangler dry-run); CI green on #14–#18 and on the `dev` merge; phase-3 browser re-smoke —
1280px light + dark, 375px mobile without horizontal overflow, FAQ toggle, skip-link focus, axe
clean (WCAG 2 A/AA, 0 violations).

**Blocked by:** the phase-4 stack merges (#20–#22); the Workers Builds connection happens after
the release lands (a connection's first build deploys whatever `main` currently holds).

**Next action:** merge the stack; then open the `release:major` `dev` → `main` release PR
(v1.0.0) — after it merges, connect Workers Builds per the `ship-release` skill (build API
token + settings) and verify the first deploy.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
