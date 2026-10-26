# D48 QA recheck 4: final pass on split batches (DEV)

- **Build:** D48 fix cycle 4 at `1625302` (DEV API v55 / UI v58, migrated and reseeded), as given in my prompt, from https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev. DEV has no version endpoint, so I couldn't confirm the build myself. Prod was not touched.
- **Tester:** fresh, independent QA (Claude), 2026-10-22 (America/Denver). Headless Chromium + Playwright, timezone America/Denver. One browser per script (two-user checks used owner and breweryMgr as two contexts in that one browser), closed at the end of each.
- **Personas:** loaded from `auth/*.json` with `storageState`. I never opened the auth files. API calls were made from inside the page, and no token was returned. A grep of `results/r4_*` and `scripts/r4_*` for `ses_`, `dev_` and `Bearer` matches only the redaction code in `scripts/r4_lib.mjs`.
- **Data:** I used only my own `[TEST-TEMP]` data (ledger: `results/r4_created.json`), and all of it is cleaned up (see the end). I only read the seed. I sent no write to a seed id or seed tank, but one seed batch changed during my session (see Notes).
- **Scripts:** `scripts/r4_*.mjs`. **Logs:** `results/r4_*.log`. **Screenshots:** `shots/r4_*.png`.

My batches (tanks Q1UA–Q1UG are tank ids 975–981):
- **A** (batch 1034): copy of the Standard ale template. Brew day Thu Nov 12 in Q1UA; Package (exit) Mon Dec 7.
- **L** (batch 1035): copy of the Lager-with-transfer template. Brew day Fri Nov 13 in Q1UB; the template's transfer into Q1UC is on Fri Dec 18; Package Wed Dec 23.
- **T and probes**: brew day Mon Oct 5, so they are "in a tank today" and their steps can be checked off.

## Summary

All five recheck-3 items (**X1–X5**) are **fixed**. The tank lock and the tree rule hold everywhere I tried them: pickers, bar drags, Add transfer / filter, Add step, Remove transfer, splits with 2 and 3 parts, and the API. Every refusal names the part. Undo split restores the batch exactly in all 13 staying cases. Every two-user Undo I tried is stale-checked. R1–R4, N1, the 12 first-pass items and access all still hold.

**This pass finds 2 must-fix gaps, so D48 can't close yet.** Both are split paths that none of the earlier passes covered:

| # | Severity | Gap |
|---|---|---|
| **Y1** | **must-fix** | Moving a split **parent's** steps later (Brew day or PDH with **Move all**, or the Split step itself) **leaves the parts behind**. The parts' steps, even their Package, then come before the split. **No flag**, and the move prompt doesn't mention the parts |
| **Y2** | **must-fix** | **Checking off the Split step** on a batch whose brew day isn't done makes the parent **"completed"** with no number. **Mark not done** leaves it **"fermenting"**: no P-number, a "Batch number" field, and **Delete refused** (`not_planned`) |
| Y3 | minor | The **Brand and Template pickers are still enabled on a split parent**. Brand saves (for the whole family), and Template is refused only after you confirm |

| # | Item | Result |
|---|---|---|
| X1 | Undo of an Undo split after another user changed the batch | **Fixed:** 409 `undo_stale` in every interference I tried |
| X2 | Tank pickers on a split parent or part | **Fixed:** locked as specified (pickers, API, bar drag, Add transfer / filter). Leaving parts and later tanks follow the tree rule. See Y3 for Brand and Template |
| X3 | Undo split didn't restore the batch exactly | **Fixed:** identical (steps, dates, links, tanks) in 13 staying cases, including the old part-2-stays case on L |
| X4 | Part 1's picker offered the next tank when nothing stays | **Fixed:** left out; the refusal shows before **Split** |
| X5 | The screen showed old tanks after a refused Undo | **Fixed:** the open dialog and the bar reload straight away |
| Scenarios 1–8 | Split, lock, unlocked paths, Undo, check-off, template / brand / delete, phone and dark, access | **Pass**, apart from Y1, Y2 and Y3 |
| R1–R4, N1, 1–12 | Spot checks | **All hold** |
| Access | bartender1, barMgr, office1, breweryDevice | **Unchanged (pass)** |

---

## Recheck-3 items

### X1. Undo of an Undo split: **fixed**

Owner splits A (stays + Q1UD) and then clicks Undo split. breweryMgr changes the merged batch. Then owner sends the snackbar Undo (`POST /undo/<token>`):

| breweryMgr's change on the merged batch | Owner's Undo |
|---|---|
| Ferment in → Q1UD (part 2's old tank: the old X1 repro) | **409** "Something changed since. Nothing was undone."; A stays `[Q1UD]` |
| Ferment in → Q1UE | **409** |
| Adds a transfer | **409** |
| Moves FDH +1 (no tank change) | **409** |
| Re-splits it differently (stays + Q1UE) | **409** |

- After each refusal, breweryMgr undid their own change. Owner's Undo then re-created the original split (200).
- Without interference, the Undo of an Undo split re-creates the split **identical** to the split state in all 13 cases listed under scenario 4.
- Evidence: `results/r4_undo.log` (section c).

### X2. Tank lock on a split parent and the staying part: **fixed** (see Y3)

**API** (A split stays + Q1UD). All of these return 422 `split` "Undo the split first.", and nothing changes:
- parent vessel 0 → Q1UE, → Q1UD, → Unassigned;
- the staying part's vessel 0 → Q1UE, → Unassigned, and even → Q1UA (a no-op);
- parent Add transfer before the split day and after it, and Add step with type Transfer;
- parent template change; parent volume; part volume; Delete parent;
- a second split on the parent.

Deleting either part → 422 `split_part`. Splitting a part (nested) → 422 "That's a part of a split. Undo the split to change it that way."

**UI:**
- **Parent:** Ferment in is disabled with "Undo the split first to change it". **Add transfer / filter…** is disabled, and the Delete button is replaced by "Undo the split first to delete it." (`shots/r4_parent_dialog_locked.png`).
- **Staying part:** Ferment in is disabled with the same message (`shots/r4_part1_dialog_locked.png`).
- **Leaving part:** the picker is editable and leaves out Q1UA, where part 1 stays.

**Bar drags:**
- Parent bar onto Q1UE's row: the hint reads "→ [TEST-TEMP] Q1UE · Undo the split first to change it" in white on red. On drop, the snackbar reads "Undo the split first.", and nothing changes.
- Staying part's bar: the same.
- Part 2 onto Q1UA: "Part 2 can't go into [TEST-TEMP] Q1UA: part 1 stays there · overlaps … P7.1 in [TEST-TEMP] Q1UA" (red); refused with that message.
- Part 2 onto Q1UE: a plain hint, then "… P7.2 → [TEST-TEMP] Q1UE." with Undo, which restored it.
- Screenshots: `shots/r4_drag_*.png`.

**Tree rule on the unlocked paths** (API, each 200/201 was undone):

| Change | Result |
|---|---|
| Part 2 → Q1UE / Unassigned | 200 |
| Part 2 → Q1UA (part 1 stays there) | 422 "Part 2 can't go into [TEST-TEMP] Q1UA: part 1 stays there." |
| Part 2 transfer into Q1UD (its own tank) | 422 `same_tank` |
| Part 2 transfer on the split day / split day + 1 | 422 `before_fill` / 201 |
| Part 1 (stays) transfer into Q1UA / before or on the split day / split day + 1 | 422 `same_tank` / 422 `before_fill` / 201 |
| Part 2 `[Q1UD, Q1UE]`: v1 → Q1UD, or v0 → Q1UE | both 422 `same_tank` |
| Part 2 `[Q1UD, Q1UE, Q1UD]`: remove the first transfer (would leave Q1UD, Q1UD) | 422 `same_tank` |
| Part 2 transfer into Q1UA, or part 1 filter into Q1UD (different paths, same time) | 201 **with** `tank_overlap` + `dirty_fill` flags naming both parts |

### X3. Undo split restores the batch: **fixed**

For each case below I compared parent and parts (steps, dates, done dates, links, tanks, volume, template) before the split and after **Undo split** (`DELETE /split`). All 13 cases were **IDENTICAL**:
- **A:** part 1 stays; part 2 stays; nothing stays; three parts with part 3 staying; Filter with part 1 staying.
- **L, split on Dec 1:** part 1 stays; part 2 stays (the old X3b case); part 2 stays with part 1 = Q1UC; nothing stays `[Q1UD, Q1UC]`; three parts with part 2 staying.
- **L, split on Dec 20:** part 1 stays; part 2 stays; nothing stays.

**Parts edited after the split** (by design): with part 1's FDH +2, an Addition added on part 1 and a transfer added on part 2, Undo split merged part 1 as it is now. The parent got the Addition and FDH on Nov 27, and part 2's transfer was dropped.

Evidence: `results/r4_undo.log` (sections a and b).

### X4. Part 1's picker and the next tank: **fixed**

- **Picker:** in L's split dialog (Dec 1), part 1's list leaves out Q1UC while part 1 is a leaving part. Part 2's list still offers Q1UC, which is correct, because part 2 gets Unassigned for the later transfer.
- **Refusal before Split:** I made part 1 = Q1UC while part 2 stayed, then changed part 2 to Q1UD. Before Split, the dialog shows "Part 1: The beer goes into [TEST-TEMP] Q1UC next, on Fri Dec 18." (`shots/r4_x4_presave.png`). Split gives the same message, and nothing is saved.
- **Two parts in Q1UD:** the dialog shows "Two parts can't go into the same tank." before saving.

### X5. A refused Undo reloads the view: **fixed**

- **Path:**
  1. Owner sets part 2 → Q1UE in its dialog.
  2. breweryMgr sets it to Q1UF.
  3. Owner clicks Undo.
- **Result:**
  - The snackbar reads "Something changed since. Nothing was undone."
  - The **open dialog now shows Q1UF**, and part 2's bar is drawn in Q1UF's lane (`gantt-lane-980`), with no reload (`shots/r4_x5_after_refused_undo.png`).

---

## Split scenarios

### 1. Splitting: **pass**

All of these were via the API, and each was then undone with the split's undo token. Every one came back identical.

**Accepted:**
- **A** (split Nov 20): stays + Q1UD (Transfer); stays + Q1UD (Filter); part 2 stays; nothing stays (the CIP on Q1UA on Nov 20 is added); three parts (stays + Q1UD + Q1UE); three parts with part 2 staying.
- **A, boundary:** a split on exit − 1 (Dec 6) → 201.
- **L, before the template transfer (Dec 1):** stays + Q1UD (part 2 is `[Q1UD, Unassigned]`); stays + Q1UC; part 2 staying with part 1 = Q1UD or Q1UC; nothing stays `[Q1UD, Q1UC]`; three parts `[Q1UD, Q1UE, Q1UC]`.
- **L, after it (Dec 20, beer in Q1UC):** stays + Q1UD; stays + Q1UB (back to the first tank); nothing stays `[Q1UB, Q1UD]`.
- **Hand-off check:** in "L stays + Q1UC", part 2 leaves Q1UC on Dec 18, with its CIP that day, as part 1 transfers in. That's the normal hand-off, and no overlap is flagged. A control batch genuinely overlapping Q1UC did get `tank_overlap`.

**Refused:**

| Split | Refusal |
|---|---|
| `[Q1UD, Q1UD]`, `[stays, Q1UA]`, `[Q1UA, Q1UD]`, `[Q1UD, Q1UA]`, `[stays, Q1UD, Q1UD]` | `same_tank` |
| Two "stays" | `one_stays` |
| 18 of 20 bbl | `volumes_must_add_up` |
| Brew day | `split_before_brew` |
| Exit day | `after_exit` |
| L on Dec 18 (transfer day) | `before_fill` |
| L `[Q1UC, Q1UD]` and `[Q1UC, Q1UE, Q1UD]` | `same_tank` "Part 1: The beer goes into … Q1UC next, on Fri Dec 18." |
| L `[stays, Q1UB]` / Dec 20 `[stays, Q1UC]` | `same_tank` |

**UI:**
- Double-clicking Split sent **one** POST.
- The snackbar reads "[TEST-TEMP] QA R4 Pils P7 split on Fri Nov 20: … P7.1 (12 bbl) stays in [TEST-TEMP] Q1UA; … P7.2 (8 bbl) → [TEST-TEMP] Q1UD."

Evidence: `results/r4_api1.log`, `results/r4_probe1.log`, `results/r4_ui1.log`.

### 2. The lock: **pass**. See X2.

### 3. Unlocked paths: **pass**, except moving steps (Y1)

The tank checks are under X2. Moving a part's steps:
- Part 2's FDH +2 (Move all) leaves part 1 alone, as before.
- Part 2's Package −20 gets the usual `out_of_order` flag.
- But a part step moved **before the split** gets no flag. See Y1.

### 4. Undo: **pass**

- **Undo split and its own Undo:** see X1 and X3.
- **Snackbar Undo right after a split:** identical in all 16 accepted splits of scenario 1.
- **Two users:** owner splits A, breweryMgr makes one change on that split, then owner clicks Undo:

| breweryMgr's change | Owner's Undo |
|---|---|
| Part 2's tank | **409** |
| Adds a transfer on part 2 | **409** |
| Moves part 2's FDH | **409** |
| Moves the parent's Split | **409** |
| Undo split | **409** |

Owner's own later change, with breweryMgr acting afterwards:

| Owner's change | breweryMgr's change | Owner's Undo |
|---|---|---|
| Part 2 → Q1UE | Adds a part 2 transfer into Q1UD (a restore would give Q1UD, Q1UD) | **409** |
| Adds a part 2 transfer | Part 2 → Q1UF | **409** |
| Part 2 → Q1UE | Undo split | **409** |
| On L: part 1's later tank → Q1UE | Part 2 → Q1UC | **409** |
| On L: removes part 1's transfer | Part 2's v1 → Q1UC | **409** |

- In every case the family was unchanged after the refusal. Once breweryMgr undid their own change, owner's Undo worked (200).
- Single-user R1 repro: undo the first of two tank changes → 409; undo the second, then the first → both 200, and L is identical.
- Evidence: `results/r4_undo.log`, `results/r4_spot.log`.

### 5. Checking off part steps: **pass** (but see Y2)

On T (brew Oct 5, split Oct 13 stays + Q1UF):

| Done step | Undo split | Split's undo token |
|---|---|---|
| Part 2's FDH | 422 `part_step_done` | 409 |
| Part 1's FDH | 422 `part_step_done` | — |
| The parent's Split step | 422 `step_done` | — |

After un-checking, Undo split worked. The parent's PDH (before the split) can be checked off and doesn't block anything.

**Note:** changing part 2's tank while its FDH is done is accepted (200), which rewrites where a done step happened. An unsplit batch behaves the same (control), so this isn't new in D48 and I'm not counting it.

### 6. Template, brand and delete: **pass for the API rules, except Y3**

| Change | Result |
|---|---|
| Parent template change | 422 `split` |
| Part template change | 422 `split` |
| Part brand change | 422 `split_part` |
| Delete parent | 422 `split` |
| Delete a part | 422 `split_part` |
| **Parent brand change** | **200**: see Y3 |

The part dialogs show Template and Brand as plain text and have no Delete.

### 7. Phone width (412×915, touch) and dark mode: **pass**

- **Phone:** no horizontal overflow and nothing off screen (the dialog paper spans 32–380 px) in:
  - the locked parent dialog (`shots/r4_phone_parent_locked.png`);
  - both part dialogs;
  - the split dialog with the "Part 1: …" refusal (red `rgb(211,47,47)` on white);
  - the Gantt.
- **Dark (desktop, in-app Theme → Dark):** the same dialogs.
  - The lock helper text is `rgb(161,169,155)` on `rgb(31,36,30)`.
  - The split refusal is `rgb(244,67,54)` on `rgb(31,36,30)`.
  - The drag hint is white on `rgb(244,67,54)` (`shots/r4_dark_*.png`).
- **Theme:** owner is back to **Light**, confirmed by `/api/me` `color_mode: "light"` in a fresh session. breweryMgr was never changed. See Notes for a hiccup on the way.

### 8. Access: **pass** (unchanged)

- **bartender1, barMgr, office1:** sent to `/`. Every call returns 403: `GET` schedule, `POST` transfer, `POST` split, `PATCH` vessel, `POST` step, `POST` undo, `POST` flags/signoff and `DELETE` split.
- **breweryDevice:** "Not available on a shared device … Go to Home" (`shots/r4_access_breweryDevice.png`), and all the same calls return 403.
- **brewer1** has access: `GET` 200, and the refused writes get their 422s (for example, "The beer goes into [TEST-TEMP] Q1UC next, on Fri Dec 18.").
- Evidence: `results/r4_access.log`.

### Seed Altruism #39 (look only): **as before**

- **#39** (942) is brewed in FV8, with `split_stays: false`.
  - #39.1 (943): `split_stays: true`, FV8, "#39.1 · the parent's number".
  - #39.2 (944): Serving 3, "#39.2 · the parent's number".
- **Dialogs:**
  - The parent's and #39.1's Ferment in show "Undo the split first to change it".
  - #39.2's picker is editable, which is correct for a leaving part.
- **No writes:** opening all three dialogs sent no write request (`results/r4_ui_spot.log`), and all three batches are unchanged step by step.

---

## Spot checks

| # | Check | Result |
|---|---|---|
| R1 | Stale undo | Holds (see scenario 4) |
| R2 | Add step refusal clears when the day changes | Dec 8 "The beer isn't in that tank on that day." → change to Dec 7 → cleared before saving |
| R3 | Refusal names the part | "Part 1: The beer goes into … Q1UC next, on Fri Dec 18." (API and dialog) |
| R4 | `transfer_order` | L `[Q1UB, Q1UC, Q1UB]`, Move only −3 → "… P8's transfers are out of order: on Thu Dec 17 the beer goes into [TEST-TEMP] Q1UB, which it's already in." (plus `out_of_order`); cleared by Undo |
| N1 | Next tank | Add transfer Dec 17 into Q1UC; Ferment in = Q1UC; Plan `[Q1UE, Q1UE]` → all 422 "The beer goes into … next, on …" |
| 1 | Transfer on fill day / fill + 1 | 422 / 201 |
| 2 | Delete an unsplit batch, then Undo | 200, then identical; split parent / part → 422 |
| 3 | Transfer into the current tank | 422 "The beer is already in [TEST-TEMP] Q1UA." |
| 4 | Add step Nov 11 / Nov 12 | 422 "A step can't come before brew day." / 201 |
| 5 | Transfer on exit day / exit − 1 | 422 / 201 |
| 6 | Parent and part volume | 422 "Undo the split first."; read-only in the UI |
| 7 | Template change and Undo | 200, then identical |
| 8 | Part P-number | "P7.1 · the real number is set when the parent's brew day is checked off"; no Delete |
| 9 | Zoom | Tooltip "Weeks on screen"; Add process opens with Plan batch… and CIP & Sanitize… |
| 10 | Multi-batch drag | "2 batches · 2 steps moved 2 days later", with following steps grouped under P6 and P7; "… with 19 following steps."; Undo restored both |
| 11 | Keyboard | Ctrl+Space → "1 step selected" with no dialog; Escape clears it |
| 12 | Split on brew day | 422 "The split has to be after brew day." |

**Performance:**
- `GET /api/production/schedule` for 12 weeks, 10 calls: median **56 ms**, max 77 ms.
- Split via the API: 66–71 ms. Its Undo: 98–100 ms.
- Both are well under target.

Evidence: `results/r4_spot.log`, `results/r4_ui_spot2.log`, `results/r4_multidrag.log`, `results/r4_r2.log`.

---

## New gaps

### Y1 (must-fix). Moving a split parent's steps leaves the parts behind, with no flag

- **Path (UI):**
  1. Split A on Fri Nov 20 ("(stays here)" 12 bbl + Q1UD 8 bbl).
  2. Expand Q1UA.
  3. Drag the parent's **Brew day** 7 days later → prompt → **Move all following steps** (the default) → **Apply**.
- **Expected:** A part's steps can't come before its split. Add step already refuses this ("A step can't come before the split."), and a split after the exit is refused. So either Move all carries the parts' steps along, or the move is refused, or at the very least it's flagged like any other out-of-order move.
- **Observed:**
  - **Prompt:** it lists only the parent's own 4 steps (Lag, Fermentation, PDH, Split - Transfer → Fri Nov 27). Nothing about P7.1 or P7.2 (`shots/r4_y1_prompt.png`).
  - **After Apply:** the parent runs Nov 19 – **Split Nov 27**. Both parts **stay put**, with FDH on **Wed Nov 25**, two days before the beer is split into them, and the rest through Package on Dec 7 (`shots/r4_y1_after_move_all.png`).
  - **No flag:** the flags list has nothing for the parent, the parts or the tanks.
  - **Undo** restores it.
- **Same result through the API** (`POST /steps/move`):

| Move | Result | Flags |
|---|---|---|
| Brew day +10, Move all | Split Nov 30; parts' FDH still Nov 25 | none |
| PDH +3, Move all | Split Nov 23; the move prompt's following list is the Split only | none |
| **Split +7**, Move all or Move only | The preview's following list is empty; parts unchanged | none |
| **Split +20**, Move all | Split **Dec 10**, after **both parts' Package on Dec 7** | none |
| Part 2's FDH −6, Move only or Move all | FDH on Nov 19, before the Nov 20 split | none |

  - **Comparison:** inside one batch, the same kind of move gets `out_of_order`. For example, Package −20 → "P6.2: Package is before Carb, the step it follows." And moving the Split *earlier*, onto brew day, does get `out_of_order` + `tank_overlap`. It's moves that push the split past its parts that go unflagged.
- **Why must-fix:** it saves a schedule the rules forbid: parts filled and packaged before their split. It happens through the most ordinary move, "push this batch back a week" with the default Move all, and nothing tells the user.
- **Repro:**
  1. Split any planned batch.
  2. Drag the parent's Brew day (or the Split step) later than the parts' first step.
  3. Apply with Move all.
- **Evidence:** `results/r4_probe2.log` (API), `results/r4_ui3.log` (UI), `shots/r4_y1_prompt.png`, `shots/r4_y1_after_move_all.png`. Every move was undone.

### Y2 (must-fix). Checking off the Split step before brew day breaks the batch's status

- **Path (UI):**
  1. Plan a batch whose brew day is past but **not checked off** (brew Mon Oct 5, still planned as P1/P2).
  2. Split it on Oct 13 (stays + Q1UF).
  3. Expand its tank → click the parent's **Split - Transfer** step. The dialog offers **CHECK OFF**.
  4. Check off.
  5. Then **MARK NOT DONE**.
- **Expected:** Like any other step checked off before brew day (PDH stays "planned" in the same situation), the batch stays planned with its P-number. At the least, Mark not done should put it back as it was.
- **Observed:**
  - **After Check off:**
    - The parent becomes **status "completed"**, with no batch number and no P-number. Its label is "[TEST-TEMP] QA R4 Pils " (trailing space).
    - The parts become "fermenting", labelled "[TEST-TEMP] QA R4 Pils .1" and ".2".
    - The snackbar renumbers every planned batch ("Batch numbers updated: Altruism P3 → P2, Enos P4 → P3, … [TEST-TEMP] QA R4 Pils P8 → P7 …").
  - **After Mark not done** ("Split - Transfer is not done."):
    - The parent stays **"fermenting"** with **no P-number**; the parts go back to planned.
    - The parent dialog now shows a **"Batch number"** field, as for a brewed batch, and a flag "[TEST-TEMP] QA R4 Pils P1 and [TEST-TEMP] QA R4 Pils overlap in [TEST-TEMP] Q1UG." (`shots/r4_y2_parent_dialog_after_uncheck.png`).
  - **After Undo split:** the merged batch is still "fermenting", with no done steps and no number.
  - **Delete planned batch** → 422 `not_planned`. The batch can't be removed.
  - **Recovery:** only the snackbar Undo straight after the check-off restores it. Otherwise, checking off brew day and un-checking it again puts it back to "planned P1" (no batch number is used; next stays 44). I found that only by trying; a user wouldn't.
  - **Brewed batch (control):** checking the Split step off and on behaves correctly (parent completed → fermenting; parts fermenting → planned).
- **Why must-fix:** wrong data is saved: a status of completed / fermenting with no brew day. The P-number is lost, the batch can't be deleted, and the obvious fix (Mark not done) doesn't restore it.
- **Repro (API):**
  1. Plan a batch with a past brew day.
  2. `POST /batches/:id/split`.
  3. `POST /steps/<split step>/complete`.
  4. `POST /steps/<split step>/uncomplete`.
  5. `GET` the schedule: status is "fermenting" and `p_number` is null.
  6. `DELETE /batches/:id` → 422.
- **Evidence:** `results/r4_status2.log`, `results/r4_status3.log`, `results/r4_ui3.log`, `results/r4_checkoff.log`, `shots/r4_y2_after_split_checkoff.png`, `shots/r4_y2_gantt_after_uncheck.png`. All four affected batches (1144, 1150, 1154, 1163) were recovered that way and deleted.

### Y3 (minor). The Brand and Template pickers are still enabled on a split parent

- **Path:** Split A → open the parent (P7) → the **Brand** and **Template** pickers are enabled (`shots/r4_parent_dialog_locked.png`, `shots/r4_phone_parent_locked.png`). The parts show both as plain text.
- **Expected:** RECHECK4: "Templates and brand are still locked on a split parent and its parts."
- **Observed:**
  - **Template:** picking one opens "Change template / Rebuild … P7's steps from …?". **Change template** is then refused at the top of the dialog with "Undo the split first." Nothing changes.
  - **Brand:** saves. The snackbar reads "[TEST-TEMP] QA R4 Pils P7 is now [TEST-TEMP] QA R4 Lager P7." with Undo, and the change reaches **both parts** (P7.1, P7.2 relabelled). `PATCH /batches/:parent {brand_id}` → 200. The same call on a part → 422 `split_part`.
  - The data stays consistent (the whole family moves together, and Undo restores it), so this is minor. It's still not what the spec says, and the Template picker offers a change it then refuses.
- **Evidence:** `results/r4_api1.log` ("parent PATCH brand -> 200"), `results/r4_probe1.log`, `results/r4_ui3.log`, `shots/r4_parent_brand_changed.png`.

---

## Notes

- **No automated suite** was running, and I'm told Matt wasn't editing DEV.
- **Seed: one batch changed during my session, not by me.** Enos P2 (940) moved between my opening snapshot (19:15 UTC) and cleanup:
  - Lagering went Nov 17 → Nov 14, and the 8 steps after it moved −3 days (Package Dec 10 → Dec 7).
  - "Set temp - 40°" went Nov 16 → Nov 18.
  - None of my scripts reference batch 940 or its step ids. My only drags were on my own steps (+2 and +7 days); I made no −3 drag in the UI. The multi-select drags that auto-scrolled showed no move prompt, so they sent nothing.
  - DEV has no audit endpoint (all 404), so I can't say who made it. I left it as it is (seed is read-only); please check.
  - Every other seed batch, including Fest #37, Fest #38 and Altruism #39 / #39.1 / #39.2, and the Serving 3 / Serving 4 marks, is unchanged step by step.
- **P-numbers** shifted during my session from my probes and Y2's renumbering, as the brief allows. They're back to the seed's after cleanup, and `next_batch_number` is 44 throughout. No batch number was ever used.
- **Theme hiccup:** after my dark run, a fresh owner session looked Light, because it rendered from `localStorage`. So clicking Light sent no save, and the server still had `color_mode: "dark"`. Later sessions came up dark. I set Light again, saw `PUT /api/me/color_mode {"color_mode":"light"}`, and confirmed Light through `/api/me` and in two fresh sessions. Theme is outside D48; I'm noting it only as a trap for whoever resets it next.
- **Harness, not app:** my first multi-batch drags started at the grid's top edge under the sticky header, so auto-scroll took over and nothing moved. With the step centred, item 10 passed.
- **Credentials:** no prompts.

## Data created and cleaned up (by recorded id; ledger `results/r4_created.json`)

| Kind | Ids | Cleanup |
|---|---|---|
| Brands | 588 `[TEST-TEMP] QA R4 Lager`, 589 `[TEST-TEMP] QA R4 Pils` | deleted (204) |
| Tanks | 975–981 `[TEST-TEMP] Q1UA`…`Q1UG` | retired (`DELETE` 200) |
| Templates | 362 (copy of seed 335), 363 (copy of seed 337) | retired (`retired_at` set) |
| Batches | 1034 (A), 1035 (L) | deleted (200) at the end, with no done steps |
| Probe batches | 1077 (overlap control), 1144 (T), 1147, 1150, 1153, 1154, 1163 | deleted in their scripts. 1144, 1150, 1154 and 1163 were first recovered from Y2 (brew day checked off and un-checked) |
| Split parts | the other ledger ids from 1036 to 1183 | removed by Undo split or the undo token in the same scripts |
| Steps added / transfers / tank changes / moves / brand change | many | removed by undo token or by id in the same script, each checked against the family's earlier state |

After cleanup:
- no batches remain for my brands or from my ledger;
- none of my tanks is active, and there are no marks on them;
- no flags name my batches or tanks;
- both templates are retired;
- owner's theme is Light.

Evidence: `results/r4_cleanup.log`, `results/r4_tplcheck.log`, `results/r4_theme_fix.log`.
