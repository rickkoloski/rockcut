# D10: Users, Departments & Tiered Authorization — Specification

**Status:** Approved (2026-09-20)
**Created:** 2026-09-20
**Author:** Matt + CC
**Depends On:** D4 (Auth — this deliverable **replaces** the EnvAuth single-admin model)

---

## 1. Problem Statement

Rockcut has no real user system. Authentication is a single admin configured
via `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` environment variables (`EnvAuth`); in
dev any credentials are accepted. The bearer token is a signed **email string**,
`current_user` is that string everywhere, and there is **no authorization** —
all 13 resources sit behind one flat `:authenticated` pipeline, so anyone logged
in can do everything.

The company runs in four parts — **Brewery, Bar, Office, Sales** — with different
people who should only reach the parts of the system relevant to them, at
different levels of authority. D10 builds the identity and authorization
foundation to support this:

- **Owners** see all four departments and can assign any role to any user.
- **Managers** are scoped to a department and manage the users within it.
- **Employees** are scoped to a department with limited authority.
- A user may belong to **multiple departments**, and may be a **manager in one
  and an employee in another**.

D10 is the foundation that later feature modules (starting with **D11 —
Scheduling**) build their permission checks on. It is deliberately built ahead
of most department-specific features so the permission model is in place before
those features calcify.

---

## 2. Requirements

### Functional

**Identity & data model**
- [ ] `users` table: `email` (unique), `password_hash` (Argon2), `name`,
      `active` (bool, default true), `is_owner` (bool, default false),
      `must_reset_password` (bool, default false), timestamps.
- [ ] `departments` table (a table, not a hardcoded enum), seeded with
      **Brewery, Bar, Office, Sales** (`name`, `key`).
- [ ] `memberships` table: `user_id`, `department_id`, `role`
      (enum: `manager | employee`), `unique(user_id, department_id)`, timestamps.
- [ ] Seed migration promotes the existing admin (`matt@rockcut.com`) to a
      real `users` row with `is_owner = true` and the current password hash.

**Authentication (replaces EnvAuth)**
- [ ] Login validates email + password against the `users` table (Argon2),
      constant-time on miss; rejects `active = false` users.
- [ ] Token payload changes from `email` → `user_id`. Existing tokens are
      invalidated (acceptable).
- [ ] `AuthPlug` loads the full `%User{}` (memberships preloaded), re-checks
      `active` on every request (soft revocation — deactivating a user kills
      their sessions), and assigns `:current_user` as the struct.
- [ ] Dev fallback is a **seeded dev owner** (deterministic dev email/password
      created by seeds), replacing EnvAuth's "accept any credentials." No
      accept-any path in any environment.

**Authorization**
- [ ] `Rockcut.Authz` module — single source of truth — with:
  - `owner?(user)`
  - `role_in(user, department)` → `:owner | :manager | :employee | nil`
  - `member_of?(user, department)`
  - `can_manage_users_in?(user, department)` → owner, or manager of that dept
  - `can?(user, action, resource)` — **action-aware** (verb-level), and takes
    the resource so per-item policy (e.g. D11's `employee_write_scope`) can be
    consulted. Actions are verbs: `:read`, `:create`, `:update`, `:delete`,
    `:assign`, plus resource-specific verbs later.
- [ ] Policy is **defined in code** per resource (Bodyguard-style or a plain
      policy module), not a DB-editable permission matrix.
- [ ] **Module-access gate**: a plug/registry mapping route scopes to the
      department/module that grants them. Modules are of two kinds:
  - *department-scoped* (e.g. the existing brewing screens ≈ the **Brewery**
    module) — require membership (any role) in that department; owner bypasses.
  - *shared/global* (e.g. D11 schedule read) — any authenticated user.
- [ ] Existing 13 brewing resource routes are gated behind **Brewery**
      membership (owner bypass). Fine-grained verb policy for brewing CRUD is
      **not** in D10 scope (both manager and employee may write brewing data
      for now); partial-write nuance is a D11 concern.

**User & role management API**
- [ ] `GET /api/me` → current user + memberships + computed capabilities
      (which departments/modules, and role per department) so the UI can render
      the correct nav. UI is advisory only; the API always enforces.
- [ ] `GET /api/departments` → the four departments.
- [ ] `GET /api/users` — owner: all users; manager: users who are members of a
      department the caller manages.
- [ ] `POST /api/users` — create a user with an initial (temp) password and
      `must_reset_password = true`. **Owners** may create any user; **managers**
      may create users but only with roles in a department they manage.
- [ ] `PATCH /api/users/:id` — update profile / `active`.
- [ ] Membership management is a **declarative set**: `PUT /api/users/:id/memberships`
      accepts the full desired list of `{department, role}`; the server diffs it
      against current state, enforces the escalation guards on the diff, and
      records the diff to `audit_log`.
- [ ] `POST /api/users/:id/reset_password` (admin-set temp) and
      `POST /api/session/password` (self change-password).

**Privilege-escalation guards / invariants** (all enforced server-side)
- [ ] A manager may only grant/modify roles **within a department they manage**,
      may only assign `:manager | :employee` (never owner), and may not act on
      other departments' memberships.
- [ ] No self-escalation (a user cannot grant themselves a higher role).
- [ ] At least **one owner must always exist** — the last owner cannot be
      demoted, deactivated, or deleted.
- [ ] Only owners may set/clear `is_owner`.

**Audit & owner notification**
- [ ] `audit_log` of sensitive changes (membership/role grants & revocations,
      owner flag changes, user activation/deactivation, **user creation**):
      actor, target, action, before/after, timestamp.
- [ ] **Owner visibility into manager-created users:** when a manager creates a
      user, owners are notified. D10 delivers this **in-app** — an owner-facing
      "recent user activity" feed derived from `audit_log`, plus an unread flag
      on `GET /api/me` (e.g. `capabilities.pending_owner_reviews`). Real-time
      email/push delivery is out of scope (future — depends on a notification
      subsystem).

### Non-Functional

- [ ] **Security:** Argon2 hashing; constant-time credential check;
      **roles are never embedded in the token** (looked up per request so
      changes take effect immediately); `active` checked per request.
- [ ] **No lock-out:** a bootstrap path guarantees a working owner login after
      the EnvAuth cutover (seed from existing Fly secrets).
- [ ] **Enforcement is server-side.** The client filters UI for convenience
      only and is never trusted.
- [ ] **Tests:** ExUnit coverage for authz decisions, escalation guards, the
      last-owner invariant, and route gating.

---

## 3. Design

### Approach

Role is modeled **per-(user, department)** via a `memberships` junction — this
single decision captures every nuance: multi-department membership is multiple
rows; "manager here, employee there" is two rows with different `role`. **Owner**
is a global flag (`users.is_owner`) rather than a role value, because it spans
all departments while `manager`/`employee` are department-scoped; mixing them in
one enum is awkward. Owner access short-circuits every check.

Scoping follows **Path A (module/feature-based)**: a department unlocks a set of
screens/modules. The existing brewing app is effectively the Brewery module;
Bar/Office/Sales modules arrive later. Row-level department tagging (a sliver of
Path B) is introduced only where a resource is genuinely shared — first in D11's
schedule items.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `User`, `Department`, `Membership` schemas | `lib/rockcut_api/accounts/` | Identity + role data |
| `Accounts` context | `lib/rockcut_api/accounts.ex` | User/membership CRUD + invariants |
| `Rockcut.Authz` | `lib/rockcut_api/authz.ex` | Central authorization decisions (`can?/3`, helpers) |
| Resource policies | `lib/rockcut_api/authz/policies/` | Per-resource verb→role rules (code) |
| `AuthPlug` (revised) | `lib/rockcut_api_web/plugs/auth_plug.ex` | Loads `%User{}`, checks `active`, assigns `:current_user` |
| `ModuleAccessPlug` | `lib/rockcut_api_web/plugs/module_access_plug.ex` | Gates route scopes by department/module |
| `SessionController` (revised) | `.../controllers/session_controller.ex` | Real login, `user_id` token, password change |
| `UserController` / `MembershipController` | `.../controllers/` | User & role management API |
| `MeController` | `.../controllers/me_controller.ex` | `GET /api/me` capabilities payload |

### Data Model

```
users
  id            :id
  email         :string   (unique, case-insensitive)
  name          :string
  password_hash :string   (Argon2)
  active        :boolean  (default true)
  is_owner      :boolean  (default false)   # global tier
  must_reset_password :boolean (default false)
  timestamps

departments                                  # seed: Brewery, Bar, Office, Sales
  id   :id
  name :string
  key  :string  (unique slug)

memberships
  id            :id
  user_id       -> users
  department_id -> departments
  role          :string  (enum: "manager" | "employee")
  unique(user_id, department_id)
  timestamps

audit_log
  id          :id
  actor_id    -> users
  target_id   -> users (nullable)
  action      :string
  detail      :map (before/after)
  inserted_at
```

### Authorization matrix (D10)

Owner short-circuits to `true` for everything. Department-scoped decisions:

| Capability | Owner | Manager (of dept) | Employee (of dept) | Non-member |
|---|:--:|:--:|:--:|:--:|
| Access dept module | ✓ | ✓ | ✓ | ✗ |
| Read dept data | ✓ | ✓ | ✓ | ✗ |
| Write dept data (brewing, D10) | ✓ | ✓ | ✓ | ✗ |
| Manage users in dept | ✓ | ✓ | ✗ | ✗ |
| Assign `manager`/`employee` in dept | ✓ | ✓ | ✗ | ✗ |
| Grant/revoke `is_owner` | ✓ | ✗ | ✗ | ✗ |
| Manage users in *other* dept | ✓ | ✗ | ✗ | ✗ |

> Verb-level *partial* write (e.g. employee may `complete`/`reschedule` but not
> `create`/`delete`) is defined by later modules via `can?(user, verb, resource)`;
> D11 (Scheduling) is the first consumer.

### API

```
# Session
POST   /api/session                # login -> { token (user_id), user }
GET    /api/session                # current user (existing)
DELETE /api/session
POST   /api/session/password       # self change-password

# Me / departments
GET    /api/me                     # user + memberships + capabilities
GET    /api/departments

# User & role management  (owner: global; manager: own dept only)
GET    /api/users
POST   /api/users                  # create + temp password (must_reset); manager -> own-dept roles only
PATCH  /api/users/:id              # profile / active
POST   /api/users/:id/reset_password
PUT    /api/users/:id/memberships  # declarative set of {department, role}; server diffs + guards + audits

# Owner activity feed (in-app notification of manager actions)
GET    /api/owner/activity         # recent audit_log events (owner only)
```

`GET /api/me` response (shape):
```json
{
  "user": { "id": 1, "email": "matt@rockcut.com", "name": "Matt", "is_owner": true },
  "memberships": [
    { "department": "Brewery", "role": "manager" },
    { "department": "Sales",   "role": "employee" }
  ],
  "capabilities": {
    "modules": ["brewery", "bar", "office", "sales", "schedule"],
    "manages_departments": ["brewery"]
  }
}
```

### Frontend (high level — detailed in planning)

- Login flow unchanged; on success store token, call `GET /api/me`.
- Nav/menu filtered by `capabilities.modules`; a **User Management** screen
  visible to owners (all users) and managers (their department's users), with
  role assignment respecting the same guards the API enforces.
- Forced-reset interstitial when `must_reset_password` is true.

This is a large, cross-cutting deliverable; **planning may phase it** (backend
foundation → user-management API → frontend) while keeping a single D10 ID.

---

## 4. Success Criteria

- [ ] Migrations create `users`, `departments` (4 seeded), `memberships`,
      `audit_log`; `matt@rockcut.com` seeded as an active owner able to log in.
- [ ] Login authenticates against `users` (Argon2); wrong password and inactive
      users are rejected; token carries `user_id`.
- [ ] `AuthPlug` loads the user, rejects deactivated users mid-session.
- [ ] `Authz.can?/3` and helpers return correct decisions for owner / manager /
      employee / non-member across the matrix above (unit tests).
- [ ] Non-Brewery, non-owner users receive 403 on brewing resource routes;
      Brewery members and owners succeed.
- [ ] A Brewery manager can create a user and assign Brewery roles, **cannot**
      grant owner, **cannot** touch Sales memberships (403 / rejected).
- [ ] The last owner cannot be demoted, deactivated, or deleted.
- [ ] `GET /api/me` returns memberships + capabilities matching the user's roles.
- [ ] Sensitive changes appear in `audit_log`.
- [ ] ExUnit tests cover the above; existing brewing tests still pass.

---

## 5. Out of Scope

- **Scheduling module (D11)** — schedule/task tables, cross-department read,
  department-scoped write, and the `employee_write_scope`
  (`none | assignee | department`) field. D10 only ensures `can?/3` accepts the
  resource so D11 can consult it.
- **Fine-grained partial-write policies for brewing resources** — brewing
  write stays role-agnostic-within-department in D10.
- **Real email invitations / SMTP** — D10 uses admin-set temp passwords +
  `must_reset_password` instead.
- **Bar / Office / Sales feature modules themselves** — only their access gates
  exist; the screens are later deliverables.
- **DB-editable / custom permission matrices** — policy stays in code.
- **SSO / OAuth / MFA** — future.

---

## 6. Resolved Decisions

All D10 open questions are resolved (2026-09-20):

1. **Dev auth fallback** → **seeded dev owner**; no accept-any path in any env.
2. **Membership editing** → **declarative set** (`PUT .../memberships`), diffed
   server-side for guard enforcement + audit.
3. **Manager user creation** → **yes**, managers may create users, but only with
   roles in a department they manage. Owners are notified in-app of
   manager-created users (email/push delivery deferred to a future notification
   subsystem).
4. **Frontend phasing** → **phased**: backend + `GET /api/me` first, then the
   User Management UI, under a single D10 ID.
5. **Email case-sensitivity** → **`COLLATE NOCASE` unique index** on `email`.

## 7. Open Questions

- [ ] None blocking. (Notification *delivery* mechanism beyond in-app is a
      future deliverable, noted in scope.)
```