# D56 QA recheck 5 report (DEV, fix cycle 5)

- **Build:** `eabc74ae42be5195987d5482c534ed9ab60c913e`. `GET /api/health` returned `sha` `eabc74a…` and the ribbon read `DEV · eabc74a — fictional test data only`.
- **Date:** Sat 2026-11-14 (America/Denver). DEV only.
- **Size:** desktop 1366×768.
- **Personas used:** breweryMgr (templates, step types, tanks) and brewer1 (batches). All 11 personas were used only for the settings backup and restore. No password sign-in, no sign-out, no token read out of the page.
- **Seeded rows:** read only. No seeded row was written or previewed for a write.
  - UI writes went through my batch's exact bar test id, then the step from that batch's dialog, with a guard on my tank name and batch label.
  - Board ticks targeted task labels containing my `[TEST-TEMP] D56` tank.
  - My flag was signed off by API with its exact key after reading it back.
- **Verdict: fail.** Decisions 28–30 work as written for later drags, and gaps 1–18 hold. But the full hunt found a new **must-fix**: a bar drag **earlier** on a brewed batch (gap 19). It also found a **should-fix**: undoing a brew-day check-off after a later check-off (gap 20). Q1 and R1–R5 PASS; R6 PARTIAL.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 1 | 19 |
| should-fix | 1 | 20 |
| minor | 0 | |

| Earlier gap | Status |
|---|---|
| 15 (brewed bar drag moved the unticked pre-brew step) | **fixed** (R1) |
| 16 (brewed bar drag lost by Mark not done) | **fixed** (R2) |
| 18 (Change template linked retests) | **fixed** (R3) |
| 17 (snackbar wording) | **fixed** (R4) |
| 1–14 | still fixed (R5). Gaps 10 and 11 can't be reached any more, because a test can't be done before brew day. |

## New gaps

### Gap 19 · must-fix: a bar drag **earlier** on a brewed batch has no limit
- **Path:** Brewed batch: brew day done Nov 6; pre-brew step not ticked; test, FDH, Set temp and so on still to do. Drag the bar left by 16 days.
- **Observed:**
  - The hint reads "−16 days · brew day stays on Fri Nov 6", and the snackbar "5 unfinished steps moved 16 days earlier. 2 steps stay where they are."
  - Result: Hop check Oct 31, FDH Nov 2, **Set temp Nov 4**, all before the done brew day (Nov 6) and before the pre-brew step (Nov 5).
  - The only flag is "R5 Hop check is before Brew day, the step it follows." Nothing flags Set temp before brew day.
  - Screenshot: `results/rc5_r6_settemp_before_brew.png`.
- **The same rule holds everywhere else:** moving that Set temp on its own is refused ("A Set temp can't be before brew day."), and so is the same −16 drag on a **planned** batch. Only the brewed bar drag skips the check.
- **Variants, same cause:**
  - **Two-day brew,** "1 of 2" done Nov 8: a −7 drag puts the undone "Brew day - 2 of 2" on Nov 6, **before "1 of 2"**, flagged. The done Set temp - 60°'s planned day goes to Nov 3, before brew.
  - **Split part** of a brewed batch: a −20 drag of part 1 puts its Set temp on Nov 3, before the parent's brew day (Nov 6) and before the split (Nov 22). Only "before Split" is flagged.
  - All three previews (`shift … preview: true`) return 200 with no refusal.
- **Expected:** The brewed bar drag refuses, or stops at, any move that puts a non-plain step (or "2 of 2", or a part's step) before the done brew day, like every other path.
- **Repro (API):** On a brewed batch with undone post-brew steps: `POST /batches/<id>/shift {days: −16}`, then read the schedule.

### Gap 20 · should-fix: Undo of a brew-day check-off still works after a later step was checked off
- **Path:** Page 1: check off brew day; the snackbar shows "Brew day done. Fest is #48 … UNDO". Meanwhile, elsewhere (a second session; I used the API), FDH is checked off. Back on page 1, press **Undo**.
- **Observed:**
  - "Undone." The batch is **planned again with FDH done**: the state decision 26 forbids, and that its mirror would refuse ("Mark FDH not done first."). No flag.
  - Brew day can then only be checked off on its old planned day. Today is refused ("FDH was done Fri Nov 13; brew day can't be after it."). That's the gap 13 trap again.
- **Contrast:** the bar-drag Undo in the same situation is refused ("Something changed since. Nothing was undone.", 409). So is Undo of "Mark FDH not done" after brew day was un-done elsewhere ("Brew day comes first…").
- **Expected:** Refuse it like the other Undos, or apply the mirror rule.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Health SHA and ribbon show `eabc74a`. |
| R1 | PASS | Brewed batch (#44), pre-brew step unticked, test Fail → Retest → Move them, bar +5.<br>• The hint reads "+5 days · brew day stays on Fri Nov 6".<br>• Snackbar: "5 unfinished steps and 1 finished step's planned day moved 5 days later. 2 steps stay where they are."<br>• The pre-brew step stays on Nov 5 and brew day on Nov 6. The done test's planned day moves to Nov 16 (done day stays Nov 11).<br>• No flags. Mark not done on the test works, and the followers keep the +5 (FDH Nov 18). |
| R2 | PASS | Brewed batch (#45), pre-brew step done, Fail → Retest → Move them.<br>• Bar +5, then the snackbar Undo restores every planned day exactly.<br>• Bar +5 again, then Mark not done: the followers keep the +5 (test Nov 16, FDH Nov 18, Set temp Nov 20, Package Nov 23).<br>• R6 adds: Change to Pass after a +3 brewed drag also keeps the +3. |
| R3 | PASS | Planned batch with an added pre-brew test (Fail → retest → Fail → retest 2), an added plain Dry hop on Dec 3, and one on Nov 19 dated before everything. Change template to "U tpl 2" ("Kept 5 added steps"):<br>• **no links to the retests**, and no flags;<br>• the finished pre-brew test is unlinked (no same-type entry in tpl 2);<br>• the Dec 3 Dry hop is re-linked in order (FDH → Dry hop);<br>• the Nov 19 Dry hop stays unlinked.<br>Changing back to "U tpl" (which has a day-5 Hop check): the finished pre-brew test does **not** take the day-5 test's place, the Dry hop is re-linked after Set temp, and there are no flags. |
| R4 | PASS | The snackbar matches what really moved, counted from the schedule before and after.<br>• Planned batch: "10 unfinished steps and 1 finished step's planned day moved 2 days later. 1 step stays where it is." = 10 / 1 / 1.<br>• Brewed batches: "5 … and 1 finished step's planned day … 2 steps stay" (R1, R2) and "6 unfinished steps … 6 steps stay" (R6), each matching. |
| R5 | PASS | **S10:** Undo button and Cmd+Z, exact. **S8:** persists after reload. **Gap 7:** five steps, back to the plan exactly. **S11:** 3 Fails gives the flag; signed off by key; the 4th Fail brings it back; a done retest blocks Mark not done.<br>**Two-day brew:** Set temp between refused before "1 of 2" (UI); allowed after; "2 of 2" moved later past it. **Mirror:** "Mark Set temp - 60° not done first." on "1 of 2".<br>**S3:** bar +2, Undo, reload: exact. **Gap 2:** hint gives the reason. **Gap 1:** last option clear of the snackbar. **Gaps 5, 6:** API messages. **Gap 13:** FDH before brew day refused ("Brew day comes first…"). **Gap 3:** brew day before the finished pre-brew step refused. **Gap 9:** same day allowed. **Gap 14:** the retests aren't in the pre-brew move list. **Gap 12:** "Mark [TEST-TEMP] R5 Prep yeast not done first.", then both un-done in order, number freed. |
| R6 | PARTIAL | Gaps 19 and 20. Also checked and correct:<br>• Change to Pass after a brewed drag keeps the drag.<br>• Undo of a bar drag after another edit is refused ("Something changed since. Nothing was undone.").<br>• Undo of "Mark FDH not done" after brew day was un-done elsewhere is refused.<br>• Board tick of an exempt retest before brew day: Pass/Fail asked, done.<br>• Brewing a batch with a pre-brew retest chain early (#48), then a bar +2: the retests and pre-brew steps stay ("6 unfinished steps moved … 6 steps stay"). Mark brew day not done puts the pre-brew steps back and frees the number.<br>• Split of a brewed batch and Undo split work.<br>**Observation:** after renumbering, the Brewery board showed the same batch under two P-labels (done tasks "Fest P7", open tasks "Fest P8") until reloaded. Derived labels only.<br>**Not reachable:** brewhouse device writes (staff code). Change template on a brewed batch (not offered). |

## Data made and cleaned
All made by me, read back, and removed by exact id:
- Step types 202 "[TEST-TEMP] R5 Prep yeast" and 203 "[TEST-TEMP] R5 Hop check": retired.
- Templates 1604 and 1605 ("[TEST-TEMP] D56 U tpl", "… tpl 2"): retired. Only refused edits were tried after setup.
- Tanks 7483–7490 "[TEST-TEMP] D56 U1–U8": retired.
- Batches 7612–7618 (brewer1, my tanks and templates): deleted.
  - The brewed ones (#44–#47) were first un-done newest first (retests, test, Set temp, then brew day), and #47 was freed before #44.
  - The split of 7613 (parts 7619 and 7620) was undone first.
  - #48 was used briefly twice and freed. `next_batch_number` is back to 44.
- Dry hop steps added for the gap 1 checks were deleted by id. The flag sign-off went with its batch.
- Side effect, as before: provisional P-labels on other planned batches were renumbered. They are derived; no seeded row was written.

## Settings restored
All 11 personas' `board_settings` were saved to `results/board_settings_before_recheck5.json`. `scripts/settings_restore.js` ran twice at the end and both runs printed "ALL RESTORED". This includes brewer1's Gantt range, which I paged back during R6.

## Couldn't test
- Brewhouse device check-offs (S12): still need a brewer's staff code.
- Undo across two real browsers: the "elsewhere" edits were made through the API in the same session, which is what a second browser would send.
