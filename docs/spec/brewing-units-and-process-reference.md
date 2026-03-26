# Brewing Units, Notation & Process Reference

> Sources: Matt Heiser's "Brewhouse & Process Profiles", "Ingredient Changes",
> and "Brand & Recipe UI" documents (received 2026-03-15).
> This reference decodes all brewing science notation, units, and process terminology
> used in Matt's specs so future sessions have full context.

---

## 1. Units of Measurement

### Temperature

| Display | Meaning | Notes |
|---------|---------|-------|
| `ºF` | Degrees Fahrenheit | Matt uses the masculine ordinal `º` (U+00BA), not the degree symbol `°` (U+00B0). Follow his convention in the UI. |
| `ºC` | Degrees Celsius | Same `º` convention. |

### Density / Gravity

| Display | Meaning | Notes |
|---------|---------|-------|
| `SG` | Specific Gravity | Dimensionless ratio relative to water (1.000). E.g., 1.048 = wort with moderate sugar content. |
| `º Plato` | Degrees Plato | Measures sugar content as weight percentage. 1 ºP ≈ 4 SG "points" (e.g., 12 ºP ≈ SG 1.048). Industry standard for commercial breweries. |

### Alcohol

| Display | Meaning | Notes |
|---------|---------|-------|
| `ABV` | Alcohol By Volume | Standard percentage (e.g., 5.2% ABV). Most common consumer-facing unit. |
| `ABW` | Alcohol By Weight | Always lower than ABV because alcohol is less dense than water. ABW ≈ ABV × 0.79. Used in some US states for regulatory labeling. |

### Density Calculation Methods

These determine how the app calculates extract potential (how much sugar a grain contributes to wort).

| Display | Meaning | System | Notes |
|---------|---------|--------|-------|
| `PPG` | Points Per Pound Per Gallon | US | How many gravity "points" one pound of grain yields in one gallon of water. E.g., 2-row base malt ≈ 37 PPG. |
| `CGAI` | Coarse Grind As-Is | Lab | Extract yield percentage from a coarsely ground malt sample at its natural (as-is) moisture content. Found on malt Certificate of Analysis (COA) sheets from maltsters. Typical range: 78-82%. |
| `Lº/kg` | Liter-degrees per kilogram | Metric | The metric equivalent of PPG. Measures liters of wort at SG 1.001 produced per kilogram of grain. E.g., 2-row ≈ 300 Lº/kg. Conversion: Lº/kg ≈ PPG × 8.3454. |

### Extract Measurement Systems (Grain)

These measure a grain's **extract potential** — how much fermentable sugar it contributes. Matt's "Ingredient Changes" doc defines a selector where the brewer picks ONE system as the input and the other three auto-calculate.

| Display | Full Name | Notes |
|---------|-----------|-------|
| `CGAI` | Coarse Grind As-Is | Extract yield % from coarsely ground malt at natural moisture. Found on malt COA (Certificate of Analysis) sheets. Typical: 78-82%. This is the most "real-world" number — reflects what the brewer actually gets. |
| `FGDB` | Fine Grind Dry Basis | Extract yield % from finely ground malt with moisture removed. Always higher than CGAI (finer grind = more extract, dry basis = no moisture penalty). The difference (FGDB - CGAI) indicates malt modification — smaller gap = better modified. |
| `PPG` | Points Per Pound Per Gallon | US system. Gravity points one pound yields in one gallon. E.g., 2-row ≈ 37 PPG. |
| `Lº/kg` | Liter-degrees per kilogram | Metric equivalent of PPG. E.g., 2-row ≈ 300 Lº/kg. |

### Grain Color & Enzymatic Power

| Display | Full Name | Notes |
|---------|-----------|-------|
| `º Lov` | Degrees Lovibond | Color measurement for grain. Higher = darker. E.g., Pilsner malt ≈ 1.5 ºL, Crystal 60 ≈ 60 ºL, Chocolate malt ≈ 350 ºL. Also used for SRM (Standard Reference Method) of finished beer — roughly equivalent for single-grain calculations. |
| `º Lintner` | Degrees Lintner | Diastatic power — a grain's enzymatic ability to convert starches to fermentable sugars. Higher = more enzymatic. Base malts (2-row, Pilsner) ≈ 100-160 ºLintner. Specialty malts (Crystal, Roast) ≈ 0. A mash needs ~30 ºLintner minimum to self-convert. **Note:** Matt's doc spells this "Linter" — likely a typo. Standard spelling is "Lintner" (named after Karl Josef Lintner). Confirm with Matt which spelling he prefers for the UI. |

### IBU Calculation Methods

IBU (International Bitterness Units) measures perceived bitterness from hops. Different formulas model hop utilization differently.

| Display | Meaning | Notes |
|---------|---------|-------|
| `Tinseth` | Glenn Tinseth's formula | Most common in craft brewing. Accounts for gravity and time. |
| `Tinseth-modified` | Adjusted Tinseth | Modified for specific brewery variables — larger batches, whirlpool hop additions, or equipment-specific utilization curves. Matt wants this as an option. |
| *(Others)* | Rager, Garetz, etc. | Not in this doc but common in brewing software. May come up later. |

### Volume Units

| Display | Meaning | Notes |
|---------|---------|-------|
| `bbl` | US Beer Barrel | = 31 US gallons. Standard commercial brewing unit. |
| `hL` | Hectoliter | = 100 liters. Standard metric commercial brewing unit. Note: capital L per Matt's request. |
| `L` | Liter | Capital L per Matt. |
| `mL` | Milliliter | Capital L per Matt. |
| `gal` | US Gallon | Implied in PPG context. |
| `oz-liq` | Fluid Ounce | Matt explicitly distinguishes from weight ounces — important because hops and grain are measured by weight, while volumes are fluid oz. |

### Weight Units

Weight units for ingredients (grain, hops, adjuncts) are separate from liquid volume — context from the doc implies the existing options (lb, kg, oz, g) remain, with `oz` renamed to `oz-liq` only in the liquid volume context.

---

## 2. Field Spec Notation (Matt's Convention)

Matt uses a consistent pattern for specifying form fields:

```
Field Label: _x.x_ ( unit )
```

| Notation | Meaning |
|----------|---------|
| `x.x` (underlined) | Decimal input field (e.g., temperature 152.5, volume 7.5) |
| `x` (underlined) | Integer input field (e.g., duration 60, days 14) |
| `( unit )` after field | Unit label displayed alongside the input |
| Dual entry: `_x_ ( days ) _x_ ( hours )` | Two separate inputs for composite duration |

---

## 3. Brewhouse Settings — Requirements

### Rename
- "UOM Preferences" → **"Default Units of Measurement"**

### Capitalization & Symbol Fixes
All dropdown/select values must use proper capitalization and the `º` symbol:

| Field | Current | Required |
|-------|---------|----------|
| Temperature Unit | — | `ºF`, `ºC` (with º symbol) |
| Density Unit | — | `SG`, `º Plato` (capitalize SG, º symbol in Plato) |
| Alcohol Unit | — | `ABV`, `ABW` (all caps) |
| Density Calc Method | — | `PPG`, `CGAI`, **add `Lº/kg`** |
| IBU Calc Method | — | Capitalize all choices (e.g., `Tinseth`), **add `Tinseth-modified`** |
| Ingredient Weight Unit | `oz` → `oz-liq` | Capitalize L in `hL`, `L`, `mL` |

### Dynamic Field Labels
These fields must append the currently-selected unit from Brewhouse settings:

| Field | Display Pattern | Example |
|-------|----------------|---------|
| Kettle Turn Size | `Kettle Turn Size ({liquid_volume_unit})` | `Kettle Turn Size (bbl)` |
| Kettle Loss | `Kettle Loss ({liquid_volume_unit})` | `Kettle Loss (bbl)` |
| Fermenter Loss | `Fermenter Loss ({liquid_volume_unit})` | `Fermenter Loss (bbl)` |
| Evaporation Rate | `Evaporation Rate ({liquid_volume_unit} per hr)` | `Evaporation Rate (bbl per hr)` |

### Duplicate Brewhouse
- Add a "duplicate" action to copy an existing brewhouse configuration.

---

## 4. Process Profiles — Requirements

### Bug Fix
- **Number input fields** currently lose cursor after one digit entry. Must allow full value entry until the user clicks away, tabs, or presses Enter.

### General Standards
- Capitalize all selectable values: `Step`, `Single Infusion`, `Decoction`, etc.
- Show appropriate units on all fields in both display and edit modes.

### Mash Tab — Dynamic Fields by Mash Type

The Mash Type selection controls which fields appear. Matt explicitly states: **these fields belong on the Process Profile, NOT on the Recipe.**

#### Single Infusion (simplest — one rest)
| Field | Input Type | Unit |
|-------|-----------|------|
| Rest temperature | decimal (`x.x`) | ºF / ºC |
| Rest duration | integer (`x`) | min |

#### Step Mash (multiple temperature rests)
| Field | Input Type | Unit |
|-------|-----------|------|
| Rest 1 temperature | decimal | ºF / ºC |
| Rest 1 duration | integer | min |
| Rest 2 temperature | decimal | ºF / ºC |
| Rest 2 duration | integer | min |
| Rest 3... etc. | repeating | — |

*UI implication: dynamic "add rest" capability for variable number of steps.*

**Brewing context:** Step mashing targets different enzymes at different temperatures:
- ~104ºF (40ºC): Acid rest — lowers mash pH
- ~122ºF (50ºC): Protein rest — breaks down large proteins (head retention vs haze)
- ~148-158ºF (64-70ºC): Saccharification — converts starch to sugar (lower = more fermentable/dry, higher = more body)
- ~170ºF (77ºC): Mash-out — stops enzymatic activity

#### Decoction (traditional European method — boil portions of mash)
| Field | Input Type | Unit |
|-------|-----------|------|
| Rest 1 temperature | decimal | ºF / ºC |
| Rest 1 duration | integer | min |
| Boil 1 volume | decimal (`x.x`) | vol (liquid volume unit) |
| Boil 1 duration | integer | min |
| Rest 2 temperature | decimal | ºF / ºC |
| Rest 2 duration | integer | min |
| ... etc. | repeating pairs | — |

*UI implication: alternating rest/boil step pairs, dynamically addable.*

**Brewing context:** A portion of the mash is pulled out, boiled (which breaks down starches and develops melanoidin flavors), then returned to the main mash to raise its temperature to the next rest. Traditional for German lagers, Czech pilsners, Belgian ales.

### Boil Tab
- Rename `Coolpool` → **`Coolpool/Hop Stand`**

**Brewing context:** After the boil, the wort is whirlpooled to separate hop debris and trub. A "hop stand" (also called whirlpool hopping) is the practice of adding hops during this phase at sub-boiling temperatures (typically 170-190ºF) to extract aroma without excessive bitterness. Increasingly common in hazy/New England-style IPAs.

### Fermentation, Cold Crash & Packaging Tabs
- All duration fields → **dual entry: `_x_ (days) _x_ (hours)`**

### Cold Crash Tab — Dynamic Fields by Crash Type

Same pattern as Mash Type — Matt says **these fields belong on Process, not Recipe.**

#### Single Crash (one target temperature)
| Field | Input Type | Unit |
|-------|-----------|------|
| Temperature | decimal | ºF / ºC |
| Crash duration | integer + integer | days + hours |

#### Step Crash (multiple temperature stages)
| Field | Input Type | Unit |
|-------|-----------|------|
| Temperature 1 | decimal | ºF / ºC |
| Step 1 duration | integer + integer | days + hours |
| Temperature 2 | decimal | ºF / ºC |
| Step 2 duration | integer + integer | days + hours |
| ... etc. | repeating | — |

*UI implication: dynamic "add step" capability.*

**Brewing context:** Cold crashing drops the beer temperature rapidly (usually to 32-38ºF / 0-3ºC) to force yeast, proteins, and polyphenols out of suspension for clarity. Step crashing ramps down gradually — sometimes used for lagers (lagering at progressively colder temps) or to avoid thermal shock to yeast that will be harvested for repitching.

### Duplicate Process
- Add a "duplicate" action to copy an existing process profile.

---

## 5. Ingredient Changes — Requirements

> Source: "Ingredient Changes" document

### Grain — New Fields

| Field | Type | Notes |
|-------|------|-------|
| Extract Measurement | Select: `CGAI` / `FGDB` / `PPG` / `Lº/kg` | Determines which extract field is editable vs auto-calculated |
| Moisture % | Number | Required for CGAI ↔ FGDB conversion |
| Extract % FGDB | Number | Editable when FGDB selected, otherwise calculated |
| Extract % CGAI | Number | Editable when CGAI selected, otherwise calculated |
| Extract % PPG | Number | Editable when PPG selected, otherwise calculated |
| Extract % Lº/kg | Number | Editable when Lº/kg selected, otherwise calculated |
| Color (º Lov) | Number | Lovibond color rating |
| Diastatic Power (º Lintner) | Number | Enzymatic strength (see spelling note above) |

### Grain Extract Conversion Logic

The user selects ONE extract measurement system. That field becomes editable; the other three are **auto-calculated** from it. CGAI is the conversion hub — all paths go through it.

```
Conversion chain (CGAI as hub):

  FGDB ←→ CGAI ←→ PPG ←→ Lº/kg

  FGDB = CGAI × (1 + Moisture)
  CGAI = FGDB / (1 + Moisture)

  PPG  = CGAI × 46
  CGAI = PPG  / 46

  Lº/kg = PPG × 8.345
  PPG   = Lº/kg / 8.345
```

**Matt's exact formulas by selection:**

| If selected | Editable | Calculated |
|-------------|----------|------------|
| **CGAI** | CGAI | FGDB = CGAI × (1 + Moisture); PPG = CGAI × 46; Lº/kg = PPG × 8.345 |
| **FGDB** | FGDB | CGAI = FGDB / (1 + Moisture); PPG = CGAI × 46; Lº/kg = PPG × 8.345 |
| **PPG** | PPG | CGAI = PPG / 46; FGDB = CGAI × (1 + Moisture); Lº/kg = PPG × 8.345 |
| **Lº/kg** | Lº/kg | PPG = Lº/kg / 8.345; CGAI = PPG / 46; FGDB = CGAI × (1 + Moisture) |

**Note on Moisture:** Matt's formulas use `(1 + Moisture)` where Moisture is expressed as a decimal (e.g., 4% moisture = 0.04, so factor = 1.04). The FGDB/CGAI relationship accounts for the fact that FGDB is measured on a dry basis while CGAI includes moisture weight.

### Other Ingredient Categories (Stubs)

Matt listed these categories but provided no field details yet — specs presumably coming:

- Sugar
- Fruit
- Hop
- Spice
- Yeast
- Other Adjunct
- Other Consumables

---

## 6. Brand UI — Requirements

> Source: "Brand & Recipe UI" document

### Layout Changes
- Move **Status** designation to after the Brand Name (top of page, outside white box)
- Remove Brand Name from inside the white box (already displayed above)
- List **Brewhouse** first, then **Process Profile**

### Style System
- Add **Style Type** pulldown: `Custom` / `BA Styles (yr)` / `BJCP Styles (yr)`
  - **BA** = Brewers Association style guidelines (updated annually)
  - **BJCP** = Beer Judge Certification Program style guidelines (updated annually)
  - If `Custom`: Style field is a free-text editable box
  - If `BA` or `BJCP`: Style field becomes a pulldown from the selected guideline list (Matt will provide lists later)
  - If `BA` or `BJCP`: add a pop-up/modal to show the **Guideline Description** (too large for inline display)

### New Fields on Brand
| Field | Unit/Display | Notes |
|-------|-------------|-------|
| Original Gravity | Per brewhouse Density Unit (SG or º Plato) | |
| Apparent Attenuation | % | How much sugar the yeast consumes. Typical: 72-82%. |
| Target Alcohol | Per brewhouse Alcohol Unit (ABV or ABW) | Rename from "Target ABV". Auto-calculated from OG × Attenuation. |
| Target IBU | number | |
| Target SRM | number | Standard Reference Method — beer color on a numeric scale |
| Target Mash Efficiency | % | |
| Target Batch Size | per brewhouse volume unit | |

### Recipe Grid within Brand
- Use existing column visibility toggle
- **Default visible columns:** Version, Batch Size, Calc OG, Est Attenuation, Calc Alcohol, Calc IBU, Calc Color, Status
- Add **slider toggle to hide archived recipes**

---

## 7. Recipe UI — Requirements

> Source: "Brand & Recipe UI" document

### Header
- Show **Brand Name** in large font with recipe version in smaller font afterward (replaces current "Recipe vX.X" display)

### Brand Targets Panel (top white box)
Display **Brand Targets**: Batch Size, Mash Efficiency, OG, FG, Alcohol, IBUs, Color
Below that, display **Calculated Values** for each (except Batch Size and Efficiency) — computed from the recipe's actual ingredients.

### Fermentables Table (rename from "Grain Bill")

Spreadsheet-style interface replacing the current "Add Ingredient" button pattern:

| # | Column | Type | Default/Behavior |
|---|--------|------|------------------|
| — | *(drag handle)* | Icon (far left) | Drag to reorder rows |
| 1 | Category | Pulldown | Default: `Grain`. Options: all ingredient categories |
| 2 | Ingredient | Pulldown | Filtered to selected category, sorted alphabetically |
| 3 | Lot # | Pulldown | Filtered to selected ingredient's available lots, sorted alphabetically |
| 4 | Amount | Number | Precision per brewhouse standards |
| 5 | Unit | Pulldown | Default per brewhouse standards, changeable |
| 6 | Use | Pulldown | Default: `Mash`. Options: `Mash` / `Kettle` / `Fermenter` / `Brite` |
| 7 | Time | Number | If Use=Mash, default to recipe mash duration |
| 8 | Note | Text | Free-text |
| 9 | Extract | Display | From ingredient data, using CGAI/PPG per brewhouse Density Calc Method |
| 10 | Color (º Lov) | Display | From ingredient data |
| 11 | Diastatic Power (º Lintner) | Display | From ingredient data |
| 12 | Efficiency | Number | If Use=Mash: default to recipe's Target Mash Efficiency; otherwise: 100% |
| 13 | Extract Expected | Calculated, hidden by default | `weight × Extract × Efficiency` |
| 14 | Color MCUs | Calculated, hidden by default | `weight × Color (º Lov)` |
| 15 | Diastatic Potential | Calculated, hidden by default | `weight × Diastatic Power` |
| 16 | Mash Weight % | Display | `ingredient weight / sum(all mash ingredient weights)` |
| 17 | Extract Weight % | Display | `ingredient extract expected / sum(all fermentable extract expected)` |
| — | *(trash icon)* | Icon (far right) | Delete row |

- Start with one open row, "+" button below to add more
- **Weight note:** "weight" means the `Amount` if measured by weight, OR `Amount × ingredient density` if measured by volume

**Brewing context for Use column values:**
- **Mash**: Added to the grain mash (most fermentables)
- **Kettle**: Added directly to the boil kettle (e.g., sugar, honey, some extracts)
- **Fermenter**: Added during fermentation (e.g., fruit, sugar for carbonation)
- **Brite**: Added in the bright tank (post-fermentation, pre-packaging — e.g., fruit puree, flavor extracts)

### Calculated Values Required

The recipe must compute these from ingredient data:

1. **Preboil Gravity** — gravity after mashing, before boil starts
2. **Original Gravity (OG)** — gravity after the boil (higher due to evaporation concentration)
3. **Final Gravity (FG)** — gravity after fermentation (from OG × attenuation)
4. **Mash Diastatic Power** — total enzymatic power available in the mash
5. **IBUs** — from hop schedule (formula TBD, likely in a separate hops doc)
6. **Color SRM** — from fermentable MCU contributions
7. **Alcohol %** — from OG and FG
8. **Estimated Calories** — from alcohol and residual sugar

---

## 8. Gravity Calculation Formulas (from Matt)

> Source: "Brand & Recipe UI" document — these are Matt's exact formulas

### Simple Path: PPG or Lº/kg Density Calc Method

When the brewhouse uses PPG or Lº/kg, gravity in SG is straightforward:

```
SG = 1 + (sum_of_extract_potential_at_point / wort_volume_at_point) / 1000
```

Where extract potential = weight × PPG (or Lº/kg equivalent) × efficiency for each ingredient added up to that point, and volume is the wort volume at that brewing stage.

### Complex Path: CGAI or FGDB Density Calc Method

When using percentage-based extract (CGAI/FGDB), Matt provides a **cubic equation solver** because the relationship between extract percentage (Plato, weight-based) and SG (volume-based) is nonlinear.

**Constants** (coefficients of the SG↔Plato polynomial):
```
CW = 135.997
CX = -630.272
CY = 1111.140
CZ = -616.868
```

**Variables** (computed in sequence):
```
VA = -(100 × PotExp × 0.4536 / (Vol × 31 × 3.785))

  where: PotExp = sum of (weight_lbs × extract% × efficiency) for all ingredients at that point
         Vol    = wort volume in bbls at that point
         0.4536 = lbs to kg conversion
         31     = bbl to gal
         3.785  = gal to liters

VB = CY² - 3×CX×CZ + 12×CW×VA

VC = 2×CY³ - 9×CX×CY×CZ + 27×CW×CZ² + 27×CX²×VA - 72×CW×CY×VA

VD = -CX / (4×CW)

VE = 1 / (3 × 2^(1/3) × CW)

VF = (VC + SQRT(-4×VB³ + VC²))^(1/3)
```

**⚠ TYPO IN MATT'S DOC:** The VF formula references `Q2` — this should be `VC` (the variable defined on the preceding line). Confirmed by mathematical analysis: this is Ferrari's method for solving the cubic polynomial.

**Final SG equation:**
```
SG = VD
   - 0.5 × SQRT(CX²/(4×CW²) - 2×CY/(3×CW) + 2^(1/3)×VB/(3×CW×VF) + VE×VF)
   + 0.5 × SQRT(CX²/(2×CW²) - 4×CY/(3×CW) - 2^(1/3)×VB/(3×CW×VF) - VE×VF
                 - (-(CX³/CW³) + 4×CX×CY/CW² - 8×CZ/CW)
                   / (4 × SQRT(CX²/(4×CW²) - 2×CY/(3×CW) + 2^(1/3)×VB/(3×CW×VF) + VE×VF)))
```

**Brewing context:** This formula exists because CGAI/FGDB are weight-percentage measurements (like Plato), and converting weight-% extract potential to specific gravity requires solving the nonlinear Plato↔SG polynomial. For PPG/Lº/kg systems, the values already express gravity points directly, so the simple division works.

### SG ↔ Plato Interconversion

```
# SG to Plato
GravPlato = -616.868 + 1111.14×GravSG - 630.272×GravSG² + 135.997×GravSG³

# Plato to SG
GravSG = 1 + (GravPlato / (258.6 - (0.8795 × GravPlato)))
```

---

## 9. Typos & Items to Confirm with Matt

| Item | In Doc | Likely Correct | Action |
|------|--------|----------------|--------|
| `Linter` | Ingredient Changes | `Lintner` (Karl Josef Lintner) | Confirm preferred UI spelling |
| `Ferementer` | Brand & Recipe UI | `Fermenter` | Typo — fix in implementation |
| `Q2` in VF formula | Brand & Recipe UI | `VC` (variable defined on prior line) | Typo — confirm with Matt |
| `Brite` | Brand & Recipe UI | `Brite` or `Bright` | Valid industry term — confirm preferred spelling |
| BA/BJCP style lists | Brand & Recipe UI | Lists to be provided later | Pending from Matt |

---

## 10. Design Principles from These Documents

1. **Process owns the process parameters.** Mash steps and cold crash steps live on the Process Profile, not duplicated onto Recipe formulation. Recipe references a Process Profile.

2. **Units are brewhouse-scoped.** The brewhouse's "Default Units of Measurement" drive what unit labels appear on all downstream fields (process profiles, recipes, batches).

3. **Dynamic field expansion.** Mash Type and Crash Type selections control how many sub-fields appear. This is a repeating-group pattern: the user picks a type, then gets N steps they can add/remove.

4. **Consistent capitalization.** All enum/select values use Title Case or standard abbreviation casing (SG, ABV, PPG, etc.).

5. **Input UX.** Number fields must behave like standard form inputs — no premature blur.

---

## 11. Conversion Formulas (quick reference)

### Matt's Exact Formulas (from "Ingredient Changes" doc)

These are the formulas Matt specified — use these as the source of truth for implementation:

```
# Extract conversions (CGAI as hub)
FGDB  = CGAI × (1 + Moisture)       # Moisture as decimal, e.g. 0.04 for 4%
CGAI  = FGDB / (1 + Moisture)
PPG   = CGAI × 46
CGAI  = PPG / 46
Lº/kg = PPG × 8.345
PPG   = Lº/kg / 8.345
```

### Additional Brewing Formulas (for unit switching and calculations)

```
# Plato ↔ SG (simplified, accurate for brewing range)
SG = 1 + (Plato / (258.6 - 0.8796 × Plato × 0.01))
Plato = (-1 × 616.868) + (1111.14 × SG) - (630.272 × SG²) + (135.997 × SG³)

# ABV from OG/FG
ABV = (OG - FG) × 131.25              # simple
ABV = (76.08 × (OG - FG) / (1.775 - OG)) × (FG / 0.794)  # more accurate

# ABW from ABV
ABW = ABV × 0.79336

# Volume conversions
1 bbl = 31 gal = 117.348 L = 1.17348 hL
1 hL  = 100 L = 26.417 gal = 0.8523 bbl
```
