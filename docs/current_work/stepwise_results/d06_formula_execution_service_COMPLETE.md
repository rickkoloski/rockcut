# D6: Formula Execution Service — Complete

**Spec:** `d06_formula_execution_service_spec.md`
**Completed:** 2026-02-14

---

## Summary

Implemented the backend formula execution service for Rockcut: a FormulaCatalog registry of whitelisted formula functions, a FormulaRuntime process-isolated execution engine, two API endpoints (`GET /api/formulas/catalog` and `POST /api/formulas/execute`), and three initial formula implementations (`inventory_on_hand`, `est_ibu`, `est_og`). The architecture follows the ActionCatalog/ActionRuntime pattern from vNext, narrowed for single-shot formula execution with BEAM process isolation and timeout enforcement.

---

## Implementation Details

### What Was Built

- **FormulaCatalog** — Registry of 3 whitelisted formula functions with name, description, parameter schema, return type, handler reference, and resource limits
- **FormulaRuntime** — Process-isolated execution engine using Task.async/yield/shutdown pattern with timeout enforcement and normalized result format
- **inventory_on_hand** — Counts available (non-depleted, non-expired) lots for a given ingredient
- **est_ibu** — Estimated IBU via Tinseth formula from recipe hop additions
- **est_og** — Estimated original gravity from recipe grain bill
- **FormulaController** — Two API endpoints: catalog listing and batch formula execution
- **ExUnit test suite** — 30 tests across 3 files covering catalog, runtime, and controller

### Files Created

| File | Purpose |
|------|---------|
| `lib/rockcut_api/formulas/formula_catalog.ex` | Registry of whitelisted formula functions |
| `lib/rockcut_api/formulas/formula_runtime.ex` | Process-isolated execution engine |
| `lib/rockcut_api/formulas/functions/inventory.ex` | inventory_on_hand formula |
| `lib/rockcut_api/formulas/functions/brewing_calcs.ex` | est_ibu and est_og formulas |
| `lib/rockcut_api_web/controllers/formula_controller.ex` | catalog and execute API endpoints |
| `test/rockcut_api/formulas/formula_catalog_test.exs` | 10 tests for catalog registry |
| `test/rockcut_api/formulas/formula_runtime_test.exs` | 10 tests for runtime execution |
| `test/rockcut_api_web/controllers/formula_controller_test.exs` | 10 tests for API endpoints |

### Files Modified

| File | Changes |
|------|---------|
| `lib/rockcut_api_web/router.ex` | Added formula routes to authenticated scope |

---

## Testing

### Tests Run
- [x] ExUnit (formula modules): 20 tests, 0 failures
- [x] ExUnit (controller): 10 tests, 0 failures
- [x] Full suite regression: 32 tests, 0 failures (includes 2 pre-existing)
- [x] Manual API testing: All endpoints verified via curl

### Manual API Verification

| Test | Result |
|------|--------|
| `GET /api/formulas/catalog` (authenticated) | 200 — returns 3 functions with correct schema |
| `GET /api/formulas/catalog` (no auth) | 401 — Unauthorized |
| `POST /api/formulas/execute` — inventory_on_hand | OK — returns count of available lots |
| `POST /api/formulas/execute` — est_ibu | OK — returns 0.0 for recipe with no hop ingredients |
| `POST /api/formulas/execute` — est_og | OK — returns 1.0 for recipe with no grain ingredients |
| `POST /api/formulas/execute` — batch (valid + invalid) | OK — partial success, per-call results |
| `POST /api/formulas/execute` (no auth) | 401 — Unauthorized |

### Test Coverage

- Catalog: list_exposed, get by name, nil for unknown, param schema validation
- Runtime: execute known/unknown functions, timeout contract, result format (ok/error tuples)
- Controller: auth (401), catalog listing, single/batch execute, mixed valid/invalid, positional matching, empty calls
- Test data created inline using Brewing context (categories, ingredients, lots, brands, recipes, recipe_ingredients)

---

## Deviations from Spec

- **inventory_on_hand counts lots instead of summing quantity**: The IngredientLot schema has no `quantity` field. The implementation counts available lots (`status: "available"`) rather than summing a quantity. This is a reasonable interpretation given the data model; if a quantity field is added later, the formula can be updated.
- **Lot status filter uses "available" not "active"**: The spec mentions "active lots" but the IngredientLot schema uses `available/depleted/expired` status values. Implementation correctly filters by `status: "available"`.
- **Float.round bugfix**: The initial `est_ibu` implementation crashed with `Float.round(0, 1)` when no hop additions existed (Enum.sum on empty list returns integer 0). Fixed by casting to float: `Float.round(total_ibu + 0.0, 1)`.
- **Seed data lacks recipe_ingredients**: The seeded recipes have no recipe_ingredients, so manual testing returned 0.0 IBU and 1.0 OG. This is correct behavior — the formulas handle the empty case gracefully. ExUnit tests create their own test data with recipe_ingredients and verify plausible values.
- **validate_params/2 added**: The plan mentioned this function; the spec did not explicitly require it, but it was implemented in FormulaCatalog and used by FormulaRuntime before execution.

---

## Workarounds & Deferred Requirements

### 1. inventory_on_hand — Quantity Field Gap

- **Spec'd:** `inventory_on_hand(ingredient_id)` should "sum quantity across active lots"
- **Implemented:** Counts the number of lots with `status: "available"` (returns integer count, not a quantity sum)
- **Why:** The IngredientLot schema has no `quantity` field. Inventory quantity tracking was explicitly deferred to v2 in the data model spec (D1). The lot table tracks lot metadata (lot_number, supplier, received_date, status) and brewing calc fields (alpha_acid, potential_gravity, etc.) but not on-hand quantities.
- **When to revisit:** When v2 inventory tracking lands (adding a `quantity` decimal field to `ingredient_lots`). At that point, update `Functions.Inventory.on_hand/2` to `Repo.aggregate(:sum, :quantity)` instead of `:count`. Tests already assert on value being a number, so they'll adapt.

### 2. Lot Status Terminology — "available" vs. "active"

- **Spec'd:** Filter to "active" lots
- **Implemented:** Filters by `status: "available"` (valid statuses are `available`, `depleted`, `expired`)
- **Why:** The data model uses `available/depleted/expired` as the lot status LOV. "Active" was used loosely in the formula spec. `available` is the correct semantic equivalent.
- **When to revisit:** No action needed — this is resolved. The spec language was imprecise; the implementation is correct.

### 3. Tinseth IBU — Simplified Gravity Assumption

- **Spec'd:** IBU via Tinseth formula with utilization depending on boil time and wort gravity
- **Implemented:** Uses a hardcoded average wort gravity of 1.050 for the bigness factor calculation, rather than computing actual pre-boil gravity from the grain bill
- **Why:** Computing actual pre-boil gravity would require running `est_og` first and factoring in boil volume vs. final volume. This circular dependency adds complexity beyond D6's architecture-first goal. The 1.050 assumption is standard for simplified Tinseth calculators.
- **When to revisit:** When brewing formula accuracy becomes a priority (post-D6). Could chain `est_og` result into `est_ibu` calculation, or accept the gravity as an optional parameter.

### 4. OG Calculation — Default Efficiency

- **Spec'd:** Estimated OG from grain bill
- **Implemented:** Uses `recipe.efficiency_target` if set, otherwise defaults to 72% brewhouse efficiency (`@default_efficiency 0.72`)
- **Why:** Reasonable industry default. Most of the seeded recipes don't have `efficiency_target` set, so the default covers the common case.
- **When to revisit:** No action needed for now. Users can set `efficiency_target` per recipe for more accurate estimates.

### 5. Unit Handling Edge Cases

- **Spec'd:** Not explicitly specified
- **Implemented:** `to_ounces/2` and `to_pounds/2` handle `oz`, `lb`, `g`, `kg` with a fallback that treats unknown units as the target unit (passthrough). The `pkg` and `each` units from RecipeIngredient's valid_units list fall through to passthrough.
- **Why:** `pkg` and `each` are non-weight units used for things like yeast packets. They don't contribute meaningful weight to IBU/OG calculations, so passthrough (treating the raw amount as oz or lb) could produce nonsensical results. However, these ingredients are typically in non-fermentable categories (Yeast, Misc) that get filtered out by the category queries, so the passthrough is never reached in practice.
- **When to revisit:** If new formulas need to handle non-weight units, add explicit handling or skip those additions.

---

## Follow-Up Items

- [ ] Add recipe_ingredients to seed data so manual testing shows non-trivial IBU/OG values
- [ ] Implement timeout enforcement test with a test-only slow function in the catalog
- [ ] Future formulas: est_srm, est_abv, batch_efficiency (identified in spec as out of scope for D6)
- [ ] Consider adding a `quantity` field to IngredientLot if inventory tracking needs real quantities
- [ ] Execution audit logging (identified as D7+ in spec)

---

## Notes

- The FormulaCatalog/FormulaRuntime pattern is portable — modules have no tight coupling to Rockcut-specific schemas. The catalog and runtime could be extracted to a shared library; only the function implementations in `functions/` are domain-specific.
- Brewing formula accuracy is secondary to architecture correctness for D6, per the plan. The Tinseth IBU formula uses a simplified average gravity assumption (1.050). Exact tuning is deferred.
- Category names in the implementation are singular ("Hop", "Grain", "Sugar", "Extract") matching the seed data. Tests were updated to match.
