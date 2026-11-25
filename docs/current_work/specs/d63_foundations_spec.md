# D63: Foundations for recipes — Spec

**Status:** APPROVED (Matt, 2026-11-24). Scoping was done in chat on 2026-11-24 ("D63
scoping is done, write the spec"). Decisions are in §2; A1–A9 were answered on 2026-11-24 (§10).
**Series:** D60 → D61 → D62 → D65 → D64 → **D63 foundations** → D68 recipes → D67 planned need →
D66 brew day → D69 fermentation. Next new ID: **D70**.
**Branch:** `d63-foundations`, cut from `develop` @ `0e9de47`.
**Concept:** 12_ingredients

## 1. Why

Recipes (D68) will name products, hop varieties and process aids, and calculate from extract, ions
and brewery numbers. D63 gets those right first, and is useful alone:
- the catalog gets what the recipes call for, and corrected values;
- brewers decide **which hop lot is used next**;
- the brewery's calculation numbers get one page.

It changes no recipe or batch screen. It keeps the Len Silverston UDM concepts: Product, Supplier
Product (offer), Inventory Item (lot) and Product Feature. The use order is an attribute of the
Inventory Item within a variety and form. It makes no new kind of product.

## 2. Decisions (Matt, 2026-11-24)

**Split**
1. D63 was split into D63, D68, D67, D66 and D69, in that order.

**Hop lots**
2. A hop is grouped by **variety**, whatever its crop year, supplier or manufacturer.
3. Each variety + **form** has an ordered **use list** of lots. Citra T90 Pellet and Citra Cryo are
   separate lists.
4. The first order is by **received date**. A **new lot goes to the end**. A brewer can move a lot
   anywhere, by **drag or up/down arrows**.
5. Any Brewery member reorders. Devices don't.
6. The list drives **all hop use**: the default for Used in brewing, Traded out and Loaned out (any
   lot can still be picked), and count shortfalls. A count's extra stock still goes to the newest
   lot.
7. Movements and counts stay on each maker's product page.
8. **Pink Boots differs every year**, so each year is its own variety: "Pink Boots '23",
   "Pink Boots '24".
9. **Grain** keeps maltster products apart, oldest received first, with no use list.
10. Choosing a lot on a recipe or brew day is D68/D66. Reserving stock is D67.

**Catalog**
11. "Finings" becomes **Process Aids**, and takes Zinc Sulfate Heptahydrate, Amylo300, Clarity Ferm
    and Ultra-Ferm.
12. The **spices** the workbook uses are added: juniper, Timut pepper, lemongrass, chamomile,
    cinnamon, allspice, clove.
13. **EKG**: a product from Lupulin Exchange, with an 11 lb lot "EKG-2025", crop 2025, alpha 5.9 %.
    It's a placeholder Matt will check.
14. The calcium chloride in use is **anhydrous** (the earlier "hydrous" was a mistake).
15. Extract and other values are corrected (§5.3). Only a value that still equals the old seed is
    changed.

**Settings**
16. One **Brewery settings** page. Any brewer views it; **owners and Brewery managers** edit it; the
    **brewhouse device views it only**.
17. Whirlpool and hop stand times are defaults, changed per brand or recipe in D68.

## 3. Stop 0: carry-ins

| Item | Fix |
|---|---|
| **6260** | `ConfirmDialog` handles phone Back (`useBackCloses`), as `FormDialog` does. Back closes only the top dialog (Brink History → Remove). A dialog whose confirm is in flight isn't closed by Back. A confirm that then navigates must still land (5911's `history.back()` race). 41 files mention the component: check every one whose confirm navigates away |
| **6261** | Brink History leaves out voided records with no entries |
| **6262** | The order page footer uses New order's per-unit words ("20 bricks, 12 pitchables"; tablets too) |
| **5911 (S16 only)** | `d58/sweep.spec.ts` reaches its target week without 47 quick clicks. Test only, no app change. The rest of 5911 stays |

## 4. Hop use lists

### 4.1 Data
- `ingredient_lots.use_position` (integer, nullable). It's set on every lot whose category key is
  `hops`, and null on every other lot.
- A **list** is the lots with the same ingredient and the same product form, across makers.
- **Backfill:** received date, then crop year, then lot id. Prod's 28 lots share one received date,
  so crop year decides there.
- A new lot takes the list's highest position + 1, in the same write as the lot.
- Receiving into, or counting, an existing lot never moves it.
- A lot that reaches 0 **keeps its position**. If stock returns, it's back in its place.

### 4.2 Reading and reordering
- `GET /api/hop_use_lists?ingredient_id=` returns each form's list in order: lot id, lot #, maker,
  supplier, crop year, alpha, received date, on hand, status, product id.
- `PUT /api/hop_use_lists/order` takes `{ingredient_id, form, lot_ids}`. `lot_ids` names every
  **shown** lot (stock above 0, Expired included). The shown lots are permuted among the positions
  they already hold, so a used-up lot's place is kept.
- If the list changed meanwhile (a lot added, used up, or reordered by someone else), the answer is
  **409** with a sentence, and the screen refetches. A `version` (a hash of the list's ids and
  positions) is sent with the order to detect that.
- A lot from another list, a repeated id or a missing one is 422.

### 4.3 Allocation (`Inventory.allocate/3`)
- `:oldest_first` on a hop product uses **use order** (that maker's lots only). Every other product
  keeps received date, then lot id.
- Expired lots are skipped, as now. The API value stays `oldest_first`.
- Count shortfalls follow it. Overages go to the newest lot by received date, unchanged.
- A new `Inventory.use_order(ingredient_id, form)` gives the list across makers, for D68 and D66.
  Nothing in D63 allocates across makers.

### 4.4 Screens
- **The hop's page** (`/ingredients/:id`, Hops only) gets a **Use order** section, one list per form
  that has lots. It reuses `OrderedList` (drag handle, long-press on touch, keyboard, arrows).
  - A row: position, maker, lot #, crop year, alpha, on hand (the person's display), Expired chip. The lot # links to its product page.
  - The first lot with stock that isn't expired is marked **"In use"**.
  - **Used-up lots are hidden** by default. With **Hide used-up lots** off, they're listed under
    "Used up", without handles. Either way they keep their place.
  - **Hide used-up lots** is an ingredient-page setting, beside the packs/total toggle on the Hops list
    and on the hop's page. It's kept per account, as that toggle is
    (`board_settings.ingredients.hide_used_up_lots`, default true); a failed save keeps the choice for
    the page and says so. It affects the use lists only; lots tables don't change.
  - A helper line: "Brewing takes the first lot with stock. New lots go to the end."
- **Hops list:** no change.
- **Record movement** on a hop product: the choice reads **"In use order"**, with the helper "From
  this product's lots in use order, skipping expired lots". Other categories keep "Oldest first".
- **Count** on a hop product: the shortfall wording says "in use order".
- 360 px: full-width rows, no sideways scroll, arrows reachable.

## 5. Catalog

### 5.1 Process Aids
- Other Consumables' child **Finings is renamed Process Aids** (migration, found by parent key and
  name in any case). If a Process Aids child already exists too, the migration stops with a message.
- `Catalog` knows "process aids" and still knows "finings", so neither name loses its lists.
- Units gain **g** and **mL** (with fl oz, lb, each). Packs stay jug, bottle, bag, tub. Offer pack
  sizes are in the product's unit (250 g; 10,000 mL).
- `g` and `mL` must work everywhere a unit shows: offers, lots, counts, movements, orders, To order,
  Totals (their own subtotals) and refusals.

| Product | Maker | Supplier | Form · unit | Pack |
|---|---|---|---|---|
| Zinc Sulfate Heptahydrate | BSG | BSG | Powder · g | bag · 250 |
| Amylo300 | Kerry (new company) | BSG | Liquid · g (A2) | bottle · 1,000 |
| Clarity Ferm | White Labs | White Labs | Liquid · mL | jug · 10,000 |
| Ultra-Ferm | White Labs | White Labs | Liquid · mL | bottle · 1,000 |

No prices, lots or minimums.

### 5.2 Spices, EKG
- Prod already has the **ingredients** Cinnamon, Clove, Juniper Berries, Lemongrass and Timut
  Pepper, with no products. Add the ingredients **Allspice** and **Chamomile**, and one product for
  each of the seven: manufacturer None, unit **oz**, form Ground for Cinnamon, Allspice and Clove and
  Whole for the rest (A3). No offers.
- **EKG:** ingredient "EKG", product Lupulin Exchange T90 Pellet, no alpha range, offer box · 11 lb,
  no price; lot **EKG-2025**, crop 2025, alpha 5.9, Opening 11 lb, note "Placeholder: check the lot
  number, alpha and weight". The lot is added once: if EKG has any lot, the seed adds none.

### 5.3 Value corrections
Each changes only where the stored value still equals **Old**; otherwise it's left, and the release
log names it.

| Product | Value | Old | New |
|---|---|---|---|
| Pilsner, Root Shoot | Moisture % | 5.0 | 3.93 |
| | Extract FGDB % | 80.8 | 81.5 |
| | Color °L | 1.6 | 1.85 |
| | Protein % | 10.5 | 11.62 |
| | Diastatic power °Lintner | 125 | 157 |
| Acidulated, Weyermann | Extract FGDB % | none | 84.9 |
| Oats, Flaked, Grain Millers | Extract FGDB % | none | 81.5 |
| DME, Muntons | Extract % | 100 | 96 |
| Dextrose (Corn Sugar) | Extract % | 91 | 91.3 |
| Lime purée, None | Typical Brix | none | 8 |

Lots keep the values they copied. Prod has no grain lots (§9 checks the sugars). Lemon already has a
typical Brix (None 11; Aseptic Fruit 6–9) and so does Aseptic Fruit's lime (6–9.4), so they're left.

### 5.4 Calcium chloride
- Prod has both **ingredients**, each with its right ions: Hydrous (72.0 Ca, 127.4 Cl), which has the
  one product (Flake, lb, BSG bag · 50 offer), and **Anhydrous** (95.4, 168.8), which has none.
- The migration **moves that product to the Anhydrous ingredient**, with its offer and price. If the
  product has any lot, or Anhydrous already has a product, it's left and reported.
- The Hydrous ingredient stays, with no product.

### 5.5 Pink Boots
- Rename the ingredient **Pink Boots Blend → Pink Boots '23**, keeping its product, offer and 2023 lot.
- Create **Pink Boots '24** with the same maker, form, origin and offer (and the offer's prices).
- Move the 2024 lot there with its movements, alpha and cost, and its stock. Both `ingredient_id`
  and `product_id` change. This migration is the only place a lot with movements changes product.
- It runs only if the rows look as seeded (one product, lots P92-IUPBB3182 crop 2023 and
  P92-JUPBB4199 crop 2024). Otherwise nothing changes, and the log says why.
- If an order or contract line names the product, it stays with '23 and the log says so. (Prod has
  no order lines.)

### 5.6 Seeds must agree
Seeds run on every release and add what's missing by name, so each must be changed too or it would
**bring the old rows back**: `seeds.exs` (Finings), `hop_reference.exs` (Pink Boots Blend and its two
lots), `d65_reference.exs` (Hydrous's product, DME, dextrose, lime) and `grain_reference.exs` (Root
Shoot Pilsner, Acidulated, oats). New rows go in `d63_reference.exs`. A second run adds nothing.

## 6. Brewery settings

### 6.1 Data
One row, `brewery_settings`, typed columns, `lock_version`, `updated_by_id`, `updated_at`.

| Setting | Starts at | Limits |
|---|---|---|
| Boil temperature °F | 202 | 180–212 |
| IBU equation to hold | RC 2026 | RC 2026, Tinseth, Modified Tinseth |
| IBU equation to print | RC 2026 | same |
| IBU tolerance | 2.0 | 0–20 |
| Pellet factor (T90, Cryo) | 1.1 | 1–1.5 |
| Hop stand temperature °F | 170 | 100–212 |
| Hop stand cooling minutes | 15 | 0–120 |
| Hop stand whirl / rest minutes | 20 / 20 | 0–120 each |
| Whirlpool whirl / rest minutes | 20 / 20 | 0–120 each |
| Evaporation bbl/hr | 0.23 | 0–2 |
| Kettle loss bbl (cold) | 0.21 | 0–5 |
| Fermenter loss bbl | 0.5 | 0–5 |
| Whirlfloc tablets/bbl | 2 | 0–20 |
| Clarity Ferm mL/°P/bbl | 1.3333 | 0–20 |
| Zinc g per bbl of kettle volume | 0.09375 | 0–5 |
| Pitch rate M cells/mL/°P | 1.5 | 0.1–5 |
| Source water (Ca, Mg, Na, CO₃, HCO₃, SO₄, Cl ppm) | 20, 3, 4, 0, 18, 2, 3 | 0–2,000 each |

Zinc is 0.75 g per 8 bbl of kettle volume. The screen shows it that way ("0.75 g per 8 bbl") and
stores per bbl. Source water is named "Estes Summer".

### 6.2 API, page and permissions
- `GET /api/brewery_settings` and `PUT` (stale `lock_version` → 409).
- Authz: `:read` is a Brewery member, `:manage` a Brewery manager or owner, the same rule as
  `:yeast_settings`. The **brewhouse device** (home Brewery) has `:read` only, on its device
  allowlist; every other device is refused both. A Brewery device's reads need no staff code.
- **Page:** `/brewery/settings`, in the brewery nav. Grouped: Boil and hops, Volumes, Additions,
  Yeast, Source water. Viewers and the brewhouse device see values with no fields or Edit.
  The device gets the page in its menu (`DEVICE_PAGES`). Editors get Edit, then Save or Cancel.
  It shows "Last changed by … on …".
- A line at the top: **"Used by recipes."** Until D68, nothing reads them, and it adds "Recipes start
  using these in an upcoming release."
- A comma decimal is refused as elsewhere.

## 7. Permissions summary

| Action | Brewery member | Brewery manager | Owner | Others | Brewhouse device | Other devices |
|---|---|---|---|---|---|---|
| See a use list | ✓ | ✓ | ✓ | – | – | – |
| Reorder | ✓ | ✓ | ✓ | – | – | – |
| See settings | ✓ | ✓ | ✓ | – | ✓ | – |
| Edit settings | – | ✓ | ✓ | – | – | – |

Reordering uses the existing `:write, :ingredients` rule.

## 8. Not in D63
Recipes, estimates, °Plato, printing (D68); planned need and reserving (D67); choosing lots on a
batch, drawdown, readings (D66); fermentation (D69). Also movements or counts for a whole variety,
allocating across makers, a grain use list, and a brand's own defaults.

Register: **DR-4**'s recipe half moves from D63 to D68 (edited with this spec).

## 9. Data and release
- **Migrations:** `use_position` with backfill; `brewery_settings` with its row; Process Aids rename;
  value corrections; calcium chloride; Pink Boots. Data migrations skip and log rather than fail,
  except the rename's duplicate. On a fresh database (no rows yet) they do nothing.
- **Rollback:** they change data, so a rollback restores the pre-release snapshot, then the previous
  images.
- **Before the release**, read-only on prod: the rows in §5.3–§5.5 still look as written here; no
  lots of calcium chloride, DME, dextrose or lime with copied values; no order or contract lines on
  Pink Boots or calcium chloride.
- **After:** Matt checks one hop's Use order, Pink Boots '23 (8.5 lb) and '24 (2.9 lb), EKG, calcium
  chloride, and the settings page.
- `[SEED]` data gains a hop variety with three lots from two makers, one of them used up and one
  expired, so the specs don't touch real rows.

## 10. Corrections and assumptions

**Corrected while writing** (from what was said in chat):
- **Spices are in oz**, not lb: the category takes oz and fl oz. D68 converts g, oz and lb.
- **Typical Brix isn't new.** Fruit products already have it. Only the lime with no maker needs a value.
- **Calcium chloride moves to an existing ingredient** (§5.4). It isn't a rename.
- Five of the seven spices already exist as ingredients.
- The two Citra products are already separate on prod (T90 Pellet and Cryo).
- **"Variety page"** is the hop's existing page with a new section, with one list per form. No new page.

**Answered (Matt, 2026-11-24)**
- **A1** Movement screens show "In use order" for hops only. Yes.
- **A2** Amylo300 is **Liquid**, measured in grams. Yes.
- **A3** Cinnamon, **Allspice and Clove are Ground**; the other four are Whole.
- **A4** Pack names: zinc bag, Amylo300 and Ultra-Ferm bottle, Clarity Ferm jug. Yes.
- **A5** A used-up lot keeps its place, hidden by default, with a **Hide used-up lots** setting.
- **A8** That setting is **on the ingredient pages**, not a brewery setting (§4.4).
- **A6** Kettle loss is stored cold, 0.21 bbl. Small-turn recipes set their own in D68. Yes.
- **A7** Settings live at Brewery → Settings. The brewhouse device sees them, **view only**.

- **A9** It's remembered per account and covers the use lists only, not the lots tables. Yes.

## 11. Building it: stages
0. **Stop 0** (§3).
1. **Catalog:** Process Aids, units, corrections, calcium chloride, Pink Boots, EKG, spices, seeds (§5).
2. **Use lists:** data, API, allocation, screens (§4).
3. **Brewery settings** (§6).
4. `[SEED]` data, COVERAGE, then the gate: local gate → local QA (360 px, slow network, two people on
   one record) → DEV Playwright + DEV QA.

## 12. Persona scenarios

**Stop 0**
- As `brewer1` on a phone: Back on Dump brink, Mark clean and Remove pitch closes the dialog and
  stays on the page. From Brink History → Remove, Back closes only the confirm.
- As `breweryMgr`: delete something whose confirm navigates away; the page lands where it should.
- A voided, empty brink record isn't listed. An order of 20 bricks and 12 pitchables says so.

**Use order**
- As `brewer1` on a hop with three lots from two makers: the list shows received-date order. Drag the
  third to the top; reload; it's still first and reads "In use". As `brewer2`, the same order shows.
- With the arrows at 360 px, and with the keyboard, a move saves.
- Add a lot: it's at the end. Receive into an existing lot: it doesn't move.
- **Record movement**, Used 3 lb "In use order" on one maker's product: it comes from that maker's
  first lot in the list, spilling to the next, as two movements. Picking a lot by hand still works.
- **Count** 1 lb short: it comes off the first lot in use order. Count 1 lb over: onto the newest lot.
- Expire the first lot: it's skipped, and the next reads "In use".
- Use a lot up: it's hidden. As `brewer1`, turn Hide used-up lots off: it shows under "Used up", and
  still does after a reload. `brewer2` still has it hidden. Count stock back onto it: it's in its old
  place.
- Two brewers: `brewer1` reorders while `brewer2` has the list open; `brewer2`'s move gets a sentence
  and the new order, and nothing is lost.
- A grain still says "Oldest first" and behaves as before.
- `office1` and the brewhouse device can't reorder (API 403).
- Citra T90 and Citra Cryo show as two lists.

**Catalog**
- As `brewer2`: Process Aids lists Whirlfloc T and the four new products. Order 2 bags of zinc and
  receive them: "2 bags" (500 g). Count 480 g. Totals has g and mL subtotals.
- EKG has one lot: 11 lb, 5.9 %, crop 2025, with the placeholder note.
- Calcium Chloride (Anhydrous) has the product, offer and ions 95.4 / 168.8; Hydrous has no product.
- Pink Boots '23 has 8.5 lb and '24 has 2.9 lb, with their movements.
- Run the seed twice: the second run adds nothing, and Finings, Pink Boots Blend and Hydrous's
  product don't come back.
- A value edited before the migration (say DME at 97) is left at 97.

**Settings**
- As `brewer1`: every value shows, with no Edit. As `breweryMgr`: set IBU tolerance to 1.5; reload;
  it's 1.5 with "Last changed by". As `owner`: edit too.
- Two editors: the second save is refused with a sentence and shows the current values.
- 250 for boil temperature, text, and a comma decimal are refused with the limits.
- The brewhouse device: the page shows every value, no Edit; the API's PUT is 403.
- `bartender1`, `office1` and a Taproom device: no nav entry, the URL goes Home, the API is 403.
