# D65: Fruit, spices, sugars and other consumables — Plan

2026-11-20 · lead. **Spec:** `specs/d65_fruit_spices_sugars_consumables_spec.md` (approved
2026-11-20 with A8–A16 and the reference-data amendments).
**Branch:** `d65-fruit-spices-sugars-consumables`, worktree `~/src/rockcut-d65`. It's cut from
D62's DEV build `a9998ea`.
- **Before the builder starts**, it's rebased onto `develop` after D62 merges, along with any D62
  DEV fix cycle.
- The builder works in `~/src/rockcut` as usual, once D62 is off its hands.

## Where things are (D62, as built)

- **`Ingredients.Catalog`** (`lib/rockcut_api/ingredients/catalog.ex`) holds the rules per
  category key:
  - `@managed ~w(grains hops)`;
  - `forms/1`, `units/1`, `pack_names/0,1` and `fixed_pack/1` cover grain and hops only;
  - `contract_unit/1` returns nil for every other key, so contracts already refuse D65 products.
- **Products** (`product.ex`):
  - `validate_required([:ingredient_id, :manufacturer_party_id, :unit])`;
  - the unique index is on `(ingredient_id, manufacturer_party_id, coalesce(form,''),
    coalesce(name,''))`. SQLite treats NULLs as distinct, so a NULL manufacturer would let
    duplicates through;
  - `Products.display_name/1` pattern-matches `manufacturer: %{name: maker}`, so a NULL maker
    falls through to `nil`.
- **Features:**
  - `category_feature_types` has `product_mode` (none/value/range), `lot_mode` (none/copy/enter),
    `lot_required` and `only_unit`. There's **no `only_form`**, which Brix-on-Liquid-sugars needs;
  - `product_feature_values` has `value` + `value_high`;
  - `extract_fgdb` is 1 decimal;
  - nothing holds feature values on an **ingredient**.
- **Units:** `units.ex` already treats `each` as whole numbers (`places("each") → 0`) and labels it
  "each".
- **Totals:** the Inventory Category filter and general view exist. Subtotals are per unit only
  where D62 needed them (lb).
- **Seeds:** `seeds.exs` seeds the categories, Future Ingredients, the old Form fields for Fruits,
  Spices and Sugars, and the ingredients Corn Sugar (Dextrose), Irish Moss and Whirlfloc. The
  reference data is `seeds/grain_reference.exs` and `seeds/hop_reference.exs`, idempotent and run
  through `Release.seed/0`.

## Shape

### Catalog

- `@managed` grows to `~w(grains hops fruits spices sugars consumables)`.
- `forms/1`, `units/1` and `pack_names/1` per §4.2.
- For `consumables`, the lists depend on the **child**, so add `forms/2` and `units/2` that take
  the category, plus a child-name map: Water Salts and Finings. Any other child gets the
  union of the two (A10).
- `Sugars`: Dry → `["lb"]`; Liquid → `["lb", "gal"]`.
- `manufacturer_required?/1` is true for grains and hops only (decision 8).

### Migrations (additive and tidy-ups)

1. `feature_types`:
   - add `brix` (°Bx, 0–100, 1 dp);
   - add the seven ion types (`ca_ppm_per_g_gal` … `cl_ppm_per_g_gal`, ppm @ 1 g/gal, 0–1000,
     1 dp);
   - set `extract_fgdb` to **2 dp**.
2. `category_feature_types`:
   - add a nullable **`only_form`**;
   - Fruits get `brix` (product range, lot enter, optional);
   - Sugars get `extract_fgdb` (product value, lot copy) and `brix` (product none, lot enter,
     optional, `only_form: "Liquid"`).
3. **`ingredient_feature_values`** (`ingredient_id`, `feature_type_id`, `value`), unique per pair.
   Add **`ingredients.formula`** (text, optional).
4. **`supplier_offers.pack_note`** (text, optional, ≤ 40 characters).
5. **Products:**
   - make `manufacturer_party_id` nullable;
   - rebuild the unique index as `(ingredient_id, coalesce(manufacturer_party_id, 0),
     coalesce(form,''), coalesce(name,''))`.

   SQLite needs a table rebuild to drop NOT NULL. Use D62's `20261120140001` rebuild of
   `supplier_offers` as the pattern, with foreign keys off/on and a check afterwards.
6. **Categories:**
   - add Water Salts and Finings under Other Consumables (no Acids);
   - move Whirlfloc into Finings by name;
   - rename "Corn Sugar (Dextrose)" to "Dextrose (Corn Sugar)";
   - delete Irish Moss when it has no products, lots or recipe lines;
   - delete Future Ingredients when it's empty;
   - delete the Form fields for Fruits, Spices and Sugars;
   - stop if a D65 category has a lot with no product (the message names it).

   Each step is idempotent, and anything kept is logged for the release notes.

### API

- **`Product.changeset`:**
  - the manufacturer is required only when `Catalog.manufacturer_required?/1`;
  - form and unit are checked against the category (or child) lists;
  - the unit is fixed once a lot exists (D62 rule).
- **`Products.display_name/1`:** a nil maker reads "Ingredient Form (Name) · None"; no maker means
  the "None" suffix. Check every caller: pickers, Totals, the recipe lot label, the duplicate
  sentence.
- **Ingredient features:**
  - `GET` and `PUT` ion values on the ingredient (Water Salts only; anything else is a 422);
  - formula on the ingredient;
  - the product JSON includes the ingredient's ion values, read-only.
- **Features:** `only_form` is handled wherever `only_unit` is (lot dialogs, receive, the API
  check).
- **`each`:** whole numbers are already enforced by `units.ex`. Add the 422 sentence "Whirlfloc
  T is counted in whole tablets" on movements, counts, receipts and pack sizes, and an ExUnit test
  for each.
- **Unit label:** a product with form Tablet and unit `each` reads "tablets", in the API's
  `unit_label` and in the UI.
- **Totals:** per-unit quantity subtotals in the general view (lb, gal, oz, fl oz, each).
- **Hide Add field and Add subcategory** on Fruits, Spices and Sugars, and return 422 in the API,
  as D62 did for Hops. Other Consumables allows children.

### UI

- The library lists for the four categories use the hop list layout (`GrainsList`, generalized),
  grouped by child for Other Consumables.
- The product dialog:
  - unit per category, or per form for Sugars;
  - the manufacturer is optional for D65, shown as "None";
  - Extract for sugars, and Brix range for fruit.
- The ingredient dialog gets formula and the ion grid for Water Salts. The product page shows the
  ions read-only.
- Add lot and Receive show Brix (fruit; Liquid sugars) and extract (sugars, copied). `each` lots
  take whole numbers.
- The offer dialog gets pack names per category, default pack by unit, and the pack note.
- Totals show per-unit subtotals. To order shows "0 tablets" or "0 lb".
- The recipe lot label shows Brix (A11).

### Seeds (`seeds/d65_reference.exs`, every environment, idempotent by name)

The data is embedded from the git-excluded CSVs in `docs/current_work/reference/`:

| Batch | What gets seeded |
|---|---|
| **Salts** | 7 ingredients with formula and ions; BSG offers bag · 50 lb with prices (6 products, manufacturer None) |
| **Sugars** | 6 products with extract; BSG and Redstone offers with $/lb × weight; companies Candico, Sweetener Sup Co., Colorado Honey Co., Redstone |
| **Fruit** | Aseptic Fruit: 12 products, 13 offers (Strawberry has two), Brix ranges, prices. SoNature: 4 products, Brix values, no prices |
| **Finings** | Whirlfloc T, Tablet, each, BSG tub · 872 with the note "5 lb", $92.00 |
| **Spices** | 10 ingredients only |

- Prices are effective 2026-11-20. No lots are seeded.
- The **synthetic `[SEED]` data** gets one fruit lot, one sugar lot and one Whirlfloc lot with
  minimums, for To order and Totals.

## Stages and stops

0. **Stop 0: carry the D62 DEV QA fixes** (spec, last-but-one amendment).
   - Branch `d65-carry-devqa`, at `cb9ed73` on top of D62's `a9998ea`, holds:
     - gap 1 (`c939d17`) and gap 2 (`fcaefe4`), committed with tests;
     - gaps 3, 4 and the Add lot supplier as an unfinished `wip` commit;
     - D62 decisions 5 (`1a3b3f5`).
   - After D62 merges and D65 is rebased, cherry-pick these onto D65. Finish the wip, give each
     fix a test that fails without it, and keep the decisions doc.
1. **Stop 1: categories, catalog, products.**
   - Migrations 3, 5 and 6 (the product rebuild runs with the API down; ask first);
   - Catalog, `Product.changeset`, `display_name` with None;
   - the library, product dialog and product page for the four categories;
   - `each` and the tablets label;
   - grain and hops stay green: ExUnit ×2 and the ingredients Playwright project.
2. **Stop 2: features, offers, totals.**
   - Migrations 1, 2 and 4;
   - Brix (range and `only_form`), extract 2 dp on sugars, and ions on the ingredient;
   - the pack note, per-unit totals, To order units and the recipe lot label;
   - Playwright for the §10 scenarios.
3. **Stop 3: seeds and gate prep.**
   - `d65_reference.exs` and `[SEED]` data, with a test that the seed is idempotent and counts
     match;
   - COVERAGE and the full local suite;
   - then local QA → DEV.

## Risks

- **The product table rebuild** (nullable manufacturer). Test the down migration on a copy, and
  check that every foreign key into `ingredient_products` survives (offers, lots, order and
  contract lines, recipe lines).
- **`display_name` with a nil maker** reaches many screens. Grep every use, and write a vitest for
  the label helpers.
- **Grain and hop regressions** from widening `@managed`. Run the D60, D61 and D62 specs at every
  stop.
- **Release:** prod gets the reference seed through `Release.seed()`. **Rollback needs the
  pre-release snapshot:** once the seed writes products with no manufacturer, D62's image can't
  read them (it requires a manufacturer). Take the snapshot before the API deploy, as D55/D60/D62
  did.

## Release (builder, Stop 3, 2026-11-21)

**Take the pre-release snapshot first.** Rollback needs it: once the seed writes products with no
manufacturer (the salts, Lactose, Dextrose (Corn Sugar), SoNature's four fruit, Whirlfloc T), D62's
image can't read them. `20261121120002`'s `down` refuses while any such product exists.

**Migrations, in order:**

| Version | What | API |
|---|---|---|
| `20261121120001` ingredient_feature_values_and_formula | new table + `ingredients.formula` (additive) | may stay up |
| `20261121120002` products_optional_manufacturer | rebuilds `ingredient_products` with foreign keys off, then `foreign_key_check` | **down** |
| `20261121120003` d65_categories | Water Salts and Finings, Whirlfloc into Finings, Dextrose rename, removes Irish Moss and Future Ingredients, drops three Form fields | down (same deploy) |
| `20261121130001` d65_features_and_pack_note | Brix and seven ion types, extract 2 dp, `only_form`, Fruits/Sugars rows, `pack_note` (additive) | may stay up |
| `20261121140001` product_name_any_case | lead decisions 1, gap 12: the product unique index on `lower(name)` (index only; `down` restores the case-sensitive one) | may stay up |

The deploy runs all five together, so the API is down for the deploy as usual.

**`20261121140001` stops** (raises, nothing changed) when products of one ingredient, manufacturer
and form have names that differ only in case, naming each pair (id and name). Prod expects none;
check before the deploy:
`SELECT group_concat(id || ' ' || quote(name), ', ') FROM ingredient_products GROUP BY
ingredient_id, coalesce(manufacturer_party_id, 0), coalesce(form, ''), lower(coalesce(name, ''))
HAVING count(*) > 1;` must return no rows. (Locally it found QA's `[TEST-TEMP]` KT-872 / kt-872.)

**What migration 6 may keep, and log** (`Logger.warning`, "D65: kept …"), for the release notes:
- Irish Moss when it has products, lots or recipe lines (count of each logged);
- Future Ingredients when it holds ingredients or subcategories (their names logged);
- anything left at the top of Other Consumables (each name logged);
- a "Water Salts"/"Finings" name already used by another category (not added).

It **stops** (raises, nothing changed) when a lot in a D65 category has no product, naming each one.
Prod had no such lots at the D61 pre-check. Locally it kept nothing.

**Reference seed** (`Release.seed()` → `seeds.exs` → `seeds/d65_reference.exs`, idempotent by name):
- prints `D65 reference: 8 companies, 36 new ingredients, 29 new products, 30 new offers, 26 new prices`
  the first time, and 0 new after that;
- **36** new ingredients: 7 salts + 5 sugars + 14 fruit + 10 spices. Dextrose (Corn Sugar) and
  Whirlfloc already exist and are reused (the brief's 37 counted Dextrose);
- **29** products (6 salts, 6 sugars, 16 fruit, 1 fining), **30** offers, **26** priced (SoNature's
  4 have no price), prices effective 2026-11-20, **no lots**;
- grain and hop reference counts unchanged (44 grain products; 27 hop products, 28 hop lots,
  409.6 lb);
- typical values for Matt to check before release: Dextrose 91 %, Belgian Candy Syrup 70 %,
  Cherry 11.4 °Bx, and the salt forms (A13).

`[SEED]` data (DEV and local only, `mix rockcut.synthetic.setup`): `[SEED] Peach` (Purée, gal),
`[SEED] Rice Syrup Solids` (Dry, lb), `[SEED] Fining Tablets` (Tablet, each), each with a BSG offer,
a minimum of 2 packs and one lot.
