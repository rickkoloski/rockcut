# D56 QA recheck 4 report (DEV, fix cycle 4)

- **Build:** `f48ce9e372f2ad296c1a1655fd69e0ec3e773717`. `GET /api/health` returned `sha` `f48ce9e…` and the ribbon read `DEV · f48ce9e — fictional test data only`.
- **Date:** Sat 2026-11-14 (America/Denver). DEV only.
- **Size:** desktop 1366×768.
- **Personas used:** breweryMgr (templates, step types, tanks) and brewer1 (batches). All 11 personas were used only for the settings backup and restore. No password sign-in, no sign-out, no token read out of the page.
- **Seeded rows:** read only. No seeded row was written or previewed for a write.
  - UI writes went through my batch's exact bar test id, then the step from that batch's dialog, with a guard on my tank name and batch label.
  - Board ticks targeted task labels that include my `[TEST-TEMP] D56` tank.
  - My flag was signed off by API with its exact key after reading it back.
- **Verdict: fail.** Decisions 25 and 26 and the mirror work, and gaps 1–14 hold. But checking off tests now needs brewed batches, and that exposed a new **must-fix** on brewed batches (gap 15), plus gaps 16 and 18 (should-fix) and 17 (minor). Q1 and R1–R4 PASS; R5 and R6 PARTIAL.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 1 | 15 |
| should-fix | 2 | 16, 18 |
| minor | 1 | 17 |

| Earlier gap | Status |
|---|---|
| 14 (retest of a pre-brew test moved with brew day) | **fixed** (R1) |
| 13 (post-brew check-off before brew day) | **fixed** (R2: now refused everywhere) |
| 1–12 | still fixed (R5). Gaps 10, 11 and 13 can't be reached any more, because a test can't be done before brew day. |

## New gaps

### Gap 15 · must-fix: a bar drag on a brewed batch moves its unfinished pre-brew step past the done brew day
- **Path:** A batch brewed on Nov 6 (#45) whose template pre-brew step (Prep yeast, Nov 5) was never ticked. Its test was failed with a retest. Drag the bar +5.
- **Observed:**
  - The snackbar reads "6 unfinished steps 5 days later (finished steps keep their dates)."
  - Brew day stays Nov 6 (done), but the **undone pre-brew step moves to Nov 10, after brew day**. It's flagged "Brew day is before [TEST-TEMP] R4 Prep yeast, the step it follows."
  - Mark not done on the failed test is then refused with "A pre-brew step stays before brew day.", a message about a step the user didn't touch.
- **Expected:** A pre-brew step is never moved on or after brew day. On a brewed batch, the drag should leave it before brew day or refuse.
- **Why it matters:** an unticked pre-brew task on a brewed batch is a normal real-world state.
- **Repro (API):** On a planned batch, brew day check-off on the planned day (`/steps/<brew>/complete`, batch number), then `POST /batches/<id>/shift {days: 5}`. Read the schedule: pre-brew `due_on` is after brew `done_on`.

### Gap 16 · should-fix: on a brewed batch, the bar drag doesn't move finished steps' planned days, so Mark not done after it undoes the drag for the followers
- **Path:** Brewed batch (pre-brew step done, to avoid gap 15). Fail the test (Nov 11) → Retest → Move them. Drag the bar +5, then Mark the test not done.
- **Observed:**
  - The snackbar reads "5 unfinished steps 5 days later (finished steps keep their dates)." The done test's planned day stays Nov 11; it doesn't move, against decision 27.
  - Mark not done then puts FDH/Set temp/Package back to Nov 13/15/18, their dates from before the bar drag. The followers keep their distance from a test that "didn't move", so the +5 drag is silently lost for them.
  - On a **planned** batch, the same drag does move done steps' planned days (see R6), so planned and brewed batches behave differently.
- **Expected:** Decision 27 on brewed batches too (keeping the done brew day's actual date is fine). Or, if brewed batches are deliberately exempt, Mark not done should keep the whole-batch move.

### Gap 18 · should-fix: Change template links the new template's pre-brew step to kept retests
- **Path:** A planned batch with an added pre-brew test (Fail → retest → retest 2). Change template (batch dialog → Template → Change template). The confirm reads "Kept 3 added steps".
- **Observed:**
  - New links "R4 Prep yeast → R4 Hop check - retest" and "→ retest 2" appear. They didn't exist before: I checked by Undo, then redid the change.
  - Result: two false flags ("… retest is before [TEST-TEMP] R4 Prep yeast, the step it follows."), and moving the new Prep yeast now offers to move retest 2 with it.
- **Expected:** Kept steps keep their own links; no links invented to the new template's steps.

### Gap 17 · minor: the bar-drag snackbar misdescribes a finished retest
- On a planned batch, a +3 bar drag reads "9 unfinished steps 3 days later (finished steps keep their dates)."
- The count includes a **finished** retest, whose planned day did move (Nov 14 → 17, done day unchanged). Moving it is correct per decision 27; the wording isn't.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Health SHA and ribbon show `f48ce9e`. |
| R1 | PASS | Planned batch, brew Nov 24.<br>• Added a has-result step before brew day through the batch dialog (`pre_brew: true`).<br>• Failed it today → retest Nov 16, `pre_brew: false`.<br>• Date box: brew day to Nov 16, Move only. The question lists only Prep yeast as moving with brew day; the retest stays on Nov 16.<br>• The retest was checked off (Pass) **before** brew day: allowed.<br>• Brew day was then checked off (Nov 14, #44) and marked not done: allowed, number freed.<br>• The done retest is not treated as a follower that blocks brew day: brew day +1 is allowed. |
| R2 | PASS | Planned batch, brew Nov 8, not done. FDH and the test are refused with "Brew day comes first. FDH can't be done before it." / "… R4 Hop check can't be done before it.", nothing changed, from:<br>• the Brewery board tick;<br>• a Gantt dot → step dialog;<br>• the batch dialog → step name → step dialog;<br>• the API (422 `brew_first`).<br>The test is refused before any Pass/Fail prompt. Pencilled batch: the step dialog shows "Schedule this batch first. … Schedule it to check off its steps…"; the API gives 422 `schedule_first`; pencilled tasks aren't on the board. Screenshots: `results/rc4_r2_board.png`, `results/rc4_r2_pencilled.png`. |
| R3 | PASS | Two-day brew ("1 of 2" Nov 8; "2 of 2" moved to Nov 12), with a Set temp added on Nov 10, between them.<br>• Before "1 of 2" is done, the Set temp is refused ("Brew day comes first. Set temp - 60° can't be done before it.").<br>• After "1 of 2" (#44): the Set temp checks off; "2 of 2" moves later (Nov 13) past it, allowed. Previews of a move before it, +5, and a check-off today are all allowed.<br>• Mark "1 of 2" not done gives "Mark Set temp - 60° not done first." |
| R4 | PASS | Brew day done (#45), then the snackbar Undo puts it back exactly (planned, number freed). Brew again, FDH done, then Mark brew day not done is refused with "Mark FDH not done first.". FDH not done, then brew day not done, works and frees the number. Screenshot: `results/rc4_r4_mirror.png`. |
| R5 | PARTIAL | Regressions pass; gaps 15 and 16 found here.<br>**S8/S10** on a brewed batch: Undo button and Cmd+Z both exact, and the Fail persists after reload.<br>**S11:** 3 Fails gives the flag; signed off by key; a 4th Fail brings it back unsigned; a done retest blocks Mark not done.<br>**Gap 7:** five-step repro lands back exactly on the plan.<br>**Gap 8:** see gap 16 (brewed batch).<br>**S3:** bar +2 with the pre-brew dot, then Undo and reload: exact.<br>**Gap 1:** last menu option clear of the snackbar.<br>**Gap 2:** multi-select hint gives the reason; only Move all is offered.<br>**Gap 3:** brew day before the finished pre-brew step is refused.<br>**Gap 9:** same day allowed; brewed #46.<br>**Gap 12:** brew planned Nov 6, pre-brew ticked Nov 14, brewed Nov 14; Mark brew day not done gives "Mark [TEST-TEMP] R4 Prep yeast not done first.", and doing that works.<br>**Gaps 5, 6:** API messages name the phase, tank and link. |
| R6 | PARTIAL | Gaps 17 and 18. Also correct: a **retest chain of a pre-brew test** (test → retest → retest 2), none of them pre-brew, with retest 2 checked off before brew day (exempt). A **planned-batch bar drag** moves done post-brew steps' planned days (decision 27) and keeps the finished pre-brew step. Not tried this round: split parts with decision 26, and Undo after other edits beyond the Cmd+Z and snackbar checks. |

## Data made and cleaned
All made by me, read back, and removed by exact id:
- Step types 185 "[TEST-TEMP] R4 Prep yeast" and 186 "[TEST-TEMP] R4 Hop check": retired.
- Templates 1557 and 1558 ("[TEST-TEMP] D56 V tpl", "… tpl 2"): retired. Only refused edits were tried on 1557 after setup.
- Tanks 7263–7269 "[TEST-TEMP] D56 V1–V7": retired.
- Batches 7412–7418 (brewer1, my tanks and templates): deleted, after un-brewing.
  - The brewed ones were first un-done in reverse order (retests, test, Set temp, then brew day). #45 was freed before #44.
  - `next_batch_number` is back to 44. Numbers 44, 45 and 46 were each used briefly.
- Dry hop steps added for the gap 1 checks were deleted by id. The flag sign-off went with its batch.
- Side effect, as before: provisional P-labels on other planned batches were renumbered. They are derived; no seeded row was written.

## Settings restored
All 11 personas' `board_settings` were saved to `results/board_settings_before_recheck4.json`. `scripts/settings_restore.js` ran twice at the end and both runs printed "ALL RESTORED".

## Couldn't test
- Split parts with decision 26 (a part's step before the parent's brew day is done).
- S12 on the brewhouse device still needs a brewer's staff code.
