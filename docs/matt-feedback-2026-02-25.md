# Matt's Process & Standards Feedback — 2026-02-25

Source: Email from Matt after reflecting on first working session.

## TL;DR

Matt's thinking has expanded significantly from ingredients into **brewing process**.
The core ask is a **cascading defaults system**: Brewhouse > Brand Standard > Recipe,
where each level inherits from the one above but can override. This is a meaningful
architectural addition — not a tweak to what we have, but a new layer that sits
*above* the current brand/recipe model.

---

## 1. Brewhouse — Units, Equipment & Standards (NEW ENTITY)

Matt envisions a **brewhouse** as the top-level container — a physical brewing system
with its own unit preferences and equipment-specific values. A brewery could have
multiple brewhouses (production vs. pilot system).

The unit preferences and equipment values are **one concept**: the brewhouse defines
both *what units we measure in* and *the equipment values expressed in those units*.
Matt's notation like `Kettle Turn Size: x.xx (liq vol)` means "measured in whatever
liquid volume unit this brewhouse is configured for."

### UOM Preferences (set per brewhouse, overridable downstream)

| Measurement | Options |
|--------|---------|
| Temperature | F / C |
| Liquid Volume | Bbls / Gallons / Hectoliters / Liters |
| Density | Plato (P) / Specific Gravity (SG) |
| Alcohol | ABV / ABW |
| Density Calc Method | CGAI / PPG |
| IBU Calc Method | Tinseth / (others TBD) |
| Ingredient Weight | Decimal Lbs / Lbs & Ozs / Ozs / Kg / Grams |
| Ingredient Volume | Bbls / Gal / Oz / HL / L / mL |
| Decimal Precision | Per-unit configurable |

### Equipment Values (expressed in the brewhouse's chosen units)

| Field | Type | Expressed In (UOM) |
|-------|------|---------------------|
| Kettle Turn Size | decimal | liq vol unit |
| Kettle Evaporation Rate | decimal | liq vol unit / hr |
| Kettle Loss | decimal | liq vol unit |
| Ferm Loss | decimal | liq vol unit |

### Analysis

- This is a **new entity above Brand** in the hierarchy
- Current hierarchy: Brand > Recipe > Batch
- Proposed hierarchy: **Brewhouse > Brand > Recipe > Batch**
- Unit preferences cascade down: brewhouse sets defaults, brand/recipe can override
- Kettle/ferm loss values feed directly into volume calculations (pre-boil, post-boil, into-fermenter)
- Multi-brewhouse is a real scenario (pilot batches vs. full-scale)
- Maps cleanly to a new `brewhouses` table with unit prefs + equipment values
- Brands would gain an optional `brewhouse_id` FK
- Could start simple: one default brewhouse per account, expand later
- Current model has `batch_size_unit` on Recipe and `unit` on RecipeIngredient —
  these are per-record choices; with a brewhouse they'd gain "use default" behavior
- Formula calculations (IBU, OG, SRM, ABV) need to respect the chosen calc method
- Frontend unit display needs a preferences context provider

### Impact on Existing Schema

- New table: `brewhouses` (unit preferences + equipment values)
- Brands gain `brewhouse_id` (nullable FK, defaults to account's primary brewhouse)
- Batches may also want `brewhouse_id` (a brand could be brewed on either system)
- Recipe and RecipeIngredient already have unit fields; they'd gain "use default" behavior
- Equipment losses are critical for accurate OG/volume calculations

---

## 2. Ingredient Standards (REFINEMENT)

Matt wants better defaults for ingredient quantity display.

### Proposed Settings (per category or global)

| Setting | Options (UOM) |
|---------|---------------|
| Default Quantity Type | Weight / Volume |
| Default Weight Unit | Decimal Lbs / Lbs & Ozs / Ozs / Kg / Grams |
| Default Volume Unit | Bbls / Gal / Oz / HL / L / mL |
| Decimal Precision | Per-unit configurable |

### Analysis

- Extends the existing `category_field_definitions` concept
- Could be additional fields on `ingredient_categories` or part of the unit preferences system
- Current `recipe_ingredients.unit` is already an enum (lb/oz/g/kg/pkg/each) —
  this would set the *default* for new additions, not replace per-record choice
- Low complexity, high usability impact

---

## 3. Brand Standards / Process Templates (NEW CONCEPT — MAJOR)

This is the biggest piece. Matt wants **process templates** that pre-fill recipe
process details when creating a new brand or recipe. These are essentially
"style profiles" (e.g., "RC Ale", "RC Hazy", "RC Lager") that auto-populate
mash, lauter, boil, fermentation, and packaging defaults.

### Proposed Fields (grouped by process phase)

#### Mash
| Field | Type | Notes |
|-------|------|-------|
| Mash Type | enum | Single Infusion / Step / Decoction |
| Mash Foundation Water | decimal | liq vol |
| Strike Water Ratio | decimal | liq vol / grain weight |
| Mash pH | decimal | |
| Mash Schedule | structured | Varies by mash type (see below) |

**Mash Schedule by Type:**
- **Single Infusion**: rest_temperature
- **Step**: array of {temperature, duration} pairs
- **Decoction**: array of {rest_temp, rest_duration, boil_volume, boil_duration} tuples

#### Lauter
| Field | Type | Notes |
|-------|------|-------|
| Vorlauf Duration | integer | min |
| Lauter Type | enum | Continuous / Batch |
| Lauter Temperature | decimal | temp |
| Lauter Water | decimal | liq vol |
| Final Lauter pH | decimal | |
| Lauter Duration | integer | min (continuous only) |

#### Boil & Post-Boil
| Field | Type | Notes |
|-------|------|-------|
| Boil Duration | integer | min |
| Coolpool | boolean | |
| Coolpool Temperature | decimal | temp (if coolpool) |
| Coolpool Duration | integer | min (if coolpool) |
| Coolpool Rest Duration | integer | min (if coolpool) |
| Whirlpool Duration | integer | min |
| Whirlpool Rest Duration | integer | min |
| Knockout Duration | integer | min |
| Knockout Temperature | decimal | temp |

#### Fermentation
| Field | Type | Notes |
|-------|------|-------|
| Lag Temperature | decimal | temp |
| Lag Duration | decimal | days & hours |
| Primary Temperature | decimal | temp |
| Primary Duration | decimal | days & hours |
| Secondary Temperature | decimal | temp |
| Secondary Duration | decimal | days & hours |
| D-Rest Temperature | decimal | temp |
| D-Rest Duration | decimal | days & hours |

#### Cold Crash
| Field | Type | Notes |
|-------|------|-------|
| Crash Type | enum | Single / Step |
| Crash Temperature | decimal | temp (single) |
| Crash Duration | decimal | days & hours (single) |
| Crash Steps | array | {temperature, duration} pairs (step) |

#### Packaging
| Field | Type | Notes |
|-------|------|-------|
| Transfer | enum | None / Yes / Filter |
| Bright Temperature | decimal | temp |
| Bright Duration | decimal | days & hours |
| CO2 Volume | decimal | volumes |

### Analysis

- This is ~40+ fields of process data — too many for flat columns on `brands`
- Best modeled as a separate `brand_standards` or `process_profile` entity
- The "RC Ale / RC Hazy / RC Lager" presets are essentially **process templates**
- Cascading: Template > Brand Standard > Recipe (each can override)
- Current model has `mash_steps` and `recipe_process_steps` on Recipe — these
  are the *per-recipe* version; Brand Standards would be the *defaults* that
  pre-populate those when creating a new recipe
- The variable-length parts (mash schedule, crash steps) need array/JSON storage
  or child tables
- Consider: a `process_profiles` table that can be linked to a brand or used as
  a standalone template

### Relationship to Existing Schema

- `mash_steps` table already exists — brand standard mash schedule would pre-fill these
- `recipe_process_steps` already exists — brand standard ferm/crash/packaging would pre-fill these
- `recipes.boil_time` already exists — brand standard boil duration maps here
- New tables needed: `process_profiles` (or `brand_standards`), possibly `process_templates`
- Significant but **additive** — doesn't break existing schema

---

## 4. UI Feedback & Feature Requests

### Quick Fixes (low effort)

| Request | Current State | Suggested Action |
|---------|--------------|------------------|
| Rename "Extract" category to "Other Consumables" | Seeded as "Extract" | Update seed + allow rename |
| Default Ingredient Library to "Grain" tab | Shows all ingredients | Default filter to first category |
| System default fields for new categories | Fields are user-created | Mark certain field defs as `system: true` |

### Medium Features

| Request | Analysis |
|---------|----------|
| **Archive brands & recipes** | Add `archived` status (or use existing `retired`/`archived`). Filter from default views. Recoverable. |
| **Editable recipe version numbers** | Currently auto-increment. Allow manual edit with uniqueness check within brand. Needs migration to relax auto-assignment. |
| **Copy recipe within brand** | Clone recipe + ingredients + mash steps + process steps, bump version. Straightforward. |
| **Duplicate brand** | Clone brand + all recipes (or just active recipe). New name required. |
| **Move recipe between brands** | Update `recipe_id.brand_id`. Needs confirmation UX. Version renumbering may be needed. |
| **Flag default recipe per brand** | Add `is_default` boolean on recipes (one per brand). Constraint: only one default per brand. |

### Bigger Features (future)

| Request | Notes |
|---------|-------|
| **Yeast Management** | Matt flagged as needing more thought. Yeast propagation, pitching rates, re-pitching tracking. Likely a new subsystem. |

---

## 5. Cascade Architecture Summary

Matt is describing a **4-level defaults cascade**:

```
Brewhouse (equipment + unit preferences)
  └─ Process Template ("RC Ale", "RC Hazy", "RC Lager")
       └─ Brand (inherits template, can override any field)
            └─ Recipe (inherits brand defaults, can override any field)
```

Each level provides defaults; each level below can override.
This is the single most important architectural takeaway.

### Implementation Considerations

- **Settings/preferences**: JSON columns with merge-down logic, or a dedicated
  preferences table with scoped keys
- **Process templates**: Standalone entity reusable across brands
- **Override tracking**: Need to know "is this value inherited or explicitly set?"
  (matters for UX — show inherited values as dimmed/placeholder, explicit as solid)
- **Frontend**: Context provider that resolves effective values by walking the cascade

---

## 6. What This Does NOT Change

- The 13 existing tables remain valid
- Ingredient > Lot two-tier model is confirmed (Matt's still using it)
- Brand > Recipe > Batch flow is confirmed
- Recipe versioning approach is confirmed (Matt wants more control over version numbers)
- Dynamic field definitions system is confirmed (Matt wants system defaults)
- Brew turns model is confirmed

---

## 7. Design Consideration: Process Instances (not in Matt's email, but implied)

Matt's email focuses on process **definitions** (templates, brand standards, cascading
defaults). But the current model has no structured process **instance** — no way to
track what was planned vs. what actually happened for each step of a batch.

### What exists today

| Layer | What it is | Limitation |
|-------|-----------|------------|
| `mash_steps` | Planned mash schedule (definition) | No per-batch actuals |
| `recipe_process_steps` | Planned ferm/crash/transfer (definition) | No per-batch actuals |
| `batches` | A few actual fields (OG, FG, ferm temp/dates) | Flat, not step-by-step |
| `batch_log_entries` | Timestamped event stream | Unstructured — can't tie to planned steps |

### What a process instance would enable

When a batch is created from a recipe, each process step becomes a **task** with
planned values and slots for actuals:

- **Daily task list**: "Batch 47 needs a gravity reading, Batch 52 dry hop is due,
  Batch 55 crash starts today"
- **Overdue alerts**: "Batch 44 primary was planned for 7 days, it's day 9 with
  no D-rest transition"
- **Forward planning**: "Thursday you have 3 batches hitting crash simultaneously —
  consider staggering"
- **Plan vs. actual tracking**: Every step records planned time/temp/duration alongside
  actuals, so Matt can see where process drifts and whether it affects the beer

### Architectural note

The richer the process definitions get (Matt's ~40 fields of brand standards),
the more valuable structured instances become. Designing the definition and instance
layers together — even if we build instances later — avoids rework. The key question:
does each process step in the definition map 1:1 to an executable step in the instance,
or are there steps that expand (e.g., "check gravity daily" becomes N instance tasks)?

This transforms Rockcut from a **recipe book** into a **brewery operations system**.

### Current actuals assessment — what's clean, what's not

The existing model has some "actual" fields scattered across tables. Most are fine;
a few would conflict with proper process instances.

**Clean (batch-level summaries, no conflict):**
- `batches.actual_og/fg/abv/volume` — blended results for the whole batch
- `brew_turns.actual_og/volume/efficiency` — brew day measurements
- `batches.package_date/package_type` — single event
- `batches.rating/tasting_notes` — quality assessment
- `batch_log_entries` — freeform event stream, complements structured instances

**Half-assed actuals (would conflict with process instances):**
- `batches.ferm_start_date` / `batches.ferm_end_date` / `batches.ferm_temp` —
  three flat fields trying to represent a multi-phase fermentation profile.
  These are exactly what process instance steps would replace.

This is 3 fields on 1 table — trivial to deprecate when the time comes.

**Key guideline going forward:** Do NOT add new actual fields to `batches`.
Keep `batches` as the summary record. When we build the brand standards /
process template layer, design it knowing that each template step will eventually
spawn an instance step with planned + actual values. Actuals belong on instance
steps, not on the batch.

---

## 8. Suggested Next Steps (for discussion)

1. **Design the cascade/preferences architecture** — this is foundational and
   affects everything else
2. **Add Brewhouse entity** — simple table, FK from brands
3. **Design process_profiles/brand_standards** — the ~40-field template system
4. **UI quick wins** — rename Extract, default to Grain, archive function
5. **Recipe operations** — copy, duplicate brand, move recipe, editable versions
6. **Yeast management** — wait for Matt's further thinking

Items 1-3 are data model work. Items 4-6 are feature work that can proceed
in parallel once the model is settled.
