# Test: Brewhouse Settings CRUD

## Context

Brewhouse settings pages (`/settings/brewhouses`, `/settings/brewhouses/:id`) allow managing brewery equipment configurations including UOM preferences and equipment values. Added in D12. Components: `BrewhousesList.tsx`, `BrewhouseDetail.tsx`, `BrewhouseFormDialog.tsx`.

## Prerequisites

- [ ] API server running at `localhost:4002`
- [ ] UI server running at `localhost:5173`
- [ ] Authenticated as admin user
- [ ] Seed data: at least 1 brewhouse ("Production") exists

## Acceptance Criteria

- Settings page shows "Brewhouses" navigation button
- Brewhouses list page renders with DataGrid showing seeded data
- Brewhouse detail page shows General, UOM Preferences, and Equipment Values sections
- Create brewhouse via dialog works and appears in list
- Brewhouse detail displays all UOM and equipment fields correctly

## Scenarios

### Scenario: Settings page has Brewhouses navigation

**Steps**:
1. Navigate to `/settings`
2. Wait for page to load

**Verify**:
- [ ] "BREWHOUSES" button is visible
- [ ] "PROCESS PROFILES" button is visible

### Scenario: Brewhouses list loads with seed data

**Steps**:
1. Navigate to `/settings/brewhouses`
2. Wait for DataGrid to render

**Verify**:
- [ ] Page heading reads "Brewhouses"
- [ ] "Add Brewhouse" button is visible
- [ ] DataGrid shows "Production" brewhouse row
- [ ] Columns include: Name, Volume Unit, Temp Unit, Density, IBU Method, Default

### Scenario: Brewhouse detail shows all sections

**Steps**:
1. Navigate to `/settings/brewhouses`
2. Click the "Production" row

**Verify**:
- [ ] Page heading shows "Production"
- [ ] "General" section visible with Name, Default, Notes fields
- [ ] "UOM Preferences" section visible with Temperature Unit, Liquid Volume Unit, etc.
- [ ] "Equipment Values" section visible with Kettle Turn Size, Evaporation Rate, etc.

### Scenario: Create new brewhouse

**Steps**:
1. Navigate to `/settings/brewhouses`
2. Click "Add Brewhouse" button
3. Fill Name with "Test Brewhouse"
4. Click Save

**Verify**:
- [ ] Dialog opens with title "Add Brewhouse"
- [ ] After save: dialog closes
- [ ] List now shows "Test Brewhouse" row

**Cleanup**:
5. Click "Test Brewhouse" row
6. Delete it

## Knowledge References

- Element Catalog: element-catalog.yaml (login_page, app_shell)
- Timing: 2s page navigation, 300ms dialog open
