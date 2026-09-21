# D12: Schedule Weekly Grid + Color Palette — Specification

**Status:** Approved (2026-09-20)
**Created:** 2026-09-20
**Author:** Matt + CC
**Depends On:** D11 (Staff Scheduling), D10 (Authorization)

---

## 1. Problem Statement

D11 shipped the scheduling core with a day-grouped agenda list. D12 adds the
*When I Work*-style **weekly grid** (all staff down the side, days across the
top), a **department color palette** so shifts are visually distinguishable at a
glance, and the ability to **unpublish** a shift without deleting it.

Unlike the original plan, this needs small **backend additions** (department
colors, an unpublish action, and a lightweight staff roster so the grid can list
all employees for every viewer), so D12 is delivered in two phases.

---

## 2. Requirements

### Functional

**Weekly grid**
- [ ] A **view toggle** on the Schedule screen: **Agenda** (D11) ↔ **Week** (D12);
      choice persists (localStorage).
- [ ] Week runs **Monday–Sunday**; the visible week range is shown, with
      prev / next / "This week" navigation.
- [ ] Rows = **all active employees** (company-wide), plus an **Open shifts** row;
      columns = the 7 days. Each cell holds that person's shifts that day
      (Denver local time).
- [ ] A **department filter** (All departments by default, or one department) that
      narrows which shifts are shown; rows stay "all employees".
- [ ] **Draft visibility** carries over: employees see only published shifts;
      managers/owners also see their department's drafts, visually marked.
- [ ] **Cell interactions:**
  - Manager/owner: click an empty cell → create-shift dialog prefilled with that
    person + day (+ department, when the filter is set); click a shift → edit.
  - Employee: click an open shift → **Claim**.

**Color palette**
- [ ] Each **department** has a base **color** (hex), seeded with a sensible
      default and **editable** via a palette editor (owner).
- [ ] A shift's color = its **department's base color**, **shaded by its
      position** ("shift type") — deterministic shades so a given position always
      reads the same within a department.
- [ ] Colors are used on shift chips in both the grid and agenda views, with a
      small legend.

**Unpublish**
- [ ] A published shift can be **unpublished** (→ draft) without deleting it,
      from the shift edit dialog and/or a shift action. Manager/owner only.

**Publish week**
- [ ] A **Publish week** button (manager/owner) publishes all **draft** shifts in
      the visible week that the actor is authorized to publish — i.e. in their
      managed departments, narrowed by the department filter when one is set.
      Frontend issues `POST /api/shifts/:id/publish` per eligible draft.

### Non-Functional

- [ ] Grid scrolls horizontally on narrow screens (Chromebook/mobile) with a
      **sticky staff-name column**; the page body never scrolls sideways.
- [ ] Color choices meet reasonable contrast (readable chip text on the shade).
- [ ] Reuses D11 components/queries; server enforces every write.

---

## 3. Design

### Backend additions (Phase 1)

**Department color**
- Migration: add `color :string` to `departments` (hex like `#2E6DB4`).
- Seed defaults: Brewery `#B8742A` (amber), Bar `#2E6DB4` (blue),
  Office `#3F8F5B` (green), Sales `#7A4FB0` (purple).
- `PATCH /api/departments/:id` `{ color }` — **owner only** (`Authz.owner?`);
  `DepartmentController` gains `update/2`; `department/1` JSON view returns
  `color`.

**Unpublish**
- `POST /api/shifts/:id/unpublish` → sets status `draft`. Authz: add `:unpublish`
  to the manager verb set for `%Shift{}`. `Scheduling.unpublish_shift/1`.

**Staff roster (so the grid can list all employees for any viewer)**
- `GET /api/roster` → `[{ id, name, departments: [key] }]` for **active** users,
  readable by **any authenticated user** (minimal fields only — no email/role).
  Backed by `Accounts.list_roster/0`.

### Frontend (Phase 2)

- `Schedule.tsx` holds `view` ('agenda' | 'week'), `weekStart` (Monday), and the
  department filter; renders `WeekGrid` in week mode.
- `WeekGrid.tsx`: days = 7 dates from Monday; rows from `/api/roster` (+ Open);
  `cell[user][day]` = shifts where `assignee_id` matches (or open) and
  `localDayKey(starts_at)` equals the day; department filter narrows shifts.
  Rendered as a `<table>` in an `overflow-x:auto` container with a sticky first
  column.
- `lib/colors.ts`: `departmentColor(dep)` (base hex, fallback if unset) and
  `shiftColor(dep, position)` — convert base to HSL, offset lightness by a
  deterministic per-position step; return fill + readable text color.
- `PaletteDialog.tsx` (owner): edit each department's base color (color input),
  `PATCH /api/departments/:id`; invalidates `['departments']`.
- Shift chips in grid + agenda use `shiftColor`; a small legend maps
  department → color.
- Unpublish: a button in `ShiftFormDialog` shown when the shift is published
  (`POST /api/shifts/:id/unpublish`).

### Color model

```
base = department.color            # editable per department
shade(position) = adjustLightness(base, step(position))   # step deterministic from position id
chip.fill = shade(position); chip.text = contrastColor(chip.fill)
```

"Changeable palette" = the department base colors are stored and editable; the
shading algorithm is fixed, so editing a base recolors all its shifts/shades.

---

## 4. Success Criteria

- [ ] Week grid (Mon–Sun) lists all active employees × 7 days with shifts in the
      correct day columns (Denver local) and an Open row; prev/next/This-week
      refetch the window.
- [ ] Department filter narrows visible shifts; rows remain all employees.
- [ ] Agenda ↔ Week toggle persists; drafts hidden from employees, marked for
      managers/owners.
- [ ] Shift chips are colored by department with per-position shades; owner can
      change a department's base color and everything recolors.
- [ ] A published shift can be unpublished (→ draft) without deletion (manager/
      owner); employees cannot.
- [ ] `GET /api/roster` returns minimal staff info to any authenticated user.
- [ ] Grid scrolls horizontally on phone width with a sticky name column.
- [ ] ExUnit covers the new endpoints (department color update authz, unpublish
      authz, roster); `vite build` + lint/type clean.

---

## 5. Out of Scope

- Drag-and-drop move/reassign (click-to-edit only).
- Copy-previous-week / templates / recurring shifts.
- Per-position stored colors or fully custom per-shift colors (shades are
  derived; only department base colors are stored/edited).
- Publish-entire-week bulk action (per-shift publish/unpublish only) — can be a
  fast follow if wanted.
- Other scheduling follow-ons (availability, time-off, swaps, time clock,
  notifications).

---

## 6. Resolved Decisions

1. **"Shift type" for shading = position** (Bar-open vs Bar-close are different
   shades of Bar's color).
2. **Palette editing = owners only** (department colors are company-wide).
3. **Roster** (names + departments) is readable by **any authenticated user**, so
   every viewer's grid can list all staff.
4. **Publish-week bulk action = included** (frontend loops per-draft publish over
   the actor's authorized drafts in the visible week).

## 7. Open Questions

- [ ] None blocking.
