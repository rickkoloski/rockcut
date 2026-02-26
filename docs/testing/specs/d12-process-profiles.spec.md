# Test: Process Profile Settings

## Context

Process Profile pages (`/settings/process-profiles`, `/settings/process-profiles/:id`) manage brewing process templates with 6 phase sections. Added in D12. Components: `ProcessProfilesList.tsx`, `ProcessProfileDetail.tsx`.

## Prerequisites

- [ ] API server running at `localhost:4002`
- [ ] UI server running at `localhost:5173`
- [ ] Authenticated as admin user
- [ ] Seed data: 3 process profiles exist (RC Ale, RC Hazy, RC Lager)

## Acceptance Criteria

- Process Profiles list renders with 3 seeded profiles
- Detail page organizes fields into 6 phase sections: Mash, Lauter, Boil & Post-Boil, Fermentation, Cold Crash, Packaging
- Each phase section displays relevant fields

## Scenarios

### Scenario: Process Profiles list loads with seed data

**Steps**:
1. Navigate to `/settings/process-profiles`
2. Wait for DataGrid to render

**Verify**:
- [ ] Page heading reads "Process Profiles"
- [ ] "Add Profile" button is visible
- [ ] DataGrid shows 3 rows: "RC Ale", "RC Hazy", "RC Lager"
- [ ] Columns include: Name, Mash Type, Boil (min), Primary Temp, Crash Type, Transfer

### Scenario: Process Profile detail shows all 6 phase sections

**Steps**:
1. Navigate to `/settings/process-profiles`
2. Click the "RC Ale" row

**Verify**:
- [ ] "General" section visible
- [ ] "Mash" section visible
- [ ] "Lauter" section visible
- [ ] "Boil & Post-Boil" section visible
- [ ] "Fermentation" section visible
- [ ] "Cold Crash" section visible
- [ ] "Packaging" section visible

## Knowledge References

- Timing: 2s page navigation
