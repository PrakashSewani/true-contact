# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — API complete (intake, reconciliation, contacts, review actions); web UI next |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; the API surface is complete, next slice is the web UI
(contacts list, contact story, review queue, imports, exports).

**Done this session (stack continued):** stack-1 intake API; stack-2 reconciliation consumer;
stack-3 contacts + review read API; stack-4 review actions (D-010) — confirm/reject proposed
links (reject spawns the observation's own contact), resolve conflicts (`keep_existing` /
`use_proposed` / `custom`), merge identities (values/links/conflicts move, tombstone), split
observations onto a new identity, edit displayName/notes, add/remove values; shared graph helpers
(`product/src/imports/graph.ts`) now back both the consumer and the actions with user-actor
history.

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (70 files),
Vitest 47/47 (10 files), product/extension/site builds all green.

**Blocked by:** nothing.

**Next action:** the web UI slice (stack-5): contacts list page, contact detail with the history
timeline, the review queue wired to the action endpoints, and import upload/status; routes and
navigation inside the existing session-guarded shell.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
