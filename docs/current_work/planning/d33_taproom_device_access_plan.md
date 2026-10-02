# D33: Taproom Device Access — Implementation Instructions

**Spec:** `d33_taproom_device_access_spec.md` (approved 2026-09-30; Q1 idle timeout = 5 min)
**Plan status:** Approved — lead + Matt, 2026-09-30 (`prompts/d33_lead_decisions_1.md`; answers recorded at the end)
**Created:** 2026-09-30
**Branch:** `d33-taproom-device-access` (off `d32-schedule-events`; merge waits on the workflow §2 branch cleanup)
**Process:** `docs/process/three_environment_workflow.md` — read it before starting.
**Backlog:** PortableMind project 254, task 3938 (+ 3939)

---

## Overview

Seven phases, one commit (or more) each. Run the **full** API suite after every
API step (`cd rockcut_api && MIX_ENV=test mix test`). Format touched files only;
never run repo-wide `mix format` or `mix precommit`.

**Rules for the whole deliverable:**
- `test/rockcut_api/authz_parity/` stays **untouched and green**. If a parity
  test fails, a person's behavior changed. Stop and ask.
- `authz_boundary_test.exs` stays green. Every access decision about a device
  goes through `Authz` (see Q3 on extending the boundary pattern to `kind`).
- **Deny by default, twice:** a device is refused by the router unless the
  route is in the device-allowed scope, *and* by `Authz` unless
  `Authz.Device` explicitly allows the decision.
- **No behavior change for people.** Every person-facing query change is a
  filter that removes device rows only.

| Phase | What | Commit message |
|---|---|---|
| A | Device account: migration, `User` fields + invariants, the four listing fixes, assignee rejection, session/password/membership refusals | `feat: implement D33 device account model` |
| B | Pairing + device tokens: tables, `Devices` context, rate limiter, `AuthPlug`, Shared devices API, audit | `feat: implement D33 device pairing and tokens` |
| C | The two gates: `DeviceGate` + router split, `Authz.Device` first clause, `scope/3`, capabilities; route + decision matrices | `feat: implement D33 device gates` |
| D | Synthetic `taproomDevice` persona + mint path | `feat: D33 taproomDevice synthetic persona` |
| E | Tablet UI: setup screen, token handling, chip, nav, read-only schedule and channels, Shared devices admin page, personal sign-in with 5-min idle return | `feat: implement D33 tablet UI and Shared devices page` |
| F | 3939: channel URLs the user can't see redirect; 403 on send shows an error | `fix: D33 unknown channel URLs redirect to Messages (3939)` |
| G | Playwright specs, tablet setup doc, COVERAGE.md, local gate, handoff note | `test: D33 taproom device regression specs` |

---

## Prerequisites

- [ ] On `d33-taproom-device-access`; tree clean; approved spec committed (`f6edb29`), brief (`9e28d9d`).
- [ ] Baselines, re-measured before Phase A and recorded in the result doc:
      `MIX_ENV=test mix test` → **685**; Playwright → **53 passed, 1 skipped**;
      `tsc` → **3** errors; `pnpm lint` → **27** problems. D33 adds none to the last two.
- [ ] Record the parity baseline SHA: `git diff 9e28d9d -- rockcut_api/test/rockcut_api/authz_parity/` must stay empty.
- [ ] Local servers (lead-owned, panes `w3:p2` / `w3:p3`) seeded with personas
      (`mix rockcut.synthetic.setup`) for Phases D–G. The lead restarts the API after each migration.

---

## What the code looks like today (read before building)

- **`Authz.can?/3`** (`lib/rockcut_api/authz.ex`): three rules that bind owners
  (time-off cancel, `{:channel, key}` view/post, calendar feed kinds), then
  the owner shortcut `can?(%User{is_owner: true}, _, _) -> true`, then the
  per-resource rules, ending in a catch-all `false`. The device clause goes
  **above the first of these** (line ~150, before the `:cancel` clause).
- **`Authz.scope/3`**: owner → `:all`; `:manage` → managed departments;
  `:messaging, :edit` → member departments; else `:none`. `Scheduling`'s
  `restrict_visibility` turns `:none` into "published only", which is what the
  device needs. `Messaging.channels_for/1` uses `scope(:messaging, :edit)` to
  list department channels, so the device needs `{:departments, [home_id]}` there.
- **Direct helpers that bypass `can?`:** `counts_as_manager?/1` (Managers
  channel list), `role_in/2`, `can_manage_user?/2`. A device has no
  memberships and is never owner, so all return false/nil already; D33 adds an
  explicit device clause to `counts_as_manager?/1` and `can_manage_user?/2` anyway.
- **`AuthPlug`** verifies a `Phoenix.Token` (30 days), falls back to the
  synthetic salt when `Seeds.Guard.allowed?()`, loads the user, checks `active`.
  **`SessionController.delete/2` is a no-op today.**
- **Router:** one `[:api, :authenticated]` scope for every signed-in route, plus
  the `:brewery` scope. `POST /api/session`, `/health`, `/calendar/:token` are public.
- **Listings:** `Accounts.list_roster` (active + schedulable), `Accounts.list_users_for`
  (owner → `:all` → every user row), `Messaging.recipients("all")` →
  `active_users_query` (every active user). `recipients("managers")` and
  `recipients("dept:…")` already exclude a user with no memberships.
- **Assignees:** `Shift.assignee_id` and `ScheduleTemplateItem.assignee_id` have
  only FK constraints; nothing checks what kind of user it is.
- **Owner shortcut trap:** an owner passes `can?` for `reset_password`,
  `update`, `:assign` memberships and `:set_owner` on *any* user. Device
  invariants therefore live in `Accounts`/changesets (data rules), not in `Authz`.
- **UI:** one token at `localStorage.rockcut_token`; the axios 401 interceptor
  clears it and reloads. The catch-all route redirects to `/` (D31 has **no**
  "not available" page; see Q1). `/schedule` fetches `/api/shift_templates`
  and `/api/time_off` for everyone, and both will be 403 for the device.
  `Messages.tsx` renders any `:key`, polls its messages every 8 s and posts
  without handling a 403 (3939).

---

## Implementation decisions (approved 2026-09-30)

1. **`kind` is set at creation and never changes.** It isn't in any cast list
   except the device-create changeset. A person can't become a device or vice versa.
2. **Device email:** `users.email` is NOT NULL and unique, so a device gets a
   generated, undeliverable address, `device-<16 hex>@devices.rockcut.invalid`,
   never shown in the UI (the name is). The synthetic persona uses
   `taproom.device@rockcut-test.com` so the D30 guard and cleanup recognize it.
3. **Token and code hashing:** tokens are 32 random bytes (`dev_` +
   url-safe base64); codes are 8 characters from
   `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L). Both are stored as
   `HMAC-SHA256(secret_key_base, value)` (deterministic, so lookup is one
   indexed query). Argon2 isn't needed for high-entropy tokens and would cost
   ~100 ms on every tablet request.
4. **A device can't use a `Phoenix.Token`.** `AuthPlug` rejects a non-`dev_`
   token whose user is `kind: "device"` (401). Only `dev_` tokens authenticate
   a device. (This decides Q2's shape.)
5. **Router gate by pipeline split:** `:authenticated` = `AuthPlug` +
   `DeviceGate` (refuses devices). A new `:device_allowed` pipeline =
   `AuthPlug` only, used by one scope holding exactly the allowlisted routes.
   Every existing and future route in `:authenticated` stays closed to devices.
   The allowlist scope is declared **before** the general scope so its GET
   routes match first; each path lives in exactly one scope (a router test
   asserts no path+verb is in both).
6. **Rate limiter:** a small `RockcutApi.Devices.PairingRateLimiter`
   GenServer owning a public ETS table, keyed by client IP, fixed 10-minute
   window, 5 wrong codes, then 429 until the window ends. Client IP = the
   `fly-client-ip` header when present (Fly sets it; behind Fly's proxy
   `remote_ip` is the proxy), else `conn.remote_ip`. Successful exchanges don't count.
7. **Shared devices API is a separate controller**, not `/api/users`. The
   Users API refuses a device target (update, reset password, memberships →
   422 "Shared devices are managed under Shared devices").
8. **Pair/revoke authorization** is an `Authz` clause after the owner
   shortcut: `can?(user, a, %User{kind: "device"} = d) when a in [:pair, :revoke_token]`
   → `role_in(user, d.home_department_id) == :manager`. Create, rename,
   deactivate and delete fall through to owner-only.
9. **Device deletion** cascades its `device_tokens`, pairing codes and channel
   reads; audit rows keep working (check `audit_entries.target_id` on_delete
   and nilify if it's restrict). Deactivation is the normal path; delete is for mistakes.
10. **Personal sign-in on a tablet (UI only):** the device token moves to
    `localStorage.rockcut_device_token` and the person's token goes into
    `rockcut_token`. Idle = no pointer/key/touch/scroll for
    `PERSONAL_IDLE_MS = 5 * 60 * 1000` (one constant in `src/lib/device.ts`).
    On idle, or on the person's Logout, the personal token is dropped and the
    device token restored; no re-pairing. The 401 interceptor restores the
    device token instead of showing the login screen when one is set aside.
11. **Device logout** (`DELETE /api/session` with a `dev_` token) revokes that
    token row. For people it stays a no-op.
12. **Schedule on the device:** `/schedule` agenda only; the page skips the
    `/api/time_off`, `/api/shift_templates` and `/api/availability` queries when
    `user.kind === "device"` (so no off-markers on the tablet; they'd
    expose staff time off to customers anyway, per Q6's "assume customers can read it").

---

## PHASE A — Device account model

### A.1 Migration
**File:** `priv/repo/migrations/20260930120001_add_device_kind_to_users.exs`

```elixir
alter table(:users) do
  add :kind, :string, null: false, default: "person"
  add :home_department_id, references(:departments, on_delete: :restrict)
end
create index(:users, [:kind])
```
Reversible (`change/0`; SQLite drop-column works on the ecto_sqlite3 version in use — confirm with a local rollback/migrate).

### A.2 `User` schema + changesets
**File:** `lib/rockcut_api/accounts/user.ex`
- `field :kind, :string, default: "person"`; `belongs_to :home_department, Department`.
- `device_changeset(user, attrs)` (create + rename only): casts `name`,
  `home_department_id`; puts `kind: "device"`, `is_owner: false`,
  `schedulable: false`, `must_reset_password: false`, a generated email
  (decision 2) and `password_hash = Argon2.hash_pwd_salt(random 32 bytes)`
  that no one ever sees; requires `name` and `home_department_id`; FK constraint.
- `validate_device_invariants/1`, piped into **every** changeset
  (`changeset`, `registration_changeset`, `password_changeset`,
  `owner_flag_changeset`): when `kind == "device"`, adds an error if
  `is_owner`, `schedulable`, `must_reset_password` or a `password` change is
  present, or `home_department_id` is nil; when `"person"`,
  `home_department_id` must be nil.

### A.3 Refusals in `Accounts` and `SessionController`
- `get_user_by_email_and_password/2`: a device never matches (still does the
  dummy verify). `SessionController.create/2` → 401 "Invalid credentials" (S5;
  no hint that the email is a device).
- `set_memberships/3` and `create_user/2`'s membership step: device target →
  `{:error, :device_account}` → 422.
- `reset_password/2`, `update_user/3` with a device target → `{:error, :device_account}` → 422 (decision 7).
- `change_password/3` is unreachable for a device (router gate) but also refuses.

### A.4 The four listing fixes
- `Accounts.list_roster/0`: add `u.kind == "person"`.
- `Messaging.active_users_query/0`: add `u.kind == "person"`.
- `Accounts.list_users_for/1`: add `u.kind == "person"` in both branches.
- `Accounts.persons_query/0` shared helper, so the three read the same way.

### A.5 Assignees
- `Scheduling.create_shift`/`update_shift` and the template-item insert path
  (`create_schedule_template`, `apply`/copy-week paths that insert shifts with
  an assignee): if `assignee_id` is set, check the user is `kind: "person"`;
  otherwise the changeset gets `assignee_id: "can't be a shared device"` → 422 (S14).
  Implemented as `Shift.validate_assignee_kind/1` + `ScheduleTemplateItem`
  equivalent, each doing one `Repo.exists?`.
- `claim_shift` is unreachable for a device (gate), and `Authz` denies it too.

### A.6 Tests (new files only)
- `test/rockcut_api/accounts/device_account_test.exs`: every invariant in
  §3.1 (owner flag, memberships, schedulable, must_reset, password change,
  home dept required, person can't have home dept, kind immutable via `changeset/2`).
- Listing fixes: a device exists → absent from `list_roster`, `list_users_for(owner)`,
  `Messaging.recipients("all")`; **S10:** posting in All-staff creates no
  `Notification` for the device (ExUnit, synchronous path of `notify_members`).
- Assignee: shift create/update and template item with a device id → 422 (S14).
- `session_controller_test`: device email + any password → 401 (S5).

---

## PHASE B — Pairing and device tokens

### B.1 Migrations
**File:** `20260930120002_create_device_tokens_and_pairing_codes.exs`

```elixir
create table(:device_tokens) do
  add :user_id, references(:users, on_delete: :delete_all), null: false
  add :name, :string, null: false
  add :token_hash, :binary, null: false
  add :paired_by_id, references(:users, on_delete: :nilify_all)
  add :last_seen_at, :utc_datetime
  add :revoked_at, :utc_datetime
  timestamps(type: :utc_datetime)
end
create unique_index(:device_tokens, [:token_hash])
create index(:device_tokens, [:user_id])

create table(:device_pairing_codes) do
  add :user_id, references(:users, on_delete: :delete_all), null: false
  add :code_hash, :binary, null: false
  add :created_by_id, references(:users, on_delete: :nilify_all)
  add :expires_at, :utc_datetime, null: false
  add :used_at, :utc_datetime
  timestamps(type: :utc_datetime)
end
create unique_index(:device_pairing_codes, [:code_hash])
```
Reversible.

### B.2 `RockcutApi.Devices` context (new)
**Files:** `lib/rockcut_api/devices.ex`, `devices/device_token.ex`, `devices/pairing_code.ex`, `devices/pairing_rate_limiter.ex`
- `list_devices/1` (actor-scoped: owner all; manager → devices whose home they manage, via `Authz`), `get_device!/1`.
- `create_device(attrs, actor)`, `rename_device/3`, `set_device_active/3`, `delete_device/2` — owner-only, audited (`device.created`, `device.renamed`, `device.deactivated`, `device.reactivated`, `device.deleted`).
- `create_pairing_code(device, actor)` → `{:ok, plain_code, %PairingCode{}}`; expires in 10 min; audited `device.pairing_code`. Earlier unused codes stay valid until expiry (see Q7).
- `exchange_code(code, tablet_name, ip)`: in one transaction (`BEGIN IMMEDIATE`, per the D32 single-connection note) find the unused, unexpired code by hash, mark it used, insert a token row with `paired_by_id = code.created_by_id`, return the plain `dev_` token once. Wrong/used/expired → `{:error, :invalid_code}` and a rate-limiter hit. Device inactive → `{:error, :invalid_code}`. Audited `device.paired` (actor = code creator).
- `authenticate_token("dev_" <> _ = token)` → `{:ok, user, token_row}` or `:error` (revoked, missing, user inactive). Touches `last_seen_at` only if it's nil or older than 60 s (one `update_all` with a `where` on the timestamp).
- `revoke_token(token_row, actor)` (audited `device.revoked`), `revoke_own_token(token_row)` (tablet sign-out; audited with the device as actor).
- `list_tokens(device)` with `paired_by` preloaded.
- Code normalization: upper-case, strip spaces and dashes (display as `ABCD-EFGH`).

### B.3 `AuthPlug`
- `"Bearer dev_" <> _` → `Devices.authenticate_token/1`; assigns
  `:current_user` and `:device_token`. Else the existing path, plus decision 4.
- Revocation and deactivation take effect on the next request because both are
  checked on every request (no cache).

### B.4 Routes + controllers
- **Public:** `POST /api/device_tokens` `{code, name}` → `DeviceTokenController.create`:
  429 when rate-limited (before touching the DB), 422 "That code is invalid or
  expired" on any failure (one message for wrong, used and expired: no oracle),
  201 `{token, user}` on success.
- **Authenticated (people only, `:authenticated` scope):**
  ```
  get    "/devices",                  DeviceController, :index      # owner + home-dept managers
  post   "/devices",                  DeviceController, :create     # owner
  patch  "/devices/:id",              DeviceController, :update     # owner: name, active
  delete "/devices/:id",              DeviceController, :delete     # owner
  post   "/devices/:id/pairing_code", DeviceController, :pairing_code  # Authz :pair
  delete "/device_tokens/:id",        DeviceTokenController, :delete   # Authz :revoke_token on the token's device
  ```
  `index` returns each device with its tokens (name, paired by, paired at,
  last seen, revoked). A manager with no device in their departments gets `[]`, not 403.
- `JSONHelpers`: `device/1`, `device_token/1`; `user/1` and `me/2` add `kind`
  and `home_department_id`.

### B.5 Tests
- `devices_test.exs`: code format and alphabet; single use; 10-min expiry
  (inject `now`); hashed at rest (the plain code/token isn't in the row);
  token prefix; `last_seen_at` throttle; inactive device can't exchange.
- `pairing_rate_limiter_test.exs`: 5 wrong → 6th is 429; window reset; per-IP isolation; a correct code after 5 wrong in the window is still 429 (S4).
- `auth_plug_device_test.exs`: valid `dev_` → 200; revoked → 401; device
  deactivated → 401; unknown `dev_` → 401; a `Phoenix.Token` for a device user → 401 (decision 4).
- `device_controller_test.exs`: owner CRUD; barMgr pairs + revokes a taproom
  device; **breweryMgr 403 on pair and revoke (S3)**; employee 403; barMgr 403
  on create/rename/delete; audit rows for create, pair, revoke, deactivate (S1).
- S11/S12 at the API level: two tokens, revoke one → it 401s, the other 200s; deactivate → both 401.

---

## PHASE C — The two gates

### C.1 `DeviceGate` + router
**Files:** `lib/rockcut_api_web/plugs/device_gate.ex`, `router.ex`
- `DeviceGate`: `current_user.kind == "device"` → 403 `{error: "Not available on a shared device"}`.
  (Its `kind` check calls `Authz.device?/1`, so the kind check lives in Authz.)
- New scope, declared first, `pipe_through [:api, :device_allowed]`:
  ```
  get    "/me"                       get "/session"      delete "/session"
  get    "/departments"              get "/positions"    get "/roster"
  get    "/shifts"                   get "/shifts/:id"   get "/schedule_events"
  get    "/channels"                 get "/channels/:key/messages"
  post   "/channels/:key/read"       get "/messages/unread_count"
  ```
  These move out of the general scope (no route is in both). `resources "/positions"`
  becomes an explicit `get` here plus `post/patch/delete` in the general scope.
- Every other route (including the new `/devices` routes) stays in
  `[:api, :authenticated]` or `[:api, :authenticated, :brewery]`.

### C.2 `Authz`
**Files:** `lib/rockcut_api/authz.ex`, `lib/rockcut_api/authz/device.ex` (new)
- `def device?(%User{kind: "device"}), do: true; def device?(_), do: false`.
- **First** `can?/3` clause: `def can?(%User{kind: "device"} = d, action, resource), do: Authz.Device.can?(d, action, resource)`.
- `Authz.Device.can?/3` allowlist, ending in a catch-all `false`:
  - `:read` `%Shift{status: "published"}`, `%ScheduleEvent{status: "published"}`, `%Position{}`, `%Department{}`, `:roster`;
  - `:view` and `:mark_read` on `{:channel, "all"}` and `{:channel, "dept:" <> home_key}` (home key resolved from `home_department_id`);
  - `:post` on any `{:channel, _}` → **explicit `false`** clause with a comment;
  - `:access` on `{:module, home_key_atom}`.
- `scope/3` first clauses: `scope(%User{kind: "device"} = d, :messaging, _)` →
  `{:departments, [d.home_department_id]}`; `scope(%User{kind: "device"}, _, _)` → `:none`.
- `counts_as_manager?/1` and `can_manage_user?/2`: device clause → `false` first.
- Pair/revoke clause (decision 8) after the owner shortcut.
- `Messaging.mark_read/2` currently checks `can_view?`; unchanged (the device passes `:view`).

### C.3 Capabilities
**Constraint found while planning:** the frozen parity test
`authz_parity/capabilities_test.exs` asserts that a person's capabilities map
has **exactly** the keys `can_manage_users manages_departments modules
pending_owner_reviews`. So people get **no new keys** in `capabilities`.
- `Accounts.capabilities/1` device branch (a first clause on `%User{kind: "device"}`):
  `%{kind: "device", home_department: key, modules: [key, "schedule"],
  manages_departments: [], can_manage_users: false, pending_owner_reviews: 0}`
  (spec §3.4). The person branch is unchanged.
- The UI reads `user.kind` (added to the `user` JSON, not to capabilities) to
  tell a device from a person.
- Shared-devices nav visibility for people comes from a **top-level** `/api/me`
  field, `shared_devices: true|false` (owner, or manager of some device's home
  department, via `Authz`), next to `user` and `capabilities`, not inside
  `capabilities`. The parity `/api/me` test only reads `capabilities`, so it's unaffected.

### C.4 Tests
- `device_route_matrix_test.exs` (**generated from the router**):
  `Phoenix.Router.routes(RockcutApiWeb.Router)` → for every `{verb, path}`,
  a `@classified` map says `:device_ok`, `:public` or `:denied`. The test
  (1) fails if any route is unclassified (a new route fails until someone
  classifies it); (2) calls each route as `taproomDevice` with ids filled from
  fixtures and asserts `:denied` → 403 and `:device_ok` → not 403/401;
  (3) asserts the `:device_ok` set equals the allowlist scope's routes.
  `/dev/*` routes (dev-only) are excluded by prefix.
- `authz_device_test.exs`: every D29 decision (inventory in
  `stepwise_results/d29_rbac_capability_model_COMPLETE.md`) × `taproomDevice` →
  expected allow/deny, including `:post` on `all` and `dept:bar` (explicit
  deny), `:view` on `managers` and `dept:brewery` (deny), draft shift/event
  `:read` (deny), `:claim` (deny), `scope/3` for each module.
- Messaging: device `channels_for` = All-staff + Taproom only; `GET
  /api/channels/managers/messages` → 403; `POST /api/channels/all/messages` → 403 (S8).
- Scheduling: device `list_shifts`/`list_events` return published only; `POST
  /api/shifts/:id/claim` → 403 (S7).
- Parity dir diff empty; boundary test green.

---

## PHASE D — Synthetic `taproomDevice` persona

**Files:** `lib/rockcut_api/seeds/synthetic.ex`, `release.ex`, `lib/mix/tasks/rockcut.synthetic.ex`
- Add a device entry to `@personas` (`{"taproomDevice", "taproom.device", "Taproom tablets", [], %{kind: "device", home: "bar"}}`).
  `upsert_persona` gives it an unusable random hash (never the seed hash),
  `schedulable: false`, no memberships, `home_department_id` = bar.
- `status/0` reports `authenticates=n/a (device)` for it.
- `mint_token("taproomDevice")`: revokes earlier `[SEED]` tokens and inserts a
  device token row named `[SEED] Playwright tablet`, returning its `dev_`
  token (see Q2). Guarded by `Guard.guard!()` like every mint.
  `mint_tokens/0` includes it, so `auth.setup.ts` writes `taproomDevice.json`.
- `Release.pair_synthetic_device/1` (optional): prints a pairing code for the
  synthetic device, for a human to try the real pairing flow on DEV.
- `reset/0` and `setup/0`: delete `[TEST-TEMP]`-named device tokens and devices.
- **Tests:** extend `test/rockcut_api/seeds/synthetic_test.exs` (not a parity
  file): the device persona exists with the invariants; its mint returns a
  `dev_` token that authenticates; password check never passes.

---

## PHASE E — Tablet UI

### E.1 Types, token storage, auth store
**Files:** `src/lib/types.ts`, `src/lib/device.ts` (new), `src/hooks/useAuth.ts`, `src/lib/api.ts`
- `User.kind: 'person' | 'device'`; `Capabilities.kind?` and `home_department?` (device only); `Me.shared_devices`.
- `device.ts`: `PERSONAL_IDLE_MS`, `DEVICE_TOKEN_KEY = 'rockcut_device_token'`, helpers.
- `useAuth`:
  - `pairDevice(code, name)` → `POST /api/device_tokens` → store as `rockcut_token`, `loadMe`.
  - `logout()` on a device: `DELETE /api/session` (revokes) then clear.
  - `startPersonalSignIn()` moves the device token aside; `login()` then works as today.
  - `endPersonalSession()` drops the personal token and restores the device token.
- `api.ts` 401 interceptor: if a device token is set aside, restore it and
  reload; otherwise today's behavior. A revoked device token (401 with no
  aside token) lands on the login screen, which offers setup again (S11).

### E.2 Login screen
**File:** `src/pages/Login.tsx`
- A **"Set up as a shared device"** link toggles a form: code (auto-formats
  `ABCD-EFGH`), tablet name, Submit. Errors via `parseApiError`; 429 shows
  "Too many attempts. Try again in a few minutes." (S4).
- When `rockcut_device_token` is set aside (personal sign-in in progress), a
  **Cancel — back to the shared screen** button.
- `data-testid`s: `device-setup-link`, `device-code`, `device-name`, `device-submit`.

### E.3 App shell for a device
**File:** `src/App.tsx`
- `isDevice = user.kind === 'device'`.
- App bar: a **"Shared device · {home dept name}"** chip (`data-testid="device-chip"`),
  no `NotificationBell`, no email/owner text; a **"Sign in as me"** button
  (`data-testid="personal-signin"`, Q5) and a **Sign out** that opens a confirm:
  "A manager will need to pair this tablet again."
- Nav: Home, View Schedule, the home department section (Taproom), Messages
  (All-staff, Taproom). No Scheduler, Time off, Availability, Admin, Brewery.
- Routes for a device: `/`, `/schedule`, `/messages`, `/messages/:key`; any
  other path renders the device-only "Not available on a shared device" page (Q1).
- Skip the `/api/channels` poll? No — it's allowed; keep it.
- **Personal session on a tablet:** while a device token is set aside, a slim
  banner "Signed in as {name} on a shared tablet · returns to the shared
  screen after 5 minutes idle" and an idle timer (`useIdleReturn` hook:
  pointerdown/keydown/touchstart/scroll reset it; on expiry → `endPersonalSession()`).

### E.4 Pages
- `Home.tsx`: device shows only the quick links it can use (View Schedule, Messages).
- `Schedule.tsx`: decision 12 (skip time off, templates, availability
  queries), no claim buttons, no "Mine" filter for a device.
- `Messages.tsx`: when `!channel.can_post` (new field from `/api/channels`, from
  `Authz.can?(:post)`) replace the composer with "Shared devices can read but not post."
  `data-testid="read-only-notice"`.
- **Shared devices page** `src/pages/devices/SharedDevices.tsx`, route
  `/devices`, nav under Admin for owners and home-dept managers
  (`me.shared_devices`, C.3):
  - owner: **Add shared device** (name, home department), rename, deactivate/reactivate, delete (confirm);
  - owner + home-dept manager: **Pair a tablet** → shows the code and its
    expiry countdown once; the tokens list (name, paired by, paired at, last
    seen, status) with **Revoke** (confirm);
  - `data-testid`s: `device-row-<id>`, `pair-tablet-<id>`, `pairing-code`, `revoke-token-<id>`.
- `OwnerActivity.tsx`: labels for the new `device.*` audit actions.
- Users & Roles, assignee pickers: devices never appear because the API
  lists exclude them (A.4); no UI change needed.

---

## PHASE F — 3939: channel URLs

**File:** `src/pages/messages/Messages.tsx`
- Once `/api/channels` has loaded, a `selectedKey` not in the list →
  `navigate('/messages', { replace: true })`. Until then, the messages query
  and the mark-read call are disabled (`enabled: !!selected`), so there's no
  polling into 403s.
- Send: catch errors; show `parseApiError` in an `Alert` above the composer
  (a 403 "Forbidden" becomes "You can't post in this channel.").
- **Regression spec** `tests/regression/messaging/channel_urls.spec.ts`:
  - `floater` opens `/messages/managers` → URL becomes `/messages/…` of a
    visible channel, no composer for Managers, no 403 requests to
    `/api/channels/managers/messages` (collect responses);
  - `taproomDevice` opens `/messages/managers` and `/messages/dept:brewery` → same;
  - `bartender1` opens `/messages/all`, posts a `[TEST-TEMP]` message, reload → it's there (persist-verify), then cleans up.
- **Revert-and-rerun:** keep the spec, revert only the `Messages.tsx` change
  with a temporary WIP commit (not `git stash`), run (it must fail), restore,
  run (it must pass). Record both outputs in the result doc and handoff note.

---

## PHASE G — Playwright, docs, local gate

### G.1 Specs
**Directory:** `tests/regression/devices/` (+ `messaging/` from Phase F). Each declares its persona with `authFile()`.

| Spec | Scenarios |
|---|---|
| `shared_devices_admin.spec.ts` | S1 owner creates a `[TEST-TEMP]` device, reload → listed; it's absent from Users & Roles, the scheduler roster and the Add-shift assignee picker; change log shows the create. Cleans up (delete). |
| `pairing.spec.ts` | S2 barMgr pairs: a **second browser context** (no storage state) uses "Set up as a shared device" with the code + "[TEST-TEMP] iPad 1" → signed in with the device chip; barMgr reloads → the tablet is listed with last seen. S11: pair two, revoke one → its next navigation lands on the login screen; the other still loads. S4 (UI): wrong code → message. Cleanup revokes/deletes. |
| `device_permissions.spec.ts` | S3 breweryMgr: no Shared devices nav; API pair on the taproom device → 403. S12 owner deactivates a `[TEST-TEMP]` device → its paired context is signed out on next request, then reactivate/delete. |
| `device_session.spec.ts` (`taproomDevice`) | S6 nav contents + chip, no bell/profile; S7 agenda shows a published `[SEED]` shift, not a draft, no claim button (+ API claim → 403); S8 reads All-staff + Taproom, read-only notice, no Managers in nav (+ API post → 403); S9 typed URLs `/scheduler`, `/time_off`, `/availability`, `/users`, `/brands` → the "Not available on a shared device" page, and the matching API GETs → 403. |
| `personal_signin.spec.ts` | S13 on a device context, "Sign in as me" as `bartender1` by **token injection** into the personal slot (never typing a password), create a `[TEST-TEMP]` time-off request, reload → it persists; then advance the idle timer with Playwright's `page.clock` (no `waitForTimeout`) past 5 min → device chip is back without re-pairing. Cleanup cancels the request. |

- S5 (password login as the device) and the 6th-wrong-code rate limit are
  ExUnit-only (the UI can't type the device's password; hammering the local
  limiter from parallel specs would bleed across tests).
- S10 is ExUnit (no notification row for the device).
- S14: ExUnit for the 422; Playwright's S1 covers the picker.
- `auth.setup.ts`: nothing to change if `mint_tokens` includes the device
  (confirm the `storageState` shape works with a `dev_` token).
- `tests/COVERAGE.md`: a D33 section, S1–S14 and 3939.

### G.2 Tablet setup doc
`docs/process/taproom_tablet_setup.md`: pair a tablet; iPad Guided Access /
Android screen pinning; home-screen install (PWA); lost tablet → Revoke;
signing out needs a new code; personal sign-in and the 5-minute return.

### G.3 Local gate (workflow §3)
- [ ] `mix test` green: 685 + new; parity dir unchanged; boundary green.
- [ ] `tsc` ≤ 3, `vite build` green, lint ≤ 27 (before/after counts recorded).
- [ ] `npx playwright test` green locally, 53 + new passed.
- [ ] 3939 revert-and-rerun recorded (both runs).
- [ ] Every write persist-verified (create device, pair, revoke, deactivate, personal time off, message post).
- [ ] Migrations rolled back and re-applied once locally on a scratch DB copy.

### G.4 Handoff note (file, not a PR)
`docs/current_work/prompts/d33_handoff_note.md`: branch + SHA; scenarios
S1–S14 + 3939; **migrations: yes, two** (users kind/home; device tokens +
pairing codes), both reversible; **no new dependency**; LIMITATIONS:
- the rate limiter's IP source (`fly-client-ip`) has only been exercised with
  a faked header locally; DEV is the first run behind Fly's proxy;
- the limiter is per-machine ETS: fine on one API machine (D28), wrong if we scale out;
- the idle return was tested with a mocked clock, not 5 real minutes on an iPad;
- Guided Access/iPad Safari PWA behavior is manual only;
- `last_seen_at` throttle under real tablet polling (20 s channel poll) not measured;
- service-worker update path with a device token untested locally.

---

## Scenario coverage

| # | ExUnit | Playwright | Manual |
|---|---|---|---|
| S1 owner creates device; hidden from lists; change log | device_controller_test, listing tests | shared_devices_admin | — |
| S2 barMgr pairs a tablet in a 2nd browser | devices_test (exchange) | pairing | DEV: a real iPad |
| S3 breweryMgr can't pair/revoke | device_controller_test | device_permissions | — |
| S4 used/expired/wrong code; 6th rate-limited | devices_test, rate_limiter_test | pairing (wrong code message) | — |
| S5 password login as device refused | session_controller_test | — | — |
| S6 device nav | capabilities test | device_session | — |
| S7 published only; claim 403 | authz_device_test, route matrix | device_session | — |
| S8 channels read-only; post 403; Managers 403 | authz_device_test, messaging test | device_session, channel_urls | — |
| S9 typed URLs; API 403 | route matrix | device_session | — |
| S10 device not an All-staff recipient | messaging listing test | — | — |
| S11 revoke one of two tablets | auth_plug_device_test | pairing | — |
| S12 deactivate → all tablets out | auth_plug_device_test | device_permissions | — |
| S13 personal sign-in, 5-min idle return | — | personal_signin (mocked clock) | DEV: real idle on a tablet |
| S14 device never member/owner/assignee; 422 | device_account_test, assignee tests | shared_devices_admin (picker) | — |
| 3939 channel URLs, every user | — | channel_urls (revert-and-rerun) | — |

---

## Files touched (expected)

**API:** `accounts/user.ex`, `accounts.ex`, `authz.ex`, `authz/device.ex` (new),
`devices.ex` + `devices/*` (new), `messaging.ex`, `scheduling.ex`,
`scheduling/shift.ex`, `scheduling/schedule_template_item.ex`,
`seeds/synthetic.ex`, `release.ex`, `application.ex` (limiter child),
`mix/tasks/rockcut.synthetic.ex`, `router.ex`, `plugs/auth_plug.ex`,
`plugs/device_gate.ex` (new), `controllers/{session,user,membership,message,device,device_token}_controller.ex`,
`controllers/json_helpers.ex`, two migrations, new tests.
**UI:** `lib/types.ts`, `lib/api.ts`, `lib/device.ts` (new), `hooks/useAuth.ts`,
`hooks/useIdleReturn.ts` (new), `App.tsx`, `pages/Login.tsx`, `pages/Home.tsx`,
`pages/schedule/Schedule.tsx`, `pages/messages/Messages.tsx`,
`pages/devices/SharedDevices.tsx` (new), `pages/activity/OwnerActivity.tsx`,
`tests/regression/{devices,messaging}/*`, `tests/COVERAGE.md`.
**Docs:** `docs/process/taproom_tablet_setup.md`, the handoff note, the result doc.

---

## Risks

1. **Router split regressions.** Moving the allowlisted routes into a second
   scope could change route order or matching for people. Mitigation: the
   route-matrix test asserts every path+verb exists exactly once; the full
   suite and parity dir must stay green.
2. **Owner shortcut.** An owner passes `can?` for anything on a device row
   (reset password, memberships, owner flag). Invariants are enforced in the
   changeset and `Accounts`, with tests that go through the owner.
3. **401 interceptor and two tokens.** A bug here could strand a tablet on the
   login screen (needs re-pairing) or leave a person signed in. Covered by
   `personal_signin` and `pairing` specs; the aside token is only restored,
   never sent on the person's requests.
4. **Customer-readable screen.** Everything the device sees is assumed public
   (Q6): published shifts show staff names and times. That's Matt's decision;
   time off is deliberately not fetched (decision 12).
5. **Token theft from an unlocked tablet.** No expiry by design; the mitigation
   is Guided Access (doc) + Revoke + last-seen visibility.
6. **Anyone at the bar can sign the tablet out** (it needs re-pairing). Accepted
   by the spec; the confirm text warns.
7. **Parity `capabilities_test`** pins a person's exact capabilities keys, so
   anything new for people goes on `user` or top-level `/api/me` (C.3). A device
   gets its own capabilities shape; the parity suite has no device persona.
8. **Single SQLite connection:** `exchange_code` and the `last_seen_at` touch
   write on the request path; keep them one statement / one short transaction.

---

## Questions for the lead — answered 2026-09-30

Source: `docs/current_work/prompts/d33_lead_decisions_1.md` (Matt decided Q1, Q5, Q6, Q9).

1. **Blocked URL:** a **device-only** "Not available on a shared device" page
   (`data-testid="device-not-available"`) for every route a device can't use.
   People keep today's redirect to Home; `route_gating.spec.ts` is unchanged.
   Spec S9 and §3.5 updated. *(Matt)*
2. **Synthetic device token:** yes. `mint_token("taproomDevice")` creates a real
   `dev_` token row; `AuthPlug` refuses `Phoenix.Token`s for device users (decision 4).
3. **Boundary test:** yes. `authz_boundary_test.exs` is extended to flag `kind`
   checks outside `Authz`; the list filters and the changeset carry the
   `# authz-boundary: data invariant` marker (or live in allowlisted files).
   Parity files stay frozen.
4. **Number of device accounts:** any number; nothing enforces one.
5. **Personal sign-in:** a "Sign in as me" button opening the normal email and
   password form; returns to the device session after 5 idle minutes. *(Matt)*
6. **Home department:** any assignable department, picked by the owner. *(Matt)*
7. **Pairing codes:** a new code doesn't invalidate earlier unused ones; each
   expires on its own after 10 minutes.
8. **Managers:** home-department managers see Admin → Shared devices, limited
   to their own departments' devices.
9. **Server-side revocation of personal tokens:** deferred *(Matt)*; the lead
   files a backlog task. The tablet deletes the personal token locally. Listed in
   the handoff LIMITATIONS.
