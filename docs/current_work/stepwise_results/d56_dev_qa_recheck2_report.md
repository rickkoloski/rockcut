# D56 QA recheck 2 report (DEV, fix cycle 2)

- **Build:** `e6f17fe7d7ddc37beebe0a12a53f408b1161528a`. `GET /api/health` returned `sha` `e6f17fe…` and the ribbon read `DEV · e6f17fe — fictional test data only`.
- **Date:** Fri 2026-11-13 (America/Denver). DEV only.
- **Size:** desktop 1366×768.
- **Personas used:** breweryMgr (template, step types, tanks) and brewer1 (batches). All 11 personas were used only for the settings backup and restore. No password sign-in, no sign-out, no token read out of the page.
- **Seeded rows:** read only; nothing seeded was clicked for writing this run. Every UI write went through a guard. The guard opens my batch by its bar, located from the exact batch id, then opens the step from that batch's dialog. It aborts unless the dialog names that batch's own `[TEST-TEMP] D56` tank. My flag was signed off by API with its exact key (`failed_tests:94764`) after reading it back, not through the Flags dialog. Drags were only on dots whose names are unique to my `[TEST-TEMP]` step types.
- **Verdict: fail.** Gaps 7, 8 and 9 are fixed, the shift preview is fixed, and gaps 1–6 and S8/S10/S11 hold. But R6 found a new **must-fix** (gap 11), plus minor gaps 10 and 12. Q1 and R1–R5 PASS; R6 PARTIAL.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 1 | 11 |
| should-fix | 0 | |
| minor | 2 | 10, 12 |

| Earlier gap | Status |
|---|---|
| 8 (whole-batch move, then Mark not done or Change to Pass) | **fixed** (R1) |
| 7 (follower marked not done later) | **fixed** (R2) |
| 9 (late pre-brew tick and same-day brew) | **fixed** (R3) |
| Shift `preview: true` wrote | **fixed** (R4) |
| 1–6 | still fixed (R5) |

## New gaps

### Gap 11 · must-fix: steps left before brew day are treated as pre-brew; moving brew day back drags them along and leaves the schedule wrong with no flags
- **Path (all UI, desktop):**
  1. On the Gantt, open the batch's test → Check off (Done on = due day, Nov 11) → Fail → Retest in 2 → Move them.
  2. Open the batch dialog and set the Brew day date box to Nov 16. It moves at once, with **no move question** (gap 10). Only brew day and the pre-brew step move; the retest (Nov 13) and FDH (Nov 15) are now before brew day.
  3. The user puts brew day back. The date box refuses Nov 6: "[TEST-TEMP] R2 Hop check was done Wed Nov 11; brew day can't be before it." The pre-brew rule is applied to a **post-brew** test (template day 5).
  4. The user sets Nov 11, which is accepted with **no question**. The snackbar says "Brew day moved 5 days earlier, with [TEST-TEMP] R2 Hop check - retest, [TEST-TEMP] R2 Prep yeast and FDH." Then they set Nov 6, which is now accepted, also with no question.
- **Expected:** Putting brew day back where it was restores the schedule, or at least leaves the retest after its test and FDH (template day 7) after brew day. A post-brew test is never treated as a pre-brew step.
- **Observed end state:** Brew day Nov 6 (back where it started) and the failed test done Nov 11. But the **retest is Nov 3, 8 days before the test it retests**, and **FDH is Nov 5, before brew day**. Set temp is Nov 17 and Package/CIP Nov 20. **There are no flags at all.**
- **Also:**
  - Mark not done on the test is now refused: "A pre-brew step stays before brew day."
  - Before step 4, Mark not done and Change to Pass are refused: "A Set temp can't be before brew day." That's correct per the new rule, but the batch is then stuck until the user finds a brew day that is allowed.
  - Undo for each step works only while its snackbar is up.
  - The same happened through the API on another batch: `move` with `answer: move_only` also drags those steps, because pre-brew steps "always move with brew day".
- **Cause, as observed:** after step 2, the retest and FDH are dated before brew day. From then on they behave as pre-brew steps (they move with brew day under either answer), and the finished test counts as a "finished pre-brew step" for the gap 9 rule.
- **Screenshot:** `results/rc2_gap11_dialog.png`.

### Gap 10 · minor: the brew-day date box moves brew day with no question once the test after it is done
- **Path:** Batch dialog → Brew day date box, on a batch whose day-5 test is already done (failed, with a retest).
- **Expected:** The usual move question ("Move all following steps" / "Move only"). R1's brief expected a date-box "Move all" variant.
- **Observed:** No question; brew day moves with the pre-brew step only. The chain stops at the done test, so the retest and FDH stay put and end up before brew day. The only flag is "R2 Hop check is before Brew day, the step it follows.", nothing about the retest or FDH. This is the step that sets up gap 11. Moving it further, so that Set temp would come before brew day, is correctly refused ("A Set temp can't be before brew day."). So the date-box "Move all" variant of R1 can't be reached; R1 was run with the bar drag, and the date box was checked as described here.

### Gap 12 · minor: Mark not done on a late brew day is refused with a move message
- **Path:** Pre-brew step ticked late (Nov 13), brew day checked off the same day (Nov 13, #44), then Mark brew day not done.
- **Observed:** 422 "[TEST-TEMP] R2 Prep yeast was done Fri Nov 13; brew day can't be before it." Un-doing it would send brew day back to Nov 6. #44 stays taken until the user marks the pre-brew step not done first, which works, but the message doesn't say to do that. The snackbar Undo, while it's up, restores it fine.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Health SHA and ribbon show `e6f17fe`. |
| R1 | PASS | Fail → Retest → Move them, then a bar drag of +11 days (the hint read +11). **Mark not done:** test Nov 22, FDH Nov 24, Set temp Nov 26, Package/CIP Nov 29, the same distances from the test as before the Fail, with brew day Nov 17 and no flags. **Change to Pass** after the same steps gives the same dates, no flags. When putting steps back *would* place Set temp before brew day (after the date-box move, gap 10), Mark not done is refused in the UI with "A Set temp can't be before brew day." and Change to Pass is refused through the API (422 `not_before_brew`); nothing changed either time. Screenshots: `results/rc2_r1_mark_not_done.png`, `results/rc2_r1_refused.png`. The date-box Move all variant isn't offered (gap 10). |
| R2 | PASS | Five-step repro, all in the UI (the retest moved with the step dialog's "Or move to"). After the test was marked not done: FDH done Nov 13, Set temp Nov 15, Package/CIP Nov 18. After FDH was marked not done: **FDH Nov 13**, its pre-Fail day, in order, no flags. |
| R3 | PASS | Pre-brew step ticked late (Nov 13) then brew day checked off Nov 13: allowed (number prompt, #44, Move all), then undone with Undo. The other order (brew day Nov 13, then pre-brew Nov 13) is also allowed. With the pre-brew step done Nov 13, these are all refused with the message: date box Nov 12 (box reverts), brew-day check-off Nov 12, and shift +1, which would still leave brew day before Nov 13. Date box Nov 13 is allowed (question shown, cancelled). See gap 12. |
| R4 | PASS | `shift {days: 3, preview: true}` returns `{"preview":{"moved":7,"kept":0}}` and the batch reads back unchanged. A real bar drag +3 moves every step, and the snackbar Undo restores it exactly. |
| R5 | PASS | **Gap 1:** the last menu option is clear of the snackbar (left, centre and right hit the option) and selectable. **Gap 2:** the multi-select hint gives the reason; only Move all is offered. **Gap 3:** covered in R3. **Gap 4:** covered in R1/R2. **Gap 5:** phase and tank messages. **Gap 6:** a refused link is named at the API, both "Leads to CIP & Sanitize: …" and "Comes after Set temp - 34°: …", and the template is unchanged. The editor-dialog race wasn't re-run this time. **S8:** ✗ on the dot, retest, followers moved, kept after reload. **S10:** the Undo button and Cmd+Z both restore exactly. **S11:** "3 failed" flag, signed off, a 4th Fail brings it back "4 failed" unsigned; a done retest blocks Mark not done. |
| R6 | PARTIAL | Gaps 10, 11 and 12. Also correct: a finished pre-brew step + Fail/retest + shift attempts (refused while brew day would stay before the done day), then Mark not done restores the pre-Fail dates. Cmd+Z after the snackbar has been dismissed does nothing, which is expected. Split batches were not tested. |

## Data made and cleaned
All made by me, read back, and removed by exact id:
- Step types 152 "[TEST-TEMP] R2 Prep yeast" and 153 "[TEST-TEMP] R2 Hop check": retired.
- Template 1465 "[TEST-TEMP] D56 Q tpl": retired. Only refused template edits were tried on it after setup, and the template read back unchanged.
- Tanks 6826–6830 "[TEST-TEMP] D56 Q1–Q5": retired.
- Batches 7014–7018 (brewer1, planned, my tanks and template): deleted. #44 was used briefly in R3 and freed; `next_batch_number` is 44.
- One Dry hop step (94784) added for the gap 1 check was deleted by id. The flag sign-off on 7015 went away with the batch.
- Side effect, as in earlier runs: provisional P-labels on other planned batches were renumbered. They are derived; no seeded row was written.

## Settings restored
All 11 personas' `board_settings` were saved first to `results/board_settings_before_recheck2.json`. `scripts/settings_restore.js` ran twice at the end and both runs printed "ALL RESTORED".

## Couldn't test
- Split batches with these rules.
- The template-editor dialog race for gap 6 (API checked only).
- S12 on the brewhouse device still needs a brewer's staff code.
