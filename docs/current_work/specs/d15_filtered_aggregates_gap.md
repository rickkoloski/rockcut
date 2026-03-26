# D15 Gap Analysis: Filtered Aggregates in Formula Parser

**Status:** Analysis complete — present options to Matt
**Created:** 2026-03-19

## The Problem

Matt's Recipe Fermentables table spec includes two columns that need **filtered aggregates**:

- **Mash Weight %** = `row weight / sum(weight of all MASH ingredients)`
- **Extract Weight %** = `row extract_expected / sum(extract_expected of all FERMENTABLE ingredients)`

Our formula parser has `SUM(field)` which sums across ALL rows. But these columns need to sum only rows matching a filter condition (e.g., `use == "Mash"`).

Currently, a formula like `=amount / SUM(amount)` would give "percentage of total" — not "percentage of mash-only total."

## Options

### Option A: Add SUMIF Builtin to Parser

Add a `SUMIF(field, condition_field, condition_value)` function to the parser's builtins:

```typescript
// Formula: =amount / SUMIF(amount, use, "Mash")
// Meaning: this row's amount ÷ sum of amount for all rows where use == "Mash"

builtins.SUMIF = {
  aggregate: true,
  fn: (allRows, fieldName, condField, condValue) => {
    return allRows
      .filter(row => row[condField] === condValue)
      .reduce((sum, row) => sum + (Number(row[fieldName]) || 0), 0);
  }
};
```

**Pros:**
- Formula-driven — Matt can see the logic in the column definition
- Reusable across any grid with filtering needs
- Consistent with the existing SUM/AVG pattern
- Familiar to spreadsheet users (Excel SUMIF)

**Cons:**
- Parser changes required (new 3-argument builtin)
- Condition syntax is limited (only equality, not ranges or complex logic)
- Parser currently handles aggregate builtins by passing unevaluated field names — SUMIF would need 3 unevaluated args

**Effort:** Small — 20-30 lines in builtins.ts, parser already handles multi-arg functions.

### Option B: Server-Side Calculation via FormulaCatalog

Add `mash_weight_pct` and `extract_weight_pct` as server-side functions:

```elixir
# formula: =MASH_WEIGHT_PCT(recipe_id, recipe_ingredient_id)
def mash_weight_pct(context, %{recipe_id: rid, ingredient_id: iid}) do
  # Load all recipe ingredients, filter by use == "mash"
  # Return this ingredient's weight / total mash weight
end
```

**Pros:**
- No parser changes needed
- Server has full access to data relationships and complex filtering
- Can handle edge cases (unit conversions, missing values) more robustly
- Follows the existing est_ibu/est_og pattern

**Cons:**
- N+1 API calls — one per row per formula column (mitigated by batch execution, but still chatty)
- Heavier than needed for simple math
- Less transparent to the user — formula just says `=MASH_WEIGHT_PCT(recipe_id, id)`

**Effort:** Medium — new handler function + catalog registration + frontend wiring.

### Option C: Custom valueGetter (Not Formula-Based)

Skip the formula engine entirely. Use a custom `valueGetter` on the column definition that has access to all rows:

```typescript
{
  field: 'mash_weight_pct',
  headerName: 'Mash Weight %',
  valueGetter: (value, row, column, apiRef) => {
    const allRows = apiRef.current.getRowModels();
    const mashRows = [...allRows.values()].filter(r => r.use === 'Mash');
    const totalMashWeight = mashRows.reduce((sum, r) => sum + r.amount, 0);
    return totalMashWeight > 0 ? (row.amount / totalMashWeight * 100) : 0;
  }
}
```

**Pros:**
- No formula system involvement — pure MUI DataGrid
- Full JavaScript flexibility for complex logic
- No API calls, fully client-side
- Immediate reactivity (recalculates on any row change)

**Cons:**
- Not visible as a formula — Matt can't see or adjust the logic
- Doesn't compose with other formula features (IF, ROUND, etc.)
- Tied to the specific grid implementation
- Inconsistent with other calculated columns that use the formula engine

**Effort:** Small — just a valueGetter function, no architecture changes.

## Recommendation

**Option A (SUMIF builtin)** is the best fit. Reasons:

1. It's the smallest change that keeps everything in the formula system
2. It's familiar — Matt will recognize SUMIF from spreadsheets
3. It composes: `=ROUND(amount / SUMIF(amount, use, "Mash") * 100, 1)`
4. It generalizes — any future "sum with filter" need is covered
5. The parser already handles multi-argument builtins

If SUMIF proves insufficient later (e.g., Matt needs complex multi-condition filtering), we can escalate to Option B for specific cases.

**Option C** is a fallback if we need it working immediately without parser changes.

## Implementation Notes (if approved)

```typescript
// In builtins.ts, add alongside SUM:
SUMIF: {
  aggregate: true,
  fn: (allRows: any[], valueField: string, condField: string, condValue: any) => {
    return allRows
      .filter(row => String(row[condField]) === String(condValue))
      .reduce((sum, row) => sum + (Number(row[valueField]) || 0), 0);
  }
}

// Usage in column definition:
{ field: 'mash_weight_pct', formula: '=ROUND(amount / SUMIF(amount, use, "Mash") * 100, 1)' }
{ field: 'extract_weight_pct', formula: '=ROUND(extract_expected / SUM(extract_expected) * 100, 1)' }
```

Note: Extract Weight % uses ALL fermentables (not filtered), so regular `SUM` works there. Only Mash Weight % needs `SUMIF`.
