# D15: Schedule Bulk Actions & Roster Controls — Complete

**Spec:** `d15_schedule_bulk_and_roster_spec.md`
**Completed:** 2026-09-21

---

## Summary

Five schedule quality-of-life additions: delete all shifts in the visible week,
per-employee delete/publish for the visible week, hide a user from the scheduler,
and a saved custom employee order (up/down arrows). Backend added two user fields
+ a roster-order endpoint; the rest is frontend using existing shift endpoints.

---

## Implementation Details

### What Was Built

- **Bulk actions (visible week):** "Delete week" toolbar button; a per-employee
  row menu (⋮) with "Publish this week's shifts" and "Delete this week's shifts."
  Deletes confirm first; results shown in a snackbar. Frontend loops over
  `DELETE`/`publish` on shifts the actor manages.
- **Hide from schedule:** `users.schedulable` (default true) — a "Show on
  schedule" toggle in the user edit dialog. Non-schedulable users are excluded
  from `/api/roster` (no grid row, not an assignee option) but keep login +
  management.
- **Employee order:** `users.schedule_order` (default 0); the roster sorts by it
  then name; up/down arrows on grid rows persist a **global** order via
  `POST /api/roster/order`.

### Key Files

| File | Purpose |
|------|---------|
| `migrations/…add_schedule_fields_to_users.exs`, `accounts/user.ex` | `schedulable`, `schedule_order` |
| `accounts.ex` (`list_roster` filter/order, `reorder_roster`) | Roster |
| `controllers/roster_controller.ex` (`order`) | Save order |
| `rockcut-ui/src/pages/schedule/{Schedule,WeekGrid}.tsx` | Bulk actions, arrows, menu |
| `rockcut-ui/src/pages/users/UserFormDialog.tsx` | Show-on-schedule toggle |

---

## Testing

- [x] ExUnit: roster excludes non-schedulable users; reorder persists + authz
      (manager 200, employee 403). **123 tests, 0 failures**.
- [x] `vite build` + lint/type clean; manual bulk actions / reorder / hide
      verified; endpoints live.

---

## Deviations from Spec

- None. (All-time bulk actions and drag-reorder stay out of scope, as specced.)

---

## Follow-Up Items

- [ ] Availability, time-off (→ D16), swaps/drops, notifications, conflict
      warnings.

---

## Notes

Commits: `523b4fc` (phase 1), `96deec7` (phase 2). Bulk actions are visible-week
only; employee order is global.
