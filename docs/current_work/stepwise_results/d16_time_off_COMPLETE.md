# D16: Time-Off Requests — Complete

**Spec:** `d16_time_off_spec.md`
**Completed:** 2026-09-21

---

## Summary

Time-off requests with a type (Vacation/PTO, Sick, Unpaid, Personal), partial- or
full-day ranges, an approve/deny workflow, and an "Off" marker on the week grid.
No balance/accrual tracking. New `TimeOff` context + a Time-off page.

---

## Implementation Details

### What Was Built

- **Requests:** `time_off_requests` (requester, type, UTC start/end, `all_day`,
  note, status, reviewer fields). A user submits for themselves; status flows
  `pending → approved | denied` (+ `cancelled` by the requester while pending).
- **Authorization:** own requests visible to the requester; managers see their
  departments' people; owners see all. Review by owners or the requester's
  department managers — **managers can't self-approve** (owners may).
- **Frontend:** a **Time off** page (all users) — request form (type, all-day
  date range or partial-day with times, note), "My requests" with cancel, and
  "Pending approvals" (Approve/Deny) for managers/owners. Time-off nav item +
  `/time_off` route.
- **Grid marker:** the week grid shows an "Off" chip on cells where an employee
  has approved time-off covering that Denver day (fetches approved requests for
  the visible week).

### Key Files

| File | Purpose |
|------|---------|
| `migrations/…create_time_off_requests.exs`, `time_off/request.ex` | Schema |
| `time_off.ex` | Context (list/create/review/cancel + authz helpers) |
| `controllers/time_off_controller.ex` | Endpoints |
| `rockcut-ui/src/pages/timeoff/TimeOff.tsx` | Time-off page |
| `rockcut-ui/src/pages/schedule/{Schedule,WeekGrid}.tsx` | Off markers |

---

## Testing

- [x] ExUnit: create (self), list visibility, review authz (incl. no manager
      self-approve, employee denied), cancel. **129 tests, 0 failures**.
- [x] `vite build` + lint/type clean; endpoint live (create → 201).

---

## Deviations from Spec

- None. Balance tracking and hard scheduling-conflict prevention remain out of
  scope (v1 shows a marker only).

---

## Follow-Up Items

- [ ] Availability; shift swaps/drops; notifications on approve/deny; hard
      conflict-prevention when scheduling over approved time off.

---

## Notes

Commits: `10115ab` (phase 1), `e146705` (phase 2). Times stored UTC; the frontend
does Denver↔UTC (all-day → day bounds; partial → day + times).
