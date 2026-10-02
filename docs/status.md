# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — API + web UI landed; export, WhatsApp extension, usage limits remain |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; the web UI is in, next slice is export.

**Done this session (stack continued):** stack-1 intake; stack-2 reconciliation; stack-3 contacts
+ review read API; stack-4 review actions (D-010); stack-5 web UI — layout with nav, contacts
list, contact story (canonical edit, values, conflicts, observations with split, merge picker,
history), review queue wired to the action endpoints, import upload with auto-refresh. Two fixes
proven by a real browser smoke test: `src/web/api.ts` collided with the Vite `/api` proxy
(renamed to `client.ts`, proxy pinned to `^/api/`), and `parseVCard` now normalizes LF-only
files (the `vcf` library needs CRLF).

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (75 files),
Vitest 48/48 (10 files), product/extension/site builds. Browser smoke test (agent-browser against
`wrangler dev` + Vite): registered a user, imported two vCards (2 new contacts, then a name
conflict and a possible match), resolved the conflict with the proposed value, confirmed the
match, and watched both propagate into the contacts list and the contact's history timeline.

**Blocked by:** nothing.

**Next action:** the export slice (stack-6): vCard/CSV rendering of the canonical graph
(`GET /api/export/...`) plus download actions in the UI.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
