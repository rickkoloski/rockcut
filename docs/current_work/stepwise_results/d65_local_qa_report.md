# D65 QA report: non-yeast ingredients on the product model (local)

- **Date:** 2026-11-21 (America/Denver), against the local app at http://localhost:5174. Nothing on `*.fly.dev` was touched.
- **Tester:** independent QA. I didn't read the app source. All checks went through the UI (Playwright) and the API, called from inside the page with `lib.js` `api()`.
- **Personas used:** owner, breweryMgr, brewer1, brewer2, floater, splitRole, bartender1, office1, barMgr, breweryDevice, taproomDevice. I didn't use owner2.
- **Overall: fail.** I found 2 must-fix gaps, 3 should-fix gaps and 8 minor gaps. 15 of the 18 scenarios passed. Q7 and Q18 failed, and Q13 is partial because the environment has no recipe to test it on.
- **Seeded data:** I took a baseline at the start and diffed it at the end. **No seeded row changed** (0 differences across categories, ingredients, products, companies, offers, orders, contracts, To order, feature types and seeded Totals rows).

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 2 | 5, 13 |
| should-fix | 3 | 1, 10, 11 |
| minor | 8 | 2, 3, 4, 6, 7, 8, 9, 12 |

## Gaps

### Gap 5 · must-fix · Add lot rounds a fractional tablet count without saying so (Q7)
- **Path:** Finings product in `each` (Tablet) → offer tub · 333 tablets → Add lot → Tubs = 0.5.
- **Expected:** `each` is whole numbers everywhere. 0.5 × 333 = 166.5 tablets should be refused ("counted in whole tablets"). It should never be stored as a different number from the one the user entered.
- **Observed:** Save stays enabled with no message. The POST sends `initial_quantity: "167"`, and the lot `[TEST-TEMP] KT-ODD` holds 167 tablets. The user entered 166.5 tablets' worth (0.5 tub). The API refuses 166.5 when it's sent directly ("…is counted in whole tablets"), so the UI rounds before sending. The Tubs box takes 2 decimals, so any pack size that 0.xx tubs doesn't divide evenly hits this (the seeded 872-tablet Whirlfloc tub with 0.01 tub gives 8.72, for example). The Count dialog has the same Tubs field with 2 decimals.
- **Repro:** product 2827, offer 3807 (tub · 333) → Add lot, Opening amount, Tubs 0.5 → Save.
- **Size:** desktop 1366×768.

### Gap 13 · must-fix · Delete Ingredient returns a 500 when the ingredient has a product (Q18, found during cleanup)
- **Path:** Ingredient page → Delete Ingredient → Delete, on an ingredient that has a product with an offer.
- **Expected:** either the button isn't offered, or a clear refusal like the ones used elsewhere ("This product has offers or lots; deactivate it instead").
- **Observed:** `DELETE /api/ingredients/1350` → **500** (Phoenix debug page: `Ecto.ConstraintError`). The UI shows "Something went wrong on the server. Please try again." The UI offers an action the API can't handle. It reproduced twice, once through the API and once through the UI.
- **Repro:** `[TEST-TEMP]` ingredient in my own subcategory, with one product (no lots) and one offer → Delete Ingredient. After I deleted the offer and then the product, the ingredient delete succeeded (204).
- **Size:** desktop.

### Gap 1 · should-fix · The duplicate-product refusal is above the visible part of the dialog (Q3)
- **Path:** Add product → same ingredient + form + manufacturer (including None) → Save.
- **Expected:** a clear refusal that names the product.
- **Observed:** the API answers 422 with "There's already a [TEST-TEMP] Mango Whole with manufacturer None." The dialog shows it as an alert at the top of the dialog, but at 768 px tall the dialog is scrolled to Save and the alert sits at y = −67 px, off screen. Nothing scrolls it into view. To the user, Save looks like it did nothing.
- **Repro:** Fruits → Add → Product → `[TEST-TEMP] Mango`, None, Whole, lb (already exists) → Save. Screenshot: `results/shots/q3_dup_Whole.png`.
- **Size:** desktop 1366×768.

### Gap 10 · should-fix · The edit-conflict refusal on a product is off screen too (Q16)
- **Path:** brewer1 and brewer2 both open Edit product on product 2820. brewer1 saves, then brewer2 saves.
- **Expected:** the second person gets a clear refusal.
- **Observed:** the refusal itself works: 409, nothing overwritten, and brewer1's note is kept. The message "Someone else changed this product since you opened it…" sits at the top of the tall dialog, outside the viewport, and brewer2 still sees the form with Save. The order dialog's conflict message is visible. Screenshot: `results/shots/q16_product_conflict.png`.
- **Size:** desktop 1366×768.

### Gap 11 · should-fix · The API accepts lots with a pack name outside the category (Q18)
- **Path:** `POST /api/ingredient_lots` with `pack_name: "sack"` on a fruit product (2820) or a Finings tablet product (2827).
- **Expected:** refused, the same way offers refuse it ("must be pail or drum or case or bag or box").
- **Observed:** 201 for both (lots 1934 and 1936). The fruit product's on-hand display falls back from "2 pails 1.5 gal" to "17.5 gal" after the sack lot is added.
- **Size:** API.

### Gap 2 · minor · The Brix refusal on a Liquid sugar product has the wrong wording (Q4)
`POST /api/ingredient_products` for Sugars, Liquid, with `brix` → 422 "Brix is only for Liquid products". The product *is* Liquid; the refusal itself is right (Brix belongs on Liquid **lots**, not products), but the message is wrong. The same message also appears for Brix on a Dry sugar lot.

### Gap 3 · minor · The offer dialog's pack is blank for a fl oz spice (Q5)
The brief says fl oz defaults to jug, but jug isn't a Spices pack name, so the Pack select is blank and the user must pick one. lb → bag, oz → bag, gal → pail and each → tub all prefilled correctly. The fl oz → jug default works in my Other Consumables child.

### Gap 4 · minor · Ions and Brix lose the 1-decimal format (Q6, Q13)
Ca entered as **72.0** is stored and shown as "Ca 72" (ingredient page, product page, and the edit dialog when reopened). The brief specifies 1 decimal. The same happens with Brix: lot 14.0 shows as "14.0" in the lot table but "14 °Bx" in the lot label, and seeded SO₄ 103 shows as "103".

### Gap 6 · minor · "1 tablets" (Q7)
A lot with 1 tablet reads "1 tablets" on the Lots table and in Movements ("−1 tablets"). The $/tablet singular is correct.

### Gap 7 · minor · The UI doesn't use the wording the brief specifies for whole tablets (Q7)
Add lot, Record movement and Count show "Use a whole number" for both 2.5 and 0.5. The brief expects "…is counted in whole tablets" and "at least 1 tablet", and the API does use those wordings.

### Gap 8 · minor · "each" where the product reads "tablets" (Q8, Q10)
- the order page total: "40 packs · **500 each** · 5 gal…", although the order dialog said "500 tablets";
- the Receive "Goes to" picker: "350 each on hand";
- Totals → Inventory and Orders totals: "1,617 each".

The rows on those same screens say "tablets". The Copy Unit column also says each, which the brief allows ("each/tablets"). There's also awkward wording: "Quantity · 500 tablets tubs".

### Gap 9 · minor · The Totals Manufacturer filter has no "None" (Q10)
Products with manufacturer None can't be filtered on their own.

### Gap 12 · minor · None-manufacturer duplicates that only differ in case, and a product named "None" (Q18)
For Kettle Tabs · Tablet · None:
- "KT-872 " (trailing space) is correctly refused;
- "kt-872" (lowercase) is accepted, so the list shows KT-872 and kt-872 as two products;
- the name "None" is accepted, which gives "[TEST-TEMP] Kettle Tabs None · None".

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Grains list ("Maltster", "sacks", specs), Hops list ("boxes", ranges), seeded grain (2-Row) and hop (African Queen) pages, Add lot and Count on my own grain and hop products, order + Receive, To order in sacks/boxes, Totals → Grains (Grain/Maltster/lb/Sacks). I had no D62 build to compare against side by side, so I compared against the brief's wording. |
| Q2 | PASS | Water Salts and Finings under Other Consumables. Whirlfloc in Finings. No Irish Moss or Future Ingredients. Fruits, Spices and Sugars show neither Add field nor Add subcategory (I polled every 50 ms while loading and neither appeared). API: 422 for both on all three. My `[TEST-TEMP] Clarifiers` subcategory offered the combined forms (Powder/Flake/Liquid/Tablet), units (lb/fl oz/each) and packs (bag/pail/tub/jug/bottle), and refused sack. I deleted it at the end. |
| Q3 | PASS (gap 1) | Purée gal + Whole lb, each with its own on hand. Brix low > high refused in the UI and by the API. pail · 5 gal offer. Brix 8.5 saved and marked ⚠ (outside 12–16). No Brix saved. 8.55 and 101 refused (UI + API). Count "2 pails 1.5 gal" → 11.5 gal, with the shortfall taken off the oldest lot. Duplicate refused, naming the product. |
| Q4 | PASS (gap 2) | Dry: unit locked to lb in the dialog; gal → 422 "Dry sugars are in lb". Extract 91 copied to a new lot and editable (saved 90.5). The Dry lot dialog has no Brix; Brix sent through the API → 422. Liquid in gal with 81.95: the lot offers optional Brix and saves both with and without it. Extract with 3 decimals refused (UI + API). |
| Q5 | PASS (gap 3) | Ground oz with bag · 16 oz; Extract fl oz with bottle · 32 fl oz. No feature fields. lb/gal/each/kg → 422. Form Powder → 422. Brix and extract → 422. Sack pack → 422. |
| Q6 | PASS (gap 4) | Salt with formula and Ca 72.0 / Cl 127.4 is shown on the ingredient and read-only on the product page. 2 decimals, 1001, −1, "abc" and an unknown ion are all refused, and in every case **nothing** was saved: the name and formula changes in the same PUT were not stored. Ions on Fruits/Finings/Other Consumables → 422. A None product saved; an identical None product (also with "" and "  " names) refused. |
| Q7 | **FAIL** (gaps 5, 6, 7) | Unit reads "tablets". "tub · 500 tablets (2 lb)". 41-character note: the UI stops at 40 and the API returns 422. 2.5, 0.5 and 0 refused (UI + API). Count whole: 1 tub 100 → 600, and 600.5 refused. Used in brewing 250 oldest-first across lots: −200 from LOT-1, −50 from LOT-2, all whole. Receive only takes whole tubs (1.5 → 422). $/tablet. Unit locked once a lot exists (UI disabled, API 422). |
| Q8 | PASS (gap 8) | One order mixing grain sacks, hop boxes, sugar bags, a liquid sugar pail and a tablet tub. Running total "40 packs · 5 gal · 1,666 lb · 500 tablets · $2,735.00" with target "40 of 40 packs". Receive prefilled extract (91, 81.95), Brix optional on the liquid, fining lot whole. On-hand rose by exactly +1500 lb, +66 lb, +100 lb, +5 gal and +500 tablets. A split of 0 showed "Each lot needs at least 1 box. Remove the empty one." and Receive stayed disabled. |
| Q9 | PASS | Minimum 1 tub with 600 tablets (tub · 872) → To order "0.69 tubs · min 1 · to order 1". Products with no stock show "0 tablets" and "0 gal". |
| Q10 | PASS (gaps 8, 9) | Filtered to my supplier: per-unit subtotals 1,617 each · 32 fl oz · 36.5 gal · 1,791 lb · 20 oz, never added together, and **$3,381.00 = the sum of the rows**. Unfiltered: $3,650.55 = the sum of 42 rows, and the per-unit sums match. Copy has a Unit column. The Grains view keeps its D62 layout. Totals → Orders reads per pack name: "2 bags · 6 boxes · 1 pail · 30 sacks · 1 tub". |
| Q11 | PASS | The contract dialog offers only my grain and hop products. The API refuses D65 products on POST and PUT, and on a mixed grain + sugar contract: 422 "Contracts are for grain and hops". A grain + hop contract on my supplier works. |
| Q12 | PASS | Spot-checks match the brief: Gypsum CaSO₄·2H₂O, Ca 61.5, SO₄ 147.4, $32.00/bag, None. Strawberry 11 lb $45.00 + 44 lb $116.50, 6.5–9 °Bx. Molasses 81.95 %. Whirlfloc T "tub · 872 tablets (5 lb)" $92.00. SoNature Lime has no Brix and no price. 10 spices. Hops: 28 lots / 409.6 lb. Start/end diff: 0 changes. |
| Q13 | PARTIAL | There's **no `[SEED]` recipe in this environment** (Dashboard shows 0 recipes; `/api/recipes` is empty for every brand), so I couldn't open the recipe lot picker. Creating a recipe under a seeded brand wasn't on the allowed list. The lot `label` the API supplies reads "… Mango Purée · [TEST-TEMP] MANGO-A · 8.5 °Bx", and a lot without Brix has nothing extra. |
| Q14 | PASS | At 360 px with touch: the D65 lists (cards), the fruit product page, Add lot with Brix, Edit/Add product, the ingredient dialog with ions, the offer dialog with pack note, the tablet Count, Record movement, the mixed order, the New order dialog, Receive, To order, Totals (both tabs), Contracts and Companies. `scrollWidth` was 360 on every one, and Save/Receive is reachable in every dialog. The Totals table scrolls sideways inside its card; the page itself doesn't. |
| Q15 | PASS | Slow-4G double-click plus a third click on Save: D65 product, Add lot, ingredient with ions, mixed order, and Receive each gave exactly one write. The API shows one record each, and the Receive deltas were exact. |
| Q16 | PASS (gap 10) | Product: the second save gets 409 and the first save is kept. Order: 409 with a visible message, and the first save is kept. Receive into existing lot # MANGO-A: "Adds to existing lot … Brix 8.5 °Bx" is shown read-only. API with Brix 9.0 → 422; with 8.5 → 200 (+5 gal). |
| Q17 | PASS | floater and splitRole see the Library and can use the pages and API (200; writes work). bartender1, office1 and barMgr have no Library in the nav, every page redirects them to `/`, and all 13 API routes plus the writes return 403. breweryDevice and taproomDevice get 403 ("Not available on a shared device") and the pages say so. splitRole's lot without a supplier was refused once the product had an active offer (brief item 9). |
| Q18 | **FAIL** (gaps 11, 12, 13) | These held up: wrong-category pack names on offers (salt jug, Finings pail, fruit jug, sugar bottle, child sack) are refused. The unit can't change on a fruit product with lots. A PUT that would create a None duplicate is refused. Brix on salt/spice lots and extract on fruit lots are refused. Count by lot 599.5 tablets is refused. A mixed-unit ingredient keeps per-product units (4 bags / 4 gal). Back keeps `?category=` for children (Finings and my child). |

## Data I made (all `[TEST-TEMP]`) and cleanup

- **Company:** 1965 `[TEST-TEMP] D65 Supply Co` (manufacturer + supplier, target 40). **Deactivated.**
- **Ingredients:** 1342 Mango, 1343 Cane Sugar, 1344 Invert Syrup, 1345 Cardamom, 1346 Hydrous CaCl2, 1347 Kettle Tabs, 1348 Pale Malt, 1349 Hop X, 1351 Slow Salt. 1350 Clarifier A was **deleted**.
- **Products:** 2820–2832 and 2834–2837. All **deactivated**. 2833 was **deleted**.
- **Offers:** 3800–3814. 3815 was **deleted**. They're left in place on the deactivated products.
- **Lots:** 1909–1936 (28 lots). 1919/1920 came from probes the API accepted; 1934–1936 are the gap-11 and supplier probes.
- **Orders:**
  - 1023 PO-MIXED-1 (received);
  - 1024 PO-ODD-1 (**cancelled**, by id after a read-back);
  - 1025 PO-SLOW-1 (received);
  - 1026 PO-MANGO-1 (received 1 of 2 pails; its status went to "received").

  No open orders are left.
- **Contract:** 284 `[TEST-TEMP] contract` (2026, Pale Malt + Hop X). It's left in place; I found no cancel option. The contract dialog said up front that saving would set my offers 3808 and 3809 to the contract prices. I set 3809 back to $150.
- **Subcategory:** 121 `[TEST-TEMP] Clarifiers`, with its field. **Deleted.**
- **Minimums:** set only on my products 2828, 2829, 2830, 2831 and 2832.
- Everything left over will be cleared by the next reseed.

## Settings

- **brewer1 display toggle:** I changed it by accident in Q18. Clicking "TOTAL" on the Sugars list saves a per-user setting (`PUT /api/me/board_settings/ingredients`), and **I hadn't read it first**, which the brief asked for.
  - Before that click, every brewer1 screen showed packs + unit. The other personas' `board_settings` are `{}`, so the original was almost certainly unset, which behaves as packs.
  - I set it back to `"packs"`. The UI and API have no way to clear it to unset (`DELETE` is 404), so it now reads `{"ingredients":{"quantity_display":"packs"}}` instead of `{}`. It behaves exactly as before; the next reseed resets it.
- No other persona's settings were changed.
- Separately, a script mistake briefly set the name "1" on my own products 2830 and 2832. I corrected both at once. No seeded row was affected.

## What I couldn't test

- **Q13 recipe lot picker UI:** there's no `[SEED]` recipe locally. I checked only the lot label the API supplies.
- **D62 side-by-side:** no D62 build was available. "Reads as D62" was judged against the brief's wording ("sacks", "boxes", "Maltster", the Grains Totals layout).
- **Double-tap on a phone under slow network:** Q15 used desktop double-click plus a third click. Q14 covered touch at 360 px, but not combined with throttling.
- **Load flash of Add field/Add subcategory:** sampled every 50 ms on a normal network, not on a throttled one.
- **Email, push and service worker:** out of scope (local).
- **owner2:** not used.

## Other notes (not gaps)

- A product with two offers of different pack sizes (500 and 333 tablets) shows only tablets ("1,017 tablets", Packs "—" in Totals).
- Form can change after lots exist (Tablet → Liquid), only the unit is locked; the label then switches from "tablets" to "each".
- A lot can be given a supplier with no offer on the product (BSG on my Mango Purée).
- Receive "Goes to" defaults to the newest existing lot for D65 products; new grain and hop products default to New lot #.
- Brix with only a low value saves as an open range.
- Deactivated products still appear in the category lists.
- Evidence: screenshots in `results/shots/`, and the baselines in `results/baseline_start.json` / `results/baseline_end.json`.
