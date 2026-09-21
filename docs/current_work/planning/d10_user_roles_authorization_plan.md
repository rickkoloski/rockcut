# D10: Users, Departments & Tiered Authorization — Implementation Instructions

**Spec:** `d10_user_roles_authorization_spec.md`
**Created:** 2026-09-20

---

## Overview

Build the identity + authorization foundation for Rockcut, replacing the
single-admin `EnvAuth` with a real `users` table, department memberships, and an
action-aware `Authz` layer. Delivered in **three phases** under one D10 ID, each
independently committable:

- **Phase 1 — Identity & Auth foundation** (backend): schemas, migrations, owner
  seed, `Accounts` context, real login, `AuthPlug` rewrite, `Authz` module +
  policies, module-access gating of existing brewing routes.
- **Phase 2 — User & role management API**: user/membership/department/me/owner-
  activity endpoints, password lifecycle, escalation guards, audit logging.
- **Phase 3 — Frontend**: login/`me` wiring, nav filtering, User Management
  screen, forced-reset interstitial, owner activity feed.

Do not start a phase until the previous one's tests pass. Commit at each phase
boundary.

---

## Prerequisites

- [ ] D4 auth exists (being replaced); `rockcut_api` compiles, `mix phx.server` runs.
- [ ] `argon2_elixir ~> 4.0` present (confirmed, `mix.exs:56`).
- [ ] `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` known for prod owner seed
      (`config/runtime.exs:75-80`).
- [ ] On branch `practice1`, working tree clean before starting.

---

## Implementation Steps

## PHASE 1 — Identity & Auth foundation

### Step 1.1: Migrations

**Files:** `priv/repo/migrations/<ts>_create_users.exs`, `_create_departments.exs`,
`_create_memberships.exs`, `_create_audit_log.exs`

- `users`: `email:string`, `name:string`, `password_hash:string`,
  `active:boolean default true`, `is_owner:boolean default false`,
  `must_reset_password:boolean default false`, timestamps.
  - **Unique index on `email` with `COLLATE NOCASE`** (SQLite):
    `create unique_index(:users, [:email], name: :users_email_nocase, using: ...)`
    — in SQLite, define the column `add :email, :string, collate: :nocase` (or a
    raw `execute` creating the index `... ON users(email COLLATE NOCASE)`).
- `departments`: `name:string`, `key:string`; unique index on `key`.
- `memberships`: `user_id` (fk, on_delete: :delete_all), `department_id` (fk),
  `role:string`; **unique index `[:user_id, :department_id]`**.
- `audit_log`: `actor_id` (fk users), `target_id` (fk users, nullable),
  `action:string`, `detail:map`, `inserted_at` (timestamps or just inserted_at).

### Step 1.2: Schemas + Accounts context

**Files:** `lib/rockcut_api/accounts/{user,department,membership,audit_entry}.ex`,
`lib/rockcut_api/accounts.ex`

- `User` schema: fields above; `has_many :memberships`; `has_many :departments,
  through: [:memberships, :department]`. Virtual `password`.
  - `changeset/2` for profile; `registration_changeset/2` hashes `password`
    via `Argon2.hash_pwd_salt/1`, downcases nothing (NOCASE index handles it) but
    trims email; validates email format + uniqueness (`:users_email_nocase`).
- `Department`, `Membership` (role validated inclusion `~w(manager employee)`).
- `Accounts` context functions:
  - `get_user_by_email_and_password/2` (Argon2 verify; `Argon2.no_user_verify/0`
    on miss for constant time).
  - `get_user!/1` with memberships + departments preloaded.
  - `list_departments/0`.
  - Later (Phase 2): `create_user/2`, `update_user/2`, `set_memberships/3`,
    `reset_password/2`, `change_password/3` — stub signatures now, fill in Phase 2.

### Step 1.3: Owner seed

**File:** `priv/repo/seeds.exs` (append) + a `Release.seed/0`-safe path

- Seed the four departments idempotently (`Repo.insert!` guarded by
  `get_by(key:)`): Brewery, Bar, Office, Sales.
- Seed the owner: if `ADMIN_EMAIL` set, create/update a `users` row with that
  email, `is_owner: true`, `active: true`, and `password_hash` taken **directly
  from `ADMIN_PASSWORD_HASH`** (already Argon2 — do not re-hash). In dev (no
  env), create a deterministic dev owner: `matt@rockcut.com` /
  `rockcut2026` (hash it), `is_owner: true`.
- **Idempotent**: safe to re-run; never create a second owner for the same email.

### Step 1.4: Replace EnvAuth in SessionController

**Files:** `lib/rockcut_api_web/controllers/session_controller.ex`;
delete/retire `lib/rockcut_api/auth/env_auth.ex`

- `create/2`: `Accounts.get_user_by_email_and_password/2`; on success reject if
  `!user.active` (401 "Account disabled"); else `Phoenix.Token.sign(Endpoint,
  "user auth", user.id)` and return `%{token: token, user: <me_view>}`.
- `verify_token/1`: verify → returns `user_id` (was email).
- Add `password/2` action (self change-password) in Phase 2.

### Step 1.5: Rewrite AuthPlug

**File:** `lib/rockcut_api_web/plugs/auth_plug.ex`

- Extract bearer → `verify_token` → `user_id`.
- `Accounts.get_user!(user_id)` (preloaded). If missing or `!active` → 401.
- `assign(conn, :current_user, user)` (now a `%User{}`, not a string).
- Update `SessionController.show/2` (`GET /api/session`) to render the user via
  the me-view helper.

### Step 1.6: Authz module + policies

**Files:** `lib/rockcut_api/authz.ex`, `lib/rockcut_api/authz/policies/*.ex`

- Helpers:
  - `owner?(user)` → `user.is_owner`
  - `role_in(user, dept)` → `:owner` if owner, else membership role or `nil`
    (accept dept as `%Department{}`, id, or key)
  - `member_of?(user, dept)`
  - `can_manage_users_in?(user, dept)` → owner or `role_in == :manager`
- `can?(user, action, resource)`:
  - owner → true
  - otherwise delegate to the resource's policy module (dispatch on
    `resource.__struct__` or an atom tag). Policy returns boolean given
    `(user, action, resource)`.
  - **D10 brewing policy**: any Brewery member (manager or employee) may
    `:read | :create | :update | :delete` brewing resources; non-members false.
  - Signature must accept `resource` so D11 can consult `employee_write_scope`.

### Step 1.7: ModuleAccessPlug + route gating

**Files:** `lib/rockcut_api_web/plugs/module_access_plug.ex`, `router.ex`

- Plug takes an opt (`module: :brewery` or `shared: true`); reads
  `conn.assigns.current_user`; owner or member of the module's department →
  continue, else 403 JSON `{error: "Forbidden"}` + halt.
- In `router.ex`, wrap the existing brewing resource routes (ingredients,
  recipes, batches, etc.) in a scope piped through
  `[:api, :authenticated, {ModuleAccessPlug, module: :brewery}]`.
- Keep `GET/DELETE /api/session` and (Phase 2) `/api/me`, `/api/departments`
  outside the module gate (authenticated only).

### Step 1.8: Phase 1 tests

**Files:** `test/rockcut_api/accounts_test.exs`,
`test/rockcut_api/authz_test.exs`,
`test/rockcut_api_web/plugs/module_access_plug_test.exs`,
`test/rockcut_api_web/controllers/session_controller_test.exs`

- Login success/failure/inactive; token carries user_id; AuthPlug loads user
  and rejects deactivated mid-session.
- `Authz`: owner/manager/employee/non-member decisions across the matrix.
- Module gating: non-Brewery user → 403 on `/api/ingredients`; Brewery member
  and owner → 200.
- Add a `fixtures` helper (owner, brewery_manager, brewery_employee, outsider)
  in `test/support`.

**Commit Phase 1:** `feat: D10 phase 1 — users, departments, authz foundation (replaces EnvAuth)`

---

## PHASE 2 — User & role management API

### Step 2.1: Accounts write functions + invariants

**File:** `lib/rockcut_api/accounts.ex`

- `create_user/2` (attrs, actor): create with temp password + `must_reset_password:
  true`; write audit entry (`"user.created"`).
- `update_user/2` (profile/active). Guard: cannot deactivate the last owner.
- `set_memberships/3` (target_user, desired_list, actor): **declarative diff** —
  compute add/change/remove vs current, then:
  - reject if actor is a manager touching a department they don't manage;
  - reject any attempt to set/clear `is_owner` unless actor is owner;
  - reject demoting/removing the **last owner**;
  - apply in a transaction; write one audit entry per change.
- `reset_password/2`, `change_password/3` (verify current, clear
  `must_reset_password`).
- `last_owner?/1` helper (count active owners).

### Step 2.2: MeController + DepartmentController

**Files:** `lib/rockcut_api_web/controllers/{me_controller,department_controller}.ex`,
`lib/rockcut_api_web/controllers/json_helpers.ex` (add `me/1`, `user/1`,
`membership/1`, `department/1` views)

- `GET /api/me` → `%{user, memberships: [{department, role}], capabilities:
  %{modules, manages_departments, pending_owner_reviews}}`.
  - `modules`: department keys the user can access + `"schedule"` (shared) later.
  - `pending_owner_reviews`: owner-only count from audit_log (see 2.4).
- `GET /api/departments` → list.

### Step 2.3: UserController + MembershipController

**Files:** `lib/rockcut_api_web/controllers/{user_controller,membership_controller}.ex`

- Follow existing pattern (`action_fallback FallbackController`, `%{data: ...}`).
- `GET /api/users`: owner → all; manager → users who are members of a dept the
  caller manages; employee → 403.
- `POST /api/users`: owner (any) or manager (own-dept roles only). Enforce role
  scope from `Authz` before calling `Accounts.create_user`.
- `PATCH /api/users/:id`: profile/active, guarded.
- `PUT /api/users/:id/memberships`: declarative set → `Accounts.set_memberships`.
- `POST /api/users/:id/reset_password`: manager (own dept) or owner.
- Every action authorizes via `Authz` first; never trust client-sent role.

### Step 2.4: Owner activity feed

**Files:** `lib/rockcut_api_web/controllers/owner_activity_controller.ex`,
`Accounts.list_audit/1`

- `GET /api/owner/activity` (owner only): recent audit entries, newest first.
- `pending_owner_reviews` on `/api/me`: count of `"user.created"` (and other
  manager actions) since the owner's last view. Simplest v1: count entries where
  `actor != owner` newer than a stored `owner.last_activity_seen_at` (store on
  the owner user row, or compute "last N unreviewed" — v1 may just return the
  count of the last 7 days; note this in the result doc).

### Step 2.5: Routes + password self-service

**File:** `router.ex`, `session_controller.ex`

- Authenticated (no module gate): `GET /api/me`, `GET /api/departments`,
  `POST /api/session/password`.
- User management scope (authenticated; authorization inside controllers via
  `Authz`): `resources "/users"` (index/create/update/show),
  `put "/users/:id/memberships"`, `post "/users/:id/reset_password"`,
  `get "/owner/activity"`.

### Step 2.6: Phase 2 tests

**Files:** `test/.../{user_controller,membership_controller,me_controller}_test.exs`,
extend `accounts_test.exs`

- Manager creates user with own-dept role → ok; with owner or other-dept role →
  403/422.
- Declarative membership diff adds/removes correctly; last-owner demotion/
  deactivation/delete blocked; self-escalation blocked.
- `/api/me` capabilities match roles; owner activity lists manager-created users;
  non-owner → 403 on `/api/owner/activity`.

**Commit Phase 2:** `feat: D10 phase 2 — user & role management API, audit + owner activity`

---

## PHASE 3 — Frontend

### Step 3.1: Auth/me wiring

**Files:** `rockcut-ui/src/hooks/useAuth.*`, `src/lib/api.ts`, `src/lib/types.ts`

- On login success, store token; call `GET /api/me`; hold `user + capabilities`
  in auth context. Add `Me`, `Membership`, `Department`, `Capabilities` types.
- If `user.must_reset_password` → route to forced-reset screen (Step 3.4).

### Step 3.2: Nav filtering by capabilities

**Files:** nav/menu component(s), route guards

- Render only modules in `capabilities.modules`; guard routes client-side
  (UX only — server still enforces). Show a "no access" fallback for direct
  navigation to a forbidden module.

### Step 3.3: User Management screen

**Files:** `rockcut-ui/src/pages/users/` (UsersList, UserDialog, membership editor)

- Visible to owners (all users) and managers (their department's users).
- Create/edit user; membership editor shows the four departments with a role
  selector per department; **UI restricts** managers to their own departments and
  to `manager|employee` (owner toggle hidden unless current user is owner) — but
  rely on the API to enforce.
- Submit memberships as the full declarative set to `PUT /users/:id/memberships`.
- Reset-password action.

### Step 3.4: Forced reset + owner activity

**Files:** `src/pages/auth/ForcePasswordReset.tsx`, owner activity panel

- Forced-reset interstitial posts to `/api/session/password`, clears flag,
  refetches `/api/me`.
- Owner: small activity panel/badge reading `/api/owner/activity` and
  `capabilities.pending_owner_reviews`.

### Step 3.5: Phase 3 manual verification

- Log in as owner, manager, employee (seed a few via API) and confirm nav +
  User Management behave per role; confirm forbidden API calls 403 even if UI is
  bypassed.

**Commit Phase 3:** `feat: D10 phase 3 — user management UI, nav gating, forced reset`

---

## Testing

### Manual Testing
1. `mix ecto.reset` (drop/create/migrate/seed) — owner + 4 departments seeded.
2. `POST /api/session` as owner → token; `GET /api/me` → is_owner, all modules.
3. Create a Brewery manager and a Brewery employee via `POST /api/users` +
   `PUT /users/:id/memberships`.
4. As the Brewery manager: create a user (own-dept role ok; owner/other-dept
   rejected); confirm owner activity shows the creation.
5. As a non-Brewery user: `GET /api/ingredients` → 403.
6. Deactivate a user; confirm their existing token now 401s.
7. Attempt to demote the last owner → rejected.

### Automated Tests
- [ ] `mix test` green (new suites + existing brewing tests unaffected).
- [ ] UI: existing checks still pass; add a smoke test for nav gating if a
      harness exists.

---

## Verification Checklist

- [ ] Phases 1–3 steps complete; each committed at its boundary.
- [ ] EnvAuth fully removed; no accept-any path remains.
- [ ] Authz matrix, escalation guards, and last-owner invariant covered by tests.
- [ ] `/api/me` drives UI nav; server enforces independently of the client.
- [ ] Audit log records sensitive changes; owner activity feed works.
- [ ] No regressions in brewing endpoints for Brewery members/owners.
- [ ] Stepwise result written to `docs/current_work/stepwise_results/`.

---

## Notes

- **Owner seed from secrets:** `ADMIN_PASSWORD_HASH` is already an Argon2 hash —
  copy it into `password_hash` directly; do **not** re-hash. Only the dev-owner
  fallback hashes a plaintext.
- **SQLite NOCASE:** email uniqueness is enforced by a `COLLATE NOCASE` unique
  index, not by downcasing in code — keep both out of sync risk low by relying on
  the index and validating format only.
- **Token invalidation:** roles are never in the token; `active` is re-checked
  each request, giving immediate soft-revocation. A future hard-revocation
  (token version / store) is out of scope.
- **Forward hook to D11 (Scheduling):** `Authz.can?/3` already takes the
  resource; D11 adds `schedule_items` with `department_id`, `assignee_id`, and
  `employee_write_scope` (`none|assignee|department`) and a schedule policy that
  consults it. Schedule read is a shared/global module; write is department-scoped.
- **Reference:** existing controller pattern — context module + `action_fallback
  RockcutApiWeb.FallbackController` + `%{data: ...}` JSON (see
  `ingredient_controller.ex`).
