# Session Handoff — 2026-06-07 (Session 2)

**Purpose:** Context preservation before conversation compact. Pick up from here.

---

## Project

**Rockcut Brewing Co** — brewery management app for Matt, Rockcut Brewing Co, Estes Park, Colorado.

**Stack:**
- API: Phoenix 1.8 / Elixir, SQLite, port 4002 locally
- UI: React 19 / Vite / MUI 7 / pnpm, port 5174 locally
- Hosting: Fly.io (`rockcut-api.fly.dev`, `rockcut-ui.fly.dev`)
- Shared dep: `datagrid-extended` from `~/src/shared/ui-components/datagrid-extended/`
- SDLC framework: `~/src/pm-sdlc/`

**Running locally:**
- API: `docker-compose up api` (from `rockcut/` root)
- UI: `pnpm dev --port 5174` (from `rockcut/rockcut-ui/`)
- Login: `matt@rockcut.com` / `rockcut2026`

**Branch:** `practice1`

**Next deliverable ID: D10**

---

## Completed This Session

### 1. Grain lot schema overhaul

Two migrations applied:

**`20260607200000_update_ingredient_lots_grain_fields.exs`**
- Renamed `potential_gravity` → `extract_potential_fgdb` (decimal, FGDB %)
- Added: `maltster`, `protein_perc`, `moisture_perc`, `order_name`, `order_unit_size`
- Kept `alpha_acid`, `attenuation` for hops/yeast
- Kept `properties` JSON for future use

**`20260607210000_add_diastatic_power_to_ingredient_lots.exs`**
- Added: `diastatic_power_linter` (decimal, °Lintner)

Formula engine `gravity_points` stubbed to return 0 — needs rewrite with FGDB-based calc. This is a known broken state, intentional.

### 2. Lot dialog category-aware fields

`IngredientLotDialog` accepts `categoryName` prop. Alpha Acid and Attenuation hidden for Grains. `IngredientDetail` passes `ingredient.category?.name`.

### 3. Real grain seed data

Dev database reset and reseeded with real inventory data:
- 38 grain ingredients, 44 grain lots
- Full spec per lot: maltster, supplier, moisture %, FGDB %, protein %, color (°L), diastatic power (°Lintner), order name, order unit size
- Sources: Root Shoot (RS direct) and BSG distribution (Weyermann, Simpsons, Rahr, Crisp, Dingmans, Dingemans, Grain Millers)
- Non-grain placeholders retained (6 hops, 4 yeast, 1 sugar, 2 other)

**To reset dev DB:**
```bash
docker exec rockcut_api_1 sh -c "mix ecto.drop && mix ecto.create && mix ecto.migrate && mix run priv/repo/seeds.exs"
docker restart rockcut_api_1
```
Note: after `ecto.drop/create`, the running Phoenix process holds a stale file handle — `docker restart` is required to reconnect to the new DB file.

### 4. Lot summary API fix

`ingredient_lot_summary` in `json_helpers.ex` now returns all lot fields including the new grain-specific ones. Previously the lot editor showed blank fields because the ingredient detail response used the lean summary. `IngredientLotSummary` TypeScript type updated to match.

### 5. Recipe ingredient dialog — cascading selectors

`RecipeIngredientDialog` now has three cascading selectors:
1. **Category** → defaults to Grains, fetches from `/api/ingredient_categories`
2. **Ingredient** → fetches `/api/ingredients?category_id=...`, disabled until category chosen
3. **Lot** → filtered client-side from all lots by ingredient id, disabled until ingredient chosen

Changing category clears ingredient + lot. Changing ingredient clears lot. Edit mode pre-populates all three from the existing lot's data.

---

## Current State of Key Files

| File | What changed |
|---|---|
| `rockcut_api/priv/repo/migrations/20260607180807_rename_ingredient_categories.exs` | Renames 8 categories |
| `rockcut_api/priv/repo/migrations/20260607200000_update_ingredient_lots_grain_fields.exs` | Grain lot schema |
| `rockcut_api/priv/repo/migrations/20260607210000_add_diastatic_power_to_ingredient_lots.exs` | Diastatic power column |
| `rockcut_api/lib/rockcut_api/brewing/ingredient_lot.ex` | All new grain fields |
| `rockcut_api/lib/rockcut_api_web/controllers/json_helpers.ex` | Full fields in lot + lot_summary renders |
| `rockcut_api/lib/rockcut_api/formulas/functions/brewing_calcs.ex` | gravity_points stubbed (broken, intentional) |
| `rockcut_api/priv/repo/seeds.exs` | 38 grains, 44 lots with real data |
| `rockcut-ui/src/lib/types.ts` | IngredientLot + IngredientLotSummary updated |
| `rockcut-ui/src/pages/ingredients/IngredientsList.tsx` | Expandable table, defaults to Grains |
| `rockcut-ui/src/pages/ingredients/IngredientLotDialog.tsx` | New grain fields, category-aware visibility |
| `rockcut-ui/src/pages/ingredients/IngredientDetail.tsx` | Passes categoryName to lot dialog |
| `rockcut-ui/src/pages/recipes/RecipeIngredientDialog.tsx` | Cascading category → ingredient → lot |

---

## Known Gaps / Next Work

### Formula engine broken (intentional)
`gravity_points` in `brewing_calcs.ex` returns 0. The old formula used SG format (1.037). The new field `extract_potential_fgdb` stores FGDB % (e.g. 80.3). Formula needs rewriting:
```
PPG = fgdb_pct * 0.46
gravity_points = PPG * weight_lbs * efficiency / volume_gallons
```
Also: `get_fermentable_category_ids` in `brewing_calcs.ex` still uses old category names (`"Grain"`, `"Extract"`, `"Sugar"`). These no longer exist — should be `"Grains"`, `"Sugars and Extracts"`. OG calculation will be 0 until both are fixed.

### Ingredient library display
The ingredient list (IngredientsList.tsx) lot rows only show supplier, color, and FGDB. Maltster, moisture, protein, diastatic power are in the DB but not displayed in the list view. User did not want to address this yet.

### Non-grain ingredient schemas
Hops, Yeast Strains, Other Consumables still use placeholder seed data. Their lot schemas (alpha_acid, attenuation) are intact but the field design hasn't been revisited. The user was approaching this category-by-category.

### IngredientLotDialog is category-agnostic for display
The lot editor shows all grain fields regardless of category. For hops it shows maltster, moisture, protein, diastatic power (which are irrelevant). Making the dialog fully category-aware (show only relevant fields per category) is future work.

### Unit field in recipe ingredients
The "Unit" field in `RecipeIngredientDialog` is a free-text box. Could be a dropdown (lb, oz, kg, g) for grain.

---

## Resume Instructions

1. Start services if not running:
   ```bash
   docker-compose up api          # API on :4002
   cd rockcut-ui && pnpm dev      # UI on :5174
   ```

2. Read this file and `CLAUDE.md` for project context.

3. Likely next topics based on session direction:
   - Rewrite the gravity/OG formula in `brewing_calcs.ex` using FGDB
   - Fix `get_fermentable_category_ids` category names
   - Continue per-category lot schema work (Hops next)
   - Make `IngredientLotDialog` fully category-aware
