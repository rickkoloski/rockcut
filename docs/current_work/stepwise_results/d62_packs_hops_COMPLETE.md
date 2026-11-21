# D62: Packs, units and manufacturer + hops — COMPLETE (DEV gate)

**Deliverable:** D62 generalizes D60/D61's grain into packs and units and puts hops on the same
model. Fruit, spices, sugars and other consumables were split out to D65 (Matt, 2026-11-20).
**Spec:** `docs/current_work/specs/d62_hops_other_ingredients_spec.md`. It was approved
2026-11-19 with A1–A7, the hop reference-data amendments and the split amendment.
**Plan:** `docs/current_work/planning/d62_hops_other_ingredients_plan.md`.
**Brief and decisions:** `prompts/d62_builder_brief.md`, and `prompts/d62_lead_decisions_1.md` …
`_4.md`. Decisions 5, the DEV QA fixes, moved to D65.
**Branch:** `d62-hops-other-ingredients`, from `develop` @ `b3b3678`. **Tested on DEV:** `a9998ea`.

## What changed

Scenario → test mapping is in `rockcut-ui/tests/COVERAGE.md` (D62).

| Area | Change |
|---|---|
| Packs and units | Sacks became packs (`pack_name` + `pack_size`) on offers, lots, orders, minimums, targets and contracts. Quantities are in the product's unit. The display reads "packs + unit" or "total". Grain screens read as D61 ("sacks", "$/sack", "Sacks + lb"). |
| Manufacturer | The `maltster` role became `manufacturer` (Silverston Party Role). Grain screens still say "Maltster"; Companies says "Manufacturer". Pickers and filters list only manufacturers in the category shown, plus an "Other maltster/manufacturer…" option. |
| Category keys | `ingredient_categories.key`. `Ingredients.Catalog` replaces checks by category name. |
| Hops | Variety → product (manufacturer + form T90 Pellet/Cryo/Whole leaf/Extract + origin) with typical alpha/beta/oil ranges. Offers are always box · 11 lb. Lots need a crop year and alpha (2 dp); values outside the range are marked. No Add field and no subcategories (API 422). |
| Purchasing | Mixed grain + hop orders count packs ("36 of 40 packs"). Hop contract lines are in lb at $/lb, which writes $/lb × 11 per box. On order, received and remaining are by weight. Contracts take grain and hops only. |
| Totals | Inventory has a Category filter (All, Grains + children, Hops) with general headings; the Grains view reads as D61. Orders show counts per pack name. Copy has Unit and Pack columns. |
| Safety | `lock_version` on products: a stale save gets a 409 and writes nothing, and after a 409 the page waits for the refetch before the next save (DEV). Receiving into an existing lot # shows that lot's values read-only, and the API refuses a mismatch (422; a blank counts as a value). |
| Formula | `inventory_on_hand` returns `{value, unit}`, and refuses an ingredient whose products are in mixed units. `alpha_acid_pct` is kept, so `est_ibu` is unchanged. |
| Seed | `seeds/hop_reference.exs` on every environment: 6 companies, 27 hop products, 28 lots, 409.6 lb as Opening amounts dated 2026-11-19. |
| Backlog | O9 flake (5911 part), the `inventory_on_hand` units, DR-1 resolved, DR-4 claimed. |

**Migrations:**
- `20261119130001`: category keys.
- `20261119130002`: packs, units and manufacturer. These are **renames**.
- `20261120120001`: hop features and crop year.
- `20261120140001`: product `lock_version`, and offer form null on non-grain offers. This rebuilds
  `supplier_offers`.

**Rollback needs the pre-release snapshot.** The columns are renamed, so going back to the D61
image alone won't work.

## Local gate

- `mix test`: 2,739 passed, twice. `--warnings-as-errors` is clean.
- vitest 472 passed; tsc and build clean; lint 8, the same as `develop`.
- Full local Playwright after the last fix cycle: 858 passed. The one failure was D39 S73, a
  touch-drag flake; the brewery-board project then passed 436 of 436 on a rerun.

## Gate

| Pass | Result | Fix cycles |
|---|---|---|
| Local QA (18 scenarios, 360 px, slow network, two people) | pass with gaps: 2 must-fix, 6 should-fix, 4 minor | decisions 1. Gap 7 was by design (Matt: "Stick with new price"; D61 A4 stays) |
| Local recheck 1 | 11 of 12 fixed; new gaps 13–18 (one must-fix: a 500 on an existing-lot receipt) | decisions 2 |
| Local recheck 2 | 13–18 fixed; new minor gaps 19 and 20 | decisions 3 |
| Local recheck 3 | **pass** | — |
| DEV Playwright (`2a3bfed`) | 905 passed, 2 failed. G17 was a real latency race; O1 was the test | decisions 4 |
| DEV Playwright (`a9998ea`) | **909 passed, 0 failed** (51.9 min) | — |
| DEV QA (10 scenarios) | **pass with gaps**: 4 minor | **moved to D65 (Matt)**, branch `d65-carry-devqa` |

Reports in this folder: `d62_local_qa_report.md`, `d62_local_qa_recheck1.md` … `3.md` and
`d62_dev_qa_report.md`.

**Accepted for D65 (Matt, 2026-11-20):**
1. Companies list target reads "sacks".
2. Blank crop year accepted into an existing lot through the API (nothing changes).
3. A Receive split of 0 gives no message.
4. The library Category resets to Grains on Back.
5. Add lot leaves Supplier empty when the product has two offers.
