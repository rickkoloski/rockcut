# Matt Session Backlog — 2026-03-19

Feedback captured live during walkthrough with Matt.

---

## From Test Plan Walkthrough

### 1. Recipe Detail — Show calculated values in summary header
**Source:** Demo 3, Matt pointing at Recipe detail summary bar
**Request:** Duplicate the formula values (Est. OG, Est. FG, Est. IBU, Est. ABV, Est. SRM, Est. Cal) into the Recipe detail summary header bar (the one showing Version, Batch Size, Boil Time, Efficiency, Status). Matt wants to see these numbers update as he adds/edits ingredients on the Grain Bill tab below — not just on the Brand page recipe grid.
**Note:** Additive — keep them on the Brand recipe grid too.
**Aligns with:** Matt's "Brand & Recipe UI" doc — "display Calculated Values" in the top white box.

### 2. Brewhouse — Gallons in addition to BBLs
**Source:** Demo 2, brewhouse settings review
**Request:** Ensure Gallons is available as a liquid volume option alongside BBLs.
**Note:** Gallons already exists in backend enum ("gallons") — this is about display label and confirming it's selectable.

### 3. Brewhouse — Edit fields in place
**Source:** Demo 2, after viewing edit dialog
**Request:** Instead of opening a dialog to edit brewhouse settings, make fields editable in place on the detail page.
**Note:** Backlog for future UX improvement.

### 4. Brand/Recipe UI — Show which brewhouse is in effect
**Source:** Demo 3, reviewing recipe calculations
**Problem:** When a brand's brewhouse is the default, the UI showed nothing for the brewhouse field until we explicitly selected it. Matt and Rick could not tell which brewhouse was driving the calculations.
**Request:** Always display the active brewhouse name on the Brand detail and Recipe detail pages. If the brand has an explicit brewhouse_id, show that name. If not, show the default brewhouse name with a visual indicator like "(default)" so the user knows it's inherited, not explicitly chosen.
**Regression test needed:** Verify that a brand with no explicit brewhouse_id still shows the default brewhouse name in the UI.

### 5. Formulas must resolve brewhouse via brand (backend gap)
**Source:** Demo 3, investigating Test IPA (Copy) with brewhouse_id: nil
**Problem:** Formula calculations (est_og, est_ibu, est_fg, est_abv, est_srm, est_calories) do NOT reference the brewhouse at all. They hardcode unit conversions, IBU method (Tinseth), gravity assumptions (1.050), and ignore equipment values (kettle_loss, evaporation_rate, fermenter_loss). This works by accident today but will break when we implement brewhouse-aware calculations per Matt's docs.
**Required fix (two parts):**
1. **Default brewhouse resolution:** When brand.brewhouse_id is nil, formulas must fall back to the default brewhouse (is_default=true). This is not just a UI concern — the backend must resolve it.
2. **Brewhouse-aware formulas:** Calculations should read IBU calc method, density calc method, equipment losses, and UOM preferences from the resolved brewhouse. Currently all hardcoded.
**Priority:** High — this is foundational. Every calculation Matt reviewed today will need this.

---

## Pending Items (add as walkthrough continues)

