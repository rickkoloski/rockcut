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

**Branch:** `d28-production-deploy-readiness` (off `scheduler-pwa`). **3 commits
ahead**, working tree **clean**, and **NOT yet pushed to origin** (origin has no
such branch). `scheduler-pwa` itself is on origin (rickkoloski/rockcut).

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

### Fly account set up
- Matt's own Fly account is live: **`matthewheiser@gmail.com`**, org
  **`matthewheiser` (personal)**, no apps yet. flyctl installed at
  `~/.fly/bin/flyctl` (PATH added to `~/.bashrc`).
- **Interactive `fly auth login` must be run in a REAL terminal** — Claude Code's
  `!` prefix and headless Bash have no TTY. Token lives in `~/.fly/config.yml`.

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

1. **Rick to transfer Fly apps** `rockcut-api` / `rockcut-ui` to org
   `matthewheiser` (requested msg 80082) — **awaiting reply**. This is the one
   true deploy blocker. Fallback: create fresh apps under new names (→ update
   `PHX_HOST`/`CORS_ORIGINS`/`VITE_API_URL`).
2. **Push `d28-production-deploy-readiness` to origin** — not yet done.
3. **Two backlog tasks not yet created** (promised to Rick in msg 80081):
   Postgres-revisit (trigger conditions + migration steps) and "instrument repo
   telemetry + PRAGMA health logging." Product Backlog project = **254**.
4. **Deploy-time (Fix 5):** set `SECRET_KEY_BASE`, `CORS_ORIGINS`,
   `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`, VAPID keys; `fly secrets unset DATABASE_URL`.
5. **Peer session `src-de`** has been active on this same branch — coordinate to
   avoid conflicts.

---

## Gotchas

- **Dev DB was reset this session** (`ecto.reset`) to validate the new seed — the
  old "Kate S" demo data is gone; it's now the clean reference set.
- **Servers get reaped under memory pressure** on this machine — just restart
  (API + UI). They were down at end of session.
- **Docker + nginx aren't installed locally** — Fixes 1 & 2 validate on Fly's
  remote builder at deploy, not here.
- **D28 spec is still marked `Status: Draft`** — flip to Complete + add a
  `stepwise_results/d28_..._COMPLETE.md` when the deploy is done.
- **Don't run repo-wide `mix format` / `mix precommit`** in `rockcut_api`
  (memory `rockcut-mix-format-churn`).

---

## Resume instructions

1. Restart API + UI if needed (`CLAUDE.md`). `MIX_ENV=test mix test` → 183.
2. Check discussion 80 for Rick's app-ownership/transfer reply.
3. If pushing: `git push -u origin d28-production-deploy-readiness`.
4. Create the two backlog tasks (item 3 above) in Product Backlog project 254.
5. When Rick has transferred the apps: follow
   `docs/chronicle_by_concept/03_deployment/ref/production_deploy_runbook.md`
   (secrets → API deploy → `Release.seed()` → UI deploy → smoke checks).
