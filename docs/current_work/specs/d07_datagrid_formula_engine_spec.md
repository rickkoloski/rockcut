# D7: DataGrid Formula Engine — Specification

**Status:** Draft
**Created:** 2026-02-14
**Author:** CD + CC
**Depends On:** D6 (Formula Execution Service — backend endpoints exist)
**Master Spec:** `docs/spec/dynamic-formula-execution.md`

---

## 1. Problem Statement

datagrid-extended is a pass-through wrapper around MUI DataGrid with no
formula or computed-value capabilities. D6 established backend formula
execution (FormulaCatalog, FormulaRuntime, API endpoints), but there is
no frontend mechanism to call those functions from the grid, display
their results, or visually indicate computed cells.

D7 adds the formula engine to datagrid-extended: async remote value
resolution, a hand-rolled expression parser, named function registry,
cell state management (loading/resolved/error), visual indicators for
computed cells, and a pluggable cache strategy. It also wires up one
rockcut page as end-to-end validation.

datagrid-extended is being developed for community release. The API
surface, types, and extension points are designed for reuse across
domains, not just rockcut.

---

## 2. Requirements

### Functional

#### Component: Extended Column Definition

- [ ] New `ExtendedGridColDef` type extending MUI's `GridColDef` with:
  - `remoteValueGetter?: (row: any) => Promise<any>` — async value
    resolver, per-row
  - `formula?: string` — expression string parsed and evaluated by the
    formula engine
  - `computed?: boolean` — explicit flag (auto-set when remoteValueGetter
    or formula is present) for visual indicator

#### Component: Remote Value Resolution

- [ ] Columns with `remoteValueGetter` fire async calls when rows mount
      or change
- [ ] Cell states: pending (loading indicator), resolved (render value),
      error (error indicator with tooltip)
- [ ] Results cached by row ID + column field for the component's
      mount lifetime (per-page-load default)
- [ ] Cache invalidated when `rows` prop reference changes
- [ ] Pluggable cache strategy via optional `cacheStrategy` prop

#### Component: Remote Functions Registry

- [ ] New component prop: `remoteFunctions` — map of named async
      functions: `Record<string, (...args: any[]) => Promise<any>>`
- [ ] Functions referenced by name in `formula` strings
- [ ] Functions receive resolved arguments (field values from row data,
      literals, or sub-expression results)

#### Component: Expression Parser

- [ ] Hand-rolled parser (no external library) for `formula` strings
- [ ] Supported grammar:
  - Field references: bare identifiers resolve to `row[field]`
  - Function calls: `NAME(arg1, arg2)` resolve from `remoteFunctions`
    or local builtins
  - Arithmetic: `+`, `-`, `*`, `/`, `()`
  - Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`
  - Conditionals: `IF(condition, then, else)`
  - String literals: `"quoted"`
  - Numeric literals: `123`, `1.5`
- [ ] Local builtins (no server call needed):
  - `SUM(field)` — sum a field across all rows
  - `AVG(field)` — average a field across all rows
  - `COUNT()` — row count
  - `MIN(field)`, `MAX(field)` — min/max of a field
  - `ROUND(value, decimals)` — round a number
  - `IF(condition, then, else)` — conditional
- [ ] Clear error messages for parse failures (reported in cell error
      state, not console-only)

#### Component: Visual Indicators

- [ ] Computed cells are visually distinct from data cells:
  - Subtle indicator (e.g., small `fx` badge, italic text, or tinted
    background) for resolved computed values
  - Loading spinner or skeleton for pending state
  - Error icon with tooltip for failed resolution
- [ ] Column header indicates computed column (e.g., `fx` icon or
      label suffix)
- [ ] Visual treatment is configurable via optional
      `computedCellStyle` prop (so consuming apps can theme it)

#### Integration: Rockcut Validation

- [ ] `useFormulaFunctions` hook in rockcut-ui wiring remoteFunctions
      to D6's backend endpoints
- [ ] At least one rockcut page (e.g., Ingredients list) uses a
      formula column demonstrating end-to-end resolution
- [ ] Dev harness in datagrid-extended updated with formula examples
      (local builtins + simulated remote functions)

### Non-Functional

- [ ] No new runtime dependencies added to datagrid-extended
      (parser is hand-rolled, no external libs)
- [ ] TypeScript strict mode — all new types fully typed, exported
      for consumers
- [ ] Component remains backend-agnostic — no knowledge of Phoenix,
      rockcut, or any specific API
- [ ] Performance: formula evaluation does not block grid rendering
      (async cells resolve independently)

---

## 3. Design

### Approach

Extend `DataGridExtended` with formula capabilities while preserving
full backward compatibility (existing usage with no formula props
behaves identically to today). The formula engine is internal to the
component; consumers interact via props only.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| ExtendedGridColDef | `src/lib/types.ts` | Extended column type with formula props |
| FormulaEngine | `src/lib/formula/engine.ts` | Orchestrates resolution of all formula columns |
| ExpressionParser | `src/lib/formula/parser.ts` | Tokenizer + recursive descent parser |
| ExpressionEvaluator | `src/lib/formula/evaluator.ts` | Evaluates parsed AST against row data + functions |
| useRemoteValues | `src/lib/formula/useRemoteValues.ts` | React hook managing async cell state + cache |
| ComputedCell | `src/lib/formula/ComputedCell.tsx` | Cell renderer with loading/error/resolved states |
| LocalBuiltins | `src/lib/formula/builtins.ts` | SUM, AVG, COUNT, MIN, MAX, ROUND, IF |
| DataGridExtended | `src/lib/DataGridExtended.tsx` | Updated main component |

### Parser Design

Recursive descent parser producing a simple AST:

```typescript
type Expression =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'field'; name: string }
  | { type: 'call'; name: string; args: Expression[] }
  | { type: 'binary'; op: string; left: Expression; right: Expression }
  | { type: 'conditional'; condition: Expression; then: Expression; else: Expression }
```

Evaluation walks the AST:
- `field` nodes look up `row[name]`
- `call` nodes check local builtins first, then `remoteFunctions`
- `binary` nodes evaluate both sides and apply the operator
- `conditional` nodes evaluate the condition, then the appropriate branch

Remote function calls return promises; the evaluator returns a
`Promise<any>` so the cell renderer can manage async state.

### Cache Design

```typescript
interface CacheStrategy {
  get(key: string): any | undefined
  set(key: string, value: any): void
  invalidateAll(): void
}
```

Default implementation: simple Map, cleared on `rows` prop change.
Consumers can provide custom strategies (TTL, LRU, etc.) via the
`cacheStrategy` prop.

Cache key: `${rowId}:${columnField}`

### Integration Hook (rockcut-specific)

```typescript
// rockcut-ui/src/hooks/useFormulaFunctions.ts
const FORMULAS_BASE = '/api/formulas'

export function useFormulaFunctions() {
  return {
    remoteFunctions: {
      INVENTORY_ON_HAND: async (ingredientId: number) => {
        return (await api.get(`${FORMULAS_BASE}/inventory_on_hand`,
          { params: { ingredient_id: ingredientId } })).data.value
      },
      EST_IBU: async (recipeId: number) => { ... },
      EST_OG: async (recipeId: number) => { ... },
    },
    catalogEndpoint: `${FORMULAS_BASE}/catalog`,
    batchEndpoint: `${FORMULAS_BASE}/execute`,
  }
}
```

---

## 4. Success Criteria

- [ ] Existing datagrid-extended usage (no formula props) works
      identically — zero regressions
- [ ] Column with `remoteValueGetter` resolves async values and
      displays loading → resolved states
- [ ] Column with `formula` string parses and evaluates correctly
      (field refs, function calls, arithmetic)
- [ ] `remoteFunctions` prop provides named functions to formulas
- [ ] Local builtins (SUM, AVG, IF, ROUND) work on row data
- [ ] Computed cells are visually distinct from data cells
- [ ] Error state displays gracefully (tooltip, not crash)
- [ ] Dev harness demonstrates all formula features
- [ ] At least one rockcut page shows end-to-end formula resolution
      against D6 backend
- [ ] Parser unit tests pass for all grammar elements
- [ ] No new runtime dependencies in datagrid-extended

---

## 5. Out of Scope

- Internal batching / `batchEndpoint` (F3 — future deliverable)
- Manual cache invalidation via ref (F4 — future deliverable)
- User-editable formula bar or inline formula editing (future — needs
  UX design with Matt)
- Formula persistence (saving user-defined formulas to backend)
- Catalog-driven autocomplete in UI
- Cell references (A1, B2), ranges, cross-cell formulas

---

## 6. Open Questions

- [ ] Visual indicator style: `fx` badge vs. italic text vs. tinted
      background? Leaning toward subtle `fx` icon in column header +
      italic values in cells. Should confirm with Matt what feels
      right vs. distracting.
- [ ] Should the parser support `=` prefix (spreadsheet convention)?
      e.g., `formula: '=ROUND(quantity * 2.5, 1)'` vs.
      `formula: 'ROUND(quantity * 2.5, 1)'`. The `=` is familiar to
      spreadsheet users and would be natural when Matt starts typing
      formulas directly. Leaning yes — strip optional leading `=`.
- [ ] Which rockcut page is best for the end-to-end demo? Ingredients
      list (showing inventory on hand) or Recipe detail grain bill tab
      (showing est_ibu, est_og)?
