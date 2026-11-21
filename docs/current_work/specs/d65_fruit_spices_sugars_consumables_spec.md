# D65: Fruit, spices, sugars and other consumables — Spec

**Status:** DRAFT for Matt's review (lead, 2026-11-20). Q1 is open; A8–A12 need confirming.
**Series:** D60 grain → D61 purchasing → D62 packs + hops → **D65** → D64 yeast → D63 recipes on
products. Next new ID: D66.
**Branch:** `d65-fruit-spices-sugars-consumables`. It's cut from D62's tip for now and gets rebased
onto `develop` once D62 merges.

## 1. Why

D62 generalized grain's sacks into **packs and units** and put hops on the model. The model is
ingredient → product (manufacturer + form + unit) → supplier offers with packs and prices → lots
and movements, plus D61 purchasing. D65 puts the rest of the brewery's non-yeast ingredients on
that same model: **fruits, spices and flavorings, sugars and extracts, and other consumables**
(water salts, acids, finings).

The decisions were made with D62 on 2026-11-19 and approved then (D62 spec §2, A3, A4, A7). D62
was split on 2026-11-20 and these categories moved here unchanged. This spec restates what
applies, says what D62 already built, and adds what D65 needs on top. The Len Silverston UDM
concepts stay: Party Role (manufacturer, supplier), Product, Supplier Product (offer with a
pack), Inventory Item (lot) and Product Feature.

## 2. Decisions carried over (Matt, 2026-11-19)

1. **Categories:** Fruits, Spices & Flavorings, Sugars and Extracts, Other Consumables (fining
   agents, water salts, acids). Cleaning chemicals, CO2 and packaging are out. **Future
   Ingredients** is removed.
2. **D61 purchasing covers all of them:** orders, receiving, minimum on hand, To order, Totals.
3. **Contracts are grain and hops only.** D65 products can't go on a contract. The API already
   refuses them.
4. **One unit per product.** Strawberry Purée (gal) and Strawberry Whole (lb) are two products
   under the ingredient "Strawberry". Dry and liquid sugars work the same way.
5. **Brix is per lot** and **optional** on any fruit lot. It's never required.
6. **Units:**
   - **Fruit:** gallons (purée) or lb (whole).
   - **Spices:** dry oz, or fl oz for liquid extracts (A4).
   - **Sugars:** extract % FGDB on every sugar, dry or liquid. Liquid sugars are in lb or gal,
     with optional Brix (sugars amendment).
   - **Water salts:** ordered and stored in **lb**. Recipes use oz, converted in D63.
   - **Acids and liquid finings:** fl oz, ordered by the jug or bottle.
   - **Tablets:** a count ("each"), ordered by the tub. Matt may refine these later.
7. **Expired by hand** for every category. No best-by dates.
8. **Manufacturer and supplier are separate fields** (D62 decision 17). The supplier is always
   stored. **The manufacturer is optional on every D65 product** (Matt, 2026-11-20; amends A6 for
   D65). A blank one is shown as "None". Grain and hops still require one.
9. **Permissions** are the same as grain: Brewery members and owners. Devices are refused.
10. **Lot value** is the most recent price paid (D61 A4, re-confirmed 2026-11-20).

## 3. What D62 already gives D65

These need no new design. D65 turns them on for its categories and tests them there.

- **Packs:** `pack_name` + `pack_size` on offers and lots; orders, receiving, minimum on hand and
  To order in packs; "36 of 40 packs" targets; the packs/unit display toggle.
- **Units:** quantities in the product's unit; `unit_cost` per unit; the unit is fixed once the
  product has a lot.
- **Product features:** values or ranges on the product (`product_mode` none/value/range), lot
  modes none/copy/enter, `lot_required`, and `only_unit` (a feature that shows only for one unit).
- **Safety and edges:**
  - stale saves are refused (`lock_version`, 409) on products, orders and contracts, with the
    refetch-before-retry fix from DEV;
  - an existing lot # shows its values read-only, and a mismatch is refused (422);
  - the duplicate-product sentence;
  - "Other manufacturer…" in the product dialog.
- **Totals:** the Category filter with All categories, general headings, Copy with Unit and Pack
  columns, and order totals per pack name.
- **`inventory_on_hand`:** returns `{value, unit}` for a product, and refuses an ingredient whose
  products are in different units ("Strawberry's products are in different units; ask for one
  product.").

## 4. Data model

### 4.1 Categories

- **Fruits**, **Spices & Flavorings** and **Sugars and Extracts** stay top-level with **no
  children**. As on Hops, **Add subcategory** is hidden there and the API refuses a child (422)
  (A9).
- **Other Consumables** gets three children: **Water Salts**, **Acids**, **Finings** (A3). They can
  be renamed and added to in Ingredient Library → Categories, as Grains' children can. A child
  takes its parent's key (`consumables`), as D62's `Catalog.key/1` already does.
- **Existing ingredients:** the seeded **Irish Moss** and **Whirlfloc** move into **Finings**, by
  name, if they're still at the top of Other Consumables (A8). Anything else left at the top of
  Other Consumables stays there, and the release notes list it.
- **Future Ingredients** is deleted by the migration if it holds no ingredients. If it holds some,
  it stays, and the release notes list them (A7).
- **Old custom fields:** Fruits, Spices & Flavorings and Sugars and Extracts each have a Form
  dropdown. Those fields are deleted and no longer seeded, as D60 did for Grains and D62 for Hops.
  No screen ever stored a value (D60 dropped `properties`). **Add field** is hidden on these
  categories, and the API refuses it (422), as on Hops.
- Yeast Strains keeps its custom fields and old screens until D64.

### 4.2 Forms and units (`Ingredients.Catalog`)

`managed?` grows from grains + hops to **every category except yeast and future**. The fixed
lists (A4):

| Category (key) | Forms | Units allowed | Pack names |
|---|---|---|---|
| Fruits (`fruits`) | Purée, Whole, Juice / concentrate | gal, lb | pail, drum, case, bag, box |
| Spices & Flavorings (`spices`) | Whole, Ground, Extract | oz, fl oz | bag, jar, bottle, case |
| Sugars and Extracts (`sugars`) | Dry, Liquid | Dry → lb; Liquid → lb or gal | bag, sack, pail, drum, jug |
| Water Salts (`consumables`) | Powder, Flake | lb | bag, pail, tub |
| Acids (`consumables`) | Liquid | fl oz | jug, bottle |
| Finings (`consumables`) | Liquid, Powder, Tablet | fl oz, lb, each | jug, bottle, bag, tub |

- **Other Consumables' children** share the key `consumables`. The form and unit lists are per
  **child**, and Catalog reads the child's name to pick the list. A child Matt adds later, or one
  renamed beyond recognition, gets the union of the three lists (A10).
- **Sugars:** Dry is always lb; Liquid is lb or gal. The dialog sets lb for Dry, and the API
  refuses a mismatch.
- **Units** are labeled lb, gal, oz (dry weight), fl oz and each. They aren't converted into each
  other; recipe conversions come in D63.
- **Pack defaults** in the offer dialog depend on the unit: lb → bag, gal → pail, fl oz → jug,
  oz → bag, each → tub. The pack size is free (> 0, in the product's unit).

### 4.3 `each`

- **Whole numbers everywhere:**
  - on hand, movements, counts and pack sizes;
  - receipts (packs × size);
  - **Used in brewing**, where Oldest first may split a use across lots but never into a
    fraction.
- The API refuses a fraction (422 "Whirlfloc is counted in whole tablets"), and the inputs take no
  decimals.
- The packs view reads "1 tub 400 each". The total view reads "1,400 each".

### 4.4 Features

New feature type:

| Key | Label | Unit | Range | Decimals |
|---|---|---|---|---|
| `brix` | Brix | °Bx | 0–100 | 1 |

Per category (`category_feature_types`):

| Category | Feature | Product | Lot | Notes |
|---|---|---|---|---|
| Fruits | Brix | none | enter, optional | Every fruit lot, any unit (decision 5). |
| Sugars and Extracts | Brix | none | enter, optional | Liquid form only, in lb or gal. |
| Sugars and Extracts | Extract % FGDB | value | copy, editable | Every sugar, dry or liquid. Works as grain: copied from the standard, editable. |
| Spices, Other Consumables | none | — | — | |

- A lot with Brix outside 0–100, or with more than 1 decimal, is refused.
- An extract outside the product's standard isn't marked: the standard is a single value, as for
  grain.

### 4.5 Inventory, value and totals

- On hand, movements, counts (total or by lot, Oldest first, "Counted, no change"), Expired by
  hand and trades: **D60/D61 rules, in the product's unit**.
- **Totals → Inventory:**
  - the Category filter lists every category with stock;
  - the general view gets **quantity subtotals per unit** (lb, gal, oz, fl oz and each are never
    added together) and one **$ grand total**;
  - Copy keeps its Unit column;
  - the Grains-only view still reads as D61.
- **Totals → Orders:** per pack name, as D62 built it ("2 pails · 3 bags · 6 sacks"). The quantity
  column subtotals per unit.
- **To order:** every product with a minimum, in packs. A product with no stock reads "0 gal" or
  "0 each", in its own unit.

## 5. Screens

Under **Brewery → Ingredients** (Brewery members and owners), as today.

1. **Ingredient Library:**
   - Each D65 category gets the Hops/Grains list layout, grouped by child where there are
     children (Other Consumables).
   - Columns: ingredient, manufacturer, form, unit, on hand, and suppliers with $/pack.
   - Sugars also show extract for dry products.
   - Search and filters: manufacturer, supplier, on hand only. The manufacturer list shows only
     manufacturers with products in the category shown.
2. **Product page:**
   - The header shows form, unit and, for dry sugars, the standard extract.
   - The offers, lots, movements, open orders and minimum sections are the same as hops.
   - The lots table shows Brix where the category has it.
3. **Product dialog:** ingredient, manufacturer (with "Other manufacturer…"), form, product name
   and unit.
   - The unit is picked from the category's list. It's set by the form for sugars, and fixed once
     the product has a lot.
   - The dialog also has extract for dry sugars.
4. **Add lot / Receive:**
   - Brix is optional on fruit lots and liquid sugar lots.
   - Extract on dry sugar lots is prefilled from the standard.
   - `each` lots take whole numbers only.
   - Quantity is entered in packs + unit, or as a total, per the display setting.
5. **Orders, Receive, To order, Totals:** unchanged pages, now with D65 products.
   - An order can mix categories from one supplier (BSG: malt, hops, dextrose and Whirlfloc).
   - The contract dialog still offers only grain and hops.
6. **Recipes (unchanged flow until D63):** the ingredient dialog still picks category → ingredient
   → lot. A D65 lot's label reads "Oregon Fruit Strawberry Purée · lot # · 8.5 °Bx" (Brix only
   when the lot has it) (A11).
7. **Phone width:** same patterns as D60–D62: cards, full-screen dialogs, no sideways scroll.

## 6. Backlog in D65

Nothing from the backlog fits D65 naturally (agreed 2026-11-19: D62 and D63 took the fits). The
rest stays on the backlog.

## 7. Data and release

- **Migrations are additive or tidy-ups**, so rollback to D62's image works without the snapshot.
  A pre-release snapshot is still taken, as always. The migrations:
  - add the `brix` feature type and the category feature rows;
  - add the Other Consumables children and move Irish Moss and Whirlfloc into Finings;
  - delete the empty Future Ingredients category and the three old Form fields.
- **No existing stock to migrate.** Prod has no lots in these categories (D61 pre-check: no lots
  at all before D62). The migration stops with a message if it finds a lot in a D65 category with
  no product. DEV and local reseed.
- **Reference data:** see Q1. Whatever Matt provides is seeded on every environment like D62's
  hops: manufacturers, suppliers, ingredients, products (form and unit), offers with packs,
  standards (dry-sugar extract) and, if he gives on-hand amounts, lots as Opening amounts dated
  the day he gives them.
- **Synthetic `[SEED]` data** on DEV and local gains one fruit purée product with a lot, one dry
  sugar, and one `each` fining. Each has an offer and a minimum, so To order and Totals have mixed
  units to show.
- No device, notification or schedule changes.

## 8. Open question and assumptions

**Q1 (Matt): reference data.** D62's plan asked for your spreadsheet of fruits, sugars and salts.
Do you have it?
- **(a) Yes:** I seed it as for hops, with lots dated the day you give it.
- **(b) Not yet:** D65 seeds only the categories and the three ingredients already there (Corn
  Sugar (Dextrose), Irish Moss, Whirlfloc), with no products. You enter products on the screens,
  and a later seed can add the rest.

**Carried, confirmed with D62:**
- **A3:** Other Consumables gets children Water Salts, Acids and Finings.
- **A4:** the forms and units in §4.2.
- **A7:** Future Ingredients is deleted only when it's empty.

**New, to confirm:**
- **A8:** Irish Moss and Whirlfloc move into **Finings**.
- **A9:** Fruits, Spices & Flavorings and Sugars and Extracts have **no subcategories**: Add
  subcategory is hidden and the API refuses one, as on Hops.
- **A10:** **Pack names per category** as in §4.2 (D62 had only sack and box). A child Matt adds
  under Other Consumables gets the union of the three children's forms, units and packs.
- **A11:** a D65 lot's recipe label shows Brix when the lot has it, and nothing extra otherwise.
- **A12:** Brix has **1 decimal** and range 0–100. Extract on dry sugars uses grain's existing
  `extract_fgdb` (1 decimal).

## 9. Building it: stages

1. **Categories, forms, units, packs:**
   - §4.1 migrations and the `Catalog` lists (§4.2);
   - `each` as whole numbers (§4.3);
   - Library, product page and dialogs for all four categories;
   - grain and hops stay green.
2. **Features and totals:** Brix and dry-sugar extract (§4.4); per-unit subtotals and mixed units
   in Totals; To order units; recipe lot labels.
3. **Reference data and `[SEED]` data** (§7), COVERAGE, then the gate: local gate → local QA (360
   px, slow network, two people on one record) → DEV.

## 10. Persona scenarios

**Fruit**
- As `brewer1`, add "Strawberry" with manufacturer Oregon Fruit, then two products: a Purée in
  gal and a Whole in lb. Each has its own on hand. A duplicate Oregon Fruit Strawberry Purée is
  refused with the sentence.
- A BSG offer for the purée: pail · 5 gal. A lot with Brix 8.5 saves, and so does one with no
  Brix. Brix 8.55 is refused (1 decimal).
- Count the purée as "2 pails 1.5 gal".
- `inventory_on_hand` for the purée returns `{11.5, "gal"}`. For the ingredient Strawberry it's
  refused (mixed units).

**Sugars**
- Add Dextrose (Corn Sugar) (Dry, lb, extract 91 % FGDB). Its lot gets 91 copied and editable,
  and offers no Brix.
- Add Black Strap Molasses (Liquid, lb, extract 81.95 %). Its lot gets the extract copied and
  offers optional Brix.
- A Liquid sugar can be in gal. The API refuses Dry in gal.

**Spices**
- Add Cinnamon (Ground, oz, bag · 16 oz) and Vanilla Extract (Extract, fl oz, bottle · 32 fl oz).
  Neither asks for features.

**Other consumables**
- As `brewer2`, add Calcium Chloride (Water Salts, Flake, lb, bag · 50 lb), Lactic Acid 88 %
  (Acids, fl oz, jug · 128 fl oz) and Whirlfloc (Finings, Tablet, each, tub · 1,000).
- Recording 2.5 Whirlfloc is refused: whole numbers only.
- Irish Moss and Whirlfloc sit under Finings. Settings → Categories shows Other Consumables with
  three children, and Future Ingredients is gone.

**Purchasing and totals**
- As `brewer1`, a BSG order mixes Rahr 2-Row 30 sacks, Citra 6 boxes, Dextrose 2 bags and
  Whirlfloc 1 tub. It reads "39 of 40 packs".
- Receive the order: Dextrose's extract is prefilled and the Whirlfloc lot is whole.
- Whirlfloc's minimum is 1 tub with 600 on hand: **To order** shows 1 tub.
- The contract dialog doesn't offer Dextrose. The API refuses it on a contract line.
- **Totals** as `owner`:
  - All categories gives one $ grand total and quantity subtotals per unit (lb, gal, fl oz, oz,
    each);
  - Copy pastes the Unit column;
  - the Grains view reads as D61;
  - Totals → Orders shows "2 bags · 6 boxes · 30 sacks · 1 tub".

**People, devices, edges**
- As `floater` and `splitRole`, the new pages work.
- As `bartender1`, they aren't in the nav and the API returns 403. As `breweryDevice`, every D65
  route returns 403.
- **Two people, one record:** `brewer1` and `brewer2` edit the same fruit product. The second save
  gets the 409, and nothing is written.
- **Receive into an existing lot #:** a purée lot with Brix 8.5 shows read-only. Sending 9.0
  through the API gives a 422.
- **At 360 px:** the fruit product page, Add lot with Brix, the Whirlfloc count and Totals with
  mixed units have no sideways scroll.
- **Slow network:** a double-click on Save in Add lot and Receive writes once.
- **Add field** and **Add subcategory** are hidden on Fruits, Spices & Flavorings and Sugars and
  Extracts, and the API refuses both (422). Other Consumables allows Add subcategory.

## Amendment (Matt, 2026-11-20): water salts reference data, batch 1

**Data:** `reference/d65_salts_matt_2026-11-20.csv`. It's local only and the seed file embeds it.
It lists seven salts with the ppm each ion reaches from 1 g per gallon. The lead checked each
value against the salt's formula.

| Salt | Formula | Ca | Mg | CO₃ | HCO₃ | SO₄ | Na | Cl |
|---|---|---|---|---|---|---|---|---|
| Calcium Carbonate (Chalk) | CaCO₃ | 105.8 | | 158.4 | | | | |
| Sodium Bicarbonate (Baking Soda) | NaHCO₃ | | | | 191.9 | | 72.3 | |
| Calcium Sulfate (Gypsum) | CaSO₄·2H₂O | 61.5 | | | | 147.4 | | |
| Magnesium Sulfate (Epsom Salt) | MgSO₄·7H₂O | | 26.1 | | | 103.0 | | |
| Sodium Chloride (Table Salt) | NaCl | | | | | | 103.9 | 160.3 |
| Calcium Chloride (Hydrous) | CaCl₂·2H₂O | 72.0 | | | | | | 127.4 |
| Calcium Chloride (Anhydrous) | CaCl₂ | 95.4 | | | | | | 168.8 |

**Decisions:**
1. **Ion contributions are stored once per ingredient**, not per product. They're chemistry, the
   same for every brand. In Silverston's model they're features of the generic product, inherited
   by every variant.
   - New feature types, each in ppm @ 1 g/gal with 1 decimal and a range of 0–1000:
     `ca_ppm_per_g_gal`, `mg_…`, `co3_…`, `hco3_…`, `so4_…`, `na_…`, `cl_…`.
   - The values sit on the **ingredient**. That's a new `ingredient_feature_values` table, or the
     product feature table generalized to point at an ingredient; the plan decides which.
   - The ingredient has an optional **formula** text field.
   - They're shown on the ingredient and read-only on each product page. They're edited in the
     ingredient dialog, only for Water Salts.
   - Lots carry none. D63's water chemistry reads them.
2. Each salt row is **its own ingredient**. "Calcium Chloride (Hydrous)" and "(Anhydrous)" are
   separate ingredients, because their ion numbers differ.
3. **The manufacturer is optional on Water Salts products** (Matt: "list the Manufacturer as
   None"). The sugars batch widened this to **every D65 category** (decision 8); grain and hops
   keep it required.
   - It's stored as null and shown as **"None"** in lists, pickers and Totals.
   - The duplicate rule treats null as one value, so a second None Calcium Sulfate (Gypsum) Powder is refused.
   - Product names read "Calcium Sulfate (Gypsum) Powder · None".
4. **Supplier BSG.** These products, one offer each, are seeded on every environment:

   | Ingredient | Form | Unit | BSG offer | Price |
   |---|---|---|---|---|
   | Calcium Chloride (Hydrous) | Flake | lb | bag · 50 lb | $77.00/bag ($1.54/lb) |
   | Calcium Sulfate (Gypsum) | Powder | lb | bag · 50 lb | $32.00/bag ($0.64/lb) |
   | Calcium Carbonate (Chalk) | Powder | lb | bag · 50 lb | $66.00/bag ($1.32/lb) |
   | Magnesium Sulfate (Epsom Salt) | Powder | lb | bag · 50 lb | $97.00/bag ($1.94/lb) |
   | Sodium Chloride (Table Salt) | Powder | lb | bag · 50 lb | $34.00/bag ($0.68/lb) |
   | Sodium Bicarbonate (Baking Soda) | Powder | lb | bag · 50 lb | $47.00/bag ($0.94/lb) |

   - Prices are effective 2026-11-20.
   - No lots or on-hand amounts were given, so none are seeded.
   - Calcium Chloride (Anhydrous) is seeded as an ingredient with its ions, with no product.
   - Forms (Flake for the calcium chloride, Powder for the rest, including the sodium salts) are the lead's guess (**A13**,
     to confirm).
   - The seed is idempotent by name, as D62's hops.
5. **Names (Matt):** the chemical name, with the common name in parentheses. Gypsum and Epsom
   salt are hydrous by definition, so their names drop "(Hydrous)". Calcium chloride has no common
   name, so its parentheses hold the hydration: "Calcium Chloride (Hydrous)" and "(Anhydrous)".
   The seed renames the existing seeded ingredients by name (idempotent).

## Amendment (Matt, 2026-11-20): sugars reference data, batch 2

**Data:** `reference/d65_sugars_matt_2026-11-20.csv`. It's local only and the seed file embeds it.
Maple syrup is left out: Matt will check its specs and add it by hand.

**Decisions:**
1. **Liquid sugars keep the Liquid form and optional Brix** (Matt: "I'll likely use that later"):
   - Liquid sugars may be in **lb or gal**, while Dry stays lb.
   - **Extract % FGDB is a standard on every sugar**, dry or liquid. It's copied to the lot and can
     be edited there.
   - Brix is optional on Liquid lots.
   - §4.2 and §4.4 are updated to match.
2. **Prices are per lb.** An offer's pack price is the pack weight × $/lb, with the price
   effective 2026-11-20.
3. **Missing extracts** are filled with typical values and **checked by Matt** before release:
   Dextrose 91 % (PPG 42) and Belgian Candy Syrup 70 % (PPG ~32, a typical dark candi syrup).
4. **The manufacturer is optional across all of D65**, shown as "None" (decision 8).
5. **Names:**
   - The seeded "Corn Sugar (Dextrose)" is renamed **"Dextrose (Corn Sugar)"**.
   - "Honey - Redstone" becomes the ingredient **"Honey"**, with a Colorado Honey Co. product
     supplied by Redstone.

**Seeded on every environment** (no lots; Matt gave no on-hand amounts):

| Ingredient | Manufacturer | Form | Unit | Supplier · pack | $/lb | Pack price | Extract |
|---|---|---|---|---|---|---|---|
| Lactose | None | Dry | lb | BSG · bag · 50 lb | $1.00 | $50.00 | 100 % |
| Dextrose (Corn Sugar) | None | Dry | lb | BSG · bag · 50 lb | $0.91 | $45.50 | 91 % (typical, to check) |
| Belgian Candy Syrup | Candico | Liquid | lb | BSG · pail · 55 lb | $0.78 | $42.90 | 70 % (typical, to check) |
| Black Strap Molasses | Sweetener Sup Co. | Liquid | lb | BSG · pail · 60 lb | $0.82 | $49.20 | 81.95 % |
| Honey | Colorado Honey Co. | Liquid | lb | Redstone · pail · 60 lb | $2.00 | $120.00 | 80.33 % |
| DME | Muntons | Dry | lb | BSG · bag · 55 lb | $1.00 | $55.00 | 100 % |

**New companies:**
- Candico, Sweetener Sup Co. and Colorado Honey Co. are manufacturers.
- Redstone is a supplier.
- Names are as Matt gave them; "Sweetener Sup Co." was confirmed by Matt.

**Extract precision:** extract keeps grain's 1 decimal for typed values. The seed stores 81.95 and
80.33 exactly as given, so `extract_fgdb` moves to **2 decimals**. Grain values are unaffected.

## Amendment (Matt, 2026-11-20): fruit reference data, batch 3

**Data:** `reference/d65_fruit_matt_2026-11-20.csv`, local only; the seed embeds it. Matt's paste
had two cost/Brix column pairs. Only the **second** is used ("ignore the first").

**Decisions:**
1. **Aseptic Fruit is both manufacturer and supplier** of every fruit. The spelling was confirmed by
   Matt.
2. **Brix is a typical range on the fruit product** (low–high), as hops carry alpha. This changes
   §4.4 for Fruits from "lot only" to **range on the product + optional actual on the lot**. The
   lot doesn't copy the range; it shows it beside the box, and an actual outside the range is
   marked, never refused. Watermelon's "12" is stored as 12–12 and shown as "12 °Bx".

**Lead's reading, for Matt to confirm (A14):**
- Every fruit is a **Purée**, in **lb** (the containers are 11 and 44 lb). This replaces decision
  6's "purée in gallons" for these products; gal stays allowed for fruit.
- Costs are **per container**.
- Packs are **pail · 11 lb** and **pail · 44 lb**.
- Strawberry is **one product with two offers** (11 lb and 44 lb).
- "Tangereen" reads Tangerine.

**Seeded on every environment** (Aseptic Fruit; prices effective 2026-11-20; no lots):

| Ingredient | Product | Pack | Price | $/lb | Brix |
|---|---|---|---|---|---|
| Passion Fruit | Purée | pail · 11 lb | $51.00 | $4.64 | 12–14 |
| Strawberry | Purée | pail · 11 lb | $45.00 | $4.09 | 6.5–9 |
| Strawberry | (same product) | pail · 44 lb | $116.50 | $2.65 | 6.5–9 |
| Raspberry | Purée | pail · 11 lb | $69.00 | $6.27 | 11–13 |
| Pink Guava | Purée | pail · 11 lb | $29.00 | $2.64 | 8–11 |
| Grapefruit | Purée | pail · 44 lb | $82.00 | $1.86 | 10–13 |
| Lemon | Purée | pail · 44 lb | $99.50 | $2.26 | 6–9 |
| Lime | Purée | pail · 44 lb | $97.92 | $2.23 | 6–9.4 |
| Plum | Purée | pail · 44 lb | $113.50 | $2.58 | 17–20 |
| Blueberry | Purée | pail · 44 lb | $115.00 | $2.61 | 10–14 |
| Blood Orange | Purée | pail · 44 lb | $98.50 | $2.24 | 6–9.4 |
| Tangerine | Purée | pail · 44 lb | $103.50 | $2.35 | 15–17 |
| Watermelon | Purée | pail · 44 lb | $114.00 | $2.59 | 12 |

### Fruit batch 3b (Matt, 2026-11-20): SoNature

**Data:** `reference/d65_fruit2_matt_2026-11-20.csv`. The supplier is **SoNature**, and the
manufacturer is **None** (decision 8). No prices were given, so the offers are seeded without a
price.

Matt gave these as extract %. For a fruit as delivered, extract % (dissolved solids by weight) ≈
Brix. **Matt: store them as Brix.** Each is a typical single value on the product (low = high).
**Fruit gets no extract field**; extract stays on sugars only.

| Ingredient | Form | Unit | Pack | Brix |
|---|---|---|---|---|
| Apricot | Juice / concentrate | lb | pail · 40 lb | 50 °Bx |
| Cherry | Juice / concentrate | lb | pail · 56 lb | 11.4 °Bx (lead's conversion; Matt to check; concentrate is usually ~68) |
| Lemon | Purée | lb | pail · 40 lb | 11 °Bx |
| Lime | Purée | lb | pail · 40 lb | — |

- **Lemon and Lime now have two products each:** Aseptic Fruit Purée and None Purée (SoNature).
  They're different products because their manufacturers differ (D62 decision 17).
- **Pack names (Matt):** every SoNature pack is a **pail**: pail · 40 lb, and pail · 56 lb for
  Cherry.

## Amendment (Matt, 2026-11-20): acids

**Acids are left blank for now** ("maybe not needed at all"). The Acids child of Other Consumables
is still created, so it can be used if needed, but no acid data is seeded. If Matt decides it isn't
needed, it can be removed in Ingredient Library → Categories.

## Amendment (Matt, 2026-11-20): finings, batch 4

| Ingredient | Product | Manufacturer | Form | Unit | Supplier · pack | Price | $/lb |
|---|---|---|---|---|---|---|---|
| Whirlfloc | Whirlfloc T | None | Tablet | lb | BSG · tub · 5 lb | $92.00 | $18.40 |

- Matt gave it as **5 lb for $92**, so the product is in **lb** (tub · 5 lb), not "each". The `each`
  unit stays available for any tablet counted by the piece (A16, to confirm).
- The product name is "T", so it shows as "Whirlfloc T". The seeded ingredient Whirlfloc already
  sits under Finings (A8).
- Irish Moss stays an ingredient with no product.
