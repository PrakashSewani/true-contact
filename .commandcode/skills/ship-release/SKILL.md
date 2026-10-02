---
name: ship-release
description: Release and deploy guide — the automated GitHub release flow, the Cloudflare Workers Builds setup for product and site, and the manual rollback procedures.
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
- **Deploy trigger:** product and promo site deploy from `main` through Cloudflare Workers Builds
  (D-016). Never push to `main` outside the release PR flow and never trigger a production
  deploy ad hoc.
- **Manual Cloudflare actions are one-time setup, secrets, and rollbacks only.** Give exact,
  copy-pasteable steps; follow this skill literally; do not invent deploy pipelines.
- Extension packaging is manual and the Chrome Web Store submission happens only when asked.

## Procedure — TrueContact (deploy model updated 2026-10-02, D-016)

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

### Automated deploy (Cloudflare Workers Builds, D-016)

Both Workers connect to this repository with production branch `main`; preview builds are
disabled, so only `main` pushes build. A release produces two builds — the merge commit and the
version-bump commit — deploying identical code.

| Worker | Root directory | Build command | Deploy command | Build variables |
|---|---|---|---|---|
| `true-contact` | `product` | `pnpm install --frozen-lockfile && pnpm build` | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` | `SKIP_DEPENDENCY_INSTALL=1`, `PNPM_VERSION=12.8.1` |
| `true-contact-site` | `site` | `pnpm install --frozen-lockfile && pnpm build` | `npx wrangler deploy` | `SKIP_DEPENDENCY_INSTALL=1`, `PNPM_VERSION=12.8.1`, `PUBLIC_APP_URL=https://app.truecontact.prakashsewani.com` |

- Build logs, retries, and rollbacks: Worker → **Deployments** → **Build History**.
- Preview builds stay off per Worker (**Settings** → **Build** → **Branch control** →
  **Enable Preview Builds** unchecked), so only `main` pushes build.
- Once the Chrome Web Store listing is live, add `PUBLIC_EXTENSION_URL` (site) and
  `VITE_EXTENSION_URL` (product) build variables so the site and app link straight to the
  listing; without them both fall back to a store search.
- Install is explicit because the builds run inside a pnpm workspace subdirectory; Node uses the
  build image default (24.x, satisfies `engines >=22`).

### One-time setup (dashboard) — exercised end to end on 2026-10-02 (v1.0.0)

> **Observed results from the first launch.** Connect the builds only **after** the release PR
> lands on `main`: connecting earlier makes both builds fail, because the root directories do not
> exist in a template-only tree — retrying them after the release merges clears that up.
> Cloudflare provisions the Custom Domain certificate asynchronously, so the first HTTPS request
> can fail with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` for a few minutes. The deployed Workers are
> named `true-contact` / `true-contact-site`; Workers Builds matches the connected name
> automatically (`WRANGLER_CI_OVERRIDE_NAME`), and the repo configs were aligned to them (D-017).

Prerequisites: the repository is connected to GitHub, and the Cloudflare account owns the
`prakashsewani.com` zone.

1. **Create the resources** (Cloudflare dashboard):
   - **D1** — Workers & Pages → D1 SQL Database → Create database → `truecontact`. Copy the
     database ID.
   - **R2** — R2 → Create bucket → `truecontact-imports`.
   - **Queues** — Workers & Pages → Queues → Create queue → `truecontact-imports`.

   The D1 database ID must be wired into `product/wrangler.jsonc` (`database_id`) and released to
   `main` before the builds connect — the connection's first build deploys whatever `main`
   currently holds.

2. **Create the build API token** — My Profile → API Tokens → Create Token:
   - Account: Workers Scripts **Edit**, Workers Routes **Edit**, Workers Queues **Edit**,
     Workers R2 Storage **Edit**, D1 **Edit**, Account Settings **Read**
   - Zone (`prakashsewani.com`): Workers Routes **Edit**
   - User: User Details **Read**, Memberships **Read**

   (Cloudflare's auto-generated build token already includes most of these — D1 and Queues are
   the additions that matter.)

3. **Release `dev` → `main`** (labeled `release:*` PR) so `main` carries the real D1 id and the
   v1.0.0 code. Do this before connecting builds.

4. **Connect `true-contact`** — Workers & Pages → Create application → Import a repository →
   GitHub → this repository → configure with the `true-contact` row from the table above, select
   the token from step 2, disable preview builds, save and deploy. Then on the new Worker
   (**Settings** → **Variables and Secrets**) add:
   - `BETTER_AUTH_SECRET` — secret; generate with `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — `https://app.truecontact.prakashsewani.com`

   Deploy the variables (or `npx wrangler secret put …` once the Worker exists).

5. **Connect `true-contact-site`** — same import flow with the `true-contact-site` row from the
   table above (including the `PUBLIC_APP_URL` build variable), preview builds off.

6. **Verify the first deploy** — build ends green in Build History; `https://app.truecontact.prakashsewani.com/api/health`
   answers; `https://truecontact.prakashsewani.com` serves the landing page with CTA links
   pointing at the app origin.

### Emergency manual deploys (only when asked)

Prerequisites: `wrangler login` on the machine doing the deploy.

**Product** (from `product/`):

```bash
npx wrangler d1 migrations apply DB --remote
pnpm build && pnpm deploy
```

**Promo site** (from `site/`):

```bash
PUBLIC_APP_URL=https://app.truecontact.prakashsewani.com pnpm deploy
```

**Extension** (from `extension/`): `pnpm build && pnpm zip`, then upload the zip in the Chrome
Web Store developer dashboard.

### Failure path / rollback

- **Bad deploy:** Workers Builds → Deployments → roll back to a previous version (dashboard), or
  `npx wrangler rollback` (or `wrangler deployments list` then rollback to a specific version);
  then fix forward with a new release.
- **Failing build:** Deployments → Build History → open the build (logs) and retry it from the
  ellipsis menu. Install failures point at `PNPM_VERSION` / lockfile drift; authorization
  failures point at the build API token.
- **Bad release:** delete the GitHub release and tag (`gh release delete v<version> --yes`,
  `git push origin :v<version>`), then re-merge a corrected release PR with the same label.
- **Bad extension submission:** publish a fixed version to the store; no rollback path exists for
  users who already updated.
