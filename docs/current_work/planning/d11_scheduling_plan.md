# D11: Staff Scheduling — Implementation Instructions

**Spec:** `d11_scheduling_spec.md`
**Created:** 2026-09-20

---

## Overview

Build the staff shift-scheduling core on top of D10's authorization. Two phases
under one D11 id, each independently committable:

- **Phase 1 — Backend**: `positions` (company-wide) + `shifts` schemas, a
  `Scheduling` context, `Authz` policies (shift verbs incl. draft visibility,
  claim, publish; position management), controllers/routes, `"schedule"` module
  capability, seed, and ExUnit tests.
- **Phase 2 — Frontend**: agenda Schedule screen (all departments), shift
  create/edit dialog with publish, open-shift claim, positions management, and
  the Schedule nav for all users.

Do not start Phase 2 until Phase 1 tests pass. Commit at the phase boundary.

---

## Prerequisites

- [ ] D10 merged/committed on `practice1` (Accounts, Authz, users/departments).
- [ ] `rockcut_api` compiles; `mix test` green.

---

## PHASE 1 — Backend

### Step 1.1: Migrations

**Files:** `priv/repo/migrations/<ts>_create_positions.exs`, `_create_shifts.exs`

- `positions`: `name:string null:false`, `group:string`,
  `active:boolean null:false default: true`, timestamps.
  `create unique_index(:positions, [:name])`.
- `shifts`:
  - `department_id references(:departments, on_delete: :restrict) null:false`
  - `position_id references(:positions, on_delete: :restrict) null:false`
  - `assignee_id references(:users, on_delete: :nilify_all)`
  - `created_by_id references(:users, on_delete: :nilify_all)`
  - `starts_at :utc_datetime null:false`, `ends_at :utc_datetime null:false`
  - `status :string null:false default: "draft"`
  - `notes :text`
  - timestamps; `index` on department_id, assignee_id, starts_at, status.

### Step 1.2: Schemas + Scheduling context

**Files:** `lib/rockcut_api/scheduling/{position,shift}.ex`,
`lib/rockcut_api/scheduling.ex`

- `Scheduling.Position`: fields; `changeset/2` validates `name` required +
  `unique_constraint(:name)`; `group` optional; `active` default true.
- `Scheduling.Shift`: `belongs_to :department/:position/:assignee/:created_by`;
  `status` inclusion `~w(draft published)`; `changeset/2` validates required
  (department_id, position_id, starts_at, ends_at, status) and `ends_at >
  starts_at` (a custom validator comparing the two datetimes);
  `foreign_key_constraint`s.
- `Scheduling` context:
  - Positions: `list_positions/1` (filter group/active), `get_position!/1`,
    `create_position/1`, `update_position/2`, `deactivate_or_delete_position/1`
    (soft-deactivate if referenced by any shift, else delete).
  - Shifts: `get_shift/1`/`get_shift!/1` (preload department, position,
    assignee), `list_shifts/2` (`user`, filters) with **draft visibility**
    baked into the query, `create_shift/2` (attrs, actor → sets created_by,
    status draft), `update_shift/2`, `delete_shift/1`, `publish_shift/1`,
    `claim_shift/2` (shift, user → set assignee_id=user.id when still open &
    published).
  - `list_shifts/2` visibility: owner → all; else
    `where(status == "published" or department_id in ^managed_ids)`.

### Step 1.3: Authz policies

**File:** `lib/rockcut_api/authz.ex` (extend `can?/3`)

Add clauses **before** the generic `%mod{}` Brewing clause:

```elixir
def can?(%User{is_owner: true}, _action, _resource), do: true

def can?(%User{} = user, action, %Scheduling.Shift{} = shift) do
  manager? = role_in(user, shift.department_id) == :manager
  case action do
    :read -> shift.status == "published" or manager?
    a when a in [:create, :update, :assign, :delete, :publish] -> manager?
    :claim -> shift.status == "published" and is_nil(shift.assignee_id) and member_of?(user, shift.department_id)
    _ -> false
  end
end

def can?(%User{} = user, action, %Scheduling.Position{}) do
  case action do
    :read -> true
    a when a in [:create, :update, :delete] -> can_manage_any?(user)
    _ -> false
  end
end

# … existing Brewing %mod{} clause, then default false
```

Alias `RockcutApi.Scheduling.{Shift, Position}` in `authz.ex`.

### Step 1.4: "schedule" capability

**File:** `lib/rockcut_api/accounts.ex` (`capabilities/1`)

- Append `"schedule"` to `modules` for **both** the owner and non-owner clauses
  (shared module available to everyone).

### Step 1.5: JSON views

**File:** `lib/rockcut_api_web/controllers/json_helpers.ex`

- `position/1` → `%{id, name, group, active}`.
- `shift/1` → `%{id, department_id, department(maybe), position_id,
  position(maybe), assignee_id, assignee(maybe audit_actor-style), starts_at,
  ends_at, status, notes, inserted_at, updated_at}`. Reuse `department/1`;
  render assignee as `%{id, email, name}` (add a small `user_summary/1` or reuse
  `audit_actor` shape).
  - **Do not run repo-wide `mix format`** — format only touched files
    ([[rockcut-mix-format-churn]]).

### Step 1.6: Controllers

**Files:** `lib/rockcut_api_web/controllers/{position,shift}_controller.ex`

- Follow D10 controller style (`action_fallback FallbackController`,
  `%{data: ...}`, `Authz`-gated per action, `forbidden/1` helper).
- `PositionController`: index (any auth), create/update/delete (guard
  `Authz.can_manage_any?`), delete = soft via context.
- `ShiftController`:
  - `index` — `Scheduling.list_shifts(current_user, params)` (visibility in
    context); parse filters.
  - `show` — load, `Authz.can?(user, :read, shift)` else 404/403.
  - `create` — build attrs, require `Authz.can?(user, :create, %Shift{department_id: dept})`
    (construct a bare struct to authorize the target department) then
    `create_shift`.
  - `update`/`delete` — load, `can?(:update|:delete)`.
  - `publish` — load, `can?(:publish)`, `publish_shift`.
  - `claim` — load, `can?(:claim)`, `claim_shift(shift, user)`; if no longer open
    → 409/422.

### Step 1.7: Routes

**File:** `router.ex` — in the **authenticated** scope (shared read; writes
authorized in controllers, NOT behind the `:brewery` gate):

```elixir
resources "/positions", PositionController, only: [:index, :create, :update, :delete]
get    "/shifts", ShiftController, :index
get    "/shifts/:id", ShiftController, :show
post   "/shifts", ShiftController, :create
patch  "/shifts/:id", ShiftController, :update
delete "/shifts/:id", ShiftController, :delete
post   "/shifts/:id/publish", ShiftController, :publish
post   "/shifts/:id/claim", ShiftController, :claim
```

### Step 1.8: Seed

**File:** `priv/repo/seeds.exs` (append, idempotent)

- Insert the 10 starter positions (name + group) if absent (guard by name).
- Optionally a few sample published shifts across departments for dev (guard so
  they aren't duplicated on re-seed; e.g. only when `Repo.aggregate(Shift, :count) == 0`).

### Step 1.9: Tests

**Files:** `test/rockcut_api/scheduling_test.exs`,
`test/rockcut_api/authz_scheduling_test.exs`,
`test/rockcut_api_web/controllers/{position,shift}_controller_test.exs`

- Authz matrix for shifts (read published/draft by owner/manager/employee/other;
  create/publish manager-only; claim rules incl. already-assigned and wrong
  department).
- Position management (manager/owner can; employee cannot; read is open).
- `list_shifts` visibility (employee doesn't see other-department drafts).
- Controller: filters, publish, claim happy + forbidden paths; `ends_at >
  starts_at` rejected.

**Commit Phase 1:** `feat: D11 phase 1 — shifts & positions backend (scheduling core)`

---

## PHASE 2 — Frontend

### Step 2.1: Types

**File:** `rockcut-ui/src/lib/types.ts` — `Position`, `Shift` (with nested
`department`, `position`, `assignee`), `ShiftStatus`.

### Step 2.2: Local-time helpers

**File:** `rockcut-ui/src/lib/datetime.ts`

- Format a UTC ISO string in `America/Denver` via
  `Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', … })`; helpers for
  day grouping and `<input type="datetime-local">` ↔ UTC conversion.

### Step 2.3: Schedule agenda page

**Files:** `rockcut-ui/src/pages/schedule/Schedule.tsx`, `ShiftFormDialog.tsx`,
`PositionsDialog.tsx`

- `Schedule`: `useApiQuery` shifts (with filters) + positions + departments +
  users (for assignee pickers — reuse `/api/users` when manager, else skip).
  Group published shifts by local day; row shows department chip, position,
  assignee or "Open", local time range, status badge. Filters: department, date
  range, position, My shifts, Open shifts. "Add shift" for managers; "Manage
  positions" for managers.
- `ShiftFormDialog` (manager+): department (managed set) → position (grouped by
  `group`) → assignee (users in dept, or Open) → starts/ends (`datetime-local`)
  → notes. Save = POST/PATCH; **Publish** button (POST `/publish`) on drafts.
- Employee **Claim** button on eligible open shifts (POST `/claim`), own shifts
  highlighted.
- `PositionsDialog` (manager+): list grouped; add/rename/deactivate.

### Step 2.4: Nav + route

**File:** `rockcut-ui/src/App.tsx`

- Add a **Schedule** nav item for all users (modules includes `"schedule"`),
  calendar icon; route `/schedule`. Place it near the top (before brewing items
  or right after Home).

### Step 2.5: Verify

- `vite build` + ESLint/type-clean on new files (note: `tsc -b` pre-existingly
  broken by datagrid-extended — see D10 result).
- Manual: owner creates + publishes a Bar shift; a Bar employee sees it, claims
  an open one; a Sales employee sees published shifts but no Bar drafts and
  cannot claim Bar shifts.

**Commit Phase 2:** `feat: D11 phase 2 — schedule agenda UI, shift dialog, claim/publish`

---

## Testing

### Automated
- [ ] `mix test` green (new suites + existing unaffected).
- [ ] `vite build` passes; new UI files lint/type-clean.

### Manual (end-to-end)
1. `mix ecto.reset` → positions seeded, sample shifts present.
2. Owner: create a draft Bar shift, assign a position, publish it.
3. Bar employee: sees the published shift; claims an open Bar shift.
4. Sales employee: sees published shifts across departments but no Bar **drafts**;
   claiming a Bar shift → 403.

---

## Verification Checklist

- [ ] Phases 1–2 complete; committed at the boundary.
- [ ] Draft visibility + claim + publish enforced server-side and covered by tests.
- [ ] `"schedule"` in `/api/me`; Schedule nav shows for all; per-role controls correct.
- [ ] Times stored UTC, displayed America/Denver.
- [ ] No brewing/auth regressions.
- [ ] Stepwise result written to `docs/current_work/stepwise_results/`.

---

## Notes

- Positions are **company-wide** (not department-scoped); `group` is cosmetic
  for the picker only.
- Authorize `:create` against the **target department** by constructing a bare
  `%Shift{department_id: dept_id}` for the `can?/3` check before insert.
- Reuse `Authz.managed_department_ids/1` for draft visibility and manager scope.
- Keep commits scoped: format only the files you changed
  ([[rockcut-mix-format-churn]]).
