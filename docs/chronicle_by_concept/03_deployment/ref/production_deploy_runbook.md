# Rockcut Production Deploy Runbook

**Repeatable process for deploying `rockcut_api` (Phoenix/SQLite) + `rockcut-ui`
(React/nginx) to Fly.io.** First executed 2026-09-25 (D28) — the scheduler-pwa
line's first production deploy. This is the canonical runbook; the D28 spec
(`docs/current_work/specs/d28_production_deploy_readiness_spec.md`) is the
one-time readiness work, this is the repeatable ops procedure.

## Architecture (what runs where)

| Piece | Detail |
|-------|--------|
| API | `rockcut-api.fly.dev` — Phoenix 1.8 release, Bandit on port 4000 |
| DB | **SQLite (WAL)** on a Fly volume `rockcut_data` mounted at `/data`, `DATABASE_PATH=/data/rockcut_api.db` |
| API machines | **Exactly 1** (single writer; single volume). Always-on. |
| UI | `rockcut-ui.fly.dev` — static build served by nginx on port 8080; may auto-stop/start |
| Fly org | `rockcut` (SHARED) — Matt ADMIN, billed to Matt's card |
| Region | `dfw` |

**Why 1 always-on API machine:** SQLite allows one writer, and the app has a
D22 in-process reminder GenServer + fire-and-forget push/email Tasks that only
run while the VM is up. So `fly.toml` sets `auto_stop_machines='off'`,
`auto_start_machines=false`, `min_machines_running=1`, and we hold the app at
`fly scale count 1`.

## Prerequisites

- `flyctl` installed and authenticated as the app owner:
  `fly auth whoami` → `matthewheiser@gmail.com`.
  (Interactive `fly auth login` needs a real TTY; the stored token in
  `~/.fly/config.yml` is what makes headless `fly` commands work.)
- The `rockcut` org exists and **has a payment method** on its billing page
  (`https://fly.io/dashboard/rockcut/billing`). Fly billing is **per-org**; the
  remote builder returns a 403 "We need your payment information" until a card is
  on the *exact* org you deploy into.
- Both apps live in the `rockcut` org (`fly apps list`). See "One-time org
  setup" if starting from scratch or transferring from another account.

## One-time org setup / app transfer (skip if already in `rockcut`)

Fly requires the person moving an app to be a member of **both** the source and
destination orgs. To move apps from account A's org into a shared `rockcut` org
owned by account B:

```bash
# Account B (matthewheiser@gmail.com) — create org + invite account A:
fly orgs create rockcut                       # prompts for a payment method (card)
fly orgs list                                 # confirm the slug is `rockcut`
fly orgs invite <accountA-email> rockcut      # NOTE: positional args, NOT --org

# Account A accepts the emailed invite, then moves the apps:
fly apps move rockcut-api --org rockcut --yes
fly apps move rockcut-ui  --org rockcut --yes
```

App names (and therefore `*.fly.dev` hostnames) don't change, so
`PHX_HOST`/`CORS_ORIGINS`/`VITE_API_URL` stay the same. Secrets move with the
apps — including any stale ones (see secrets step). Old databases (e.g. a prior
Fly Postgres) do **not** move; destroy them separately.

## Deploy procedure

Run from `~/src/rockcut`. Steps 1–3 are per-environment setup; on a **routine
redeploy** of unchanged infra, skip to "Routine redeploy" at the bottom.

### 1. Secrets (staged, applied on next deploy)

Use `--stage` so setting secrets doesn't thrash the currently-running machines;
they take effect on the next `fly deploy`.

Generate values locally (never commit these):

```bash
cd rockcut_api
mix phx.gen.secret                                   # SECRET_KEY_BASE
mix web_push_ex.vapid                                # WEB_PUSH_EX_VAPID_PUBLIC_KEY / _PRIVATE_KEY
PW='<owner-password>' mix run -e \
  'IO.puts("ADMIN_PASSWORD_HASH=" <> Argon2.hash_pwd_salt(System.fetch_env!("PW")))'
```

Write them to a scratch env file (one `KEY=VALUE` per line) and import — import
avoids exposing values in the process list and splits on the FIRST `=`, so the
Argon2 hash's internal `=`/`$` chars survive intact:

```bash
fly secrets import --stage -a rockcut-api < /path/to/prod_secrets.env
```

Secrets set (the full required set):

| Secret | Value / source |
|--------|----------------|
| `SECRET_KEY_BASE` | `mix phx.gen.secret` (**required at boot** or the release raises) |
| `ADMIN_EMAIL` | owner login email (seeds bootstrap the owner from this) |
| `ADMIN_PASSWORD_HASH` | `Argon2.hash_pwd_salt("<password>")` — plaintext never stored |
| `CORS_ORIGINS` | `https://rockcut-ui.fly.dev` (defaults to `*` if unset) |
| `WEB_PUSH_EX_VAPID_PUBLIC_KEY` | from `mix web_push_ex.vapid` |
| `WEB_PUSH_EX_VAPID_PRIVATE_KEY` | from `mix web_push_ex.vapid` |
| `WEB_PUSH_EX_VAPID_SUBJECT` | `mailto:matt@rockcut.com` |

`DATABASE_PATH`, `PHX_HOST`, `PORT` come from `fly.toml [env]`, not secrets.
`PHX_SERVER=true` is set by the release's `bin/server` entrypoint.

Remove any inherited/stale secrets from a previous owner:

```bash
fly secrets unset DATABASE_URL ECTO_IPV6 --stage -a rockcut-api
```

Verify: `fly secrets list -a rockcut-api` (staged rows show `*` / `Staged`).

### 2. Volume (SQLite data) — create BEFORE deploy

`fly.toml` has a `[mounts]` for `rockcut_data`; a deploy fails if the volume
doesn't exist. One volume only (single machine).

```bash
fly volumes create rockcut_data -r dfw -s 1 -a rockcut-api --yes
```

### 3. Scale to a single machine BEFORE deploy

A fresh app may have 2+ machines from a prior image. With one volume, keep
exactly one machine so the deploy attaches the volume cleanly.

```bash
fly scale count 1 -a rockcut-api --yes
fly machines list -a rockcut-api        # confirm 1 app machine
```

### 4. Deploy the API

`fly deploy` builds from the working tree (uncommitted changes included; respects
`.dockerignore`) and applies staged secrets.

```bash
cd rockcut_api
fly deploy --remote-only -a rockcut-api
```

**After deploy, the machine may be `stopped`** (because `auto_start_machines=false`).
Start it explicitly, then confirm it's running:

```bash
fly machines list -a rockcut-api                       # note the machine ID + STATE
fly machine start <machine-id> -a rockcut-api          # if STATE=stopped
```

### 5. Migrate, then seed

`Release.seed/0` opens the repo but does **not** run migrations — run migrate
first, on a fresh volume there is no schema yet. Use `eval` (starts a one-off
node) for migrate/seed:

```bash
fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval RockcutApi.Release.migrate()"
fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval RockcutApi.Release.seed()"
```

Expected seed output: `N categories, N field defs, N ingredients (no lots)` +
`Seeded owner: <ADMIN_EMAIL>`. Seeds are idempotent (re-running is safe); they
seed reference data + the root owner only — **no ingredient lots, no sample
shifts** in prod.

To inspect the live DB, use `rpc` (runs on the **running** node where the repo is
already started — `eval` would need to start the repo itself):

```bash
fly ssh console -a rockcut-api -C '/app/bin/rockcut_api rpc "IO.inspect(RockcutApi.Repo.aggregate(RockcutApi.Accounts.User, :count))"'
```

### 6. Deploy the UI

```bash
cd ../rockcut-ui
fly deploy --remote-only -a rockcut-ui
```

The UI Dockerfile uses `package.docker.json` (no linked packages), stubs
`datagrid-extended` via a build-time source + a `DOCKER_BUILD` vite alias, and
builds with `vite build` directly (the `tsc -b` script is pre-broken by the
linked datagrid in dev). It also copies `pnpm-workspace.docker.yaml` before
`pnpm install` — see gotcha #4.

### 7. Smoke tests

```bash
# API health
curl -sS https://rockcut-api.fly.dev/api/health           # {"status":"ok",...}

# UI serves (auto-starts its machine)
curl -sS -o /dev/null -w "%{http_code}\n" https://rockcut-ui.fly.dev/   # 200

# PWA service worker must be no-cache (installed app updates)
curl -sS -D - -o /dev/null https://rockcut-ui.fly.dev/sw.js | grep -i cache-control  # no-cache

# Owner login end-to-end — returns a token
PW='<owner-password>'                                       # set on its OWN line (see gotcha #5)
curl -sS -X POST https://rockcut-api.fly.dev/api/session \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"<ADMIN_EMAIL>\",\"password\":\"$PW\"}"

# D30: prod must have NO synthetic personas — expect 401
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://rockcut-api.fly.dev/api/session \
  -H 'Content-Type: application/json' \
  --data '{"email":"owner@rockcut-test.com","password":"anything"}'           # 401

# D30: the synthetic seed must refuse to run on prod — expect a "Refusing synthetic" error
fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval 'RockcutApi.Release.seed_synthetic()'"
```

## Gotchas (all hit during the first deploy)

1. **Per-org billing.** The remote builder 403s ("need payment information")
   until a card is on the **exact** org being deployed to. Adding it to a
   personal org doesn't count. Use `fly dashboard billing -o rockcut`.
2. **App move needs dual-org membership.** `fly apps move` fails with
   "organization not found" unless the mover belongs to both orgs — hence the
   create-org + invite dance.
3. **Machine starts `stopped`.** With `auto_start_machines=false`, a fresh
   deploy can leave the machine stopped; the app won't be up (health times out,
   the reminder scanner isn't running) until `fly machine start`.
4. **pnpm 10+ build approval lives in `pnpm-workspace.yaml`, not
   `package.json`.** A `pnpm.onlyBuiltDependencies` field in package.json is
   ignored; pnpm hard-fails `pnpm install` with `ERR_PNPM_IGNORED_BUILDS` on
   esbuild's build script. Fix: a Docker-only `pnpm-workspace.docker.yaml` with
   `allowBuilds: { esbuild: true }`, copied into the image before `pnpm install`,
   and the real `pnpm-workspace.yaml` added to `.dockerignore` (its
   `overrides: datagrid-extended: link:...` must never enter the image — the
   `DOCKER_BUILD` vite alias resolves the stub instead).
5. **Shell env-assignment vs. expansion.** `PW=secret curl ... "${PW}"` sends an
   **empty** value: the shell expands `${PW}` before the command-scoped
   assignment applies. Set the variable on its own line first, then reference it.
6. **`eval` has no repo; `rpc` does.** Use `eval` for migrate/seed (one-off
   node), `rpc` to query the live running node.

## Routine redeploy (code change, infra unchanged)

Once org/secrets/volume exist and the app is at 1 machine:

```bash
cd rockcut_api && fly deploy --remote-only -a rockcut-api
fly machine start <id> -a rockcut-api          # only if it came up stopped
# run migrate if there are new migrations:
fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval RockcutApi.Release.migrate()"

cd ../rockcut-ui && fly deploy --remote-only -a rockcut-ui
# smoke tests (step 7)
```

## Rollback

```bash
fly releases -a rockcut-api                     # list versions
fly deploy --image <previous-image-ref> -a rockcut-api   # or: fly releases rollback (per flyctl version)
```

The SQLite data lives on the `rockcut_data` volume (independent of image
version) and has daily snapshots retained 14 days (`snapshot_retention` in
`fly.toml [mounts]`); restore via `fly volumes snapshots list <vol-id>` →
`fly volumes create ... --snapshot-id <id>`.

---

## DEV server (D30)

A second environment in the `rockcut` org for testing with fictional
personas — `rockcut-api-dev` / `rockcut-ui-dev`, configured by
`fly.dev.toml` in each app. Policy: `docs/process/test-credentials-policy.md`.

### One-time provisioning

```bash
fly apps create rockcut-api-dev --org rockcut
fly apps create rockcut-ui-dev --org rockcut
fly volumes create rockcut_dev_data -r dfw -s 1 -a rockcut-api-dev

# Secrets (ROCKCUT_ENV, PHX_HOST, CORS_ORIGINS are in fly.dev.toml [env]).
# SEED_PASSWORD: generate once; put the readable copy in the PortableMind file
# shared by Matt + Rick BEFORE setting it here (Fly secrets can't be read back).
fly secrets set -a rockcut-api-dev --stage \
  SECRET_KEY_BASE="$(cd rockcut_api && mix phx.gen.secret)" \
  SEED_PASSWORD='<generated>' \
  WEB_PUSH_EX_VAPID_PUBLIC_KEY='<dev public>' \
  WEB_PUSH_EX_VAPID_PRIVATE_KEY='<dev private>'      # mix web_push_ex.vapid — NOT the prod pair
# No ADMIN_EMAIL / ADMIN_PASSWORD_HASH: the synthetic `owner` is DEV's owner.
```

### Deploy and seed

```bash
cd rockcut_api && fly deploy -c fly.dev.toml --remote-only
fly machine list -a rockcut-api-dev          # start it if stopped (gotcha: auto_start is off)
# Boot migrates once the machine runs; running it explicitly is harmless and
# covers a machine that came up stopped.
fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api eval 'RockcutApi.Release.migrate()'"
fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api eval 'RockcutApi.Release.seed()'"
#   (seed() also runs the synthetic setup on DEV when SEED_PASSWORD is set)
fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api eval 'RockcutApi.Release.synthetic_status()'"
cd ../rockcut-ui && fly deploy -c fly.dev.toml --remote-only
```

Smoke: `/api/health` 200; `synthetic_status` shows 16 personas authenticating
(`inactive` rejected); the UI shows the orange **DEV** ribbon;
`E2E_TARGET=dev npx playwright test` in `rockcut-ui` passes.

### Routine DEV redeploy

Same two `fly deploy -c fly.dev.toml --remote-only` commands. Migrations run at
boot. Re-run `seed_synthetic()` if personas or scenario data changed.

### Reset DEV

```bash
fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api eval 'RockcutApi.Release.reset_synthetic()'"
```

### Rotate the seed password

See `docs/process/test-credentials-policy.md` → "Rotating the seed password".

