# Test: Recipe Operations — Copy, Set as Default

## Context

Recipe detail page (`RecipeDetail.tsx`) adds Copy Recipe and Set as Default operations. D13 feature. Copy creates a clone with auto-incremented version. Set as Default toggles the default flag.

## Prerequisites

- [ ] API server running at `localhost:4002`
- [ ] UI server running at `localhost:5173`
- [ ] Authenticated as admin user
- [ ] At least 1 brand with 1 recipe exists

## Acceptance Criteria

- Copy Recipe button present and opens confirmation dialog
- Copy creates new recipe with incremented version
- Set as Default button toggles default state
- Move to Brand button is present

## Scenarios

### Scenario: Recipe toolbar has all operation buttons

**Steps**:
1. Navigate to a brand detail page
2. Click first recipe row to go to recipe detail

**Verify**:
- [ ] "Copy Recipe" button (tooltip) is visible
- [ ] "Move to Brand" button (tooltip) is visible
- [ ] "Set as Default" or "Default" chip is visible
- [ ] "Edit Recipe" button is visible
- [ ] "Delete Recipe" button is visible

### Scenario: Copy Recipe creates clone

**Steps**:
1. On recipe detail page, click Copy Recipe button
2. Wait for dialog

**Verify**:
- [ ] Dialog opens with title "Copy Recipe"
- [ ] Dialog describes what will be cloned
- [ ] "Copy" submit button is visible

### Scenario: Set as Default toggles

**Steps**:
1. On recipe detail page that is not default
2. Click "Set as Default" button

**Verify**:
- [ ] Star icon turns amber / "Default" chip appears

## Knowledge References

- Timing: 1s for mutation + redirect
