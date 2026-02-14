# 02_scaffold_ui

## Overview
First-pass React SPA scaffold surfacing all CRUD data. Dashboard, brands & recipes (with tabbed detail), ingredient library, batches (with brew turns and log entries), and settings (categories + field definitions).

## Deliverables

### Foundation
| ID | File | Purpose | Status |
|----|------|---------|--------|
| D5 | specs/d05_scaffold_ui_spec.md | IA, routes, component plan | COMPLETE |
| D5 | results/d05_scaffold_ui_COMPLETE.md | Implementation record | COMPLETE |

## Common Tasks
- "How is the UI structured?" -> See specs/d05_scaffold_ui_spec.md
- "What routes exist?" -> /, /brands, /brands/:id, /brands/:brandId/recipes/:id, /ingredients, /ingredients/:id, /batches, /batches/:id, /settings, /settings/categories/:id

## Key Decisions
- Dialog-based CRUD forms (not inline edit) — simpler, consistent pattern
- React Query for server state, Zustand only for auth
- Shared FormDialog component with error display from API validation
- DataGridExtended wrapper over MUI DataGrid (linked local package)

## Dependencies
- Depends on: 01_data_model (API endpoints)
- Depends on: 04_auth (login gate, bearer tokens)
