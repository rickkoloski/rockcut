# D6: Formula Execution Service — Implementation Instructions

**Spec:** `d06_formula_execution_service_spec.md`
**Created:** 2026-02-13

---

## Overview

Build the backend formula execution service for rockcut: a
FormulaCatalog registry, FormulaRuntime execution engine, two API
endpoints, and three initial formula implementations. This establishes
the server-side half of the dynamic formula execution architecture.

---

## Prerequisites

- [ ] D2 (CRUD APIs) is complete — Brewing context, schemas, and
      seed data exist
- [ ] rockcut_api compiles and `mix phx.server` starts cleanly
- [ ] Seed data includes at least one recipe with ingredients and lots

---

## Implementation Steps

### Step 1: Create the Formulas directory structure

**Files:**
- `lib/rockcut_api/formulas/formula_catalog.ex`
- `lib/rockcut_api/formulas/formula_runtime.ex`
- `lib/rockcut_api/formulas/functions/inventory.ex`
- `lib/rockcut_api/formulas/functions/brewing_calcs.ex`

Create the `formulas/` directory under `lib/rockcut_api/` and the
`functions/` subdirectory within it.

### Step 2: Implement FormulaCatalog

**File:** `lib/rockcut_api/formulas/formula_catalog.ex`

Module responsibilities:
- Define `@operations` list with all registered formula functions
- `list_exposed/0` — returns all operations where `exposed: true`
- `get/1` — finds an operation by name string
- `validate_params/2` — validates params map against operation's
  declared parameter schema

Start with three operations registered:
- `inventory_on_hand` → `Functions.Inventory.on_hand/2`
- `est_ibu` → `Functions.BrewingCalcs.est_ibu/2`
- `est_og` → `Functions.BrewingCalcs.est_og/2`

Each operation entry:
```elixir
%{
  name: "inventory_on_hand",
  description: "...",
  params: [%{name: "ingredient_id", type: :integer, required: true}],
  returns: :number,
  handler: &Functions.Inventory.on_hand/2,
  limits: %{timeout_ms: 5_000},
  exposed: true
}
```

### Step 3: Implement FormulaRuntime

**File:** `lib/rockcut_api/formulas/formula_runtime.ex`

Module responsibilities:
- `execute/3` — takes `(function_name, params, context)`
  - Looks up operation in catalog
  - Validates params
  - Spawns isolated Task
  - Awaits with timeout, kills on exceed
  - Returns normalized result tuple

Context map should include:
- `repo` — `RockcutApi.Repo` (for Ecto queries)

Result format:
```elixir
{:ok, %{value: term(), duration_ms: integer()}}
{:error, error_type, message}
```

Error types: `:not_found`, `:validation_error`, `:timeout`, `:runtime_error`

Use `Task.async/1` + `Task.yield/2` + `Task.shutdown/1` pattern
(not `Task.await/2`) for clean timeout handling.

### Step 4: Implement inventory_on_hand function

**File:** `lib/rockcut_api/formulas/functions/inventory.ex`

```elixir
def on_hand(context, %{"ingredient_id" => ingredient_id}) do
  # Query ingredient_lots where ingredient_id matches
  # Filter to active lots (status check TBD based on data model)
  # Sum the quantity field
  # Return {:ok, %{value: total}}
end
```

Reference the IngredientLot schema and Brewing context for query
patterns. Follow existing Ecto query style in the codebase.

### Step 5: Implement est_ibu and est_og functions

**File:** `lib/rockcut_api/formulas/functions/brewing_calcs.ex`

**est_ibu (Tinseth formula):**
- Load recipe with preloaded ingredients and lots
- Filter to hop ingredients (by category)
- For each hop addition: IBU = (mg/L alpha acid) * utilization factor
- Utilization depends on boil time and wort gravity
- Sum individual IBU contributions
- Reference: `alpha_acid` field on ingredient_lot

**est_og (gravity from grain bill):**
- Load recipe with preloaded ingredients and lots
- Filter to grain/extract ingredients (by category)
- For each grain: gravity points = weight * potential_gravity * efficiency
- Sum and convert to specific gravity (1.0XX format)
- Reference: `potential_gravity` field on ingredient_lot

Use reasonable defaults for brewhouse efficiency (72%) if not
available on the batch.

### Step 6: Create FormulaController

**File:** `lib/rockcut_api_web/controllers/formula_controller.ex`

Two actions:

**catalog/2:**
- `GET /api/formulas/catalog`
- Calls `FormulaCatalog.list_exposed()`
- Serializes to JSON (name, description, params, returns)

**execute/2:**
- `POST /api/formulas/execute`
- Reads `calls` array from params
- For each call, invokes `FormulaRuntime.execute/3`
- Collects results into positionally matched array
- Returns `%{results: [...]}` JSON

Consider using `Task.async_stream/3` or parallel map for executing
multiple calls concurrently within one request.

### Step 7: Add routes

**File:** `lib/rockcut_api_web/router.ex`

Add to the authenticated API scope:

```elixir
get "/formulas/catalog", FormulaController, :catalog
post "/formulas/execute", FormulaController, :execute
```

### Step 8: Write ExUnit tests

**Files:**
- `test/rockcut_api/formulas/formula_catalog_test.exs`
- `test/rockcut_api/formulas/formula_runtime_test.exs`
- `test/rockcut_api_web/controllers/formula_controller_test.exs`

**Catalog tests:**
- `list_exposed/0` returns expected functions
- `get/1` finds by name, returns nil for unknown

**Runtime tests:**
- Execute known function returns `{:ok, ...}` with value and duration
- Execute unknown function returns `{:error, :not_found, ...}`
- Timeout enforcement (register a test-only slow function)

**Controller tests:**
- `GET /api/formulas/catalog` returns 200 with function list
- `POST /api/formulas/execute` with valid calls returns results
- Mixed valid/invalid calls return per-call results
- Unauthenticated requests return 401

---

## Testing

### Manual Testing

1. Start server: `cd rockcut_api && mix phx.server`
2. Get token: `POST /api/login` with matt@rockcut.com credentials
3. `GET /api/formulas/catalog` — verify function list
4. `POST /api/formulas/execute` with `inventory_on_hand` for a seeded
   ingredient — verify plausible quantity
5. `POST /api/formulas/execute` with `est_ibu` for a seeded recipe —
   verify plausible IBU value
6. Batch call with one valid and one invalid function — verify
   partial success

### Automated Tests

- [ ] `mix test test/rockcut_api/formulas/`
- [ ] `mix test test/rockcut_api_web/controllers/formula_controller_test.exs`

---

## Verification Checklist

- [ ] All implementation steps complete
- [ ] Manual testing passes
- [ ] Automated tests pass
- [ ] No regressions (existing tests still pass)
- [ ] Modules structured for future extraction (no tight coupling
      to rockcut-specific schemas in catalog/runtime)

---

## Notes

- The FormulaCatalog/FormulaRuntime pattern is from vNext's
  ActionCatalog/ActionRuntime. See `~/src/apps/vnext/vnext_server/lib/
  vnext_server/ai/action_catalog.ex` and `action_runtime.ex` for
  reference implementations.
- Brewing formula accuracy is secondary to architecture correctness
  for D6. Getting the IBU estimate "close enough" is fine; exact
  formula tuning can happen in a later deliverable.
- The data model spec (`docs/spec/data-model.md`) documents which
  fields are on ingredient_lots (alpha_acid, color_lovibond,
  potential_gravity, attenuation).
