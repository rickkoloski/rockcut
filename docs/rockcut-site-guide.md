# Rockcut Brewing Co — Site Guide

A quick tour of everything in the app and how to find it.

---

## Site Map

```
Home (Dashboard)
|
+-- Brands & Recipes
|   +-- Brand Detail
|   |   +-- Recipe Detail
|   |
|   (actions: Add Brand, Duplicate Brand, Archive)
|   (recipe actions: Copy, Move to Brand, Set as Default)
|
+-- Ingredient Library
|   +-- Ingredient Detail
|       +-- Lots (sub-grid)
|
+-- Batches
|   +-- Batch Detail
|       +-- Log Entries (timeline)
|
+-- Settings
|   +-- Ingredient Categories
|   |   +-- Category Detail (field definitions)
|   |
|   +-- Brewhouses          ** NEW **
|   |   +-- Brewhouse Detail (UOM prefs + equipment values)
|   |
|   +-- Process Profiles    ** NEW **
|       +-- Profile Detail (mash/lauter/boil/ferm/crash/packaging)
|
+-- Users (admin only)
```

---

## Getting Around

### Sidebar Navigation

The left sidebar has 5 main sections (6 if you're an admin):

| Sidebar Button | What's There |
|----------------|--------------|
| **Home** | Dashboard with active batches and recent recipes |
| **Brands & Recipes** | Your beers — each brand has one or more recipe versions |
| **Ingredient Library** | All ingredients organized by category, each with lots |
| **Batches** | Brew batches with status tracking and log entries |
| **Settings** | Ingredient categories, brewhouses, process profiles |
| **Users** | (Admin only) Manage user accounts and roles |

You can collapse the sidebar with the chevron icon at the top to get more screen space. The hamburger icon brings it back.

---

## Page-by-Page Guide

### Home
Your dashboard. Shows two grids:
- **Active Batches** — batches currently in progress
- **Recent Recipes** — latest recipe activity

Click any row to jump to its detail page.

### Brands & Recipes

**Brands list** (`Brands & Recipes` in sidebar)
- Search bar at the top filters by name/style
- Archived brands are hidden by default — use the **Show Archived** toggle to see them
- Click any brand row to open it
- **Add Brand** button creates a new brand

**Brand detail** (click a brand)
- Shows brand info (name, style, targets, status)
- **Edit Brand** — update name, style, targets, status, and now also:
  - **Brewhouse** dropdown — link this brand to a brewing system
  - **Process Profile** dropdown — link to a process template (RC Ale, RC Hazy, RC Lager, or custom)
- **Duplicate Brand** (copy icon) — creates a copy with all recipes
- **Recipes** sub-grid shows all recipe versions for this brand
- Click a recipe row to drill into it

**Recipe detail** (click a recipe from a brand)
- Shows recipe info, ingredients grid, mash steps, process steps, water profile
- Toolbar buttons:
  - **Set as Default** (star icon) — marks this as the brand's default recipe. Star turns amber when active.
  - **Copy Recipe** — clones this recipe (ingredients, mash steps, process steps, water profile) as a new version within the same brand
  - **Move to Brand** — moves this recipe to a different brand
  - **Edit Recipe** — update version numbers, batch size, boil time, etc.
  - **Delete Recipe**

### Ingredient Library

**Ingredients list** (`Ingredient Library` in sidebar)
- Defaults to showing **Grain** category (use the dropdown to switch)
- Search bar filters within the selected category
- **On Hand** column shows lot count (formula column, italic text)
- Click any ingredient to see its detail

**Ingredient detail** (click an ingredient)
- Shows ingredient info + category-specific fields
- **Lots** sub-grid — specific purchases/batches of this ingredient with characteristics (alpha acid, color, gravity, etc.)

### Batches

**Batches list** (`Batches` in sidebar)
- Filter by status (Planning, Brewing, Fermenting, etc.)
- Click any batch for detail

**Batch detail** (click a batch)
- Shows batch info, brew turns, and log entry timeline
- Add log entries for tracking brew day events

### Settings

**Settings home** (`Settings` in sidebar) — three sections:

**Ingredient Categories** tab
- Lists all 8 categories (Grain, Other Consumables, Hop, Yeast, Fruit, Spice, Sugar, Adjunct)
- Note: "Extract" has been renamed to **Other Consumables**
- Click a category to manage its field definitions
- System fields (seeded by the app) show a lock icon and cannot be deleted
- You can add your own custom fields to any category

**Brewhouses** tab *(new)*
- Manages your brewing systems (e.g., Production, Pilot)
- Each brewhouse defines:
  - **UOM Preferences** — temperature (F/C), liquid volume (bbls/gal/HL/L), density (Plato/SG), alcohol (ABV/ABW), calc methods (PPG/CGAI, Tinseth/etc.), ingredient weight/volume units
  - **Equipment Values** — kettle turn size, evaporation rate, kettle loss, fermenter loss
- Your "Production" brewhouse is pre-configured with standard American units
- Brands can be linked to a brewhouse so they inherit its unit preferences

**Process Profiles** tab *(new)*
- Reusable process templates that define how a beer style is brewed
- Three profiles are pre-loaded: **RC Ale**, **RC Hazy**, **RC Lager**
- Each profile covers 6 brewing phases:
  - **Mash** — type (single infusion/step/decoction), water volumes, pH, schedule
  - **Lauter** — vorlauf, type, temperature, water volume, pH
  - **Boil & Post-Boil** — duration, coolpool, whirlpool, knockout
  - **Fermentation** — lag, primary, secondary, diacetyl rest (temp + duration for each)
  - **Cold Crash** — single or step crash with temps and durations
  - **Packaging** — transfer type, bright tank temp/duration, CO2 volumes
- Brands can be linked to a process profile to use it as their default process

### Users (Admin Only)
- Create and manage user accounts
- Assign roles (admin or user)
- Deactivate users or reset passwords

---

## Quick Reference: New Features

| Feature | Where to Find It |
|---------|-----------------|
| Brewhouse settings | Settings > Brewhouses tab |
| Process profiles | Settings > Process Profiles tab |
| Link brand to brewhouse | Edit Brand dialog > Brewhouse dropdown |
| Link brand to profile | Edit Brand dialog > Process Profile dropdown |
| Duplicate a brand | Brand detail page > copy icon in toolbar |
| Copy a recipe | Recipe detail page > Copy Recipe button |
| Move recipe to another brand | Recipe detail page > Move to Brand button |
| Set default recipe | Recipe detail page > star icon |
| Archive a brand | Edit Brand dialog > Status dropdown > Archived |
| Show archived brands | Brands list > Show Archived toggle |
| Default to Grain tab | Ingredient Library (automatic) |
| System field protection | Settings > any category > lock icon on system fields |
