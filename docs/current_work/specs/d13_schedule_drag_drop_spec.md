# D13: Schedule Grid Drag-and-Drop — Specification

**Status:** Approved (2026-09-21)
**Created:** 2026-09-21
**Author:** Matt + CC
**Depends On:** D12 (Weekly Grid), D11 (Scheduling), D10 (Authorization)

---

## 1. Problem Statement

In the week grid, moving a shift currently requires opening the edit dialog. D13
lets a manager **drag a shift chip to a different cell** to reschedule (different
day) and/or reassign (different employee row, or the Open row to unassign). To
keep published schedules honest, **any drag-move sets the shift back to draft
(unpublished)** so the change is re-published deliberately.

Frontend-only: it reuses `PATCH /api/shifts/:id` (manager-authorized, already
casts assignee/times/status). No API changes.

---

## 2. Requirements

### Functional

- [ ] In the **week grid**, shift chips the current user can manage are
      **draggable**; other chips are not.
- [ ] Dropping a chip on a target cell applies, in one `PATCH`:
  - **different day** → reschedule (keep local time-of-day and duration; shift
    both `starts_at`/`ends_at` to the target day);
  - **different employee row** → reassign (`assignee_id` = that user);
  - the **Open shifts** row → unassign (`assignee_id = null`);
  - and always **`status: "draft"`** (the move unpublishes it).
- [ ] A no-op drop (same cell) does nothing.
- [ ] The shift's **department is unchanged** by a move (a Bar shift stays a Bar
      shift regardless of which row it lands on).
- [ ] **Any employee can be scheduled for any department's shift.** The
      assignee picker (shift dialog) lists **all active staff** (the roster), not
      just the shift's-department members; dropping a shift on any employee row
      assigns them. Backend already permits this (no assignee↔department
      constraint).
- [ ] Authorization: only a manager/owner of the shift's department can drag it
      (same as `:update`); the server still enforces on the `PATCH`.
- [ ] Visual feedback: dragged chip dims; the hovered target cell highlights.
- [ ] After the move, the grid refreshes (React Query invalidation) and the chip
      shows as **draft** in its new cell.

### Non-Functional

- [ ] Native HTML5 drag-and-drop — **no new dependency**.
- [ ] Reschedule math uses the Denver-local day (reuse `lib/datetime.ts`),
      preserving time-of-day and duration (incl. overnight shifts) across the move.
- [ ] Errors surface non-destructively (revert visual, brief message); the grid
      re-syncs from the server on failure.

---

## 3. Design

### Interaction (native DnD)

- **Chip** (`WeekGrid`): `draggable={canManageShift(s)}`; `onDragStart` stores the
  shift id (component state + `dataTransfer`); `onDragEnd` clears drag state.
- **Cell**: `onDragOver` → `preventDefault()` (enables drop) + set a
  `hoverCell` for highlight; `onDrop` → resolve `{ shiftId, targetUserId,
  targetDayKey }`, compute the patch, call `onMoveShift`.
- Suppress the cell's click-to-create while a drag is in progress.

### Move computation (`Schedule.tsx`)

```
onMoveShift(shift, targetUserId, targetDayKey):
  sourceDayKey = localDayKey(shift.starts_at)
  sameCell = (targetUserId ?? null) === (shift.assignee_id ?? null) && targetDayKey === sourceDayKey
  if sameCell: return
  # reschedule: keep local time-of-day + duration
  startLocal = utcToLocalInput(shift.starts_at)            # "YYYY-MM-DDThh:mm"
  newStartLocal = targetDayKey + startLocal.slice(10)      # swap the date part
  newStartUtc = localInputToUtc(newStartLocal)
  durationMs = Date(shift.ends_at) - Date(shift.starts_at)
  newEndUtc = new Date(Date(newStartUtc) + durationMs).toISOString()
  PATCH /api/shifts/:id { assignee_id: targetUserId ?? null,
                          starts_at: newStartUtc, ends_at: newEndUtc,
                          status: "draft" }
  invalidate(['shifts'])
```

### Files

- `WeekGrid.tsx`: draggable chips + cell drop handlers + hover highlight;
  new prop `onMoveShift(shift, targetUserId|null, targetDayKey)`.
- `Schedule.tsx`: implement `onMoveShift` (patch + invalidate + error toast).

---

## 4. Success Criteria

- [ ] Manager drags a shift to another day → it moves and shows as draft at the
      new day, same time-of-day/duration.
- [ ] Drag to another employee row → reassigns; drag to Open row → unassigns;
      both set draft.
- [ ] Combined day+row move applies both in one patch.
- [ ] Employees cannot drag; a published shift they see is not draggable.
- [ ] Same-cell drop is a no-op; failed patch re-syncs the grid.
- [ ] `vite build` passes; new code type-/lint-clean; no backend changes.

---

## 5. Out of Scope

- **Touch drag** (native DnD is mouse/trackpad; a Chromebook trackpad works — a
  touch-DnD fallback is a later enhancement).
- Drag in the **agenda** view (grid only).
- Changing a shift's **department** by dragging.
- Multi-select / drag-copy / resize-to-change-duration.
- Conflict/overlap warnings on drop.

---

## 6. Resolved Decisions

1. **Any employee, any department:** a shift can be assigned to any active
   employee regardless of department membership — via the drag target row **and**
   the shift dialog's assignee picker (now sourced from the full roster). The
   shift's department is unchanged.
