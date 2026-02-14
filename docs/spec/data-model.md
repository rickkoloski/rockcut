# Rockcut Data Model Specification

> **Status:** APPROVED — Designed with Matt (2026-02-12)
>
> **Scope:** Core data model for recipe management, ingredient library,
> batch tracking, and brew day logging. Does not include inventory
> management or cost tracking (deferred to v2).

---

## Overview

```
Ingredient Category (CRUD)
 └── Category Field Definition (CRUD)

Ingredient (library)
 └── Ingredient Lot (per purchase)

Brand
 └── Recipe (major.minor versioning)
      ├── Recipe Ingredient → Ingredient Lot
      ├── Mash Step
      ├── Process Step
      └── Water Profile

Batch → Brand (the beer being made)
 ├── Brew Turn → Recipe (per-turn recipe + actuals)
 └── Batch Log Entry
```

### Key Design Decisions

1. **Dynamic ingredient categories** — Matt can create/edit/delete ingredient
   categories (Grain, Hop, Yeast, Fruit, Spice, etc.) and define custom fields
   per category. No code changes needed to add a "Barrel Aging" category with
   its own fields.

2. **Two-level ingredient library** — Abstract ingredients (e.g., "Cascade")
   with lot-specific entries underneath (e.g., "Lot #4412, 5.5% AA"). Recipes
   reference specific lots, so calculations always use actual characteristics.

3. **Major.minor recipe versioning** — Major bumps for fundamental recipe
   changes (different grain bill, new hop variety). Minor bumps for lot swaps
   and small tweaks. Versions are frozen once a batch exists against them.

4. **Unified recipe ingredients** — All ingredient types live in one table,
   differentiated by category. Calc-critical fields (alpha_acid, color_lovibond,
   potential_gravity, attenuation) are real columns on the lot; everything else
   is stored in a JSON `properties` column validated against category field
   definitions.

5. **Batch = snapshot via version freeze** — Batches reference a specific
   recipe version. No separate batch ingredient table needed because versions
   are immutable once brewed. Editing after a batch bumps the minor version.

---

## Tables

### ingredient_categories

User-managed categories for organizing ingredients. Seeded with defaults,
fully CRUD-able.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| name | string | NOT NULL, UNIQUE | "Grain", "Hop", "Yeast", etc. |
| sort_order | integer | NOT NULL, default 0 | Display order in UI |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Seed data:** Grain, Extract, Hop, Yeast, Fruit, Spice, Sugar, Adjunct

---

### category_field_definitions

Defines what custom fields appear for each category. User-managed.
These drive the dynamic form UI and validate the `properties` JSON
on ingredient lots.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| category_id | integer | FK → ingredient_categories, NOT NULL | |
| field_name | string | NOT NULL | "Form", "Origin", "Crop Year" |
| field_type | string | NOT NULL | text, number, dropdown, checkbox |
| options | string | nullable | For dropdowns: "Pellet, Whole Leaf, Cryo" |
| required | boolean | NOT NULL, default false | |
| sort_order | integer | NOT NULL, default 0 | Field display order |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Unique constraint:** (category_id, field_name)

**Seed data:**

| Category | Field Name | Type | Options |
|----------|-----------|------|---------|
| Grain | Origin | text | |
| Grain | Maltster | text | |
| Hop | Form | dropdown | Pellet, Whole Leaf, Cryo, Extract |
| Hop | Origin | text | |
| Hop | Crop Year | text | |
| Yeast | Lab | text | |
| Yeast | Product Code | text | |
| Yeast | Temp Range Low (F) | number | |
| Yeast | Temp Range High (F) | number | |
| Yeast | Form | dropdown | Dry, Liquid, Slurry |
| Fruit | Form | dropdown | Fresh, Puree, Frozen, Extract |
| Spice | Form | dropdown | Whole, Ground, Extract |
| Sugar | Form | dropdown | Granulated, Liquid, Syrup |

**Note:** "Use" and "Time" are NOT category field definitions — they are
recipe-level decisions stored on `recipe_ingredients.use` and
`recipe_ingredients.time_minutes`. Category field definitions describe
*characteristics of the lot itself* (form, origin, etc.), not how it's
used in a recipe.

---

### ingredients

The abstract ingredient — "Cascade", "2-Row Pale Malt", "US-05".
Groups lots together under a common name.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| name | string | NOT NULL | "Cascade", "2-Row Pale Malt" |
| category_id | integer | FK → ingredient_categories, NOT NULL | |
| notes | text | nullable | General info about this ingredient |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Unique constraint:** (name, category_id)

---

### ingredient_lots

A specific purchase/lot of an ingredient. This is what recipes reference.
Each lot has its own measured characteristics.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| ingredient_id | integer | FK → ingredients, NOT NULL | |
| lot_number | string | nullable | Supplier's lot identifier |
| supplier | string | nullable | "Yakima Chief", "Rahr" |
| received_date | date | nullable | When Matt received it |
| status | string | NOT NULL, default "available" | available, depleted, expired |
| **Calc fields** | | | *Real columns for recipe math* |
| alpha_acid | decimal | nullable | Hop AA% — used for IBU calc |
| color_lovibond | decimal | nullable | Grain color — used for SRM calc |
| potential_gravity | decimal | nullable | Grain PPG — used for OG calc |
| attenuation | decimal | nullable | Yeast attenuation — used for FG calc |
| **Dynamic fields** | | | |
| properties | text (JSON) | nullable | Values matching category field defs |
| notes | text | nullable | "Smells more citrusy than last year" |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Example rows:**

| ingredient | lot_number | supplier | alpha_acid | properties |
|------------|-----------|----------|------------|------------|
| Cascade | #4412 | Yakima Chief | 5.5 | {"Form":"Pellet","Use":"Boil"} |
| Cascade | #5520 | Yakima Chief | 6.2 | {"Form":"Pellet","Use":"Dry Hop"} |
| 2-Row Pale | #882 | Rahr | | {"Use":"Mash"} |
| US-05 | | Fermentis | | {"Lab":"Fermentis","Product Code":"US-05"} |

---

### brands

The beer identity — what goes on the tap handle. Stays constant even as
recipes evolve.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| name | string | NOT NULL, UNIQUE | "Rockcut IPA", "Granite Stout" |
| style | string | nullable | "American IPA", "Irish Dry Stout" |
| description | text | nullable | Tap handle / menu description |
| target_abv | decimal | nullable | Target ABV range |
| target_ibu | decimal | nullable | Bitterness target |
| target_srm | decimal | nullable | Color target |
| status | string | NOT NULL, default "active" | active, seasonal, retired |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

---

### recipes

A specific formulation for a brand. Uses major.minor versioning.
Versions are **frozen once a batch exists** — edits after that
require a minor version bump.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| brand_id | integer | FK → brands, NOT NULL | |
| version_major | integer | NOT NULL, default 1 | Bumped for fundamental changes |
| version_minor | integer | NOT NULL, default 0 | Bumped for lot swaps, tweaks |
| batch_size | decimal | NOT NULL | Target volume |
| batch_size_unit | string | NOT NULL, default "gallons" | gallons, liters |
| boil_time | integer | NOT NULL, default 60 | Minutes |
| efficiency_target | decimal | nullable | Expected brewhouse efficiency % |
| status | string | NOT NULL, default "draft" | draft, active, archived |
| notes | text | nullable | What changed in this version |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Unique constraint:** (brand_id, version_major, version_minor)

**Display format:** "v{major}.{minor}" — e.g., "v3.1"

**Version rules:**
- Major bump (v3.x → v4.0): different grain bill, new hop variety, changed process
- Minor bump (v3.1 → v3.2): lot swap, adjusted amount, timing tweak
- Cannot edit a version that has batches — must bump minor version first

---

### recipe_ingredients

An ingredient line item in a recipe. References a specific lot from
the ingredient library. All ingredient types use this one table.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| recipe_id | integer | FK → recipes, NOT NULL | |
| lot_id | integer | FK → ingredient_lots, NOT NULL | Specific lot used |
| amount | decimal | NOT NULL | How much in this recipe |
| unit | string | NOT NULL | lb, oz, g, kg, pkg, each |
| use | string | nullable | mash, steep, boil, whirlpool, dry_hop, flameout, first_wort, primary, secondary |
| time_minutes | integer | nullable | Addition time (hops, spices) |
| sort_order | integer | NOT NULL, default 0 | Display order within category |
| notes | text | nullable | Recipe-specific notes |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Note:** The lot carries the ingredient identity (name, category, calc fields,
properties like "Form: Pellet"). The recipe ingredient adds how it's *used in
this recipe* — quantity, use/timing, and ordering. This matters because the
same lot can appear twice in one recipe with different uses (e.g., same
Cascade lot for both bittering at 60min and a whirlpool addition at 0min).

**Example: Rockcut IPA v3.2**

| lot | amount | unit | use | time | notes |
|-----|--------|------|-----|------|-------|
| Cascade Lot #4412 | 1.5 | oz | boil | 60 | Bittering |
| Cascade Lot #4412 | 0.75 | oz | whirlpool | 0 | Late addition |
| Cascade Lot #5520 | 0.5 | oz | dry_hop | | Aroma |
| 2-Row Pale Lot #882 | 10 | lb | mash | | |
| Crystal 40L Lot #201 | 1 | lb | mash | | |
| US-05 (no lot) | 1 | pkg | primary | | |

---

### mash_steps

Ordered mash steps for a recipe. Supports single infusion and
multi-step mashes.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| recipe_id | integer | FK → recipes, NOT NULL | |
| step_number | integer | NOT NULL | 1, 2, 3... |
| name | string | NOT NULL | "Protein Rest", "Sacch Rest", "Mash Out" |
| temperature | decimal | NOT NULL | Target temp (F) |
| duration | integer | NOT NULL | Minutes |
| type | string | NOT NULL, default "infusion" | infusion, decoction, direct_heat |
| notes | text | nullable | |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Unique constraint:** (recipe_id, step_number)

---

### recipe_process_steps

Planned process actions in a recipe that aren't ingredient additions.
Things like fermentation temperature changes, trub dumps, cold crashes,
transfers. Ordered by step_number within a recipe. Frozen with recipe
versioning just like ingredients and mash steps.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| recipe_id | integer | FK → recipes, NOT NULL | |
| step_number | integer | NOT NULL | Display/execution order |
| name | string | NOT NULL | "Diacetyl Rest", "Cold Crash", "Trub Dump" |
| day | integer | nullable | Relative brew day (0 = brew day) |
| temperature | decimal | nullable | Target temp if temp change (F) |
| duration | integer | nullable | How long |
| duration_unit | string | NOT NULL, default "minutes" | minutes, hours, days |
| notes | text | nullable | Details, instructions |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Unique constraint:** (recipe_id, step_number)

**Example rows:**

| name | day | temperature | duration | unit | notes |
|------|-----|-------------|----------|------|-------|
| Diacetyl Rest | 3 | 72 | 2 | days | Raise from 66°F to clean up diacetyl |
| Cold Crash | 7 | 34 | 3 | days | Drop to near-freezing for clarity |
| Trub Dump | 2 | | | | Dump trub from conical |
| Gelatin Fine | 8 | | 2 | days | Add gelatin for clarity |

---

### water_profiles

Water chemistry targets for a recipe. One profile per recipe.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| recipe_id | integer | FK → recipes, NOT NULL, UNIQUE | One per recipe |
| calcium | decimal | nullable | Ca (ppm) |
| magnesium | decimal | nullable | Mg (ppm) |
| sodium | decimal | nullable | Na (ppm) |
| sulfate | decimal | nullable | SO4 (ppm) |
| chloride | decimal | nullable | Cl (ppm) |
| bicarbonate | decimal | nullable | HCO3 (ppm) |
| ph_target | decimal | nullable | Target mash pH |
| notes | text | nullable | Source water, adjustments |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

---

### batches

The fermenter fill — the final beer. A batch may require multiple brew
turns to fill (when fermenter > kettle capacity). Linked to a brand
directly; recipes are referenced through brew turns.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| brand_id | integer | FK → brands, NOT NULL | Which beer this is |
| batch_number | string | NOT NULL | "B001" or auto-generated |
| status | string | NOT NULL, default "planned" | planned, brewing, fermenting, conditioning, completed, dumped |
| **Blended actuals** | | | *Measured in fermenter after all turns* |
| actual_og | decimal | nullable | Blended OG in fermenter |
| actual_fg | decimal | nullable | Measured final gravity |
| actual_abv | decimal | nullable | Calculated from OG/FG |
| actual_volume | decimal | nullable | Total volume in fermenter |
| **Fermentation** | | | |
| ferm_start_date | date | nullable | Pitched yeast |
| ferm_end_date | date | nullable | Terminal gravity reached |
| ferm_temp | decimal | nullable | Target/actual fermentation temp (F) |
| **Packaging** | | | |
| package_date | date | nullable | Kegged/bottled/canned |
| package_type | string | nullable | keg, bottle, can |
| **Tasting** | | | |
| rating | integer | nullable | 1-5 stars |
| tasting_notes | text | nullable | Appearance, aroma, flavor, etc. |
| notes | text | nullable | General notes |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Unique constraint:** (batch_number)

**Note:** Efficiency is tracked per brew turn, not per batch (a multi-turn
batch doesn't have a single meaningful efficiency number).

---

### brew_turns

An individual mash+boil session that contributes wort to a batch.
A batch has 1 or more turns. Each turn references a specific recipe
version (which may differ between turns due to ingredient availability).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| batch_id | integer | FK → batches, NOT NULL | Which fermenter this feeds |
| recipe_id | integer | FK → recipes, NOT NULL | Which recipe version was brewed |
| turn_number | integer | NOT NULL | 1, 2, 3... |
| brew_date | date | nullable | When this turn was brewed |
| actual_og | decimal | nullable | Kettle OG for this turn |
| actual_volume | decimal | nullable | Volume into fermenter from this turn |
| actual_efficiency | decimal | nullable | Brewhouse efficiency for this turn |
| notes | text | nullable | |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

**Unique constraint:** (batch_id, turn_number)

**Example: Rockcut IPA batch B001 (15 bbl fermenter, 7 bbl kettle)**

| turn | recipe | brew_date | actual_og | actual_volume | efficiency |
|------|--------|-----------|-----------|---------------|------------|
| 1 | v3.1 | 2026-02-10 | 1.062 | 7 bbl | 73.5% |
| 2 | v3.1 | 2026-02-11 | 1.060 | 7 bbl | 72.0% |

Batch blended result: OG 1.061, volume 13.5 bbl, yeast pitched after turn 1.

---

### batch_log_entries

Timeline of events during a batch. Gravity readings, temperature
checks, additions, transfers, and notes.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto | |
| batch_id | integer | FK → batches, NOT NULL | |
| timestamp | utc_datetime | NOT NULL | When it happened |
| event_type | string | NOT NULL | gravity_reading, temp_reading, dry_hop, transfer, note, ph_reading, other |
| gravity | decimal | nullable | If gravity reading |
| temperature | decimal | nullable | If temp reading (F) |
| ph | decimal | nullable | If pH reading |
| notes | text | nullable | What happened |
| inserted_at | utc_datetime | NOT NULL | |
| updated_at | utc_datetime | NOT NULL | |

---

## Calculated Fields (not stored)

These are derived at query/display time, not stored in the database:

| Calculation | Source | Formula |
|-------------|--------|---------|
| Recipe est. OG | Sum of (lot.potential_gravity * ingredient.amount) / batch_size | Standard PPG formula |
| Recipe est. FG | est_OG - (est_OG - 1) * avg_attenuation | From yeast attenuation |
| Recipe est. ABV | (est_OG - est_FG) * 131.25 | Standard ABV formula |
| Recipe est. IBU | Sum of hop IBU contributions | Tinseth or Rager formula |
| Recipe est. SRM | Sum of (lot.color_lovibond * ingredient.amount) / batch_size | Morey equation |
| Batch actual ABV | (actual_OG - actual_FG) * 131.25 | From measured gravities |
| Turn actual efficiency | actual_OG vs grain bill potential | Per-turn brewhouse efficiency |
| Brand total batches | Count of batches for this brand | |
| Brand avg rating | Average of batch ratings | |

---

## Deferred to v2

| Feature | Notes |
|---------|-------|
| Inventory tracking | Ingredient stock levels, auto-deduct on brew day |
| Cost tracking | Price per ingredient, cost-per-batch, cost-per-pint |
| Ingredient templates | Pre-populated ingredient data (e.g., "Cascade" defaults to typical AA range) |
| BeerJSON import/export | Standard interchange format |
| Multi-user | Multiple brewers, permissions |

---

## Migration Order

Recommended implementation sequence (respects foreign key dependencies):

1. `ingredient_categories` + seed data
2. `category_field_definitions` + seed data
3. `ingredients`
4. `ingredient_lots`
5. `brands`
6. `recipes`
7. `recipe_ingredients`
8. `mash_steps`
9. `water_profiles`
10. `batches`
11. `batch_log_entries`
12. `recipe_process_steps`
13. `brew_turns`
