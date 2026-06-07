# Changes — 2026-06-07 (Session 2)

## Grain lot schema — new columns

Migration: `20260607200000_update_ingredient_lots_grain_fields.exs`

- Renamed `potential_gravity` → `extract_potential_fgdb` (decimal, FGDB %)
- Added: `maltster` (string), `protein_perc` (decimal), `moisture_perc` (decimal), `order_name` (string), `order_unit_size` (string)
- `alpha_acid` and `attenuation` retained for hops/yeast use
- `properties` JSON field retained for future use

Migration: `20260607210000_add_diastatic_power_to_ingredient_lots.exs`

- Added: `diastatic_power_linter` (decimal)

Updated throughout: `ingredient_lot.ex` schema, `json_helpers.ex`, `types.ts`, `IngredientLotDialog.tsx`.

Formula engine `gravity_points` stubbed to return 0 pending rewrite with FGDB-based calculation.

## Grain lot dialog — category-aware field visibility

`IngredientLotDialog` now accepts `categoryName` prop. Alpha Acid and Attenuation fields are hidden when category is `Grains`.

`IngredientDetail` passes `ingredient.category?.name` to the dialog.

## Real grain seed data

Replaced placeholder grain seeds with real maltster data:

- **38 grain ingredients** (2-Row through Wheat, White)
- **44 grain lots** with full spec data: maltster, supplier, moisture %, FGDB %, protein %, color (°L), diastatic power (°Lintner), order name, order unit size
- Sources: Root Shoot (RS), BSG distribution (Weyermann, Simpsons, Rahr, Crisp, Dingmans/Dingemans, Grain Millers)
- Non-grain placeholder seeds (6 hops, 4 yeast, 1 sugar, 2 other) retained

Seeds now insert grain lots and non-grain lots as separate `Repo.insert_all` calls (SQLite requires uniform key sets per batch).

To reset and reseed dev database:
```bash
docker exec rockcut_api_1 sh -c "mix ecto.drop && mix ecto.create && mix ecto.migrate && mix run priv/repo/seeds.exs"
docker restart rockcut_api_1
```

## Lot summary API — full fields in ingredient detail response

`ingredient_lot_summary` in `json_helpers.ex` previously returned only a subset of columns. Now includes all grain-specific fields so the lot editor pre-populates correctly when opened from the ingredient detail page.

Added to summary: `received_date`, `maltster`, `moisture_perc`, `protein_perc`, `diastatic_power_linter`, `order_name`, `order_unit_size`, `notes`.

`IngredientLotSummary` TypeScript interface updated to match.

## Recipe ingredient dialog — cascading selectors

`RecipeIngredientDialog` replaced flat lot dropdown with a three-level cascade:

1. **Category** — fetches from `/api/ingredient_categories`, defaults to Grains on open
2. **Ingredient** — fetches from `/api/ingredients?category_id=...`, disabled until category selected
3. **Lot** — filtered client-side by selected ingredient, disabled until ingredient selected

Changing category clears ingredient and lot. Changing ingredient clears lot. When editing an existing recipe ingredient, all three fields pre-select from the existing lot's data.
