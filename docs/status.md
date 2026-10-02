# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | complete |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | complete — merged to `dev` in PR #1 |
| 2 | Product: the core workflow, end to end | complete — merged to `dev` in PRs #2–#12 |
| 3 | Promo site: the site that explains it and sends people to it | complete — merged to `dev` in PRs #14–#18 |
| 4 | Launch: first release tagged, site deployed | complete — v1.0.0 released; both Workers live (2026-10-02) |

## Current handoff

**Phase:** 4 — complete. **v1.0.0 is released and live**:
`https://app.truecontact.prakashsewani.com` and `https://truecontact.prakashsewani.com`,
deployed by Cloudflare Workers Builds (`true-contact` / `true-contact-site`).

**Done:** history reconciliation (#25) → release PR #26 (`release:major`) → `v1.0.0` tag +
GitHub release; Workers Builds connected for both Workers; first deploys applied the D1
migrations; post-launch Worker-name alignment recorded (D-017).

**Verified (2026-10-02):** `/api/health` ok; app root 200; site root 200 with the CTA pointing at
the app origin; TLS certificate active (Google Trust Services — the first request can fail while
it provisions); D1 remote schema present; `/api/auth/ok` 200, sign-up validation and the session
guard (401) behave; `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` set on the Worker; release
workflow green.

**Blocked by:** nothing.

**Next action:** the extension Chrome Web Store upload (manual, when ready). After that v1 is
shipped; future work flows through `dev` PRs and labeled releases — every merge to `main`
deploys both Workers automatically.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
