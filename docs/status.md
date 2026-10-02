# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — all slices built and stacked (schema → limits); merges pending |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — every slice is built and stacked; waiting on the stack merging before phase 3.

**Done this session (stack continued):** stacks 1–8 (intake, reconciliation, contacts/review read
API, review actions, web UI, export, pairing API, extension app); stack-9 usage limits —
`FREE_IMPORT_LIMIT` var (default 1000), an intake gate returning `402` once the lifetime imported
contact usage reaches the limit (file uploads and extension pushes), usage reported on
`GET /api/imports` and shown on the imports page (D-013).

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (87 files),
Vitest 61/61 (13 files), product/extension/site builds. (The web UI also went through a real
browser smoke test in stack-5; the extension is build-verified and needs a manual WhatsApp Web
session to exercise capture.)

**Blocked by:** nothing.

**Next action:** after the stack merges to `dev`, phase 3 — build out the promo site (real
landing page, deploy-ready).

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
