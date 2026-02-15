# D9: Column Visibility Toggle — Spec

**Status:** APPROVED
**Created:** 2026-02-15
**Depends On:** D7 (datagrid-extended foundation)

---

## 1. Problem Statement

Grids with many columns (e.g., recipe grain bills with 9 columns, batch details) become cramped on smaller screens and show data the user doesn't always need. Users need a quick way to show/hide columns per grid, with their preferences persisting across sessions.

MUI DataGrid has a built-in `columnVisibilityModel` mechanism, but it lacks localStorage persistence, requires navigating through a buried "Manage columns" menu, and has no prominent toggle UI. We need a first-class feature in datagrid-extended that wraps MUI's model with a better UX and persistence.

---

## 2. Requirements

### Functional
- [ ] New prop `columnVisibilityToggle?: { storageKey: string }` on DataGridExtended
- [ ] Toolbar button (ViewColumn icon) above the grid opens a column visibility panel
- [ ] Panel lists all toggleable columns with eye/eye-off icons
- [ ] "Hide Column" menu item in each column's context menu
- [ ] State persists to localStorage keyed by `storageKey`
- [ ] "Show All" button resets to all columns visible
- [ ] Cannot hide the last visible column (disabled toggle + tooltip)
- [ ] Action columns (`actions`, `__check__`) excluded from toggle
- [ ] Feature is completely disabled when prop is not set (zero overhead)
- [ ] Backward compatible — existing grids unchanged

### Non-Functional
- [ ] No new npm dependencies (uses existing MUI icons)
- [ ] Follows existing patterns (FormulaColumnMenuItem, useFormulaState)
- [ ] Handles corrupt localStorage gracefully
- [ ] Rules-of-hooks safe (hook always called, no-ops when disabled)

---

## 3. Design

### Components
| Component | Purpose |
|-----------|---------|
| `useColumnVisibility` | State hook managing visibility model + localStorage |
| `ColumnVisibilityPanel` | Popover with column toggle list |
| `HideColumnMenuItem` | Column menu item "Hide Column" |

### Integration
- Hook always called in DataGridExtended (empty storageKey = no-op)
- Panel anchored below toolbar button via MUI Popover
- Menu item injected via existing slots/slotProps pattern
- `columnVisibilityModel` passed to underlying DataGrid

---

## 4. Success Criteria
- [ ] 12 unit tests pass for hook logic
- [ ] Dev harness demo works (toggle, persist, refresh)
- [ ] 8 Rockcut grids enabled with correct storageKeys
- [ ] TypeScript compiles clean in both repos
- [ ] Browser automation tests pass
- [ ] Grids without the prop are unaffected

---

## 5. Out of Scope
- Column reordering / drag-and-drop
- Server-side persistence (beyond localStorage)
- Per-user settings (single browser = single user for now)
- Column grouping or pinning
