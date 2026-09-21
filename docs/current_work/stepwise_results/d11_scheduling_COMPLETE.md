# D11: Staff Scheduling — Complete

**Spec:** `d11_scheduling_spec.md`
**Plan:** `d11_scheduling_plan.md`
**Completed:** 2026-09-20

---

## Summary

Built the staff shift-scheduling core (in the spirit of *When I Work*) on top of
D10's authorization. Company-wide positions and department shifts with a
draft→publish workflow, cross-department read of published shifts, and
employee self-service claiming of open shifts. Shipped in two phases: backend
(schemas, context, authz, controllers, seed, tests) and frontend (agenda view,
shift dialog, positions management, claim/publish). v1 view is a day-grouped
agenda list; the weekly grid is the follow-on (D12).

---

## Implementation Details

### What Was Built

- **Positions** — company-wide list (`name`, cosmetic `group`, `active`);
  seeded starter set; managed by any manager/owner; soft-deactivated when
  referenced by shifts.
- **Shifts** — department + position + nullable assignee (open shift) +
  UTC start/end + `draft|published` + notes + created_by; `ends_at > starts_at`
  enforced.
- **Authorization** (`Authz.can?/3`): global read of published shifts; drafts
  visible only to their department's managers/owners; manager-only create/edit/
  assign/delete/publish; employee **claim** of open published shifts in their
  own department. `list_shifts/2` enforces draft visibility in-query.
- **`"schedule"`** added to every user's `capabilities.modules` (shared module).
- **Frontend** — Schedule agenda (day-grouped, all departments, filters:
  department/position/date-range/my-shifts/open); manager shift create/edit
  dialog with Publish + Delete; positions management dialog; employee Claim
  button; Schedule nav for all users; UTC↔America/Denver display.

### Files Created (API)

| File | Purpose |
|------|---------|
| `priv/repo/migrations/20260920140001_create_positions.exs`, `..._02_create_shifts.exs` | Schema |
| `lib/rockcut_api/scheduling.ex` | Positions + shifts context (incl. draft-visibility query, claim, publish) |
| `lib/rockcut_api/scheduling/{position,shift}.ex` | Schemas |
| `lib/rockcut_api_web/controllers/{position,shift}_controller.ex` | Endpoints |
| `test/support/scheduling_fixtures.ex` + 4 test files | Coverage |

### Files Created (UI)

| File | Purpose |
|------|---------|
| `src/pages/schedule/{Schedule,ShiftFormDialog,PositionsDialog}.tsx` | Schedule screen |
| `src/lib/datetime.ts` | UTC ↔ America/Denver helpers |

### Files Modified

| File | Changes |
|------|---------|
| `lib/rockcut_api/authz.ex` | `can?/3` clauses for `%Shift{}` and `%Position{}` |
| `lib/rockcut_api/accounts.ex` | `"schedule"` added to capabilities.modules |
| `lib/rockcut_api_web/controllers/json_helpers.ex` | `position/1`, `shift/1` views |
| `lib/rockcut_api_web/router.ex` | `/api/positions`, `/api/shifts` (+ publish/claim) |
| `priv/repo/seeds.exs` | 10 positions + 3 sample shifts |
| `rockcut-ui/src/App.tsx`, `src/lib/types.ts` | Schedule nav/route/landing; Position/Shift types |

---

## Testing

### Tests Run
- [x] ExUnit: **107 tests, 0 failures** (86 → 107; +21 scheduling covering the
      shift verb matrix, draft visibility, claim rules, position deactivation,
      and controller happy/forbidden paths). Updated 3 D10 capability tests for
      the new shared `"schedule"` module.
- [x] `mix compile --warnings-as-errors`: clean.
- [x] UI: `vite build` passes; new files type- and lint-clean.
- [x] Live API check: seeded positions/shifts return correctly; owner/manager/
      employee scoping and claim verified end-to-end.

### Test Coverage
Authorization (verb × role × draft-state), draft visibility in `list_shifts/2`,
and claim eligibility are covered at context and controller levels.

---

## Deviations from Spec

- **Positions are company-wide** (not per-department) with a cosmetic `group`
  label — decided during spec review; simplifies the model and matches Matt's
  position list (incl. an "Other" group for Training/Event-offsite).
- **`tsc -b`** remains pre-existingly broken by the linked `datagrid-extended`
  package (see D10 result); UI verified via `vite build` + scoped `tsc`/ESLint.
- Otherwise as specified.

---

## Follow-Up Items

- [ ] **D12 — weekly grid view** (staff × days) for the schedule.
- [ ] Scheduling follow-ons: availability, time-off requests, shift swaps/drops,
      time clock, notifications, recurring shifts, overlap/double-booking warnings.
- [ ] Replace the arbitrary sample-shift seed times with realistic ones (cosmetic).

---

## Notes

- Times are stored UTC and displayed in America/Denver
  (`rockcut-ui/src/lib/datetime.ts`); `<input type="datetime-local">` values are
  treated as Denver wall-clock time.
- `Authz.can?/3` authorizes shift creation against the **target department** by
  constructing a bare `%Shift{department_id: …}` before insert.
- Commits: `c662fc9` (phase 1), `d38e9bb` (phase 2), on `practice1` (pushed).
