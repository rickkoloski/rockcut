# D15 Calculation Review — For Matt's Review

**Date:** 2026-03-19
**Recipe:** Test IPA v1.0 (10 bbl batch, 80% efficiency, 60 min boil)

---

## Ingredient Data

| # | Ingredient | Category | Amount | Unit | Use | Time | Potential Gravity | Color (Lov) | Alpha Acid % |
|---|-----------|----------|--------|------|-----|------|-------------------|-------------|-------------|
| 1 | 2-Row Pale Malt | Grain | 200 | lb | Mash | 60 min | 1.037 | 1.8 | — |
| 2 | Crystal 60 | Grain | 20 | lb | Mash | 60 min | 1.034 | 60.0 | — |
| 3 | Centennial | Hop | 2 | oz | Boil | 60 min | — | — | 10.0 |
| 4 | Cascade | Hop | 1 | oz | Boil | 5 min | — | — | 5.5 |

---

## Calculations

### Est. OG (Original Gravity)

| Step | Data Fields | Formula | Value | Matt's Notes |
|------|------------|---------|-------|-------------|
| Batch volume | batch_size=10, batch_size_unit=bbls | 10 × 31 gal/bbl | 310 gal | |
| Efficiency | recipe.efficiency_target | From recipe (default 0.72 if blank) | 0.80 (80%) | |
| 2-Row gravity points | amount=200 lb, potential_gravity=1.037 | (1.037 - 1.0) × 1000 × 200 × 0.80 | 5,920 | |
| Crystal 60 gravity points | amount=20 lb, potential_gravity=1.034 | (1.034 - 1.0) × 1000 × 20 × 0.80 | 544 | |
| Total points | — | 5,920 + 544 | 6,464 | |
| OG | total_points / volume / 1000 | 1.0 + (6,464 / 310 / 1000) | **1.0209** | |

### Est. FG (Final Gravity)

| Step | Data Fields | Formula | Value | Matt's Notes |
|------|------------|---------|-------|-------------|
| OG | from above | — | 1.0209 | |
| Attenuation | brand.apparent_attenuation | **Field doesn't exist yet — using default** | 0.75 (75%) | |
| FG | OG - (OG - 1.0) × attenuation | 1.0209 - (0.0209 × 0.75) | **1.0052** | |

### Est. ABV (Alcohol By Volume)

| Step | Data Fields | Formula | Value | Matt's Notes |
|------|------------|---------|-------|-------------|
| OG | from above | — | 1.0209 | |
| FG | from above | — | 1.0052 | |
| ABV | (OG - FG) × 131.25 | (1.0209 - 1.0052) × 131.25 | **2.1%** | |

### Est. IBU (International Bitterness Units) — Tinseth

| Step | Data Fields | Formula | Value | Matt's Notes |
|------|------------|---------|-------|-------------|
| Batch volume | — | from above | 310 gal | |
| Gravity assumption | — | **Hardcoded 1.050 (should use actual OG)** | 1.050 | |
| Bigness factor | gravity | 1.65 × 0.000125^(1.050 - 1.0) | 1.65 × 0.000125^0.050 | |
| **Centennial contribution** | | | | |
| Alpha acid | lot.alpha_acid = 10.0% | — | 0.10 | |
| Weight | amount=2 oz | — | 2 oz (56.7 g) | |
| Boil time | time_minutes=60 | — | 60 min | |
| Boil factor | boil_time | (1 - e^(-0.04 × 60)) / 4.15 | 0.219 | |
| Utilization | bigness × boil_factor | — | ~0.252 | |
| mg/L alpha | AA% × weight_g × 1000 / volume_mL | 0.10 × 56,699 × 1000 / 1,173,477 | ~4.83 | |
| IBU contribution | mg/L × utilization | — | ~1.2 | |
| **Cascade contribution** | | | | |
| Alpha acid | lot.alpha_acid = 5.5% | — | 0.055 | |
| Weight | amount=1 oz | — | 1 oz (28.35 g) | |
| Boil time | time_minutes=5 | — | 5 min | |
| Boil factor | boil_time | (1 - e^(-0.04 × 5)) / 4.15 | 0.044 | |
| Utilization | bigness × boil_factor | — | ~0.050 | |
| mg/L alpha | AA% × weight_g × 1000 / volume_mL | 0.055 × 28,350 × 1000 / 1,173,477 | ~1.33 | |
| IBU contribution | mg/L × utilization | — | ~0.07 | |
| **Total IBU** | sum of contributions | — | **~1.3** | |

### Est. SRM (Beer Color) — Morey Equation

| Step | Data Fields | Formula | Value | Matt's Notes |
|------|------------|---------|-------|-------------|
| Batch volume | — | from above | 310 gal | |
| 2-Row MCU | amount=200 lb, color_lovibond=1.8 | 200 × 1.8 | 360 | |
| Crystal 60 MCU | amount=20 lb, color_lovibond=60.0 | 20 × 60 | 1,200 | |
| Total MCU | — | 360 + 1,200 | 1,560 | |
| MCU per gallon | total / volume | 1,560 / 310 | 5.03 | |
| SRM | Morey equation | 1.4922 × 5.03^0.6859 | **~5.0** | |

### Est. Calories (per 12oz serving)

| Step | Data Fields | Formula | Value | Matt's Notes |
|------|------------|---------|-------|-------------|
| OG Plato | OG=1.0209 | -616.868 + 1111.14×SG - 630.272×SG² + 135.997×SG³ | ~5.3 ºP | |
| FG Plato | FG=1.0052 | same polynomial | ~1.3 ºP | |
| ABV | from above | — | 2.1% | |
| Cal/liter | FG, OG_plato, FG_plato, ABV | 3621 × FG × ((0.8114×OG_P + 0.1892×FG_P)/100 + 0.568×ABV/100) | ~173 | |
| Cal/12oz | cal_per_liter × 0.354882 | 173 × 0.354882 | **~61** | |

---

## Known Simplifications & Defaults

| Item | Current Behavior | What Should Happen | Matt's Notes |
|------|-----------------|-------------------|-------------|
| Attenuation | Hardcoded 0.75 (75%) | Read from brand.apparent_attenuation (field not yet on schema) | |
| IBU gravity factor | Hardcoded 1.050 | Should use actual computed OG for the bigness factor | |
| Efficiency default | 0.72 if recipe has no value | Should this come from brewhouse or brand target? | |
| Fermentable categories | Grain, Extract, Sugar contribute to OG | Is this the right set? Should Fruit count? | |
| Hop utilization | Standard Tinseth | Matt asked for "Tinseth-modified" — what's the modification? | |
| Calorie formula | Standard brewing cal formula | Is this the right formula? Any adjustments? | |
| Potential gravity source | lot.potential_gravity (stored as SG, e.g. 1.037) | Should this come from the new extract fields (CGAI/PPG) instead? | |
| Volume losses | Not factored in | Should OG calc subtract kettle_loss from batch volume? | |

---

## Extract Conversion Chain (from Ingredient Changes doc)

| Step | Data Fields | Formula | Matt's Notes |
|------|------------|---------|-------------|
| CGAI → FGDB | cgai, moisture (decimal) | FGDB = CGAI × (1 + moisture) | |
| CGAI → PPG | cgai | PPG = CGAI × 46 | |
| PPG → Lº/kg | ppg | Lº/kg = PPG × 8.345 | |
| FGDB → CGAI | fgdb, moisture | CGAI = FGDB / (1 + moisture) | |
| PPG → CGAI | ppg | CGAI = PPG / 46 | |
| Lº/kg → PPG | l_deg_kg | PPG = Lº/kg / 8.345 | |

**Note:** In these formulas, CGAI is expressed as a percentage (e.g., 80.5) but divided by 100 internally for the PPG conversion (PPG = (CGAI/100) × 46). Confirm this matches Matt's intent.

---

## SG ↔ Plato Conversions

| Direction | Formula | Matt's Notes |
|-----------|---------|-------------|
| SG → Plato | -616.868 + 1111.14×SG - 630.272×SG² + 135.997×SG³ | |
| Plato → SG | 1 + (Plato / (258.6 - (0.8795 × Plato))) | |
