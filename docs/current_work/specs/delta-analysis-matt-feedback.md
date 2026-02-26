# Delta Analysis: Matt's Feedback (2026-02-25) vs Current Codebase

Source: `docs/matt-feedback-2026-02-25.md`
Analyzed: 2026-02-26

---

## Table of Contents

1. [New Tables](#1-new-tables)
2. [Existing Table Modifications](#2-existing-table-modifications)
3. [New API Endpoints](#3-new-api-endpoints)
4. [Existing API Changes](#4-existing-api-changes)
5. [Frontend: New Pages & Components](#5-frontend-new-pages--components)
6. [Frontend: Modifications to Existing Pages](#6-frontend-modifications-to-existing-pages)
7. [Seed Data Changes](#7-seed-data-changes)
8. [Architecture Decisions](#8-architecture-decisions)

---

## 1. New Tables

### 1a. `brewhouses` (NEW)

Top-level entity above Brand. Represents a physical brewing system with unit preferences and equipment values.

```sql
create table(:brewhouses) do
  add :name, :string, null: false           -- e.g. "Production", "Pilot"
  add :is_default, :boolean, default: false -- one default per account
  add :notes, :text

  -- UOM Preferences (all stored as string enums)
  add :temp_unit, :string, default: "F"                  -- F | C
  add :liquid_vol_unit, :string, default: "bbls"         -- bbls | gallons | hectoliters | liters
  add :density_unit, :string, default: "sg"              -- plato | sg
  add :alcohol_unit, :string, default: "abv"             -- abv | abw
  add :density_calc_method, :string, default: "ppg"      -- cgai | ppg
  add :ibu_calc_method, :string, default: "tinseth"      -- tinseth | rager | garetz
  add :ingredient_weight_unit, :string, default: "lb"    -- lb | lb_oz | oz | kg | g
  add :ingredient_vol_unit, :string, default: "gal"      -- bbls | gal | oz | hl | l | ml

  -- Equipment Values (expressed in the brewhouse's chosen units)
  add :kettle_turn_size, :decimal           -- liq vol unit
  add :kettle_evaporation_rate, :decimal    -- liq vol unit / hr
  add :kettle_loss, :decimal                -- liq vol unit
  add :ferm_loss, :decimal                  -- liq vol unit

  timestamps(type: :utc_datetime)
end

create unique_index(:brewhouses, [:name])
```

**Current state:** Does not exist. Hierarchy is Brand > Recipe > Batch.
**Target state:** Brewhouse > Brand > Recipe > Batch. Unit preferences cascade down from brewhouse.

### 1b. `process_profiles` (NEW)

Reusable process templates (e.g. "RC Ale", "RC Hazy", "RC Lager") that define default process parameters. Can be linked to a brand or used standalone as a template.

```sql
create table(:process_profiles) do
  add :name, :string, null: false           -- e.g. "RC Ale", "RC Hazy", "RC Lager"
  add :description, :text

  -- Mash
  add :mash_type, :string                   -- single_infusion | step | decoction
  add :mash_foundation_water, :decimal      -- liq vol
  add :strike_water_ratio, :decimal         -- liq vol / grain weight
  add :mash_ph, :decimal
  add :mash_schedule, :map                  -- JSON: see structure below

  -- Lauter
  add :vorlauf_duration, :integer           -- min
  add :lauter_type, :string                 -- continuous | batch
  add :lauter_temperature, :decimal         -- temp
  add :lauter_water, :decimal               -- liq vol
  add :final_lauter_ph, :decimal
  add :lauter_duration, :integer            -- min (continuous only)

  -- Boil & Post-Boil
  add :boil_duration, :integer              -- min
  add :coolpool, :boolean, default: false
  add :coolpool_temperature, :decimal       -- temp
  add :coolpool_duration, :integer          -- min
  add :coolpool_rest_duration, :integer     -- min
  add :whirlpool_duration, :integer         -- min
  add :whirlpool_rest_duration, :integer    -- min
  add :knockout_duration, :integer          -- min
  add :knockout_temperature, :decimal       -- temp

  -- Fermentation
  add :lag_temperature, :decimal
  add :lag_duration, :decimal               -- hours
  add :primary_temperature, :decimal
  add :primary_duration, :decimal           -- hours
  add :secondary_temperature, :decimal
  add :secondary_duration, :decimal         -- hours
  add :d_rest_temperature, :decimal
  add :d_rest_duration, :decimal            -- hours

  -- Cold Crash
  add :crash_type, :string                  -- single | step
  add :crash_temperature, :decimal          -- single mode
  add :crash_duration, :decimal             -- hours, single mode
  add :crash_steps, :map                    -- JSON: [{temperature, duration}] for step mode

  -- Packaging
  add :transfer_type, :string               -- none | yes | filter
  add :bright_temperature, :decimal
  add :bright_duration, :decimal            -- hours
  add :co2_volume, :decimal

  timestamps(type: :utc_datetime)
end

create unique_index(:process_profiles, [:name])
```

**`mash_schedule` JSON structure by mash type:**
- Single Infusion: `{"rest_temperature": 152}`
- Step: `{"steps": [{"temperature": 122, "duration": 15}, {"temperature": 152, "duration": 60}]}`
- Decoction: `{"steps": [{"rest_temp": 122, "rest_duration": 15, "boil_volume": 0.5, "boil_duration": 20}]}`

**`crash_steps` JSON structure:**
- `[{"temperature": 40, "duration": 24}, {"temperature": 34, "duration": 48}]`

**Current state:** No process template concept exists. Mash steps are per-recipe only (mash_steps table). Process steps are generic name/day/temp/duration entries (recipe_process_steps table).
**Target state:** Reusable process profiles with ~40 typed fields that pre-populate recipe process data.

---

## 2. Existing Table Modifications

### 2a. `brands` — Add FK to brewhouse and process_profile, add archived status

```sql
-- Migration: add_brewhouse_and_process_profile_to_brands
alter table(:brands) do
  add :brewhouse_id, references(:brewhouses, on_delete: :nilify_all)
  add :process_profile_id, references(:process_profiles, on_delete: :nilify_all)
  add :is_default_recipe_id, :integer  -- see 2d below
end

create index(:brands, [:brewhouse_id])
create index(:brands, [:process_profile_id])
```

**Schema changes to `brand.ex`:**
- Add `belongs_to :brewhouse`
- Add `belongs_to :process_profile`
- Add `archived` to `@valid_statuses` → `~w(active seasonal retired archived)`
- Add cast for `:brewhouse_id`, `:process_profile_id`

**Current state:** Brand has no FK to any parent entity. Status values are `active | seasonal | retired`.
**Target state:** Brand optionally links to a brewhouse and a process profile. Supports `archived` status.

### 2b. `recipes` — Add is_default flag, enable version editing

**Schema changes to `recipe.ex`:**
- Add `field :is_default, :boolean, default: false`
- Cast `:is_default` in changeset
- Version fields already editable (version_major, version_minor are in cast)

```sql
-- Migration: add_is_default_to_recipes
alter table(:recipes) do
  add :is_default, :boolean, default: false, null: false
end
```

**Constraint:** Only one `is_default = true` per brand. Enforced in context logic (not DB constraint — partial unique index would work but is complex with nullable).

**Current state:** Version numbers are cast fields (already editable via API). No `is_default` flag. Recipe statuses include `archived` already.
**Target state:** Recipes have `is_default` flag. Version numbers freely editable (uniqueness constraint `[:brand_id, :version_major, :version_minor]` already exists — good).

### 2c. `batches` — Add optional brewhouse_id

```sql
-- Migration: add_brewhouse_to_batches
alter table(:batches) do
  add :brewhouse_id, references(:brewhouses, on_delete: :nilify_all)
end

create index(:batches, [:brewhouse_id])
```

**Current state:** Batch links to brand only. No brewhouse reference.
**Target state:** Batch optionally specifies which brewhouse it was brewed on (important for multi-brewhouse scenarios).

### 2d. `category_field_definitions` — Add `system` flag

```sql
-- Migration: add_system_to_category_field_definitions
alter table(:category_field_definitions) do
  add :system, :boolean, default: false, null: false
end
```

**Schema change:** Add `field :system, :boolean, default: false` to CategoryFieldDefinition.
**Changeset:** Do NOT cast `:system` — system fields are seed-only, not user-editable.

**Current state:** All field definitions are user-created, no distinction.
**Target state:** Some field definitions are marked `system: true` (seeded by the app), distinguishing them from user-created ones. System fields cannot be deleted by users.

---

## 3. New API Endpoints

### 3a. Brewhouse CRUD

```
GET     /api/brewhouses           BrewhouseController :index
POST    /api/brewhouses           BrewhouseController :create
GET     /api/brewhouses/:id       BrewhouseController :show
PUT     /api/brewhouses/:id       BrewhouseController :update
DELETE  /api/brewhouses/:id       BrewhouseController :delete
```

New files needed:
- `lib/rockcut_api/brewing/brewhouse.ex` (schema)
- `lib/rockcut_api_web/controllers/brewhouse_controller.ex`
- Context functions in `brewing.ex`: `list_brewhouses/0`, `get_brewhouse!/1`, `create_brewhouse/1`, `update_brewhouse/2`, `delete_brewhouse/1`
- JSON helper: `brewhouse/1` in `json_helpers.ex`

### 3b. Process Profile CRUD

```
GET     /api/process_profiles           ProcessProfileController :index
POST    /api/process_profiles           ProcessProfileController :create
GET     /api/process_profiles/:id       ProcessProfileController :show
PUT     /api/process_profiles/:id       ProcessProfileController :update
DELETE  /api/process_profiles/:id       ProcessProfileController :delete
```

New files needed:
- `lib/rockcut_api/brewing/process_profile.ex` (schema)
- `lib/rockcut_api_web/controllers/process_profile_controller.ex`
- Context functions in `brewing.ex`: `list_process_profiles/0`, `get_process_profile!/1`, `create_process_profile/1`, `update_process_profile/2`, `delete_process_profile/1`
- JSON helper: `process_profile/1` in `json_helpers.ex`

### 3c. Recipe Operations (custom actions)

```
POST    /api/recipes/:id/copy              RecipeController :copy
POST    /api/recipes/:id/move              RecipeController :move
POST    /api/recipes/:id/set_default       RecipeController :set_default
POST    /api/brands/:id/duplicate          BrandController :duplicate
```

**Copy recipe:** Clones recipe + recipe_ingredients + mash_steps + process_steps + water_profile. Auto-bumps version_minor. Returns new recipe.

**Move recipe:** Updates `recipe.brand_id` to the target brand. Params: `{ target_brand_id }`. May need version renumbering if collision.

**Set default recipe:** Sets `is_default = true` on this recipe and `false` on all other recipes in the same brand. Single transaction.

**Duplicate brand:** Clones brand (new name required via params). Optionally clones all recipes or just the default recipe. Params: `{ name, clone_all_recipes? }`.

---

## 4. Existing API Changes

### 4a. Brand Controller — Add `brewhouse_id`, `process_profile_id` to params

**File:** `brand_controller.ex` — no changes needed (params pass through to changeset).
**File:** `brand.ex` — add fields to cast list.
**File:** `json_helpers.ex` — add `brewhouse_id`, `process_profile_id`, `brewhouse` (summary) to `brand/1`.

### 4b. Recipe Controller — Version editing already works

Version major/minor are already in the changeset cast list. The unique constraint `[:brand_id, :version_major, :version_minor]` enforces uniqueness. No API change needed — just the new custom actions (copy, move, set_default) from section 3c.

### 4c. Batch Controller — Add `brewhouse_id` to params

**File:** `batch.ex` — add `:brewhouse_id` to cast list, add `belongs_to :brewhouse`.
**File:** `json_helpers.ex` — add `brewhouse_id` to `batch/1`.

### 4d. CategoryFieldDefinition Controller — Protect system fields from delete

**File:** `category_field_definition_controller.ex` — in `delete/2`, check `definition.system` and return 403 if true.

### 4e. Brand listing — Filter archived by default

**File:** `brewing.ex` `list_brands/0` → `list_brands/1` accepting params.
Add default filter: exclude `archived` status unless `?include_archived=true`.
Same pattern for `list_recipes/1` — already accepts params, just needs default status filtering.

---

## 5. Frontend: New Pages & Components

### 5a. Brewhouse Settings Page

**Route:** `/settings/brewhouses` and `/settings/brewhouses/:id`
**Nav:** Add to Settings section or sub-navigation.
**Components:**
- `BrewhousesList.tsx` — DataGrid list of brewhouses
- `BrewhouseDetail.tsx` — Shows UOM prefs + equipment values
- `BrewhouseFormDialog.tsx` — Create/edit form with:
  - Name
  - UOM preference dropdowns (temp, liquid vol, density, alcohol, etc.)
  - Equipment value fields (kettle turn size, evap rate, losses)
  - Is Default checkbox

### 5b. Process Profile Management Page

**Route:** `/settings/process-profiles` and `/settings/process-profiles/:id`
**Components:**
- `ProcessProfilesList.tsx` — DataGrid list of process profiles
- `ProcessProfileDetail.tsx` — Read-only view of all ~40 fields, grouped by phase
- `ProcessProfileFormDialog.tsx` — Tabbed form with sections:
  - Mash tab (type dropdown, water fields, pH, schedule builder)
  - Lauter tab
  - Boil tab (with conditional coolpool fields)
  - Fermentation tab (lag, primary, secondary, D-rest)
  - Cold Crash tab (type dropdown, conditional step builder)
  - Packaging tab

### 5c. Recipe Operations UI

**Components needed:**
- `CopyRecipeDialog.tsx` — Confirms copy, shows new version number
- `MoveRecipeDialog.tsx` — Brand selector dropdown for target brand
- `DuplicateBrandDialog.tsx` — New name input, option to clone all recipes

**Locations:**
- Copy & Move: Added as actions on RecipeDetail toolbar
- Duplicate: Added as action on BrandDetail toolbar

### 5d. UOM Preferences Context Provider (Architecture)

**File:** `src/contexts/BrewhouseContext.tsx`
- React context that provides the active brewhouse's unit preferences
- Used by all display components to format values in the correct units
- Resolves cascade: brewhouse > brand override > recipe override

---

## 6. Frontend: Modifications to Existing Pages

### 6a. IngredientsList — Default to "Grain" category

**File:** `rockcut-ui/src/pages/ingredients/IngredientsList.tsx`
**Current:** `categoryId` state initialized to `''` (All Categories)
**Change:** After categories load, default to the first category (Grain, sort_order 0):

```tsx
// After categories load, set default to first category
useEffect(() => {
  if (categories.length > 0 && categoryId === '') {
    setCategoryId(categories[0].id)
  }
}, [categories])
```

### 6b. BrandsList — Filter archived brands by default

**File:** `rockcut-ui/src/pages/brands/BrandsList.tsx`
**Change:** Add a toggle or default filter to exclude archived brands.
- Add state: `const [showArchived, setShowArchived] = useState(false)`
- Pass to API: `{ include_archived: showArchived }` or filter client-side
- Add toggle button in toolbar

### 6c. BrandFormDialog — Add brewhouse and process profile selectors

**File:** `rockcut-ui/src/pages/brands/BrandFormDialog.tsx`
**Changes:**
- Add `brewhouse_id` dropdown (fetch `/api/brewhouses`)
- Add `process_profile_id` dropdown (fetch `/api/process_profiles`)
- Add `archived` to STATUSES array
- Pass new fields in payload

### 6d. BrandDetail — Add duplicate button, show brewhouse/profile links

**File:** `rockcut-ui/src/pages/brands/BrandDetail.tsx`
**Changes:**
- Add "Duplicate Brand" button to toolbar
- Display linked brewhouse name (clickable to settings)
- Display linked process profile name (clickable to settings)
- Show "default recipe" indicator in recipe grid

### 6e. RecipeDetail — Add copy, move, set-default actions

**File:** `rockcut-ui/src/pages/recipes/RecipeDetail.tsx`
**Changes:**
- Add "Copy Recipe" button to toolbar → opens CopyRecipeDialog
- Add "Move to Brand..." button to toolbar → opens MoveRecipeDialog
- Add "Set as Default" button to toolbar → calls set_default API
- Show "(Default)" badge if `recipe.is_default`

### 6f. RecipeFormDialog — Version editing already works

**File:** `rockcut-ui/src/pages/recipes/RecipeFormDialog.tsx`
**Current:** Version major/minor are editable text fields.
**No change needed** — version editing is already supported. The API enforces uniqueness.

### 6g. Settings Page — Add Brewhouse and Process Profile navigation

**File:** `rockcut-ui/src/pages/settings/SettingsPage.tsx`
**Change:** Add navigation cards/links for "Brewhouses" and "Process Profiles" alongside existing category management.

### 6h. App.tsx — Add new routes

**File:** `rockcut-ui/src/App.tsx`
**Changes:**
```tsx
<Route path="/settings/brewhouses" element={<BrewhousesList />} />
<Route path="/settings/brewhouses/:id" element={<BrewhouseDetail />} />
<Route path="/settings/process-profiles" element={<ProcessProfilesList />} />
<Route path="/settings/process-profiles/:id" element={<ProcessProfileDetail />} />
```

### 6i. types.ts — Add new interfaces

**File:** `rockcut-ui/src/lib/types.ts`
**Add:**
```typescript
export interface Brewhouse {
  id: number
  name: string
  is_default: boolean
  notes: string | null
  temp_unit: string
  liquid_vol_unit: string
  density_unit: string
  alcohol_unit: string
  density_calc_method: string
  ibu_calc_method: string
  ingredient_weight_unit: string
  ingredient_vol_unit: string
  kettle_turn_size: number | null
  kettle_evaporation_rate: number | null
  kettle_loss: number | null
  ferm_loss: number | null
  inserted_at: string
  updated_at: string
}

export interface ProcessProfile {
  id: number
  name: string
  description: string | null
  // Mash
  mash_type: string | null
  mash_foundation_water: number | null
  strike_water_ratio: number | null
  mash_ph: number | null
  mash_schedule: Record<string, unknown> | null
  // Lauter
  vorlauf_duration: number | null
  lauter_type: string | null
  lauter_temperature: number | null
  lauter_water: number | null
  final_lauter_ph: number | null
  lauter_duration: number | null
  // Boil & Post-Boil
  boil_duration: number | null
  coolpool: boolean
  coolpool_temperature: number | null
  coolpool_duration: number | null
  coolpool_rest_duration: number | null
  whirlpool_duration: number | null
  whirlpool_rest_duration: number | null
  knockout_duration: number | null
  knockout_temperature: number | null
  // Fermentation
  lag_temperature: number | null
  lag_duration: number | null
  primary_temperature: number | null
  primary_duration: number | null
  secondary_temperature: number | null
  secondary_duration: number | null
  d_rest_temperature: number | null
  d_rest_duration: number | null
  // Cold Crash
  crash_type: string | null
  crash_temperature: number | null
  crash_duration: number | null
  crash_steps: Array<{ temperature: number; duration: number }> | null
  // Packaging
  transfer_type: string | null
  bright_temperature: number | null
  bright_duration: number | null
  co2_volume: number | null
  inserted_at: string
  updated_at: string
}
```

**Modify `Brand` interface:**
```typescript
export interface Brand {
  // ... existing fields ...
  brewhouse_id: number | null
  process_profile_id: number | null
}
```

**Modify `Recipe` interface:**
```typescript
export interface Recipe {
  // ... existing fields ...
  is_default: boolean
}
```

**Modify `Batch` interface:**
```typescript
export interface Batch {
  // ... existing fields ...
  brewhouse_id: number | null
}
```

**Modify `CategoryFieldDefinition` interface:**
```typescript
export interface CategoryFieldDefinition {
  // ... existing fields ...
  system: boolean
}
```

---

## 7. Seed Data Changes

### 7a. Rename "Extract" → "Other Consumables"

**File:** `priv/repo/seeds.exs`
**Change:** In the categories list, rename `{"Extract", 1}` to `{"Other Consumables", 1}`.
**Migration note:** Need a data migration or seed update that handles the rename for existing databases:

```elixir
# In seeds.exs — handle rename
case Repo.get_by(IngredientCategory, name: "Extract") do
  nil -> :ok
  cat -> Repo.update!(IngredientCategory.changeset(cat, %{name: "Other Consumables"}))
end
```

### 7b. Mark system field definitions

**After adding the `system` column**, update the seed to set `system: true` on all seeded field definitions:
```elixir
# In seeds: Mark all seeded field definitions as system
field_defs |> Enum.each(fn fd -> Map.put(fd, :system, true) end)
```

### 7c. Seed default brewhouse

```elixir
# Seed a default brewhouse
case Repo.get_by(Brewhouse, name: "Production") do
  nil ->
    Repo.insert!(%Brewhouse{
      name: "Production",
      is_default: true,
      temp_unit: "F",
      liquid_vol_unit: "bbls",
      density_unit: "sg",
      alcohol_unit: "abv",
      density_calc_method: "ppg",
      ibu_calc_method: "tinseth",
      ingredient_weight_unit: "lb",
      ingredient_vol_unit: "gal"
    })
  _ -> :ok
end
```

### 7d. Seed default process profiles

```elixir
# Seed 3 default process profiles: RC Ale, RC Hazy, RC Lager
profiles = [
  %{name: "RC Ale", mash_type: "single_infusion", boil_duration: 60,
    primary_temperature: Decimal.new("66"), primary_duration: Decimal.new("168"),
    crash_type: "single", crash_temperature: Decimal.new("34"),
    crash_duration: Decimal.new("48"), transfer_type: "none",
    co2_volume: Decimal.new("2.4")},
  %{name: "RC Hazy", mash_type: "single_infusion", boil_duration: 60,
    primary_temperature: Decimal.new("67"), primary_duration: Decimal.new("168"),
    crash_type: "single", crash_temperature: Decimal.new("34"),
    crash_duration: Decimal.new("48"), transfer_type: "none",
    co2_volume: Decimal.new("2.5")},
  %{name: "RC Lager", mash_type: "step", boil_duration: 90,
    lag_temperature: Decimal.new("10"), lag_duration: Decimal.new("48"),
    primary_temperature: Decimal.new("10"), primary_duration: Decimal.new("336"),
    d_rest_temperature: Decimal.new("18"), d_rest_duration: Decimal.new("48"),
    crash_type: "step", transfer_type: "none", co2_volume: Decimal.new("2.6")}
]
```

---

## 8. Architecture Decisions

### 8a. Cascading Defaults Pattern

The cascade is: **Brewhouse > Process Profile > Brand > Recipe**

**Resolution logic (server-side):**
```
effective_value(field) =
  recipe.field ?? brand.process_profile.field ?? brand.brewhouse.field ?? system_default
```

**Implementation approach:**
- Each level stores only the fields it explicitly sets (nullable columns)
- `nil` means "inherit from parent"
- Resolution happens at read time, not write time
- Frontend displays inherited values as dimmed/placeholder, explicit values as solid

**Why server-side resolution (not just frontend)?**
- Formula calculations (IBU, OG, SRM, ABV) need resolved values
- API consumers need resolved values
- Frontend context provider calls a resolution endpoint

**Practical implementation for v1:**
- Keep it simple: brands link to a brewhouse and a process profile
- When creating a recipe from a brand, the UI pre-fills recipe fields from the process profile
- No real-time cascade resolution engine needed yet — just pre-fill on create
- Add a `/api/brands/:id/effective_defaults` endpoint later if needed

### 8b. Process Instances (Design-Forward, Don't Build Yet)

Matt's feedback focuses on process **definitions**. The current model has no structured process **instances** (planned vs. actual per batch step).

**Key guideline:** Do NOT add new actual fields to `batches`. The existing `ferm_start_date`, `ferm_end_date`, `ferm_temp` fields are identified in the feedback as "half-assed actuals" that would conflict with future process instances.

**For this iteration:**
- Build process profiles as definition-only entities
- Design the schema knowing each template step will eventually spawn instance steps
- Don't deprecate the existing ferm fields yet — they work and aren't in the way
- Future D-ticket will add `batch_process_steps` table with planned + actual columns

### 8c. JSON vs Child Tables for Variable-Length Process Data

**Decision: Use JSON columns (`map` type) for mash_schedule and crash_steps.**

**Rationale:**
- Mash schedule and crash steps are small arrays (2-5 items)
- They're always read/written as a unit with their parent
- No need to query individual steps independently
- Postgres JSONB provides validation via application layer
- Simpler than adding `process_profile_mash_steps` and `process_profile_crash_steps` child tables

This differs from the existing `mash_steps` table (which is per-recipe and needs individual CRUD). Process profile mash schedules are templates, not editable step-by-step.

### 8d. Scope & Priority for Implementation

Given the scope of Matt's feedback, recommend splitting into multiple deliverables:

**D12 — Brewhouse & Process Profiles (Data Model + Settings UI)**
- New tables: brewhouses, process_profiles
- Modifications: brands, batches, recipes, category_field_definitions
- Settings UI for managing brewhouses and process profiles
- Seed data (default brewhouse, 3 profiles, rename Extract, system flag)

**D13 — Recipe Operations (Copy, Move, Duplicate, Default)**
- Copy recipe within brand
- Move recipe between brands
- Duplicate brand
- Set default recipe per brand
- UI for all operations

**D14 — UI Quick Fixes**
- Default Ingredient Library to Grain tab
- Filter archived brands from default view
- Protect system field definitions from deletion

**D15+ — Cascade Resolution Engine (Future)**
- UOM preferences context provider
- Effective defaults API endpoint
- Formula engine respects calc method preferences

---

## Summary: File Change Matrix

### New Backend Files
| File | Type |
|------|------|
| `lib/rockcut_api/brewing/brewhouse.ex` | Schema |
| `lib/rockcut_api/brewing/process_profile.ex` | Schema |
| `lib/rockcut_api_web/controllers/brewhouse_controller.ex` | Controller |
| `lib/rockcut_api_web/controllers/process_profile_controller.ex` | Controller |
| `priv/repo/migrations/TIMESTAMP_create_brewhouses.exs` | Migration |
| `priv/repo/migrations/TIMESTAMP_create_process_profiles.exs` | Migration |
| `priv/repo/migrations/TIMESTAMP_add_brewhouse_and_profile_to_brands.exs` | Migration |
| `priv/repo/migrations/TIMESTAMP_add_brewhouse_to_batches.exs` | Migration |
| `priv/repo/migrations/TIMESTAMP_add_is_default_to_recipes.exs` | Migration |
| `priv/repo/migrations/TIMESTAMP_add_system_to_category_field_definitions.exs` | Migration |

### Modified Backend Files
| File | Changes |
|------|---------|
| `lib/rockcut_api/brewing.ex` | Add brewhouse/process_profile CRUD, recipe copy/move/set_default, brand duplicate, update list_brands to filter archived |
| `lib/rockcut_api/brewing/brand.ex` | Add brewhouse_id, process_profile_id FKs, add `archived` to valid_statuses |
| `lib/rockcut_api/brewing/recipe.ex` | Add is_default field |
| `lib/rockcut_api/brewing/batch.ex` | Add brewhouse_id FK |
| `lib/rockcut_api/brewing/category_field_definition.ex` | Add system field |
| `lib/rockcut_api_web/router.ex` | Add brewhouse routes, process_profile routes, recipe custom actions, brand duplicate |
| `lib/rockcut_api_web/controllers/json_helpers.ex` | Add brewhouse/1, process_profile/1, update brand/1, recipe/1, batch/1 |
| `lib/rockcut_api_web/controllers/brand_controller.ex` | Add duplicate action |
| `lib/rockcut_api_web/controllers/recipe_controller.ex` | Add copy, move, set_default actions |
| `lib/rockcut_api_web/controllers/category_field_definition_controller.ex` | Protect system fields from delete |
| `priv/repo/seeds.exs` | Rename Extract, add system flag, seed brewhouse + profiles |

### New Frontend Files
| File | Type |
|------|------|
| `src/pages/settings/BrewhousesList.tsx` | Page |
| `src/pages/settings/BrewhouseDetail.tsx` | Page |
| `src/pages/settings/BrewhouseFormDialog.tsx` | Dialog |
| `src/pages/settings/ProcessProfilesList.tsx` | Page |
| `src/pages/settings/ProcessProfileDetail.tsx` | Page |
| `src/pages/settings/ProcessProfileFormDialog.tsx` | Dialog (tabbed) |
| `src/pages/recipes/CopyRecipeDialog.tsx` | Dialog |
| `src/pages/recipes/MoveRecipeDialog.tsx` | Dialog |
| `src/pages/brands/DuplicateBrandDialog.tsx` | Dialog |

### Modified Frontend Files
| File | Changes |
|------|---------|
| `src/App.tsx` | Add routes for brewhouses, process profiles |
| `src/lib/types.ts` | Add Brewhouse, ProcessProfile interfaces; update Brand, Recipe, Batch, CategoryFieldDefinition |
| `src/pages/ingredients/IngredientsList.tsx` | Default category filter to Grain |
| `src/pages/brands/BrandsList.tsx` | Add archived filter toggle |
| `src/pages/brands/BrandDetail.tsx` | Add duplicate button, show brewhouse/profile links, default recipe indicator |
| `src/pages/brands/BrandFormDialog.tsx` | Add brewhouse_id and process_profile_id dropdowns, add archived status |
| `src/pages/recipes/RecipeDetail.tsx` | Add copy, move, set-default toolbar actions |
| `src/pages/settings/SettingsPage.tsx` | Add navigation to brewhouses and process profiles |
| `src/pages/settings/CategoryDetail.tsx` | Show system badge, disable delete for system fields |
