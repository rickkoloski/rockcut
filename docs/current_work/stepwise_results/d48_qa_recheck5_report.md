# D48 QA recheck 5: targeted pass on split moves and check-offs (DEV)

- **Build:** D48 fix cycle 5 at `bb38b29` (DEV API v56 / UI v59, migrated and reseeded today), as given in my prompt. DEV has no version endpoint, so I couldn't confirm the build myself. Tested on https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev. Prod was not touched.
- **Tester:** fresh, independent QA (Claude), 2026-10-26 (America/Denver). Headless Chromium + Playwright, timezone America/Denver.
  - One browser per script, closed at the end of each.
  - The two-user check used owner and breweryMgr as two contexts in that one browser.
- **Personas:** loaded from `auth/*.json` with `storageState`. I never opened the auth files.
  - API calls were made from inside the page, and no token was returned.
  - A grep of `results/r5_*` and `scripts/r5_*` for `ses_…`, `dev_…` and `Bearer …` finds nothing.
- **Data:** I used only my own `[TEST-TEMP]` data (ledger: `results/r5_created.json`), and all of it is cleaned up (see the end). I only read the seed.
  - The seed is unchanged: all 15 non-test batches match my opening snapshot step by step, and so do the Serving 3 / Serving 4 marks.
  - I didn't change any persona's theme.
- **Scripts:** `scripts/r5_*.mjs`. **Logs:** `results/r5_*.log`. **Screenshots:** `shots/r5_*.png`.

**My data:**
- Tanks Q1VA–Q1VJ are tank ids 1100–1108.
- **A** (batch 1312) is a copy of the Standard ale template: brew Thu Nov 12 in Q1VA, Package Mon Dec 7.
- **L** (batch 1313) is a copy of Lager with transfer: brew Fri Nov 13 in Q1VB, transfer into Q1VC on Fri Dec 18.
- **Past-dated probes** (brew Sep 15 / Sep 28) can have their steps checked off. They were created and deleted inside each script.

## Summary

**Y1, Y2 and Y3 are fixed.**
- A split batch moves as one tree from every entry point I tried. Each move's Undo restores it exactly, and a stale two-user Undo is refused.
- Every exit is refused before brew day, with "Check off brew day first.", and brew day can't be un-checked while an exit is done.
- Brand and Template are read-only on parents and parts, and the API refuses changing them.

**This pass finds 1 new must-fix (Z1), so under the close-out rule D48 can't close yet.** Z1 is a narrow path next to Y2: a split part can be left **"fermenting" with no done steps while its parent is planned**, and no Mark not done brings it back.

| # | Severity | Item | Result |
|---|---|---|---|
| Y1 | was must-fix | Moving a split parent left its parts behind | **Fixed** (all entry points, 2 and 3 parts, staying or not, Undo, two users) |
| Y2 | was must-fix | Checking off the Split before brew day broke the status | **Fixed** (Split, Transfer, Filter, Package full / partial, on a batch and a part; un-check order; back to planned with P-number and Delete) |
| Y3 | was minor | Brand / Template pickers enabled on a split parent | **Fixed** (UI read-only; API `split` / `split_part`) |
| **Z1** | **must-fix** | A part's Package done while its Split isn't done, then un-checked → the part stays **"fermenting"** with nothing done, even after brew day is un-checked | **New** |
| Z2 | minor | A late (off-plan) check-off of the Split moves the parts, but the snackbar only says "Split - Transfer done." and doesn't name them | **New** |
| Spot | — | Split lock, Undo split, refusals, phone width, seed Altruism #39 | **Pass** |

---

## Y1. A split batch moves as one tree: **fixed**

### API (`POST /steps/move`)

Source: `results/r5_y1api.log`.

**What I ran:**
- **Shapes:**
  - A split on Nov 20 in four shapes: stays + Q1VD; nothing stays `[VD, VE]`; three parts stays + VD + VE; three parts nothing stays `[VD, VE, VF]`.
  - L split before its template transfer (Dec 1, stays + VD).
  - L split after it (Dec 20, nothing stays `[VB, VD]`).
- **Undo:** after every move I sent its undo token and compared the whole family (steps, dates, links, tanks, status, P-number) with the state before the move. Every one was **identical**.

| Move | Result |
|---|---|
| Brew day +7, Move all | Parent, Split (and its CIP when nothing stays) and every part step +7. The preview lists the parts' steps with their batch ids. No flags |
| Brew day −3, Move all | The whole tree −3 |
| PDH +3, Move all | Split and all part steps +3 |
| Split +7 / +20, **Move all or Move only** | The parts move with it either way, including +20 (past the parts' old Package). The preview returns `carried` = the parts' steps |
| Split −3 / −8 (onto brew day) | The parts move too. Flagged `out_of_order` (Split before PDH) + `tank_overlap` |
| L Split +10 / +25 (past the parts' Dec 18 transfer and exits) | The parts' transfers, CIPs and Packages move with it |
| L (split after its transfer) Transfer +2, Move all | The Split and both parts +2 |
| **Brew day +7, Move only** | Allowed: the Split stays. `out_of_order` "Lag is before Brew day" |
| Brew day +10, Move only (past the Split) | Allowed. `out_of_order` on Lag and PDH, plus `tank_overlap` / `dirty_fill`. It's flagged |
| Part 2 FDH −6 (before the split), Move only or Move all | **`out_of_order` "P6.2: FDH is before Split - Transfer, the step it follows."** |
| Multi-select [Split, part 2 FDH] +3, Move all | Everything +3. Part 2's FDH isn't moved twice |
| Multi-select [Brew, part 2 Carb] +3, Move all / Move only | Tree +3 / Brew and Carb only (Carb after Package is flagged) |

**Blocks** (past-dated split, part 2's Carb checked off early; `results/r5_y2api.log`, `results/r5_y2b.log`):
- Brew +2 Move all, PDH +2 Move all, Split ±2 (either answer) and a multi-select including a parent step → all **422 `part_step_done`**, and nothing changes.
- The message reads "[TEST-TEMP] QA R5 Pils #44.2: FDH is already done, so the split can't move. Mark it not done first."
- **Move only** on Brew day +2 / +10 is still allowed (flagged as above).
- Undo split with a done part step → 422 `part_step_done` (as before).

### UI (`results/r5_ui_y1.log`)

I ran this for stays + VD and for three parts with nothing staying.

| Entry point | Result |
|---|---|
| **Drag Brew day +7** | The prompt heading reads "[TEST-TEMP] QA R5 Pils P6 and its 2 parts · Brew day moved 7 days later" (or "…its 3 parts…"). The parts' steps are listed under their labels P6.1, P6.2, P6.3 (`shots/r5_y1_prompt_2parts.png`, `shots/r5_y1_prompt_3parts.png`). Apply moves the whole tree, and the snackbar Undo restores it exactly |
| **Drag the Split +3** | Stays (nothing following): **no prompt**. The snackbar reads "Split - Transfer moved 3 days later, with … P6.1 and … P6.2." Nothing stays (CIP follows): the prompt says "P6.1, P6.2 and P6.3 move with it either way." Both move the parts; Undo is exact |
| **Split step dialog → Or move to** | Same as dragging the Split; parts carried; Undo is exact |
| **Batch dialog → the Split's date field** | Same; parts carried; Undo is exact |
| **Drag the parent's bar sideways +2** | "… P6: every step 2 days later.", and the parts move +2 too; Undo is exact |
| **Multi-select** (parent PDH + part 2 FDH), drag +2 | The prompt lists the parent's and every part's following steps. Apply moves everything +2 once; Undo is exact (`shots/r5_y1_multi_prompt.png`) |
| **Drag Brew day, choose Move only** | Only Brew day moves; flagged; Undo is exact |
| **Two users** | Owner drags Brew +7 (Move all), then breweryMgr moves part 2's FDH +1. Owner's Undo → "Something changed since. Nothing was undone.", and the family is unchanged. After breweryMgr undid their move, owner's undo token restored the split state exactly |
| **Late (off-plan) check-off** of the Split, +2 days (UI and API) | The parts move +2 with it; Undo is exact. With a done part step → 422 `part_step_done`. See Z2 for the snackbar wording |

**Phone (412×915, touch)**, on the move prompt with three parts:
- The dialog spans 32–380 px, with no element beyond the viewport and no page overflow (`scrollWidth` 412).
- The list scrolls, and **Apply** is visible and works.
- Undo restored the tree.
- Screenshots: `shots/r5_phone_move_prompt.png`, `shots/r5_phone_move_prompt_bottom.png`.

---

## Y2. Nothing empties a tank before brew day: **fixed** (see Z1)

Sources: `results/r5_y2api.log`, `results/r5_y2b.log`, `results/r5_status.log`, `results/r5_ui_y2.log`.

**Refused before brew day is done** (422 `before_brew_day`, "Check off brew day first."), and nothing changes:

| Step | Unsplit batch | Split parent | Part (stays / leaves) |
|---|---|---|---|
| Split - Transfer | — | refused | — |
| Transfer | refused | — | refused (added on part 2; L's template transfer on both parts) |
| Filter | refused | — | refused (added on part 1) |
| Package (full) | refused | — | refused (both parts) |
| Package - Partial | refused | — | refused (added on part 2) |

- **Still allowed early:** PDH, FDH and Carb on a batch, and FDH / Carb on a part. Status stays **planned** with its P-number, and un-checking leaves the family identical.
- **Step dialog (UI):** Check off on the Split and on part 2's Package shows "Check off brew day first." at the top of the dialog, and nothing is saved (`shots/r5_y2_split_checkoff_refused.png`, `shots/r5_y2_part_package_refused.png`).
- **Multi-select bar:** it offers only **Assign to…** and **Done selecting**, so there is no check-off route there to test.

**Un-check order:**
- Brew day with the Split, a Transfer, a Package or a Package - Partial done → 422 `exit_done`. The message names the step: "Mark Split - Transfer not done first." / "Mark Transfer not done first." / "Mark Package not done first." This holds for parts' exits too.
- The UI shows the same message at the top of the Brew day dialog (`shots/r5_y2_brew_uncheck_refused.png`).
- Un-check the exit, then brew day → **planned, with its P-number** (`next_batch_number` back to 44). **Delete → 200.**
- With a brewed split, Split done then un-done → parent fermenting, parts planned. Then brew day un-done → everything planned P1 / P1.1 / P1.2, identical to before.

---

## Y3. Brand and Template on a split: **fixed**

- **UI:** parent and part dialogs show Brand and Template **disabled** with "Undo the split first to change it" (`shots/r5_y3_parent_dialog.png`, `shots/r5_y3_part2_dialog.png`).
- **API:**
  - parent Brand → 422 `split`;
  - part Brand → 422 `split_part`;
  - parent Template → 422 `split`.

## Spot checks: **pass**

- **Lock:** parent vessel → 422 `split`; staying part's vessel → 422 `split`; Delete parent → 422 `split`; a split with the same tank twice → 422 `same_tank`. Undo split → 200, and every Undo split in this pass restored the batch exactly.
- **Seed Altruism #39 / #39.1 / #39.2 (look only):**
  - #39.2 is in Serving 3.
  - The parent's and #39.1's Ferment in show "Undo the split first to change it".
  - Opening the three dialogs sent **no write**, and the batches are unchanged.

---

## New gaps

### Z1 (must-fix). A split part gets stuck as "fermenting" with no done steps

- **Path (API or step dialogs):** past-dated batch, split on Oct 6, stays + Q1VH.
  1. Check off the parent's Brew day.
  2. Check off the **Split**. The parent becomes completed, and the parts fermenting (correct).
  3. Check off **part 2's Package**. Part 2 becomes completed (correct).
  4. **Mark the Split not done** → **200**. This is accepted even though part 2's Package is done. Parent fermenting, part 1 planned, part 2 still completed.
  5. Mark part 2's Package not done → part 2 is now **"fermenting"**, but the Split isn't done.
  6. Mark Brew day not done → 200. The parent is **planned P1** and part 1 is planned P1.1, but **part 2 stays "fermenting"** (P1.2).
- **Second route to the same state:**
  - With brew day done but the Split **not** done, a part's Package can still be checked off (200). The part becomes "completed" before any beer was split into it.
  - Mark not done → that part is then "fermenting" with the Split not done.
- **Expected:** "Mark not done on a Split or Package goes back to what the steps support." With no done Split (and, at the end, no done brew day), every part is **planned**, as in the clean case (Split un-checked with no part exits done → parts planned).
- **Observed:**
  - After step 6 the family has **0 done steps**, yet part 2's status is `fermenting` while its parent is `planned P1`. That is the "fermenting before brew day" state Y2 was meant to rule out.
  - Part 2's dialog drops "planned" from its subtitle. It shows Template and Brand as plain text, the way a brewed batch's dialog does (`shots/r5_stuck_part_dialog.png`).
  - No Mark not done brings it back. Only **Undo split** clears it, because merging back gives a planned parent.
- **Why must-fix:** wrong data is saved: a status that none of the batch's steps support. It's reached with ordinary check-offs and un-checks, and the obvious fix (Mark not done) doesn't restore it.
- **Likely fixes** (for the developer to choose): either derive a part's status from its parent's Split as well as its own steps when un-checking, or refuse Mark not done on the Split while a part's exit is done, and refuse a part's exit until the Split is done, the way brew day is guarded.
- **Controls:**
  - Checking a part's FDH / Carb and un-checking it (brew day done or not, Split done or not) leaves statuses correct.
  - An unsplit lager with Package checked off before its Transfer goes completed → planned correctly when un-checked.
- **Repro (API):**
  1. Plan a batch with brew day 4 weeks ago.
  2. `POST /batches/:id/split` (stays + another tank).
  3. Complete the brew step (with a batch number), then the split step, then part 2's Package.
  4. Uncomplete the split step, then part 2's Package, then the brew step.
  5. `GET /schedule`: part 2 has `status: "fermenting"` and no done steps.
- **Evidence:** `results/r5_ui_y2.log` (section d), `results/r5_y2b.log` (Z1 and Z2 sections; those are my script labels for the two routes), `results/r5_status.log` (controls), `shots/r5_stuck_part_dialog.png`, `shots/r5_stuck_part_gantt.png`.
- **Cleanup:** every probe batch was recovered with Undo split and deleted.

### Z2 (minor). A late check-off of the Split doesn't name the parts it moves

- **Path:** brewed split batch → click the Split step (due Oct 6) → Done on **Oct 8** → **Check off**.
- **Expected:** RECHECK5 says "With nothing else following, there's no prompt and the snackbar names the parts", as dragging the Split does ("Split - Transfer moved 3 days later, with … P6.1 and … P6.2.").
- **Observed:**
  - No prompt (correct), and both parts **do** move +2 days.
  - But the snackbar only reads "Split - Transfer done." with Undo. Nothing tells the user that the parts' schedules moved.
  - Undo restores everything exactly.
- **Evidence:** `results/r5_ui_y2.log` (section b), `shots/r5_y2_offplan_prompt.png`.
- **Severity:** wording only; the data is right.

---

## Notes

- **P-numbers** shifted during my moves ("Batch numbers updated: … Lager P7 → P6, … Pils P6 → P7"), as the brief allows. `next_batch_number` was 44 at the start and the end. Every brew-day check-off in my probes was un-checked, so no batch number was used.
- **Ignored PATCH:** `PATCH /api/production/steps/:id {due_on}` returned 200 but changed nothing. The UI never sends it (date changes go through `/steps/move`), so I'm not counting it.
- **No automated suite** was running. **Credentials:** no prompts.

## Data created and cleaned up (by recorded id; ledger `results/r5_created.json`)

| Kind | Ids | Cleanup |
|---|---|---|
| Brands | 661 `[TEST-TEMP] QA R5 Lager`, 662 `[TEST-TEMP] QA R5 Pils` | deleted (204) |
| Tanks | 1100–1108 `[TEST-TEMP] Q1VA`…`Q1VJ` | retired (`DELETE` 200) |
| Templates | 397 (copy of seed 394), 398 (copy of seed 396) | retired |
| Batches | 1312 (A), 1313 (L) | deleted (200), with no done steps |
| Probe batches | 1330, 1331, 1334, 1337, 1340, 1349, 1357 | done steps un-checked, split undone, deleted in their scripts |
| Split parts | the other batch ids in the ledger | removed by Undo split in the same scripts |
| Moves / added steps / check-offs | many | each undone by undo token or un-check in the same script, and checked against the family's earlier state |

**After cleanup** (`results/r5_cleanup.log`):
- no batches remain from my ledger or for my brands;
- none of my tanks is active, and there are no marks on them;
- no flags name my data;
- both templates are retired;
- the seed is unchanged (15 batches compared, 0 differences; Serving 3/4 marks unchanged).
