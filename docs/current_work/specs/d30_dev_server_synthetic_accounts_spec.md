# D30: Shared DEV Server + Synthetic Test Accounts — Specification

**Status:** In progress — code steps 1–7 + docs done (2026-09-26); Fly steps 8–11 pending (need Matt's Fly account)
**Created:** 2026-09-26
**Author:** Matt + CC, from Rick's plan (PortableMind file **#3944**, discussion 80 msg 80386)
**Depends On:** D28 (production deploy + runbook), D10 (users / auth)

---

## 1. Problem Statement

Browser-automation agents (Claude in Chrome, Playwright) need to log in as
different users to test features, but must **never** handle real credentials
(Rick, discussion 80 msgs 80117 / 80465). Today the only environments are
local dev (whose owner is `matt@rockcut.com` with its password published in
`CLAUDE.md`) and prod. This blocks automated and regression testing, and the
D29 RBAC work needs a persona per role and edge case.

D30 builds Rick's plan — a shared **DEV** environment on Fly seeded with
**fictional personas** — with one deliberate change agreed by Matt
(2026-09-26): **the seed password is a secret, and agents authenticate with
short-lived tokens by default** instead of a password published in git (§3.4).

---

## 2. Requirements

### Functional

- [x] `ROCKCUT_ENV` switch (`prod` default, fail-closed) drives the seed guard,
      DEV banner, and mailer.
- [ ] DEV apps `rockcut-api-dev` / `rockcut-ui-dev` in the `rockcut` org, from
      the same Dockerfiles, with a visible **DEV** banner.
- [x] Synthetic seed: 17 fictional `@rockcut-test.com` personas (§3.3) +
      current-week scenario data; idempotent `setup` / `status` / `reset` /
      `cleanup_temp`.
- [x] Seed and token minting **refuse to run** outside DEV/local (double guard).
- [x] **Token minting** for a persona (DEV + local), short-lived, synthetic
      users only.
- [x] **Seed password is secret:** no default in git; supplied by env
      (`SEED_PASSWORD`).
- [x] UI test scaffold: `test-env.ts` identities, `e2e-targets.json` with a
      fail-closed prod guard, Playwright auth setup using minted tokens,
      `RUNNING.md`, one smoke spec per role.
- [x] Local dev uses the same personas (retire `matt@rockcut.com` /
      `rockcut2026`).
- [x] Credentials policy in the repo (`docs/process/test-credentials-policy.md`).

### Non-Functional

- [ ] **Security:** prod has zero synthetic accounts; a synthetic login on prod
      returns 401 (in the prod smoke test). No real data in DEV. DEV sends no
      email and has its own VAPID keypair and `SECRET_KEY_BASE`.
- [ ] **Cost:** one shared-1x 512 MB API machine + 1 GB volume + a small UI
      machine (a few dollars a month).
- [ ] **Tests:** existing suite passes; new ExUnit tests for the guard,
      idempotency, persona auth, and token minting.

---

## 3. Design

Follows Rick's plan (#3944) section by section; **changes from it are marked
◆**.

### 3.1 Credentials policy

| | Synthetic | Real |
|---|---|---|
| What | Fictional `@rockcut-test.com` personas | Prod owner, Fly tokens, VAPID keys, real employees |
| Where they exist | Local + DEV only | Prod |
| Identities in git | Yes (emails, names, roles in `test-env.ts`) | Never |
| ◆ Password in git | **No** — secret `SEED_PASSWORD` (§3.4) | Never |
| Agents may use | Yes — **tokens by default**, password only for login-flow tests | **No**, humans only |
| Real data | None | n/a |

Rules (Rick §1, amended ◆):
1. An agent acts **only** as an identity in `rockcut-ui/tests/config/test-env.ts`,
   and only against an allowlisted host.
2. Prod has zero synthetic accounts; the seed and minting refuse to run there;
   the prod smoke test asserts a synthetic login gets 401.
3. No real data in DEV; DEV is disposable.
4. DEV sends no real email (`Swoosh.Adapters.Local`); separate VAPID keys.
5. If an agent is shown or asked for a credential not covered here, it stops
   and asks a human.
6. ◆ Agents get a **minted token** for a persona (§3.4). The seed password is
   used only by specs that test the login form itself, and is fetched from its
   store at run time — never committed, never pasted into chat or docs.

### 3.2 DEV environment

As Rick §2: `rockcut-api-dev` / `rockcut-ui-dev`, `fly.dev.toml` per app,
volume `rockcut_dev_data` (1 GB, dfw, `snapshot_retention = 3`), 1 always-on
machine, `ROCKCUT_ENV=dev`, `PHX_HOST=rockcut-api-dev.fly.dev`,
`CORS_ORIGINS=https://rockcut-ui-dev.fly.dev,http://localhost:5174`, UI build
args `VITE_API_URL=https://rockcut-api-dev.fly.dev` and `VITE_ENV_LABEL=DEV`.

`ROCKCUT_ENV` → `config :rockcut_api, :deploy_env` in `runtime.exs`; missing =
`prod`. Mailer: `Local` when `dev`; prod keeps `RockcutApi.MailerNoop` (D28).

**Decided (Matt, 2026-09-26):**
- DEV is **public** on `*.fly.dev` (Rick's Q1). Acceptable because it holds only
  fabricated data and, with ◆ a secret password, strangers can't log in.
- DEV is **deployed manually** like prod (Rick's Q2). Revisit auto-deploy
  when a regression suite exists to gate it.

### 3.3 Synthetic seed + personas

As Rick §3: `RockcutApi.Seeds.Credentials`, `RockcutApi.Seeds.Synthetic`
(`setup/0`, `status/0`, `reset/0`, `cleanup_temp/0`), `Release` wrappers
(`seed_synthetic/0`, `synthetic_status/0`, `reset_synthetic/0`), and
`mix rockcut.synthetic.setup | status | reset`.

◆ `Seeds.Credentials.password/0` = `System.fetch_env!("SEED_PASSWORD")` —
**no default**; `setup` fails with a clear message if unset. (Tests set it in
`test_helper.exs` / config for `MIX_ENV=test` only.)

**Guard** (fail-closed, before any write) for `setup`, `reset`, and ◆
`mint_token`: `:deploy_env == "dev"` (or `Mix.env()` in `[:dev, :test]`
locally) **and** `PHX_HOST ∈ {localhost, 127.0.0.1, rockcut-api-dev.fly.dev}`
(hard-coded; adding a host is a code change).

**Personas** — Rick's 12, plus ◆ 5 for the D29 RBAC model:

| Key | Email | Name | Setup | Tests |
|---|---|---|---|---|
| `owner` | owner@rockcut-test.com | Olivia Owner | `is_owner` | Admin, users, positions, colors, change log |
| `breweryMgr` | brewery.manager@rockcut-test.com | Morgan Mash | manager: Brewery | Scheduling, approvals, on-behalf |
| `barMgr` | bar.manager@rockcut-test.com | Casey Tap | manager: Bar | Scope boundary (can't manage Brewery) |
| `brewer1` | brewer1@rockcut-test.com | Jake Brewer | employee: Brewery | Matches PortableMind's rockcut fixture |
| `brewer2` | brewer2@rockcut-test.com | Riley Wort | employee: Brewery | Open-shift claim |
| `bartender1` | bartender1@rockcut-test.com | Sam Pour | employee: Bar | Messaging, notifications |
| `bartender2` | bartender2@rockcut-test.com | Alex Draft | employee: Bar | Second recipient |
| `office1` | office1@rockcut-test.com | Pat Ledger | employee: Office | Non-brewery nav gating |
| `floater` | floater@rockcut-test.com | Jordan Float | employee: Bar + Brewery | Multi-dept, conflict warnings |
| `newhire` | newhire@rockcut-test.com | Taylor New | employee: Bar, `must_reset_password` | Forced reset (`reset` restores) |
| `inactive` | inactive@rockcut-test.com | Drew Gone | `active: false` | Login rejected |
| `hidden` | hidden@rockcut-test.com | Quinn Hidden | employee: Office, `schedulable: false` | Hide-from-schedule |
| ◆ `dualMgr` | dual.manager@rockcut-test.com | Dana Dual | manager: Bar + Office | Authority across several managed depts; D29 §6 C dept-scoped positions / user create |
| ◆ `splitRole` | split.role@rockcut-test.com | Rowan Split | manager: Bar, employee: Brewery | Brewing via the Brewery membership only; manager authority only in Bar (D29 bound modules) |
| ◆ `noDept` | nodept@rockcut-test.com | Nico None | no memberships | D29 baseline layer only |
| ◆ `owner2` | owner2@rockcut-test.com | Avery Owner | `is_owner` | Last-active-owner guard (demote one owner while two exist) |
| ◆ `sales1` | sales1@rockcut-test.com | Robin Pitch | employee: Sales | Covers the one assignable dept Rick's set doesn't |

Scenario data and `[TEST-TEMP]` hygiene exactly as Rick §3 (published current
week, draft next week, two open shifts, a `floater` double-booking, `brewer1`
pending + approved time off, `bartender1` availability, messages in All-staff
and Bar, one notification per persona; `setup` runs `cleanup_temp` first).

### 3.4 ◆ Secret password + token minting

**Password lifecycle**
- Generated once at DEV provisioning (random, ≥ 24 chars).
- Set as Fly secret `SEED_PASSWORD` on `rockcut-api-dev` (Fly secrets are
  write-only — they can't be read back).
- Readable copy: a **PortableMind file in Matt's tenant, shared only with
  Rick** (Rick's own plan was shared the same way). Not an encrypted vault —
  adequate for a password that only unlocks fabricated data. PortableMind has
  no secret store exposed to agents; `Configuration.encrypted_values` exists
  but isn't writable through the API.
- Local: `rockcut_api/.env.synthetic` and `rockcut-ui/.env.test.local`
  (both **gitignored**), filled from that file.
- Rotating = new value → Fly secret → PortableMind file → `reset_synthetic`.

**Token minting (default agent path)**
- `RockcutApi.Seeds.Synthetic.mint_token(persona_key)` → a session token for
  that persona. Guarded (§3.3), and refuses any user whose email isn't
  `@rockcut-test.com`.
- **Short-lived: 8 hours.** Signed with a distinct salt (`"synthetic auth"`)
  that `AuthPlug` accepts — with an 8-hour `max_age` — **only when
  `:deploy_env` is `dev` or running locally**. Prod never accepts it, and a DEV
  token is useless on prod anyway (different `SECRET_KEY_BASE`).
- Entry points:
  - DEV: `fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api eval 'IO.puts RockcutApi.Release.mint_token(\"barMgr\")'"`
  - Local: `mix rockcut.synthetic.token barMgr`
- Using it (Rick §4, unchanged): set `localStorage.rockcut_token` (+
  `rockcut_email`) on the UI origin and reload; switching persona = swapping
  the token.
- Playwright: `tests/auth.setup.ts` mints a token per persona (via the local
  mix task, or the DEV `fly ssh` command) and writes
  `tests/.playwright-auth/<persona>.json` (gitignored). Only login-flow specs
  read `SEED_PASSWORD`.

### 3.5 UI test scaffold

As Rick §4: `rockcut-ui/tests/config/test-env.ts` (identities — the single
source of truth, same keys as §3.3; ◆ password from `process.env.SEED_PASSWORD`
with **no fallback**), `tests/config/e2e-targets.json` (`local` + `dev`
profiles; `prodGuard.allowedHosts` = localhost, 127.0.0.1,
rockcut-ui-dev.fly.dev, rockcut-api-dev.fly.dev; `deniedPatterns`
`^rockcut-(ui|api)\.fly\.dev$`; fail-closed), `tests/auth.setup.ts`,
`tests/RUNNING.md` (pre-flight: health, `synthetic_status`, how to mint a
token, how to reset), and one smoke spec per role.

### 3.6 Build order

🔑 = needs Matt's Fly account (run `fly` in a real terminal).

1. **Env switch** — `ROCKCUT_ENV` → `:deploy_env`; Local mailer on `dev`;
   `VITE_ENV_LABEL` banner in the UI shell.
2. **Seed** — `Seeds.Credentials` (◆ no default), `Seeds.Synthetic` (guard,
   17 personas, scenario data, cleanup), `Release` wrappers, mix tasks.
3. ◆ **Token minting** — `mint_token/1`, `"synthetic auth"` salt accepted by
   `AuthPlug` only in dev/local with 8 h `max_age`, `Release.mint_token/1`,
   `mix rockcut.synthetic.token`.
4. **Tests** — guard refuses `deploy_env=prod` and a non-allowlisted host;
   `setup` idempotent; every active persona authenticates; ◆ minting refuses
   non-synthetic users and prod; ◆ a minted token is rejected when
   `deploy_env=prod`; ◆ `setup` fails clearly without `SEED_PASSWORD`.
5. **Local parity** — replace the `matt@rockcut.com` dev owner with synthetic
   `owner@`; remove the published password from `CLAUDE.md` Auth.
6. **UI scaffold** (§3.5).
7. **Config** — `fly.dev.toml` for both apps.
8. 🔑 **Provision** — `fly apps create rockcut-api-dev --org rockcut`, same for
   `rockcut-ui-dev`; `fly volumes create rockcut_dev_data -r dfw -s 1 -a rockcut-api-dev`.
9. 🔑 **Secrets** — `SECRET_KEY_BASE` (new), `ROCKCUT_ENV=dev`, `CORS_ORIGINS`,
   dev VAPID pair, ◆ `SEED_PASSWORD` (generated; readable copy to the
   PortableMind file). **No** `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`.
10. 🔑 **Deploy** — `fly deploy -c fly.dev.toml --remote-only` (both); start the
    machine if stopped; `eval RockcutApi.Release.seed()` then
    `seed_synthetic()`. (Migrations run at boot; Rick's explicit `migrate()`
    step is harmless but unneeded.)
11. **Smoke** — `synthetic_status` (16 active personas authenticate; `inactive`
    rejected); DEV banner visible; Playwright mints all storageStates;
    **prod**: `owner@rockcut-test.com` → 401, `seed_synthetic` and `mint_token`
    raise. Add the prod checks to the runbook smoke step.
12. **Docs** — DEV section in the deploy runbook ("Routine DEV redeploy",
    "Reset DEV", "Rotate the seed password"); credentials policy at
    `docs/process/test-credentials-policy.md`, linked from `CLAUDE.md`.

---

### 3.7 Implementation notes (deviations from the design above)

- **DEV mailer = `RockcutApi.MailerNoop`, not `Swoosh.Adapters.Local`.**
  `prod.exs` sets `config :swoosh, local: false`, so the Local adapter would
  raise inside a release (the D28 problem). The no-op mailer still sends no
  email. DEV is a prod-mode release, so it inherits the D28 wiring unchanged.
- **`ROCKCUT_ENV` and `CORS_ORIGINS` are in `fly.dev.toml [env]`**, not
  secrets — they aren't sensitive and are clearer versioned. Secrets on DEV:
  `SECRET_KEY_BASE`, `SEED_PASSWORD`, dev VAPID pair.
- **`mint_tokens/0` + `mix rockcut.synthetic.token --all`** (and
  `Release.mint_tokens_json/0`): one call mints every active persona's token,
  so the Playwright setup doesn't start `mix`/`fly ssh` 16 times.
- **`seeds.exs` runs the synthetic setup** at the end when the guard allows
  and `SEED_PASSWORD` is set, so `mix ecto.reset` locally and `Release.seed()`
  on DEV produce the personas in one step. The old `matt@rockcut.com` /
  `rockcut2026` fallback owner is removed — it would also have applied in a
  prod release if `ADMIN_*` were ever unset.
- **Tests never read a developer's `.env.synthetic`** (`config/test.exs`
  sets `:seed_env_file` to nil).
- **Bug fixed while testing:** the UI's API client reloaded the page on every
  401, including a failed sign-in, so "Invalid credentials" / "Account
  disabled" never showed. `src/lib/api.ts` now skips the reload for
  `POST /api/session`.

## 4. Success Criteria

- [ ] DEV UI and API are live on `*.fly.dev` with the DEV banner; `/api/health` 200.
- [ ] `synthetic_status` on DEV: 16 personas authenticate, `inactive` rejected.
- [ ] A minted token logs an agent in as any persona on DEV and locally, and
      expires after 8 hours.
- [x] No seed password in git (`git grep` for the value finds nothing); the
      seed refuses to run without `SEED_PASSWORD`.
- [ ] Prod: synthetic login → 401; `seed_synthetic` / `mint_token` raise;
      prod `AuthPlug` rejects `"synthetic auth"` tokens.
- [x] Local dev seeds the same personas; `matt@rockcut.com` / `rockcut2026`
      are gone from seeds and `CLAUDE.md`.
- [ ] Playwright auth setup produces all storageStates; one smoke spec per
      role passes against local and DEV.
- [x] `MIX_ENV=test mix test` passes (existing + new).
- [ ] Runbook DEV section and credentials policy committed.

---

## 5. Out of Scope

- A regression test suite beyond one smoke spec per role (later deliverable).
- Auto-deploy / CI for DEV.
- Private networking for DEV.
- Custom-role personas (added with RBAC roadmap Phase 4).
- Changing prod auth beyond rejecting `"synthetic auth"` tokens.

---

## 6. Open Questions

- [ ] Confirm with Rick: the ◆ secret-password + token change vs. PortableMind's
      published-password pattern (his plan mirrored it deliberately).
- [ ] Is 8 hours right for minted tokens (one working session)?
- [ ] Verify once that a browser agent will use the secret seed password for a
      fictional account in the login-flow specs (expected yes — the refusal
      concern is about real people's credentials).
