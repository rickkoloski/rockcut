# Session Handoff — 2026-09-24

**Purpose:** Context preservation before closing. Pick up from here.
Follows `SESSION_HANDOFF_2026-09-23b.md` (D24–D27). This session was about
**production deploy readiness (D28)**, the **SQLite-vs-Postgres decision**, and
**Fly account setup** — coordinated with Rick over PortableMind **discussion 80**.

---

## Project

**Rockcut Brewing Co** — brewery + company-wide staff management app. Phoenix 1.8 /
Elixir / **SQLite** (API :4002) · React 19 / Vite / MUI 7 / pnpm (UI :5174, built
preview :4173) · installable PWA · Fly.io. See `CLAUDE.md` for run/login details.
Local dev + gotchas: memories `rockcut-local-dev-native`, `rockcut-pwa-testing`,
`rockcut-mix-format-churn`, `rockcut-deploy-plan`.

> **DEPLOYED & LIVE (2026-09-25).** A parallel session (`src-de`) took D28 all the
> way to production tonight. Both apps run under the shared **`rockcut` Fly org**
> (Matt ADMIN, Rick MEMBER): `rockcut-api` deployed + healthy (`/api/health` 200),
> `rockcut-ui` up (200, auto-suspends when idle). Migrated + seeded (reference data
> + owner, no lots). Details in memory `rockcut-deploy-plan`.

**Branch:** `d28-production-deploy-readiness` (off `scheduler-pwa`). Working tree
**clean**; the D28 + deploy work is committed. **NOT yet pushed to origin** (origin
has no such branch). `scheduler-pwa` itself is on origin (rickkoloski/rockcut).

**Tests:** `cd rockcut_api && MIX_ENV=test mix test` → **183 passing**.
**Next deliverable after D28: D29** (see the RBAC spec that appeared this session).

---

## What happened this session

### Deploy plan reviewed + verified
- Read Rick's Fly deploy plan (**discussion 80, message 80036**). Verified all
  **six blockers** against the repo — every claim accurate. Findings + decisions
  live in memory `rockcut-deploy-plan`.

### Decisions locked (with Rick, discussion 80)
- **DB engine: stay on SQLite** (not Postgres) for this release. Rick agreed
  (msg 80079). Rationale + the signals that would trigger a future Postgres move
  (write-lock contention: `SQLITE_BUSY`, repo telemetry `queue_time`, WAL health;
  plus the real drivers — 2nd machine / zero-downtime / Oban) posted as msgs
  80077 & 80081.
- **Fresh DB, reference data + root owner only, no user migration** (Rick msg 80038).
- **Seed:** keep categories/field-defs/departments/positions/templates/ingredient
  catalog + owner; **drop** the 3 sample shifts and **all** ingredient lots.
- **Malt spec data deferred** → PortableMind **Product Backlog** project **254**,
  task **3843**.
- **Email: stubbed** (no provider/domain). **Domain: stay on `*.fly.dev`.**
  **Datagrid: ship the stub** (the real formula grid isn't implemented on this
  machine — see `rockcut-deploy-plan`).

### Fly account set up + apps moved
- Matt's own Fly account is live: **`matthewheiser@gmail.com`**. flyctl installed
  at `~/.fly/bin/flyctl` (PATH added to `~/.bashrc`).
- **Interactive `fly auth login` must be run in a REAL terminal** — Claude Code's
  `!` prefix and headless Bash have no TTY. Token lives in `~/.fly/config.yml`.
- Rick **moved `rockcut-api`/`rockcut-ui` into a shared `rockcut` org** (Matt
  ADMIN, Rick MEMBER; billing on the `rockcut` org) via a team-org invite — an
  app-move needs membership in both orgs. So the apps are NOT under Matt's personal
  org; they're under `rockcut`.

### D28 implemented (committed by peer session in `1694c09`)
All six fixes from `specs/d28_production_deploy_readiness_spec.md`:
1. **UI Docker build** — `package.docker.json` synced (+`vite-plugin-pwa`,
   `workbox-*`); Docker build runs `pnpm exec vite build` (skips broken `tsc -b`).
   Peer session also added `pnpm-workspace.docker.yaml` (+ `.dockerignore` entry)
   so pnpm 10 doesn't hard-fail on esbuild's build script.
2. **nginx** — `no-cache` for `sw.js`/`registerSW.js`/`manifest.webmanifest`/
   `index.html`; 1-yr `immutable` only for `/assets/*`.
3. **Mail stub** — new `lib/rockcut_api/mailer_noop.ex`, wired in `runtime.exs`
   (prod only). In-app bell + web push unaffected.
4. **fly.toml** — `auto_stop_machines='off'`, `min_machines_running=1`,
   `snapshot_retention=14`. Must stay **1 machine** (SQLite).
5. **Secrets/CORS** — deploy-time checklist (in the spec + runbook), not code.
6. **Seed** — dropped lots + sample shifts (−179 lines in `seeds.exs`).

**Validated:** compiles, **183 tests pass**, and `MIX_ENV=dev mix ecto.reset`
produced exactly: 8 categories, 51 ingredients, **0 lots**, 5 departments,
10 positions, 4 shift templates, **0 shifts**, **1 owner** (`matt@rockcut.com`
in dev; prod uses `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`, mapped in `runtime.exs:75-80`).

### Also on the branch (from peer session `src-de`)
- `f7df699` — **production deploy runbook** (`docs/chronicle_by_concept/03_deployment/ref/`).
- `ff32640` — **D29–D34 configurable RBAC plan spec**
  (`specs/d29_rbac_configurable_authorization_spec.md`). New scope, not part of
  the deploy work — review before acting.

### Tooling
- Added **Playwright MCP** to project-local config (`.claude.json`:
  `playwright: npx @playwright/mcp@latest`). Requires a fresh CC session to load
  its browser tools. (Distinct from **Claude in Chrome**, the browser extension,
  which is driven from Chrome, not Claude Code.)

---

## Open items / blockers

1. **Push `d28-production-deploy-readiness` to origin** — still not done. This is
   the main loose end: the deploy is live but the code/config that produced it
   isn't on `rickkoloski/rockcut` yet.
2. ~~Rick to transfer Fly apps~~ — **DONE** (moved into shared `rockcut` org).
3. ~~Deploy-time secrets (Fix 5)~~ — **DONE** in prod: `SECRET_KEY_BASE` rotated;
   `DATABASE_URL` + `ECTO_IPV6` unset; `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`,
   `CORS_ORIGINS=https://rockcut-ui.fly.dev`, fresh `WEB_PUSH_EX_VAPID_*` set.
4. ~~Two backlog tasks~~ — **DONE**: Product Backlog (project **254**) now has
   task **3843** (malt specs), **3855** (Postgres-revisit triggers + steps),
   **3856** (repo telemetry + PRAGMA health logging).
5. **D28 spec still `Status: Draft`** — flip to Complete and add
   `stepwise_results/d28_..._COMPLETE.md` now that it's deployed.
6. **Peer session `src-de`** did the deploy on this same branch — coordinate before
   pushing/force-changing history.

---

## Gotchas

- **Dev DB was reset this session** (`ecto.reset`) to validate the new seed — the
  old "Kate S" demo data is gone; it's now the clean reference set.
- **Servers get reaped under memory pressure** on this machine — just restart
  (API + UI). They were down at end of session.
- **Docker + nginx aren't installed locally** — Fixes 1 & 2 validate on Fly's
  remote builder at deploy, not here.
- **Prod API `auto_start_machines=false`** (fly.toml) — if the single API machine
  stops, it will NOT auto-start on traffic; start it explicitly
  (`fly machine start <id>`, currently `dawn-morning-549`). UI auto-suspends and
  auto-starts fine.
- **Shell gotcha when testing prod login:** `PW=x curl ...${PW}` sends an EMPTY
  password (the shell expands `${PW}` before the command-scoped assignment). Set
  the var on its own line first.
- **Don't run repo-wide `mix format` / `mix precommit`** in `rockcut_api`
  (memory `rockcut-mix-format-churn`).

---

## Resume instructions

1. **App is already live** — sanity-check: `curl https://rockcut-api.fly.dev/api/health`
   (200) and open `https://rockcut-ui.fly.dev`. Log in as owner
   (`matthewheiser@gmail.com`). If the API machine is stopped, `fly machine start`.
2. **Push the branch** (main loose end): coordinate with `src-de` first, then
   `git push -u origin d28-production-deploy-readiness`. Consider opening a PR into
   `scheduler-pwa` / `practice1`.
3. Close out **D28**: flip the spec to Complete, add the stepwise result.
4. Redeploys use
   `docs/chronicle_by_concept/03_deployment/ref/production_deploy_runbook.md`.
5. Next feature work: review the peer session's **D29–D34 configurable RBAC spec**
   before starting.
