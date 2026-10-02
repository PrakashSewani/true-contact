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

**Phase:** 3 — promo site, in progress: requirements and the landing page are built and stacked;
merges pending.

**Done this stack:** promo-site requirements (`docs/product.md` "Promo site", D-014); the
landing page — single static Astro page with the recorded section order (hero with the
identity-card proof, problem compare, four steps, never/always trust panels, WhatsApp connector
with pairing steps, pricing, FAQ, footer); production hostnames wired (D-015) —
`truecontact.prakashsewani.com` (site) and `app.truecontact.prakashsewani.com` (product) as
Worker Custom Domains, extension host permission added; favicon + robots.txt.

**Verified:** `pnpm check` exit 0 (typecheck all four packages, Biome clean, Vitest 61/61, all
builds, wrangler dry-run with the custom-domain routes and no Cloudflare account). Browser smoke
test on the built site (`astro preview`, agent-browser): 1280px in light and dark, 375px mobile
with no horizontal overflow, FAQ open state, skip-link focus ring, and the reduced-motion path.

**Blocked by:** nothing — the phase-3 stack (#14–#16 and this slice) is under review and merges
are pending.

**Next action:** after the stack merges to `dev`: phase 4 — first release (labeled `dev` → `main`
PR), then manual deploys per the `ship-release` skill (product: D1/R2/Queues + secrets with
`BETTER_AUTH_URL`; site: `PUBLIC_APP_URL`; extension packaging).

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
