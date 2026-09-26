# D28: Production Deploy Readiness — Completion Record

**Status:** Complete (2026-09-25 deployed; closed out 2026-09-26)
**Spec:** `specs/d28_production_deploy_readiness_spec.md`
**Concept:** 03_deployment
**Branch:** `d28-production-deploy-readiness` (off `scheduler-pwa`)

---

## What shipped

The `scheduler-pwa` line (D10–D27) is live for the first time, on a **fresh SQLite
DB**, at `https://rockcut-api.fly.dev` / `https://rockcut-ui.fly.dev`. Both apps
live in the shared **`rockcut` Fly org** (Matt ADMIN, Rick MEMBER; billing on the
org) — Rick moved them there from his account via a team-org invite.

All six spec fixes:

1. **UI Docker build** — `package.docker.json` synced (`vite-plugin-pwa`,
   `workbox-*`); Dockerfile runs `pnpm exec vite build` (skips the pre-broken
   `tsc -b`). Beyond the spec: pnpm 10+ reads build approvals from
   `pnpm-workspace.yaml`, not `package.json`, so a `pnpm-workspace.docker.yaml`
   (allows esbuild's build script) is copied in before install and the real
   `pnpm-workspace.yaml` is `.dockerignore`d (its `datagrid-extended` link override
   must not enter the image; the vite alias supplies the stub under `DOCKER_BUILD`).
2. **nginx** — `sw.js`, `registerSW.js`, `manifest.webmanifest`, `index.html` served
   `no-cache`; 1-yr `public, immutable` only for `/assets/*`.
3. **Mail stub** — `lib/rockcut_api/mailer_noop.ex` (logs `[mail stub]`, returns
   `:ok`), wired for prod in `runtime.exs`. In-app bell + web push unaffected.
4. **fly.toml (API)** — `auto_stop_machines='off'`, `min_machines_running=1`,
   `snapshot_retention=14`. Exactly **one** machine (SQLite on one volume).
5. **Secrets/CORS** (deploy-time) — `SECRET_KEY_BASE` rotated; `DATABASE_URL` +
   `ECTO_IPV6` unset; `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`,
   `CORS_ORIGINS=https://rockcut-ui.fly.dev`, fresh `WEB_PUSH_EX_VAPID_*` set.
6. **Seed** — reference data + root owner only; the 3 sample shifts and all
   ingredient lots removed from `seeds.exs`.

Plus a repeatable **production deploy runbook**:
`docs/chronicle_by_concept/03_deployment/ref/production_deploy_runbook.md`.

## Decisions (discussion 80)

- **Stay on SQLite** this release (Rick msg 80079). Postgres-revisit triggers:
  backlog task 3855; telemetry to observe them: 3856.
- **Fresh DB, no user migration** (Rick msg 80038).
- **Email stubbed**, **`*.fly.dev` only**, **datagrid stub shipped**.
- **Malt spec data deferred** → Product Backlog (project 254) task 3843.

## Verification

- API: **183 tests, 0 failures** (unchanged).
- Seed (`MIX_ENV=dev mix ecto.reset`): 8 categories, 51 ingredients, 0 lots,
  5 departments, 10 positions, 4 shift templates, 0 shifts, 1 owner. Prod seed
  matched (8 categories, 13 field defs, 51 ingredients, no lots, owner).
- Live (re-checked 2026-09-26):
  - `GET /api/health` → 200; UI `/` → 200; owner login → 200 with token.
  - `sw.js`, `manifest.webmanifest`, `index.html` → `Cache-Control: no-cache`;
    `/assets/index-*.js` → `public, immutable` (1-yr expires).
  - UI image contains the PWA (`sw.js` + manifest served) — Docker build fix works
    on Fly's remote builder (Docker isn't installed locally).
  - API: 1 machine (`dawn-morning-549`, dfw, shared-cpu-1x/512MB), started,
    health check passing; volume `rockcut_data` 1 GB, snapshots accruing.

**Not yet exercised in prod:** mailer stub log line on a real publish/message,
web push to a subscribed device, a shift reminder firing, and an installed PWA
picking up a redeploy. These need real usage; config for each is in place.

## Follow-ups

- **Snapshot retention is 5 days, not 14.** `snapshot_retention` in `fly.toml`
  only applies when `fly deploy` creates the volume; `rockcut_data` pre-existed.
  Fix: `fly volumes update vol_rkgemljzzkozz3w4 --snapshot-retention 14`.
- **API `auto_start_machines=false`** — if the machine stops it will not wake on
  traffic; `fly machine start d894670a535598 -a rockcut-api`.
- Cosmetic: `/assets/*` sends two `Cache-Control` headers (`expires 1y` emits
  `max-age`, plus the explicit `public, immutable`). Harmless.
