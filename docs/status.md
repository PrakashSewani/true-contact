# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — core workflow + export landed; WhatsApp extension + usage limits remain |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; export landed, next slices are the WhatsApp extension
(pairing + capture) and usage limits.

**Done this session (stack continued):** stacks 1–5 (intake, reconciliation, contacts/review read
API, review actions, web UI); stack-6 export — `GET /api/export/vcard` and `/api/export/csv`
render the canonical graph (vCard 3.0 escaping, TYPE labels, RFC 4180 quoting, `;`-joined
multi-values) and record a usage operation; export links on the contacts page; roundtrip tests
(export → our own parsers) plus renderer unit tests.

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (78 files),
Vitest 53/53 (11 files), product/extension/site builds. (The web UI was additionally smoke-tested
in a real browser in stack-5.)

**Blocked by:** nothing.

**Next action:** the WhatsApp extension slice (stack-7): pairing flow (web ↔ extension) and
contact capture in the extension, pushing batches to the import API.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
