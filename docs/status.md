# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — intake landed (upload → R2 → queue); reconciliation next |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; intake slice landed, next slice is the queue consumer and
reconciliation.

**Done this session:** adopted stacked-PR delivery (D-008; CI runs `pnpm check` on every pull
request now); recorded D-009 (intake and reconciliation semantics); implemented the import intake
API — `POST /api/imports` (session-authenticated; kind detection; raw payload to `IMPORTS_BUCKET`
at `imports/{userId}/{importId}`; `sources` + `imports` rows; enqueue to `IMPORTS_QUEUE`),
`GET /api/imports`, `GET /api/imports/:id` — plus a shared session helper and test helpers;
4 intake tests.

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (61 files),
Vitest 28/28 (api + normalize + schema + vCard + CSV + imports), product/extension/site builds
all green.

**Blocked by:** nothing.

**Next action:** the reconciliation slice (stack-2): the `IMPORTS_QUEUE` consumer parses the raw
payload and reconciles observations into identities, links, values, conflicts, and history
per D-009.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
