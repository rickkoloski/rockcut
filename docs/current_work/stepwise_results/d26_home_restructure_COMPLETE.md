# D26: Company-wide Home + Brewery Dashboard — Completion Record

**Status:** Complete (2026-09-23)
**Spec:** `specs/d26_home_restructure_spec.md`
**Concept:** 02_scaffold_ui
**Branch:** `scheduler-pwa`

---

## What shipped

The landing page is now company-wide; the brewers' dashboard is a separate
brewery-only page. Frontend only — no API change.

- **New generic Home** (`src/pages/Home.tsx`): "Welcome back, {name}" + a grid of
  quick-link cards to the areas the signed-in user can reach — View Schedule,
  Scheduler (managers/owners), Time off, Availability, Messages, Brewery (brewery
  members), Users & Roles (user managers). Copy notes more widgets are coming.
  It's the default landing for **every** authenticated employee.
- **Brewery Dashboard** (`src/pages/brewery/BreweryDashboard.tsx`): the old Home
  content (stat tiles, Active Batches, Recent Recipes grids) moved here, titled
  "Brewery Dashboard," with a PageHeader breadcrumb. Grid `storageKey`s renamed
  `rockcut:brewery:*`.
- **Nav** (`src/App.tsx`): top-level **Home** link added (expanded + collapsed
  rail); the Brewery section's first item is now **Dashboard → /brewery**
  (`DashboardIcon`).
- **Routing** (`src/App.tsx`): `/` → `<Home />` for all; `/brewery` →
  `<BreweryDashboard />` only when the user has the brewery module; new catch-all
  `*` → redirect to `/`. Removed the old `hasBrewery ? Home : landing/NoModules`
  gate, the `landing` const, and the `NoModules` component.

## Verification

- UI: `tsc --noEmit -p tsconfig.app.json` clean, ESLint clean, `vite build` OK.
- No backend change; API tests unaffected (**178 passing**).

## Follow-ups

- Fill Home with real widgets: next shift, unread messages, pending approvals
  (managers/owners), open shifts, announcements. The card grid is the seam.
