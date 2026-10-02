# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — pairing + extension import API landed; extension app + usage limits remain |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; the extension pairing API landed, next slice is the
extension app itself (WXT popup, background, WhatsApp Web content script), then usage limits.

**Done this session (stack continued):** stacks 1–6 (intake, reconciliation, contacts/review read
API, review actions, web UI, export); stack-7 pairing API — `pairing_codes` + `extension_tokens`
(migration `0002`, only SHA-256 token hashes stored), `POST /api/pairing/start` (session),
`POST /api/pairing/exchange` (single-use code → 30-day bearer token), and
`POST /api/imports/extension` accepting the shared `importBatchSchema`; the consumer now passes
WhatsApp batches through the shared contract; pairing-code panel on the imports page.

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (83 files),
Vitest 57/57 (12 files), product/extension/site builds.

**Blocked by:** nothing.

**Next action:** the extension app (stack-8): WXT popup (pairing-code entry, scan button),
background service worker (token storage in `browser.storage`, batch push), and the WhatsApp Web
content script.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
