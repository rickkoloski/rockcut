# D5: Scaffold UI — Complete

**Spec:** specs/d05_scaffold_ui_spec.md
**Completed:** 2026-02-12

## Summary
Built the full React SPA scaffold: dashboard, brands & recipes (with tabbed recipe detail), ingredient library, batches (with brew turns and log entries), and settings (categories + field definitions). All CRUD operations working with dialog-based forms and API error display.

## What Was Built

### Foundation (Phase 0)
- `src/lib/types.ts` — TypeScript interfaces for all 13 entities
- `src/lib/queryClient.ts` — React Query client
- `src/hooks/useApiQuery.ts` — Query wrapper
- `src/hooks/useApiMutation.ts` — Create/Update/Delete mutation hooks
- `src/components/FormDialog.tsx` — Shared dialog with error display
- `src/components/PageHeader.tsx` — Breadcrumbs + title + action
- `src/components/StatusChip.tsx` — Colored status chips
- `src/components/ConfirmDialog.tsx` — Delete confirmation
- `src/lib/parseApiError.ts` — Extract validation errors from 422 responses

### Pages (~35 files)
- Home dashboard with stat cards + active batches + recent recipes
- Brands list + detail + form dialog
- Recipe detail with 4 tabs (Grain Bill, Mash, Process, Water) + form dialogs for each
- Ingredients list with category filter + detail with lots table + form dialogs
- Batches list with status filter + detail with brew turns + log entries + form dialogs
- Settings: categories list + category detail with field definitions + form dialogs

### App Shell
- Updated nav: Home, Brands & Recipes, Ingredient Library, Batches, Settings
- 10 routes with React Router

## Bug Fixes During Smoke Testing
- FormDialog: preventDefault handled internally (not by child dialogs)
- Ingredient dialogs: flat params instead of nested objects
- Brew turns: removed double "v" prefix on version display
- Home: added pageSizeOptions to DataGrids
- BrandDetail/BatchDetail: fixed div-inside-p HTML nesting
- Recipe schema: added "bbls" to valid batch_size_unit values
- All 12 form dialogs: added try/catch with parseApiError for user-visible error messages

## Deviations from Spec
- Batch size unit defaulted to "bbls" (Matt's preference) instead of "gallons"
- Error handling added to all form dialogs (not in original spec)
