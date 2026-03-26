# Test: Brand Form — Brewhouse & Process Profile Integration

## Context

Brand form dialog (`BrandFormDialog.tsx`) now includes Brewhouse and Process Profile dropdown selects populated from API. Added in D12.

## Prerequisites

- [ ] API server running at `localhost:4002`
- [ ] UI server running at `localhost:5173`
- [ ] Authenticated as admin user
- [ ] At least 1 brewhouse and 1 process profile exist

## Acceptance Criteria

- Add Brand dialog shows Brewhouse dropdown with available brewhouses
- Add Brand dialog shows Process Profile dropdown with available profiles
- Both dropdowns include a "None" option

## Scenarios

### Scenario: Brand form shows brewhouse and process profile dropdowns

**Steps**:
1. Navigate to `/brands`
2. Click "Add Brand" button
3. Wait for dialog to open

**Verify**:
- [ ] Dialog opens with title "Add Brand"
- [ ] "Brewhouse" select field is visible
- [ ] "Process Profile" select field is visible
- [ ] Cancel dialog

## Knowledge References

- Element Catalog: brands_add_dialog
