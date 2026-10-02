# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — intake + reconciliation + contacts read API landed; review actions next |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; contacts + review read API landed, next slice is the review
actions (confirm/reject/resolve/merge/split/edit).

**Done this session:** stacked-PR delivery adopted (D-008; CI on every PR); intake API (stack-1);
reconciliation consumer (stack-2); contacts read API (stack-3) — `GET /api/contacts` (canonical
values, open-conflict and proposal counts, last observed), `GET /api/contacts/:id` (values,
observations with links, conflicts, history), `GET /api/review` (open conflicts + proposed
links), all tenant-scoped; shared pipeline test helpers.

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (67 files),
Vitest 41/41 (9 files), product/extension/site builds all green.

**Blocked by:** nothing.

**Next action:** the review-actions slice (stack-4): confirm/reject proposed links (reject creates
the observation's own contact), resolve conflicts, merge and split identities, edit
displayName/notes/values — every change appending a user-actor history event.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
