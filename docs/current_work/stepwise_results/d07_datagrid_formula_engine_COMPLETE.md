# D7: DataGrid Formula Engine — Complete

**Spec:** `d07_datagrid_formula_engine_spec.md`
**Completed:** 2026-02-14

---

## Summary

Added formula evaluation capabilities to datagrid-extended: a hand-rolled
recursive descent expression parser, async remote function resolution,
local aggregate builtins (SUM, AVG, COUNT, MIN, MAX, ROUND), cell state
management (pending/resolved/error), visual indicators (italic computed
cells, fx badge in column headers), and a pluggable cache strategy. Wired
up the rockcut Ingredients page with an "On Hand" formula column calling
D6's `inventory_on_hand` backend formula as end-to-end validation.

---

## Implementation Details

### What Was Built

- **Expression Parser** — Tokenizer + recursive descent parser producing
  an AST. Supports: numeric/string literals, field references, function
  calls, arithmetic (+, -, *, /), comparison (==, !=, >, <, >=, <=),
  IF conditionals, unary minus. Strips optional leading `=`.
- **Expression Evaluator** — Async AST walker resolving field refs from
  row data, dispatching to local builtins or remote functions.
- **Local Builtins** — SUM, AVG, COUNT, MIN, MAX (aggregates across
  allRows), ROUND (value rounding). IF handled via conditional AST node.
- **useRemoteValues Hook** — React hook managing async cell state map,
  formula parsing cache, and configurable cache strategy.
- **ComputedCell Renderer** — Cell renderer with pending (CircularProgress),
  resolved (italic value), and error (ErrorOutline icon + tooltip) states.
- **DataGridExtended Update** — New props: `remoteFunctions`, `cacheStrategy`,
  `computedCellStyle`. Auto-detects formula/remote columns, wraps with
  ComputedCell renderer and FxBadge header indicator. Full backward compat.
- **Dev Harness** — Demonstrates all formula features: arithmetic, ROUND,
  SUM aggregate, IF conditional, simulated remote functions (loading/error
  states), and remoteValueGetter.
- **Rockcut Integration** — `useFormulaFunctions` hook wiring to D6
  execute endpoint. Ingredients page shows "On Hand" formula column.
- **Type Declarations** — Updated `datagrid-extended.d.ts` for rockcut
  with all new types and exports.

### Files Created

| File | Purpose |
|------|---------|
| `datagrid-extended/src/lib/types.ts` | ExtendedGridColDef, RemoteFunctions, CacheStrategy, CellState, Expression AST types |
| `datagrid-extended/src/lib/formula/parser.ts` | Tokenizer + recursive descent expression parser (323 lines) |
| `datagrid-extended/src/lib/formula/evaluator.ts` | Async AST evaluator with builtin + remote function dispatch |
| `datagrid-extended/src/lib/formula/builtins.ts` | Local builtin function definitions (SUM, AVG, COUNT, MIN, MAX, ROUND) |
| `datagrid-extended/src/lib/formula/useRemoteValues.ts` | React hook for async cell state management + caching |
| `datagrid-extended/src/lib/formula/ComputedCell.tsx` | Cell renderer for pending/resolved/error states |
| `datagrid-extended/src/lib/formula/__tests__/parser.test.ts` | 50 parser validation tests |
| `datagrid-extended/src/lib/formula/__tests__/evaluator.test.ts` | 41 evaluator + builtins tests |
| `rockcut-ui/src/hooks/useFormulaFunctions.ts` | Hook wiring remoteFunctions to D6 formula endpoints |
| `docs/testing/browser_automation_playbook.md` | Browser automation testing knowledge base |

### Files Modified

| File | Changes |
|------|---------|
| `datagrid-extended/src/lib/DataGridExtended.tsx` | Added remoteFunctions, cacheStrategy, computedCellStyle props; formula column detection; ComputedCell rendering; FxBadge header |
| `datagrid-extended/src/lib/index.ts` | Added exports for all new types, parseFormula, evaluate, localBuiltins |
| `datagrid-extended/src/App.tsx` | Updated dev harness with 7 formula column examples |
| `rockcut-ui/src/datagrid-extended.d.ts` | Added type declarations for new props and formula engine exports |
| `rockcut-ui/src/pages/ingredients/IngredientsList.tsx` | Added "On Hand" formula column with remoteFunctions prop |

---

## Testing

### Tests Run

- [x] Parser unit tests: **50/50 passed** — all grammar elements, precedence,
  error handling, edge cases
- [x] Evaluator unit tests: **44/44 passed** — field refs, arithmetic,
  comparisons, builtins (string literal + bare field ref), remote functions,
  IF conditionals
- [x] Browser automation (dev harness): **11/11 passed** — all formula types
  verified visually, computed cell indicators confirmed
- [x] Browser automation (rockcut e2e): **10/10 passed** — Ingredients page
  formula column resolves against D6 backend, visual indicators present

### Test Coverage

**Parser:** Full coverage of all grammar elements including:
- Literals (numeric int/decimal, string, empty string)
- Field references (with underscores, leading underscore)
- Function calls (0, 1, N args, nested)
- All operators with correct precedence
- IF conditionals (simple, nested)
- Leading `=` stripping
- Unary minus
- 6 error cases + 5 edge cases

**Evaluator:** Covers arithmetic, comparisons, all builtins (both string
literal and bare field ref syntax for aggregates), remote functions
(success + error + unknown), missing field graceful handling,
division-by-zero safety.

**Visual:** All formula column types verified: arithmetic, ROUND, SUM
aggregate, IF conditional, remote function (loading→resolved, error state),
remoteValueGetter. Computed cell styling (italic) and header fx badge confirmed.

### Test Runner

Tests use a minimal built-in harness (no vitest dependency). Run via:
```bash
cd ~/src/shared/ui-components/datagrid-extended
npx tsx src/lib/formula/__tests__/parser.test.ts
npx tsx src/lib/formula/__tests__/evaluator.test.ts
```

---

## Deviations from Spec

- **Unary minus representation:** Parser represents `-x` as
  `{ type: 'binary', op: '*', left: { type: 'number', value: -1 }, right: x }`
  rather than a dedicated unary AST node. Functionally equivalent.

- **Dev harness port:** Spec assumed port 5173. In practice, this port is
  often occupied; the harness starts on the next available port (e.g., 5178).
  Not a code deviation — just a runtime detail.

---

## Follow-Up Items

- [ ] **F3: Internal batching** — Batch multiple remote function calls into
  a single API request via `batchEndpoint` (spec'd as out of scope for D7)
- [ ] **F4: Manual cache invalidation** — Allow consumers to invalidate
  cache via ref (spec'd as out of scope for D7)
- [ ] **Loading state UX** — Remote functions in production resolve quickly
  (~7ms for inventory_on_hand). Loading spinner is barely visible. Consider
  removing the loading state delay or showing it only for calls >200ms.
- [ ] **Additional rockcut formula columns** — Wire EST_IBU and EST_OG to
  recipe pages once recipe detail views are available.
- [ ] **Visual indicator style review** — Confirm with Matt that italic
  computed cells + fx badge is the right balance (vs. tinted background).

---

## Notes

- No new runtime dependencies were added to datagrid-extended (parser is
  hand-rolled, all builtins are native JS).
- The component is fully backward compatible — existing usage without formula
  props behaves identically to before.
- Browser automation playbook (`docs/testing/browser_automation_playbook.md`)
  was created and populated with reusable patterns for MUI DataGrid element
  discovery, timing guidelines, tool quirks, and step-by-step recipes.
  Future deliverables should read it before starting browser tests.
- Formula engine exports (parseFormula, evaluate, localBuiltins) are public
  API for advanced consumers who want to use the parser standalone.
