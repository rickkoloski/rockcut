# D56 QA report (DEV)

- **Build:** `fb2f5c332bbe5e03445d86d944c93d84bceb81ac`. `GET /api/health` returned `{"env":"dev","status":"ok","sha":"fb2f5c3…"}` and the ribbon read `DEV · fb2f5c3 — fictional test data only`.
- **Date:** Fri 2026-11-13 (America/Denver). Run against DEV only; prod was never touched.
- **Sizes:** desktop 1366×768. S3, S8 and S20 were repeated at tablet landscape 1280×800 with touch events (CDP touch drag, `tap()`).
- **Personas used:** breweryMgr, brewer1, brewer2, office1, bartender1, breweryDevice (read-only: it asked for a staff code). All other personas were used only for the settings backup and restore (`GET/PUT /api/me…`). No password sign-in, no sign-out, no token read out of the page.
- **Verdict:** 19 of 22 PASS and 2 PARTIAL. The two PARTIALs are S12 (staff code) and S18 (the error doesn't name the link). No scenario failed outright, but there is one **must-fix** gap, found while working through the limitations.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 1 | 4 |
| should-fix | 2 | 3, 6 |
| minor | 3 | 1, 2, 5 |

## Gaps

### Gap 4 · must-fix: Mark not done, after the retest was moved, leaves the following steps moved
- **Path:** Gantt → test step dialog → Check off (Done on = due day) → Fail → Retest in 2 → "Move them with the retest". Then drag the retest dot 1 day later and answer "Move all following steps" (the default). Then open the test → **Mark not done**.
- **Expected:** The retest is removed and the following steps return to the dates they had before the Fail. The confirm dialog says exactly that: "Its retest on Sat Nov 14 is removed, and the steps after it go back to their dates."
- **Observed:** The retest is removed and the links are restored, but FDH, Set temp, Package and CIP keep the shifted dates. They are +3 days: +2 from the Fail and +1 from the retest move. None of the shift was undone.
  Before: FDH Nov 13, Set temp Nov 15, Package/CIP Nov 18. After Mark not done: FDH Nov 16, Set temp Nov 18, Package/CIP Nov 21.
- **Contrast:** The same flow *without* the retest move (batch A, tablet) and **Change to Pass** both put the following steps back correctly. **Undo** (button or Cmd+Z) right after the Fail also restores exactly.
- **Repro (desktop):** Plan a batch from a template with Brew day 0 → has-result test day 5 → FDH day 7 → Set temp day 9 → Package/CIP day 12, all chained. Fail the test → Retest 2 → Move them. Drag the retest +1 → Apply. Mark the test not done → Confirm. Read `/api/production/schedule`.

### Gap 3 · should-fix: a finished pre-brew step can end up after brew day
- **Path:** Batch dialog → Brew day date box set **before** the date of an already-finished pre-brew step → answer "Move only Brew day" → Apply.
- **Expected:** A pre-brew step is never left on or after brew day. Either refuse the move, or warn or flag that the finished pre-brew step now falls after brew day.
- **Observed:** Allowed with no warning in the move question and no flag. The schedule shows Brew day Nov 12, then "[TEST-TEMP] Prep yeast" done Nov 13, so the step is after brew day. Screenshot: `results/gap3_done_prebrew_after_brew.png`. Undo restored it.
- **Repro (desktop):** Plan a batch (brew Nov 16, pre-brew Nov 15). Tick the pre-brew task on the Brewery board today (it becomes done Nov 13). Open the batch dialog, set Brew day to Nov 12 → Move only → Apply.

### Gap 6 · should-fix: a refused link on step save doesn't name the link (S18)
- **Path:** Template editor → Add step with **Comes after** Set temp and **Leads to** CIP & Sanitize. Before Save, move CIP via the API to a day earlier than the new step. Then Save.
- **Expected:** Nothing is saved, and the error **names the refused link** (for example "Leads to CIP & Sanitize…").
- **Observed:** Nothing is saved (correct: no step and no "comes after" link). The error is the generic "A step can't come before the step it follows." with no link named, so the user can't tell which of the two links failed. The dialog also still shows "CIP & Sanitize · day 12" after the race. The retry after restoring CIP saved the step and both links (correct).
- **Repro (desktop):** As above. The race was made with `PATCH /api/production/templates/<id>/steps/<cip>` `{day_offset: 10}` while the Add step dialog was open.

### Gap 1 · minor: the Undo snackbar covers the last option of the step-type menu
- **Path:** Batch dialog → Add step… (adding one leaves an Undo snackbar up) → Add step… again → open the Step menu.
- **Observed:** The snackbar sits over the centre of the last option, "Something else" (`elementFromPoint` at the option centre returns the snackbar). Only the left part of the row is clickable until the snackbar expires.
- **Size:** desktop 1366×768.

### Gap 2 · minor: a multi-select drag past brew day doesn't explain the refusal while dragging
- **Path:** Gantt → Cmd-click the pre-brew dot and a later step → drag the selection +2 days, past brew day.
- **Expected:** The drag hint gives the reason, as it does for a single dot ("Sun Nov 29 · +1 day · A pre-brew step stays before brew day").
- **Observed:** The hint shows only "Fri Dec 4 · +2 days". The move is correctly refused on drop, with the reason in a snackbar, and nothing is saved.
- **Size:** desktop.

### Gap 5 · minor: misleading message when a plain pre-brew step has a phase or second tank (API)
- `POST /api/production/templates/<id>/steps` with a plain step at `day_offset -1` and `phase_id` set, or with `vessel_index 1`, returns 422 "A [TEST-TEMP] Prep yeast can't be before brew day." It is correctly refused, but the message blames the step type when the real problem is the phase or tank. The UI hides those fields at day −1, so this shows up only through the API.

### Observation (not logged as a gap)
Checking off a post-brew test weeks **before** a planned batch's brew day is accepted (Done on defaults to today). The move question then defaults to pulling the following steps that many days earlier: batch A, "6 days earlier", with a warning that some steps will be flagged. Everything stays within the pre-brew rules, since plain steps may be before brew day, and the resulting `out_of_order` flags are raised. Still worth a product look.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Health SHA and ribbon match. |
| S1 | PASS | −1 plain step saved, preview dot left of brew day. Transfer, Set temp, Split, Package, CIP, Filter and a phase marker at −1 are refused with "A … can't be before brew day." −31 is blocked (min −30). Editing Set temp to −1 is refused. |
| S2 | PASS | Dot left of the bar on the first tank row. No overlap flag with the batch leaving the day before. |
| S3 | PASS | Desktop and tablet: the dot moves +2 with the bar and comes back on Undo; persists after reload. |
| S4 | PASS | Date box + "Move only": pre-brew moved Nov 28 → 30, later steps unchanged. The date box refuses pre-brew on or after brew day, and refuses Set temp or Package before brew day. "Move only" is disabled when it would put Set temp before brew day. |
| S5 | PASS | Single-dot drag onto brew day refused; the hint gives the reason. Multi-select is also refused (Gap 2). |
| S6 | PASS | Board tick while planned: done, no number prompt, still planned. Late tick (after brew day) allowed; the step stays on its day. Change template keeps the finished pre-brew step, with no duplicate when switching back. See Gap 3. |
| S7 | PASS | "Has a result" kept after reload. "Retest after 2 days" in the editor. Seeded Diacetyl test and Gravity check read as on (UI and API, read only). |
| S8 | PASS | Desktop and tablet: ✗ on the dot, retest 2 days after the check-off, follower moved, kept after reload. "Done … · Fail · retest …" and "Retest of …" shown. |
| S9 | PASS | Board card "✗ Fail · continued as planned"; nothing else moved ("Move only" answer). |
| S10 | PASS | Undo button and Cmd+Z both restore the batch exactly. See Gap 4 for Mark not done after other edits. |
| S11 | PASS | Flag "Fest P4 · 3 failed [TEST-TEMP] Hop checks", Mark OK signs it off, the 4th Fail brings it back ("4 failed", unsigned). A done retest blocks Mark not done and Change to Pass with "Mark the retest not done first." |
| S12 | PARTIAL | The device asks "Who's making this change? Your staff code" on the board and on the Gantt. No code was guessed or reset. The board text "✗ Fail · retest Sun Nov 15" and the retest task were verified as brewer1. |
| S13 | PASS | 422 `result_required` "Record Pass or Fail." (also for `result: null`). A bad value gives 422 `result_invalid`. A result sent for a non-test step is ignored. |
| S14 | PASS | −31: 422 `day_offset` "must be greater than or equal to -30". Retest days 0 and 31 on a template step: 422 "Enter 1–30 days." On check-off: 422 `retest_days_invalid` "Retest in 1 to 30 days." |
| S15 | PASS | office1 gets 403 on complete, result change and uncomplete, previews included. |
| S16 | PASS | Expanded tanks, "Label by" (that batch's rows by name only) and Your selection are kept after reload and in a new browser context. |
| S17 | PASS | B re-reads settings only after 1 min and shows the change with no reload. A failing `/api/me` shows no error. A save in B while a stale refresh is in flight is not undone. |
| S18 | PARTIAL | All-or-nothing and the retry work. The error doesn't name the link (Gap 6). |
| S19 | PASS | A step off the task list stays on the expanded row and in the batch dialog. Its name opens the step dialog, and the switch puts it back on the board. |
| S20 | PASS | Desktop and tablet: Cmd+Z with the dialog open runs Undo. The snackbar sits below the dialog (no overlap with the title or buttons, which stay clickable) and is still up after 8 s. Cmd+Z in a text field undoes only the typing. |
| S21 | PASS | Typing 1-2-0-5-2-0-2-6 into the date field: no saves while typing, exactly one PATCH (`2026-12-05`) on leaving. Closing straight from the field also saves once. Kept after reload. |

### Limitations checked beyond the scenarios
- A brew-day check-off on another day (late by 7 days) moves the undone pre-brew step with brew day. Mark not done then frees the number (#44) and restores the dates.
- Steps added before brew day on a batch (Dry hop, a custom step) move with brew day on a bar drag. Add step refuses Set temp, CIP and Package before brew day.
- Fail → retest → check off a follower → Change to Pass: the retest is removed, the undone followers go back, and the done follower stays.
- Migration on existing data (read only): 16 non-test batches look right. No non-plain step sits before brew day, no results appear on non-test steps, and no retests appeared from nowhere. Two seeded Diacetyl tests done in October have no result, which is expected history. Seeded templates now show `retest_days: 2` on every step, which is harmless.

## Data made and cleaned
All made by me and removed by exact id after reading the row back:
- Step types 126 "[TEST-TEMP] Prep yeast" and 127 "[TEST-TEMP] Hop check": **retired**.
- Templates 1377 "[TEST-TEMP] D56 pre-brew A" and 1378 "[TEST-TEMP] D56 tpl B": **retired**.
- Tanks 6391–6393 "[TEST-TEMP] D56 T1/T2/T3": **retired**.
- Batches 6620, 6621, 6622 and 6623 (brewer1, planned, on my tanks from my templates): **deleted**. One of them briefly got real number #44, which was freed again by Mark not done (`next_batch_number` is 44 again).
- Idea card 898 "[TEST-TEMP] D56 due date card" (bar board, bartender1): **archived** (the UI has no delete).
- A flag sign-off note "[TEST-TEMP] QA sign-off" on batch 6623, which went away with the batch.
- Side effect: planning and deleting planned batches renumbers provisional labels (P#/X#) on other planned batches, seeded ones included. These numbers are derived; no seeded batch was edited.

Seeded batches, templates and step types were only read. Retired `[TEST-TEMP]` rows from earlier runs by others were left alone.

## Settings restored
`board_settings` for all 11 personas were saved first (`results/board_settings_before.json`). They were restored and verified equal by `scripts/settings_restore.js`, run twice at the end; only brewer1 `production` needed restoring. brewer1's "Show planned batches" was changed during S17 and is back to on, its original value.

## Couldn't test
- **S12 on the brewhouse device:** it needs a staff code. **Please provide a brewer's staff code**, or a way to act as a brewer on the device without one, to finish S12 and the "device sharing one Gantt view" limitation.
- **Old browser values carry over once / carry-over overwriting newer server values:** I don't know the old localStorage key names without reading the source.
- **Two browsers changing the Gantt view at once:** only covered sequentially (S16).
- **Split parts with pre-brew steps:** not covered.

Scripts: `scripts/` (lib, driver, settings backup and restore, Q1). Screenshots: `results/*.png`.
