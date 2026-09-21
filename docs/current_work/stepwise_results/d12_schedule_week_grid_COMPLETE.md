# D12: Schedule Weekly Grid + Color Palette — Complete

**Spec:** `d12_schedule_week_grid_spec.md`
**Completed:** 2026-09-21

---

## Summary

Added the *When I Work*-style **weekly grid** to the schedule (all staff × 7
days, Mon–Sun), an editable **department color palette** (per-position shades),
the ability to **unpublish** a shift without deleting it, and a **publish-week**
bulk action. Delivered in two phases: a small backend (department colors, shift
unpublish, a public staff roster) and the grid/palette frontend.

---

## Implementation Details

### What Was Built

- **Weekly grid** (`WeekGrid.tsx`): rows = all active staff (from a new
  `/api/roster`) + an Open-shifts row; columns = the 7 days; agenda↔week toggle
  persisted in localStorage; prev/next/This-week navigation; sticky staff-name
  column with horizontal scroll.
- **Color palette**: each department has a `color`; shift chips are shaded per
  position (`lib/colors.ts`) with a legend; owner-editable via `PaletteDialog`.
- **Unpublish**: `POST /api/shifts/:id/unpublish` (manager+) sends a published
  shift back to draft.
- **Publish week**: bulk-publishes the visible draft shifts the actor manages.
- **Roster**: `GET /api/roster` — minimal active-staff list readable by any
  authenticated user (so every viewer's grid lists all staff), no email/role.

### Key Files

| File | Purpose |
|------|---------|
| `migrations/…add_color_to_departments.exs` | Department color |
| `accounts.ex` (`update_department`, `list_roster`), `department.ex` | Color + roster |
| `controllers/{department,roster}_controller.ex` | Color PATCH (owner), roster |
| `scheduling.ex` (`unpublish_shift`), `shift_controller.ex` | Unpublish |
| `rockcut-ui/src/pages/schedule/{WeekGrid,PaletteDialog}.tsx` | Grid + palette |
| `rockcut-ui/src/lib/{colors,datetime}.ts` | Shades + Monday-week helpers |

---

## Testing

- [x] ExUnit: department color update (owner-only + hex validation), unpublish
      authz, roster shape/visibility. **113 tests** at completion.
- [x] `vite build` + lint/type clean; manual grid/palette/unpublish verified.

---

## Deviations from Spec

- Week start became **Monday–Sunday** (spec drafted Sun–Sat) and rows show **all
  employees** with a department filter — adjusted per Matt's direction during the
  build. `tsc -b` remains pre-broken by datagrid-extended (see D10 result).

---

## Follow-Up Items

- [ ] Drag-and-drop on the grid → delivered in **D13**.
- [ ] Touch-drag, conflict warnings — later.

---

## Notes

Commits: `5030b98` (phase 1), `202636e` (phase 2). Times display in
America/Denver via `lib/datetime.ts`.
