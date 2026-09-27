# D30: Shared DEV Server + Synthetic Test Accounts — Completion Record

**Status:** Complete (2026-09-26)
**Spec:** `specs/d30_dev_server_synthetic_accounts_spec.md` (from Rick's plan, PortableMind file #3944)
**Concept:** 03_deployment
**Branch:** `d30-dev-server-synthetic-accounts` (off `d28-production-deploy-readiness`)

---

## What shipped

- **DEV environment live:** `https://rockcut-api-dev.fly.dev` / `https://rockcut-ui-dev.fly.dev`
  in the `rockcut` org — one always-on API machine, volume `rockcut_dev_data`
  (dfw, 3-day snapshots), orange **DEV** ribbon on the UI. Configured by
  `fly.dev.toml` in each app; secrets `SECRET_KEY_BASE`, `SEED_PASSWORD`, dev VAPID pair.
- **Synthetic personas:** 17 fictional `@rockcut-test.com` users (Rick's 12 +
  `dualMgr`, `splitRole`, `noDept`, `owner2`, `sales1` for RBAC) with
  current-week `[SEED]` scenario data; idempotent setup / reset / status /
  `[TEST-TEMP]` cleanup, via `mix rockcut.synthetic.*` locally and `Release.*`
  on DEV.
- **Fail-closed guard** (`RockcutApi.Seeds.Guard`): dev/test deploy env **and**
  an allowlisted host, else raise. `ROCKCUT_ENV` defaults to `prod`.
- **Secret seed password + minted tokens** (Matt's change to Rick's plan):
  no password in git; the readable copy is a private PortableMind file
  (`/rockcut/secrets/Rock Cut DEV seed password.txt`, #3958). Agents log in
  with 8-hour tokens (`mint_token/1`, `mint_tokens/0`); prod never accepts
  them.
- **UI test scaffold:** `tests/config/test-env.ts`, `e2e-targets.json` with a
  fail-closed prod guard, `auth.setup.ts` (one call mints all persona tokens
  into storageState), role smoke specs, login-flow specs, `tests/RUNNING.md`.
- **Docs:** `docs/process/test-credentials-policy.md`; runbook DEV section +
  prod smoke checks; `CLAUDE.md`, browser playbook and auth index no longer
  publish the old dev login.

## Fixes found along the way

- `seeds.exs` would have created `matt@rockcut.com` / `rockcut2026` (a
  published password) as owner in **any** environment without `ADMIN_*`,
  including prod. Removed.
- Failed sign-ins reloaded the page (401 interceptor), so login errors never
  showed. `src/lib/api.ts` now skips the reload for `POST /api/session`.
- Token minting from a release `eval` failed (Plug.Crypto's ETS key cache
  belongs to `:plug_crypto`, not started by `eval`). Fixed and redeployed to
  DEV.

## Verification

- API: **197 tests, 0 failures** (14 new); compile clean with warnings as errors.
- Local: Playwright **8/8** (banner check is DEV-only).
- DEV: `/api/health` 200; `synthetic_status` — 16 personas authenticate,
  `inactive` rejected; Playwright **9/9** with `E2E_TARGET=dev` (role nav,
  login form, inactive refused, DEV banner).
- Prod: synthetic login → **401**; a DEV-minted token → **401**; **0**
  synthetic users in the prod DB.
- **Deployed to prod 2026-09-27** (API v19, UI v15; rollback points v18 / v14):
  `deploy_env` = `"prod"`; `seed_synthetic` and `mint_token` both refuse
  ("deploy env is not dev/test"); synthetic login → 401; 0 synthetic users;
  UI bundle has no banner and includes the login-error fix.

## Follow-ups

- Rick to confirm the secret-password + token change (spec §6).
- The signed download URL for file #3958 appeared in a session log
  (2026-09-26, ~1 h expiry). Contents weren't opened; rotate the seed password
  if strictness is wanted.
