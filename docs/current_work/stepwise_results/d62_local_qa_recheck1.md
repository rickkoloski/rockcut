# D62 QA recheck after fix cycle 1 (local)

- **Date:** 2026-11-20 (America/Denver), against http://localhost:5174 after a fresh reseed with re-minted logins. No source read. I tested through the browser (Playwright) and the API only.
- **Personas used:** brewer1, brewer2, breweryMgr, owner, bartender1, office1, barMgr, breweryDevice, taproomDevice. I also read the settings of owner2, floater and splitRole.
- **Verdict:** **pass with gaps.**
  - 11 of the 12 pass-1 gaps are fixed. Gap 7 behaves exactly as the by-design rule says.
  - 6 new gaps: 1 must-fix (16), 1 should-fix (17) and 4 minor (13, 14, 15, 18).

## Pass-1 gaps

| Gap | Result | What I saw |
|---|---|---|
| 1 duplicate message | **fixed** | The UI and the API (422) both read only the sentence: "[TEST-TEMP] QA Supply Co already has T90 Pellet [TEST-TEMP] Citrine." |
| 2 range wording | **fixed** | Ranges read "11–13 %", "20 %" (equal ends), "≥ 12 %" (low only) and "≤ 9 mL/100 g" (high only) on the product page, and "typical 20 / ≥ 12 / ≤ 9" in the Add lot captions. List columns read 20 / ≥ 12 / ≤ 9. Phone cards read "α 20 % · β ≥ 12 % · oil ≤ 9", and a product with only alpha reads "α 9–10 %" (blank ranges left off). |
| 3 hop offer form | **fixed** | Order and Add lot pickers read "… · box · 11 lb" with no form. All 28 hop offers have `form: null`. Sending `form` on a hop offer (POST, PATCH "whole", PATCH "crushed") → 422 "Only grain offers are milled or whole". To order's picker still drops "box" (new gap 15). |
| 4 Totals mixes hops into grain | **fixed** | Category offers All categories / Grains / Base / Crystal/Caramel / Kilned / Specialty / Roasted / Hops. The general view's headings are Ingredient, Manufacturer, Form, On hand, Packs, Value, $/unit, with hops in boxes ("6.45 boxes") and grain in sacks ("13 sacks"). Grains and its children give the D61 view (Grain, Maltster, Category, lb, Expired lb, Sacks, $/lb, Value). Copy follows the view, and the general Copy adds Product, Unit, Expired, Pack and Estimated. Totals add up: all 3,550.6 lb / $3,501.75, Grains 3,047.5 lb / $2,099.25, Hops 503.1 lb / $1,402.50. Unvalued lb: 1,124.6 / 715 / 409.6. scrollWidth is 360 at 360 px. |
| 5 maltster pickers list hop companies | **fixed** (gaps 13, 14 are new) | The library Maltster filter on Grains lists only the 7 maltsters + mine, and the Manufacturer filter on Hops lists only the 6 hop companies + mine. The Totals filter follows the category ("All maltsters" vs "All manufacturers"). Product dialogs list the category's manufacturers plus the product's current one: a grain product made by my hop grower shows the grower in its Maltster list. "Other manufacturer…" leads to the full list, and I used it to pick `[TEST-TEMP] QA Hop Grower` (no products) for new product 797. The settings menu reads "Manufacturers, suppliers, partner breweries". |
| 6 Orders list "Sacks" | **fixed** | The column is "Packs": "4 sacks" (all-grain), "36 packs" (mixed), "2 boxes" (hops only). |
| 7 lot repricing | **by design, unchanged** | See R7: a topped-up lot is valued at the latest price paid, for grain and hops. Not rated. |
| 8 360 px line pickers | **fixed** | The order picker reads "[TEST-TEMP] Citrine T90 Pellet · [TEST-TEMP] QA Supply Co · [TEST-TEMP] Citrine T90 · box · 11 lb", and the contract picker reads "… Citrine T90 Pellet · [TEST-TEMP] QA Supply Co". Options and the chosen value wrap (white-space normal, no overflow), and scrollWidth is 360. |
| 9 concurrent product edits | **fixed** (gap 17 is new) | On hop 795 and grain 796, the second save → 409 "Someone else changed this product since you opened it. Close and reopen it to see their change." with nothing written. The 409 refetches, so closing and reopening the dialog (even without a page reload) shows the first change, and the next save works. The SET-minimum and ranges-Edit paths are version-checked too. A PUT without `lock_version` → 422 "can't be blank". A slow-network double-click → 1 PUT. |
| 10 existing lot # drops specs | **fixed** (gap 16 is new) | Receive → New lot # " [Test-Temp]g1  " / "[TEST-TEMP]H2 " / "  [test-temp]h1 " shows "Adds to existing lot [TEST-TEMP]H1", with "Crop year 2025 · Alpha acid 12.00 %" (or "Extract 80.0 % FGDB · Color 2.50 °L") read-only. The receipt landed in the existing lot. Specs typed before the number matched are not sent. The API refuses a different crop year, alpha, color or extract with 422 "Lot [TEST-TEMP]H1 already exists with crop year 2025, alpha acid 12.00; use a new lot number or leave its values" and writes nothing. The same values (12.00 vs 12, 2.50 vs 2.5, case/spaces) are accepted. |
| 11 Totals → Orders adds sacks + boxes | **fixed** | Rows, subtotals and the total read "6 boxes · 30 sacks". The footnote reads "packs" when mixed, "boxes" with hops only, "sacks" with grain only. Copy has Boxes ordered/received and Sacks ordered/received columns, with only Boxes columns when only hops are shown. Totals checked: 19/17 boxes, 39/35 sacks, 2,354 lb, $5,230.50. |
| 12 To order "0 boxes" | **fixed** | Empty hop product 797 and grain product 798 read "0 lb". |
| Hops subcategory | **fixed** | The Hops page has no "Add subcategory", and Hops isn't in Parent on Add or Edit category. POST a child of Hops → 422 "Hops has no subcategories" (owner and brewer1). The tree is unchanged at 13 categories, and nothing was created. |

## New gaps

### Gap 16 · must-fix · R5: 500 when an existing-lot receipt carries a spec the lot has blank
- **Path:** `POST /api/purchase_orders/:id/receive` with an allocation whose `lot_number` matches an existing lot of the product, and whose `features` includes a spec the lot has no value for.
- **Expected:** The same 422 as other mismatches ("Lot … already exists with …"), or acceptance.
- **Observed:** **500 ArgumentError** (Phoenix error page). It happens for:
  - beta acid 4 or total oil 2 on hop lot H1 (alpha 12, beta/oil blank);
  - diastatic power 140 on grain lot G1 (extract/color only).
  
  Nothing is written: the order stays open and the lots and movements are unchanged.
- **Reach:** I couldn't trigger it from the UI. When the lot # matches, the dialog hides the spec fields and sends none, even if they were typed before. Per the brief, any 500 is must-fix.
- **Repro:** Order 1 box of a hop product whose lot H1 has no beta. Then POST receive with `allocations: [{ lot_number: "H1", packs: 1, crop_year: <H1's>, features: { alpha_acid_pct: { value: <H1's> }, beta_acid_pct: { value: "4" } } }]`.

### Gap 17 · should-fix · R9: To order's offer pick stuck after someone else edits the product
- **Path:** Purchasing → To order → Offer picker on a row (it saves the product's reorder offer).
- **Observed:**
  - brewer1 had To order open. brewer2 then saved product 797 (origin). brewer1 then picked the other offer.
  - Result: `PUT … {"reorder_offer_id":1156,"lock_version":5}` → 409, and the page shows "Someone else changed this product since you opened it. Close and reopen it to see their change."
  - There's nothing to close on this page, and the page doesn't refetch. Picking again sends the same stale version and gets 409 again.
  - The picker shows the old offer. Only a full page reload lets the pick save (lock 6 → 7).
- **Data:** Nothing is written or lost. The user is just stuck with an instruction that doesn't apply here. Desktop.

### Gap 13 · minor · R2: "Other manufacturer…" looks like it does nothing
- **Observed:** Choosing "Other manufacturer…" (grain and hop product dialogs, desktop with a mouse) closes the picker with the old value still shown, so nothing visibly happens. The full list (15 companies, hop and grain) only appears if you open the picker again.

### Gap 14 · minor · R2: grain Maltster picker says "Other manufacturer…"
- **Observed:** In the grain Add/Edit maltster product dialog, the "Maltster *" picker ends with "Other manufacturer…".
- **Why it's a gap:** It's new wording on a grain screen, and D61 had no such item. The brief's rule is that only Companies may read "Manufacturer" on grain. I rated it minor because the item itself is the intended fix.

### Gap 15 · minor · R3: To order's offer picker drops "box"
- **Observed:** To order's offer picker reads "[TEST-TEMP] QA Supply Co · [TEST-TEMP] Citrine Cryo · 11 lb". The order and Add lot pickers read "… · box · 11 lb". The grain offer reads "… · 50 lb" there too.

### Gap 18 · minor · R8: contract price-change line repeats the company
- **Observed:** The new contract dialog's "Saving changes these offer prices:" line reads "[TEST-TEMP] QA Supply Co [TEST-TEMP] Citrine T90 Pellet · [TEST-TEMP] QA Supply Co price becomes $159.50 from 2026-11-20". That's the supplier name followed by the new variety-first label, which ends with the manufacturer. The figure itself is correct.

### Noted, not rated
- **To order caption:** The caption's pack word comes from the rows' offers. Hop-only rows without an offer read "in whole sacks", rows with offers read "boxes" or "packs" (mixed), and an empty list reads "sacks".
- **Orders list header:** It reads "Packs" even when every order is grain ("4 sacks" in rows). That's per the fix description.

## Scenarios

| # | Result | Notes |
|---|---|---|
| R1 | PASS | Gaps 4 and 11 fixed. Mixed order 331 (30 sacks + 6 boxes) was received, with grain into G1 and hops into new lot H2 (2026, 12.5). Every category filter and Copy was read. Desktop and 360 px. |
| R2 | PASS (gaps 13, 14) | Covered every maltster/manufacturer filter and picker. "Other manufacturer…" let me pick a product-less grower, and the duplicate message is fixed. |
| R3 | PASS (gap 15) | Offer labels, the 422 for a form on a hop offer, the Orders list Packs column, To order "0 lb", the range wording, and the 360 px pickers. |
| R4 | PASS | Two browsers on hop 795 and grain 796: refused with the sentence, nothing written, and reopening shows the first change. Slow double-click → 1 write. |
| R5 | PASS (gap 16) | Case and space matching, read-only values and caption, API 422 on mismatch, same values accepted, hops and grain. |
| R6 | PASS | Hops subcategory is hidden in the UI and refused by the API. |
| R7 | recorded | By design. **Grain G1:** 2,552.5 lb @ $0.90 ($2,297.25) + 1 sack @ $110 → 2,607.5 lb @ **$2.0000** = **$5,215.00**. **Hops H1:** 60.5 lb @ $15 ($907.50) + 1 box @ $176 → 71.5 lb @ **$16.0000** = **$1,144.00**. Both lots are valued at the most recent price paid. Also, H1 was "$412.50 est." when it was opened without a cost, and the first receipt into it made it valued, no longer "est.". |
| R8 | PASS (gap 18) | **Grain (Q1):** list, page, dialogs, order "4 of 40 sacks", Receive, To order and Totals read as D61, at desktop and 360 px. **Mixed order and receive (Q6):** checked. **Contract 111:** 100 sacks @ $48 + 440.5 lb @ $14.50 = "440.5 lb = 40.05 boxes", "$159.50 / box", price row $159.50 "Contract 2026" from 2026-11-20. Totals 100 sacks · 440.5 lb, $11,187.25. **On-contract 3 boxes:** on order 33 lb, then received 99 lb, $1,468.50, remaining 341.5 lb. brewer1 sees no write buttons, and POST/PUT → 403. **Q9 (owner):** Galaxy 6 boxes 5 lb = 71 lb, MB030, 2025, 17.60 ⚠ vs 11–16; Citra Cryo 26.9; Magnum 0.6 lb. **Access:** 30 routes × bartender1/office1/barMgr/breweryDevice/taproomDevice = 150/150 403. The persona pages redirect to Home, and the device pages say "Not available on a shared device". |
| R9 | PASS (found gap 17) | Covered the stale-version handling, lot # edge cases (Add lot with an existing #, the same new # twice in one receipt), hops-only pack totals and Copy, the cancelled filter, and as-of dates. |

## Seeded hops: final diff
At the start I baselined all 27 seeded hop products (ids 386–412), their 28 lots and 28 movements (409.6 lb). The final diff (`scripts/seedcheck_r.js` against `results/baseline_r_*.json`) printed **`seeded hop products checked 27 diffs 0`**. Products, lots and movements are unchanged.

## Data I made (all `[TEST-TEMP]`) and clean-up
- **Companies:** 568 QA Supply Co (manufacturer + supplier, target 40), 569 QA Partner Brewery, 570 QA Hop Grower. All **deactivated**.
- **Ingredients / varieties:** 311 Citrine (hop), 312 QA Pale (grain, Base). Left for the reseed, since there's no deactivate.
- **Products:** 795 Citrine T90 Pellet, 796 QA Pale (renamed "[TEST-TEMP] B name" in R4), 797 Citrine Cryo (QA Hop Grower), 798 Grower Pale (grain, QA Hop Grower), 799 Citrine Whole leaf. All **deactivated**.
- **Offers:** 1152 (hop → 795), 1153 (grain 55 lb → 796), 1154 and 1156 (hop → 797), 1155 (grain 50 lb → 798).
- **Lots:** 647 G1, 648 H1, 649 H2, 650 H5.
- **Orders:** 331, 333–339 received. 332 and 340 **cancelled** (each read back first). **No open orders left.**
- **Contracts:** 111 (2026). Left for the reseed, since it has receipts.
- **Not created:** no category. The Hops child was refused.
- **Seeded rows:** never edited. Seeded hops were only read, and I cancelled every dialog I opened on them.

## Settings
- **Before:** `board_settings` was `{}` for brewer1, brewer2, owner, owner2, breweryMgr, floater and splitRole.
- **This pass:** I didn't touch the display toggle, because in pass 1 the API couldn't restore `{}` exactly.
- **After:** all 7 are still `{}`, byte-exact.

## Couldn't test
- **Gap 16 from the UI:** I found no UI path that sends a spec to a matched lot.
- **D61 itself:** not available, so "reads as D61" means it matches the D61 wording described in the brief and my pass-1 observations.
- **Out of scope:** email, push and service worker.
