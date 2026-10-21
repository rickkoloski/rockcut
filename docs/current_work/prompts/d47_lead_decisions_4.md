# D47 lead decisions 4: DEV gate findings (fix cycle 1), 2026-10-21

**Inputs:**
- The QA report, `stepwise_results/d47_qa_report.md` (DEV, `6e1c5ac`).
- DEV Playwright run 1: 481 passed, 2 failed. P32 and P5 both passed on rerun.
- Matt checked the touch long-press drag on the Pixel: it works.

Fix everything below on this branch. Give each fix a test at the level it lives: ExUnit for API rules, Playwright or Vitest for the UI. Commit as `fix: D47 DEV QA fix cycle 1 (…)`. Then run the targeted production specs, and `LEAD: run` the full suites.

## Must-fix

- **M1. Typing a date in the batch dialog.** A date field must not run the move prompt while someone is typing. Commit the change on blur, on Enter, or when the picker's day is chosen. Ignore intermediate values (any date different from the original is only a draft until it's committed). Apply the same rule to every date field that triggers a move or check-off: the batch dialog, the step dialog's "Or move to" and "Done on", the CIP dialog, and out of service. Playwright: type `12152026` into a step date. One prompt opens, for Dec 15.
- **M2. A batch number with a leading `#`.** Strip leading `#` and surrounding spaces from `batch_number` before validating and saving, on every path: the brew-day check-off and the batch dialog edit. `#40` is then `40`, which is refused as a duplicate of #40, and `#qa44b` is checked as `qa44b`. The UI shows the number with a single `#`. Tests: ExUnit for both paths; Playwright for `#40` refused.
- **M3. A full Package (or any exit) checked off early.**
  1. **Steps out of order** also counts a **done** step dated before a step it follows that isn't done. That is exactly what the prompt's "They'll be flagged" promises. In general, the flag must cover every case the move preview's out-of-order warning reports. Use one shared function for both.
  2. **Once a vessel's exit (full Package, Split, Transfer/Filter) is done, the part's bar ends at the exit**, plus its CIP when the CIP is still to come. Unfinished steps of that vessel dated after the exit still show as dots and diamonds, red, and carry the out-of-order flag. They are no longer drawn as phase segments.
  3. **Overlap and occupancy:** a part whose exit is done occupies its tank from the fill to the exit only. The tank is then dirty until a CIP: the part's own CIP or a done standalone CIP, whichever comes first. A completed batch's leftover planned CIP must not keep "Tank overlap" alive against the next batch once the tank has been cleaned. ExUnit for each case.

## Minor (all in this cycle)

1. **"Batch bigger than tank" signature** includes the part's dates (its fill to its exit). Moving the batch reopens the sign-off, as the spec's signature rule says ("dates, tank and volume involved").
2. **Unassigned row header:** make it opaque like the tank headers, so the chart doesn't show through it when scrolled.
3. **Empty-spot menu → Mark out of service:** prefill From with the tapped day, and To with the same day.
4. **Double-click on Apply in the move prompt** (and on any dialog button that closes the dialog) must not click through to the bar underneath. Swallow the second click, for example by ignoring pointer events on the grid for ~300 ms after a dialog closes.
5. **Dropping a bar over the tank column or outside the chart cancels the drag.** No move. The same goes for dots and CIP blocks.
6. **Names-only column:** show the full tank name in a tooltip (and `title`) when it's cut off.
7. **API range limits match the UI:** `GET /schedule` refuses fewer than 7 or more than 730 days inclusive (422 `range_invalid`).
8. **The Remove-Transfer warning names the tanks**, for example "After transfer 2 depends on it."
9. **Small things:**
   - After saving, the batch number field shows the trimmed value.
   - Find the duplicate "planned / Undo" snackbar after a plan. If it's a double submit, guard it.
   - A check-off that moves following steps says so in its message: "FDH done · 8 following steps moved 2 days later".
10. **A done standalone CIP during a batch's occupancy** (for example, after un-checking a full Package that a CIP followed) raises "CIP while beer is in the tank", the same as a planned one.

## Also check (from the DEV run)

- **P32 on DEV:** the drag's confirmation message never appeared once, while another user was adding tanks. Make sure a background refetch during a drag can't cancel the drag or move the drop target. Re-render without unmounting the dragged element, and resolve the drop row by tank id at drop time, not by index. Add a Vitest or Playwright test if you can force a refetch mid-drag.
- **P5 (Restore on the Tanks page)** timed out once the same way. Check that the row and button stay stable across a refetch.

## By design (no change)

- **Renaming a step type renames it on existing batches.** Matt's decision, spec §3.5.
- **A template Split has no parts.** The parts are chosen on the batch (D48). A Split is a valid exit.
