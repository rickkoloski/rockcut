# D56 QA recheck report (DEV, fix cycle 1)

- **Build:** `9f5fa20ef1c52a8e27483439a1bdfac29c294b04`. `GET /api/health` returned `{"env":"dev","status":"ok","sha":"9f5fa20…"}` and the ribbon read `DEV · 9f5fa20 — fictional test data only`.
- **Date:** Fri 2026-11-13 (America/Denver). DEV only; prod was never touched.
- **Sizes:** desktop 1366×768. R4 was repeated at tablet landscape 1280×800 with touch (`tap()`).
- **Personas used:** breweryMgr (templates, step types, tanks), brewer1 (batches, Gantt, check-offs). All 11 personas were used only for the settings backup and restore. No password sign-in, no sign-out, no token read out of the page.
- **Verdict: fail.** Gaps 1–6 are all fixed. But R8 found a new **must-fix** (gap 8), along with gaps 7 and 9 (should-fix). Q1 and R1–R7 PASS; R8 PARTIAL.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 1 | 8 |
| should-fix | 2 | 7, 9 |
| minor | 0 | |

### First-pass gaps

| Gap | Pass 1 | Now | Where checked |
|---|---|---|---|
| 1 snackbar over the last menu option | minor | **fixed** | R4, desktop and tablet |
| 2 multi-select drag hint has no reason | minor | **fixed** | R5 |
| 3 brew day can be moved before a finished pre-brew step | should-fix | **fixed** (see gap 9 for an edge) | R2 |
| 4 Mark not done after a retest move leaves the followers moved | must-fix | **fixed** (see gaps 7 and 8 for edges) | R1 |
| 5 misleading API message for a phase or tank | minor | **fixed** | R6 |
| 6 refused link not named | should-fix | **fixed** | R3 |

## New gaps

### Gap 8 · must-fix: after a whole-batch move, Mark not done or Change to Pass on a failed test puts Set temp before brew day
- **Path:** Gantt → test dot → Check off (Done on = due day) → Fail → Retest in 2 → "Move them with the retest". Drag the **batch bar** 10 days later. Then open the test → **Mark not done** → confirm, or → **Change to Pass**.
- **Expected:** The retest is removed. No step is left before brew day, and in particular no Set temp, since only plain or custom steps may be before brew day "however they get there". The follower dates should stay consistent with the moved batch, or the action should be refused or warned about.
- **Observed:** Brew day and the pre-brew step keep the +10 move. The test and its followers jump back to their dates from before the bar drag, because Matt's "pre-Fail dates even if moved since" rule is applied literally.
  - **Mark not done:** Brew day Nov 16, but Hop check Nov 11, FDH Nov 13 and **Set temp Nov 15**, all before brew day. Package/CIP Nov 18. The only flag is "R Hop check is before Brew day, the step it follows." Nothing flags Set temp being before brew day. The confirm text says "the steps after it go back to their dates" with no warning. Screenshot: `results/r8_shift_then_mark_not_done.png`.
  - **Change to Pass:** The same result: FDH Nov 13 and **Set temp Nov 15** before brew day Nov 16, Package Nov 18. The only flag is "FDH is before R Hop check". Screenshot: `results/r8_shift_then_pass.png`.
  - The snackbar's **Undo** right after Change to Pass restores the batch exactly.
- **Note:** After the bar drag, the done test itself moved on the Gantt to Sat Nov 21. Its dialog reads "Done Wed Nov 11 (planned Sat Nov 21)". So a finished post-brew step is moved by a batch drag, unlike a finished pre-brew step.
- **Repro (desktop, API equivalent):** Plan a batch, brew Nov 6, from a chained template: plain pre-brew −1 → Brew day 0 → has-result test day 5 → FDH day 7 → Set temp day 9 → Package/CIP day 12. Then:
  1. `POST /steps/<test>/complete {done_on: test due, result: fail, fail_action: retest, retest_days: 2, answer: move_all}`
  2. `POST /batches/<id>/shift {days: 10}` (this is what the bar drag sends)
  3. `POST /steps/<test>/uncomplete {}` or `PATCH /steps/<test>/result {result: pass}`
  4. Read `/api/production/schedule`.

### Gap 7 · should-fix: un-doing a follower that was done while the retest had shifted it sends it to the shifted date
- **Path:** Fail → Retest → Move them. Drag the retest +1, Move all. Check off FDH early (today, "Move only"). Mark the **test** not done: the retest is removed, FDH stays done, and Set temp/Package go back to their pre-Fail dates (correct per R1). Then Mark **FDH** not done.
- **Expected:** FDH goes back to a date consistent with its chain. Its pre-Fail date was Nov 13, and Set temp, which follows it, is Nov 15.
- **Observed:** FDH goes back to **Nov 16**, its date from before its own check-off, which included the +3 days from a retest that no longer exists. FDH now comes after Set temp, its follower. It is flagged ("Set temp - 34° is before FDH, the step it follows."), so it's not silent, but the schedule is left wrong.
- **Repro (desktop; UI and API give the same result):** Batch brew Nov 6, test Nov 11, FDH Nov 13, Set temp Nov 15. Run, in order:
  1. Fail the test, done Nov 11 → Retest 2 → Move them.
  2. Move the retest +1, Move all.
  3. Check off FDH, done Nov 13 → Move only.
  4. Mark the test not done. Result: FDH done Nov 13, Set temp Nov 15.
  5. Mark FDH not done. Result: FDH Nov 16, Set temp Nov 15.

### Gap 9 · should-fix: a pre-brew step ticked late (after brew day) blocks brewing that day, with a wrong message
- **Path:** A planned batch with brew day Nov 6 (overdue). On the Brewery board, tick the pre-brew task today, Nov 13; this is "allowed, it stays on its day". Then check off Brew day with Done on today.
- **Expected:** Brew day done today, on the same day the pre-brew step was finished. Or, at minimum, a message that matches the rule ("on or before").
- **Observed:**
  - Refused: "[TEST-TEMP] R Prep yeast was done Fri Nov 13; brew day can't be before it." Brew day wouldn't be before it; it would be on the same day.
  - Doing the same two ticks in the other order (brew day first, then pre-brew) is accepted. So the outcome depends on the order of two ticks done on the same day.
  - While brew day is still before the finished pre-brew day, any move toward compliance short of the next day is also refused, e.g. a bar drag of +1. Only a check-off on the original Nov 6, or a jump to Nov 14 or later, gets through.
- This follows Matt's "on or before" rule literally. The rule seems to have been written for moving brew day *earlier*, but it also catches a brewer who preps and brews on the same late day. Please decide whether same-day is meant to be refused, and if so fix the wording ("on or before it").
- **Repro (desktop, API):** Batch brew Nov 6, pre-brew Nov 5. Run `POST /steps/<pre>/complete {done_on: 2026-11-13}`, then `POST /steps/<brew>/complete {done_on: 2026-11-13, preview: true}`, which returns 422 `before_brew_day`. Also `POST /batches/<id>/shift {days: 1}` returns 422.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Health SHA and ribbon show `9f5fa20`. |
| R1 | PASS | **Gap 4 repro:** Fail → Retest → Move them, retest dragged +1, Mark not done. The confirm says the steps go back; FDH/Set temp/Package/CIP return to Nov 13/15/18/18, the pre-Fail dates, and this holds after reload. **Change to Pass** after the same moves: also back to the pre-Fail dates. **Done follower** (FDH checked off early while shifted): it stays done, and the undone followers go back to their pre-Fail dates. **Plain off-plan check-off** (Set temp 2 days early, Move all, then Mark not done): Package/CIP go back to Nov 18, as before. See gap 7 for what happens when the done follower is later marked not done. |
| R2 | PASS | Finished pre-brew step done Nov 13, brew day Nov 16. **Date box** to Nov 12 and to Nov 13: both refused at the preview with "[TEST-TEMP] R Prep yeast was done Fri Nov 13; brew day can't be before it." (alert and snackbar); the box reverts; Nov 14 is allowed (question shown, cancelled). **Bar drag** −3: refused, and the hint gives the reason while dragging. **Brew-day dot drag** −3 (onto the day) and −5: refused, with the reason in the hint; −2 is allowed. **Multi-select** (brew day + test) −3: refused, with the reason in the hint. **Brew-day check-off** done Nov 12 and done Nov 13: refused in the step dialog with the message. **API:** complete (move_all and move_only), shift −3 and move −4 all return 422 `before_brew_day`. Nothing moved after reload. Screenshots: `results/r2_bar_drag.png`, `results/r2_dot_drag.png`, `results/r2_multi_drag.png`. See gap 9 for the late-ticked case. |
| R3 | PASS | Race (CIP moved to day 10 via the API while the Add step dialog had Leads to CIP): 422 `link_order` "Leads to CIP & Sanitize: A step can't come before the step it follows.", shown in the dialog. Nothing saved (no step, no links). After the refusal, the dialog's pickers show the current days ("CIP & Sanitize · day 10"), and CIP is no longer offered as Leads to. Retry after CIP was put back saves the step and both links; this needed a page reload, because the editor doesn't see a later outside change, which is reasonable. A refused "comes after" is also named: "Comes after Set temp - 34°: …". Screenshot: `results/r3_link_refused.png`. |
| R4 | PASS | With "Dry hop added… UNDO" up, the step-type menu's last option "Something else" is clear of the snackbar. `elementFromPoint` at the option's left, centre and right all hit the option. A click or tap at the centre selects it. Desktop: option bottom 680, snackbar top 696. Tablet: option bottom 720, snackbar top 728. Screenshots: `results/r4_menu_desktop.png`, `results/r4_menu_tablet.png`. |
| R5 | PASS | Multi-select (undone pre-brew step + test) dragged +2: the hint now reads "Sat Nov 7 · +2 days / If you move only this step: after Brew day, which follows it · A pre-brew step stays before brew day". On drop, only "Move all" is offered (brew day moves too); "Move only 2 steps" is disabled with "Not possible: A pre-brew step stays before brew day." Cancelled, nothing moved. Screenshot: `results/r5_multi_hint.png`. |
| R6 | PASS | Template step at −1: with a phase, "A step before brew day has no phase."; in the second tank, "A step before brew day is in the first tank."; with both, the phase message; a Transfer still gets "A Transfer can't be before brew day." PATCHes give the same messages. All are 422 `not_before_brew`. |
| R7 | PASS | **S3:** the bar drag moves the pre-brew dot with it; Undo brings it back; reload confirms. **S8:** ✗ on the dot ("done · failed"), retest 2 days later, followers moved, kept after reload. **S10:** the Undo button and Cmd+Z each restore the batch exactly. **S11:** flag "Fest P4 · 3 failed [TEST-TEMP] R Hop checks"; Mark OK signs it off; a 4th Fail (Continue) brings it back as "4 failed", unsigned. A done retest blocks Mark not done ("Mark the retest not done first."). |
| R8 | PARTIAL | New gaps 7, 8 and 9. Also checked and correct: **late check-off + Fail + Change to Pass** keeps the late +2 and drops the retest's +2, and a later Mark not done restores everything. A **nested chain** works step by step: retest moved earlier, retest checked off late → Fail → Retest 2, retest Change to Pass (keeps its late +1), Mark test not done blocked by the done retest, Mark retest not done (back to before the retest's Fail), Mark test not done (back to the original pre-Fail dates). The **multi-select / dot drag** of a pre-brew step past brew day offers only "Move all". |

## Observations (not logged as gaps)
- `POST /api/production/batches/<id>/shift` ignores `preview: true` and applies the move. The UI never sends preview there, so a user can't hit it, but an API caller that expects a dry run gets a real move.
- Checking off a post-brew test before brew day is still accepted (the same observation as pass 1), now with a retest that can also land before brew day. Out-of-order flags are raised.
- Planning or deleting planned batches renumbers provisional labels (P#) on other planned batches, seeded ones included (snackbar: "Batch numbers updated: Altruism P6 → P5…"). This is derived and was the same in pass 1.

## Incidents (my own mistakes, both reverted)
- While locating my FDH dot, I opened a **seeded** batch's FDH (Altruism #39) and pressed Check off. Only the **preview** request was sent. I closed the question without applying, and read back that FDH 89551 is still not done. After that I used exact step ids for my own steps.
- In R7 (S11), a loose "Mark OK" locator in the Flags dialog also signed off a **seeded flag**, "Enos P8 fills FV1, which isn't sanitized." (`unsanitized_fill:6630.0`). I undid it at once with the snackbar's Undo. Read back: `signed_off: false`, `signoff: null`, `was_signed_off: false`, the same as before. It was still that way at the end of the run.
- My driver's request log printed an Undo call's URL path, which includes the API's one-time undo id. This was in terminal output only; nothing in `results/` contains it, and the id was already used. I redacted those paths for the rest of the run. No auth token was ever read out of the page.

## Data made and cleaned
All made by me and removed by exact id after reading the row back (`[TEST-TEMP]` name, my template, my tanks, planned):
- Step types 139 "[TEST-TEMP] R Prep yeast" and 140 "[TEST-TEMP] R Hop check" (has result): **retired**.
- Templates 1421 "[TEST-TEMP] D56 R tpl" and 1422 "[TEST-TEMP] D56 R links": **retired**.
- Tanks 6611–6614 "[TEST-TEMP] D56 R1–R4": **retired**.
- Batches 6818, 6819, 6820, 6821 and 6822 (brewer1, planned, my tanks, my template): **deleted**. 6821 was deleted mid-run after gap 8 left it in a broken state. No real batch number was taken: `next_batch_number` is still 44.
- The flag sign-off on batch 6818 went away with the batch.
- Two Dry hop steps added to batch 6819 for R4 were removed by id (92109, 92110) before the batch was deleted.

Seeded batches, templates and step types were only read, apart from the two reverted incidents above.

## Settings restored
`board_settings` for all 11 personas were saved first to `results/board_settings_before_recheck.json` (DEV was reseeded, so the pass 1 backup no longer applied). `scripts/settings_restore.js results/board_settings_before_recheck.json` ran twice at the end and both times reported every persona "ok" and "ALL RESTORED".

## Couldn't test
- **S12 on the brewhouse device** is still open. Please provide a brewer's staff code, or a way to act as a brewer on the device without one.
- Gap 8 with a split batch, or with the batch dialog's date box "Move all" instead of the bar drag. I expect the same result, but didn't run it.

Scripts: `scripts/` (driver with redaction, `recheck_helpers.js`, `r4_snack_menu.js`, settings backup and restore taking a file argument). Log: `results/progress.log`.
