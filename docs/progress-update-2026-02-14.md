# Rockcut Progress Update — Feb 12-14, 2026

Hi Matt — here's a summary of what we built this week.

---

## The Big Picture

We went from a freshly scaffolded project to a fully functional brewing app
with a complete data model, full CRUD across every entity, formula calculations,
and an interactive formula editing system — all deployed and live on Fly.io.

**Live app:** https://rockcut-ui.fly.dev
**Login:** matt@rockcut.com / rockcut2026

---

## What Got Built

### 1. Data Model (D1)

13 database tables matching the spec we designed together:

- **Brands** — your beer lineup (name, style, target ABV/IBU/SRM, status)
- **Recipes** — versioned recipes under each brand (major.minor versioning)
- **Recipe Ingredients** — grain bill, hop schedule, yeast, adjuncts (linked to ingredient lots)
- **Mash Steps** — step mash profiles per recipe
- **Process Steps** — boil additions, fermentation notes, dry hops, etc.
- **Water Profiles** — target water chemistry per recipe
- **Ingredient Categories** — dynamic categories you can create/rename (Grain, Hop, Yeast, etc.)
- **Category Field Definitions** — custom fields per category (no code changes needed to add new categories)
- **Ingredients** — master ingredient library (Cascade, Centennial, 2-Row, etc.)
- **Ingredient Lots** — per-purchase entries with supplier, lot number, alpha acid, etc.
- **Batches** — linked to brands, with actuals (OG, FG, ABV), fermentation tracking, tasting notes
- **Brew Turns** — multi-turn fills per batch (each turn references a recipe)
- **Batch Log Entries** — timestamped log with gravity, temp, pH readings

All seeded with realistic sample data so the app feels populated out of the box.

### 2. Full CRUD APIs (D2)

94 API routes covering every entity. All endpoints are authenticated (bearer token),
return consistent JSON, and handle validation errors gracefully.

### 3. React UI with Full CRUD (D5)

Every table in the data model has a corresponding UI:

- **Brands & Recipes** — brand list, brand detail with recipe grid, recipe detail
  with tabs for Grain Bill, Mash, Process, and Water
- **Ingredient Library** — filterable by category, drill into ingredient to see lots
- **Batches** — list with status filter, batch detail with brew turns and log entries
- **Settings** — category management with custom field definitions per category
- **Dashboard** — stat cards (brands, recipes, active batches, completed) that link
  to the relevant pages

Every entity supports create, edit, and delete through form dialogs with validation.

### 4. Formula Execution Service (D6)

Backend service that runs brewing calculations on demand:

- **inventory_on_hand** — counts available lots for an ingredient
- **est_ibu** — estimated IBU using the Tinseth formula from a recipe's hop schedule
- **est_og** — estimated original gravity from a recipe's grain bill

These run in isolated processes with timeout enforcement, so a bad formula
can't take down the app.

### 5. DataGrid Formula Engine (D7)

The data grid now understands formulas. Any column can have a formula like
`=INVENTORY_ON_HAND(id)` or `=ROUND(quantity * 2.5, 1)` that evaluates
automatically:

- Hand-rolled expression parser (no external dependencies)
- Supports arithmetic, comparisons, IF conditionals, and function calls
- Built-in aggregate functions: SUM, AVG, COUNT, MIN, MAX, ROUND
- Remote function calls to the backend (e.g., IBU/OG calculations)
- Visual indicators: italic text for computed cells, "fx" badge on column headers
- 94 unit tests passing

You can see this on the **Ingredients** page ("On Hand" column) and on the
**Brand detail** page ("Est. IBU" and "Est. OG" columns in the recipes grid).

### 6. Formula Editing UX (D8)

Users can now edit formulas directly from the grid:

- Right-click or use the column menu to "Add Formula" or "Edit Formula"
- Formula editor popover with live validation and preview
- Autocomplete for function names (type "RO" and it suggests "ROUND")
- Error messages with position info ("Unexpected token at position 10")
- Save applies the formula, Clear removes it, Cancel discards changes
- 122 unit tests + 10 browser automation tests passing

### 7. UX Polish (today)

- **Dashboard cards** now navigate to their respective pages on click
- **Edit/Delete buttons** consolidated into compact icon toolbars on all
  detail pages (Brand, Recipe, Ingredient, Batch, Category)
- **Search** added above every list table — type to filter rows instantly

### 8. Deployment

Both apps deployed to Fly.io:

- **API**: rockcut-api.fly.dev (Phoenix, SQLite with persistent volume)
- **UI**: rockcut-ui.fly.dev (React SPA served by nginx)
- Auto-stop when idle, auto-start on request (keeps costs near zero)
- Database migrations run automatically on app start

---

## Bug Fixes

- **Infinite re-render loop** — the formula engine integration caused a
  performance issue on pages without formulas (grids were re-rendering
  hundreds of times per second). Found the root cause (unstable JavaScript
  object references in the render cycle) and fixed it with stable constants
  and smarter state updates. Navigation and clicks work properly now.

---

## What's Next

A few things for you to look at when you get a chance:

1. **Try the app** at https://rockcut-ui.fly.dev — poke around, add some
   real data, and let me know what feels right and what doesn't

2. **Scaffold UI spec** (`docs/spec/scaffold-ui.md`) — the proposed
   information architecture is waiting for your review before we build
   the next round of UI improvements

3. **Formula accuracy** — the IBU and OG calculations use simplified
   assumptions right now (e.g., average wort gravity of 1.050 for Tinseth).
   Good enough for estimates, but we can tune them if you want more precision

4. **Inventory tracking** — the "On Hand" column currently counts lots
   (not quantities). Real inventory quantities are planned for v2

---

## By the Numbers

| Metric | Count |
|--------|-------|
| Database tables | 13 |
| Database migrations | 13 |
| API routes | 94 |
| Unit tests (formula engine) | 122 |
| Unit tests (API) | 32 |
| Browser automation tests | 25+ |
| Deliverables completed | D1-D8 |
| Bugs in production | 0 |
