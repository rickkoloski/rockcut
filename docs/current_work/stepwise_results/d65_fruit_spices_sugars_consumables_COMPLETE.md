# D65: Fruit, spices, sugars and other consumables — COMPLETE (DEV gate)

**Deliverable:** D65 puts fruits, spices & flavorings, sugars and extracts, and other consumables
(water salts, finings) on the D60–D62 product model. It was split out of D62 (Matt, 2026-11-20).
**Spec:** `docs/current_work/specs/d65_fruit_spices_sugars_consumables_spec.md`. It was approved
2026-11-20 with A8–A16 and the reference-data amendments.
**Plan:** `docs/current_work/planning/d65_fruit_spices_sugars_consumables_plan.md`.
**Brief and decisions:** `prompts/d65_builder_brief.md` (Stops 0–3), and
`prompts/d65_lead_decisions_1.md` … `_4.md`. Decisions 5 (gap 9) moved to D64 (Matt).
**Branch:** `d65-fruit-spices-sugars-consumables`, from `develop` @ `84071e7`.
**Tested on DEV:** `cec1228`.

## What changed

The scenario → test mapping is in `rockcut-ui/tests/COVERAGE.md` (D65).

| Area | Change |
|---|---|
| Stop 0 | D62's DEV QA carry-overs: <ul><li>the Companies target wording;</li><li>a blank crop year into an existing lot;</li><li>a Receive split of 0;</li><li>the library's Back keeps the category;</li><li>Add lot's Supplier when a product has two offers;</li><li>a lot needs a supplier when its product has an active offer.</li></ul> |
| Categories | <ul><li>Fruits, Spices & Flavorings and Sugars and Extracts have no subcategories and no Add field (API 422).</li><li>Other Consumables has Water Salts and Finings, and more can be added. Whirlfloc moved under Finings.</li><li>Irish Moss and Future Ingredients were removed, and Corn Sugar became "Dextrose (Corn Sugar)".</li></ul> |
| Forms, units, packs | Fixed lists per category: <ul><li>Fruits: Purée, Whole or Juice / concentrate, in gal or lb;</li><li>Spices: Whole, Ground or Extract, in oz or fl oz;</li><li>Sugars: Dry (lb) or Liquid (lb or gal);</li><li>Water Salts: Powder or Flake, in lb;</li><li>Finings: Liquid, Powder or Tablet, in fl oz, lb or each.</li></ul>Pack names come from the category's list. Unit and form are locked once a product has a lot. |
| Manufacturer | Optional, shown as "None" (the products table is rebuilt with a nullable manufacturer). Product names are unique in any letter case, and "None" isn't allowed as a name. "Other manufacturer…" opens a searchable list of every manufacturer. |
| `each` | Whole numbers everywhere, and a pack quantity that isn't whole is refused, never rounded. A Tablet product reads "tablets": "1 tablet", "is counted in whole tablets". |
| Features | <ul><li>Brix: a typical range on fruit products, optional on fruit lots and Liquid sugar lots, with out-of-range values marked.</li><li>Extract % FGDB (2 dp) on every sugar, copied to lots.</li><li>Water Salts ingredients have a formula and ion contributions (`ingredient_feature_values`), saved in one action.</li><li>Every feature value must have its feature's shape, or the API returns a 422.</li></ul> |
| Offers | A pack note (≤ 40 characters), for example "tub · 872 tablets (5 lb)". |
| Purchasing | <ul><li>Mixed-category orders count packs, and an order with no offer yet reads "packs".</li><li>To order and Totals show each product in its own unit, with per-unit subtotals and one $ grand total (on its own row in Copy).</li><li>The Manufacturer filter has None.</li><li>Contracts stay grain and hops only.</li></ul> |
| Safety | <ul><li>Refusals scroll into view in FormDialog.</li><li>Deletes that would hit a foreign key give a 422 sentence, never a 500.</li><li>A lot's pack name is checked against its category.</li></ul> |
| Seed | `seeds/d65_reference.exs` on every environment: 8 companies, 36 ingredients, 29 products, 30 offers and 26 prices (salts from BSG, sugars, Aseptic Fruit and SoNature fruit, Whirlfloc T, and 10 spices with no products). No lots. Running it again adds nothing. |
| Tests | `test.slow()` on the three long D65 tests. |

**Migrations:**
- `20261121120001`: adds `ingredient_feature_values` and `ingredients.formula`.
- `20261121120002`: **rebuilds `ingredient_products`** with a nullable manufacturer.
- `20261121120003`: categories (Water Salts, Finings, Whirlfloc, Dextrose; removes Irish Moss and Future Ingredients and the old Form fields).
- `20261121130001`: D65 feature types and the offer `pack_note`.
- `20261121140001`: makes the product name index case-insensitive. It stops and names any case-only duplicates.

**Rollback needs the pre-release snapshot.** The products table is rebuilt, and rows without a
manufacturer can't go back to the D62 schema.

## Local gate

- `mix test`: 2,806 passed, twice. `--warnings-as-errors` is clean.
- vitest 513 passed; tsc and the build are clean; lint shows 8, the same as `develop`.
- Full local Playwright on `cec1228`: 960 passed, 1 skipped.

## Gate

| Pass | Result | Fix cycles |
|---|---|---|
| Local QA (18 scenarios, 360 px, slow network, two people) | fail: 2 must-fix, 3 should-fix, 8 minor | decisions 1 |
| Local recheck 1 | 12 of 13 fixed, gap 8 partly; new minor gaps 14–16 | decisions 2 (checked on DEV, D8) |
| DEV Playwright (`15e9c12`) | 952 passed. S123 failed and passed on rerun | — |
| DEV QA (D1–D9, `15e9c12`) | fail: 1 must-fix (gap 2, later shown to be QA's false positive), 1 should-fix, 4 minor | decisions 3 |
| DEV Playwright (`db7595e`) | **960 of 960**. One D65 test timed out and passed on rerun | timing fixed in decisions 4 |
| DEV QA recheck 1 (`db7595e`) | all 6 fixed; new gaps 7 (minor) and 8 (should-fix) | decisions 4 |
| DEV Playwright (`cec1228`) | **961 of 961**. d58 S16 failed and passed on rerun (5911) | — |
| DEV QA recheck 2 (`cec1228`) | **pass with gaps**: 7 and 8 fixed; new minor gap 9 | **moved to D64 (Matt)** |

The seeded reference data was unchanged across every QA pass: the diff was 0 each time.

Reports in this folder: `d65_local_qa_report.md`, `d65_local_qa_recheck1.md`,
`d65_dev_qa_report.md`, `d65_dev_qa_recheck1.md` and `d65_dev_qa_recheck2.md`.

**Matt's decisions (2026-11-22):**
- The reference values stand (Dextrose 91 %, Belgian Candy Syrup 70 %, Cherry 11.4 °Bx, the salt forms).
- "Whirlfloc T · None" is the product label.
- The form stays locked once a product has a lot.
- The ExUnit first-run failures are added to backlog 5911.

**Moved to D64:** gap 9. An order line with no offer yet labels its fields "Sacks" and
"$ / sack"; see `prompts/d65_lead_decisions_5.md`.

The head of this PR is `cec1228` plus docs only.
