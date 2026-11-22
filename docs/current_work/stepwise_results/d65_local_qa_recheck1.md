# D65 QA recheck 1 (local)

- **Date:** 2026-11-21 (America/Denver), local app at http://localhost:5174, after the reseed. Nothing on `*.fly.dev` was touched, and I didn't read the app source.
- **Personas:** brewer1 and brewer2 for most checks, owner for Totals, the seeded baseline diff and cleanup. I also read the display setting for owner2, breweryMgr, floater and splitRole.
- **Overall: pass with gaps.**
  - 12 of the 13 first-pass gaps are **fixed**, and gap 8 is **partly fixed** (the full list is below).
  - Both must-fix gaps (5 and 13) are fixed.
  - Every decided item checks out, and Q13 now works.
  - The regression sweep (Q3, Q4, Q7, Q8, Q10, Q14) found no regressions.
  - **Seeded data: 0 changes** between the start and end baselines.
  - **3 new minor gaps** (14–16).
- Sizes: desktop 1366×768, and 360×780 with touch wherever the item is a screen. Evidence screenshots are in `results/recheck1/`.

## Gap rechecks

| Gap | Result | Evidence |
|---|---|---|
| 1 (should-fix) duplicate 422 visible | **Fixed** | The alert "There's already a [TEST-TEMP] Mango Whole with manufacturer None." is in view at both sizes (y = 40 at 1366, y = 8 at 360). `r1_dup_1366.png`, `r1_dup_360.png`. |
| 10 (should-fix) product 409 visible | **Fixed** | brewer1 and brewer2 edit the same product. The second save gets 409, and "Someone else changed this product…" is in view at both sizes (y = 40 / y = 8). The first save is kept, and the second person's Brix high of 17 was not stored. `r10_conflict_*.png`. |
| 5 (must-fix) never rounded | **Fixed** | Details below. |
| 13 (must-fix) no 500 on delete | **Fixed** | Details below. New gap 14 is an accessibility detail. |
| 11 (should-fix) off-category pack on lots | **Fixed** | API create: sack on fruit → 422 "must be pail or drum or case or bag or box"; sack/box on a Tablet fining → 422 "must be jug or bottle or bag or tub". Edit: PUT with `pack_name: "sack"` → 422 on both; the stored pack is unchanged (pail / tub). Receive into a new lot with `pack_name: "sack"` in the allocation: the request is accepted, but the lot is created with the offer's pack (tub · 333), so no wrong pack is ever stored. The field is ignored rather than refused. Grain sack (R11-PALE) and hop box (R11-HOP) lots → 201. |
| 2 (minor) Brix wording | **Fixed** | Brix (value or range) on a Liquid or Dry sugar product → "Brix is entered on Liquid sugar lots, not on the product". Brix on a Dry sugar lot → "Brix is only for Liquid sugars". A Liquid sugar lot with Brix 78.5 → 201. |
| 3 (minor) spice fl oz default pack | **Fixed** | The fl oz spice offer defaults to **bottle** ("Bottle size (fl oz)") at 1366 and 360. oz still defaults to bag. |
| 4 (minor) 1 decimal | **Fixed** | Details below. |
| 6 (minor) singular | **Fixed** | Lot table "1 tablet". Movement "−1 tablet". New order total "1 tub · 872 tablets". Receive picker "1 tablet on hand". |
| 7 (minor) whole-tablet wording | **Fixed** | Add lot, Record movement and Count show "[TEST-TEMP] Kettle Tabs KT-872 is counted in whole tablets" for 2.5 and 0.5, with Save disabled. For 0, Save shows "Enter at least 1 tablet" and nothing is sent. New gap 16 is a small leftover. |
| 8 (minor) tablets not each | **Partly fixed** | Details below. |
| 9 (minor) None in the Totals Manufacturer filter | **Fixed** | "None" is in the list (last), sends `manufacturer=none`, and returns exactly the 6 stocked None-manufacturer rows: 3 seeded, 3 mine. |
| 12 (minor) case duplicates and the name "None" | **Fixed** | "kt-872", "KT-872 " and " Kt-872" → 422 on create, and renaming KT-500 to "kt-872" → 422. "None", "none", "NONE" and " None " → 422 "'None' means no manufacturer; pick another product name". New gap 15 is about the wording. |

### Gap 5: never rounded (fixed)
Checked at 1366 and 360.

**Add lot**
- 0.5 tub of 333 → "[TEST-TEMP] Kettle Tabs KT-500 is counted in whole tablets", Save disabled.
- 3 tubs + 0.5 tablets, 2.5 tablets and 0.5 tablets → the same message, Save disabled.

**Count**
- Total: 0.01 tub of 872 (= 8.72) and 599.5 tablets → refused. 0.5 tub of 872 (= 436) → allowed.
- By lot: 0.01 tub and 599.5 tablets → refused.

**Record movement**
- 0.01 tub of 872, 1.5 tablets and 0.5 tablets → refused. 0.5 tub of 872 (= 436) → allowed.

**Receive**
- Only whole packs are accepted ("Whole tubs, 0 or more"), so Receive stays disabled for 0.5 or 1.5 tubs. That holds for the default lot, a new lot # and an existing lot # typed in.
- The API refuses a 0.5 + 0.5 split of a 333-tablet tub: "Enter whole tubs (1 or more)…".
- Receive's wording is its own whole-pack message rather than "counted in whole tablets", but nothing is ever rounded.

**Grain 0.5 sack**
- Add lot saves 25 lb at both sizes.
- On grain Receive, 0.5 sack is refused as "Whole sacks", the same rule as before.

### Gap 13: no 500 on delete (fixed)
- **UI:** the ingredient page shows a disabled delete icon and the text "[TEST-TEMP] Mango has products; deactivate them instead" (at 1366 and 360).
- **API, on my own rows:**
  - ingredient with products → 422 "…has products; deactivate them instead";
  - product with an offer and a lot → 422 "This product has offers or lots; deactivate it instead";
  - product with an offer only → 422 (same sentence);
  - company with products, offers and lots → 422 "This company has products, supplier offers and lots; deactivate it instead";
  - offer with lots → 204;
  - offer without lots → 204;
  - product with nothing left → 204;
  - lot with only its opening movement → 204;
  - lot with a later Used movement → 422 "This lot has movements after its first; correct it with a movement or a count", with nothing removed.
- No 500 anywhere.

### Gap 4: 1 decimal (fixed)
- Ions: "Ca 72.0 · Cl 127.4" on the ingredient page, the product page and the edit dialog (Ca = 72.0). Seeded Epsom shows "Mg 26.1 · SO₄ 103.0".
- Brix:
  - the lot label: "· 14.0 °Bx";
  - the lot table: 14.0 and 8.5 ⚠;
  - product ranges: "12.0–16.0 °Bx", Strawberry "6.5–9.0", Watermelon "12.0";
  - the list column, the Add lot hint "typical 12.0–16.0", and the edit dialogs (12.0 / 16.0 / 14.0).

### Gap 8: tablets not each (partly fixed)
- **Fixed:**
  - the order page total: "2 tubs · 1,372 tablets · $142.00";
  - the Receive "Goes to" picker: "400 tablets on hand", "1 tablet on hand";
  - a Totals line made only of Tablet products: "1,634 tablets", and "2,156 tablets" for my supplier;
  - the Add lot and Count labels: "Quantity · tubs of 872 tablets".
- **Not fixed:** the New order dialog's line helper still reads **"872 tablets tubs (5 lb)"**. Repro at 1366: New order → my supplier → the KT-872 tub offer → the helper under the Tubs box.
- Copy (TSV) still says `each` in the Unit column, which the brief allows ("each/tablets").

## Decided items and Q13

| Item | Result | Evidence |
|---|---|---|
| Form locked once a product has a lot | **As decided** | The edit dialog disables Form and shows "This product has lots, so its form stays Tablet" (and the same for unit). API: Tablet → Liquid, Purée → Whole and Liquid → Dry each → 422, and the stored form is unchanged. A product with no lots can still change form (200). |
| Receive "Goes to" default | **Matches grain and hops** | Same rule in every category: the newest existing lot of that offer's pack, otherwise "New lot #". Order 1164: grain → R11-PALE, hop → R11-HOP, fruit → MANGO-IN; Dry sugar and salt with no lots → New lot #. |
| Inactive products in category lists | **Matches grain and hops** | An inactive `[TEST-TEMP]` product in Grains, Hops, Fruits and Spices is listed the same way in all four: the row is shown with no marker, and there's no Show-inactive control in any of them. |
| Q13 recipe lot picker | **Now tested, passes** | The app lets a brewer add a brand and a recipe. I created my own `[TEST-TEMP] R1 Brand` with a recipe whose notes say `[TEST-TEMP] R1 recipe`, so no seeded brand got a child. In Add Ingredient → Fruits → `[TEST-TEMP] Mango` → Lot, the options read "…Mango Purée · [TEST-TEMP] MANGO-A · 8.5 °Bx · 2 pails · Available". The lot without Brix (MANGO-B) has nothing extra, and MANGO-IN shows "14.0 °Bx". Same at 1366 and 360. **Cancelled** both times (no write), then deleted the recipe and brand. |

## New gaps

### Gap 14 · minor · the disabled Delete Ingredient icon has no accessible name (R13)
- **Path:** ingredient page of an ingredient with products.
- **Expected:** a disabled Delete with its reason, available to assistive technology.
- **Observed:** the icon button has no `aria-label` and no tooltip (it was "Delete Ingredient" when enabled in pass 1). The reason is shown as page text only.
- **Size:** 1366 and 360.

### Gap 15 · minor · the duplicate refusal names the spelling typed, not the existing product (R12)
- **Path:** a new product "kt-872" where "KT-872" exists.
- **Expected:** "There's already a [TEST-TEMP] Kettle Tabs KT-872 with manufacturer None."
- **Observed:** "…Kettle Tabs **kt-872**…" (and "Kt-872" for " Kt-872"). This names a product that doesn't exist.
- **Size:** API, and the same text in the dialog.

### Gap 16 · minor · a negative tablet quantity says "Enter 0 or more" (R7)
- **Path:** Add lot on a Tablet product → tablets = −1.
- **Expected:** consistent with the rule "at least 1 tablet".
- **Observed:** "Enter 0 or more". Typing 0 then gives "Enter at least 1 tablet" when you press Save.
- **Size:** 1366.

## Regression sweep (R15)

| Scenario | Result | What I checked |
|---|---|---|
| Q3 | PASS | New Juice/concentrate gal product: low > high blocked ("Brix: low is above high"). Pail · 5 gal offer (gal → pail). Brix 8.5 saves and shows "outside typical 10.0–12.0" and ⚠. No Brix saves. 8.55 and 101 refused. Count "2 pails 1.5 gal" → 11.5 gal, taken off the oldest lot. |
| Q4 | PASS | Dry: unit locked to lb. The lot dialog copies extract 91 (edited to 90.5) and has no Brix field. Liquid lot dialog: extract 81.95 plus an optional Brix field. 3-decimal extract blocked. |
| Q7 | PASS | "Kettle Tabs · Tablet · tablets". "tub · 500 tablets (2 lb)". Note capped at 40 characters. Used in brewing 350 oldest-first: −300 from KT-LOT-1, −50 from KT-LOT-2, all whole. |
| Q8 | PASS | Mixed order (30 sacks, 6 boxes, 2 bags, 1 pail, 1 tub) through the UI. Running total "40 packs · 5 gal · 1,666 lb · 872 tablets · $2,777.00 / 40 of 40 packs". Receive prefilled extract 91 / 81.95, Brix optional. Split 0 → "Each lot needs at least 1 box. Remove the empty one." with Receive disabled until the empty lot is removed. On-hand deltas were exactly +1500 lb, +66 lb, +100 lb, +5 gal and +872 tablets. |
| Q10 | PASS | All rows: $3,848.96 = the sum of 40 rows, and the per-unit sums match. My supplier: $3,579.41 = the sum of 8 rows, with subtotals 2,156 tablets / 44.5 gal / 1,877 lb never added together. Copy has a Unit column. The Grains view keeps its layout (Grain/Maltster/lb/Sacks). Totals → Orders per pack name: "4 bags · 7 boxes · 2 pails · 33 sacks · 6 tubs", which I checked against the orders. |
| Q14 | PASS | 360 px with touch: 7 category lists, the fruit product page, Add lot with Brix, Edit/Add product, the offer dialog with note, tablet Count, Record movement, the salt page and ions dialog, the orders list, the mixed order page, New order, Receive, To order, Totals (both tabs), Contracts and Companies. `scrollWidth` was 360 on every one, and Save/Receive was reachable in every dialog. |

## Seeded baseline (Q12)

I took the baseline before creating anything (`results/recheck1/baseline_start.json`) and again after cleanup (`baseline_end.json`). It covers categories, ingredients, products, companies, offers, orders, contracts, To order, feature types and the seeded Totals rows. **0 differences**, the seeded Totals rows are identical (31 = 31), and there were no new non-`[TEST-TEMP]` rows. Brands are back to the 6 seeded ones and recipes to none.

## Settings

- RECHECK says to read the setting with `GET /api/me/board_settings`, but that path is a 404 (Phoenix NoRouteError) here. I read it from `GET /api/me` → `board_settings` instead.
- Start: `{}` for owner, owner2, breweryMgr, brewer1, brewer2, floater and splitRole (saved in `results/recheck1/settings_start.json`).
- I never clicked the Packs/Total toggle. At the end all 7 were still `{}`. **Nothing needed restoring.**

## My data (all `[TEST-TEMP]`) and cleanup

- **Companies:** 2279 R1 Supply Co, 2280 R13 Del Co. Both **deactivated**.
- **Ingredients:** 1665–1677.
- **Products:** 3319–3330 and 3332–3336. All **deactivated**. 3331 was **deleted** during the R13 test.
- **Offers:**
  - 4332–4341 and 4344 on my products, left on the deactivated products;
  - 4342 and 4343 were **deleted** during the R13 test.
- **Lots:** 2262–2278, plus the received lots on orders 1162 and 1165. Lot 2267 was deleted during the R13 test (204), and lot 2268 was kept because deleting it was refused.
- **Orders:**
  - 1162 R5-ORDER: received; one tub received, then the status went to received;
  - 1163 R8-ORDER: **cancelled**;
  - 1164 R14-GOESTO: **cancelled**;
  - 1165 R15-MIXED: received.

  No open orders are left.
- **Brand and recipe:** brand 1714 `[TEST-TEMP] R1 Brand` and recipe 79: both **deleted**.
- No subcategory or contract was created this time. Every destructive action was by exact id after reading the row back.
- Everything left over will be cleared by the next reseed.

## What I couldn't test

- Double-tap under slow network wasn't rerun (not in scope for this recheck).
- No D62 build was available for a side-by-side comparison; grain and hop screens were compared with pass 1 and the brief.
