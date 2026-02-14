# D6: Formula Execution Service — Specification

**Status:** Draft
**Created:** 2026-02-13
**Author:** CD + CC
**Depends On:** D2 (CRUD APIs — Brewing context must exist)
**Master Spec:** `docs/spec/dynamic-formula-execution.md`

---

## 1. Problem Statement

Rockcut has a full CRUD API and data model but no way to compute
derived values server-side — estimated IBU, color, gravity, inventory
totals, batch efficiency. These calculations require cross-table data
access and domain logic that can't run in the browser.

D6 establishes the backend execution service: a safe, extensible
framework for registering and executing server-side formula functions,
exposed via API endpoints that any frontend component can call.

---

## 2. Requirements

### Functional

- [ ] FormulaCatalog module: registry of whitelisted formula functions
      with name, description, parameter schema, return type, handler
      function reference, and resource limits
- [ ] FormulaRuntime module: executes a named function in an isolated
      BEAM process with timeout enforcement, exception handling, and
      normalized result format
- [ ] `GET /api/formulas/catalog` endpoint: returns all exposed
      functions with their signatures (name, description, params,
      return type)
- [ ] `POST /api/formulas/execute` endpoint: accepts a batch of
      function calls, executes each independently, returns positionally
      matched results array
- [ ] Initial formula implementations:
  - `inventory_on_hand(ingredient_id)` — sum quantity across active lots
  - `est_ibu(recipe_id)` — estimated IBU via Tinseth formula
  - `est_og(recipe_id)` — estimated original gravity from grain bill
- [ ] Error handling: unknown function, parameter validation failure,
      timeout, and runtime exception all return structured errors
      without crashing the batch

### Non-Functional

- [ ] Process isolation: each formula execution runs in its own BEAM
      process; one failure cannot affect others or the main app
- [ ] Timeout enforcement: default 5s per function, configurable per
      catalog entry
- [ ] Auth: all formula endpoints require valid bearer token (existing
      auth plug)
- [ ] Designed for extraction: modules structured so they can later
      be extracted to a shared Elixir library

---

## 3. Design

### Approach

Port the ActionCatalog/ActionRuntime pattern from vNext's Safe Code
Execution Substrate (D20), narrowed for single-shot formula execution.
No workflow orchestration, no step/transition system.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| FormulaCatalog | `lib/rockcut_api/formulas/formula_catalog.ex` | Registry of available functions |
| FormulaRuntime | `lib/rockcut_api/formulas/formula_runtime.ex` | Process-isolated execution engine |
| Formula implementations | `lib/rockcut_api/formulas/functions/` | Individual formula modules |
| FormulaController | `lib/rockcut_api_web/controllers/formula_controller.ex` | API endpoints |

### Module Design

#### FormulaCatalog

```elixir
defmodule RockcutApi.Formulas.FormulaCatalog do
  @operations [
    %{
      name: "inventory_on_hand",
      description: "Current total quantity for an ingredient across active lots",
      params: [%{name: "ingredient_id", type: :integer, required: true}],
      returns: :number,
      handler: &RockcutApi.Formulas.Functions.Inventory.on_hand/2,
      limits: %{timeout_ms: 5_000},
      exposed: true
    },
    # ... more operations
  ]

  def list_exposed(), do: Enum.filter(@operations, & &1.exposed)
  def get(name), do: Enum.find(@operations, & &1.name == name)
end
```

#### FormulaRuntime

```elixir
defmodule RockcutApi.Formulas.FormulaRuntime do
  def execute(function_name, params, context) do
    case FormulaCatalog.get(function_name) do
      nil -> {:error, :not_found, "Unknown function: #{function_name}"}
      operation -> execute_isolated(operation, params, context)
    end
  end

  defp execute_isolated(operation, params, context) do
    task = Task.async(fn ->
      try do
        operation.handler.(context, params)
      rescue
        e -> {:error, :runtime_error, Exception.format(:error, e, __STACKTRACE__)}
      end
    end)

    case Task.yield(task, operation.limits.timeout_ms) || Task.shutdown(task) do
      {:ok, result} -> result
      nil -> {:error, :timeout, "Exceeded #{operation.limits.timeout_ms}ms limit"}
    end
  end
end
```

### API

#### GET /api/formulas/catalog

Response:
```json
{
  "functions": [
    {
      "name": "inventory_on_hand",
      "description": "Current total quantity for an ingredient across active lots",
      "params": [{"name": "ingredient_id", "type": "integer", "required": true}],
      "returns": "number"
    }
  ]
}
```

#### POST /api/formulas/execute

Request:
```json
{
  "calls": [
    {"function": "inventory_on_hand", "args": {"ingredient_id": 42}},
    {"function": "est_ibu", "args": {"recipe_id": 3}}
  ]
}
```

Response:
```json
{
  "results": [
    {"status": "ok", "value": 150.0, "duration_ms": 12},
    {"status": "ok", "value": 45.2, "duration_ms": 8}
  ]
}
```

Error response (per-call, does not fail the batch):
```json
{
  "results": [
    {"status": "error", "error": "not_found", "message": "Unknown function: foo"},
    {"status": "ok", "value": 45.2, "duration_ms": 8}
  ]
}
```

---

## 4. Success Criteria

- [ ] `GET /api/formulas/catalog` returns the three initial functions
- [ ] `POST /api/formulas/execute` with `inventory_on_hand` returns
      correct sum from seed data lots
- [ ] `POST /api/formulas/execute` with `est_ibu` returns a plausible
      IBU value for a seeded recipe
- [ ] `POST /api/formulas/execute` with `est_og` returns a plausible
      OG value for a seeded recipe
- [ ] Batch call with mix of valid and invalid functions returns
      per-call results (no full-batch failure)
- [ ] Timeout enforcement: a deliberately slow function is killed
      and returns timeout error
- [ ] Auth: unauthenticated requests return 401
- [ ] ExUnit tests cover all of the above

---

## 5. Out of Scope

- Frontend formula engine (datagrid-extended changes) — separate deliverable
- Write operations (creating logs, changing status) — v2
- Execution audit logging — future deliverable (D7+)
- User-editable formulas — future
- Remaining brewing formulas (est_srm, est_abv, batch_efficiency) — future deliverable

---

## 6. Open Questions

- [ ] Tinseth IBU formula needs hop utilization factor — confirm which
      data fields on ingredient_lots map to alpha acid percentage and
      boil time. (Can resolve by reading the data model spec.)
- [ ] Should `inventory_on_hand` sum across all lots or only lots with
      status = "active"? (Leaning toward active-only.)
