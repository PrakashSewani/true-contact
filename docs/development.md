# Development

## Prerequisites

- Node 24.21.0 (`.nvmrc`); anything `>=22` passes the `engines` check
- pnpm 12.8.1 — run `corepack enable` once; the version comes from the `packageManager` field
- No Cloudflare account is needed for local development or the check command

## Setup

```bash
pnpm install
cp product/.dev.vars.example product/.dev.vars   # then fill in a long random BETTER_AUTH_SECRET
pnpm --filter @truecontact/product db:migrate:local
pnpm --filter @truecontact/product build         # creates dist/web — wrangler dev requires it
```

## Commands

| Command | What it does |
|---|---|
| `pnpm check` | typecheck + lint + tests + build across all packages — the command that must pass before anything is "done" |
| `pnpm typecheck` | `tsc` for `shared`/`ui`/`product`/`extension` (`wrangler types` and `wxt prepare` run first), `astro check` for the site |
| `pnpm lint` / `pnpm lint:fix` | Biome check (with safe fixes) |
| `pnpm test` | Vitest in the Workers pool — product only |
| `pnpm build` | Vite + Worker bundle (product), WXT MV3 (extension), Astro static output (site) |
| `pnpm dev:product` | `wrangler dev` — API on http://localhost:8787, serves the SPA from the last build (run `pnpm --filter @truecontact/product build` first) |
| `pnpm dev:product:web` | Vite dev server on http://localhost:5173, proxies `/api` to 8787 (run alongside) |
| `pnpm dev:extension` | WXT dev build; load `.output/chrome-mv3-dev` unpacked at `chrome://extensions` |
| `pnpm dev:site` | Astro dev server on http://localhost:4321 |
| `pnpm --filter @truecontact/product db:generate` | Regenerate migrations after changing `src/db/schema.ts` |
| `pnpm --filter @truecontact/product db:migrate:local` | Apply migrations to the local D1 |
| `pnpm --filter @truecontact/product db:migrate:remote` | Apply migrations to the deployed D1 (deploy-time, manual) |

## Environment

`product/.dev.vars` (gitignored) supplies local values:

- `BETTER_AUTH_SECRET` — a long random string; required for auth to work locally
- `BETTER_AUTH_URL` — the browser-facing origin (`http://localhost:5173` in development)

In production these are set once on the Worker (dashboard **Variables and Secrets**, or
`wrangler secret put`); deploys themselves are automated (D-016).

## Tests

Product tests run inside the Workers runtime against a local D1 (`@cloudflare/vitest-pool-workers`):
register → session → authenticated read, plus pure unit tests. Migrations are applied in
`product/test/setup.ts` via `applyD1Migrations`.

## Releases and deploys

Create release PRs from `dev` to `main` and apply exactly one release label:
`release:patch`, `release:minor`, or `release:major`. On merge, release automation runs only from
`main`: it bumps the root `package.json` version and `CHANGELOG.md`, runs the checks, commits the
bump, creates the matching `v<version>` tag, and publishes a GitHub release. Merges without a
release label do not publish a release. Product and site deployments run automatically from
`main` through Cloudflare Workers Builds (D-016) — one-time setup, build settings, secrets, and
rollback are in
[`.commandcode/skills/ship-release/SKILL.md`](../.commandcode/skills/ship-release/SKILL.md).
Manual `wrangler deploy` remains available for emergencies, and the extension stays a manual
build/zip + store upload.

To preview the version bump locally without touching the repo, copy `package.json` and
`CHANGELOG.md` into a scratch directory and run `node scripts/release.mjs <bump>` there.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` during install | `esbuild` and `workerd` are allowed in `pnpm-workspace.yaml` (`allowBuilds`); run `pnpm approve-builds --all` once on a machine if pnpm asks again |
| Workers test pool fails with "newest date supported by this server binary" | Lower `compatibility_date` in `product/wrangler.jsonc` to what the pool's bundled workerd supports (currently `2026-08-22`) |
| Auth requests fail locally with 403/CSRF errors | Make sure `BETTER_AUTH_URL` in `product/.dev.vars` matches the browser-facing origin (5173) and the Vite proxy is running |
| `wrangler dev` complains about missing secret | Copy `product/.dev.vars.example` to `product/.dev.vars` and set `BETTER_AUTH_SECRET` |
