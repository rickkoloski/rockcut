# D60: Grain catalog and inventory — Spec

**Status:** APPROVED by Matt 2026-11-17 (scoped, Q1–Q3 answered and categories revised the same day)
**Backlog:** PortableMind project 254 — 3843 (reference specs off lots), 4982 (comma decimals),
5203 (dropdown labels, ingredient screens), 4084 (lint, ingredient screens)
**Concept:** 12_ingredients (new)
**Series:** D60 grains + inventory → D61 purchasing and malt contracts → D62 hops, yeast and the
other ingredients on the same model → D63 recipes on maltster products, brew-day drawdown,
inventory after planned batches, °Plato (4987), batch-log time (4986), the rest of 4989/5203

---

## 1. Why

The brewing side hasn't been touched since D28. On prod a grain is only a name: every spec number
(color, extract, protein, moisture, diastatic power) lives on `ingredient_lots`, and prod has no
lots. Nothing records how much grain is on hand.

D60 rebuilds grains on Len Silverston's *Universal Data Model* patterns, applied selectively
(decision 3): **product, product category, product feature with unit of measure, party and party
role, supplier product, inventory item and lot, UOM conversion**. Grains are first; D62 moves the
other ingredients onto the same model.

## 2. Decisions (Matt, 2026-11-17)

1. D60–D63 split as above. Ingredients first, grains first.
2. Drop the Grains custom fields **Origin** and **Maltster** (definitions only; no screen ever
   stored a value).
3. Apply Silverston's patterns selectively, not the whole generic model.
4. A **grain** is a product ("2-Row"). What a recipe calls for (D63) is a **maltster product**
   ("Rahr 2-Row"). Maltster products of one grain are not substitutes; no substitutions are
   recorded.
5. Grain categories: **Base, Crystal/Caramel, Kilned, Specialty, Roasted.** No "Adjunct" category
   (the word means too many things in beer today); flaked and torrified grains are Specialty.
   Kilned holds the darker kilned malts. Wheat and rye go by how they're malted (pale wheat =
   Base, Midnight Wheat = Roasted).
6. Five features, each stored in one unit:

   | Feature | Stored as | Can be entered as |
   |---|---|---|
   | Extract | % fine grind, dry basis (FGDB) | FGDB, as-is %, PPG |
   | Color | °Lovibond | °L, SRM, EBC |
   | Diastatic power | °Lintner | °Lintner, °WK |
   | Protein | % | % |
   | Moisture | % | % |

   No potential-as-SG, must-mash or max-% field.
7. **Standard specs** live on the maltster product. A lot copies them when it's created and can be
   changed per lot. (Hops will require per-lot values: D62.)
8. Parties: suppliers are mainly BSG and Root Shoot, others possible; about 10 maltsters in regular
   use. Root Shoot is both.
9. Grain comes in **sacks**; sack size varies by maltster and product (55 lb common, 50 lb
   happens). **Milled and whole are one product and one stock**; how we order it is recorded on
   the supplier offer. Prices are stored per supplier, with history.
10. **On-hand inventory** with movements: an opening amount, receipts, use in brewing, trades and
    loans with other breweries (movement only, no "owed" balance), and periodic counts. One
    location.
11. On-hand shows as **sacks + loose lb** ("12 sacks 22.5 lb") or **total lb** ("682.5 lb"), a
    toggle.
12. **Who:** everything in D60 is open to any Brewery member (owners included). The brewhouse
    device does none of it. (Contracts in D61 are owners and Brewery managers.)

Carried to later deliverables: orders, receiving and contracts (D61, decisions 16–17, 23–29 of the
scoping list); inventory after planned Gantt batches with "short on Galactic Portal - P3" (D63; a
Gantt batch has a brand and volume but no recipe today).

## 3. Data model

Names are working names for planning.

### 3.1 Categories (Product Category + rollup)

- `ingredient_categories.parent_id` (nullable). Grains gets five children (decision 5); a grain
  belongs to one child. The ingredient list and filters treat a parent as including its children.
- Settings → Categories shows the children under Grains; they can be added and renamed there.
- The 38 grains on prod get a child category by the mapping in Appendix A.
- `category_field_definitions` rows **Grains / Origin** and **Grains / Maltster** are deleted by
  migration on every environment and no longer seeded. The other categories' custom fields stay
  until D62.

### 3.2 Parties (Party + Party Role)

- `parties`: name (unique), notes, active.
- `party_roles`: party, role ∈ `maltster`, `supplier`, `partner_brewery`. A party can hold several.
- One page, **Brewery → Ingredients → Companies**, lists them with role chips; add, edit, deactivate.
  A party in use can't be deleted, only deactivated. Contact details are out of scope.

### 3.3 Grains and maltster products (Product)

- `ingredients` stays the **grain** ("2-Row", "Pilsner"), with name, child category and notes.
- `ingredient_products` (**maltster product**): grain, maltster (a party with the maltster role),
  optional product name (the maltster's own name, e.g. "Rauch Malt", "Carafa 3 Special"), notes,
  active. Shown as "Weyermann Pilsner" or "Weyermann Rauch Malt (Beech Smoked Malt)". Unique on
  grain + maltster + product name.
- A grain with no maltster products is allowed (a name in the catalog, as on prod today).

### 3.4 Features (Product Feature, applicability, UOM)

Features are data, not columns, so D62 can add hop and yeast features without a migration:

- `feature_types`: key (`extract_fgdb`, `color_lovibond`, `diastatic_power_lintner`,
  `protein_pct`, `moisture_pct`, and `alpha_acid_pct`, `attenuation_pct` for D62), label, unit
  label, min, max, decimals.
- `category_feature_types` (applicability): category, feature type, sort order, required. Applies
  to the category and its children. Grains: the five features, none required.
- `product_feature_values`: maltster product, feature type, value — the **standard** specs.
- `lot_feature_values`: lot, feature type, value — the lot's specs. Created from the standard
  when the lot is created; a value that differs from the standard is marked in the UI.
- Both value tables also keep `entered_value` and `entered_unit` when a conversion was used, so
  the screen can say "81.2 % FGDB · entered as 37.5 PPG".
- Ranges move from `IngredientLot`'s `validate_range` calls to the feature types:
  extract, protein, moisture 0–100; color and diastatic power 0–1,000 (as today).

**Migration:** every existing lot's `color_lovibond`, `extract_potential_fgdb`, `protein_perc`,
`moisture_perc`, `diastatic_power_linter`, `alpha_acid` and `attenuation` are copied into
`lot_feature_values`, then the columns are dropped. Prod has no lots. `est_og` and `est_ibu`
(`Formulas.Functions.BrewingCalcs`) read lot feature values instead of the columns.

### 3.5 Conversions (UOM Conversion)

A **convert** button beside Extract, Color and Diastatic power opens a small popup: pick the unit,
type the value, see the stored value, **Use**. The popup computes; the API stores the canonical
value plus `entered_value`/`entered_unit`.

| From | To stored | Formula |
|---|---|---|
| As-is % | % FGDB | as-is ÷ (1 − moisture ÷ 100); uses the moisture on the same form (required for this conversion) |
| PPG (dry basis) | % FGDB | PPG ÷ 46.214 × 100 |
| SRM | °L | (SRM + 0.76) ÷ 1.3546 |
| EBC | °L | (EBC ÷ 1.97 + 0.76) ÷ 1.3546 |
| °WK | °Lintner | (°WK + 16) ÷ 3.5 |

The formulas live in one UI module (`src/lib/brewingUnits.ts`) with unit tests. `est_og`'s PPG
factor (today `fgdb × 0.46`) uses the same 46.214 constant on the API side.

### 3.6 Supplier offers and prices (Supplier Product)

- `supplier_offers`: maltster product, supplier (a party with the supplier role), order name (the
  supplier's catalog name, e.g. "Rahr - Standard 2-row"), **sack size in lb** (decimal), **form we
  order: milled or whole**, notes, active. A product can have several offers (BSG and Root Shoot).
- `supplier_offer_prices`: offer, **price per sack ($)**, effective date, note, who entered it.
  The current price is the latest effective on or before today. Changing the price adds a row;
  history is shown newest first with $/lb worked out. (D61's contracts add rows here.)

### 3.7 Lots and inventory (Inventory Item + Lot)

- `ingredient_lots` gains: maltster product (required for grains), supplier (party, replacing the
  text `supplier`), **sack size in lb** (copied from the offer, editable). `maltster` (text),
  `order_name`, `order_unit_size` and `properties` are dropped after their values are copied
  (order name and sack size into an offer where a match exists; prod has no lots).
- `inventory_movements`: lot, kind, quantity in lb (signed), date, partner brewery (for trades
  and loans), note, who entered it. Kinds:

  | Kind | Sign | Notes |
  |---|---|---|
  | Opening amount | + | stock already here when the lot is entered |
  | Received | + | until D61, entered by hand; D61 creates it from receiving an order |
  | Used in brewing | − | by hand until D63 automates it from brew day; optional note (batch) |
  | Traded out / Loaned out | − | partner brewery required |
  | Traded in / Loaned in | + | partner brewery required |
  | Count adjustment | ± | made by a count (§3.8) |

- **On hand** = the sum of a lot's movements; a product's on hand = the sum of its lots. A
  movement that would take a lot below 0 is refused (422) with the lot's on-hand in the message.
- Lot status: `available` / `depleted` follow on-hand (0 → depleted, above 0 → available);
  `expired` stays a manual choice (Matt, 2026-11-17, at Stage 2: no best-by date; a brewer marks
  a lot Expired when it's stale or damaged, and can set it back). **Oldest first skips expired
  lots** (outgoing movements and total-count shortfalls); a brewer can still pick an expired lot
  by hand, and a by-lot count includes it. On-hand shows expired stock separately
  ("682.5 lb · 55 lb expired").
- Quantities are **entered as sacks + lb or total lb** (same toggle as the display) and stored as
  lb. Sacks use the lot's sack size.
- A lot can be deleted only while it has just its first movement and no recipe uses it.
  Movements can't be edited; a wrong one is undone with an opposite movement or a count.

### 3.8 Counts

**Oldest lots first** (Matt, Q1): stock leaves in received-date order (then lot id).

- **Outgoing movements** (Used in brewing, Traded out, Loaned out) are entered against the
  maltster product with **Lot: Oldest first** as the default; the API takes the quantity from the
  oldest lot with stock, then the next, writing one movement per lot it touches. The brewer can
  pick one lot instead.
- **Count** on a maltster product: by default the brewer enters **one total**; the difference
  from on-hand is a count adjustment taken from the oldest lots first (a shortfall) or added to the
  newest lot (an overage). **Count by lot** switches the screen to one box per lot (with its
  on-hand), for when the brewer can see which lot the difference came from; saving writes an
  adjustment for every lot whose number differs. Either way, all adjustments share the count date.

### 3.9 Display toggle

Sacks + lb vs total lb is per person, saved on the account (like the Gantt's Label by, kept in
`Accounts.BoardSettings`), and
applies to every on-hand number and quantity entry.

## 4. Screens

All under **Brewery → Ingredients**, Brewery members and owners only, as today.

1. **Grains list:** grouped by child category (collapsible), one row per maltster product, with
   grains that have no products shown on their own row. Columns: grain, maltster, color °L,
   extract % FGDB, diastatic power, protein, moisture, on hand, suppliers with current $/sack.
   Search; filter by category, maltster, supplier, "on hand only". The toggle (§3.9) in the
   toolbar.
2. **Maltster product page:** standard specs (edit, with the convert buttons); supplier offers
   (order name, sack size, milled/whole, current price, price history, add price); lots (lot #,
   received, supplier, on hand, specs that differ from standard marked); movement history; actions
   **Add lot**, **Record movement**, **Count**.
3. **Grain dialog:** name, category (child of Grains), notes. **Maltster product dialog:** grain,
   maltster, product name, standard specs.
4. **Add lot:** supplier offer (sets supplier and sack size), lot #, received date, quantity, kind
   (Opening amount / Received), specs prefilled from the standard and editable.
5. **Record movement:** kind, lot (Oldest first by default for outgoing kinds, §3.8), quantity,
   date, partner brewery when needed, note.
6. **Companies page** (§3.2).
7. Phone width: the list becomes cards (product, on hand, color, extract); dialogs full screen.

The existing recipe Grain Bill dialog keeps picking a lot (category → ingredient → lot) until D63;
its lot labels show the maltster and lot #.

## 5. Brewing backlog in D60

- **4982** — every number box on the ingredient screens uses one shared decimal input
  (`type="text" inputMode="decimal"`), accepting `,` or `.` as the decimal point and refusing
  anything else with a message. D63 reuses it for recipes and batches.
- **5203** — `IngredientLotDialog` Status, `IngredientsList` Category filter,
  `IngredientFormDialog` Category get `id`/`labelId` (or are replaced by the new screens with
  labelled controls). The batch dialogs stay for D63.
- **4084** — the ingredient pages and dialogs leave with no lint errors.
- **3843** — done by §3.3–3.4 and Appendix B.

## 6. Data on prod

- The 38 grains get child categories (Appendix A).
- **Seed reference data** (Matt, Q2) from the old D28 seed (`grain_lots_raw`, commit `f6d507f`),
  with Appendix B's corrections, on every environment: 8 parties, 44 maltster products with
  standard specs, and their supplier offers (order name, sack size, milled when the order name
  says "(milled)"). No prices, no lots, no inventory. Matt verifies the data before the brewery
  starts using it; it's editable on the screens.

## 7. Release

- Migrations add the tables above, copy and drop the lot columns, assign categories and delete the
  two custom fields. Rollback past them needs the pre-release snapshot (as D55).
- No device, notification or schedule changes.

## 8. Open questions

All answered (Matt, 2026-11-17): Q1 → §3.8 (oldest lots first; Count by lot available),
Q2 → §6 and Appendix B (seed it; Matt verifies before use), Q3 → Appendix A (Malted Oats is Base).

## 9. Persona scenarios

- As `brewer1` from Brewery → Ingredients, add maltster product "Rahr 2-Row" under 2-Row with
  standard specs, entering color as 3.0 SRM; the page shows 2.78 °L "entered as 3.0 SRM" (color has 2 decimals, Matt 2026-11-18).
- As `brewer1`, add a BSG offer for Rahr 2-Row (55 lb, milled, $48.50/sack); change the price to
  $51.00 from next month; today's price stays $48.50 and the history shows both.
- As `brewer2`, add a lot of Rahr 2-Row with an opening amount of 12 sacks; extract shows the
  standard; change its moisture; the lot shows moisture marked as changed and the product's
  standard is unchanged.
- As `brewer2`, enter extract as 37.0 PPG on a lot; it stores 80.1 % FGDB. Enter extract "as-is"
  with no moisture; the popup asks for moisture first.
- As `brewer1` with the toggle on sacks + lb, record "Used in brewing" of 2 sacks 10 lb; on hand
  shows 9 sacks 45 lb; switch to total lb and it shows 540 lb; `brewer2`'s toggle is unaffected.
- As `brewer1`, record "Loaned out" of 3 sacks to a partner brewery; with no partner brewery
  chosen the dialog refuses. Record a use larger than on hand; it's refused with the on-hand.
- As `brewer1`, with two Rahr 2-Row lots (older 3 sacks, newer 10 sacks), record "Used in
  brewing" of 5 sacks with Oldest first; the older lot goes to 0 (Depleted) and the newer to 8
  sacks, as two movements. Record 1 sack from the newer lot by choosing it.
- As `breweryMgr`, count Rahr 2-Row as one total 2 sacks under on-hand; the adjustment comes off
  the oldest lot with stock. Then **Count by lot**: one lot 8 sacks, the other 0; adjustments are
  written for both, the empty lot shows Depleted, the history shows the count.
- As `floater` (Taproom and Brewery employee), the Ingredients pages work. As `splitRole`
  (Taproom manager, Brewery employee), likewise.
- As `bartender1`, Brewery → Ingredients isn't in the nav, `/ingredients` shows the usual "not
  available", and `GET /api/ingredient_products` returns 403. As `breweryDevice`, the API
  returns 403 for every D60 route.
- As `owner`, add "Weyermann" with roles maltster and supplier on the Companies page; try to delete
  Rahr (in use) and get "deactivate instead".
- As `brewer1` at 360 px, the Grains list shows cards with no sideways scroll; Add lot is full
  screen; typing `5,2` in moisture saves 5.2.
- Settings → Categories: Grains shows five children; Grains' field definitions list no Origin or
  Maltster.
- Recipe Grain Bill (unchanged flow): add a grain lot to a recipe; the lot label shows "Rahr ·
  lot #"; `est_og` gives the same result as before the feature migration for the same numbers.

## Appendix A — categories for the 38 grains (approved by Matt, 2026-11-17)

- **Base:** 2-Row, English Pale, Maris Otter, Pilsner, Pilsner-Barke, Vienna Malt, Munich 4,
  Munich 10, Munich Barke, Munich Malt 1, Munich Malt 2, Wheat, Extra Pale, Wheat, White,
  Wheat, Munich, Rye Malt, Oats, Malted
- **Crystal/Caramel:** Caramunich 1, Caramunich 2, Caramunich 3, CaraRed, CaraRuby, Crystal Light
  (36L-43L), Crystal Medium (63L-72L), Crystal Dark (94L-107L), Special B, Dextrin
- **Kilned:** Biscuit, Melanoidin Malt, Honey Malt
- **Specialty:** Acidulated, Beech Smoked Malt, Oats, Flaked, Wheat, Torrified
- **Roasted:** Barley, Roasted, Black Malt, Chocolate Malt, Carafa 3 - dehusked, Brown Malt

Malted grains (oats, wheat, rye) are Base; flaked and torrified grains are Specialty. Kilned is
the darker kilned malts (Biscuit ~18 °L, Melanoidin ~29 °L, Honey ~33 °L); the pale ones that
aren't base malts (Acidulated ~2 °L, Beech Smoked ~2.5 °L) are Specialty.

## Appendix B — reference data and corrections (Matt, 2026-11-17)

From `grain_lots_raw` (44 rows); the old lot numbers are not used:
- Maltsters: Rahr, Root Shoot, Weyermann, Simpsons, Crisp, **Dingemans** (the "Dingmans" row is
  corrected), Grain Millers. Suppliers: BSG, Root Shoot ("RS").
- **Brown Malt is Crisp**; its order name becomes "Crisp - Brown Malt".
- Diastatic power **0** for specialty malts is correct and stored as 0; Malted Oats' blank stays
  blank.
- Root Shoot rows have no order name; sack size 50. BSG rows 55 (Grain Millers oats 50).
- Some grain names carry the maltster's product (Pilsner-Barke, Munich Barke, Munich Malt 1/2 are
  Weyermann products); they'd stay grains with one maltster product each unless renamed.
- The specs are 2026-crop lot values, used here as standards.
