# Session Handoff — 2026-06-07

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
- API: `docker-compose up api` (from `rockcut/` root) — uses `Dockerfile.dev`, mounts `./rockcut_api:/app`, auto-runs `mix deps.get` + `mix ecto.migrate` + `mix phx.server`
- UI: `pnpm dev --port 5174` (from `rockcut/rockcut-ui/`)
- Login: any credentials work in dev (EnvAuth, `ADMIN_EMAIL` not set)

**Completed deliverables (D1–D9):**

| ID | Description |
|----|-------------|
| D1 | Data model — 13 tables, migrations, seeds |
| D2 | CRUD APIs — 13 controllers, 65+ routes |
| D3 | Deployment — both apps on Fly.io |
| D4 | Auth — login gate, bearer tokens, EnvAuth |
| D5 | Scaffold UI — full React SPA with CRUD forms |
| D6 | Formula Execution Service — FormulaCatalog, FormulaRuntime, 3 brewing formulas |
| D7 | DataGrid Formula Engine — parser, evaluator, remote functions, visual indicators |
| D8 | Formula editing UX — end-user formula editing in DataGrid |
| D9 | Column visibility toggle — 8 grids |

**Next deliverable ID: D10**

---

## What Happened This Session

### 1. Local environment set up (first time on this machine)

- API started via `docker-compose up --build api` — image was already cached, used existing `rockcut_api_dev.db` (migrations already current)
- Dev DB had schema but no data — ran `docker exec rockcut_api_1 mix run priv/repo/seeds.exs` to populate
- UI started via `pnpm dev`; `datagrid-extended` source at `~/src/shared/ui-components/datagrid-extended/` ✓

### 2. Ingredient category renames (migration applied)

Migration `20260607180807_rename_ingredient_categories.exs` is committed and applied:

| Old name | New name |
|---|---|
| Grain | Grains |
| Extract | Future Ingredients |
| Hop | Hops |
| Yeast | Yeast Strains |
| Fruit | Fruits |
| Spice | Spices & Flavorings |
| Sugar | Sugars and Extracts |
| Adjunct | Other Consumables |

`seeds.exs` updated to use new names throughout (categories block, field definitions block, ingredients block).

### 3. Ingredient library UI redesign

`IngredientsList.tsx` rewritten — changed from DataGrid to expandable table:

- **Defaults to Grains** on load (useEffect sets category once categories arrive)
- **Each ingredient row** has a caret (▼/▶) that collapses/expands its lots; starts expanded
- **Lot rows** shown as a collapsible section under each ingredient: lot#, supplier, status chip, non-null numeric values (AA%, °L, OG, Atten%)
- **On Hand chip** counts available lots
- Row click → navigate to ingredient detail (caret click stops propagation)
- `list_ingredients` in `brewing.ex` now preloads lots (ordered by received_date desc)

### 4. SDLC path fix

`rockcut/CLAUDE.md` updated: all `~/src/ops/sdlc/` references corrected to `~/src/pm-sdlc/`.

---

## Open Design Thread — Ingredient Fields

The user wants to add per-category fields to ingredients. This conversation was in progress when the handoff was needed. **This is the next thing to work on.**

### The ask (verbatim scope from user)

**Category-level field additions:**

**Grains:** Extract Measurement (select: CGAI/FGDB/PPG/Lº/kg), Moisture %, Extract % FGDB, Extract % CGAI, Extract % PPG, Extract % Lº/kg, Color (°Lov), Diastatic Power (°Linter), Protein %, Supplier, Order Name, Order Unit Size — plus calculated inter-conversions between extract measurements based on which one is selected.

**Sugars and Extracts:** Form (Dry/Liquid), same extract fields as Grains plus ºP/ºB options in the Extract Measurement selector, Supplier, Order Name, Order Unit Size.

**Fruits:** Same as Sugars and Extracts.

**Hops, Spices & Flavorings, Yeast Strains, Other Consumables:** Supplier, Order Name, Order Unit Size.

**Calculated extract field logic (Grains / Sugars and Extracts / Fruits):**
```
If CGAI selected → CGAI editable
  FGDB = CGAI × (1 + Moisture/100)
  PPG  = CGAI × 46
  Lº/kg = PPG × 8.345

If FGDB selected → FGDB editable
  CGAI = FGDB / (1 + Moisture/100)
  PPG  = CGAI × 46
  Lº/kg = PPG × 8.345

If PPG selected → PPG editable
  CGAI = PPG / 46
  FGDB = CGAI × (1 + Moisture/100)
  Lº/kg = PPG × 8.345

If Lº/kg selected → Lº/kg editable
  PPG  = Lº/kg / 8.345
  CGAI = PPG / 46
  FGDB = CGAI × (1 + Moisture/100)

If ºP or ºB selected (Sugars / Fruits only) → ºP/ºB editable
  CGAI = ºP / 100   (ºP ≈ ºBrix for most brewing purposes)
  then apply standard CGAI calculations
  NOTE: ºP/ºB ≈ interchangeable within brewing tolerance (~0.3% divergence at 20°)
```

### Key design question outstanding

**Where do the extract fields live — ingredient level or lot level?**

The conversation was cut off before the user answered this. The framing given:

- `ingredient`: master record (Pale 2-Row — the type/definition)
- `ingredient_lot`: per-purchase record (Pale 2-Row, lot G-2401 from Briess, Jan 2026)

The extract % values (CGAI, FGDB, etc.) vary by supplier and crop year → lot-level makes more sense.

Supplier, Order Name, Order Unit Size feel like ingredient-level purchasing info (you order "Pale 2-Row from Briess" as a type, not per lot).

**Also outstanding:** The `ingredient_lot` table has a `potential_gravity` column (stores SG like 1.037). PPG = (SG - 1) × 1000 — they're the same value, different expression. Decision needed: retire `potential_gravity` in favor of the new PPG field, keep both, or derive one from the other.

### Current field definition system (for context)

`category_field_definitions` table defines what fields each category has. Fields are rendered as `properties` JSON on `ingredient_lots`. The `IngredientLotDialog` **does not yet render these dynamically** — it still shows a raw "Properties (JSON)" textarea. So the UI for dynamic fields hasn't been built.

**This means the full scope is:**
1. Add new field definitions to DB (migration + seeds) — data layer only
2. Rebuild `IngredientLotDialog` to render fields from `category_field_definitions` dynamically
3. Add calculated extract field logic to the form (live interconversion)

The user was proceeding one step at a time ("let's do this more slowly"). The category renames are done. Next agreed step was adding fields, but the design question (ingredient vs. lot level) needs an answer first.

---

## Files Changed This Session

| File | Change |
|---|---|
| `rockcut_api/priv/repo/migrations/20260607180807_rename_ingredient_categories.exs` | New — renames 8 categories, reversible up/down |
| `rockcut_api/priv/repo/seeds.exs` | Updated — new category names throughout |
| `rockcut_api/lib/rockcut_api/brewing.ex` | `list_ingredients` now preloads lots |
| `rockcut-ui/src/pages/ingredients/IngredientsList.tsx` | Rewritten — expandable table with per-ingredient lot rows |
| `CLAUDE.md` | Fixed `~/src/ops/sdlc/` → `~/src/pm-sdlc/` |

---

## How to Resume

1. **Start services** (if not running):
   ```bash
   # From rockcut/
   docker-compose up api          # API on :4002
   cd rockcut-ui && pnpm dev      # UI on :5174
   ```
   If dev DB is empty: `docker exec rockcut_api_1 mix run priv/repo/seeds.exs`

2. **Read this file** and `CLAUDE.md` for project context.

3. **Ask the user** whether extract fields (CGAI, FGDB, PPG, Lº/kg) live on the ingredient or the lot, and whether to retire `potential_gravity`.

4. **Then proceed** with adding the field definitions (migration + seeds) for all categories as the next step.
