# D62: Hops, fruit, spices, sugars and other consumables — Plan

2026-11-19 · lead. **Spec:** `specs/d62_hops_other_ingredients_spec.md` (approved 2026-11-19 with
A1–A7 and the hop reference-data amendments).
**Branch:** `d62-hops-other-ingredients` in `~/src/rockcut`, from `develop` @ `b3b3678`.

## Where things are today (D61, on prod `v2026.11.19`)

- **Context and grain checks:** context `RockcutApi.Ingredients` (`lib/rockcut_api/ingredients/`).
  "Is this grain" is decided by **category name**: `Inventory.grain_lot?/1` checks `c.name ==
  "Grains" or parent "Grains"`, and `BrewingCalcs.get_category_ids/2` does the same for "Hops",
  "Grains" and "Sugars and Extracts". In the UI, `grainCategories()` in `lib/ingredientFeatures.ts`
  does it.
- **Grain products and lots:** a grain lot needs a product, a received date and a first movement.
  Other lots (hops, yeast, everything else) are the pre-D60 kind: no product required, no
  movements, edited in `IngredientLotDialog`.
- **Sacks everywhere:**
  - DB: `supplier_offers.sack_size_lb`, `ingredient_lots.sack_size_lb`,
    `inventory_movements.quantity_lb` / `unit_cost_per_lb`, `parties.order_target_sacks`,
    `ingredient_products.min_on_hand_sacks`, `purchase_order_lines.sacks_*` / `price_per_sack`,
    `supplier_offer_prices.price_per_sack`, `supplier_contract_lines.sacks` / `price_per_sack`.
  - Footprint: "sack" is in 19 API files (259 lines), 12 ExUnit files, 32 UI files (467 lines)
    and 13 Playwright files.
  - The display setting is `Units.quantity_display/1` (`"sacks"` | `"lb"`) from
    `board_settings.ingredients`.
- **Maltster:** `party_roles.role` ∈ `maltster supplier partner_brewery`, and
  `ingredient_products.maltster_party_id`. "maltster" appears in 42 files across API and UI.
  `Products.display_name/1` builds "Maltster Grain" / "Maltster Name (Grain)".
- **Features:**
  - `feature_types` already has `alpha_acid_pct` (1 decimal) and `attenuation_pct`.
  - `category_feature_types` has `sort_order` and `required` only.
  - `Features.copy_standard!/3` copies every product value onto a new lot.
  - `est_ibu` reads lot `alpha_acid_pct` through the recipe line's lot.
- **Old custom fields:** `category_field_definitions` seeds Form/Origin/Crop Year (Hops) and Form
  (Fruits, Spices, Sugars). No values are stored anywhere (D60 dropped `properties`).
- **Seeds:** `priv/repo/seeds.exs` evals `seeds/grain_reference.exs` (idempotent, every
  environment, through `Release.seed/0`). `Movement` requires `lot_id, kind, quantity_lb,
  occurred_on`; `entered_by_id` is optional.

## Shape

- **Category keys, not names.** Add `ingredient_categories.key` (unique, nullable) to the
  top-level categories:
  - keys: `grains`, `hops`, `fruits`, `spices`, `sugars`, `consumables`, `yeast`, `future`;
  - the migration sets them by today's names.
  - A new module **`Ingredients.Catalog`** holds the per-key rules:
    - `managed?(category)`: has products, packs and movements. Every key except `yeast` (D64)
      and `future`.
    - `forms(key)`, `units(key)`, `pack_names`.
    - `contract_unit(key)`: `:packs` for grains, `:lb` for hops, nil otherwise.
  - Every name check above moves to `Catalog`. Renaming a category in the UI can then never
    break the rules.
- **Packs:** one `Units` API for quantities in a product's unit:
  - `format_quantity(qty, pack_name, pack_size, unit, mode)` → "3 boxes 4.5 lb" / "37.5 lb";
  - whole numbers for `each`;
  - pack-name plurals (sack/sacks, box/boxes, …).
  - The UI mirrors it in `lib/ingredientFeatures.ts` / `formatQuantity`, with vitest.
- **Rename, don't alias.** DB columns, schema fields and **JSON keys** move from sacks to packs
  and from lb to quantity in one stage, with the UI and Playwright updated in the same stage. No
  dual names. Prod has no orders, contracts or lots, so nothing outside this repo reads the old
  keys.
- **Features:** `category_feature_types` gains:
  - `product_mode` ∈ `none | value | range`;
  - `lot_mode` ∈ `none | copy | enter`;
  - `lot_required` (bool);
  - `only_unit` (nullable: the feature applies only to products in this unit).
  
  `product_feature_values.value_high` holds a range's high end. `copy_standard!` copies only
  `lot_mode = copy` features.
- **Contracts:** `supplier_contract_lines.quantity` (decimal) + `price`. The unit comes from
  `Catalog.contract_unit/1` of the product's category:
  - grain: whole sacks, $/sack, as today;
  - hops: lb with 2 decimals, $/lb; the price row is written as $/box = $/lb × 11.
  
  The figures convert by weight to the line's unit (generalizes D61 gap 17a).

## Stages (each its own commits; stops marked ■)

1. **Packs, units and manufacturer: grain only, behavior unchanged** (spec §3.2, §3.3 form/unit/
   origin, §3.5, §3.9).
   - Migrations:
     - `ingredient_categories.key` (set by name).
     - Renames per the spec §3.5 table.
     - `pack_name` on offers and lots (`sack` for every existing row).
     - `ingredient_products.unit` (`lb` for every existing row), `form`, `origin`.
     - `maltster_party_id` → `manufacturer_party_id`; role rows `maltster` → `manufacturer`.
     - `users.board_settings` ingredients `quantity_display` `sacks` → `packs` (JSON update).
     - `supplier_contract_lines` `sacks`/`price_per_sack` → `quantity`/`price`.
   - Code: `Catalog`; `Units` generalized; every `grain_lot?` / name check moves to `Catalog`;
     `Products.display_name/1` takes the manufacturer, plus the form for non-grain products.
   - The UI says "Maltster" on grain screens and "Manufacturer" elsewhere (one helper, keyed on
     the category). Grain pack text reads "sacks" exactly as today.
   - `inventory_on_hand` returns `{value, unit}`, refusing mixed units for an ingredient
     (spec §3.9).
   - Deferred register: DR-1 → Resolved, DR-4 claimed.
   - ExUnit: migrations up on a D61-shaped database with orders, receipts, a contract and the
     `sacks` display setting, values intact. Every D60/D61 test is renamed and green.
   - Playwright: every `ingredients/` spec updated for the renamed JSON and still green, with no
     assertion weakened; the on-screen text for grain is unchanged.
   - ■ **Stop 1:** `mix ecto.reset` + seeds + synthetic setup clean; `mix test` green twice;
     tsc, vite build, lint (no new errors); full `ingredients` Playwright project green. Report
     the diff size.
2. **Hops** (spec §3.1 Hops, §3.4, §3.6 Hops, §3.7).
   - Migrations:
     - The `category_feature_types` modes.
     - `value_high`.
     - Feature types `beta_acid_pct` and `total_oil_ml_100g`.
     - `alpha_acid_pct` and `beta_acid_pct` decimals → 2.
     - `ingredient_lots.crop_year`.
     - Delete the Hops custom-field definitions and stop seeding them.
   - API:
     - Hop products: form ∈ T90 Pellet / Cryo / Whole leaf / Extract, unit lb.
     - Hop offers are forced to box · 11 lb (422 on anything else).
     - Hop lots need a product, crop year (2000..next year) and alpha. Ranges are on the product
       only; lots don't copy them.
     - Contract lines accept hop products in lb ($/lb, price row × 11). Other categories are
       refused with 422 "Contracts are for grain and hops".
   - UI:
     - Hops list (generalized `GrainsList` with per-category columns).
     - Product page and dialog with ranges.
     - Add lot / Receive ask for crop year and alpha, with the range shown; a value outside it
       is marked.
     - Contract dialog hop lines in lb.
     - The recipe lot label "YCH Citra Pellet · lot # · 2025 · 12.4% AA".
   - ExUnit pins `est_ibu`: a hop lot made through the new path gives the same IBU as a pre-D62
     lot with the same alpha, amount and time.
   - ■ **Stop 2:** `mix test` green twice, `--warnings-as-errors` clean; hop flows driven in a
     browser as `brewer1` and `breweryMgr`, desktop and 360 px. Report, including the size so
     far. **If D62 is running long, this is the split point (spec §6); raise it here.**
3. **Fruits, spices, sugars, other consumables** (spec §3.1, §3.4 Brix/extract, §3.6).
   - Migrations:
     - Other Consumables children Water Salts / Acids / Finings.
     - Feature type `brix`.
     - Applicability: Fruits Brix lot-only optional; Sugars extract `only_unit lb` (product value
       + lot copy) and Brix `only_unit gal` (lot only).
     - Delete the remaining D62 custom-field definitions.
     - Future Ingredients: deleted if empty; if not, left in place and logged for the release
       notes.
     - Hide Add field on these categories (UI) and refuse it (API).
   - `each` products: whole numbers in every quantity entry and the API (422 "Whirlfloc is
     counted in whole units").
   - A sugar's form decides its unit (Dry → lb, Liquid → gal).
   - Lists, product pages and dialogs for each category. Totals:
     - a unit column;
     - quantity subtotals per unit, $ grand total only;
     - category and manufacturer filters;
     - Copy with a Unit column.
   - ■ **Stop 3:** as Stop 2, plus Totals and To order driven with mixed units.
4. **Reference data, Playwright, coverage.**
   - `priv/repo/seeds/hop_reference.exs`, idempotent and evaluated by `seeds.exs` after the grain
     reference. The data is embedded in the file; the CSVs in `reference/` are git-excluded.
     - **Parties:** John Fearless, Lupulin Exchange, Billy Goat, Michigan Hop Alliance, Yakima
       Chief Hops (manufacturer + supplier), BSG (+ manufacturer).
     - **27 products** with origin and ranges (`reference/d62_hop_products.csv`).
     - One **offer** each (box · 11 lb, no price).
     - **28 lots** (`reference/d62_hops_matt_2026-11-19.csv`, EKG excluded): lot #, crop year,
       alpha, supplier, plus an **Opening amount** movement of the listed lb dated 2026-11-19.
       Variety names drop the "(23-2)" labels; Citra (24-cryo) is the Cryo product.
     - A lot already present (same product + lot #) is skipped, never topped up, so reruns are
       safe.
   - The fruit, sugar and salt reference data is **not provided yet**. Seed it here if Matt sends
     it before Stop 4; otherwise it's entered on the screens.
   - **Synthetic data:** `[SEED]` scenario data is unchanged. Check that no existing Playwright
     spec assumes an empty Hops category or a fixed total lot count. The seeded hops are on
     every environment now.
   - **Playwright** `tests/regression/ingredients/`: new files from spec §9 (hops, fruit/sugar/
     consumables, contracts with hop lines, totals with units, two people one record, phone,
     slow network); `[TEST-TEMP]` rows only, cleaned up by id. Contract tests use a
     `[TEST-TEMP]` supplier and a future year.
   - **5911 O9:** find the race in `owner.spec.ts` O9 (look for a reload or `goto` right after a
     write, or a phone dialog's `history.back()`), fix it, run it 10× under full-project load.
   - `tests/COVERAGE.md` D62 section.
   - ■ **Stop 4:** the full local gate.

## Gate

- **Order (D44/D60/D61):** local gate → independent local QA → DEV Playwright + a shorter DEV QA.
- **Local QA brief must include:**
  - 360 px with no sideways scroll on every changed page;
  - slow-network double-submit on Add lot, Receive, the order and contract saves;
  - **two people, one record** (an order with hop lines, a contract with a hop line, a product
    edited in two tabs).
- **Runs:** every Playwright and QA run, reruns included, in its own herdr tab with pwwatch /
  qawatch.
- **QA safety:**
  - destructive actions only by exact id on its own `[TEST-TEMP]` rows;
  - QA never edits or deletes the seeded hop products or lots (real cooler data) and never makes
    a current-year contract for a real supplier.

## Release

- **Rollback needs the snapshot.** The migrations rename columns and roles, so rollback to
  `v2026.11.19` needs the **pre-release snapshot**; the old image alone won't run on the renamed
  schema. Take it and record it in the deploy notes.
- **Before deploying, check prod for:**
  - lots in D62 categories with no product (the migration stops if it finds any; expect none);
  - ingredients in Future Ingredients (left in place if present; tell Matt).
  
  These checks are for a human or the migration's own guard. Agents don't query prod.
- **Seed on prod after deploy** (`RockcutApi.Release.seed()`, as D60): the hop reference with
  its 28 lots. Matt checks the Hops list against the cooler.
- No device, notification or schedule changes. No new secrets.

## Risks

- **The rename's reach:** about 700 lines across API, UI and tests in Stage 1. The mitigation is
  Stage 1 = rename only with grain behavior unchanged, gated by the whole D60/D61 suite before any
  hop code lands. Search for `sack`, `quantity_lb`, `maltster` at Stop 1 and explain every
  remaining hit (grain wording is allowed).
- **Seeded real lots on DEV/local:** tests and QA see 28 real-looking hop lots. Any spec that
  counts lots or totals must filter to its own `[TEST-TEMP]` rows.
- **Feature modes:** a range on the product and a single value on the lot is new. Validation
  must refuse low > high, and a lot value outside the range is allowed and marked, never refused.
- **Mixed units in totals:** never add lb to gal. One ExUnit per total path.
- **`est_ibu`:** alpha decimals 1 → 2 must not change stored values (it widens only); pinned by
  ExUnit.
- **Size:** larger than D61 because of Stage 1. If Stage 3 is still ahead when Stop 2 lands
  late, split after hops (spec §6) and say so at Stop 2.

## Split (Matt, 2026-11-20, at Stop 2)

Stage 3 moves to **D65** (fruits, spices, sugars, other consumables); D62 goes straight from
Stop 2 to Stage 4 (hop reference seed, Playwright, O9, COVERAGE) and the gate. Stage 4 drops the
fruit/sugar/salt seed. Order: D62 → D65 → D64 → D63.
