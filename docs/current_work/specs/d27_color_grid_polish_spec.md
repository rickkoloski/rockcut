# D27: Per-position Color Shades + Scheduler Polish — Specification

**Status:** Complete (2026-09-23) — see `stepwise_results/d27_color_grid_polish_COMPLETE.md`
**Created:** 2026-09-23
**Author:** Matt + CC
**Depends On:** D11–D15 (scheduling grid), D12 (department colors)

---

## 1. Problem Statement

Shift colors were department hue + an **auto** per-position shade (not editable),
color settings lived in a **separate** "Colors" dialog, the agenda view showed a
redundant "Dept · Position" label, and the week grid's employee column was bulky
(reorder arrows + menu stacked on a second row under the name).

---

## 2. Requirements

- [ ] **Per-position shade.** For each department the base color (hue) is picked
      as before; each **position** may pick a **shade** of that same hue (lightness
      only — the hue can't change per position). Null = the old auto shade.
- [ ] **Colors live in Positions settings.** Remove the standalone "Colors"
      button/dialog; the department color picker + per-position shade swatches
      move **into the "Manage positions" dialog** (owner only, matching the old
      owner-gated Colors).
- [ ] **Agenda view** shift chip shows **position only** (department is conveyed
      by color + the legend).
- [ ] **Week grid density:** move the reorder **↑ ↓** arrows to the **right of the
      employee name**, then the **⋮ publish/delete menu** to the right of those —
      one row instead of a stacked second row.

## 3. Scope / Non-Goals

- **Out:** free per-position hue (shades stay within the department palette);
  themeable palettes.
- **In:** the above four changes.

## 4. Design Notes

- `positions.color_shade` (float, HSL lightness 0..1, nullable). Shift fill =
  `HSL(deptHue, deptSat, color_shade)` when set — so recoloring a department
  re-shades its positions automatically.
- `lib/colors.ts`: `departmentShades(baseHex)` (palette swatches) +
  `shiftColor(base, positionId, shade?)`.
