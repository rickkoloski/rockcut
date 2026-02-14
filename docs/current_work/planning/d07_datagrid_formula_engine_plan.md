# D7: DataGrid Formula Engine — Implementation Instructions

**Spec:** `d07_datagrid_formula_engine_spec.md`
**Created:** 2026-02-14

---

## Overview

Add formula evaluation capabilities to datagrid-extended: expression
parser, remote function resolution, cell state management, visual
indicators, and pluggable caching. Wire up one rockcut page as
end-to-end validation against D6's backend. Update dev harness.

---

## Prerequisites

- [ ] D6 (Formula Execution Service) is complete and endpoints work
- [ ] datagrid-extended compiles: `cd ~/src/shared/ui-components/datagrid-extended && pnpm build`
- [ ] rockcut-ui runs: `cd ~/src/apps/rockcut/rockcut-ui && pnpm dev`
- [ ] rockcut-api runs: `cd ~/src/apps/rockcut/rockcut_api && mix phx.server`

---

## Implementation Steps

### Step 1: Create types and directory structure

**Files:**
- `src/lib/types.ts` (new)
- `src/lib/formula/` (new directory)

Define `ExtendedGridColDef` extending MUI's `GridColDef`:

```typescript
import { type GridColDef } from '@mui/x-data-grid'

export interface ExtendedGridColDef extends GridColDef {
  remoteValueGetter?: (row: any) => Promise<any>
  formula?: string
  computed?: boolean  // auto-set when remoteValueGetter or formula present
}

export type RemoteFunctions = Record<string, (...args: any[]) => Promise<any>>

export interface CacheStrategy {
  get(key: string): any | undefined
  set(key: string, value: any): void
  invalidateAll(): void
}

export type CellState =
  | { status: 'pending' }
  | { status: 'resolved'; value: any }
  | { status: 'error'; message: string }
```

Export all types from `src/lib/index.ts`.

### Step 2: Build the expression parser

**File:** `src/lib/formula/parser.ts`

Hand-rolled recursive descent parser. Input: formula string.
Output: AST (`Expression` type).

Grammar (in precedence order, lowest to highest):
1. Conditional: `IF(expr, expr, expr)`
2. Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`
3. Addition: `+`, `-`
4. Multiplication: `*`, `/`
5. Unary: `-`
6. Primary: number, string, function call, field reference, `(expr)`

Tokenizer step first — split input into tokens:
- Numbers: `/\d+(\.\d+)?/`
- Strings: `/"[^"]*"/`
- Identifiers: `/[a-zA-Z_]\w*/`
- Operators: `+`, `-`, `*`, `/`, `(`, `)`, `,`, `==`, `!=`, `>=`, `<=`, `>`, `<`

Strip optional leading `=` (spreadsheet convention).

Parser functions:
```
parseExpression() → parseComparison()
parseComparison() → parseAddition() (== != > < >= <=)
parseAddition() → parseMultiplication() (+ -)
parseMultiplication() → parseUnary() (* /)
parseUnary() → parsePrimary() (-)
parsePrimary() → number | string | functionCall | fieldRef | (expr)
```

Function calls detected when identifier is followed by `(`:
`NAME(arg1, arg2, ...)` → `{ type: 'call', name, args }`

Otherwise identifier is a field reference:
`fieldName` → `{ type: 'field', name }`

Return clear error messages with position info on parse failure.

### Step 3: Build the expression evaluator

**File:** `src/lib/formula/evaluator.ts`

Walks the AST and evaluates against row data and function registries.

```typescript
async function evaluate(
  expr: Expression,
  row: any,
  allRows: any[],
  remoteFunctions: RemoteFunctions,
  localBuiltins: Record<string, Function>
): Promise<any>
```

Node evaluation:
- `number` → return value
- `string` → return value
- `field` → return `row[name]`
- `binary` → evaluate left and right, apply operator
- `conditional` → evaluate condition, return then or else branch
- `call` → check localBuiltins first, then remoteFunctions.
  Local builtins receive `(args, allRows, row)` for aggregate access.
  Remote functions receive resolved argument values.

### Step 4: Build local builtins

**File:** `src/lib/formula/builtins.ts`

Aggregate functions operate on `allRows`:

```typescript
const builtins = {
  SUM: (args, allRows) => allRows.reduce((sum, r) => sum + (Number(r[args[0]]) || 0), 0),
  AVG: (args, allRows) => SUM(args, allRows) / allRows.length,
  COUNT: (_args, allRows) => allRows.length,
  MIN: (args, allRows) => Math.min(...allRows.map(r => Number(r[args[0]]))),
  MAX: (args, allRows) => Math.max(...allRows.map(r => Number(r[args[0]]))),
  ROUND: (args) => Math.round(args[0] * 10 ** (args[1] ?? 0)) / 10 ** (args[1] ?? 0),
  IF: — handled specially in evaluator (short-circuit)
}
```

Note: SUM/AVG/MIN/MAX take a field name as first arg (string),
not a resolved value. The evaluator passes the raw field name
for these aggregate builtins.

### Step 5: Build useRemoteValues hook

**File:** `src/lib/formula/useRemoteValues.ts`

React hook managing async cell state and caching.

```typescript
function useRemoteValues(
  rows: any[],
  columns: ExtendedGridColDef[],
  remoteFunctions: RemoteFunctions,
  cacheStrategy?: CacheStrategy
): Map<string, CellState>  // key: "rowId:field"
```

Behavior:
1. On mount or `rows` change: invalidate cache, re-evaluate all
   formula/remoteValueGetter columns
2. For each row × formula column: parse formula (cache parsed AST),
   evaluate, store result in state map
3. For each row × remoteValueGetter column: call the getter, store
   result in state map
4. State map updates trigger re-render; cells read their state from map

Default cache: simple `Map<string, any>` cleared on rows change.
Custom cache: use provided `CacheStrategy` implementation.

### Step 6: Build ComputedCell renderer

**File:** `src/lib/formula/ComputedCell.tsx`

Cell renderer for formula/remote columns. Reads state from the
values map and renders accordingly:

- **Pending:** Subtle loading indicator (small spinner or pulsing
  skeleton, not a full-cell spinner)
- **Resolved:** Value + visual indicator that this is computed
  (italic text or small `fx` badge)
- **Error:** Error icon (MUI ErrorOutline) with tooltip showing
  the error message

Use MUI's `Tooltip` for error messages. Keep the visual treatment
subtle — computed cells should be recognizable but not distracting.

### Step 7: Update DataGridExtended

**File:** `src/lib/DataGridExtended.tsx`

Update the main component to:
1. Accept new props: `remoteFunctions`, `cacheStrategy`,
   `computedCellStyle`
2. Detect formula/remoteValueGetter columns and auto-set `computed`
3. Call `useRemoteValues` hook with rows, columns, functions
4. Transform columns: wrap formula/remote columns with `renderCell`
   pointing to `ComputedCell`, injecting the state map
5. Add `fx` indicator to column headers for computed columns
6. Pass through all other props unchanged to MUI DataGrid

Backward compatibility: if no formula props are used, the component
behaves identically to today.

```typescript
export interface DataGridExtendedProps extends DataGridProps {
  columns: ExtendedGridColDef[]
  remoteFunctions?: RemoteFunctions
  cacheStrategy?: CacheStrategy
  computedCellStyle?: React.CSSProperties
}
```

### Step 8: Update dev harness

**File:** `src/App.tsx`

Update to demonstrate all formula features:

1. Local formula column: `formula: '=quantity * 2.5'` (arithmetic)
2. Local builtin: `formula: '=ROUND(quantity * 2.205, 1)'` (lb to kg)
3. Aggregate: `formula: '=SUM(quantity)'` (total across rows)
4. Conditional: `formula: '=IF(quantity > 5, "High", "Low")'`
5. Simulated remote function: `remoteFunctions` with a fake async
   function that returns after 500ms delay (demonstrates loading state)
6. Error case: remote function that fails (demonstrates error state)
7. `remoteValueGetter` column (demonstrates the simpler async pattern)

Include a brief heading/description so the harness is self-documenting
for anyone running `pnpm dev`.

### Step 9: Create useFormulaFunctions hook in rockcut

**File:** `~/src/apps/rockcut/rockcut-ui/src/hooks/useFormulaFunctions.ts`

```typescript
import { api } from '../lib/api'

const FORMULAS_BASE = '/api/formulas'

export function useFormulaFunctions() {
  return {
    remoteFunctions: {
      INVENTORY_ON_HAND: async (ingredientId: number) => {
        const res = await api.get(`${FORMULAS_BASE}/execute`, {
          params: { /* or POST body */ }
        })
        return res.data.results[0].value
      },
      EST_IBU: async (recipeId: number) => { ... },
      EST_OG: async (recipeId: number) => { ... },
    },
    catalogEndpoint: `${FORMULAS_BASE}/catalog`,
    batchEndpoint: `${FORMULAS_BASE}/execute`,
  }
}
```

Wire the hook to D6's execute endpoint. Each function sends a
single-call batch and extracts the value from the result.

### Step 10: Wire up a rockcut page

**File:** One of the existing list pages (Ingredients or Recipes)

Add a formula column demonstrating end-to-end resolution:

For Ingredients list:
```typescript
const { remoteFunctions } = useFormulaFunctions()

// Add column:
{
  field: 'available_lots',
  headerName: 'Available Lots',
  formula: '=INVENTORY_ON_HAND(id)',
}

<DataGridExtended
  rows={ingredients}
  columns={columns}
  remoteFunctions={remoteFunctions}
/>
```

### Step 11: Update exports and type declaration

**Files:**
- `src/lib/index.ts` — export all new types and the parser (for
  testing and advanced consumers)
- `~/src/apps/rockcut/rockcut-ui/src/datagrid-extended.d.ts` — update
  type declarations for the new props

---

## Testing

### Unit Tests (parser)

Create `src/lib/formula/__tests__/parser.test.ts` (or similar):

- Parses numeric literals
- Parses string literals
- Parses field references
- Parses function calls with args
- Parses arithmetic with correct precedence
- Parses comparisons
- Parses IF conditionals
- Parses nested expressions
- Strips leading `=`
- Returns clear error for malformed input

Use a lightweight test runner (Vite's built-in vitest or similar).
If no test runner is configured, parser tests can be validated via
the dev harness console output.

### Manual Testing

1. `pnpm dev` in datagrid-extended — verify all harness examples
2. Verify loading → resolved transition for simulated remote functions
3. Verify error state rendering
4. Verify computed cell visual indicators
5. `pnpm dev` in rockcut-ui with `mix phx.server` running — verify
   formula column resolves against real backend
6. Verify `pnpm build` in datagrid-extended succeeds (lib build)
7. Verify rockcut-ui build succeeds with updated component

### Visual Verification

- Computed cells look distinct from data cells
- Loading indicator is subtle, not jarring
- Error tooltip is readable
- Column header indicator is visible but not cluttered

---

## Verification Checklist

- [ ] All implementation steps complete
- [ ] Dev harness demonstrates all formula features
- [ ] Parser handles all grammar elements
- [ ] Existing datagrid-extended usage unchanged (backward compatible)
- [ ] At least one rockcut page shows end-to-end formula resolution
- [ ] `pnpm build` succeeds in datagrid-extended
- [ ] rockcut-ui builds and runs with formula columns
- [ ] No new runtime dependencies in datagrid-extended
- [ ] All new types exported and documented

---

## Notes

- The parser is the most complex piece. Keep it simple — recursive
  descent, no optimization, clear error messages. It can be refined
  later; correctness and readability matter more than performance
  for D7.
- The evaluator must handle the async/sync split cleanly. Local
  builtins are sync; remote functions return promises. The evaluator
  always returns a Promise for uniformity.
- The visual indicators are deliberately subtle for D7. Matt's
  feedback will inform whether they need to be more prominent or
  differently styled. The `computedCellStyle` prop provides an
  escape hatch.
- If vitest is not already configured, don't add it just for D7.
  Parser correctness can be validated via dev harness + console.
  Test infrastructure is a separate concern.
