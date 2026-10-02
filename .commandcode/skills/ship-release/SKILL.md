---
name: ship-release
description: Explain the automated release path and perform manual product/site deployments when asked. The release workflow is filled in at bootstrap time.
license: MIT
metadata:
  template: true-contact
  version: "1"
---

# Release and deploy

## Rules (always)

- **Release trigger:** only a pull request merged into `main` can start release-related workflows.
  Work on `dev` never publishes a release.
- **Release selection:** a release PR has exactly one `release:patch`, `release:minor`, or
  `release:major` label. A merge without one of these labels does not publish a release.
- **Version source of truth:** the chosen stack's manifest. The workflow applies the labeled bump,
  creates a `v<version>` tag matching the manifest, and publishes a GitHub release.
- **Deployments are manual.** Give the user exact, copy-pasteable commands; never deploy without
  being asked.
- **Record the real procedure here** when the stack is chosen (see "Procedure" below), including
  the automated release workflow, artifact handling, and failure path — how to yank a bad release.

## Procedure — TrueContact (filled in at bootstrap, 2026-10-02)

### Automated release (GitHub Actions)

`.github/workflows/release.yml`, triggered only by a merged PR into `main`:

1. **Label validation** — the merge must carry exactly one `release:patch`, `release:minor`, or
   `release:major` label; zero labels skip (nothing published), two or more fail the run.
2. **Version + changelog** — `node scripts/release.mjs <bump>` bumps the root `package.json` and
   opens a new `## [<version>] - <date>` section in `CHANGELOG.md` (previous `[Unreleased]`
   entries move under it).
3. **Checks/build** — `pnpm check` on the merged tree.
4. **Commit, tag, push** — commits the bump as `chore(release): v<version>`, tags
   `v<version>`, and pushes with the `RELEASE_DEPLOY_KEY` deploy key (the `main-protection`
   ruleset grants deploy keys bypass — see D-005).
5. **GitHub release** — `gh release create v<version>` with notes extracted from the changelog.

### Manual deploys (only when asked)

Prerequisites: `wrangler login` on the machine doing the deploy.

**Product** (from `product/`):

```bash
npx wrangler d1 create truecontact        # once — put the returned id into wrangler.jsonc
npx wrangler r2 bucket create truecontact-imports   # once
npx wrangler queues create truecontact-imports      # once
npx wrangler d1 migrations apply DB --remote        # apply migrations
npx wrangler secret put BETTER_AUTH_SECRET          # long random string
npx wrangler secret put BETTER_AUTH_URL             # deployed origin, e.g. https://app.example.com
pnpm build && pnpm deploy                          # vite build + wrangler deploy
```

**Promo site** (from `site/`):

```bash
PUBLIC_APP_URL=https://<product-origin> pnpm deploy   # astro build && wrangler deploy (assets-only Worker "truecontact-site")
```

`PUBLIC_APP_URL` fills the site's call-to-action links; without it they fall back to the
`app.truecontact.example` placeholder (D-014). Custom domain and canonical URL are deploy-time
decisions.

**Extension** (from `extension/`): `pnpm build && pnpm zip`, then upload the zip in the Chrome
Web Store developer dashboard. Not automated.

_These deploy commands are the planned procedure; they have not been exercised yet because no
deploy has happened. Run them once against the real account before trusting them._

### Failure path / rollback

- **Bad worker deploy:** `npx wrangler rollback` (or `wrangler deployments list` then rollback to
  a specific version). The site is an assets-only Worker, same commands.
- **Bad release:** delete the GitHub release and tag (`gh release delete v<version> --yes`,
  `git push origin :v<version>`), then re-merge a corrected release PR with the same label.
- **Bad extension submission:** publish a fixed version to the store; no rollback path exists for
  users who already updated.
