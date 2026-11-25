# D63 independent QA pass: DEV

- **Date:** 2026-11-25. **Build:** `d3fc7e6` (ribbon seen on every page opened).
- **Personas used:** owner, owner2, breweryMgr, brewer1, brewer2, floater, splitRole, barMgr, bartender1, office1, taproomDevice, breweryDevice.
- **Verdict: pass with gaps.** No 500 was seen on any route. Both gaps are small, but **gap 2 needs Matt's decision**: read literally, the brief's must-fix rule covers it (see below).

## Summary

| # | Result | Notes |
|---|---|---|
| D1 | Pass | Smoke, catalog and migrated values match the brief; baseline saved |
| D2 | Pass | Use order, stock, counts, second form, hide used-up |
| D3 | Pass | Two people, quick taps and drags, slow network, blocked save |
| D4 | Pass | g and mL, order, receive, count, To order, Totals |
| D5 | Pass | Limits, text, comma, decimals, two editors, double-click |
| D6 | Pass | Every listed persona behaved as the brief says |
| D7 | Partial | Gap 1; several brink confirmations could not be opened (below) |
| D8 | Pass | 360 px, touch, service worker active |
| D9 | Partial | Gap 2; seeded diff clean; cleanup limited by history |

**The check counts in `progress.log` (22, 45, 32, 24, 58, 40, 24, 45) are my estimates, not tallies.** The results themselves are real; take the numbers as rough.

## Gaps

### Gap 1 (minor): a deleted product's page always says "Maltster product not found"
- **Path:** Ingredient Library → a hop (or process aid) product → Delete → Back, or open its URL again.
- **Expected:** wording that fits the product ("Product not found" or "Hop product not found").
- **Observed:** "Maltster product not found. It doesn't exist, or it was deleted." for a hop **and** for a Process Aids product. The rest is right: no raw error, and a Back to Ingredients button.
- **Repro:** from scratch on desktop and phone, products 1548, 1553 (hop) and 1554 (process aid), all deleted.

### Gap 2 (minor, **classification question**): the API lets a product with lots change hop; the edit dialog never does
- **Path:** `PUT /api/ingredient_products/:id` with another `ingredient_id`, as brewer1.
- **Observed:** 200. The product's lots leave one use list and join the end of the other (verified: X1, C1, C2), and stock still equals its movements. In the Edit dialog the Hop field is disabled, with or without lots. A form change with lots is refused by the API (422), as in the UI. A cross-category move is refused (422).
- **Why a question:** the brief says lots that move join the end of the new list, so server support looks intended. But the must-fix rule also lists "an action the UI offers but the API refuses (or the reverse)". If the disabled Hop field means "not allowed", this is must-fix; if it only means "not offered", it is nothing.
- **Repro:** product 1543 moved from hop 1135 to 1145 and back. API only, both times on my own rows.

## What passed

- **D1:** all pages listed in the brief load by URL and after reload, no console errors. (The only error was a 404 from `/ingredients/purchasing`, a URL I guessed.) Pilsner, Acidulated, Oats, DME, dextrose, lime, EKG, calcium chloride, Pink Boots, spices and process aids all match. Summit Cone: A used up, B Expired with stock, C "In use". Settings match the table. Every lot's on hand equals its movements.
- **D2:** drag, arrows, keyboard (including Escape), phone arrows and long-press (touch events sent through CDP). New and older-dated lots go to the end. Receiving (Record movement and an order receipt), counting and editing a received date never move a lot. In use order spills over two lots and skips Expired; an expired lot can be used by hand. Count over goes to the newest non-expired lot; all expired is refused. Used-up lots keep their place; Hide used-up is per account and independent of packs/total.
- **D3:** the stale person gets "The use order changed since you opened it. This is the order now; move the lot again." with the new order shown. Six quick taps, four taps on one arrow and two quick drags, with and without `slow`: nothing lost, UI equals server, one "In use". A blocked save restored the old order with a sentence.
- **D4:** 2 bags = 500 g received, counted to 480, used 12.5 (467.5). Footer reads "36 packs · 20 bricks · 500 g · 11 lb · 10,000 mL · 12 pitchables". To order rounds up to whole packs; Totals has g and mL subtotals.
- **D5:** all minimums and all maximums accepted together. Every one of the 23 number fields refuses below, above, text, empty, comma, too many decimals and scientific notation in the dialog, with no change stored. The API refused each (422). Zinc 0.75 is stored as 0.09375 and 1 as 0.125. Conflicts keep typing, show "Now: 0.4 bbl", and Save again works. Double-click on Save made one save.
- **D6:** brewery members and the brewery device see settings without Edit; breweryMgr and owner2 have Edit (the owner edited in D5). Taproom and office get Home and 403; a taproom tablet shows "Not available". Use-list writes: the members and the manager I tried get 200; the brewery device and everyone else get 403.
- **D7:** Back closes a confirm alone (over a dialog, and on product, ingredient, recipe and brand), and the page stays. Back during a slow save and a slow delete lands correctly. Saving a product, ingredient, offer or lot that brewer2 deleted says "... was deleted, so it can't be saved." and keeps the typing.
- **D8:** no sideways scroll on 11 pages at 360 px; movement, count, add lot, offer, edit, order and settings dialogs fit. Deep link, reload, back and forward work.
- **D9:** malformed use-list and settings requests (duplicates, missing, foreign and used-up lots, bad versions) are refused with no change.

## UI or API only

- **UI:** the first hop and products, g/mL ingredients and offers, orders and receiving, movements, counts, lot edits, reordering, settings edits, Back and stale-save checks.
- **API only:** most extra lots, the yeast products, the two companies, second-person deletes, the concurrent add and use-up in D3, access PUTs in D6, cleanup, gap 2.

## Not tested

- **Brink History hiding voided records:** no voided record could be made or recognised. History of YB1, YB2, YB3 and my own brink opened normally.
- **Back on Dump, Mark clean and Retire:** the first two were disabled on my empty brink; Retire was not opened. Only Delete brink was tried.
- **Other categories keep "Oldest first", grain behaves as before:** I did not check those dialog labels.
- **Count by lot on a hop:** dialog opened, not saved.
- **Page buttons on one line:** judged by eye on the product and settings pages only.
- **Settings sentence for `source_water_name`:** the server ignores an empty one (200, nothing changed).

## Ids and cleanup

- **Deleted:** hops 1140, 1141, 1142, 1143, 1144, 1145, 1146 and process aid 1147; products 1542, 1543, 1548-1554 except those listed as left; lots 1413, 1416, 1417, 1419, 1420, 1421, 1424, 1425, 1426, 1427, 1428; offers 2048, 2049; brand 7737; recipe 85; brink 175; company 1122.
- **Left, deactivated (stock set to 0, they have history):** company 1121; products 1541, 1544, 1545, 1546, 1547; offers 2043-2047; lots 1412, 1414, 1415, 1418, 1422, 1423. Ingredients 1135, 1136, 1137, 1138 and 1139 stay, because they have products. Order 506 stays (received).
- **Seeded diff vs D1:** no seeded ingredient, product, lot, movement, use list, brink, brand, company or category changed. The only differences are the settings' `updated_at` and `lock_version` (22 to 34, from my edits) and my order 506.
- **Settings:** back at the table, checked. Hide used-up is on for brewer1 and brewer2; packs is selected for both.
- **After gap 1's repro:** hops 1146 and 1147 were deleted.
