# Rockcut Brewing — Technical Decisions

## Context

Rockcut is a recipe management and brewing process automation app for a craft brewer who currently manages everything in Excel (complex workbooks with formulas). The goal is to give him a proper app that preserves the tabular, data-driven way he thinks about brewing while adding automation, history, and real-time process tracking.

## Architecture Decision: Phoenix API + React SPA

### Decision

Phoenix/Elixir backend serving a JSON API, with a Vite/React/TypeScript frontend.

### Why Phoenix

- Real-time capabilities via channels (live brew timers, temperature monitoring, batch status)
- Elixir's concurrency model is ideal for process automation (GenServers for batch processes, scheduled tasks)
- Ecto provides a clean data layer with migrations
- The team has production experience with Phoenix (vNext project)

### Why NOT LiveView-only

- The team's primary frontend experience is React/TypeScript/MUI
- Previous experience on vNext showed LiveView gets stretched when the UI needs rich interactive components (data grids, drag-and-drop recipe building)
- MUI's DataGrid (`@mui/x-data-grid`) directly solves the "thinks in spreadsheets" UX requirement
- Maintaining a familiar stack reduces risk since the brewer will eventually maintain this with lighter support

### Why SQLite to Start

- Zero infrastructure — the database is a file
- No Postgres install required for the brewer to run the app locally
- `ecto_sqlite3` is mature and works with standard Ecto migrations
- Migration to Postgres later is straightforward (swap adapter + config)
- Perfectly suited for single-user / low-concurrency workloads

### When to Migrate to Postgres

- If multi-user access becomes a requirement
- If full-text search or vector/embedding features are needed
- If write concurrency becomes a bottleneck (unlikely for this use case)

## Architecture Decision: Reusable Grid Component Library

### Decision

Build an advanced grid component as a standalone package in `~/src/ui-components/`, extending MUI's DataGrid with Excel-like features. Rockcut consumes it as a dependency, but it's project-agnostic and reusable.

### Why a Separate Package

- Follows the established pattern: `gantt-widget`, `taskview-toggle`, and `workflow-ui` already live as standalone component projects
- Excel-like grid and TreeGrid components are complex enough to warrant dedicated development, testing, and versioning
- Other projects (Harmoniq, future apps) can consume the same component
- Keeps Rockcut's frontend thin — it consumes the grid, doesn't own it

### Target Capabilities (Excel-like extensions over MUI DataGrid)

- Inline cell editing with tab/enter navigation between cells
- Formula/computed columns (display-level, backed by server calculations)
- Copy/paste support (single cell and range)
- Column resizing, reordering, pinning
- Row grouping and TreeGrid mode (hierarchical data — e.g., recipe > ingredients)
- Conditional formatting (color-coded cells based on value thresholds)
- Multi-row selection and bulk operations
- CSV/Excel export

### Package Location

```
~/src/ui-components/
  gantt-widget/          # existing
  taskview-toggle/       # existing
  datagrid-extended/     # new — working name
```

### Integration with Rockcut

The Rockcut frontend will consume the grid component via npm link during development (same pattern as workflow-ui in vNext), and eventually as a published package if other projects adopt it.

## Stack Details

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| **Backend** | Elixir / Phoenix | Latest stable (1.8+) |
| **Database** | SQLite via `ecto_sqlite3` | Single-file DB |
| **Frontend** | React + TypeScript | React 19 |
| **Build** | Vite | Latest stable |
| **UI Components** | MUI + `datagrid-extended` (custom) | MUI 7 + custom grid package |
| **Styling** | Tailwind CSS | v4 |
| **State** | Zustand | Client state |
| **Server State** | React Query (`@tanstack/react-query`) | Cache + sync |
| **Realtime** | Phoenix Channels + `phoenix` JS client | WebSocket |
| **Testing** | ExUnit (backend), Vitest + Playwright (frontend) | |

## Scaffold Instructions

### Prerequisites

```bash
# Elixir/Erlang (via asdf or homebrew)
brew install elixir

# Node.js (for frontend)
# Already available in the dev environment
```

### Backend Setup

```bash
cd /Users/richardkoloski/src/rockcut

# Generate Phoenix API project (no HTML/LiveView, SQLite)
mix phx.new rockcut_api --no-html --no-assets --database sqlite3

cd rockcut_api
mix deps.get
mix ecto.create
```

### Frontend Setup

```bash
cd /Users/richardkoloski/src/rockcut

# Generate Vite + React + TypeScript project
npm create vite@latest rockcut-ui -- --template react-ts

cd rockcut-ui
npm install

# Core UI
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
npm install @mui/x-data-grid

# Styling
npm install tailwindcss @tailwindcss/postcss postcss autoprefixer

# State & Data
npm install zustand @tanstack/react-query axios

# Routing
npm install react-router-dom

# Phoenix channels
npm install phoenix

# Dev tools
npm install -D @types/node
```

### Development

```bash
# Terminal 1: Phoenix API
cd rockcut_api && mix phx.server
# Runs on localhost:4001 (4000 reserved for vNext)

# Terminal 2: Vite dev server
cd rockcut-ui && npm run dev
# Runs on localhost:5173, proxy API calls to :4001
```

## Data Model (Initial Sketch)

These are starting points — to be refined during discovery with the brewer.

### Core Entities

- **Recipe** — name, style, target OG/FG/ABV/IBU, batch size, notes
- **Ingredient** — name, type (grain/hop/yeast/adjunct), supplier, unit cost
- **RecipeIngredient** — recipe + ingredient + quantity + timing + notes
- **Batch** — recipe reference, brew date, status, actual measurements, notes
- **BatchStep** — batch + step type (mash, boil, ferment, etc.) + target values + actual values + timestamps
- **Measurement** — batch + timestamp + type (gravity, temp, pH) + value

### Computed Fields (Replacing Excel Formulas)

Rather than client-side formulas, brewing calculations live in Elixir:

- OG/FG estimation from grain bill
- IBU calculation (Tinseth or Rager)
- ABV from OG/FG
- SRM/color estimation
- Water chemistry adjustments
- Efficiency tracking (predicted vs. actual)

## Open Questions

- [ ] What brewing calculations does he rely on most? (drives which formulas to implement first)
- [ ] Does he want inventory tracking? (ingredient stock levels, purchase history)
- [ ] Does he track costs per batch?
- [ ] Multi-user? Or solo use only?
- [ ] Does he want to connect to any hardware? (temperature controllers, refractometers)
- [ ] Mobile access important? (checking fermentation from the brewery floor)
- [ ] Does he want to share/export recipes? (BeerXML, BeerJSON compatibility)
