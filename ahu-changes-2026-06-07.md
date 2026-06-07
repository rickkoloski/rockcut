# Changes — 2026-06-07

## Ingredient category renames

| Old | New |
|---|---|
| Grain | Grains |
| Extract | Future Ingredients |
| Hop | Hops |
| Yeast | Yeast Strains |
| Fruit | Fruits |
| Spice | Spices & Flavorings |
| Sugar | Sugars and Extracts |
| Adjunct | Other Consumables |

Migration: `20260607180807_rename_ingredient_categories.exs`  
`seeds.exs` updated to use new names throughout.

## Ingredient library UI redesign

`IngredientsList.tsx` replaced DataGrid with expandable table:
- Defaults to Grains on load
- Each ingredient row shows lots underneath, collapsible with caret
- Lot rows show: lot number, supplier, status, non-null numeric values
- "On Hand" chip counts available lots
- `list_ingredients` in `brewing.ex` now preloads lots

## Grain lot schema — ingredient_lots table

Migration: `20260607200000_update_ingredient_lots_grain_fields.exs`

- Renamed `potential_gravity` → `extract_potential_fgdb` (decimal, FGDB %)
- Added: `maltster` (string), `protein_perc` (decimal), `moisture_perc` (decimal), `order_name` (string), `order_unit_size` (string)
- Kept `alpha_acid` and `attenuation` for hops/yeast use
- Removed `properties` JSON textarea from `IngredientLotDialog`

Updated throughout: schema, seeds, json_helpers, types, UI dialogs and list display.

Formula engine `gravity_points` stubbed to return 0 pending rewrite with FGDB-based calc.
