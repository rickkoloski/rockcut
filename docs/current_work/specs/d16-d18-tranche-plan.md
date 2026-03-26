# Tranches 2, 3 & 4 — Implementation Plan

**Date:** 2026-03-19
**Goal:** Complete all three tranches before next session with Matt
**Branch:** TBD (one branch per tranche, or single feature branch)

---

## What We Need From Matt

These items are **blocking or will significantly improve** the quality of the work. Everything else we can proceed on with reasonable assumptions.

### Blocking

| # | Item | Why It Blocks | Where to Send Answer |
|---|------|--------------|---------------------|
| 1 | **Volume chain definition** — What does "batch size" on a recipe represent? Final packaged volume? Post-boil volume? And how should we compute through the chain (preboil → post-boil → fermenter → package) using the brewhouse equipment values (kettle_turn_size, evaporation_rate, kettle_loss, ferm_loss)? | OG, preboil gravity, and all downstream calculations (FG, ABV, calories) depend on getting the volume right. Currently we just use batch_size directly as gallons. | Annotate this doc or reply in RC chat |
| 2 | **Ingredient density data** for volume-based ingredients (sugars, fruits, honey) — when an ingredient amount is entered as a volume (gal, L) instead of weight (lb, kg), we need density to convert to weight for gravity/color calculations. Matt said he's working on this. | Fermentables table calculations use weight. Volume-based entries won't compute correctly without density. | Provide a table or spreadsheet when ready |

### Would Improve Quality (Not Blocking)

| # | Item | Impact If Missing | Default We'll Use |
|---|------|------------------|-------------------|
| 3 | **Confirm CGAI × 46 uses CGAI as percentage** — Matt's doc says `PPG = CGAI × 46`. Our code divides CGAI by 100 first (so 80.5% → 0.805 × 46 = 37.03). If Matt means the raw percentage (80.5 × 46 = 3,703), the numbers will be wildly off. | Wrong extract values everywhere | CGAI as percentage / 100 (confirmed by reasonable PPG output ~37) |
| 4 | **Default efficiency source** — Should a new recipe's efficiency default come from the brewhouse, the brand's target_mash_efficiency, or a system-wide default? | Minor — affects new recipe creation only | Default to brand's target_mash_efficiency, fall back to 0.75 |
| 5 | **Should Fruit category contribute to OG?** — Currently only Grain, Extract, Sugar count as fermentables for gravity calculation. Fruits have fermentable sugar but are handled differently. | Fruit-heavy recipes (e.g., fruit wheat) would undercount OG | Include Fruit in fermentable categories |
| 6 | **BJCP style JSON** — Matt provided the URL (`github.com/ascholer/bjcp-styleview/blob/main/styles.json`). We can fetch and integrate this without further input, but should confirm: import all styles, or filter to specific years? | Style dropdown won't have real data | Import all, let Matt filter by year in UI |

---

## Tranche 2: Fix the Foundation (D16)

**Purpose:** Make existing calculations trustworthy. Every formula tells the truth about where its inputs come from.

### Work Items

| # | Item | Type | Effort |
|---|------|------|--------|
| 2.1 | **Brewhouse resolution service** — New Elixir module that resolves the effective brewhouse for a brand: if brand.brewhouse_id is set, use that; if nil, fall back to the default brewhouse (is_default=true). Single function, used by all formula calcs and the API serializer. | Backend | S |
| 2.2 | **Wire brewhouse resolution into all formulas** — est_og, est_fg, est_abv, est_ibu, est_srm, est_calories all call the resolution service to get the effective brewhouse. Use its equipment values (kettle_loss, evaporation_rate, ferm_loss) and settings (ibu_calc_method, density_calc_method) where appropriate. | Backend | M |
| 2.3 | **Brand API: include resolved brewhouse** — The brand show/index endpoints should return the resolved brewhouse (name, id, is_default) even when brand.brewhouse_id is nil. Frontend doesn't need special logic — it just displays what the API gives it. | Backend | S |
| 2.4 | **UI: display resolved brewhouse on Brand detail** — Show "Production (default)" or "Production" depending on whether it's inherited or explicit. Same on Recipe detail breadcrumb/header. | Frontend | S |
| 2.5 | **Brand schema: add new fields** — Migration adding `apparent_attenuation` (decimal), `target_mash_efficiency` (decimal), `target_batch_size` (decimal), `original_gravity` (decimal) to brands table. Update Ecto schema, changeset, controller params. | Backend | S |
| 2.6 | **Brand UI: new fields** — Add Apparent Attenuation, Target Mash Efficiency, Target Batch Size, Original Gravity to BrandFormDialog and BrandDetail. Show units from resolved brewhouse (e.g., "Target Batch Size (bbl)"). | Frontend | S |
| 2.7 | **Wire real attenuation into formulas** — est_fg and est_abv read brand.apparent_attenuation instead of hardcoded 0.75. Fall back to 0.75 only if the field is null. | Backend | S |
| 2.8 | **Recipe detail: calculated values in summary header** — Add Est. OG, FG, IBU, ABV, SRM, Cal to the Recipe detail summary bar (alongside Version, Batch Size, Boil Time, Efficiency, Status). Call formula execution endpoint on page load. | Frontend | M |
| 2.9 | **Regression tests** — ExUnit: brewhouse resolution with nil/explicit/no-default cases. Playwright: brand with no brewhouse shows "(default)", recipe detail shows calculated values, new brand fields persist. | Testing | M |

### Dependencies
- None external. Can start immediately.

---

## Tranche 3: Fermentables Table (D17)

**Purpose:** Replace the current "Add Ingredient" button + simple grid with Matt's 17-column spreadsheet-style table.

### Work Items

| # | Item | Type | Effort |
|---|------|------|--------|
| 3.1 | **Ingredient schema: grain fields** — Migration adding `extract_measurement`, `moisture_pct`, `extract_cgai`, `extract_fgdb`, `extract_ppg`, `extract_l_deg_kg`, `color_lovibond`, `diastatic_power` to ingredients table. Update schema, changeset, controller. | Backend | S |
| 3.2 | **Wire ingredient form persistence** — The useExtractConversions hook and grain fields from D15 are UI-only. Connect them to the backend so values persist on save. | Frontend + Backend | S |
| 3.3 | **Fermentables table component** — New component replacing GrainBillTab. Spreadsheet-style with inline editing. Columns per Matt's spec: | Frontend | L |
|     | — Drag handle (reorder) | | |
|     | — Category (pulldown, default Grain) | | |
|     | — Ingredient (pulldown, filtered by category) | | |
|     | — Lot # (pulldown, filtered by ingredient) | | |
|     | — Amount (number, precision per brewhouse) | | |
|     | — Unit (pulldown, default per brewhouse) | | |
|     | — Use (pulldown: Mash / Kettle / Fermenter / Brite) | | |
|     | — Time (number, default to mash duration if Use=Mash) | | |
|     | — Note (text) | | |
|     | — Extract (display, from ingredient data) | | |
|     | — Color º Lov (display) | | |
|     | — Diastatic Power º Lintner (display) | | |
|     | — Efficiency (number, default to recipe target if Use=Mash, else 100%) | | |
| 3.4 | **Calculated columns (Phase 1 row-math)** — | Frontend | M |
|     | — Extract Expected = weight × Extract × Efficiency (hidden by default) | | |
|     | — Color MCUs = weight × Color (hidden by default) | | |
|     | — Diastatic Potential = weight × Diastatic Power (hidden by default) | | |
| 3.5 | **Calculated columns (Phase 2 aggregates)** — | Frontend | M |
|     | — Mash Weight % = `ROUND(amount / SUMIF(amount, use, "Mash") * 100, 1)` | | |
|     | — Extract Weight % = `ROUND(extract_expected / SUM(extract_expected) * 100, 1)` | | |
| 3.6 | **Inline row add/delete** — "+" button below table adds a new row defaulting to Grain category. Trash icon on far right deletes row. Start with one empty row. | Frontend | S |
| 3.7 | **Rename "Grain Bill" → "Fermentables"** — Tab label, any references. | Frontend | XS |
| 3.8 | **Tests** — Playwright: add ingredient row via inline editing, verify cascading dropdowns (category → ingredient → lot), verify calculated columns update, verify drag reorder persists, verify delete + persist-verify. | Testing | M |

### Dependencies
- Tranche 2 must be complete (brewhouse resolution needed for default units, efficiency source).
- Blocking item #2 (ingredient density) affects volume-based ingredients but doesn't block the core table.

---

## Tranche 4: Polish & Display Standards (D18)

**Purpose:** Make everything look the way Matt specified in his docs.

### Work Items

| # | Item | Type | Effort |
|---|------|------|--------|
| 4.1 | **Display label fixes** — All UOM dropdowns use proper capitalization and symbols: ºF/ºC, SG/º Plato, ABV/ABW, PPG/CGAI/FGDB/Lº/kg, Tinseth/Rager/Garetz/Tinseth-modified, bbl/gal/hL/L/mL/oz-liq. Internal DB values unchanged — display labels only. | Frontend | S |
| 4.2 | **New enum values** — Backend: add `fgdb` and `l_deg_kg` to density_calc_method, `tinseth_modified` to ibu_calc_method. Migration + validation update. | Backend | S |
| 4.3 | **Dynamic field labels** — Kettle Turn Size, Kettle Loss, Fermenter Loss append selected liquid volume unit. Evaporation Rate appends unit + "per hr". E.g., "Kettle Turn Size (bbl)". | Frontend | S |
| 4.4 | **Section rename** — "UOM Preferences" → "Default Units of Measurement" | Frontend | XS |
| 4.5 | **Coolpool rename** — "Coolpool" → "Coolpool/Hop Stand" on Process Profile Boil tab | Frontend | XS |
| 4.6 | **Brewhouse-aware formula improvements** — IBU calculation uses actual computed OG for bigness factor (not hardcoded 1.050). Wire ibu_calc_method from brewhouse (prep for future Tinseth-modified). | Backend | M |
| 4.7 | **Missing data UX** — When formula can't compute (missing ingredient data), show a helpful message: "Add alpha acid to hop lots to calculate IBU" instead of a generic error icon. | Frontend | M |
| 4.8 | **Computed cell styling** — Use background color (Matt prefers blue for editable cells) to distinguish editable fields from computed/read-only fields in grids. | Frontend | S |
| 4.9 | **Add formula rows to calculation review doc** — Per Matt's request, add rows for Tinseth (standard), calorie formula, and Morey SRM to the d15-calculation-review.md so Matt has a complete reference. | Documentation | S |
| 4.10 | **Tests** — Playwright: verify display labels render correctly on brewhouse detail, verify dynamic field labels update when volume unit changes, verify Coolpool/Hop Stand rename, verify computed cell styling. | Testing | S |

### Dependencies
- Tranche 2 must be complete (brewhouse resolution needed for dynamic labels).
- Tranche 3 should be complete (Fermentables table is where computed cell styling matters most).

---

## Effort Key

| Size | Meaning |
|------|---------|
| XS | < 1 hour, single file change |
| S | 1–3 hours, straightforward |
| M | 3–6 hours, multiple files or complex logic |
| L | 6+ hours, significant new component or architecture |

---

## Summary

| Tranche | Deliverable | Items | Largest Item |
|---------|------------|-------|-------------|
| 2 — Foundation | D16 | 9 items | Recipe detail calc values (M) |
| 3 — Fermentables | D17 | 8 items | Fermentables table component (L) |
| 4 — Polish | D18 | 10 items | Brewhouse-aware IBU + Missing data UX (M each) |

**Total estimated effort:** 2–3 working sessions with agent teams.

**What we need from Matt before we start:** Items 1 and 2 from the "Blocking" table above (volume chain definition and ingredient densities). Everything else we can proceed on.
