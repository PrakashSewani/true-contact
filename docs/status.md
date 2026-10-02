# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — contact-graph schema landed (migration `0001`); import pipeline next |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; schema slice landed, next slice is the import pipeline.

**Done this session:** pulled the merged `dev` (PR #1) and reviewed every doc against the repo;
refreshed this tracker and the CI note in `docs/architecture.md`; settled the increment semantics
with the user — exact identifier matches auto-link, non-conflicting values auto-apply with
provenance, conflicts queue for review — and recorded them as D-006; implemented the contact-graph
schema (identities, identity_values, observations, observation_identifiers, identity_links,
conflicts, history_events, sources, imports, usage_operations) in `product/src/db/schema.ts`;
generated migration `0001_pale_nightmare.sql`; added `product/test/schema.test.ts` (full-graph
roundtrip, one-identity-per-observation, user-delete cascade across all ten tables).

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (50 files),
Vitest 10/10 (api + normalize + schema), product/extension/site builds all green.

**Blocked by:** nothing. Known open item: the release path is still unproven until the first
tagged release.

**Next action:** after this PR merges, start the import pipeline slice with the vCard/CSV parsers
(pure `product/src/domain` functions producing `NormalizedContact`, fully tested).

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
