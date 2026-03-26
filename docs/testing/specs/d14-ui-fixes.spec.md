# Test: D14 UI Quick Fixes

## Context

D14 includes: (1) Ingredient Library defaults to Grain category, (2) "Extract" renamed to "Other Consumables", (3) System fields show lock badge and are non-deletable.

## Prerequisites

- [ ] API server running at `localhost:4002`
- [ ] UI server running at `localhost:5173`
- [ ] Authenticated as admin user
- [ ] Seed data: Grain category with system fields (Origin, Maltster)

## Acceptance Criteria

- Ingredient Library page loads with "Grain" pre-selected in category filter
- Settings categories list shows "Other Consumables" (not "Extract")
- Category detail shows lock icon on system fields
- System fields have no delete button in grid

## Scenarios

### Scenario: Ingredient Library defaults to Grain

**Steps**:
1. Navigate to `/ingredients`
2. Wait for page to load

**Verify**:
- [ ] Category dropdown value is "Grain"
- [ ] Grid shows grain ingredients (not all ingredients)

### Scenario: Other Consumables rename

**Steps**:
1. Navigate to `/settings`
2. Wait for categories grid to load

**Verify**:
- [ ] "Other Consumables" text is visible in the categories grid
- [ ] "Extract" text is NOT visible

### Scenario: System field protection

**Steps**:
1. Navigate to `/settings`
2. Click the "Grain" category row to go to detail

**Verify**:
- [ ] Field definitions section shows fields with lock icons (system fields)
- [ ] System fields do NOT have individual delete buttons in the grid

## Knowledge References

- CCP test results: All 3 scenarios passed in Phase 1
