# Configurable RBAC — Roadmap

**Status:** Roadmap (not a deliverable). Phase 0 = **D29** (complete,
`specs/d29_rbac_capability_model_spec.md`); Phase 1 = **D31** (D30 is the DEV
server + synthetic test accounts, which the role work will test against). Later phases get a
deliverable ID when each is actually specified — IDs are sequential and never
reused, so none are reserved here.
**Created:** 2026-09-25 (peer session `src-de`); **revised** 2026-09-26 after
code review.
**Backlog:** PortableMind Product Backlog project 254 — epic 3847; phase tasks
3848–3853 (see mapping below).
**Context:** requested by Rick + Matt, PortableMind discussion 80
(BrewManagementApp), 2026-09-25.

## Goal

Let Matt **define roles** and, per role, grant **capabilities at a level across
resource areas ("modules")**, instead of the fixed owner / manager / employee
scheme.

## Where we actually are (code review, 2026-09-26)

The original draft assumed `Authz.can?/3` is the single server enforcement point.
**It isn't.** Only `shift_controller` and `position_controller` call it. The
remaining ~50 authorization decisions are spread over ~15 files and read the
role model directly (`is_owner`, `memberships.role`, `Authz.role_in/2`,
`can_manage_any?/1`, `managed_department_ids/1`):

- **Contexts:** `time_off.ex`, `availability.ex`, `messaging.ex`,
  `calendar_feeds.ex`, `scheduling.ex` (list visibility), `accounts.ex` (user
  listing, membership authority, owner-flag guard, capabilities).
- **Controllers:** users, memberships, roster, schedule templates, shift
  templates, departments, owner activity.
- **Brewing:** the `can?/3` Brewing clause has **no callers** — Brewing is gated
  only by `ModuleAccessPlug` (`module: :brewery`).
- **Role-driven behavior that isn't an access check:** messaging's Managers
  channel and notification recipients (`messaging.ex:152-157`) select users by
  `m.role == "manager"` / `is_owner`.
- **Scoped list queries**, not yes/no checks: `Scheduling.restrict_visibility`,
  `TimeOff.list_for`, `Availability.list_for`, `Accounts.list_users_for` filter
  rows to the actor's managed departments.
- **Frontend:** `App.tsx`, `Home.tsx`, `Schedule.tsx`, `TimeOff.tsx`,
  `Availability.tsx`, `UserManagement.tsx`, `UserFormDialog.tsx` gate on
  `is_owner` / `manages_departments` / `can_manage_users` from `/api/me`.

Consequence: swapping `can?/3` internals (the old Phase 1) would move only
shifts and positions onto roles-as-data. **Consolidation must come before
roles-as-data.** The seams (`can?/3`, `capabilities/1`) are still the right
shape to keep; they just need to become the *only* path.

## Phases

Each phase is independently shippable. Phases 1–3 change **no observable
behavior**, except the one decided change in Phase 2 (D29 §6 C: managers
limited to their own departments), which lands as its own reviewed step.

| # | Phase | Deliverable | Backlog |
|---|-------|-------------|---------|
| 0 | **Capability model** — decision inventory, vocabulary (modules × levels × scope), today-as-matrix, owner-only actions, list-scoping and role-derived-behavior rules | **D29** ✔ complete 2026-09-26 | 3848 |
| 1 | **Consolidate** — route every decision through `Authz` with parity tests; no behavior change | **D31** | 3887 |
| 2 | **Level resolver** — `Authz` internals evaluate the D29 matrix (hardcoded); additive `/api/me` field | later | 3849 |
| 3 | **Roles as data** — `roles` + `role_capabilities`, system roles seeded from the matrix, hardcoded fallback | later | 3850 |
| 4 | **Custom roles + assignment** — owner-gated role CRUD, `memberships.role_id`, guardrails | later | 3851 |
| 5 | **Admin UI** — role matrix editor, assignment, frontend gating off the capability map | later | 3852 |
| 6 | **Cleanup** — drop fallbacks + `memberships.role` string, `ModuleAccessPlug` reads levels | later | 3853 |

### Phase 0 — Capability model (D29)

Design only; see the D29 spec. Its outputs are the contract for every later
phase: the full decision inventory, the vocabulary, the matrix that reproduces
today exactly, the owner-only set, and decisions on list scoping and
role-derived behavior.

### Phase 1 — Consolidate behind `Authz`

- Add parity tests **first** for each inventoried decision that lacks one
  (time off, availability, messaging, calendar feeds, user/membership admin,
  templates, roster, owner activity, list visibility). Existing
  `authz_test.exs` / `authz_scheduling_test.exs` cover shifts/positions only.
- Replace direct role reads in contexts/controllers with `Authz` calls: `can?/3`
  for item decisions, plus a scoped-query helper for lists (e.g.
  `Authz.scope(user, module, level)` → `:all | {:departments, ids} | {:own, user_id} | :none`),
  per the D29 design.
- Wire Brewing controllers through `can?/3` (or document that the plug alone is
  the intended gate).
- Merge the duplicate `can_manage_user?` (`Authz` by id, `Accounts` by struct).
- Exit check: nothing outside `Authz` (and `capabilities/1`) reads `is_owner` or
  `memberships.role` for an access decision — enforce with a grep in CI or a
  test.

### Phase 2 — Level resolver (hardcoded)

`Authz` internals evaluate (module, level, scope) against the D29 matrix,
computed from today's roles. Public API unchanged. **Includes the one deliberate
behavior change (D29 §6 C):** managers limited to their own departments for
positions, templates and user creation; roster reorder owner-only. `capabilities/1` adds the
module → level/scope map to `/api/me` alongside existing fields.

### Phase 3 — Roles as data

`roles` (name, `system`, `counts_as_manager`, description) + `role_capabilities` (role, module,
level, scope). Seed the system roles to exactly the D29 matrix; system roles
are immutable. Resolver reads rows, falling back to the Phase-2 defaults if a
row is missing.

### Phase 4 — Custom roles + assignment

Owner-gated role CRUD and capability editing; `memberships.role_id` FK with the
string `role` kept as a mirror. Guardrails: last-owner protection; system roles
immutable; validate module/level/scope against the known sets; **owner-only
actions can never be granted by a role** (D29 defines the set); assignment
never exceeds the assigner's own scope. Role-derived behavior (Managers
channel, notification recipients) follows the D29 decision.

### Phase 5 — Admin UI

Role-definition matrix editor; role assignment in User Management; frontend
gating reads the capability map instead of `is_owner` / `manages_departments`;
open the UI `Role` type (`src/lib/types.ts`).

### Phase 6 — Cleanup (only after 1–5 are stable in prod)

Drop hardcoded fallbacks and the `memberships.role` string; decide whether
owner becomes a locked system role or stays the `is_owner` flag;
`ModuleAccessPlug` consults module levels so route gating and `can?` share one
source of truth.

## Risk & sequencing

- The server (`Authz`) stays the only security boundary; UI gating is
  convenience.
- Phase 1 is the largest and riskiest step (≈15 files); its parity tests are
  what make Phases 2–3 provably behavior-preserving (apart from the
  deliberate D29 §6 C change, whose tests are flipped explicitly).
- Changes to permissions take effect per request (the user and memberships load
  on each authenticated request); the UI's cached `/api/me` may lag until
  refetch — acceptable, since the server enforces.
