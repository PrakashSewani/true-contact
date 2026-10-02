# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — intake + reconciliation landed; contacts API next |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; reconciliation landed, next slice is the contacts API and
review actions.

**Done this session:** stacked-PR delivery adopted (D-008; CI runs on every PR); intake API landed
(stack-1: upload → R2 → queue); recorded D-009 and implemented the reconciliation slice (stack-2):
the `IMPORTS_QUEUE` consumer parses the raw payload (`parseVCard`/`parseCsv`), records
observations + identifiers, and reconciles per D-009 — exact identifier auto-link (proposed when
ambiguous), name-similarity proposals, new identities seeded with values, `value_added` on new
values, `conflicts` on differing display names, history events throughout, import stats and one
`usage_operations` row; failures mark the import failed and ack. Match normalization helpers
(`normalizePhoneForMatch`, `normalizeEmailForMatch`, `normalizeNameForMatch`).

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (65 files),
Vitest 37/37 (api + normalize + schema + vCard + CSV + imports + matching + processing),
product/extension/site builds all green.

**Blocked by:** nothing.

**Next action:** the contacts API slice (stack-3): list/detail identities with values,
observations, links, conflicts, and history; the review queue; merge/split/edit/resolve actions
appending user history events.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
