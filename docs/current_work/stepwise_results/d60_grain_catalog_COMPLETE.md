# D60: Grain catalog and inventory — Complete

**Spec:** `specs/d60_grain_catalog_inventory_spec.md` (scoped with Matt 2026-11-16/17, approved
2026-11-17, QA amendments 2026-11-18)
**Plan and briefs:** `planning/d60_grain_catalog_inventory_plan.md`, `prompts/d60_builder_brief.md`
(Stages 1–4), `prompts/d60_lead_decisions_1.md`–`_4.md`
**Completed:** 2026-11-18 (on prod as `v2026.11.18`, release PR #81, squash `f9d2964`; D60 PR #80,
merge `e130971`; shipped `7fb208a` as tested). Matt's prod check passed 2026-11-18.

---

## Summary

The Ingredient Library is rebuilt for grains on Silverston's Universal Data Model patterns: a grain
(2-Row) has maltster products (Rahr 2-Row) with standard specs, companies supply them through offers
with price history, and stock is held in lots whose on-hand comes only from movements. Brewers record
use, trades, loans, receipts and counts, oldest lots first, in sacks + lb or lb.

## What Was Built

- **Data model (Stage 1):** `RockcutApi.Ingredients` context. Product categories with `parent_id`
  (Grains → Base, Crystal/Caramel, Kilned, Specialty, Roasted); maltster products; feature types with
  UOM, decimals and ranges, feature values as rows (product standard and per lot); parties with roles
  (maltster, supplier, partner brewery); supplier offers and prices; lots and inventory movements.
  Migrations `20261117120001`–`03` (the last drops the old lot spec columns).
- **Units:** `RockcutApi.Ingredients.Units` and `src/lib/brewingUnits.ts`: FGDB from as-is and PPG
  (÷ 46.214 × 100), °L from SRM / EBC, °Lintner from °WK; sacks ↔ lb per lot sack size.
- **Inventory:** `Inventory.allocate/3`, oldest first (received date, then lot id) in `BEGIN
  IMMEDIATE`; counts total or by lot ("Counted, no change" is a 0 lb count); Expired by hand;
  nothing below 0, no future dates, ≥ 0.01 lb; lot delete only with just its first movement and no
  recipe (`delete_blocked` on the lot JSON).
- **UI:** Grains list (groups, filters, cards on phones), product page (specs, offers, prices, lots,
  history), Companies, Categories; dialogs for product, offer, price, Add lot, lot, Record movement,
  Count, company, grain, category; convert popups; sacks/lb toggle (`board_settings.ingredients`);
  `DecimalInput` with `.` as the only decimal point; a save lock in the shared FormDialog (every
  dialog in the app).
- **Recipes:** Grain Bill lot picker labels; Est. OG / IBU from `/api/formulas/execute` on the brand's
  recipe list and the recipe header (blank since task 3999 before this); efficiency as a percentage.
- **Seed:** `priv/repo/seeds/grain_reference.exs`: 8 companies, 38 grains, 44 maltster products.
- **Access:** Brewery members and owners; every new route refused to shared devices (device route
  matrix).

## Gate (second run of local QA before DEV)

| Pass | Result | Fix cycles |
|---|---|---|
| Local gate | mix 2,609 ×2, Playwright 839 passed | — |
| Local QA | fail: 3 must-fix, 3 should-fix, 8 minor | local cycle 1 (Matt decided 5) |
| Local gate after cycle 1 | mix 2,617 ×2, Playwright 844 passed, 1 skipped | — |
| Local QA recheck 1 | 14/14 closed; 2 new minor | local cycle 2 |
| Local QA recheck 2 | closed; no new gaps | — |
| DEV Playwright (`7fb208a`) | 845 tests; 4 failed in the run, all passed on re-run | — |
| DEV QA (8 scenarios) | pass with gaps: 0 must-fix, 2 should-fix, 1 minor | none: Matt shipped as is |

Reports: `stepwise_results/d60_local_qa_report.md`, `d60_local_qa_recheck1.md`,
`d60_local_qa_recheck2.md`, `d60_dev_qa_report.md`.

**Trial note:** local QA again caught every must-fix before DEV (double save, lot delete with no
confirm, a 500), so DEV QA found none. DEV found what local can't: a refetch race under real latency
(B8) and the open-hunt gaps below.

## Carried to D61

1. **B8 race:** after a movement, the lot dialog could show Sack size fixed but Delete enabled (stale
   lot). Fix `0299732` (dialog reads the live lot; Delete disabled by either query; vitest) is on
   local branch `d61-carry`: cherry-pick it into D61.
2. **Company Delete offered when in use, then refused** (DEV QA gap 1, should-fix); category delete
   behaves the same. Disable with the reason, as lots do.
3. **"On hand · X expired"** is a total in the header and Count but usable-only in Record movement
   (gap 2, minor).
4. **Extra decimals rounded on save without a notice** (gap 3, should-fix): `1.555` lb → 1.56.
   Refuse the extra digits or say so.
5. Duplicate lot # within a product is allowed; expired lots are selectable in the recipe lot picker
   (labelled); Add field is still offered on grain categories.
6. Schedule GET 500 under load on DEV (P79–P82; cause lost, DEV keeps 100 log lines) → 5911.
7. Not tested: a price dated "today" late in the Colorado evening vs UTC.
8. **Reference data for Matt** (before use): identical spec sets (Rahr 2-Row = Rahr Pilsner; Rahr
   Wheat Extra Pale = Wheat White; Weyermann Pilsner = Pilsner-Barke); Root Shoot Rye 89.1 % FGDB,
   Malted Oats 62.6 %, Simpsons Roasted Barley 62.0 %; DP on CaraRuby (70) and Crisp Dextrin (95);
   no extract on Weyermann Acidulated and Grain Millers Flaked Oats; Root Shoot offers have no order
   names; no prices yet; "Rahr to Thee - Pilsner (milled)".
