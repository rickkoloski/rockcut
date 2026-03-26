# D15: Brewing Calculations Engine — Specification

**Status:** In Progress
**Created:** 2026-03-19
**Updated:** 2026-03-19
**Depends On:** D6 (FormulaCatalog/FormulaRuntime), D7 (DataGrid formula engine), D12 (Brewhouse/Process Profile UI)
**Branch:** `feature/d15-brewing-calculations`

## Objective

Test and extend the existing formula execution architecture against Matt's calculation requirements from his March 2026 documents. Build the BrewingConversions module, expand the FormulaCatalog with new recipe-level formulas, validate row-field math in the parser, and prototype the form-level auto-calc pattern for extract conversions.

## Reference

- `docs/spec/brewing-units-and-process-reference.md` — Full glossary, requirements, and Matt's exact formulas
- `docs/spec/matt-docs-questions.md` — Open questions (assume reasonable defaults where needed)

## Scope

### WS-1: BrewingConversions Module (Backend)

New Elixir module: `RockcutApi.Formulas.Functions.BrewingConversions`

Implements Matt's exact conversion formulas:

**Extract conversions (CGAI as hub):**
```
FGDB  = CGAI × (1 + Moisture)       # Moisture as decimal
CGAI  = FGDB / (1 + Moisture)
PPG   = CGAI × 46
CGAI  = PPG / 46
Lº/kg = PPG × 8.345
PPG   = Lº/kg / 8.345
```

**Gravity conversions:**
```
SG → Plato: -616.868 + 1111.14×SG - 630.272×SG² + 135.997×SG³
Plato → SG: 1 + (Plato / (258.6 - (0.8795 × Plato)))
```

**Alcohol conversions:**
```
ABV = (OG - FG) × 131.25                    # simple
ABV = (76.08 × (OG-FG) / (1.775-OG)) × (FG/0.794)  # accurate
ABW = ABV × 0.79336
```

**Volume conversions:**
```
bbl ↔ gal ↔ L ↔ hL (1 bbl = 31 gal = 117.348 L)
```

**Full ExUnit test coverage** with known good values.

### WS-2: New FormulaCatalog Entries (Backend)

Add to the existing catalog following the est_ibu/est_og pattern:

| Function | Input | Output | Notes |
|----------|-------|--------|-------|
| `est_fg` | recipe_id | Final Gravity | OG × (1 - attenuation). Uses recipe's brand attenuation or default 75%. |
| `est_abv` | recipe_id | Alcohol % | From OG and FG using simple formula. |
| `est_srm` | recipe_id | Color (SRM) | Morey equation: `1.4922 × MCU^0.6859`. MCU = Σ(weight_lbs × lovibond) / volume_gal. |
| `est_calories` | recipe_id | Calories per 12oz | Standard: `cal = 3621 × FG × ((0.8114 × OG_plato + 0.1892 × FG_plato) / 100 + 0.568 × ABV/100)` (simplified). |

Each gets:
- Handler function in `BrewingCalcs` (or new module)
- Catalog registration with params schema
- ExUnit tests
- Frontend `useFormulaFunctions` registration
- Formula help entry

### WS-3: Row-Field Math Validation (Frontend)

Validate that the existing formula parser handles pure row-field math (not just remote functions). Build a prototype column definition:

```typescript
{ field: 'extract_expected', formula: '=amount * extract * efficiency' }
```

Test with the existing parser against mock row data. Document what works and what doesn't. This validates feasibility for the Fermentables table (future work).

### WS-4: Form-Level Auto-Calc Pattern (Frontend)

New pattern: `useExtractConversions` React hook.

Given an extract measurement type and one editable value + moisture, computes the other three extract values in real-time.

```typescript
const { values, setMeasurement, setEditableValue, setMoisture } = useExtractConversions({
  measurement: 'cgai',  // which field is editable
  moisture: 0.04,       // decimal
  value: 80.5           // the editable field's value
});
// values = { cgai: 80.5, fgdb: 83.72, ppg: 37.03, l_deg_kg: 309.0 }
```

This establishes the pattern for form-level reactive calculations (distinct from grid formulas). Wire it into the Ingredient form as a proof-of-concept for Grain category ingredients.

### WS-5: Filtered Aggregate Gap Analysis (Documentation)

Document the gap: the parser's SUM builtin sums ALL rows, but Mash Weight % needs `SUM(weight) WHERE use="Mash"`. Options:
1. Add SUMIF builtin to parser
2. Compute server-side via FormulaCatalog
3. Frontend custom valueGetter (not formula-based)

Write up trade-offs. Don't implement — present to Matt.

## Testing Requirements

### Data Setup/Teardown
- Playwright test data fixture: create a test brewhouse, test ingredient (grain with known extract values), test brand, test recipe with known ingredients
- API-driven setup (POST endpoints) and teardown (DELETE) — NOT seed data
- Reusable across all D15 test files

### ExUnit Tests (Backend)
- BrewingConversions: round-trip accuracy, edge cases (0 moisture, extreme values)
- Each new FormulaCatalog function: known-good recipe → expected output
- FormulaRuntime integration: new functions execute within timeout

### Playwright Tests (Frontend)
- **Auth & nav baseline**: login, navigate to Settings, navigate to Brands
- **Brewhouse detail**: verify existing UOM fields display (baseline for future label changes)
- **Formula execution**: navigate to Brand detail, verify Est. IBU and Est. OG columns render computed values
- **New formulas**: once WS-2 is wired to frontend, verify Est. FG, Est. ABV, Est. SRM columns render
- **Extract conversions (WS-4)**: if wired to ingredient form, verify changing CGAI auto-computes other values

### Persist-Verify Rule
All mutation tests must follow the SDLC persistence rule: perform action → navigate away → return → confirm data persisted.

## Out of Scope
- Display label/capitalization changes (separate deliverable)
- Recipe Fermentables table redesign
- BA/BJCP style system
- Process Profile dynamic fields
- Full cubic SG solver (pending Q2/VC confirmation)
- Days+hours duration fields
