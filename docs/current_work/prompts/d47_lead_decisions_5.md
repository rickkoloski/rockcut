# D47 lead decisions 5: QA recheck findings (fix cycle 2), 2026-10-21

**Inputs:**
- The QA recheck, `stepwise_results/d47_qa_recheck.md` (DEV, `31890b6`). Every first-pass finding is FIXED; there are 7 new minor issues.
- DEV run 2: 491 passed, 1 failed (the item 10 keyboard test, fixed in `c0f9cbe`, 15/15).
- Matt on the Pixel: long-press drag and the drag hint both work.
- Matt chose to fix everything now, in fix cycle 2. Commit as `fix: D47 DEV QA fix cycle 2 (…)`, with tests at the level each fix lives. Run the targeted production specs, then `LEAD: run` the full suites.

## Decisions

- **N4. What a completed part's leftover CIP means.** Once a vessel's exit is done, the part **occupies the tank from its fill to its exit, and no longer**. Its own CIP, done or still planned, only says when the tank gets cleaned: between the exit and that CIP the tank is dirty, not occupied. Every place uses **one shared occupancy definition**: overlap flags, the drag hint, lanes and stacking, and tank status.
  - **Drawing:** the part's bar ends at the exit. A planned leftover CIP shows as a CIP block or dot on its day and takes **no lane**, so the next batch draws in the same lane.
  - **A leftover CIP that falls inside another part's stay** raises "CIP while beer is in the tank", the same as a standalone one.
  - **Same day:** a CIP dated on an exit's day counts as cleaning **after** that exit. It doesn't raise "CIP while beer is in the tank" for the batch that left that day, and the tank reads "Sani 0 days".
- **N1. Brew-day preview numbering.** The check-off preview must compute P-number changes **as the check-off will leave them**: the batch becomes brewed and numbered, so it leaves the P-number list. Use the same code path as the real write; the preview and the result must match. ExUnit: the preview's `renumbered` equals the write's.
- **N2.** Hide the hover tooltip while a drag is in progress, and don't show it again until the pointer moves after the drop.
- **N3.** Keep the drag hint inside the viewport. Flip it to the left of the pointer near the right edge, and below near the top. On touch it still sits above the finger, clamped to the viewport.
- **N5.** After an Escape-cancelled drag, the next drag of any item (CIP blocks included) must work. Reset the pointer hook's state fully on cancel. Playwright: Esc a dot drag, then drag a CIP block, and it moves.
- **N6. Out-of-service in the dot hint.** For a step that changes the part's stay (its fill or its exit), check the **resulting stay** against outages. For any other step, check the step's own day. That's the intended rule; make the hint follow it.
- **N7.** A drag released within half a day of where it started does nothing: no move, and no dialog. Only a real click (no drag) opens the dialog.
- **Remove-Transfer dialog:** disable Remove until the preview has loaded, with a small spinner. The warning names **every** tank that depends on the transfer: "After transfer 1 and After transfer 2 depend on it."
- **Seed sign-off showed as reopened:** check that the seed stores its sign-off with the **current** signature formula, which since fix cycle 1 includes the part's dates. Then check the signature doesn't include anything that drifts on its own: P-numbers, labels, today's date. If either is wrong, fix the formula or the seed, and add an ExUnit test that a freshly seeded sign-off reads as signed off.
- **Plan dialog "Ferment in" showed FV7 after picking QR1** while tanks were being added (seen once, not reproduced). Make sure the tank pickers are keyed and valued by tank id, not by list position.

## No change

- `#4 0` is stored as `4 0`. Inner spaces are allowed.
- Duplicate makes "Copy of …" without a prompt (D46 behavior).
