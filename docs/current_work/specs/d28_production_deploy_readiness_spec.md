# D28: Production Deploy Readiness — Specification

**Status:** Draft
**Created:** 2026-09-24
**Author:** Matt + CC
**Depends On:** D10 (auth cutover / users), D19 (PWA), D21 (web push), D22 (shift reminders), D23 (messaging), D25 (availability)

---

## 1. Problem Statement

The `scheduler-pwa` line (D10–D27) has **never been deployed**. Production
(`rockcut-api.fly.dev` / `rockcut-ui.fly.dev`) currently runs Rick's earlier
Feb–Mar Postgres line (brewhouses/process profiles), whose schema is
incompatible with this SQLite line. So this deliverable does the work needed to
put **Matt's code** into production as a **fresh database**, on **SQLite**,
under **Matt's own Fly account**.

Investigation (PortableMind discussion 80, message 80036) found six concrete
blockers between the current repo and a working deploy. This spec fixes the
code/config ones and defines the seed and the deploy runbook. It is deliberately
**scheduling-focused**: brewing-side polish (notably malt spec data) is deferred
(see §6).

Reference: full deploy plan in discussion 80 (msg 80036); decisions in msgs
80037/80038/80062 and memory `rockcut-deploy-plan`.

---

## 2. Requirements

### Functional

- [ ] **UI Docker build succeeds** and produces the PWA (service worker +
      manifest). Today it fails: `package.docker.json` lacks the PWA/workbox deps
      and the build runs the pre-broken `tsc -b`.
- [ ] **Installed PWA receives updates.** nginx must not cache the service worker
      and shell entry points for a year.
- [ ] **Email is a clean no-op in prod** (no provider wired) — it must not raise,
      and in-app bell + web push continue to work.
- [ ] **The reminder scanner runs continuously in prod** (the D22 GenServer needs
      an always-on machine).
- [ ] **Prod boots with the right secrets** and a locked-down CORS origin.
- [ ] **The seed produces reference data + a single root owner only** — no demo
      data, no lot inventory, no non-owner users.

### Non-Functional

- [ ] **Data engine:** stay on SQLite (no Postgres port). Exactly **one** API
      machine (SQLite on a single volume).
- [ ] **Cost:** one small always-on API machine + a ~1 GB volume with snapshots;
      UI stays auto-stopping (static).
- [ ] **Tests:** the existing 183 tests still pass (SQLite sandbox unchanged).
- [ ] **No custom domain** this release — stay on `*.fly.dev`.

---

## 3. Design

### Fix 1 — UI Docker build (`rockcut-ui`)

**Problem:** `Dockerfile` copies `package.docker.json` → `package.json`, installs
from it (no `vite-plugin-pwa` / `workbox-*`), then `COPY . .` overwrites
`package.json` with the real one and runs `pnpm run build` = `tsc -b && vite
build`. `vite build` then fails (PWA plugin missing) and `tsc -b` is pre-broken by
the linked `datagrid-extended`.

**Changes:**
- Sync `rockcut-ui/package.docker.json` `devDependencies` with `package.json`:
  add `vite-plugin-pwa` (`^1.3.0`), `workbox-core` / `workbox-precaching` /
  `workbox-routing` (`^7.4.1`). (These are what `vite.config.ts` / the SW import.)
- In the `Dockerfile`, replace `RUN pnpm run build` with **`RUN pnpm exec vite
  build`** so the Docker image skips the broken `tsc -b`. (Type-checking stays a
  local/CI concern via `tsc --noEmit -p tsconfig.app.json`.)
- **Keep the `datagrid-extended` stub** (decision Q5 — see §6). No vendoring.

### Fix 2 — nginx cache headers (`rockcut-ui/nginx.conf`)

**Problem:** `location ~* \.(js|css|png|...)$ { expires 1y; immutable; }` matches
`sw.js` and `registerSW.js`, so an installed PWA never picks up a new service
worker → users stuck on the old app forever.

**Changes:** narrow the long-cache rule to hashed build assets only, and serve the
SW + shell entry points as `no-cache`:

```nginx
# Never cache the service worker or shell entry points
location = /sw.js            { add_header Cache-Control "no-cache"; }
location = /registerSW.js    { add_header Cache-Control "no-cache"; }
location = /manifest.webmanifest { add_header Cache-Control "no-cache"; }
location = /index.html       { add_header Cache-Control "no-cache"; }

# Hashed, content-addressed assets — safe to cache forever
location ~* ^/assets/.*\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

(Keep the existing `gzip`, `/health`, and SPA `try_files` blocks.)

### Fix 3 — Mail no-op stub (`rockcut_api`)

**Problem:** `config.exs` sets `Swoosh.Adapters.Local`; `prod.exs` sets `config
:swoosh, local: false`. In prod the D18/D21/D23 `Task.start` mailers hit the Local
adapter with storage disabled and can raise (non-fatal but noisy), and nothing is
actually sent.

**Decision (Q3):** stub email — no real provider or sending domain this release.

**Changes:** add a tiny no-op adapter that logs and returns `:ok`, and point the
prod mailer at it:

```elixir
# lib/rockcut_api/mailer_noop.ex
defmodule RockcutApi.MailerNoop do
  use Swoosh.Adapter
  require Logger
  @impl true
  def deliver(email, _config) do
    Logger.info("[mail stub] to=#{inspect(email.to)} subject=#{email.subject}")
    {:ok, %{id: "noop"}}
  end
  @impl true
  def deliver_many(emails, config), do: {:ok, Enum.map(emails, fn e -> deliver(e, config) end)}
end
```

Wire it in `runtime.exs` under the prod branch: `config :rockcut_api,
RockcutApi.Mailer, adapter: RockcutApi.MailerNoop`. (Dev keeps the Local mailbox
at `/dev/mailbox`; test keeps `Swoosh.Adapters.Test`.) In-app bell (D18) and web
push (D21) are unaffected.

### Fix 4 — Always-on API machine + snapshots (`rockcut_api/fly.toml`)

**Problem:** `auto_stop_machines='stop'`, `min_machines_running=0` → the machine
sleeps, so the D22 reminder GenServer (300 s tick) and fire-and-forget push/email
`Task`s don't run while stopped.

**Changes** (API app only; leave the static UI app auto-stopping):
- `auto_stop_machines = 'off'`
- `min_machines_running = 1`
- add under `[mounts]`: `snapshot_retention = 14`
- Deploy-time: `fly scale count 1 -a rockcut-api` — **must stay exactly 1** for
  SQLite on a single volume.

### Fix 5 — Prod secrets + config (deploy-time, no code change beyond CORS)

Set via `fly secrets set` on `rockcut-api` (documented in the runbook, §3 runbook):
- `SECRET_KEY_BASE` (`mix phx.gen.secret`)
- `CORS_ORIGINS=https://rockcut-ui.fly.dev` (replaces the permissive `["*"]`
  default in `runtime.exs`)
- `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (Argon2 hash generated locally) — already
  mapped into `:rockcut_api` config in `runtime.exs:75-80` and consumed by the seed
- `WEB_PUSH_EX_VAPID_PUBLIC_KEY`, `WEB_PUSH_EX_VAPID_PRIVATE_KEY`,
  `WEB_PUSH_EX_VAPID_SUBJECT` (`mix web_push_ex.vapid`)
- `fly secrets unset DATABASE_URL` if the old Postgres line left it set (Matt's
  code ignores it; removing it avoids confusion)
- `PHX_HOST` / UI `VITE_API_URL` unchanged (staying on `*.fly.dev`)

### Fix 6 — Seed = reference data + root owner only (`rockcut_api/priv/repo/seeds.exs`)

**Decisions (Rick msg 80038, Matt msgs 80062):** fresh DB, reference data via
seeds, **root user only**, no user migration.

**Keep (reference / config):** ingredient categories (8) + category field
definitions; departments (5); positions (10) + shift-template presets (4); the
ingredient **catalog** (~51 grains/hops/yeast/adjuncts); the bootstrap **owner**.

**Remove / gate out of prod:**
- The **3 sample shifts** (`seeds.exs:379-413`) — gate behind a dev-only guard
  (e.g. `if System.get_env("RELEASE_NAME") == nil do ... end`) or remove.
- **All ingredient lots** (`grain_lots_raw` + `other_lots_raw`, ~57) — remove the
  lot seeding entirely. This also drops the malt spec data, which is intentional
  (deferred, §6). Keep the ingredient definitions above.

Everything kept stays **idempotent** (the existing `on_conflict: :nothing` /
`get_by` guards). Formula catalog is code (`formulas/formula_catalog.ex`), not
data — nothing to seed.

---

## 4. Success Criteria

- [ ] `docker build` of `rockcut-ui` succeeds and `dist/` contains `sw.js` +
      `manifest.webmanifest`.
- [ ] Response headers: `GET /sw.js` → `Cache-Control: no-cache`;
      `GET /assets/<hashed>.js` → `immutable`.
- [ ] Redeploying the UI and reloading an installed PWA picks up the new version.
- [ ] Prod boots with the always-on API machine at count 1; `/api/health` → 200.
- [ ] A published shift/message triggers **no mailer crash** in logs (stub logs a
      line); the in-app bell increments and web push arrives on a subscribed device.
- [ ] `mix ecto.reset` (dev) and `Release.seed()` (prod) create: categories, field
      defs, 5 departments, 10 positions + 4 templates, ~51 ingredients, **1 owner**,
      **0 shifts, 0 lots, 0 other users**.
- [ ] Reminder for a shift ~65 min out arrives within ~5 min of the 1-hour mark.
- [ ] Volume snapshots accrue (`fly volumes snapshots list`).
- [ ] `MIX_ENV=test mix test` → 183 passing (unchanged).

---

## 5. Deploy Runbook (option a: SQLite, one machine)

1. **Account:** `fly auth login` as Matt's account; confirm/transfer ownership of
   `rockcut-api` / `rockcut-ui` (or recreate under Matt's org). *[blocked on Rick
   confirming current owner]*
2. **Preserve old prod:** note current image refs (`fly releases`); `pg_dump` the
   attached Postgres before any change; keep it running until sign-off, then destroy.
3. **Volume:** ensure `rockcut_data` exists in `dfw` (fresh, or clear the old DB file).
4. **Secrets:** set the Fix-5 secrets; unset `DATABASE_URL`.
5. **Deploy API:** `cd rockcut_api && fly deploy --remote-only`; `fly scale count 1`.
   Migrations run automatically at boot (Migrator child, gated on `RELEASE_NAME`).
6. **Bootstrap:** `fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval
   'RockcutApi.Release.seed()'"`. Owner logs in; creates employees in Admin → Users
   (temp password + forced reset), assigns departments/roles.
7. **Deploy UI:** `cd rockcut-ui && fly deploy --remote-only` (after Fix 1/2).
8. **Smoke checks:** §4 criteria on the live apps.
9. **Rollback:** `fly deploy --image <previous>` per app; the old Postgres image
   needs `DATABASE_URL` re-set + mount removed; restore a volume snapshot if a
   migration went bad.

---

## 6. Out of Scope

- **Malt spec data as reference** — deferred to PortableMind **Product Backlog**
  (project 254, task 3843). This release drops all lots and their specs; the
  ingredient catalog stays.
- **Real `datagrid-extended`** (formula grid, D6–D9) — ship the plain-MUI stub;
  the real implementation isn't present on this machine (see memory
  `rockcut-deploy-plan`). No vendoring.
- **Real email provider / sending domain / DNS / SPF-DKIM** — stub only.
- **Custom domain / TLS certs.**
- **Postgres migration**, **Oban / durable jobs**, **>1 API machine / HA**,
  **SMS**, **CI pipeline** — all future.

---

## 7. Open Questions

- [ ] **Who owns `rockcut-api` / `rockcut-ui` on Fly today?** (Rick, needs
      `fly auth login`) → transfer vs. recreate under Matt's account.
- [ ] Any data in the current live app worth exporting before cutover? (Rick said
      fresh DB / no user migration; confirm nothing brewing-side is needed.)
- [ ] Snapshot retention: 14 days OK, or longer?
