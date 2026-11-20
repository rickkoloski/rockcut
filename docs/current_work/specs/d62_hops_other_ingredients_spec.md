# D62: Hops, fruit, spices, sugars and other consumables — Spec

**Status:** APPROVED (Matt, 2026-11-19; assumptions A1–A7 confirmed)
**Backlog:** 5911 (O9 flake in `ingredients/owner.spec.ts`), deferred register DR-1 (close) and
DR-4 (units), the `inventory_on_hand` formula's unit
**Concept:** 12_ingredients
**Series:** D60 grains + inventory (`v2026.11.18`) → D61 purchasing and malt contracts
(`v2026.11.19`) → **D62 hops and the other ingredients** → D64 yeast (harvests, generations,
counts) → D63 recipes on products, brew-day drawdown, planned inventory, °Plato (4987), batch-log
time (4986), the rest of 4989/5203, the last 8 lint errors (4084)

---

## 1. Why

D60 and D61 built the catalog, inventory, purchasing and contracts for grain only. Every other
ingredient is still a name with loose lots: no products, no manufacturer, no supplier offers or
prices, no on-hand, no orders. Those lots have no quantity, so nothing knows how many hops are in
the cooler.

D62 puts **hops, fruit, spices and flavorings, sugars and extracts, and other consumables** (water
salts, acids, fining agents) on the same model. It keeps Len Silverston's *Universal Data Model*
concepts, applied selectively as in D60 (decision 3 there):

- **Product**, defined independently of who sells it.
- **Party Role**, with a general **manufacturer** role.
- **Supplier Product** (the offer), with a **pack** per offer.
- **Product Feature** and its unit of measure.
- **Inventory Item / Lot**, with movements.
- **Order**, and **Agreement** (the contract).

Grain keeps working exactly as it does today. Its "sack" becomes one kind of pack.

Yeast is **D64** and is untouched here. Recipes, brew-day drawdown and recipe units are **D63**.

## 2. Decisions (Matt, 2026-11-19)

**Scope**
1. Categories: Hops, Fruits, Spices & Flavorings, Sugars and Extracts, Other Consumables
   (fining agents, water salts, acids). Cleaning chemicals, CO2 and packaging are out. The
   **"Future Ingredients"** category is removed.
2. D61 purchasing applies to every D62 ingredient: orders, receiving, minimum on hand, To order
   and Totals.
13. Permissions are the same as grain: Brewery members and owners. Devices are refused.

**Products and manufacturers**
4. A hop product is **variety + form**, e.g. Citra pellet.
11. Each product has **one unit**. Strawberry Purée (gal) and Strawberry Whole (lb) are **two
    products under one ingredient "Strawberry"**. Dry and liquid sugars work the same way.
17. **Manufacturer and supplier are separate fields, always stored**, even when they're the same
    company:
    - The manufacturer is part of what the product *is*. "Citra Pellet · Yakima Chief" and
      "Citra Pellet · Hopsteiner" are different products, as Rahr 2-Row and Root Shoot 2-Row are.
    - The supplier is on the **offer** and on every **lot**.
    - One product can have several supplier offers. Stock of one product is pooled, and it can
      be filtered and grouped by supplier.
    - (Option (b), Silverston's Product / Supplier Product split, confirmed by Matt.)
8. Hop **Origin** is a product detail. The old custom fields go: Form moves to the product,
   Crop Year to the lot.
20. Hop products carry **typical alpha, beta and total oil ranges** as product features (as
    D60's standard specs). The lot holds the actual values.

**Lots**
5. A hop **lot** has alpha, beta, total oil and **crop year**. A lot has one crop year; several
   lots can share a crop year.
12. **Brix is per lot**, like hop alpha.
22. Brix is **optional** on any fruit lot (whole or purée). It's never required.
7. / 21. **Every D62 category is expired by hand** (no best-by dates), as grain.

**Units and packs**
9. **Packs per offer.** Each supplier offer has a pack: a name and a size in the product's
   unit, e.g. "box · 11 lb", "bag · 50 lb", "pail · 5 gal". Orders, minimum on hand and To
   order count in **packs**, generalizing D61's sacks. Inventory is kept in the product's unit.
6. / 15. Hops are always **11 lb boxes**. A 22 or 44 lb box is entered as 2 or 4 boxes;
   brewers do that translation. Inventory and recipes are in **decimal lb**.
10. Units by category:
    - **Fruit:** gallons (purée) or by weight (whole), with Brix.
    - **Spices:** dry oz.
    - **Sugars:** dry in decimal lb with extract % FGDB, or liquid in gallons with Brix.
    - **Salts:** ordered and stored in **lb** (18). Recipes use dry oz, converted in D63.
19. Acids and liquid finings are in **fl oz**, ordered by the jug or bottle. Tablets are a
    **count** ("each"), ordered by the tub. Matt may refine these later.

**Contracts**
3. / 16. Hop contracts are planned the **same as grain: annual, one per supplier per year**. A
    hop contract line is in **lb** (weight); grain lines stay in sacks. **Contracts are grain
    and hops only.**
15. A supplier's **order target counts packs**, whatever their size (as D61 counted sacks).

**Reference data**
14. Matt's spreadsheet of hops, fruits, sugars and salts is the reference data (§7). Ask for it
    when the spec is approved.

## 3. Data model

Working names for planning. Grain-specific names from D60/D61 are generalized here.

### 3.1 Categories

- **Hops**, **Fruits**, **Spices & Flavorings** and **Sugars and Extracts** stay top-level
  categories with no children.
- **Other Consumables** gets three children: **Water Salts**, **Acids**, **Finings**. They can be
  added to and renamed in Ingredient Library → Categories, as Grains' children can.
- **Future Ingredients** is deleted by the migration if it holds no ingredients. If it holds
  some, it stays, and the release notes list them so Matt can move them.
- The old `category_field_definitions` for these categories (Hops: Form, Origin, Crop Year;
  Fruits, Spices & Flavorings, Sugars and Extracts: Form) are deleted and no longer seeded, as
  D60 did for Grains. No screen ever stored a value for them (D60 dropped `properties`). **Add
  field** is hidden on these categories, as on Grains.
- Yeast Strains keeps its custom fields and old lot screens until D64.

### 3.2 Parties: the manufacturer role

- The `maltster` party role becomes **`manufacturer`**. Existing rows are migrated, and
  `ingredient_products.maltster_party_id` becomes `manufacturer_party_id`.
- Grain screens keep the word **"Maltster"**. Every other screen, and the Companies page chip,
  says **"Manufacturer"**.
- Roles: `manufacturer`, `supplier`, `partner_brewery`. A party can hold several; Root Shoot is
  both.
- D64 adds a yeast-lab role (or treats labs as manufacturers; decided there).

### 3.3 Products (Product)

- `ingredients` stays the general item: the hop variety ("Citra"), the fruit ("Strawberry"), the
  salt ("Calcium Chloride").
- `ingredient_products` (D60's maltster products, generalized) gains:
  - **`form`**: required for D62 categories, from a fixed list per category (§3.6). Grain
    products have none; D60's milled/whole stays on the offer.
  - **`unit`**: required, from the category's allowed units (§3.6). Grain products are `lb`, set
    by the migration. It can't change once the product has a lot.
  - **`origin`**: optional text, shown for hops ("USA", "New Zealand").
- **Unique** on ingredient + manufacturer + form + product name. Shown as:
  - "Yakima Chief Citra Pellet"
  - "Oregon Fruit Strawberry Purée"
  - "Hopsteiner Citra Pellet (Lupomax)", with a product name
  - Grain names are unchanged ("Weyermann Rauch Malt (Beech Smoked Malt)").
- The manufacturer is **required** on every product. When the manufacturer is also the
  supplier, the same party holds both roles.

### 3.4 Features: ranges, lot-only features, crop year

New feature types:

| Key | Label | Unit | Range | Decimals | Applies to |
|---|---|---|---|---|---|
| `alpha_acid_pct` (exists) | Alpha acid | % | 0–100 | **2** | Hops |
| `beta_acid_pct` | Beta acid | % | 0–100 | **2** | Hops |
| `total_oil_ml_100g` | Total oil | mL/100 g | 0–10 | 2 | Hops |
| `brix` | Brix | °Bx | 0–100 | 1 | Fruits; liquid sugars |
| `extract_fgdb` (exists) | Extract | % FGDB | 0–100 | 1 | Grains; dry sugars |

- **`alpha_acid_pct` keeps its key.** `est_ibu` already reads it from the recipe line's lot, so
  the IBU estimate keeps working with D62's hop lots.
- **Where a feature lives**, per category (`category_feature_types` gains these settings):
  - **Hops:** alpha, beta and oil are a **range on the product** (low–high, the typical spec)
    and a **single actual on the lot**. A new hop lot does *not* copy the range. The brewer
    enters the actuals from the supplier's sheet, with the range shown beside each box.
    **Alpha is required on a hop lot** (the IBU estimate needs it); beta and oil are optional.
  - **Brix:** **lot only**, optional (decisions 12, 22). Shown for Fruits, and for Sugars and
    Extracts products in gal.
  - **Extract on dry sugars:** works like grain. A standard on the product, copied to the lot,
    editable. Shown for Sugars and Extracts products in lb.
  - Spices & Flavorings and Other Consumables: no features.
- A product range is stored as `product_feature_values.value` (low) plus a new nullable
  `value_high`. Grain standards keep a single value.
- **Crop year** is a lot column (`crop_year`, a four-digit year from 2000 through next year),
  **required on hop lots**, shown nowhere else.

### 3.5 Packs (Supplier Product)

D61's sacks generalize to packs. The grain behavior is unchanged: a grain offer's pack is
"sack · 55 lb".

| Today (D60/D61) | D62 |
|---|---|
| `supplier_offers.sack_size_lb` | `pack_name` (sack, box, bag, pail, jug, bottle, tub, case, each) + `pack_size` (in the product's unit) |
| `ingredient_lots.sack_size_lb` | `pack_name` + `pack_size`, copied from the offer |
| `inventory_movements.quantity_lb` | `quantity`, in the product's unit |
| `inventory_movements.unit_cost_per_lb` | `unit_cost`, per product unit |
| `parties.order_target_sacks` | `order_target_packs` |
| `ingredient_products.min_on_hand_sacks` | `min_on_hand_packs` |
| `purchase_order_lines.sacks_ordered` / `sacks_received` / `price_per_sack` | `packs_ordered` / `packs_received` / `price_per_pack` |
| `supplier_offer_prices.price_per_sack` | `price_per_pack` |
| `supplier_contract_lines.sacks` / `price_per_sack` | `quantity` / `price` (§3.7) |

- **Hops:** a hop offer's pack is always **box · 11 lb**. It's set and can't be edited (decision
  6).
- Other offers: the pack name comes from the list above and the size is free (> 0, in the
  product's unit). The defaults depend on the unit: lb → bag, gal → pail, fl oz → jug,
  oz → bag, each → tub.
- `each` products are whole numbers everywhere: on hand, movements, counts and pack sizes.
- Everything D61 computes in sacks now computes in packs: the running total and order target
  ("36 of 40 packs"; grain-only orders still say "sacks"), receiving, To order, the
  "previous lot" rule (same pack size, A3), and Oldest first.
- **Quantity display** (D60 §3.9, per person): "sacks + lb" becomes **"packs + unit"**, e.g.
  "3 boxes 4.5 lb", "2 pails 1.5 gal", "12 sacks 22.5 lb". "Total lb" becomes **"total in
  unit"**, e.g. "37.5 lb", "11.5 gal". The saved setting migrates `sacks` → `packs`.

### 3.6 Forms and units per category

| Category | Forms | Units allowed |
|---|---|---|
| Hops | **T90 Pellet**, Cryo, Whole leaf, Extract | lb |
| Fruits | Purée, Whole, Juice / concentrate | gal, lb |
| Spices & Flavorings | Whole, Ground, Extract | oz, fl oz |
| Sugars and Extracts | Dry, Liquid | lb (dry), gal (liquid) |
| Water Salts | Powder, Flake | lb |
| Acids | Liquid | fl oz |
| Finings | Liquid, Powder, Tablet | fl oz, lb, each |

- Forms and units are fixed lists in code for D62. Matt may change them after use (decision 19).
- A Sugars product's form decides its unit: Dry → lb, Liquid → gal.
- Units are labeled lb, gal, oz (dry weight), fl oz, each. They are not converted into each
  other in D62; recipe conversions (oz ↔ lb, salts in oz) come in D63.

### 3.7 Contracts: hops in lb

- A contract (one per supplier per year, D61 A1) can have **grain lines in sacks** and **hop
  lines in lb**. Only grain and hop products can be added.
- A hop line has **lb** and a **price per lb**. Saving it writes the offer's price history as a
  **price per box** (price per lb × 11), effective as D61 A2. A past-year contract writes none.
- A hop line counts on order and received **by weight**: boxes × 11 lb. Remaining and over are
  shown in lb. The **Shortfall** view shows each line in its own unit.
- Contract totals show sacks and lb separately, and $ combined.

### 3.8 Inventory, value and totals

- On hand, movements, counts (total or by lot, Oldest first, "Counted, no change"), Expired by
  hand, trades and loans: **unchanged rules, in the product's unit**.
- **Lot value** = on hand × the lot's most recent costed receipt's unit cost (D61 A4). With
  none, it uses the supplier offer's current price ÷ pack size, marked **estimated**.
- **Inventory totals:**
  - One row per product with stock, with columns: category, ingredient, manufacturer, form,
    **on hand with its unit**, packs, $ value, $ per unit, expired.
  - A **$ grand total** across everything.
  - Quantity subtotals **per unit**: lb, gal, oz, fl oz and each are never added together.
  - New filters: category (any), manufacturer. Supplier and As of stay.
  - Copy (TSV) adds a **Unit** column.
- **Order totals:** packs ordered and received, quantity in the product's unit, $. Unchanged
  otherwise.
- **To order:** every product with a minimum, in packs, any category.

### 3.9 Formula: `inventory_on_hand` (DR-1, DR-4)

- With a `product_id`, it returns on hand **in the product's unit**, with the unit:
  `{value, unit}`.
- With an `ingredient_id`, it sums the ingredient's products **only when they share a unit**.
  Otherwise it's refused: "Strawberry's products are in different units; ask for one product."
- **DR-1** moves to Resolved (D60 made on hand the sum of movements). **DR-4** is claimed by D62
  for inventory units; the recipe-unit half goes to D63.

## 4. Screens

Under **Brewery → Ingredients** (Brewery members and owners), as today.

1. **Ingredient Library:**
   - Each D62 category gets the Grains list layout (`GrainsList`, generalized): grouped by child
     category where there are children, one row per product, ingredients with no products on
     their own row.
   - Columns per category:
     - Hops: variety, manufacturer, form, origin, alpha / beta / oil ranges, on hand, suppliers
       with $/box.
     - Fruits and Sugars: ingredient, manufacturer, form, unit, on hand, suppliers with $/pack.
     - The others: the same, without features.
   - Search and filters: manufacturer, supplier, on hand only.
2. **Product page** (`ProductPage`, generalized):
   - The header shows form, unit and origin (hops), and the standard specs or ranges.
   - Offers show pack, current price and price history.
   - The lots table shows lot #, received date, supplier, crop year (hops), actual features
     with values outside the product's range marked, on hand and value.
   - The page also shows movement history, open orders, minimum on hand and the below-minimum
     mark.
   - Actions: **Add lot**, **Record movement**, **Count**.
3. **Product dialog:** ingredient, manufacturer, form, product name, unit (fixed for hops and
   sugars by form), origin (hops), and standard specs or ranges.
4. **Add lot / Receive:**
   - Hop lots ask for crop year (required), alpha (required), beta and oil, each with the
     product's range shown.
   - Fruit lots ask for Brix (optional).
   - Dry-sugar lots prefill extract from the standard.
   - Quantity is entered in packs + unit or total, per the display setting.
5. **Orders, Receive, To order, Totals, Contracts:** same pages, now in packs and units.
   - An order can mix categories from one supplier (BSG: malt and hops).
   - The contract dialog offers grain and hop products. A hop line is in lb and $/lb.
6. **Companies:** the "Maltster" chip and filter become "Manufacturer". The supplier order target
   reads "Order target (packs)".
7. **Phone width:** same patterns as D60/D61. Cards, full-screen dialogs, no page sideways
   scroll.
8. **Recipes (unchanged flow until D63):** the Grain Bill / ingredient dialog still picks
   category → ingredient → lot. A hop lot's label shows "YCH Citra Pellet · lot # · 2025 ·
   12.4% AA".

## 5. Backlog in D62

- **5911 (part): O9** in `tests/regression/ingredients/owner.spec.ts` failed once under full
  local load. Find the race (likely a reload or `goto` before a save lands, as PO7/P4 in D61) and
  fix it. Note the rest of 5911 stays on the backlog.
- **`inventory_on_hand`** units (§3.9).
- **`alpha_acid_pct`** kept so `est_ibu` keeps reading lot alpha (§3.4). An ExUnit test pins it:
  a hop lot made through D62's screens gives the same IBU as before for the same numbers.
- **Deferred register:** DR-1 resolved, DR-4 claimed (§3.9).
- **Lint:** no new errors. The 8 left are D63's recipe and batch dialogs.

## 6. Building it: stages

D62's biggest part is changing D61's sacks into packs and units across orders, contracts,
receiving, minimums, totals, counts and the display setting. Adding the categories on top is
mostly features and reference data. One deliverable, built in stages so grain stays green at
every step:

1. **Packs and units, manufacturer:** §3.2, §3.3 (form, unit, origin), §3.5, the display setting.
   Grain only, with every D60/D61 test and Playwright spec still passing.
2. **Hops:** categories, features with ranges, crop year, 11 lb boxes, hop contracts in lb,
   `est_ibu` unchanged.
3. **Fruits, spices, sugars, other consumables:** children, forms and units, Brix, dry-sugar
   extract, `each`.
4. **Reference data** from Matt's spreadsheet (§7), then the gate.

If it runs long, the split point is after stage 2: D62 = packs + hops, and fruit, spices, sugars
and salts move to a later ID. Raise it with Matt before splitting.

## 7. Data and release

- **Migrations are renames, not additive.** The sack → pack columns, `maltster` →
  `manufacturer`, and `quantity_lb` → `quantity` are all renamed. Rollback to `v2026.11.19` needs
  the **pre-release snapshot** (as D55 and D60), not just the old image.
  - Prod has no orders, contracts or lots yet (Matt is waiting for D62 before using Purchasing),
    so this is the cheapest time to do it.
- **Existing data:**
  - Grain products get `unit = lb`.
  - Offers and lots get `pack_name = sack` with their sack size.
  - Movements keep their numbers.
  - The display setting migrates `sacks` → `packs`.
  - Any lot in a D62 category with no product stops the migration with a message. Prod is
    expected to have none; DEV and local reseed.
- **Reference data:** Matt's spreadsheet of hops, fruits, sugars and salts is seeded on every
  environment, like D60's grain reference: manufacturers and suppliers, ingredients, products with
  form, unit and ranges, and offers with packs. No prices, lots or inventory. Matt verifies it
  before use. The synthetic `[SEED]` scenario data gains hop and fruit products, lots and one open
  order on DEV.
- No device, notification or schedule changes.

## 8. Assumptions (lead; confirmed by Matt 2026-11-19)

- **A1** A hop contract line's **price is per lb**. The offer's price history gets that × 11 per
  box.
- **A2** Hop lot **alpha and crop year are required**; beta and oil are optional. A new hop lot
  doesn't copy the product range; it shows it beside each box.
- **A3** **Other Consumables** gets children **Water Salts / Acids / Finings** (§3.1).
- **A4** The **forms and units** in §3.6, including Fruits "Juice / concentrate" and Spices in
  fl oz for liquid extracts.
- **A5** A supplier's order target counts **every pack** on the order, grain sacks and hop boxes
  alike ("36 of 40 packs").
- **A6** The manufacturer is **required** on every product, including spices bought at retail.
  When the maker is unknown, the store or supplier is entered as the manufacturer.
- **A7** **Future Ingredients** is deleted only when empty (§3.1).

## 9. Persona scenarios

**Stage 1 (grain unchanged)**
- As `brewer1`, every D60/D61 grain flow reads as before: "12 sacks 22.5 lb", the BSG target
  "36 of 40 sacks", receiving into the previous lot, a count by lot.
- As `owner` on Companies, Rahr shows the **Manufacturer** chip. The Grains list still says
  "Maltster".

**Hops**
- As `brewer1`, add hop product "Citra", manufacturer Yakima Chief, form Pellet, origin USA,
  alpha 11–13 %, beta 3.5–4.5 %, oil 2.5–3.0. Add a second product "Citra", manufacturer
  Hopsteiner, form Pellet: it's a separate product. A duplicate YCH Citra Pellet is refused.
- As `brewer1`, add a BSG offer for YCH Citra Pellet. The pack is box · 11 lb and can't be
  edited. Price $165.00/box shows $15.00/lb.
- As `brewer2`, **Add lot** with crop year 2025, alpha 14.1 (outside 11–13: marked), opening
  amount 4 boxes. On hand shows "4 boxes" (44 lb). Without alpha or crop year, the dialog
  refuses.
- As `brewer1`, record "Used in brewing" 6.5 lb Oldest first across two Citra lots. Switch the
  display to total: "37.5 lb".
- As `breweryMgr`, the 2027 BSG contract gets a hop line: YCH Citra Pellet 440 lb at $14.50/lb.
  The offer's price history shows $159.50/box effective 2027-01-01. An order of 10 boxes received
  shows received 110 lb, remaining 330 lb. As `brewer1`, the hop line can't be edited.
- As `brewer1`, a BSG order with Rahr 2-Row 30 sacks and Citra 6 boxes reads "36 of 40 packs".
  Receiving puts the hops into a new lot that asks for crop year and alpha.
- A recipe using a D62 Citra lot gives the same `est_ibu` as a pre-D62 lot with the same alpha.

**Fruit, spices, sugars, consumables**
- As `brewer1`, add "Strawberry", manufacturer Oregon Fruit: a Purée product in gal and a Whole
  product in lb. Each has its own on hand.
- A BSG offer for the purée is pail · 5 gal. A lot with Brix 8.5 works, and so does one with no
  Brix. Count the purée as "2 pails 1.5 gal".
- Add a dry sugar (Dextrose, lb, extract 92 % FGDB copied to the lot) and a liquid sugar (Candi
  Syrup, gal, Brix on the lot).
- As `brewer2`, add Calcium Chloride (Water Salts, lb, bag · 50 lb), Lactic Acid 88 % (Acids,
  fl oz, jug · 128 fl oz) and Whirlfloc (Finings, each, tub · 1,000). Recording 2.5 Whirlfloc is
  refused: whole numbers only.
- `inventory_on_hand` for Strawberry Purée returns `{11.5, "gal"}`. For the ingredient
  Strawberry it's refused (mixed units).
- **Totals** as `owner`: one $ grand total, quantity subtotals per unit (lb, gal, fl oz, each),
  and Copy pastes a Unit column. Filter by category Hops.
- Set Whirlfloc's minimum to 1 tub with 600 on hand: **To order** shows 1 tub.

**People, devices, edges**
- As `floater` and `splitRole`, the new pages work. As `bartender1`, they aren't in the nav and
  return 403. As `breweryDevice`, every D62 route returns 403.
- **Two people, one record:** `brewer1` and `brewer2` open the same open order with hop lines.
  `brewer2` saves first; `brewer1`'s save gets the 409 "Someone else changed this order…". The
  same check runs on a contract with a hop line.
- At 360 px: the hop product page, Add lot with crop year and ranges, and Totals with units have
  no sideways scroll. On a slow network, a double-click on Save in Add lot and Receive writes
  once.
- Settings → Categories: Other Consumables shows three children. Hops shows no custom fields.
  Future Ingredients is gone, or listed in the release notes if it held items.

## Amendments (Matt, 2026-11-19, hop reference data)

- **Hop forms:** "T90 Pellet" (not "Pellet"), Cryo, Whole leaf, Extract.
- **Alpha and beta keep 2 decimals** (supplier sheets give 12.67 %).
- **Hop lots on prod:** Matt's cooler list (`reference/d62_hops_matt_2026-11-19.csv`, local only)
  is seeded **on prod only** as lots with an **Opening amount** (28 lots, EKG excluded until its
  lot # and alpha are known). DEV and local keep synthetic hop lots. The products, manufacturers
  and offers are seeded everywhere, as §7.
- **Manufacturer for this seed = the supplier** (John Fearless, Lupulin Exchange, Billy Goat,
  Michigan Hop Alliance, Yakima Chief Hops, BSG); Matt corrects growers later on the screens.
- **Typical ranges and origin** are filled from published variety specs for Matt to check before
  the seed is final.
