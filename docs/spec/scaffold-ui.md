# Rockcut Scaffold UI Specification

> **Status:** PROPOSED — Awaiting Matt's review
>
> **Scope:** First-pass scaffold UI surfacing all CRUD data through a
> coherent Information Architecture. Functional, not polished.

---

## Information Architecture

```
Home (Dashboard)
├── Active batches (status badges)
├── Recent recipes
└── Counts: brands, recipes, batches

Brands & Recipes (primary workspace)
├── Brands list (DataGrid)
└── Brand detail
    ├── Brand info (editable)
    └── Recipes table
        └── Recipe detail (tabbed)
            ├── Grain Bill (recipe ingredients by category)
            ├── Mash (mash steps)
            ├── Process (fermentation process steps)
            └── Water (water profile)

Ingredient Library
├── Ingredients list (DataGrid, filterable by category)
└── Ingredient detail
    ├── Ingredient info (editable)
    └── Lots table (lot number, supplier, status, calc fields, properties)

Batches
├── Batches list (DataGrid, filterable by status)
└── Batch detail
    ├── Batch info (brand, blended actuals, fermentation, packaging, tasting)
    ├── Brew turns table (turn number, recipe version, brew date, per-turn actuals)
    └── Log entries timeline (chronological, type badges)

Settings
├── Categories list (DataGrid)
└── Category detail
    ├── Category name/sort order (editable)
    └── Field definitions table (CRUD)
```

### Key Model Concept: Batches & Brew Turns

Matt's fermenters are larger than his brew kettle. Filling one fermenter
may require 2-3 mash+boil sessions ("brew turns"). The model reflects this:

- **Batch** = the fermenter fill (the final beer). Links to a **brand**.
- **Brew Turn** = one mash+boil session. Links to a **recipe version**.
  Each turn has its own brew date, OG, volume, and efficiency.
- Batch-level actuals are the blended result in the fermenter.
- Single-turn batches work identically — just one turn.

### Navigation

Left sidebar (replaces current nav items):

| Nav Item | Icon | Route |
|----------|------|-------|
| Home | HomeIcon | `/` |
| Brands & Recipes | ScienceIcon | `/brands` |
| Ingredient Library | InventoryIcon | `/ingredients` |
| Batches | AssignmentIcon | `/batches` |
| Settings | SettingsIcon | `/settings` |

UI Components nav item removed (dev tool, not for production).

### Drill-Down Pattern

Every section follows: **List → Detail → Sub-sections**

- Lists use MUI DataGrid with clickable rows
- Detail pages use standard layout with editable fields
- Sub-sections use tabs (recipes) or inline tables (lots, field definitions, brew turns)
- Back navigation via breadcrumbs or browser back

### Routes

```
/                                   Home (dashboard)
/brands                             Brands list
/brands/:id                         Brand detail + recipes table
/brands/:brandId/recipes/:id        Recipe detail (tabbed)
/ingredients                        Ingredients list
/ingredients/:id                    Ingredient detail + lots table
/batches                            Batches list
/batches/:id                        Batch detail + brew turns + log entries
/settings                           Settings (categories list)
/settings/categories/:id            Category detail + field definitions
```

---

## Scaffold Strategy

### What we're building
- DataGrid for every list view (sortable, filterable, clickable rows)
- Detail pages with simple forms for create/edit
- React Router for all navigation (proper URLs, bookmarkable)
- Consistent layout: list → detail → sub-sections

### What we're NOT building (yet)
- Calc engine (OG/FG/IBU/SRM estimates)
- Recipe versioning logic (auto-bump on edit)
- Drag-and-drop reordering
- Search / full-text filtering
- Mobile-optimized layouts
- Theming / visual polish

### Tech approach
- MUI DataGrid for lists
- MUI Tabs for recipe sub-sections
- React Router nested routes
- Axios API calls via existing `src/lib/api.ts`
- Dialog-based create/edit forms (keeps list visible behind)

---

## Open Questions for Matt

1. Does this navigation structure match how you think about your workflow?
2. Any sections feel out of place or missing?
3. Is Brands & Recipes the right primary workspace, or do you spend
   more time in the Ingredient Library or Batches?
4. Any design challenge or concern before we start building?
