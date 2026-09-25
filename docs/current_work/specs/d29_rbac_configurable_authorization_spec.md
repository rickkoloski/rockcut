# Configurable RBAC — Role Definitions with Capability Levels

**Status:** Planning / backlog (not yet scheduled).
**Deliverables:** candidate D29–D34 (phased; see below).
**Backlog:** PortableMind Product Backlog project 254 — epic task 3847, phase
tasks 3848–3853.
**Context:** requested by Rick + Matt, PortableMind discussion 80
(BrewManagementApp), 2026-09-25.

## Goal

Let Matt **define roles** and, per role, **enable/disable capabilities at a
level — read / edit / manage / full — across resource areas ("modules")**,
rather than the current fixed owner/manager/employee scheme.

## Current-state findings (code scan, rockcut_api, 2026-09-25)

Authorization today is a fixed 3-tier, **hardcoded** scheme, but it already
funnels through two clean seams that make an incremental refactor possible.

### The two seams (keep these stable)

- **`RockcutApi.Authz.can?/3`** (`lib/rockcut_api/authz.ex`) — the single server
  enforcement point. Already **verb-based**: actions are atoms
  (`:read`, `:create`, `:update`, `:assign`, `:delete`, `:publish`,
  `:unpublish`, `:claim`). Controllers call it per-action
  (`shift_controller`, `position_controller`, etc.).
- **`RockcutApi.Accounts.capabilities/1`** (`lib/rockcut_api/accounts.ex:274`) —
  projects a capability map (`modules`, `manages_departments`,
  `can_manage_users`, …) to the client via `/api/me` (`MeController`). The
  frontend (`rockcut-ui`: `hooks/useAuth.ts`, `App.tsx`, `pages/Home.tsx`) gates
  nav/routes off `user.is_owner` + that map.

### What's hardcoded / closed (the gap)

- **Roles are a closed set, in two places:**
  - Global superuser: `users.is_owner` boolean (`accounts/user.ex`) — when true,
    `Authz.can?` returns `true` for everything (`authz.ex:102`).
  - Per-department: `memberships.role ∈ {"manager","employee"}`, enforced by
    `@roles ~w(manager employee)` + `validate_inclusion` in
    `accounts/membership.ex` and by `case` branches inside `Authz.role_in/2`.
- **Policy is code, not data.** `Authz.can?/3` pattern-matches on the resource
  struct type (`%Shift{}`, `%Position{}`, `RockcutApi.Brewing.*`) and the verb,
  with department-scoped rules baked into function clauses. There is **no roles
  table, no capability rows, and no read/edit/manage/full ladder**.
- **"Modules" are conflated with department keys.**
  `RockcutApiWeb.ModuleAccessPlug` gates a route scope by department membership
  (`module: :brewery`) or `shared: true`. Only `:brewery` is gated today; the
  scheduling scope is `shared`.

### Verdict

The **seams are the right shape — do not rewrite.** A refactor *is* required to
move policy from code → data and open the role set. Because `can?/3` and
`capabilities/1` are stable APIs, we evolve what sits *behind* them one layer at
a time, defaulting to today's behavior until role data is populated. The server
`Authz.can?` remains the single security boundary throughout; gating never moves
to the client.

## Incremental plan

Ordered; each phase is independently shippable. **Phases 1–2 are
behavior-preserving refactors** (safe to land anytime, fully reversible);
**Phases 3–5 add and expose** the new capability.

### Phase 0 — Define the capability model (spec, no code) · ~D29 · task 3848

Pure design. Produce the authz capability **matrix** expressing *today's*
behavior in the new vocabulary — it is both the target spec and the Phase-2 seed
data. Decide/document:

- **(a) Level ladder:** `none ⊂ read ⊂ edit ⊂ manage ⊂ full` (each includes the
  ones below).
- **(b) Module set**, decoupled from department rows. Candidates: scheduling
  (shifts), positions, schedule-templates, brewery/brewing, users, departments,
  memberships, messaging, time-off, availability, calendar-feeds,
  owner-activity/audit.
- **(c) verb → (module, required_level)** classification for every enforced
  action: the `Authz.can?` branches (Shift, Position, Brewing.*) plus controller
  checks (`can_manage_any?`, `owner?`, `Accounts.can_manage_user?`).
- **(d) Role scope decision:** are roles global, per-department, or both? The
  current model is department-scoped via memberships + a global owner. This
  choice drives the Phase-2 schema.

### Phase 1 — Level-based resolver behind the existing API (hardcoded) · ~D30 · task 3849

Behavior-preserving refactor; no schema change.

- Introduce `Authz.level_for(user, module, dept) :: :none|:read|:edit|:manage|:full`
  computing the effective level from *today's* roles (owner = full everywhere;
  manager = manage in managed depts; employee = read/edit per current rules).
- Rewrite `Authz.can?/3` **internals** to map resource+action → (module,
  required_level) then compare against `level_for`. Public signature unchanged,
  so all controller call-sites keep working.
- Extend `Accounts.capabilities/1` to **also** emit the (module → level) matrix
  as an additive field on `/api/me`; keep existing fields so the UI doesn't
  break.
- Tests: existing authz/controller suites + new `level_for` parity tests.

### Phase 2 — Roles as data (schema), seeded to match today · ~D31 · task 3850

Data-driven, identical behavior; system roles locked.

- Migrations: `roles` (id, name, `system` boolean, description) +
  `role_capabilities` (role_id, module, level, `enabled` boolean).
- Seed 3 **system** roles (owner/manager/employee) with exactly the Phase-0
  matrix; `system: true` → not editable/deletable.
- Point `level_for` at `role_capabilities`, resolving role from `is_owner` +
  `memberships.role`, **falling back** to the Phase-1 hardcoded defaults if a
  row is missing (defense-in-depth during rollout).
- No change to `memberships.role`/`is_owner`; no API/UI change.

### Phase 3 — Custom roles + assignment (the actual new capability) · ~D32 · task 3851

Additive; existing roles unaffected. **This is where Matt gets the feature.**

- Let Matt create/edit non-system roles and toggle each (module × level)
  capability (enable/disable).
- Add `memberships.role_id` FK; keep the string `role` as a denormalized
  back-compat mirror during transition. Allow assigning any role.
- Owner-gated admin API: role CRUD, capability toggles, assignment.
- Guardrails: cannot demote/deactivate the **last owner**; system roles
  immutable; validate `level ∈ ladder` and `module ∈ known set`; assignment
  never escalates a manager beyond their department scope (per the Phase-0
  scope decision).

### Phase 4 — Admin UI (role editor + assignment) · ~D33 · task 3852

Presentation only — the backend already enforces (Phases 1–3).

- Role-definitions editor: a matrix of modules × {read, edit, manage, full}
  toggles per role; create/rename custom roles.
- Assign roles in User Management.
- Refactor frontend gating (`useAuth.ts`, `App.tsx`, `Home.tsx`, `WeekGrid`
  props) to read the (module → level) map from `/api/me` capabilities instead
  of special-casing `is_owner` / `manages_departments`.
- Open the UI `Role` type (currently the closed union `'manager' | 'employee'`
  in `src/lib/types.ts`).

### Phase 5 — Cleanup / decommission legacy paths (optional, last) · ~D34 · task 3853

Do only after 1–4 are stable in prod.

- Drop the Phase-1 hardcoded fallbacks once role data is authoritative.
- Remove the denormalized `memberships.role` string; use `role_id` only.
- Optionally model owner as a locked system role and retire the `is_owner`
  special-case (or keep `is_owner` as the flag backing that system role).
- Tighten `ModuleAccessPlug` to consult module capability **levels** rather than
  raw department membership, so route-scope gating and per-action `can?` share
  one source of truth.

## Risk & sequencing notes

- Phases 1–2 change *no observable behavior*; they can be merged independently
  and de-risk everything after them by proving the new resolver matches the old.
- The security boundary stays server-side (`Authz.can?`) at every phase; UI
  gating is UX convenience.
- Back-compat mirror (`memberships.role` string) is retained until Phase 5 so no
  reader breaks mid-migration.
