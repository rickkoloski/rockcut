# D14: Scheduling Templates, Standard Hours & Copy Week — Complete

**Spec:** `d14_schedule_templates_spec.md`
**Completed:** 2026-09-21

---

## Summary

Three schedule-reuse tools: **(A)** per-position **standard hours** presets that
fill the shift times, **(B)** **copy previous week** into the visible week as
drafts, and **(C)** named **week/day templates** you save and apply. Delivered in
two phases — a template backend (A + C) and the frontend for all three. Times are
stored as wall-clock `:time` and the frontend does the Denver↔UTC math, so the
server needs **no timezone library**.

---

## Implementation Details

### What Was Built

- **A — standard hours:** `shift_templates` (per-position `name` + start/end
  time). Shift dialog gains a "Standard hours" dropdown (overnight rolls the end
  day); presets managed per position in the Positions dialog (expandable).
- **B — copy previous week:** a week-grid button loads last week's manageable
  shifts, confirms, and creates +7-day **draft** copies (frontend, no backend).
- **C — schedule templates:** `schedule_templates` + `schedule_template_items`
  (position/assignee/day_index/times/notes). `TemplatesDialog` saves the visible
  week or a day as a named template, applies a template (week → visible week; day
  → chosen date) creating **drafts**, and deletes templates. Apply is
  best-effort; created/skipped reported via a snackbar.

### Key Files

| File | Purpose |
|------|---------|
| `migrations/…create_shift_templates / _schedule_templates / _items.exs` | Schema |
| `scheduling/{shift_template,schedule_template,schedule_template_item}.ex` | Schemas |
| `scheduling.ex` (+template functions) | Context |
| `controllers/{shift_template,schedule_template}_controller.ex` | Endpoints |
| `rockcut-ui/src/pages/schedule/TemplatesDialog.tsx` | Save/apply/manage (C) |
| `ShiftFormDialog.tsx`, `PositionsDialog.tsx`, `Schedule.tsx` | Presets (A), copy-week (B) |

---

## Testing

- [x] ExUnit: shift-template + schedule-template create/list/authz (manager vs
      employee). **120 tests, 0 failures**; warnings-as-errors clean.
- [x] `vite build` + lint/type clean; endpoints live with seeded standard hours
      (Bar-open/mid/close, Brewer).

---

## Deviations from Spec

- **Apply** is done client-side (a POST-per-item loop reporting created/skipped)
  rather than a dedicated server endpoint — this avoids adding a server timezone
  library while keeping per-item authorization. Otherwise as specified.

---

## Follow-Up Items

- [ ] Availability, time-off, swaps/drops, time clock, notifications,
      conflict warnings — remaining *When I Work* features (see D11 §5).

---

## Notes

Commits: `ca794db` (phase 1), `5b10563` (phase 2). Template times are Denver
wall-clock; the frontend combines them with target dates for copy/apply.
