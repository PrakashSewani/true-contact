# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | complete — merged to `dev` in PRs #2–#12 |
| 3 | Promo site: the site that explains it and sends people to it | in progress — requirements recorded (slice 1); landing page next |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 3 — promo site, in progress: requirements recorded (stack slice 1); the landing-page
build is the next slice.

**Done this slice:** promo-site requirements — section order, CTA behavior (product origin via
`site/src/config.ts` / `PUBLIC_APP_URL`, filled at deploy), deploy target (`truecontact-site`
assets-only Worker, manual), acceptance criteria; recorded in `docs/product.md` ("Promo site")
and D-014.

**Verified:** docs-only slice; `pnpm lint` (Biome, markdown included) green on top of the
phase-2 refresh, whose full `pnpm check` re-run on merged `dev` was exit 0 (typecheck for all
four packages, 87 files clean, Vitest 61/61, all builds).

**Blocked by:** nothing — the phase-3 stack is under review and merges are pending.

**Next action:** landing-page slice — build the single page to the recorded requirements, then
final verification.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
