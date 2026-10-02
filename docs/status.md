# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | in progress — schema + file parsers landed; intake pipeline next |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 2 — product core workflow; file parsers landed, next slice is the import intake
pipeline.

**Done this session:** recorded D-007 (parsers, formats, dependencies); added `vcf@2.1.2`,
`papaparse@5.7.0`, and `@types/papaparse@5.5.2` to the product; implemented `parseVCard` (a thin
adapter over `vcf`: QUOTED-PRINTABLE decoding, `tel:` URI stripping, TYPE→label mapping, text
unescaping, UID as `externalId`, FN → N fallback) and `parseCsv` (papaparse with case-insensitive
header aliases, delimiter auto-detect, `;`-separated multi-value cells); both return
`{ contacts, skipped }` — malformed records are reported, never thrown; 14 parser tests; refreshed
the domain row in `docs/architecture.md`.

**Verified:** `pnpm check` exit 0 — typecheck for all four packages, Biome clean (56 files),
Vitest 24/24 (api + normalize + schema + vCard + CSV), product/extension/site builds all green.

**Blocked by:** nothing. Known open item: the release path is still unproven until the first
tagged release.

**Next action:** implement the import intake slice — an authenticated upload endpoint that stores
the raw payload in `IMPORTS_BUCKET` (R2), creates the `sources`/`imports` rows, and enqueues to
`IMPORTS_QUEUE`; then the consumer that turns observations into identities, links, and conflicts.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
