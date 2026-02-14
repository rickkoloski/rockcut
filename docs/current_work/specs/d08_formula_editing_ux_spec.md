# D8: Formula Editing UX — Spec

**Status:** APPROVED
**Created:** 2026-02-14

---

## Problem

The formula engine (D7) supports expression parsing, evaluation, remote functions, and visual indicators — but formulas are hardcoded as column props in developer code. End users (like Matt at Rockcut) cannot write, edit, or remove formulas. The component is not self-serve.

## Goal

Add a column-level formula editing UX to datagrid-extended that lets end users create, modify, and remove formulas on any column — with autocomplete, live validation, and live preview. Also wire EST_IBU + EST_OG to the BrandDetail recipe grid as additional formula test surface.

## Design Model

Airtable/Notion pattern: one formula per column, all rows compute the same way. Column header interaction opens a formula editor popover. Designed so cell-level overrides (per-cell formula exceptions) slot in later without rework.

## Requirements

### Core
1. New `formulaEditable` prop opts in to editing UI (default false, zero overhead)
2. Column headers show clickable affordance when editing enabled
3. FormulaEditor popover with: monospace input, function autocomplete, field autocomplete, live syntax validation, live preview, save/clear/cancel
4. `onFormulaChange` callback fires on save/clear (consumer decides persistence)
5. `functionCatalog` prop provides function definitions for autocomplete
6. Saving a formula makes the column computed (cells evaluate immediately)
7. Clearing a formula reverts column to data display

### Autocomplete
8. Function autocomplete triggered by uppercase prefix, shows name + signature + description
9. Field autocomplete triggered by lowercase prefix, shows field names from sibling columns
10. Default catalog includes all local builtins (SUM, AVG, COUNT, MIN, MAX, ROUND, IF)
11. Remote function names auto-included from `remoteFunctions` prop keys

### Validation & Preview
12. Live syntax validation via existing parser (debounced 150ms)
13. Error messages include character position
14. Live preview evaluates first row when formula is valid (debounced 300ms)
15. Preview handles remote functions (shows spinner during evaluation)

### Future-Awareness
16. Formula resolution path: cell override (future) → column override (D8) → column prop (D7)
17. FormulaEditor is context-agnostic (works for column header today, cell click later)
18. useFormulaState hook supports per-field overrides, extensible to per-cell

### Rockcut Integration
19. BrandDetail recipe grid shows Est. IBU and Est. OG formula columns
20. IngredientsList enables `formulaEditable` on existing grid

### Backward Compatibility
21. All existing usage without formula editing props behaves identically
22. No new runtime dependencies

## Success Criteria

- Dev harness demonstrates: open editor, type formula, see validation, see preview, save, see column update, clear, cancel
- Rockcut Ingredients page: click fx badge, see formula in editor, preview shows value
- Rockcut BrandDetail: Est. IBU + Est. OG display computed values
- Unit tests pass for ast-utils and useFormulaState
- Browser automation tests pass per playbook (including computed style verification)
- UAT handoff per process (servers running, URLs documented)

## Out of Scope (D8)

- Cell-level formula overrides (future D10)
- Formula persistence (consumer responsibility via `onFormulaChange`)
- Undo/redo for formula edits
- AI-assisted formula generation
- Multi-line formula editor
- Formula bar (persistent display above grid)

## References

- D7 completion: `docs/current_work/stepwise_results/d07_datagrid_formula_engine_COMPLETE.md`
- Master spec: `docs/spec/dynamic-formula-execution.md`
- Implementation plan: `/Users/richardkoloski/.claude/plans/wobbly-leaping-clock.md`
