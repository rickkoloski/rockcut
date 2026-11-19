# D61 local QA: recheck 1

- **Date:** 2026-11-19 (America/Denver), against http://localhost:5174 after the reseed. Nothing touched `*.fly.dev`.
- **Personas:** `brewer1`, `brewer2`, `breweryMgr`, `owner`. All sessions came from the `auth/` files. I used no passwords, signed nobody out, and never read, printed, logged or screenshotted a token.
- **Verdict: pass with gaps.** All 17 earlier gaps are closed. Gap 16 is closed only in part, so I filed what's left as **gap 19 (minor)**. No must-fix or should-fix gaps.

## Summary

| Severity | Open gaps |
|---|---|
| must-fix | none |
| should-fix | none |
| minor | 19 |

| # | Result | Checks |
|---|---|---|
| R1 | PASS | 6 |
| R2 | PASS | 7 |
| R3 | PASS | 3 |
| R4 | PASS | 9 |
| R5 | PASS | 22 |
| R6 | PASS (gap 19 filed) | 6 |
| R7 | PASS | 10 |

## Earlier gaps

| Gap | Status | Evidence |
|---|---|---|
| 18 (must-fix) Delete contract offered but refused | **Closed** | 2026 contract with receipts: Delete contract is disabled, and its tooltip reads "Grain has been received against this contract, so it can't be deleted". A forced click opens nothing. 2028 contract with no receipts: the confirm opens; Cancel keeps the contract (UI and API); Delete sends `DELETE` → 204 and the contract is gone. `DELETE /api/contracts/50` is still 422 with the same reason. |
| 2 (should-fix) on order by year | **Closed** | Order dated 2026-11-19 and expected 2027-01-10 (2 × 50 lb): on order 2 on the 2027 contract, not on 2026. No expected date: counts on 2026. Ordered 2025-12-30 and expected 2026-01-05: counts on 2026. Ordered 2025-12-20 with no expected date: not on 2026. Editing an order's expected date to 2027-02-01 moved it from 2026 to 2027. Receiving the 2027-expected order today counted it as received in 2026 and took it off 2027's on order. |
| 17 (should-fix) mixed sack sizes on a line | **Closed** | 50 lb line, 10 sacks. Received 5 × 50 lb + 5 × 55 lb → **10.5 received, "over by 0.5"**, $420.00 (5 × $40 + 5 × $44, the order prices). On order: 1 × 50 + 2 × 55 + 5 × 50 + 5 × 55 = 13.7, and 3.2 once received. The same line on the 55 lb offer: 625 lb → 11.36 received, 0.64 remaining, 2.91 on order (160 lb). Shortfall shows the same 0.64. |
| 3 (should-fix) Remaining nets over against short | **Closed** | One line over by 0.5, one short by 6: Remaining total **6** (later 5), Shortfall 6 (later 5), and "Over: 0.5 sacks" (later 2.5) shown separately. API: `remaining_sacks` 5, `over_sacks` 2.5. |
| 5 (should-fix) unvalued shows $0.00 | **Closed** | A product with no offer price: $/lb and Value "—" on screen; API `value: null`, `per_lb: null`; Copy cells empty; footnote "150 lb has no price and isn't valued". |
| 10 (should-fix) `1,234` refused in sacks boxes | **Closed** | `1,234` accepted in every sacks box, and the save request carried 1234: New order (running total "1,234 sacks · 61,700 lb · $46,892.00"), Edit order, Receive sacks received, Receive split rows ("1000 + 234 = 1234 of 1234"), contract line, product minimum, company order target, and D60 Add lot (sent `initial_quantity_lb` 61700). `5,2` and `12,34` are refused with "Whole sacks, 1 or more". I intercepted these saves in the browser, so none was stored. |
| 11 (should-fix) API stores 3-decimal prices | **Closed** | `40.125` → 422 "Use at most 2 decimals" on order POST, order PUT, contract POST, contract PUT and offer price POST. `40.1`, `40.10` and `40` still save. |
| 12 (should-fix) received before order date | **Closed** | Received date before the order date → API 422 "The received date can't be before the order date". The dialog shows the same message, disables Receive, and the date input has `min` = order date. |
| 13 (should-fix) receive API rounds specs | **Closed** | Extract `80.155` (and `80.15`) → 422 "Extract: Use at most 1 decimal" on receive into a new lot, lot POST, lot PUT, product POST and product PUT. Nothing was stored. The other specs agree between UI and API (see R7). |
| 1 (minor) "lot number:" prefix | **Closed** | Add lot with `[TEST-TEMP]-B50` or `  [test-temp]-b50 ` → "This product already has lot [TEST-TEMP]-B50". |
| 4 (minor) reorder offer not kept | **Closed** | Choosing the 55 lb offer sends `PUT /api/ingredient_products/545 {"reorder_offer_id":817}`, and the choice survives a reload. It also survives a later Edit maltster product save, which doesn't send the field. On order converts by weight: 310 lb is 6.2 sacks on the 50 lb offer and 5.64 on the 55 lb offer. To order is 10 → 11 (minimum 30; on hand 14.7 → 13.36 sacks). |
| 6 (minor) no Expired lb total | **Closed** | Total row: Expired lb 100 on screen and `100.00` in Copy; API `total.expired_lb`. |
| 7 (minor) As of shows later expirations | **Closed** (by the agreed note) | As of 2026-11-15 shows "Expired shows each lot's status today." No note when As of is today. |
| 8 (minor) no sacks on order totals rows | **Closed** | Per-supplier subtotal and Total rows show 21 ordered and 15 received, on screen and in Copy. Totals check by hand: 1,085 lb and $856.00. |
| 9 (minor) bad dates ignored | **Closed** | `from=x`, `to=x` and `from=2026-13-01` → 422 "is invalid". |
| 15 (minor) receive with no lines | **Closed** | `lines: []`, one of two lines, or no `lines` key → 422 "Every line needs a received quantity", and the order stays open. |
| 16 (minor) To order at 360 px | **Partly closed**, see gap 19 | Minimum and on order now sit under the product name, the To order number is in view (x 261–309), and `scrollWidth` is 360. The Offer column still doesn't fit. |
| Observation: Category filter | **Fixed** | Options are "All grains", Base, Crystal/Caramel, Kilned, Specialty and Roasted, each once. |

## New gaps

### Gap 19 (minor, 360 px): To order's offer is cut off instead of wrapping
- **Path:** Purchasing → To order at 360×780 with touch, as `brewer2`.
- **Expected:** per the fix note, the offer wraps so the row fits.
- **Observed:**
  - The Offer column runs from x 309 to 469, so the table card scrolls sideways inside itself (card 310 px wide, content 444 px).
  - The select is 144 px wide and shows "[TEST-TE…" with an ellipsis. The part that tells 50 lb from 55 lb isn't visible even after scrolling the card.
  - Opening the menu shows the full labels, so the row is still usable.
- **Repro:** set a minimum on a product with two offers so it lands on To order. Open To order at 360 px and look at the Offer cell. Screenshots: `results/shots/r6_toorder_360.png` and `r6_toorder_360_scrolled.png`.

## R7 open hunt (no new gaps)
- A contract with the same product on two lines (50 lb and 55 lb offers) → 422 "… is on this contract twice", so a receipt can't be counted twice.
- Changing a 2026 line from the 50 lb to the 55 lb offer converts every figure correctly. The table total, the Shortfall table and the API agree.
- Changing an open order's expected date moves its on order between years. An order expected next year but received today counts as received this year.
- The reorder offer survives a product edit in the UI, even though that PUT doesn't send `reorder_offer_id`.
- Spec decimal limits match between UI and API:
  - Extract and diastatic power: 1 decimal.
  - Color, protein and moisture: 2 decimals.
  - Anything over the limit gets 422 "<Spec>: Use at most N decimals".
- A read-only scan of all 47 products, the lots list and 48 offers' price history found no stored value beyond the new limits, so nothing that saved before is now stuck.
- Price boxes accept `1,234.50` and send `1234.50` (New order line and Add price). `40,5` → "Use . for the decimal point". The API itself refuses `"1,234.50"` as "is invalid", which is fine because the UI normalizes it first.
- Observation, not filed: `orders?from=2026-12-31&to=2026-01-01` (from after to) → 200 with no rows, not 422.

## What I couldn't test
- An order dated Dec 31 and received Jan 2 (future dates are refused), and receipts against a next-year contract.
- The recipe lot picker (the seed has no recipes; unchanged from pass 1).
- I intercepted the `1,234` sacks saves in the browser and answered them locally, so the stored result comes from the API path, not those clicks. A real save of 1,234 sacks would have flooded my test lots.

## Data made (all `[TEST-TEMP]`) and cleanup
- **Company:** 294 `[TEST-TEMP] RC Malt` (supplier and maltster). Deactivated.
- **Products:** 545 RC Mixed, 546 RC Base 50, 547 RC Unvalued. Deactivated. Product 545 keeps minimum 31 and reorder offer 817.
- **Offers:** 816 and 817 (on 545, 50 lb and 55 lb), 818 (on 546), 819 (on 547). Price rows 370–372 and 378. The contracts also wrote "Contract <year>" rows on 816, 817 and 818.
  - Offer 819 got a $38.10 price during R5, so 547 counts as valued after R4.
  - Product 546's standard extract went from 79.0 to 79.5 during R5. Its other specs were restored.
- **Lots:** 569–572 (openings) and 573 (marked Expired).
- **Orders:** 280–289.
  - Received: 280, 283, 284.
  - Cancelled: 281, 282, 285, 286, 287, 288, 289.
  - No `[TEST-TEMP]` orders are left open.
- **Contracts:**
  - 50 (2026) is kept. It has receipts, so it can't be deleted, which is the intended rule now.
  - 51 (2027), 52 (2028) and 53 (2029) are deleted. All my contracts were for my own supplier 294.
- **Untouched:** reference companies (BSG, Rahr, Crisp and so on) are still active, and no reference or `[SEED]` row was edited.
- **Settings:** I didn't change any persona's sacks/lb setting, so there was nothing to restore.
- **Scripts:** `scripts/r_*.js` and `scripts/r1_*`–`r7*.js`. Ids are in `results/ids.txt`; pass 1's ids are in `results/ids_pass1.txt`. Screenshots are in `results/shots/r*`.
