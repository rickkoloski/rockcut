# D13: Schedule Grid Drag-and-Drop — Complete

**Spec:** `d13_schedule_drag_drop_spec.md`
**Completed:** 2026-09-21

---

## Summary

Added drag-and-drop to the weekly grid: a manager drags a shift chip to another
cell to **reschedule** (different day) and/or **reassign** (different employee
row, or the Open row to unassign). Any drag-move **unpublishes** the shift (back
to draft). Also made **any employee schedulable in any department** (assignee
picker sources the full roster). Frontend-only — reuses `PATCH /api/shifts/:id`.

---

## Implementation Details

### What Was Built

- **Native HTML5 DnD** in `WeekGrid.tsx`: draggable chips (only ones the user can
  manage), cell drop targets with hover highlight, dragged chip dims, same-cell
  drop is a no-op.
- **`onMoveShift`** (`Schedule.tsx`): reschedule keeps local time-of-day +
  duration (Denver), reassign sets/clears assignee, and always sets
  `status: "draft"`; one `PATCH`. Server enforces authority; failed patch
  re-syncs the grid.
- **Any employee, any department**: the shift dialog's assignee picker now lists
  the full roster (dropped the department-member filter and the extra
  `/api/users` fetch). Backend already permitted any assignee.

### Key Files

| File | Purpose |
|------|---------|
| `rockcut-ui/src/pages/schedule/WeekGrid.tsx` | Draggable chips + drop handlers |
| `rockcut-ui/src/pages/schedule/Schedule.tsx` | `moveShift` (patch + draft) |
| `rockcut-ui/src/pages/schedule/ShiftFormDialog.tsx` | Assignee from roster |

---

## Testing

- [x] No backend change; existing suite unaffected. `vite build` + lint/type
      clean; manual drag reschedule/reassign/unassign + unpublish-on-move
      verified.

---

## Deviations from Spec

- None material. **Touch drag** remains out of scope (native DnD is trackpad/
  mouse); a touch fallback is a later enhancement.

---

## Follow-Up Items

- [ ] Touch-drag support.
- [ ] Conflict/overlap warnings on drop.

---

## Notes

Commit: `985ac22`.

### Related scheduling refinements shipped alongside (un-numbered)
- `32def41` — cell click opens an "Add shift?" confirm before the dialog.
- `976a215` — shift dialog split Day/Time rows (15-min steps) + Total; week grid
  shows shift duration and per-employee weekly hours ("36 hr / 42 hr draft").
- `1f28669` — positions belong to a department; a shift's department derives from
  its position (department picker removed); "Other" = scheduling-only,
  non-assignable department for Training/Event-offsite.
- `5155c63` — Duplicate button in the edit shift dialog.
