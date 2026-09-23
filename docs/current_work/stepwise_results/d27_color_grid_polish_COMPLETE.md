# D27: Per-position Color Shades + Scheduler Polish — Completion Record

**Status:** Complete (2026-09-23)
**Spec:** `specs/d27_color_grid_polish_spec.md`
**Concept:** 07_scheduling
**Branch:** `scheduler-pwa`

---

## What shipped

- **Per-position color shade.** New `positions.color_shade` (float, HSL lightness
  0..1, nullable; validated 0..1). Included in the position JSON. A shift's fill is
  `HSL(departmentHue, departmentSat, color_shade)` when set, else the prior
  deterministic position-derived shade — so recoloring a department re-shades all
  its positions automatically (they stay in the same palette).
- **Colors moved into "Manage positions".** The standalone "Colors" toolbar
  button and `PaletteDialog.tsx` are removed (file deleted). Inside the Positions
  dialog (owner only, via `canEditColors`), each department group header has its
  color picker and each position shows a preview chip + a row of shade swatches
  (`departmentShades`). Owners see every department (any can be colored); managers
  see the dialog as before (no color controls).
- **Agenda view chip** now shows the **position name only** (was
  "Dept · Position") — department is conveyed by the chip color + the legend.
- **Week grid density:** the employee name, reorder **↑ ↓** arrows, and **⋮**
  publish/delete menu are now on **one row** (name flex-grows and ellipsizes;
  buttons tightened to `p:0.25`), removing the stacked second control row. Hours
  label stays below.

## Files

- **Backend:** migration `20260923170001_add_color_shade_to_positions.exs`;
  `Position` schema/changeset (`color_shade` + `validate_number` 0..1); `position`
  JSON helper.
- **Frontend:** `lib/colors.ts` (`departmentShades`, `shiftColor(..., shade?)`),
  `lib/types.ts` (`Position.color_shade`), `PositionsDialog.tsx` (color UI +
  `canEditColors`), `Schedule.tsx` (removed Colors button/PaletteDialog, agenda
  chip = position only, pass `canEditColors`/shade), `WeekGrid.tsx` (pass shade;
  one-row name/controls). Deleted `PaletteDialog.tsx`.

## Verification

- API: **183 tests, 0 failures** (+2: position color_shade persists; out-of-range
  → 422). `mix compile --warning-as-errors` clean.
- UI: `tsc --noEmit -p tsconfig.app.json` clean, ESLint clean, `vite build` OK.
- Live: swatch clicks persist (confirmed via the positions API).
