# D60 lead decisions 2 (local QA fix cycle 1)

2026-11-18 · lead → builder. The independent local QA pass is in:
`~/src/rockcut-d60-qa/results/d60_qa_report.md` (you may read it; gap numbers below are its).
Verdict fail: 3 must-fix, 3 should-fix, 8 minor. Matt's decisions are recorded in the spec
(§3.6, §3.7, §3.8, §5, §9; read the diff of `specs/d60_grain_catalog_inventory_spec.md` in this
commit). Fix everything below, each with a test (ExUnit, vitest or Playwright as fits).

## Must-fix

1. **Gap 6, double submit.** On a slow network a desktop double-click on Save wrote two lots and
   two movement sets. Every D60 dialog that writes (product, offer, price, Add lot, edit lot,
   Record movement, Count, company, grain, category) disables Save from the first click until the
   response, and a second submit while one is in flight is dropped in code (not only by the
   disabled button). Playwright: throttle the network (CDP) and double-click Save on Add lot and
   Record movement → exactly one lot / one movement set.
2. **Gap 9, lot delete (Matt: keep it, with a confirm).** Delete on a lot opens a confirm naming
   the stock: "Delete lot <lot #>? Its <kind> <quantity in the person's sacks/lb setting> goes
   too." Cancel does nothing. The API rule stays (only with just the first movement, no recipe).
3. **Gap 12, category delete 500.** Deleting a category that has ingredients (or children) → 422
   with a message ("This category has grains; move them first" / "…has sub-categories…"); the UI
   shows it in the dialog. No 500 anywhere on that path.

## Should-fix

4. **Gap 3, comma (Matt: `.` is the only decimal point).** `DecimalInput`: commas only as thousands
   separators in correct groups (`1,234` → 1234, `12,345.5` → 12345.5); `5,2`, `1,23`, `1,2345`
   refused with "Use . for the decimal point" (or the existing message for letters); nothing sent.
   Update vitest and the specs that used `5,2`.
5. **Gap 4, decimals.** The API rounds feature values to the feature type's decimals on save
   (product and lot), so what's stored is what's shown and the "changed from standard" marks
   compare displayed values. The list and the lot dialog use the same comparison.
6. **Gap 7, Est. OG blank.** Find out why the recipe's Est. OG (and Est. IBU) are blank for a recipe
   with a grain lot (10 bbl, 75 %, 500 lb at 80.1 % FGDB → about 1.045). Fix it so the estimate
   shows where it's meant to (the brand's recipe list columns and/or the recipe page). Say in your
   reply whether it was blank before D60 too (check `develop`'s code path, not a checkout switch).

## Minor

7. **Gap 1, messages.** Inventory refusals in plain words and in the person's sacks/lb setting, no
   raw field prefixes (`quantity lb:`, `counted lb:`, `moisture pct:`). The Record movement
   dialog's "On hand" for Oldest first shows the non-expired amount, with expired noted.
8. **Gap 2.** Delete company asks first.
9. **Gap 5.** At 360 px the product page shows the full product name (wrap, or a line under the
   header).
10. **Gap 8.** Grain Bill pickers: the five sub-categories listed under Grains (indented), not
    interleaved; the Lot picker shows each lot's on-hand and status and leaves out depleted lots
    (except one already chosen on that line).
11. **Gap 10.** The convert popup refuses results outside the feature's range (and negative
    inputs) with a range message, and Use stays disabled; moisture over 100 refused in the form.
12. **Gap 11 (Matt).** A count equal to on-hand writes a **"Counted, no change"** record (a
    zero-quantity count movement, or a count record; your call, shown in the history with the
    date and who). A total count with extra stock when every lot is expired → 422 "Every lot is
    expired; count by lot instead".
13. **Gap 13 (Matt).** A movement dated after today (Colorado) → 422 "The date can't be in the
    future"; the date picker's max is today.
14. **Gap 14.** A lot's sack size can change only while it has just its first movement (422
    otherwise).
15. **Observations:** quantities below 0.01 lb refused (API), lb stored to 2 decimals; a new Grains
    child gets the next sort order after its siblings. A $0.00 price stays allowed (Matt).

## Done when

- `mix test` green twice, `--warnings-as-errors` clean, vitest/`tsc`/`vite build` clean, the
  ingredients Playwright folder green twice.
- Commits on the branch. Reply with commits, test counts, the gap 7 finding, and `LEAD:` notes.
  Don't run the full Playwright suite (the lead does, then QA rechecks).
