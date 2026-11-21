# D61 QA report: Purchasing (local)

- **Date:** 2026-11-18 (America/Denver), local app at http://localhost:5174, freshly reseeded
- **Tester:** independent QA pass (black box: UI with Playwright plus the API as each persona; app source not read)
- **Personas used:** owner, breweryMgr, brewer1, brewer2, floater, splitRole, barMgr, bartender1, office1, breweryDevice, taproomDevice (owner2 not needed)
- **Sizes:** desktop 1366×768 unless noted; every new page and dialog also at 360×780 with touch (Q14)
- **Verdict:** **fail.** There is 1 must-fix (gap 18: the UI offers Delete on a contract with receipts, then the API refuses it). It's a small fix and nothing gets corrupted, but it meets the brief's must-fix rule. The main paths all work. No inventory or money figure was wrong on any path a user can reach.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 1 | 18 |
| should-fix | 8 | 2, 3, 5, 10, 11, 12, 13, 17 |
| minor | 8 | 1, 4, 6, 7, 8, 9, 15, 16 |
| withdrawn | 1 | 14 (the app does this on purpose; see below) |

| Scenario | Result |
|---|---|
| Q1 New order, totals, order target | PASS |
| Q2 Edit / cancel, read-only after, 409s | PASS |
| Q3 Receive in full into previous lot | PASS |
| Q4 Short and zero receipt | PASS |
| Q5 Split receipt, new lot specs, mismatch refused | PASS |
| Q6 Lot # matching, expired, sack size | PASS (gap 1, minor) |
| Q7 Contracts, price rows, read-only for brewer1 | PASS |
| Q8 Contract on order / received / remaining | PARTIAL (gaps 2, 3) |
| Q9 Minimum, Below minimum, To order, Start an order | PASS (gap 4, minor) |
| Q10 Inventory totals, As of, filters | PARTIAL (gaps 5, 6, 7) |
| Q11 Order totals, filters, Copy | PASS (gaps 8, 9, minor) |
| Q12 D60 follow-ups | PARTIAL (recipe lot picker not testable) |
| Q13 Number and date rules | PARTIAL (gaps 10–13, 15) |
| Q14 360 px | PASS (gap 16, minor) |
| Q15 Slow network double-submit, concurrent receive | PASS |
| Q16 floater, splitRole, owner | PASS |
| Q17 bartender1, office1, barMgr refused | PASS |
| Q18 Shared devices refused | PASS |
| Q19 Open hunt | PARTIAL (gaps 17, 18) |

## Gaps

### Gap 18 (must-fix): Delete contract is offered on a contract that can't be deleted
- **Path:** breweryMgr → Purchasing → Contracts → 2026 contract that already has receipts → Delete contract (trash icon) → confirm "Delete".
- **Expected:** following the D60 pattern, Delete is disabled and shows the reason. Either way, the UI shouldn't offer an action the API refuses.
- **Observed:** the button is enabled and the confirm dialog opens. Then `DELETE /api/contracts/13` → 422 "Grain has been received against this contract, so it can't be deleted". The message does show on the page. The contract stays.
- **Repro:** contract 13 ([TEST-TEMP] QA Malt Supply, 2026). Size: desktop 1366.

### Gap 2 (should-fix): an open order dated last year isn't "on order" on this year's contract
- **Path:** an on-contract order dated 2025-12-31, still open in 2026 → 2026 contract line.
- **Expected:** open on-contract orders count as **on order** (the brief only says "open on-contract orders"). Once received, the order counts as **received** in 2026, so while it's open it should count toward the 2026 contract too, or at least toward one year.
- **Observed:** while it's open, the 2026 line's on order stays 0 (and there's no 2025 contract, so it isn't counted anywhere). After the receipt dated 2026-11-18, the 2026 line's received went from 6 to 7 and $226.50 to $263.50. So the sacks are invisible to planning until they arrive.
- **Repro:** order 124 ([TEST-TEMP] PO-Q8-2025, product [TEST-TEMP] QA Base 50, 1 sack). Size: API and contracts page, desktop.

### Gap 3 (should-fix): contract Total "Remaining" nets an overage against a shortfall
- **Path:** Contracts → 2026 contract with one line over (Base 55: 30 contracted, 33 received, "over by 3") and one line short (Base 50: 20 contracted, 7 received, 13 remaining).
- **Expected:** the total remaining is what's still owed (13), matching **Shortfall**.
- **Observed:** Total row Remaining = **10** (−3 + 13), while the Shortfall tab lists 13 short. Extra sacks of one malt hide a shortfall in another.
- **Size:** desktop 1366.

### Gap 5 (should-fix): an unvalued product shows $0.00 instead of "—"
- **Path:** owner → Purchasing → Totals → Inventory. Seed product Rahr 2-Row (715 lb, no cost, no offer price).
- **Expected:** with no price at all, the row is unvalued ("—").
- **Observed:** $/lb shows "—" but Value shows **$0.00**. Copy puts `0.00` in Value. The API returns `value: "0.00"` with `unvalued_lb: "715.00"`. The footnote ("715 lb has no price and isn't valued") is right, but the row and the Copy read as a real $0 valuation.
- **Size:** desktop 1366.

### Gap 10 (should-fix): "1,234" is refused in every sacks box
- **Path:** New order, Edit order, Receive (Sacks received) and Contract (Sacks) → type `1,234`.
- **Expected:** `1,234` = 1234 (Q13).
- **Observed:** "Whole sacks, 1 or more", and Save/Receive stays disabled. Price boxes do accept `1,234.50` as 1234.50, so the two box types disagree.
- **Size:** desktop 1366.

### Gap 11 (should-fix): the API stores 3-decimal prices that the UI refuses
- **Path:** `POST /api/purchase_orders` with `price_per_sack: "42.555"`, and `POST /api/contracts` with `price_per_sack: "35.555"`.
- **Expected:** 422, like the UI ("Use at most 2 decimals").
- **Observed:** 201 for both. The order line stores "42.555". The contract writes a **"Contract 2028" price row of 35.555** into the offer's price history, and deleting the contract leaves that row there (offer 421, price row 159).
- **Size:** API.

### Gap 12 (should-fix): a received date before the order date is accepted
- **Path:** Receive dialog → Received = 2026-11-01 on an order dated 2026-11-18 (the picker has a max but no min). Same through `POST …/receive`.
- **Expected:** refused ("can't be before the order date", the same rule that already exists for Expected).
- **Observed:** accepted. Order 129 shows received 2026-11-01, and its movement on lot [TEST-TEMP]-W123 is dated before the order was placed. That changes **As of** results for dates before the order existed.
- **Size:** desktop 1366 and API.

### Gap 13 (should-fix): the receive API rounds new-lot specs instead of refusing them
- **Path:** `POST /api/purchase_orders/:id/receive` with a new lot whose `extract_fgdb` is `80.155`.
- **Expected:** refused, like the dialog ("Use at most 1 decimal") and the D60 rule "refuse, don't round".
- **Observed:** 200. Lot [TEST-TEMP]-FEAT (312) stored extract **80.2**. The stored value differs from what was sent. The UI does refuse it, so only the API path is affected.
- **Size:** API.

### Gap 17 (should-fix): a contract line sums sacks of two different sizes
- **Path:** contract line for [TEST-TEMP] QA Reorder (product has a 50 lb offer and a 55 lb offer), line on the 50 lb offer, 10 sacks. Receipts on that product: 5 × 50 lb plus 5 × 55 lb (orders 116, 120, 143).
- **Expected:** either count only the line's offer, or compare like units. The brief calls this out ("a contract line for a product with several offers").
- **Observed:** received = 10 ("remaining 0"), on order also mixes both offers. 525 lb is shown as fulfilling a 500 lb contract, and with other sizes the error can go either way. Please decide which rule is intended.
- **Size:** API and contracts page.

### Gap 1 (minor): raw field prefix in the duplicate lot # message
- Add lot with a lot # the product already has (`[TEST-TEMP]-W123` or ` [test-temp]-w123 `) is correctly refused, but the dialog shows "**lot number:** This product already has lot [TEST-TEMP]-W123". Desktop.

### Gap 4 (minor): the reorder offer choice isn't kept
- To order → change the Offer for [TEST-TEMP] QA Reorder from 55 lb to 50 lb. The number follows correctly (4 → 3), but no request is sent, and after a reload the row is back to the default offer. Desktop.

### Gap 6 (minor): no total for Expired lb in Inventory totals
- The Total row (on screen and in Copy) leaves Expired lb blank (it should be 250 lb here), and the API `total` has only `lb` and `value`. Desktop.

### Gap 7 (minor): As of a past date shows later expirations
- Lot [TEST-TEMP]-E1 was marked Expired on 2026-11-18. **As of 2026-11-12** shows its 100 lb as expired. Expired status isn't tracked by date. Desktop and API.

### Gap 8 (minor): order totals rows have no sacks totals
- Per-supplier subtotal and grand total rows show lb and $ but leave Ordered/Received blank, on screen and in Copy. The API returns `total.sacks` and per-supplier `sacks`. Desktop.

### Gap 9 (minor): the order totals API ignores an invalid date
- `GET /api/ingredient_totals/orders?from=x&to=2026-12-31` → 200 with every order. Inventory's `as_of=garbage` is correctly a 422. API.

### Gap 15 (minor): a receive with no lines receives everything
- `POST …/receive` with `lines: []` → 200. Every line is received in full into its default lot (order 130, +2 sacks on W123). An empty or incomplete payload from any client turns into a full receipt. API.

### Gap 16 (minor, 360 px): To order Offer column is wider than the screen
- At 360 px the Offer select is about 560 px wide. Scrolled to it, the To order number and the supplier part of the offer label are out of view. It's still usable; nothing overflows the page. 360×780 touch.

### Gap 14: withdrawn
- I first logged "deleting a contract leaves its price rows". The delete confirm says "Offer prices it set stay in their history", so this is on purpose. The 3-decimal case is covered by gap 11.

## What passed (highlights)

- **Q1:** "36 sacks · 1,900 lb · $1,456.00" (20×55 lb @ $42 + 16×50 lb @ $38.50); target 40: "36 of 40", "40 of 40", "44 of 80"; price prefilled from the current price; the order shows as open on the list and on both products' Open orders.
- **Q2:** brewer2 edited (removed a line, added a line, 20→10 sacks, $42→$43.25: "15 sacks · 800 lb · $632.50") and cancelled with a confirm. Received and cancelled orders show no Edit/Cancel/Receive. PUT, cancel and receive → 409 with a clear message.
- **Q3:** lot [TEST-TEMP]-A1 220 → 770 lb (+10×55), its received date stayed 2026-11-01, and "received 2026-11-18 by Jake Brewer" appears in History. A product with no lot makes Receive wait for a lot #.
- **Q4:** 10 ordered, 8 received → order closed, "Ordered 10 / Received 8", +440 lb only. The 0 line wrote no movement.
- **Q5:** split 6 + 4 (previous lot plus new lot with color changed 2.1 → 2.3, stored). 6 + 3 is refused in the UI ("6 + 3 = 9 of 10", Receive disabled) and by the API (422).
- **Q6:** `  [test-temp]-w123  ` went into W123. An expired lot is never the default and is refused by id or by number. A 50 lb lot is refused for a 55 lb line. A lot of another product is refused. Duplicate lot # is refused on Add lot and on rename.
- **Q7:** "Contract 2026" price rows dated 2026-11-18, "Contract 2027" rows dated 2027-01-01. The current price stays the 2026 one. Changing the price adds a new row; saving unchanged adds nothing. A second 2026 contract for the same supplier is refused. brewer1 sees contracts with no New/Edit/Delete, and the API gives 403.
- **Q8:** on order +5 → received +5 and +$207.50 → "over by 3", nothing refused. Off-contract orders change nothing. Over-receiving (3 of 2) is allowed. Shortfall lists the short line.
- **Q9:** min 3 with 6 on hand: no chip. Use 4: chip on the list and product page, To order 1. 4 on order: 0. An expired lot doesn't count. 50 vs 55 lb offer: 3 vs 4 (⌈10 − 360/50⌉, ⌈10 − 360/55⌉). Start an order: "New order · 1 of 2" / "2 of 2", prefilled supplier, offer, sacks and price.
- **Q10:** values check out by hand. A1 (receipts at $43.25, $44.00, $41.50) is valued at the most recent price, 1815 lb × 41.50/55 = $1,369.50. Product total $1,545.50 and grand total $2,578.50 add up. Lots without cost are "est." at the offer price as of the date. As of 11-01 / 11-04 / 11-17 / count day (300 → 90 lb) all change lb and value correctly. Future dates are refused (picker max, API 422). Supplier, maltster and category filters narrow the rows.
- **Q11:** per-supplier subtotals add up ($140.00 + $2,094.50 = $2,234.50; lb 200 + 2,675 = 2,875). Open lines count ordered sacks, received lines count received sacks. Status and date filters work. Both Copies are tab-separated with a header row, plain numbers, Total rows and YYYY-MM-DD dates.
- **Q12:** company Delete is disabled with "…deactivate it instead". Category Delete is disabled with "This category has grains; move them first". "13 sacks usable · 2 sacks expired" (and "360 lb usable · 150 lb expired" for mixed sack sizes) is the same in the header, list, Count and Record movement. `1.555` lb → "Use at most 2 decimals", `80.15` extract → "Use at most 1 decimal". No Add Field on Base; Hops still has it.
- **Q13 (passing parts):** sacks 2.5 / −3 / 0 / abc are refused, price −1 and `5,2` are refused (UI and API), order date after today is refused (picker and API), received date after today is refused, expected before the order date is refused (API), another supplier's offer is refused.
- **Q14:** no sideways scroll (scrollWidth = 360) on Orders (cards), the order page, New order and Receive (full screen 360×780; 3-row split with Specs open, Remove buttons and Receive reachable), Contracts, Shortfall, To order, both Totals (tables scroll inside their card), the product page, the Grains list and Companies.
- **Q15:** with slow network, a double-click on Save gave exactly one write each for New order (POST), Edit (PUT), Receive (POST …/receive) and contract save (POST). With two browsers receiving at once, one got 200 and the other 409 "This order has already been received" in the dialog, and inventory counted once. Edit after someone received → 409. Receive after someone cancelled → 409. Edit after cancel → 409.
- **Q16:** floater and splitRole: Purchasing works (order created and cancelled, all reads 200), contracts are read-only, contract POST/PUT → 403. owner: full access including contracts.
- **Q17:** bartender1, office1, barMgr: no Brewery / Ingredient Library / Purchasing in the nav. All 7 new URLs send them Home. All 18 routes tried → 403.
- **Q18:** breweryDevice, taproomDevice: the new pages say "Not available on a shared device". All 18 routes → 403.

## Other observations (not filed as gaps)
- Order History shows placed, received and cancelled, but not who edited the order or when.
- Receipt movements from an order leave Partner and Note blank (they could show the supplier and the PO #).
- Changing To order's offer selection sends no write, which fits gap 4.
- The local dev server returns Phoenix debug HTML for unknown routes (404). That's expected locally; this report doesn't apply it to DEV or prod.
- The Inventory Category filter lists both "Grains" and "All Grains" next to "All grains". All three show the same rows.

## What I couldn't test
- **Recipe lot picker leaves out expired lots (Q12):** the seed has no recipes on any brand, and creating one on a reference brand was out of bounds.
- **Year boundary "ordered Dec 31, received Jan 2":** dates after today are refused. I tested the nearest case I could (ordered 2025-12-31, received 2026-11-18: gap 2).
- **Double-tap on a phone under slow network:** Q15 was run at desktop with mouse double-clicks. Phone-width dialogs were checked for layout only.
- Email, push and service worker: out of scope locally.

## Data I made (all `[TEST-TEMP]`) and cleanup
- **Companies:** 142 [TEST-TEMP] QA Malt Supply (maltster + supplier, order target 40), 143 [TEST-TEMP] QA Grain Co 2 (supplier). **Both deactivated.**
- **Maltster products:** 301 QA Base 55, 302 QA Base 50, 303 QA Reorder (min 10), 304 QA Other Supplier (min 3). **All deactivated.**
- **Offers:** 417 (301, 55 lb), 418 (302, 50 lb), 419 (303, 50 lb), 420 (303, 55 lb), 421 (304, 50 lb, supplier 143). Price rows 149–153 (mine), plus contract price rows 154–159.
- **Lots:** 304 A1, 306 S1 (product 301); 307 W123, 308 E1 (expired), 312 FEAT (302); 305 R1, 309 N55, 311 X1 (expired) (303); 310 B1 (304). They have movements, so they can't be deleted; they're inactive with their products.
- **Movements I entered by hand:** one Used (−4 sacks, product 304, note "[TEST-TEMP] q9 use") and one Count (product 304, to 90 lb).
- **Orders:** 116–143, all `[TEST-TEMP] PO-…`. None are open: received 116, 118–124, 129–133, 135–137, 143; cancelled 117, 125–128, 134, 138–142.
- **Contracts:** 13 (2026, supplier 142) **can't be deleted, because it has receipts (gap 18), so it's left in place.** 14 (2027) and 16 (2029) deleted. The Q13 2028 and Q16 owner 2030 contracts were created and deleted straight away.
- **Reference data:** no reference company, reference product or `[SEED]` row was edited. Seed Rahr 2-Row is still 715 lb. All reference companies are still active with no order target.
- **Settings:** I never changed any persona's sacks/lb setting, so there was nothing to restore. Nobody was signed out, and no persona or device was changed.
- Scripts are in `scripts/`, screenshots in `results/shots/`, and the running id log in `results/ids.txt`.
