# D12: Schedule Weekly Grid + Color Palette — Implementation Instructions

**Spec:** `d12_schedule_week_grid_spec.md`
**Created:** 2026-09-20

---

## Overview

Two phases under one D12 id:

- **Phase 1 — Backend**: department `color` (+ owner-only PATCH), shift
  `unpublish`, and a public `roster` endpoint, with tests.
- **Phase 2 — Frontend**: week grid (Mon–Sun, all employees × 7 days), agenda↔week
  toggle, department color system + palette editor, publish-week + unpublish
  actions.

Commit at the phase boundary. Keep `mix format` / prettier scoped to touched
files ([[rockcut-mix-format-churn]]).

---

## PHASE 1 — Backend

### Step 1.1: Department color
- Migration `<ts>_add_color_to_departments.exs`: `add :color, :string`.
- `Accounts.Department` schema + `changeset/2`: add `:color` (cast; optional
  hex format validation `~r/^#[0-9A-Fa-f]{6}$/`).
- Seed (`seeds.exs`): set defaults when nil — Brewery `#B8742A`, Bar `#2E6DB4`,
  Office `#3F8F5B`, Sales `#7A4FB0` (update existing rows in the departments seed
  block).
- `JSONHelpers.department/1`: add `color`.
- `Accounts.update_department/2` (owner-authorized in controller).
- `DepartmentController.update/2`: guard `Authz.owner?`; `PATCH /api/departments/:id`.
- Router: add `patch "/departments/:id", DepartmentController, :update`.

### Step 1.2: Shift unpublish
- `Authz`: add `:unpublish` to the manager verb list in the `%Shift{}` clause.
- `Scheduling.unpublish_shift/1`: set status `"draft"`.
- `ShiftController.unpublish/2`: `with_shift(:unpublish, …)`.
- Router: `post "/shifts/:id/unpublish", ShiftController, :unpublish`.

### Step 1.3: Roster
- `Accounts.list_roster/0`: active users → `[%{id, name, departments: [key]}]`
  (preload memberships:department; owners have no memberships → `[]`).
- `JSONHelpers.roster_entry/1` (or inline map in controller).
- `RosterController.index/2` (any authenticated) → `%{data: …}`.
- Router (authenticated scope): `get "/roster", RosterController, :index`.

### Step 1.4: Tests
- `department_controller_test`: owner updates color → 200; manager/employee → 403;
  invalid hex → 422.
- `shift_controller_test`: manager unpublish published → draft; employee → 403.
- `roster` test: any authenticated user gets the roster; shape correct.

**Commit Phase 1:** `feat: D12 phase 1 — department colors, shift unpublish, roster`

---

## PHASE 2 — Frontend

### Step 2.1: Types + colors
- `types.ts`: `Department` gains `color: string | null`; add `RosterEntry`
  (`{ id; name: string | null; departments: string[] }`).
- `lib/colors.ts`:
  - `departmentColor(dep?)` → base hex with a neutral fallback.
  - `shiftColor(baseHex, positionId)` → HSL-shift lightness by a deterministic
    step from `positionId` (e.g. `(id * 37) % 5` → offsets like −16..+16%);
    returns `{ bg, fg }` where `fg` is black/white by luminance contrast.
  - Small hex↔HSL + relative-luminance helpers.

### Step 2.2: Schedule screen shell
- `Schedule.tsx`:
  - `view` state `'agenda' | 'week'` persisted in `localStorage`
    (`rockcut:schedule:view`), a ToggleButtonGroup in the header toolbar.
  - `weekStart` state = Monday of the current week; prev/next/This-week controls
    (week mode only). Compute Monday via day-of-week math on a Denver-local date.
  - Keep existing filters; the **department** filter also scopes the grid.
  - Fetch `/api/roster` (all viewers) for grid rows.
  - **Publish week** button (managers/owners): collect visible draft shifts the
    actor can publish (managed departments, minus dept filter) → `Promise.all`
    of `POST /api/shifts/:id/publish`; invalidate `['shifts']`.
  - Color **legend** (department → swatch).
  - Colored chips in the agenda view too (via `shiftColor`).

### Step 2.3: WeekGrid
- `pages/schedule/WeekGrid.tsx`:
  - Props: `weekStart`, `shifts`, `roster`, `departments`, `canManageDept(depKey)`,
    `onCreate({userId, date, departmentId?})`, `onEditShift`, `onClaim`.
  - `days` = 7 dates Mon→Sun (as Denver `YYYY-MM-DD` keys + display labels).
  - Rows = roster (sorted by name) + an **Open** row.
  - `cell(userId|null, dayKey)` = shifts with matching `assignee_id`
    (null → open) and `localDayKey(starts_at) === dayKey`.
  - Render `<table>` inside `<Box sx={{ overflowX: 'auto' }}>`; first column
    (name) `position: sticky; left: 0` with a solid background.
  - Cell chips use `shiftColor`; draft chips dashed/outlined. Empty manager cells
    show a hover “+”. Click behavior per role (create/edit/claim).

### Step 2.4: Palette + unpublish
- `pages/schedule/PaletteDialog.tsx` (owner): list departments with a
  `<input type="color">`; `PATCH /api/departments/:id { color }`; invalidate
  `['departments']`. Open via a "Colors" button (owner only) in the header.
- `ShiftFormDialog`: when `editShift?.status === 'published'`, show an
  **Unpublish** button → `POST /api/shifts/:id/unpublish`.

### Step 2.5: Verify
- `vite build`; new files type-/lint-clean (`tsc -b` pre-broken by
  datagrid-extended — verify via `tsc --noEmit -p tsconfig.app.json` ignoring
  `../../shared`).
- Manual: toggle agenda/week; navigate weeks; owner recolors Bar → chips update;
  manager publishes a week and unpublishes one shift; employee sees colored
  published grid and claims an open cell; grid scrolls horizontally on phone width.

**Commit Phase 2:** `feat: D12 phase 2 — week grid, color palette, publish-week/unpublish UI`

---

## Testing

- [ ] `mix test` green (new endpoint tests + existing).
- [ ] `vite build` passes; lint/type clean.
- [ ] Manual matrix above.

## Verification Checklist

- [ ] Both phases committed at the boundary.
- [ ] Mon–Sun grid, all employees, department filter, sticky name column,
      horizontal scroll.
- [ ] Department colors + per-position shades; owner-editable palette recolors.
- [ ] Unpublish and publish-week work and are authorized server-side.
- [ ] Roster readable by all; no email/role leaked.
- [ ] Stepwise result written.

## Notes

- No new shift/position model fields — colors derive from `departments.color` +
  position id.
- Reuse `lib/datetime.ts` for day keys/formatting; Monday-start math must use
  Denver-local dates, not the browser's local zone.
