# D63 QA recheck 1

**Date:** 2026-11-25 (local). **Result: PASS WITH GAPS** (no must-fix; one should-fix, one minor).
**Personas:** brewer1, brewer2, breweryMgr, owner (snapshots only). Check counts are approximate.

| # | Result | Notes |
|---|---|---|
| R1 | PASS | Gap 1 of pass 1 is fixed to the corrected rule. 32 checks, UI counts |
| R2 | PASS | Gap 3 of pass 1 is fixed. Gap 5 (minor) noticed beside it |
| R3 | FAIL | Gap 6 |
| R4 | PASS | Gap 4 of pass 1 is fixed |
| R5 | PASS | |
| R6 | PASS | |

## Gaps

### 5. minor: a raw internal error comes back after a recipe delete
- **Path:** own brand → recipe page → Delete Recipe → Delete; again on Back.
- **Expected:** no call for the gone recipe, or a plain error. **Observed:** `POST /api/formulas/execute` is sent for the deleted recipe and its 200 body holds `"runtime_error"`, "** (Ecto.NoResultsError) expected at least one result". The page itself says not found and shows none of it.
- **Repro:** `scripts/r2c.js`, recipes 165 (desktop) and 166 (phone). Seen both times.

### 6. should-fix: Save on a product someone else deleted doesn't say why (R3)
- **Path:** brewer1 opens Edit hop product and types in Notes; brewer2 deletes the product (by API); brewer1 clicks Save.
- **Expected:** a sentence saying why (it was deleted). **Observed:** "Request failed with status code 404". The dialog and the typing stay, also after a refocus; reload then says not found.
- **Repro:** `scripts/r34.js`, desktop and phone, a fresh product each. My script's own check scored this "ok" because any message passed; I failed it on reading the text.

## Details
- **R1 (hop and grain):** wording right in all 10 dialogs. Newest Expired, and newest Expired and used up: extra to the newest that isn't expired. All expired: refused with "Every lot is expired; count by lot instead". All used up: to the newest. On hand = movements each time. Lots were expired by API.
- **R2 (desktop and phone):** product, ingredient, brand, recipe, batch, category (as breweryMgr): no not-found flash while leaving (watched with a DOM observer, which can miss a paint-only flash), right landing page, gone from the list, Back says not found with no buttons. Except for the recipe, I reached each page by an in-app URL change rather than clicking a list row. Other rows: opened only my own R Brand after the recipe deletes. Refused deletes stay with a sentence: ingredient with a product, product with an offer, brand with a batch. Forward on the phone stays, as known.
- **R4:** lb, oz, g, mL, brick, pitchable and tablets. With a note typed each previews it: "bag · 250 g (my note)". Only tablets and bricks show an example without a note: "tub · … tablets (5 lb)" and "brick · 1 (500 g)". Not called a gap: both read as example weights for those packs. **Not checked:** fl oz (my set-up unit was refused). A grain offer has no note field.
- **R5:** Pitch on my own yeast into my own batch: 4 took 3 from the oldest and 1 from the next; 9 refused ("more than the 4 bricks on hand"); by hand works; stock right; dialog fits 360 px and Back closes it. An Expired yeast lot was not tried.
- **R6:** same name again makes a new row and the old id is not found; delete two then Back: each deleted page says not found with the list between; slow double-click on Delete sends one request (desktop and phone). Ingredients only.

## Clean-up
- Seeded diff against the recheck baseline: **0 differences** in baseline rows. No seeded write was made. The settings row was not touched.
- **Left, deactivated:** products 7589, 7590, 7592, 7593, 7594, 7595, 7597, 7598, 7602; company 5082.
- **Left, app won't delete:** ingredients 4364, 4365; lots 5090, 5092, 5093, 5096, 5097, 5099, 5100, 5102, 5103, 5106, 5107, 5109 (some keep stock); offer 8730.
- **Deleted:** products 7588, 7591, 7596, 7599–7601, 7605–7612 (and the two R3 race products); lots 5091, 5094, 5095, 5098, 5101, 5104, 5105, 5108, 5110, 5111; pitches 6777–6779; ingredients 4362, 4363, 4366–4383 except where listed above; brands 4928–4933; recipes 165, 166; batches 6337–6339; categories 247, 248; company 5081.
- **Two slips in my clean-up scripts:** three `DELETE /api/inventory_movements/<my id>` calls to a route that doesn't exist (404), and a second DELETE of my own already removed pitch 6778 (404). Both were on my own rows and changed nothing.
- Every name I made starts with `[TEST-TEMP]`, product names included, except products I left unnamed (7588, 7601) and recipes, which have no name.
