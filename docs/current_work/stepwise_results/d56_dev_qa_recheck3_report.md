# D56 QA recheck 3 report (DEV, fix cycle 3)

- **Build:** `015c65a0b7b763f0e75b025507ade6478ecbaa2e`. `GET /api/health` returned `sha` `015c65a…` and the ribbon read `DEV · 015c65a — fictional test data only`.
- **Date:** Sat 2026-11-14 (America/Denver). DEV only.
- **Size:** desktop 1366×768.
- **Personas used:** breweryMgr (templates, step types, tanks) and brewer1 (batches). All 11 personas were used only for the settings backup and restore. No password sign-in, no sign-out, no token read out of the page.
- **Seeded rows:** read only. No seeded row was written or previewed for a write.
  - Every UI write opened my batch by its exact bar test id (`gantt-bar-<id>-0`) and then the step from that batch's dialog. The guard aborts unless the dialog names that batch's `[TEST-TEMP] D56` tank and label.
  - Dot drags used a dot located inside my batch's own row, and the guard refuses unless exactly one candidate matches.
  - My failed-tests flag was signed off by API with its exact key after reading it back.
- **Verdict: fail.** Decisions 22–24 work as written, and gaps 1–12 hold. But R6 found a new **must-fix** (gap 14) and R2 a **should-fix** (gap 13). Q1 and R1–R5 PASS; R6 PARTIAL.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 1 | 14 |
| should-fix | 1 | 13 |
| minor | 0 | |

| Earlier gap | Status |
|---|---|
| 10, 11 (brew day past a done test; steps treated as pre-brew) | **fixed** (R1, R2) |
| 12 (Mark brew day not done message) | **fixed** (R3) |
| 1–9 | still fixed (R4) |

## New gaps

### Gap 14 · must-fix: the retest of a pre-brew test moves with brew day and can land before the test it retests
- **Path:**
  1. On a planned batch (brew Nov 24), add a has-result plain step before brew day ("[TEST-TEMP] R3 Hop check - pre", Nov 21). It is `pre_brew: true`, correctly per decision 22.
  2. Check it off today, Nov 14 → Fail → Retest in 2. The retest is created on Nov 16 and is also `pre_brew: true`.
  3. Batch dialog → Brew day date box → Nov 16 (8 days earlier) → "Move only" → Apply.
- **Expected:** The retest never ends up before the test it retests. Either it doesn't count as pre-brew, or the move is refused or flagged.
- **Observed:**
  - The question says "[TEST-TEMP] R3 Hop check - retest (→ Sun Nov 8) and [TEST-TEMP] R3 Prep yeast (→ Sun Nov 15) move with brew day either way". After Apply, the **retest is due Nov 8, 6 days before the test it retests (done Nov 14)**.
  - **No flags.** Brew day itself (Nov 16) is allowed, being after the pre-brew test's done day.
  - Moving brew day 10 days earlier would put the retest on Nov 6.
- **Screenshot:** `results/rc3_r6_retest_before_test.png`.
- **Repro (API):**
  1. `POST /batches/<id>/steps {due_on: <brew−3>, step_type_id: <has-result plain>}`
  2. `POST /steps/<it>/complete {done_on: today, result: fail, fail_action: retest, retest_days: 2}`
  3. `POST /steps/move {ids: [<brew day>], days: −8, preview: true}`. The preview's `pre_brew.move_only` lists the retest moving to before the test's done day.

### Gap 13 · should-fix: a post-brew step can still be checked off before brew day, and then brew day is stuck
- **Path:** Planned batch, brew day Nov 28. Check off FDH (template day 7) early, today (Nov 14), with "Move only". This is accepted with no warning.
- **Observed:**
  - Decision 23 now applies: brew day can't be moved to Nov 14 or later, and **brew day can't be checked off today** ("FDH was done Sat Nov 14; brew day can't be after it."). So the batch can't be brewed on its planned day, or any day from Nov 14 on, until FDH is marked not done.
  - Brew day already sits after the done FDH (Nov 28), and even a +1 move is refused.
  - A whole-batch shift (bar drag) of ±1 is accepted, so the rule isn't applied the same way on every path.
  - Marking FDH not done clears it.
- **Expected:** Refuse or warn at the check-off of a post-brew step before brew day, since it creates a state the decision 23 rule then blocks. And treat the bar drag the same as the other paths, or document why it differs. Pass 1 noted test check-offs before brew day as an observation; with decision 23 they now block brewing.
- **Repro (API):** On a planned batch with brew day in the future: `POST /steps/<FDH>/complete {done_on: today, answer: move_only}`, then `POST /steps/<brew>/complete {done_on: today, preview: true}`, which returns 422.

## Question for Matt (not logged as a gap)
The **bar drag (whole-batch shift)** moves brew day past a finished follower. For example, a test done Nov 11 and brew day moved to Nov 17 by a +11 drag. The date box, dot drag, multi-select and check-off all refuse this under decision 23. The gap 8 fix (whole-batch moves kept after a Fail) relies on it, so I treated it as intended. Please confirm.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Health SHA and ribbon show `015c65a`. |
| R1 | PASS | Batch A, Fail → Retest → Move them, test done Nov 11. **Date box** to Nov 16 (+10) and to Nov 11 (on the test's day): both refused with "[TEST-TEMP] R3 Hop check was done Wed Nov 11; brew day can't be after it."; the box reverts and nothing moved. **Brew-day dot drag** +11 and +5: refused, with the message in the hint. **Multi-select** (brew day + pre-brew) +11: refused, with the hint. **API:** `move` move_only +10, and a brew-day check-off on Nov 12: 422 with the same message. Nov 10 (before the done test) is allowed. Screenshots: `results/rc3_r1_datebox.png`, `results/rc3_r1_dot.png`. |
| R2 | PASS | Batch B. A date-box Move only of +6 left the Hop check (template day 5) before brew day: `pre_brew: false`, and flagged "R3 Hop check is before Brew day, the step it follows.". Further brew-day moves (+2 Move only, −6, +6) leave it put; only the template −1 Prep yeast moves ("moves with brew day either way"). FDH (not pre-brew), checked off while before brew day, does **not** block brew day as a pre-brew step: a move to Nov 13, before its done day, is allowed (see gap 13 for the other direction). A **Dry hop added** through the batch dialog before brew day is `pre_brew: true` and moves with brew day under Move only. Once done (Nov 14), it blocks brew day on Nov 13 ("Dry hop was done Sat Nov 14; brew day can't be before it."), and Nov 14 is allowed. |
| R3 | PASS | Batch C: pre-brew step ticked late (Nov 14), brew day checked off the same day (#44). Mark brew day not done is refused with "Mark [TEST-TEMP] R3 Prep yeast not done first.". Marking the pre-brew step not done, then brew day, works: "Fest #44 is planned again; its number is freed.", and the batch is back to its plan. `next_batch_number` is 44. |
| R4 | PASS | **Gap 8:** fail, bar drag +11, Mark not done: followers at their old distance from the test (Nov 24/26/29), no flags. **Gap 7:** five-step repro; FDH lands back on Nov 13 and the batch matches its original plan exactly, no flags. **Gap 9:** same-day brew allowed (R3). **Gap 1:** last menu option clear of the snackbar (left, centre and right hit the option). **Gap 2:** multi-select hint gives the reason; only Move all is offered. **Gap 3:** a finished pre-brew step blocks an earlier brew day (R2). **Gaps 5, 6:** API messages name the phase, tank and link. **S3:** bar +2 with the pre-brew dot, Undo, reload: exact. **S8, S10:** Undo button and Cmd+Z both exact; the Fail persists after reload. **S11:** "3 failed" flag, signed off, 4th Fail brings it back unsigned; a done retest blocks Mark not done. |
| R5 | PASS | Read only. The 6 active seeded templates have no negative-day steps. On the 16 seeded batches, no step is `pre_brew: true`, no undone step sits before brew day, and there are no out-of-order flags. No planned seeded batch has done steps before brew day that decision 23 would freeze. So there are no seeded pre-brew dots to check, and nothing post-brew is marked pre-brew. |
| R6 | PARTIAL | Gap 14. Also checked and correct: **Change template** on a batch with a finished, added pre-brew step (confirm: "Steps you added are kept"; the done Dry hop is kept as pre-brew, and the new template's −2 step is pre-brew). **Split:** parts refuse steps before the split ("A step can't come before the split."). Moving the parent's brew day after the split with Move only is refused per answer ("A Split can't be before brew day."); Undo split works. **Late pre-brew tick + done follower:** a brew-day check-off on the planned day is still allowed, and other days are refused with the right message for each rule, so there's no dead end. |

## Data made and cleaned
All made by me, read back, and removed by exact id:
- Step types 168 "[TEST-TEMP] R3 Prep yeast" and 169 "[TEST-TEMP] R3 Hop check": retired.
- Templates 1510 "[TEST-TEMP] D56 W tpl" and 1511 "[TEST-TEMP] D56 W tpl 2": retired. Only refused edits were tried on them after setup.
- Tanks 7044–7049 "[TEST-TEMP] D56 W1–W6": retired.
- Batches 7212–7216 (brewer1, planned, my tanks and templates): deleted. Split parts 7217 and 7218 were removed by Undo split on 7216 before 7216 was deleted. #44 was used briefly in R3 and freed; `next_batch_number` is 44.
- A Dry hop added to 7216 for the gap 1 check was deleted by id (97483). The flag sign-off went with batch 7215.
- Side effect, as in earlier runs: provisional P-labels on other planned batches were renumbered. They are derived; no seeded row was written.

## Settings restored
All 11 personas' `board_settings` were saved first to `results/board_settings_before_recheck3.json`. `scripts/settings_restore.js` ran twice at the end and both runs printed "ALL RESTORED". brewer1's Gantt range, which I paged back and forth, compared equal.

## Couldn't test
- Split parts combined with Fails and retests (only basic split rules were tried).
- S12 on the brewhouse device still needs a brewer's staff code.
