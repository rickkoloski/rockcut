# D56 QA recheck 6 report (DEV, fix cycle 6)

- **Build:** `3885cf6098e6722aedae6d02999bee75f93656aa`. `GET /api/health` returned `sha` `3885cf6…` and the ribbon read `DEV · 3885cf6 — fictional test data only`.
- **Date:** Mon 2026-11-16 (America/Denver), on DEV as reseeded today. DEV only.
- **Size:** desktop 1366×768.
- **Personas used:** breweryMgr (templates, step types, tanks) and brewer1 (batches). All 11 personas were used only for the settings backup and restore. No password sign-in, no sign-out, no token read out of the page.
- **Seeded rows:** read only. No seeded row was written or previewed for a write.
  - UI writes went through my batch's exact bar test id and then the step from that batch's dialog, with a guard on my tank name and batch label.
  - "Elsewhere" edits went through the API by exact step id on my own batches.
  - My flag was signed off by API with its exact key after reading it back.
- **Verdict: pass with gaps.** Gaps 19 and 20 are fixed, gaps 1–18 hold, and the full hunt found no must-fix and no should-fix. One minor gap (21) remains. Q1 and R1–R3 PASS; R4 PARTIAL (minor only).

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 0 | |
| should-fix | 0 | |
| minor | 1 | 21 |

| Earlier gap | Status |
|---|---|
| 19 (brewed bar drag earlier had no limit) | **fixed** (R1) |
| 20 (brew-day Undo after a later change) | **fixed** (R2) |
| 1–18 | still fixed (R3). Gaps 10 and 11 can't be reached any more, because a test can't be done before brew day. |

## New gap

### Gap 21 · minor: a brewed bar drag is refused because of a **finished** Set temp's planned day
- **Path:** Brewed batch (brew day done Nov 6). Its Set temp was checked off on Nov 15, after brew day. Drag the bar 10 days earlier.
- **Observed:**
  - Refused: "A Set temp can't be before brew day." −9 is allowed.
  - Under decision 28 the finished Set temp keeps its done day (Nov 15); only its planned day would move, to Nov 5. Every *unfinished* step would still be allowed: the test and FDH are plain, and Package/CIP land after brew day.
  - So the refusal comes only from a done step's planned day, and the message tells the user their Set temp would be before brew day, which it wouldn't.
  - It's sharper on a two-day brew: with "1 of 2" done Nov 8 and a Set temp - 60° done Nov 10, the whole remaining plan can only move 2 days earlier. −3 is refused with the same message although nothing unfinished would cross a brew day.
- **Expected:** Either ignore finished steps' planned days in this check, or word the refusal for that case (for example "Set temp's planned day would be before brew day"). It's conservative and nothing breaks, so it's minor. Matt may simply confirm it's intended.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Health SHA and ribbon show `3885cf6`. |
| R1 | PASS | **Brewed −16** (batch #44, pre-brew step unticked): the preview gives 422 "A Set temp can't be before brew day."; the UI hint reads "−17 days · brew day stays on Fri Nov 6 · A Set temp can't be before brew day"; the drop alert is the same; nothing moved. Screenshot: `results/rc6_r1_brewed_minus16.png`.<br>**Two-day −7** ("1 of 2" done Nov 8, "2 of 2" Nov 14): the preview and the UI hint/drop say "Brew day 2 of 2 can't be before 1 of 2."; nothing moved. −6 (onto the same day) and −5 are allowed.<br>**Split part −20** (brewed #46, split Nov 14): the preview and the UI say "A step can't come before the split."; −2 is refused the same way, −1 (onto the split day) and +2 allowed. The parent's −20 is refused with "A Split can't be before brew day.".<br>**Smaller drags that break nothing:** brewed ±2 in the UI (hint "brew day stays on Fri Nov 6", snackbar "5 unfinished steps moved 2 days earlier/later. 2 steps stay where they are.", Undo exact); −9 allowed with −10 refused (Set temp exactly onto brew day vs before it); part +2 works and undoes. |
| R2 | PASS | **Check-off direction:** brew day checked off in the UI (#47), FDH checked off elsewhere, then Undo: "Something changed since. Nothing was undone." (409), nothing changed. FDH un-done elsewhere, then the same Undo button: "Undone.", the batch is back to its plan and #47 is freed.<br>**Un-check direction:** brew day marked not done (UI), FDH moved +1 elsewhere, then Undo is refused (409). FDH moved back −1, then Undo: "Undone.", and the batch is brewed again exactly as before.<br>R4 adds: a change in a **split part** also blocks the Undo, and putting it back makes the Undo work again. A change on **another batch** doesn't block it. |
| R3 | PASS | **S10:** Undo button and Cmd+Z exact. **S8:** persists after reload. **Gap 7:** five-step repro, back to plan exactly. **Gaps 8/16:** brewed bar +5 then Mark not done keeps the +5. **Gap 17:** brewed snackbar "5 unfinished steps and 1 finished step's planned day moved 5 days later. 2 steps stay…" and planned "every step 3 days later", both accurate. **Gap 15:** the unticked pre-brew step stays on brewed drags (R1).<br>**S11:** 3 Fails gives the flag; signed off by key; the 4th Fail brings it back; a done retest blocks Mark not done.<br>**Two-day brew:** Set temp between allowed after "1 of 2"; "2 of 2" moved later; the decision 26 refusal on a planned two-day batch. **Mirror:** "Mark Set temp - 60° not done first.".<br>**S3:** bar +3, Undo, reload: exact. **Gap 2:** hint gives the reason. **Gap 1:** last option clear of the snackbar. **Gap 13:** FDH before brew day refused. **Gap 3:** brew day before the finished pre-brew step refused. **Gap 9:** same day allowed. **Gap 14:** the retests aren't in the pre-brew move list. **Gap 18:** Change template with a pre-brew test retest chain: 0 links to the retests, no flags. **Gaps 5, 6:** API messages. **Gap 12:** "Mark [TEST-TEMP] R6 Prep yeast not done first.", then both un-done in order, number freed. |
| R4 | PARTIAL | Gap 21 (minor). Also checked and correct:<br>• **Undo scope:** a change on another batch doesn't block a brew-day Undo; a change in a split part does, until reverted.<br>• **Batch number reuse:** after un-checking a brew day (#46 freed), another batch was checked off as #46 elsewhere; B's Undo is then refused, so no duplicate number. With the default suggestion (#49), the Undo works and the numbers stay unique.<br>• **Brewed batch:** a plain step added before the done brew day is pre-brew and stays put on ±2 drags; a Set temp there is refused ("A Set temp can't be before brew day.").<br>• **Boundaries:** brewed −9/−10 (Set temp on brew day / before it); two-day −6/−7; part −1/−2.<br>Not reachable: brewhouse device writes (staff code). |

## Data made and cleaned
All made by me, read back, and removed by exact id:
- Step types 219 "[TEST-TEMP] R6 Prep yeast" and 220 "[TEST-TEMP] R6 Hop check": retired.
- Templates 1654 and 1655 ("[TEST-TEMP] D56 R6 tpl", "… tpl 2"): retired. Only refused edits were tried after setup.
- Tanks 7705–7712 "[TEST-TEMP] D56 6T1–6T8": retired.
- Batches 7827, 7828, 7829, 7832, 7833, 7835 and 7836 (brewer1, my tanks and templates): deleted. A planned two-day batch, 7834, was deleted mid-run.
  - The brewed ones (#44–#48) were first un-done newest first (retests, test, Set temps, then brew day), highest number first.
  - The split of 7829 (parts 7830 and 7831) was undone first.
  - #49 was used briefly and freed. `next_batch_number` is back to 44.
- A Dry hop added for the gap 1 check and one added in R4 were deleted by id. The flag sign-off went with its batch.
- Side effect, as before: provisional P-labels on other planned batches were renumbered. They are derived; no seeded row was written.

## Settings restored
All 11 personas' `board_settings` were saved to `results/board_settings_before_recheck6.json`. `scripts/settings_restore.js` ran twice at the end and both runs printed "ALL RESTORED". This includes brewer1's Gantt range, which I paged back in R1.

## Couldn't test
- Brewhouse device check-offs (S12): still need a brewer's staff code.
- Two real browsers: "elsewhere" edits were sent through the API in the same session, which is what a second browser sends.
