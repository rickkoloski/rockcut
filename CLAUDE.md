# Rockcut Brewing Co

Brewery management app for Matt at Rockcut Brewing Co, Estes Park, Colorado.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| API | Phoenix 1.8 (Elixir) — port 4002 locally |
| Database | SQLite (WAL mode) |
| Frontend | React 19 SPA (Vite, MUI 7, pnpm) — port 5174 locally |
| Hosting | Fly.io (rockcut-api.fly.dev, rockcut-ui.fly.dev) |
| Auth | Bearer tokens, EnvAuth pattern |
| Data Grid | datagrid-extended (linked from ~/src/shared/ui-components/) |

## Current Work

Active deliverables live in `docs/current_work/`:
- `specs/` — What to build
- `planning/` — How to build it
- `prompts/` — CC instructions
- `stepwise_results/` — Completion records
- `issues/` — Blocked items

## Project Structure

```
rockcut/
├── rockcut_api/          # Phoenix API
│   ├── lib/rockcut_api/brewing/  # 13 Ecto schemas + context
│   ├── lib/rockcut_api_web/      # Controllers, router, plugs
│   └── priv/repo/                # Migrations, seeds
├── rockcut-ui/           # React SPA
│   ├── src/pages/        # Route pages (brands, recipes, ingredients, batches, settings)
│   ├── src/components/   # Shared components (FormDialog, PageHeader, StatusChip, etc.)
│   ├── src/hooks/        # useApiQuery, useApiMutation, useAuth
│   └── src/lib/          # api.ts, types.ts, queryClient.ts, parseApiError.ts
└── docs/                 # SDLC documentation
    ├── current_work/     # Active deliverables
    ├── chronicle_by_concept/  # Completed work by domain
    ├── templates/        # Doc templates
    └── process/          # SDLC workflow docs
```

## Running the Project

```bash
# API
cd rockcut_api && mix phx.server    # http://localhost:4002

# UI
cd rockcut-ui && pnpm dev           # http://localhost:5174

# Deploy
cd rockcut_api && fly deploy --remote-only
cd rockcut-ui && fly deploy --remote-only

# Seed prod
fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval 'RockcutApi.Release.seed()'"
```

## Key Patterns

- **API params**: Flat (not nested). `{ name, category_id }` not `{ ingredient: { name } }`
- **useApiUpdate**: Callers spread payload: `{ id: item.id, ...payload }`
- **FormDialog**: Handles preventDefault internally; child dialogs just pass `async () => {}`
- **Error handling**: All form dialogs catch mutations, display via `parseApiError` + FormDialog `error` prop
- **Batch size units**: LOV — `bbls`, `gallons`, `liters` (backend + frontend must stay in sync)
- **datagrid-extended**: Linked package locally, Docker shim for deploy

## Auth

- Login: matt@rockcut.com / rockcut2026
- Prod secrets: ADMIN_EMAIL, ADMIN_PASSWORD_HASH (Fly secrets)

## Conventions

- **Deliverable IDs**: D1, D2, ... Dnn (sequential, never reused)
- **Next deliverable**: D8
- **Commit format**: `feat: implement D6 feature name` or `fix: description`

## SDLC Process Compliance

This project follows the SDLC framework from `~/src/ops/sdlc/`.

**CC must:**
- Follow the deliverable workflow (Spec → Planning → Implementation → Result)
- Use deliverable IDs (D1, D2, ...) for all new work
- Create specs before implementing non-trivial features
- Document completions in stepwise_results/
- Ask before deviating from established process

**Do not:**
- Skip the spec phase for significant work
- Implement features without deliverable IDs
- Deviate from the process without explicit approval

If unsure about process, reference `~/src/ops/sdlc/process/overview.md`.

## Completed Deliverables

| ID | Description | Concept |
|----|-------------|---------|
| D1 | Data Model — 13 tables, migrations, seeds | 01_data_model |
| D2 | CRUD APIs — 13 controllers, 65+ routes | 01_data_model |
| D3 | Deployment — Both apps on Fly.io | 03_deployment |
| D4 | Auth — Login gate, bearer tokens, EnvAuth | 04_auth |
| D5 | Scaffold UI — Full React SPA with CRUD forms | 02_scaffold_ui |
| D6 | Formula Execution Service — FormulaCatalog, FormulaRuntime, 3 brewing formulas | 05_dynamic_formulas |
| D7 | DataGrid Formula Engine — parser, evaluator, remote functions, visual indicators | 05_dynamic_formulas |

## References

- Data model spec: `docs/chronicle_by_concept/01_data_model/specs/d01_data_model_spec.md`
- UI spec: `docs/chronicle_by_concept/02_scaffold_ui/specs/d05_scaffold_ui_spec.md`
- Deployment docs: `docs/chronicle_by_concept/03_deployment/ref/`
- SDLC process: `docs/process/overview.md`
- Bootstrap guide: `~/src/ops/process/bootstrap-phoenix-react.md`
