# Rockcut Brewing — Domain Model

A brewery management application. This document shows how the domain decomposes into bounded contexts, entities, relationships, and computed values.

---

## Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BREWING DOMAIN                              │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────┐ │
│  │  Ingredients  │   │  Formulation │   │  Execution              │ │
│  │              │   │              │   │                         │ │
│  │  Category    │   │  Brewhouse   │   │  Batch                  │ │
│  │  FieldDef    │   │  Process     │   │  BrewTurn               │ │
│  │  Ingredient  │   │  Brand       │   │  BatchLogEntry          │ │
│  │  Lot         │   │  Recipe      │   │                         │ │
│  │              │   │  RecipeIngr  │   │                         │ │
│  │              │   │  MashStep    │   │                         │ │
│  │              │   │  ProcessStep │   │                         │ │
│  │              │   │  WaterProfile│   │                         │ │
│  └──────────────┘   └──────────────┘   └─────────────────────────┘ │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────────────────────────────┐   │
│  │  Identity    │   │  Calculations (computed, not stored)     │   │
│  │              │   │                                          │   │
│  │  User        │   │  FormulaCatalog → est_og, est_fg,        │   │
│  │  (auth,      │   │    est_abv, est_ibu, est_srm,           │   │
│  │   roles)     │   │    est_calories, inventory_on_hand       │   │
│  └──────────────┘   │  BrewingConversions → extract chain,     │   │
│                      │    SG↔Plato, ABV↔ABW, volume units      │   │
│                      └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Entity Relationship Diagram

```
User
  (standalone — auth only)


IngredientCategory ──────< CategoryFieldDefinition
       │
       │ 1:many
       ▼
Ingredient ──────< IngredientLot
                        │
                        │ (lot referenced by recipe ingredients)
                        ▼
                   RecipeIngredient >────── Recipe
                                             │
                                    ┌────────┼────────┬──────────┐
                                    │        │        │          │
                                    ▼        ▼        ▼          ▼
                               MashStep  ProcessStep  WaterProfile  BrewTurn
                                                                      │
                                                                      ▼
                              Brand ◄─────────────────────────── Batch ──< BatchLogEntry
                               │ │
                   belongs_to  │ │ belongs_to
                               ▼ ▼
                        Brewhouse  ProcessProfile
```

---

## Entities by Context

### Ingredients Context

**IngredientCategory** — Classification of ingredients
```
  id              integer PK
  name            string      UNIQUE, REQUIRED  (Grain, Hop, Yeast, Fruit, Spice, Sugar, Adjunct, Other Consumables)
  sort_order      integer
```

**CategoryFieldDefinition** — Dynamic custom fields per category
```
  id              integer PK
  category_id     FK → IngredientCategory  REQUIRED
  field_name      string      REQUIRED       (e.g., "Origin", "Form", "Lab")
  field_type      string      REQUIRED       (text, number, dropdown)
  options         string                     (comma-separated for dropdowns)
  required        boolean     default: false
  sort_order      integer
```

**Ingredient** — Master ingredient record
```
  id              integer PK
  name            string      REQUIRED
  category_id     FK → IngredientCategory  REQUIRED
  notes           string

  PLANNED (D17):
  extract_measurement  string   (cgai | fgdb | ppg | l_deg_kg)
  moisture_pct         decimal
  extract_cgai         decimal
  extract_fgdb         decimal
  extract_ppg          decimal
  extract_l_deg_kg     decimal
  color_lovibond       decimal
  diastatic_power      decimal
```

**IngredientLot** — Specific purchase/batch of an ingredient
```
  id                integer PK
  ingredient_id     FK → Ingredient  REQUIRED
  lot_number        string
  supplier          string
  received_date     date
  status            string      (available | reserved | depleted)
  alpha_acid        decimal     (hops — % alpha acid)
  color_lovibond    decimal     (grain — º Lovibond)
  potential_gravity  decimal    (grain — SG format, e.g., 1.037)
  attenuation       decimal     (yeast — apparent attenuation %)
  properties        map         (custom fields from CategoryFieldDefinition)
  notes             string
```

**Design notes:**
- Ingredient is the abstract master (2-Row Pale Malt). Lot is a specific purchase from a specific supplier.
- Lot carries the lab analysis values (alpha acid, color, gravity) because these vary by harvest/batch.
- Custom fields (properties map) allow category-specific data without schema changes.

---

### Formulation Context

**Brewhouse** — Equipment configuration and unit preferences
```
  id                      integer PK
  name                    string      REQUIRED
  is_default              boolean     default: false
  notes                   string

  -- Unit of Measurement Preferences --
  temp_unit               string      default: "F"         (F | C)
  liquid_vol_unit         string      default: "bbls"      (bbls | gallons | hectoliters | liters)
  density_unit            string      default: "sg"        (sg | plato)
  alcohol_unit            string      default: "abv"       (abv | abw)
  density_calc_method     string      default: "ppg"       (ppg | cgai | fgdb* | l_deg_kg*)
  ibu_calc_method         string      default: "tinseth"   (tinseth | rager | garetz | tinseth_modified*)
  ingredient_weight_unit  string      default: "lb"        (lb | lb_oz | oz | kg | g)
  ingredient_vol_unit     string      default: "gal"       (bbls | gal | oz | hl | l | ml)

  -- Equipment Values --
  kettle_turn_size        decimal     (volume per brew turn)
  kettle_evaporation_rate decimal     (volume lost per hour of boil)
  kettle_loss             decimal     (volume left behind in kettle)
  ferm_loss               decimal     (volume lost in fermenter)

  * = planned D18 additions
```

**ProcessProfile** — Reusable brewing procedure template
```
  id                integer PK
  name              string      REQUIRED
  description       string

  -- Mash --
  mash_type              string   (single_infusion | step | decoction)
  mash_foundation_water  decimal
  strike_water_ratio     decimal
  mash_ph                decimal
  mash_schedule          map      (dynamic steps for step/decoction mash)

  -- Lauter --
  vorlauf_duration       integer
  lauter_type            string   (continuous | batch)
  lauter_temperature     decimal
  lauter_water           decimal
  final_lauter_ph        decimal
  lauter_duration        integer

  -- Boil & Post-Boil --
  boil_duration          integer
  coolpool               boolean
  coolpool_temperature   decimal
  coolpool_duration      integer
  coolpool_rest_duration integer
  whirlpool_duration     integer
  whirlpool_rest_duration integer
  knockout_duration      integer
  knockout_temperature   decimal

  -- Fermentation --
  lag_temperature        decimal
  lag_duration           integer
  primary_temperature    decimal
  primary_duration       integer
  secondary_temperature  decimal
  secondary_duration     integer
  d_rest_temperature     decimal
  d_rest_duration        integer

  -- Cold Crash --
  crash_type             string   (single | step)
  crash_temperature      decimal
  crash_duration         integer
  crash_steps            map      (dynamic steps for step crash)

  -- Packaging --
  transfer_type          string   (none | yes | filter)
  bright_temperature     decimal
  bright_duration        integer
  co2_volume             decimal
```

**Brand** — A beer's identity (links to equipment and process)
```
  id                  integer PK
  name                string      REQUIRED
  style               string
  description         string
  target_abv          decimal
  target_ibu          decimal
  target_srm          decimal
  status              string      (active | seasonal | retired | archived)
  brewhouse_id        FK → Brewhouse      NULLABLE (falls back to default)
  process_profile_id  FK → ProcessProfile  NULLABLE

  PLANNED (D16):
  apparent_attenuation    decimal   (e.g., 0.75 for 75%)
  target_mash_efficiency  decimal   (e.g., 0.80 for 80%)
  target_batch_size       decimal
  original_gravity        decimal
```

**Recipe** — A versioned formulation belonging to a brand
```
  id                integer PK
  brand_id          FK → Brand  REQUIRED
  version_major     integer     default: 1
  version_minor     integer     default: 0
  batch_size        decimal
  batch_size_unit   string      default: "bbls"  (bbls | gallons | liters)
  boil_time         integer     default: 60  (minutes)
  efficiency_target decimal
  status            string      (draft | active | archived)
  is_default        boolean     default: false
  notes             string
```

**RecipeIngredient** — A line item in a recipe's ingredient list
```
  id            integer PK
  recipe_id     FK → Recipe  REQUIRED
  lot_id        FK → IngredientLot  REQUIRED
  amount        decimal     REQUIRED
  unit          string      REQUIRED
  use           string      (Mash | Boil | Whirlpool | Fermenter | Brite)
  time_minutes  integer
  sort_order    integer
  notes         string
```

**MashStep** — Temperature/duration step within a recipe's mash
```
  id            integer PK
  recipe_id     FK → Recipe  REQUIRED
  step_number   integer
  temperature   decimal
  duration      integer     (minutes)
  step_type     string
  notes         string
```

**RecipeProcessStep** — Non-ingredient process actions
```
  id            integer PK
  recipe_id     FK → Recipe  REQUIRED
  phase         string      REQUIRED  (fermentation | cold_crash | packaging)
  step_number   integer
  temperature   decimal
  duration      integer
  action        string
  notes         string
```

**WaterProfile** — Water chemistry for a recipe
```
  id          integer PK
  recipe_id   FK → Recipe  REQUIRED (1:1)
  calcium     decimal   (Ca ppm)
  magnesium   decimal   (Mg ppm)
  sodium      decimal   (Na ppm)
  sulfate     decimal   (SO4 ppm)
  chloride    decimal   (Cl ppm)
  bicarbonate decimal   (HCO3 ppm)
  ph          decimal
  notes       string
```

---

### Execution Context

**Batch** — A production run of a recipe
```
  id                integer PK
  brand_id          FK → Brand  REQUIRED
  batch_number      string
  status            string     (planned | brewing | fermenting | conditioning | packaging | complete | archived)
  planned_date      date
  brew_date         date
  actual_og         decimal
  actual_fg         decimal
  actual_abv        decimal
  ferm_start_date   date
  ferm_end_date     date
  package_date      date
  package_volume    decimal
  package_unit      string
  notes             string
```

**BrewTurn** — Individual mash+boil session (a batch may need multiple turns to fill a fermenter)
```
  id            integer PK
  batch_id      FK → Batch  REQUIRED
  recipe_id     FK → Recipe  REQUIRED
  turn_number   integer     REQUIRED
  brew_date     date
  volume        decimal
  volume_unit   string
  pre_boil_sg   decimal
  post_boil_sg  decimal
  notes         string
```

**BatchLogEntry** — Time-series observations during fermentation/conditioning
```
  id            integer PK
  batch_id      FK → Batch  REQUIRED
  logged_at     utc_datetime  REQUIRED
  entry_type    string     (gravity | temperature | ph | event | note)
  gravity       decimal
  temperature   decimal
  ph            decimal
  notes         string
```

---

### Identity Context

**User** — Authentication and authorization
```
  id                    integer PK
  email                 string      UNIQUE, REQUIRED
  hashed_password       string      REQUIRED
  name                  string
  role                  string      default: "user"  (admin | user)
  is_active             boolean     default: true
  must_change_password  boolean     default: false
```

---

## Computed Values (Formula Engine)

These values are **not stored** — they're computed on demand from the entities above.

| Computation | Inputs | Formula |
|-------------|--------|---------|
| Est. OG | RecipeIngredients (fermentables), Recipe.efficiency, Recipe.batch_size | Σ(weight × gravity_points × efficiency) / volume |
| Est. FG | Est. OG, Brand.apparent_attenuation | OG - (OG - 1.0) × attenuation |
| Est. ABV | Est. OG, Est. FG | (OG - FG) × 131.25 |
| Est. IBU | RecipeIngredients (hops), Recipe.batch_size, Recipe.boil_time | Tinseth: Σ(mg/L_alpha × utilization) |
| Est. SRM | RecipeIngredients (fermentables), Recipe.batch_size | Morey: 1.4922 × (Σ(weight × lovibond) / volume)^0.6859 |
| Est. Calories | Est. OG, Est. FG, Est. ABV | 3621 × FG × ((0.8114×OG_P + 0.1892×FG_P)/100 + 0.568×ABV/100) |
| Extract conversions | Ingredient.extract_cgai, moisture | CGAI ↔ FGDB ↔ PPG ↔ Lº/kg chain |
| Inventory on hand | IngredientLot.status | Count of lots where status = "available" |

---

## Key Domain Patterns

### 1. Brewhouse Resolution
A Brand may or may not have an explicit brewhouse. When `brewhouse_id` is null, the system resolves to the default brewhouse (`is_default = true`). All unit preferences and equipment values flow from the resolved brewhouse.

### 2. Lot-Based Traceability
Recipes reference specific **lots**, not abstract ingredients. This means a recipe knows exactly which purchase of 2-Row (from which supplier, which harvest) is in the grain bill. Lab analysis values (alpha acid, color, gravity) live on the lot because they vary between purchases.

### 3. Versioned Recipes
Recipes use major.minor versioning within a brand. Multiple recipe versions can coexist. One is marked `is_default`. Recipes are frozen once a batch references them.

### 4. Multi-Turn Batches
A single batch (one fermenter fill) may require multiple brew turns if the fermenter is larger than the kettle. Each turn tracks its own pre/post-boil gravity.

### 5. Dynamic Category Fields
Rather than separate schemas for each ingredient type (GrainIngredient, HopIngredient, etc.), the system uses a generic Ingredient + CategoryFieldDefinition pattern. Categories define what custom fields exist; lots store the values in a JSON `properties` map.

### 6. Separation of Template vs Instance
ProcessProfile is a reusable template. A Brand references a ProcessProfile, and a Batch references a Recipe (which inherits from the Brand). Actual values (actual_og, actual_fg) live on the Batch, not the Recipe — the recipe is the plan, the batch is the execution.

### 7. Computed Values as a Service
Brewing calculations (OG, FG, ABV, IBU, SRM, calories) are never stored. They're computed on demand through a FormulaCatalog/FormulaRuntime pattern that provides safe, isolated, timeout-protected execution. The formula engine is generic (lives in a shared datagrid library) while the brewing-specific functions are registered per-app.
