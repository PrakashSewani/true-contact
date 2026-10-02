# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — extension app landed; usage limits remain |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; the extension app landed, next slice is usage limits, then
phase 3 (promo site).

**Done this session (stack continued):** stacks 1–7 (intake, reconciliation, contacts/review read
API, review actions, web UI, export, pairing API); stack-8 extension app — popup (TrueContact URL,
pairing code, scan button, paired status), background service worker (pair/scan/status message
routing, bearer token in `browser.storage.local`, batch push), WhatsApp Web content script
(best-effort chat-list capture per D-012: JID as `externalId`, `@c.us` phones, groups skipped),
and manifest host permissions for the local API origin (production origin to be added at deploy).

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (85 files),
Vitest 57/57 (12 files), product/extension/site builds; the built MV3 manifest inspected
(service worker + popup + content script, storage permission, host permission). Extension
behavior against real WhatsApp Web still needs a manual load-and-scan session.

**Blocked by:** nothing.

**Next action:** the usage-limits slice (stack-9): free-tier limit configuration and enforcement
on imports and exports.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
