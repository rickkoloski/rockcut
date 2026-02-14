# Dynamic Formula Execution — Analysis & Master Spec

> **Status:** ACTIVE — D6 (backend) complete, D7 (frontend) in progress
>
> **Scope:** Adding dynamic formula evaluation to the datagrid-extended
> component and safe server-side execution to rockcut's Phoenix layer.
> Rockcut serves as the sandbox; datagrid-extended changes are reusable.
>
> **Product intent:** datagrid-extended is being developed as a
> community-releasable component. The formula engine is a differentiating
> feature — not just a developer API, but a user-facing capability where
> end users (like Matt) can write and experiment with formulas. Rockcut
> validates the component in a real domain; the component is designed
> for reuse across domains and eventual open distribution.
>
> **Related codebases:**
> - `~/src/shared/ui-components/datagrid-extended/` — shared grid widget
> - `~/src/apps/vnext/` — reference implementation for safe code execution
> - `~/src/apps/rockcut/` — sandbox application

---

## Problem Statement

Rockcut's datagrid-extended component displays static data fetched from
the API. There is no way to define computed values, formulas, or
server-derived calculations within the grid. Users (Matt) and developers
both benefit from spreadsheet-like formula capabilities — but the
execution model needs to span frontend and backend cleanly.

---

## Options Analysis

### Option A: Frontend-Only Formula Engine

Add expression parsing and evaluation to datagrid-extended in the
browser. Formulas operate on row data already present in the grid.

**Capabilities:**
- Arithmetic on row fields (`=quantity * weight_per_unit`)
- Aggregates across visible rows (`=SUM(quantity)`)
- String and date operations
- Conditional formatting (`=IF(status == "stalled", "red", "green")`)

**Limitations:**
- No access to data outside the grid's `rows` prop
- No cross-table lookups (e.g., current inventory for an ingredient)
- No domain calculations requiring server context (IBU, SRM, efficiency)
- No side effects (can't create logs, trigger alerts)
- Security surface for expression evaluation in JS (mitigated by safe
  parser, but still a concern)

**Verdict:** Useful for display-time math. Not sufficient alone.

### Option B: Backend Execution in Phoenix

Port vNext's ActionCatalog/ActionRuntime pattern into rockcut. Formulas
or actions trigger server-side execution via API endpoints.

**Capabilities:**
- Full access to all rockcut data via Ecto
- Cross-table lookups and aggregates
- Domain-specific brewing calculations
- Side effects (logging, alerts, status changes)
- BEAM process isolation provides natural sandboxing
- Audit trail built-in

**Limitations:**
- Latency — every evaluation hits the server
- Overkill for simple row-level math
- More complex to wire up initially

**Verdict:** Required for anything beyond simple row math. The BEAM's
process model makes this safer and simpler than equivalent solutions in
most other stacks.

### Chosen Approach: Hybrid

The two options are complementary, not competing. The architecture
supports both, connected through a clean interface.

```
┌─────────────────────────────────────────────────┐
│  datagrid-extended (reusable, any app)          │
│                                                  │
│  Formula Engine                                  │
│  ├── Local builtins (math, string, aggregate)   │
│  ├── Sync valueGetter (existing MUI pattern)    │
│  └── Async remoteValueGetter ──────────────┐    │
│       (per-row async function)             │    │
│                                            │    │
│  Batching Layer (internal, invisible)      │    │
│  └── Collects async calls per render ──────┼──┐ │
│       Deduplicates, batches, resolves      │  │ │
└────────────────────────────────────────────┼──┼─┘
                                             │  │
                              HTTP (single   │  │
                              batched POST)  │  │
                                             ▼  ▼
┌─────────────────────────────────────────────────┐
│  rockcut Phoenix (or any backend)               │
│                                                  │
│  Formula Execution Service                       │
│  ├── GET  /api/formulas/catalog                  │
│  │   (advertises available server functions)     │
│  ├── POST /api/formulas/execute                  │
│  │   (accepts batch of function calls)           │
│  └── ActionCatalog + ActionRuntime               │
│       (ported from vNext, process-isolated)      │
└─────────────────────────────────────────────────┘
```

---

## Key Design Decisions

1. **Consumer-facing simplicity over internal cleverness.** The
   developer using datagrid-extended sees familiar patterns: sync
   `valueGetter` for local math, async `remoteValueGetter` for server
   calls. Batching is an internal optimization they never configure.

2. **The grid widget is backend-agnostic.** datagrid-extended ships
   local builtins and an async function interface. It has no knowledge
   of Phoenix, ActionCatalog, or rockcut. Any app with any backend can
   wire up remote functions.

3. **The backend catalog is the contract.** The Phoenix layer exposes a
   catalog of available functions with typed signatures. The frontend
   can use this for validation and autocomplete, but doesn't depend on
   it — a hardcoded resolver works just as well.

4. **Scope from vNext is narrowed.** We port ActionCatalog (operation
   whitelist) and ActionRuntime (process-isolated execution). We do NOT
   port the workflow orchestration layer (steps, transitions,
   injections). Formula execution is single-shot, not multi-step.

5. **Incremental delivery.** The frontend and backend workstreams are
   independent and can ship separately. Local formulas work without a
   backend. Backend functions work without the formula engine (called
   directly from components via hooks).

---

## Part 1: datagrid-extended — Formula-Capable Grid

### Consumer API

#### Local Computed Columns

Extends the existing MUI `valueGetter` pattern. No new concepts for the
developer.

```typescript
const columns: GridColDef[] = [
  { field: 'quantity', headerName: 'Qty', type: 'number' },
  { field: 'weight_per_unit', headerName: 'Wt/Unit', type: 'number' },
  {
    field: 'total_weight',
    headerName: 'Total Weight',
    valueGetter: (_value, row) => row.quantity * row.weight_per_unit,
  },
]
```

No changes needed — this works today.

#### Remote Computed Columns

New prop: `remoteValueGetter`. Same shape as `valueGetter`, but async.
The grid manages loading state and result caching internally.

```typescript
const columns: GridColDef[] = [
  {
    field: 'on_hand',
    headerName: 'On Hand',
    remoteValueGetter: async (row) => {
      const res = await api.get(`/formulas/inventory/${row.ingredient_id}`)
      return res.data.quantity
    },
  },
]
```

**Cell states:**
- **Pending** — async call in flight. Cell shows subtle loading indicator.
- **Resolved** — value received. Cell renders normally.
- **Error** — call failed. Cell shows error indicator, tooltip with message.

**Cache behavior:**
- Results cached by row ID + column field for the lifetime of the
  page load (cleared on navigation or remount).
- Cache invalidated when `rows` prop changes (new data from API).
- Manual invalidation via ref: `gridRef.current.refreshRemoteValues()`.
- Caching strategy is pluggable — the default is per-page-load, but
  consumers can provide a custom cache adapter (e.g., TTL-based,
  session-scoped) via an optional `cacheStrategy` prop.

#### Registered Remote Functions (optional, progressive)

For apps that want to decouple column definitions from API details,
an optional `remoteFunctions` prop provides named functions the grid
can resolve.

```typescript
<DataGridExtended
  rows={data}
  columns={columns}
  remoteFunctions={{
    INVENTORY_ON_HAND: async (ingredientId: number) => {
      return (await api.get(`/formulas/inventory/${ingredientId}`)).data.quantity
    },
  }}
/>

// In column def — reference by name:
{
  field: 'on_hand',
  headerName: 'On Hand',
  formula: 'INVENTORY_ON_HAND(ingredient_id)',
}
```

This level introduces a minimal, hand-rolled expression parser for the
`formula` string. No external parser library — the scoped grammar is
small enough that a custom parser is simpler and avoids a dependency.
The parser resolves field references from row data and function calls
from the `remoteFunctions` registry.

**Parser scope (intentionally minimal):**
- Field references: bare identifiers resolve to `row[field]`
- Function calls: `NAME(arg1, arg2)` resolve from registry
- Arithmetic: `+`, `-`, `*`, `/`, `()`
- Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Conditionals: `IF(condition, then, else)`
- String literals: `"quoted"`
- Numeric literals: `123`, `1.5`

**NOT in scope:** cell references (A1, B2), ranges, nested formulas
calling other formulas, user-editable formula bar. These are future
considerations.

### Internal Batching (invisible to consumer)

When multiple `remoteValueGetter` or `formula` columns exist, the grid
batches async calls to minimize network overhead.

**Mechanism:**
1. During render, all remote calls are collected (not fired).
2. At end of microtask (via `queueMicrotask` or `Promise.resolve`),
   collected calls are grouped by endpoint/function.
3. If a `batchEndpoint` is configured, calls are sent as a single POST.
   Otherwise, individual calls fire in parallel with concurrency limit.
4. Results fill into cells as they arrive.

**batchEndpoint (optional):**

```typescript
<DataGridExtended
  rows={data}
  columns={columns}
  remoteFunctions={functions}
  batchEndpoint="/api/formulas/execute"
/>
```

When provided, the grid POSTs all pending calls as one request:

```json
{
  "calls": [
    { "function": "INVENTORY_ON_HAND", "args": [42] },
    { "function": "INVENTORY_ON_HAND", "args": [17] },
    { "function": "EST_IBU", "args": [3] }
  ]
}
```

Expected response:

```json
{
  "results": [
    { "status": "ok", "value": 150.0 },
    { "status": "ok", "value": 42.5 },
    { "status": "error", "error": "Recipe not found" }
  ]
}
```

This is the bridge to the backend execution service.

### Implementation Phases (datagrid-extended)

| Phase | Scope | Depends On |
|-------|-------|------------|
| F1 | `remoteValueGetter` prop, cell loading/error states | Nothing |
| F2 | `remoteFunctions` prop, lightweight expression parser | F1 |
| F3 | Internal batching + `batchEndpoint` | F1 |
| F4 | Result caching, manual invalidation via ref | F1 |

F1 is the minimum viable feature. F2–F4 are progressive enhancements.

---

## Part 2: Rockcut Phoenix — Formula Execution Service

### Architecture (ported from vNext)

Two modules ported from vNext's Safe Code Execution Substrate, adapted
for rockcut's simpler needs:

#### FormulaCatalog

Registry of all server-side functions available for formula evaluation.
Each entry defines:

```elixir
%{
  name: "inventory_on_hand",
  description: "Current total quantity for an ingredient across all active lots",
  params: [
    %{name: "ingredient_id", type: :integer, required: true}
  ],
  returns: :number,
  handler: &RockcutApi.Formulas.Inventory.on_hand/2,
  limits: %{timeout_ms: 5_000, max_memory_mb: 50},
  exposed: true
}
```

**Key fields:**
- `handler` — function reference, receives `(context, params)`.
  Context includes the Repo and current user identity.
- `limits` — per-function resource constraints.
- `exposed` — whether this function appears in the catalog API endpoint.

#### FormulaRuntime

Executes a function from the catalog in an isolated BEAM process.

```elixir
FormulaRuntime.execute("inventory_on_hand", %{ingredient_id: 42}, context)
# => {:ok, %{value: 150.0, duration_ms: 12}}
# => {:error, :timeout, "Exceeded 5000ms limit"}
# => {:error, :not_found, "Unknown function: foo"}
```

**Safety model (from vNext):**
1. Validate function exists in catalog
2. Validate parameters against declared schema
3. Spawn isolated `Task.async`
4. `Task.await` with timeout from function's limits
5. Kill task on timeout via `Task.shutdown`
6. Catch all exceptions, return normalized error
7. Log execution to audit table

### API Endpoints

#### GET /api/formulas/catalog

Returns all exposed functions with their signatures. Drives frontend
autocomplete and validation — the catalog is the source of truth for
what server functions are available. The catalog endpoint URL is
configured once at the app level (via the integration hook); end users
like Matt never see or configure API URLs.

```json
{
  "functions": [
    {
      "name": "inventory_on_hand",
      "description": "Current total quantity for an ingredient across all active lots",
      "params": [
        { "name": "ingredient_id", "type": "integer", "required": true }
      ],
      "returns": "number"
    },
    {
      "name": "est_ibu",
      "description": "Estimated IBU for a recipe based on hop additions and OG",
      "params": [
        { "name": "recipe_id", "type": "integer", "required": true }
      ],
      "returns": "number"
    }
  ]
}
```

#### POST /api/formulas/execute

Accepts a batch of function calls. Each call is executed independently
in its own isolated process.

**Request:**
```json
{
  "calls": [
    { "function": "inventory_on_hand", "args": { "ingredient_id": 42 } },
    { "function": "est_ibu", "args": { "recipe_id": 3 } }
  ]
}
```

**Response:**
```json
{
  "results": [
    { "status": "ok", "value": 150.0, "duration_ms": 12 },
    { "status": "ok", "value": 45.2, "duration_ms": 8 }
  ]
}
```

**Error cases:**
```json
{
  "results": [
    { "status": "error", "error": "timeout", "message": "Exceeded 5000ms limit" },
    { "status": "error", "error": "not_found", "message": "Unknown function: foo" }
  ]
}
```

Results array is positionally matched to calls array. One call failing
does not affect others.

### Initial Rockcut Formula Catalog

Domain-specific functions for brewing calculations, starting minimal:

| Function | Description | Params | Returns |
|----------|-------------|--------|---------|
| `inventory_on_hand` | Sum quantity across active lots for an ingredient | `ingredient_id` | number (lbs/oz/units) |
| `est_ibu` | Estimated IBU for a recipe (Tinseth formula) | `recipe_id` | number |
| `est_srm` | Estimated color in SRM (Morey equation) | `recipe_id` | number |
| `est_og` | Estimated original gravity from grain bill | `recipe_id` | number |
| `est_abv` | Estimated ABV from OG and FG | `recipe_id` | number |
| `batch_efficiency` | Actual vs. predicted efficiency for a batch | `batch_id` | number (%) |

These are all read-only calculations. Write operations (creating log
entries, changing batch status) are deferred to v2 and will require an
expanded authorization model beyond the current bearer token.

### Implementation Phases (rockcut Phoenix)

| Phase | Scope | Depends On |
|-------|-------|------------|
| B1 | FormulaCatalog + FormulaRuntime modules | Nothing |
| B2 | Catalog and execute API endpoints + controller | B1 |
| B3 | First 2-3 formula implementations (inventory, est_ibu, est_og) | B1 |
| B4 | Execution audit logging | B1 |
| B5 | Remaining brewing formulas | B3 |

B1–B3 are the minimum viable feature. B4–B5 are progressive.

---

## Part 3: Integration — Wiring Frontend to Backend

With both sides built, connecting them in rockcut is straightforward:

```typescript
// rockcut-ui/src/hooks/useFormulaFunctions.ts

import { api } from '../lib/api'

// API base URL configured once here — not repeated in column
// definitions or exposed to end users.
const FORMULAS_BASE = '/api/formulas'

export function useFormulaFunctions() {
  return {
    remoteFunctions: {
      INVENTORY_ON_HAND: async (ingredientId: number) => {
        const res = await api.get(`${FORMULAS_BASE}/inventory_on_hand`, {
          params: { ingredient_id: ingredientId },
        })
        return res.data.value
      },
      EST_IBU: async (recipeId: number) => {
        const res = await api.get(`${FORMULAS_BASE}/est_ibu`, {
          params: { recipe_id: recipeId },
        })
        return res.data.value
      },
    },
    catalogEndpoint: `${FORMULAS_BASE}/catalog`,
    batchEndpoint: `${FORMULAS_BASE}/execute`,
  }
}
```

The `catalogEndpoint` feeds autocomplete. The `batchEndpoint` is used
by the grid's internal batching layer. Both derive from the same base
URL — configured once, invisible to Matt.

Usage in a page:

```typescript
const { remoteFunctions, batchEndpoint } = useFormulaFunctions()

<DataGridExtended
  rows={ingredients}
  columns={[
    { field: 'name', headerName: 'Ingredient', flex: 1 },
    {
      field: 'on_hand',
      headerName: 'On Hand',
      formula: 'INVENTORY_ON_HAND(id)',
    },
  ]}
  remoteFunctions={remoteFunctions}
  batchEndpoint={batchEndpoint}
/>
```

The hook acts as the glue layer — it's the only part that knows about
both the grid's interface and rockcut's API. The grid widget stays
generic. The backend stays API-first.

---

## Delivery Sequence

The workstreams are independent. Recommended order:

```
Phase 1 — Foundation (parallel)
├── F1: remoteValueGetter in datagrid-extended
└── B1+B2: FormulaCatalog, FormulaRuntime, API endpoints

Phase 2 — First formulas (parallel)
├── F2: remoteFunctions + expression parser
└── B3: inventory_on_hand, est_ibu, est_og implementations

Phase 3 — Integration
└── Wire rockcut-ui pages to use formula-enabled grids

Phase 4 — Polish (parallel)
├── F3+F4: Batching, caching
└── B4+B5: Audit logging, remaining formulas
```

Phase 1 and 2 can proceed without coordination. Phase 3 is where
they meet.

---

## Resolved Decisions

1. **Expression parser: hand-rolled.** No external library. The scoped
   grammar (arithmetic, comparisons, function calls, field references)
   is small enough that a custom parser is simpler, lighter, and gives
   us full control over error messages and extension points.

2. **Catalog drives autocomplete.** The `GET /api/formulas/catalog`
   endpoint is the source of truth for available server functions. The
   API base URL is configured once in the integration hook — Matt never
   sees or types URLs.

3. **Caching: per-page-load, pluggable.** Default cache lifetime is
   the current page mount. The caching strategy is pluggable via a
   `cacheStrategy` prop so consuming apps can swap in TTL-based or
   session-scoped caching without changing the grid component.

4. **Write operations deferred to v2.** The initial catalog is
   read-only calculations only. Write operations (logging, alerts,
   status changes) will come in v2 alongside a revisited auth model.

5. **Reusability is a first-class goal.** Both the frontend and
   backend pieces are designed for extraction:
   - **datagrid-extended** — the formula engine and remote function
     interface are widget-level features, usable by any app.
   - **FormulaCatalog + FormulaRuntime** — built in rockcut first,
     designed for extraction to a shared Elixir library (hex package
     or path dep) for vNext and future Phoenix apps.
   - **The pattern extends beyond grids.** The same remote function
     resolution model applies to reports, graph displays, and other
     UI widgets that support user-customizable computed values. The
     backend execution service is widget-agnostic — any frontend
     component can call the catalog and execute endpoints.

---

## Future Considerations (v2+)

### User-Facing Formula Experience (confirmed direction)

Matt has expressed enthusiasm for writing formulas himself — this is
not speculative, it's a confirmed product requirement. The incremental
path:

1. **D7:** Developer API + visual indicators for computed cells
   (foundation — Matt sees formula results, knows they're computed)
2. **D8+:** User-facing formula editing UX — Matt writes/edits
   formulas in the grid, with catalog-driven autocomplete
3. **Future:** Formula persistence (user-defined formulas saved to
   backend), formula sharing, formula templates

The editing surface (formula bar, column settings dialog, inline cell
editor, or some combination) is a UX design question to explore with
Matt. His input on what feels natural is critical — this is where
domain delight lives.

### Component Release Strategy

datagrid-extended is being developed for community release. This
imposes quality requirements beyond rockcut's immediate needs:

- Clean, well-documented consumer API
- Sensible defaults with full extensibility
- No rockcut-specific coupling in the component itself
- Examples and dev harness demonstrating all features
- The formula engine is the differentiating feature — most grid
  widgets don't offer this

### Additional Future Items

- **Write operations** — server functions that create/modify data,
  with expanded authorization model
- **Cross-widget reuse** — report and chart components consuming the
  same remote function interface
- **Shared Elixir library** — extract FormulaCatalog/FormulaRuntime
  from rockcut into a reusable hex package or path dependency
- **Realtime formula updates** — Phoenix Channels push invalidation
  events when underlying data changes (e.g., a lot is updated,
  formula results for that ingredient are stale)
