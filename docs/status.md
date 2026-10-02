# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | complete — merged to `dev` in PRs #2–#12 |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 complete — all nine slices (schema → limits) are merged to `dev` (PRs #2–#12);
phase 3 not started.

**Done in phase 2:** contact-graph schema (migration `0001`) plus the pairing/token tables
(`0002`); vCard/CSV parsers; import intake (API → R2 → `IMPORTS_QUEUE`); queue consumer with
reconciliation (exact/name linking, conflicts, history); contacts and review read API; review
actions (confirm/reject/resolve/merge/split/edit); web UI (contacts, contact story, review
queue, imports); vCard/CSV export; pairing API and the WhatsApp extension app; free-tier limits
(D-013) — `FREE_IMPORT_LIMIT` var (default 1000), intake gate returning `402` once the lifetime
imported contact usage reaches the limit (file uploads and extension pushes), usage reported on
`GET /api/imports` and shown on the imports page.

**Verified:** `pnpm check` exit 0 re-run on the merged `dev` (2026-10-02) — typecheck for all
four packages, Biome clean (87 files), Vitest 61/61 (13 files), product/extension/site builds.
CI also green on `dev` through the stack-9 merge. The web UI went through a real browser smoke
test in stack-5; the extension is build-verified and needs a manual WhatsApp Web session to
exercise capture.

**Blocked by:** nothing.

**Next action:** phase 3 — define the promo-site requirements (content, deploy target/domain) in
`docs/`, then build the deploy-ready landing page.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
