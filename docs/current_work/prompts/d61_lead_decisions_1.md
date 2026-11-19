# D61 lead decisions 1 (local QA fix cycle 1)

2026-11-18 · lead → builder. The independent local QA pass is in:
`~/src/rockcut-d61-qa/results/d61_qa_report.md` (you may read it; gap numbers are its). Verdict
fail: 1 must-fix, 8 should-fix, 8 minor. Matt's decisions are in the spec's new **Amendments**
section. Fix everything below, each with a test (ExUnit, vitest or Playwright as fits). The QA
agent is done; you can use the local app. One migration (item 10): add it and migrate the dev DB
yourself, as before.

## Must-fix

1. **Gap 18:** Delete contract disabled with the reason ("Grain has been received against this
   contract, so it can't be deleted") when the API would refuse it: `delete_blocked` on the contract
   JSON from the same rule; the confirm opens only when deletable; API refusal unchanged.

## Should-fix

2. **Gap 2 (Matt 2a):** an open on-contract order counts as on order on the contract of the year of
   its `expected_on`, else `ordered_on`. Received stays by `received_on`.
3. **Gap 17 (Matt 17a):** a contract line counts every on-contract order line and receipt of its
   **product** from its **supplier** (any of that supplier's offers), converted by weight to the
   line's offer sack size: on order and received in sacks = lb ÷ line sack size, to 2 decimals
   (show "10.5"; whole numbers without decimals). Dollars stay at the actual line prices paid /
   ordered. Remaining and over use the converted sacks. Shortfall the same.
4. **Gap 3:** the contract card's total Remaining = sum of each line's positive remaining (= the
   Shortfall total); show over-deliveries in their own total ("Over: 3 sacks") instead of netting.
5. **Gap 5:** a product with no value at all (every lot unvalued) shows "—" for Value and `null`
   in the API; Copy leaves the cell empty. A product with some valued and some unvalued lots keeps
   its partial value with the unvalued lb noted.
6. **Gap 10:** sacks boxes (order lines, Receive, contract lines, minimum, order target) accept
   thousands separators like the other number boxes (`1,234` = 1234), still whole numbers only.
7. **Gap 11:** the API refuses prices with more than 2 decimals (order lines, contract lines, offer
   prices) with "Use at most 2 decimals" (422), like the UI.
8. **Gap 12:** `received_on` before the order's `ordered_on` → 422 "The received date can't be
   before the order date"; the Receive date picker's min is the order date.
9. **Gap 13:** the receive API refuses a new lot's feature values with more decimals than the
   feature allows (422 on that line, same message as the UI), instead of rounding. Check the D60
   lot and product create/update paths behave the same through the API (refuse, not round); if they
   still round, make them refuse too.

## Minor

10. **Gap 4:** the reorder offer chosen on To order is saved on the product
    (`ingredient_products.reorder_offer_id`, nullable; an inactive or another product's offer is
    refused); To order uses it when set, else the current default.
11. **Gap 1:** the duplicate lot # message without the "lot number:" prefix, in every dialog.
12. **Gap 6:** the inventory totals `total` gains `expired_lb`; the Total row (screen and Copy) shows
    it.
13. **Gap 7:** Expired has no date history, so "As of" a past date uses today's status. Say so: a
    note under the Inventory table when As of isn't today ("Expired shows each lot's status
    today"). No status history.
14. **Gap 8:** order totals subtotal and grand total rows show sacks ordered / received (screen and
    Copy).
15. **Gap 9:** an invalid `from`/`to` on the order totals API → 422, as `as_of` does.
16. **Gap 15:** a receive must list every line of the order (422 "Every line needs a received
    quantity"); defaults (previous lot) still apply to a listed line with no allocations.
17. **Gap 16:** at 360 px the To order Offer select fits (shorter label or wrapping), the To order
    number in view.
18. **Observations:** the Inventory Category filter lists each category once (no "Grains" /
    "All Grains" / "All grains" triplet); a Received movement from an order shows the order (its
    reference, else "Order #<id>") in the movement's note column in History.
19. **Hardening:** PO7 and P4 failed once under the full local run (dialog still open after 5 s;
    `page.goto` aborted) and pass alone. Make them wait for the save response / navigation instead
    of a fixed timeout.

## Done when

`mix test` green twice; `--warnings-as-errors` clean; vitest, `tsc`, `vite build` clean; lint 8;
the ingredients Playwright folder green twice. Commit, reply with commits, counts and `LEAD:` notes.
Don't run the full suite (the lead does, then QA rechecks).

## Follow-up (after cycle 1, LEAD note 11)

20. **To order's on order by weight**, the same rule as Matt's 17a: on-order sacks across offers of
    different sizes are converted by weight to the reorder offer's sack size before subtracting
    (to order still rounds up to whole sacks). ExUnit for 50 + 55 lb on order. Then the ingredients
    folder once.
