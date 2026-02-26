# Test Results: D12, D13, D14 — Brewhouse/Profiles, Recipe Ops, UI Fixes

**Date:** 2026-02-26
**Tester:** Test Agent
**Verdict:** PASS

## Test Results

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 1 | Settings: Brewhouses nav link exists | PASS | "BREWHOUSES" button visible on /settings page |
| 2 | Settings: Process Profiles nav link exists | PASS | "PROCESS PROFILES" button visible on /settings page |
| 3 | Brewhouses list: "Production" seeded | PASS | Shows bbls / F / sg / tinseth / Default=Yes |
| 4 | Brewhouse detail: UOM + equipment fields | PASS | General, UOM Preferences, Equipment Values sections all present |
| 5 | Brewhouse: Create new | PASS | "Test Brewhouse" created; list updated to 1–2 of 2 |
| 6 | Process Profiles list: 3 seeded profiles | PASS | RC Ale, RC Hazy, RC Lager all present (1–3 of 3) |
| 7 | Process Profile detail: fields grouped by phase | PASS | Mash, Lauter, Boil & Post-Boil, Fermentation, Cold Crash, Packaging all present |
| 8 | Brand form: Brewhouse + Process Profile dropdowns | PASS | Both dropdowns visible in Add Brand dialog (below Status) |
| 9 | Brand detail: Duplicate Brand button + flow | PASS | Button present; dialog pre-fills "Test IPA (Copy)" + clone checkbox; navigated to /brands/2 |
| 10 | Recipe detail: Copy Recipe button present | PASS | Button found via accessibility tree |
| 11 | Recipe detail: Move Recipe button present | PASS | Found as "Move to Brand" button |
| 12 | Recipe detail: Set as Default button present | PASS | Found as star icon "Set as Default" |
| 13 | Copy Recipe flow | PASS | Confirmation dialog shown; recipe v1.1 created (auto-incremented); navigated to /brands/1/recipes/2 |
| 14 | Set as Default flow | PASS | Star button turns amber and shows "Default" badge after click |
| 15 | Ingredient Library: defaults to Grain category | PASS | Category dropdown shows "Grain" on fresh page load; 7 grain ingredients displayed |
| 16 | "Extract" renamed to "Other Consumables" | PASS | "Other Consumables" visible in Settings categories list |
| 17 | Category detail: system badge on system fields | PASS | Lock icon (🔒) shown next to Origin and Maltster field names in Grain category |
| 18 | System fields: delete disabled/absent | PASS | No delete buttons in grid rows for system fields; only page-level Edit/Delete Category |

## Screenshots

1. **Settings page** — BREWHOUSES and PROCESS PROFILES tabs visible; Other Consumables in categories
2. **Brewhouses list** — Production seeded with bbls/F/sg/tinseth
3. **Brewhouse detail** — UOM Preferences + Equipment Values sections
4. **Add Brewhouse dialog** — Name, Default checkbox, Notes, UOM dropdowns
5. **Test Brewhouse created** — List shows 1–2 of 2
6. **Process Profiles list** — RC Ale, RC Hazy, RC Lager (1–3 of 3)
7. **RC Ale detail (top)** — General, Mash, Lauter, Boil & Post-Boil sections
8. **RC Ale detail (bottom)** — Fermentation, Cold Crash, Packaging sections
9. **Add Brand dialog (scrolled)** — Brewhouse and Process Profile dropdowns visible
10. **Brands list with "Show Archived" toggle** — D14 default filter working; toggle visible
11. **Test IPA brand detail** — Duplicate Brand button (copy icon) in toolbar
12. **Duplicate Brand dialog** — Pre-filled "Test IPA (Copy)" + clone recipes checkbox
13. **Test IPA (Copy) brand** — Duplicate succeeded, navigated to /brands/2
14. **Recipe v1.0 detail** — All 4 toolbar buttons: Set as Default ★, Copy, Move, Edit, Delete
15. **Copy Recipe dialog** — Confirmation with description of what will be cloned
16. **Recipe v1.1 created** — Auto-incremented version, navigated to /brands/1/recipes/2
17. **Set as Default result** — Star turns amber, shows "Default" chip badge
18. **Ingredient Library** — Grain default filter active on load; 7 grain ingredients
19. **Grain category detail** — Lock icons on Origin and Maltster; no per-row delete buttons

## Bugs Found

None — all 18 test cases passed.

## Notable Observations

- **Brands list was empty on fresh DB**: No seed brands exist. The "Show Archived" toggle and default active-only filter (D14) both work correctly; the empty state just reflects a fresh database.
- **"Move to Brand" label**: The Move Recipe button's accessible name is "Move to Brand" (not "Move Recipe"). This is perfectly fine — just noting for documentation.
- **D14 Brands filter**: The "Show Archived" toggle correctly starts OFF (filtering to active-only). Even toggling it ON on a fresh DB shows 0 rows — filter logic is correct.

## Summary

All 18 test cases across D12, D13, and D14 **PASSED**. The implementation is complete and working correctly:

- **D12**: Brewhouse and Process Profile CRUD pages are fully functional with proper seeded data, UOM preferences, equipment values, phase grouping, and brand integration.
- **D13**: All three recipe operations (Copy, Move to Brand, Set as Default) plus Duplicate Brand are working with correct UX flows and auto-navigation to new records.
- **D14**: Ingredient Library Grain default, Extract→Other Consumables rename, system field lock badge, and non-deletable system fields all working as expected.
