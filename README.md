# TrueContact

A personal source of truth for your contacts. Contact information is scattered across phones,
WhatsApp, cloud address books, and old exports — and those sources disagree with each other.
TrueContact builds a canonical **Contact Identity** for each person, preserves the history of how
it changed, and lets the user review and decide what their contact book should say.

## What's in here

| Path | What it is |
|---|---|
| `product/` | The web app — React SPA + Hono API in one Cloudflare Worker (D1, R2, Queues) |
| `extension/` | The WhatsApp connector — Manifest V3 browser extension (WXT + React) |
| `site/` | The promo site — static Astro output, deploys independently |
| `shared/` | Contracts the packages share: normalized contact + pairing schemas, brand constants |

## Docs

- [`docs/product.md`](./docs/product.md) — the brief: what this is, who it's for, non-goals, success criteria
- [`docs/architecture.md`](./docs/architecture.md) — shape, components, data flow, invariants, repository settings
- [`docs/development.md`](./docs/development.md) — prerequisites, setup, every command
- [`docs/decisions.md`](./docs/decisions.md) — decision log (stack, scope, branching, release authentication)
- [`docs/status.md`](./docs/status.md) — current phase and handoff

## Quick start

```bash
pnpm install
cp product/.dev.vars.example product/.dev.vars    # fill in a long random BETTER_AUTH_SECRET
pnpm --filter @truecontact/product db:migrate:local
pnpm --filter @truecontact/product build          # creates the SPA assets wrangler dev serves
pnpm dev:product        # API on http://localhost:8787 (serves the built SPA)
pnpm dev:product:web    # Vite dev server on http://localhost:5173 (proxies /api)
```

Run `pnpm check` before any PR — it is the definition of done (typecheck + lint + tests + build).

## Contributing

Work on a feature branch and open a PR targeting `dev`; `dev` is the default branch. Releases
flow from a labeled `dev` → `main` PR: merging to `main` with exactly one
`release:patch|minor|major` label bumps the version, tags, and publishes a GitHub release.
Deployments are manual.

## License

[MIT](./LICENSE)
