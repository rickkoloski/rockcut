# D48 QA report: Rockcut Production Gantt (DEV)

- **Build:** D48 at `4fce188`, from https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev. Prod was not touched.
- **Tester:** independent QA (Claude), 2026-10-21 (America/Denver). Headless Chromium, Playwright, timezone America/Denver, one browser at a time.
- **Personas:** loaded from `auth/*.json` with `storageState`. API calls were made from inside the page; no token was printed, logged or screenshotted. A grep of `results/` and `scripts/` for `ses_`, `dev_` and `Bearer` finds nothing.
- **Data:** I used only my own `[TEST-TEMP]` data. All of it is cleaned up (see the end of this report). The D48 seed examples were only opened.

## Summary

Most of D48 works as specified. Every P-scenario in the brief passes on the happy path, including the refusal messages. Double-clicks never sent a second request. Undo is guarded well against stale state. Performance is well under target.

I found **3 must-fix** and **9 minor** gaps.

| # | Severity | Gap |
|---|---|---|
| 1 | **must-fix** | Add transfer / filter accepts a day **before brew day**, and the dialog's default day (today) causes it with one click |
| 2 | **must-fix** | Deleting a split **parent** silently deletes all its parts, and **Undo always fails** |
| 3 | **must-fix** | A transfer **into the tank the beer is already in** is accepted, which schedules a CIP on a full tank with no flag |
| 4 | minor | Add step accepts a day before brew day, and its default day is today |
| 5 | minor | A transfer after Package is accepted |
| 6 | minor | A split parent's volume can be changed while it's split |
| 7 | minor | Template change: the message doesn't say an added transfer was dropped, and a kept ramp loses its "comes after" link |
| 8 | minor | Part's batch dialog: blank P-number, and "Delete planned batch" is offered but then refused |
| 9 | minor | The zoom menu still shows "12 weeks" ✓ after a custom From/To range |
| 10 | minor | Multi-batch drag prompt lists both batches' following steps without batch names |
| 11 | minor | Keyboard: no way to multi-select steps, and Escape doesn't clear a selection |
| 12 | minor | Split before brew day is refused with a vague message ("Pick the day.") |

---

## Must-fix

### 1. Add transfer / filter accepts a day before brew day, and the default day causes it

- **Path:** Batch dialog of a batch planned weeks out → **Add transfer / filter…** → choose an **Into** tank → **Add**, leaving **Day** at its default.
- **Expected:** The day can't be before brew day (Split already refuses it). The dialog shouldn't default to a day the API should refuse.
- **Observed:**
  - **Day** defaults to **today** (Oct 21) on a batch brewed Thu Nov 12.
  - The preview says "12 steps from that day (Lag, Fermentation, … CIP & Sanitize) move to Q1D; Q1B gets a CIP & Sanitize that day."
  - **Add** succeeds: "Transfer on Wed Oct 21: 12 steps … move to Q1D; Q1B gets a CIP & Sanitize that day."
  - Brew day stays in Q1B on Nov 12, but Lag, Fermentation and everything after are now in Q1D. Q1B gets a CIP three weeks before the beer exists.
  - **No flag** is raised.
  - The API accepts it directly as well: `POST /batches/:id/transfers {due_on: "2026-11-05"}` returns 201. The Split API refuses the same kind of date (422).
- **Repro:**
  1. Plan a batch with brew day 3 weeks out in an empty tank.
  2. Open it → Add transfer / filter… → Into = any other tank → Add.
- **Evidence:** `shots/gap_transfer_default_day_dialog.png`, `shots/gap_transfer_default_day_gantt.png`, `shots/gap_transfer_before_brew_same_tank.png` (the arrow leaves Q1B on Nov 5, before the Nov 12 brew-day dot). Logs: `results/gap_transfer_default.log`, `results/p73.log`.

### 2. Deleting a split parent deletes its parts, and Undo always fails

- **Path:** Split a planned batch → open the **parent** (e.g. P7) → **Delete planned batch** → **Delete** → **Undo** on the snackbar.
- **Expected:** Either the parent can't be deleted while it's split (parts and other split edits already say "Undo the split first"), or the confirm says the parts go too, **and** Undo brings everything back.
- **Observed:**
  - The confirm reads: "Delete [TEST-TEMP] QA Lager P7 and all its planned steps? Other planned batches may renumber." It says nothing about P7.1 and P7.2.
  - After **Delete**, the parent **and both parts** are gone (`GET /batches/:id` → 404 for all three).
  - The snackbar reads "[TEST-TEMP] QA Lager P7 deleted. …", again with no mention of the parts.
  - Clicking **Undo** immediately returns "Something changed since. Nothing was undone." (409 `undo_stale`). The data is lost for good.
  - This reproduced **3 of 3** times (once in the UI, twice via the API). Deleting an *unsplit* planned batch and undoing it works every time (2 of 2).
- **Repro:**
  1. Plan a batch.
  2. Split it into "(stays here)" 10 bbl and another tank 10 bbl.
  3. Open the parent → Delete planned batch → Delete.
  4. Click Undo.
- **Evidence:** `shots/gap_delete_split_parent_confirm.png`, `shots/gap_after_delete_split_parent.png`. Logs: `results/delete_parent.log`, `results/delete_undo.log`, `results/probes_final.log`.

### 3. A transfer into the tank the beer is already in is accepted

- **Path:** Batch dialog → Add transfer / filter… → **Into** = the tank the beer is in on that day → Add.
- **Expected:** Refused, or the current tank isn't offered. The **Into** list includes the batch's own tank.
- **Observed:**
  - 201. A new vessel is created in the same tank (Q1C → Q1C).
  - A **CIP & Sanitize** is scheduled on Q1C on Dec 2 while the beer is still in Q1C (Set temp, Conditioning, Carb, Package all follow in Q1C).
  - **No flag**, and the tank status stays normal.
- **Repro:**
  1. Batch in Q1B with a Filter into Q1C on Nov 26.
  2. Add transfer on Dec 2, Into = Q1C.
- **Evidence:** `results/p73.log` ("transfer into the same tank it is in"), `shots/gap_transfer_before_brew_same_tank.png`.

---

## Minor

4. **Add step before brew day.**
   - **Path:** Add step… on a batch brewed Nov 11. **Day** defaults to today (Oct 21).
   - **Expected:** Default to brew day or later, and refuse days before brew day.
   - **Observed:** The API accepts `due_on: 2026-11-01` (201). The step shows 10 days before the beer exists, with no flag. **Add a ramp** also previews from today by default ("Wed Oct 21 – Sat Oct 24").
   - **Evidence:** `results/p65b.log`, `results/p65.log` ("default day 2026-10-21").
5. **Transfer after Package.**
   - **Path:** Add a transfer on Dec 20 to a batch packaged Dec 7.
   - **Expected:** Refused, because the beer is gone.
   - **Observed:** 201. An empty vessel is created, plus an extra CIP on the old tank.
   - **Evidence:** `results/p73.log`.
6. **Split parent volume editable while split.**
   - **Path:** The parent's batch dialog still shows **Volume** with **Save** after a split. The API accepts `PATCH /batches/:parent {volume_bbl: 30}` (200).
   - **Expected:** Locked like template and brand ("Undo the split first").
   - **Observed:** The parent is 30 bbl while its parts are 10 + 10.
   - **Evidence:** `results/probes_final.log`.
7. **Template change.**
   - (a) On a batch with an added transfer into Q1D, changing the template shows "[TEST-TEMP] QA Standard ale → [TEST-TEMP] QA Lager w transfer." It doesn't say the added transfer (and its Q1D choice) was dropped; the second vessel becomes Unassigned. The confirm only says so in general terms ("added transfers are dropped").
   - (b) The kept ramp loses its "comes after Fermentation" link, so it no longer offers to move with Fermentation. Before: Fermentation → Set temp 60°. After both template changes, nothing links into the ramp. The kept Addition is re-linked to "Set temp - 65°" (a different step), then back to FDH.
   - **Evidence:** `results/p84.log`, `results/p84b.log`, `results/p83.log`.
8. **Part's batch dialog.**
   - The P-number line reads "· the real number is set when brew day is checked off", with the P5.2 missing before the dot.
   - **Delete planned batch** is offered on a part. After confirming, it's refused: "That's a part of a split. Undo the split to change it that way."
   - **Evidence:** `shots/p80_part_dialog.png`, `shots/gap_delete_part_confirm.png`, `results/delete_parts.log`.
9. **Zoom label after a custom range.**
   - **Path:** Pick 12 weeks, then type From 11/01 and To 11/20.
   - **Expected:** The button no longer claims a zoom, or the checkmark clears.
   - **Observed:** Still "12 WEEKS" with ✓ on 12 weeks.
   - **Evidence:** `results/p118.log`.
10. **Multi-batch drag prompt.**
    - **Path:** Ctrl-click FDH (batch P4) and Set temp 65° (batch P5) → drag 1 day.
    - **Observed:** The prompt's subtitle names only P4 ("[TEST-TEMP] QA Pils P4 · now Wed Nov 25"). The 20 following steps from both batches are listed together with no batch name (Conditioning, Carb, Package and CIP & Sanitize each appear twice). For multi-step moves, "now <date>" refers to only one of the selected steps.
    - The move itself and its Undo are correct.
    - **Evidence:** `shots/cross_batch_drag_prompt.png`, `results/p86.log`.
11. **Keyboard.**
    - Every new dialog opens from the keyboard, takes focus, traps Tab, closes on Escape and returns focus to its button.
    - However, there's no keyboard way to add steps to a selection: Ctrl+Enter and Ctrl+Space on a focused step just open the step dialog.
    - Escape doesn't clear an active selection; the "N steps selected" bar stays.
    - **Evidence:** `results/keyboard.log`, `results/p86.log`.
12. **Split before brew day: vague message.**
    - `POST …/split {due_on: before brew day}` → 422 "Pick the day.", even though a day was picked.
    - **Expected:** Say why, e.g. "The split has to be after brew day."
    - **Evidence:** `results/split_with_xfer.log`.

---

## What passed

| # | Result |
|---|---|
| **P65** | Addition after FDH: **Added** chip on the row, template 188 unchanged. Moving FDH offers "Addition - QA salts → Fri Nov 27" (Apply and Undo checked). |
| **P66** | Comes after Conditioning + leads to Carb: links Cond→GC→Carb, and the direct Cond→Carb link is removed. Removing GC restores Cond→Carb. |
| **P67** | "Something else" with an empty name shows "Give the step a name."; the API refuses a whitespace name with the same message. The API also refuses a second Brew day, a Split added as a step, an inverted comes-after/leads-to, and a comes-after from another batch (404). |
| **P68** | Ramp 60→40 at 10°/day gives 60°, 50°, 40°, chained. The first step was checked off (move only). A future done date is refused ("A step can't be done in the future."). |
| **P69** | Change ramp → 34° at 7°/day: "Now: 60° ✓, 50°, 40°. Done steps stay"; new steps 53°, 46°, 39°, 34°. The done step is kept and only unfinished ones are regenerated. |
| **P70/P71** | Remove a middle step (from the step dialog and the batch dialog): links pass through (58°→38°). No Remove on Brew day; the API refuses Brew day and done steps. |
| **P72–P74** | Filter into Q1C moves 8 steps and adds a CIP on Q1B. A transfer before a done step is refused with the exact message (preview and API). Removing the Filter: "stays in Q1B", CIP gone. |
| **P75** | Split, one part stays: P5.1/P5.2 with their own steps, gold dashed arrows (`#C99A2E`), the staying part shares Q1B's lane, one POST on double-click. |
| **P76/P77** | "The parts add up to 18 bbl, but … is 20 bbl." (the live total turns red). "Two parts can't go into the same tank." The API also refuses "(stays here)" plus an explicit same tank, two "stays" parts, a single part, and negative volume. |
| **P78** | Nothing stays → CIP on the old tank on the split day. |
| **P79** | Moving part 2's steps doesn't touch part 1. |
| **P80** | Undo split merges back with part 1's schedule; the parts are deleted. |
| **P81** | Undo split with a done part step: "Some steps on the parts are already done, so the split can't be undone." (UI and API). |
| **P82/P110** | Splitting a planned batch works; **Split - Filter** works. |
| **P83/P84** | Template change: "… → …. Kept 5 added steps.", one PATCH on double-click. A template with fewer tanks drops the extra vessel cleanly. Brand change: "… is now [TEST-TEMP] QA Pils P4.", and the label and bar update. No pickers on a part; the API refuses part or parent changes while split. |
| **P85/P86/P88** | Ctrl-click 3 steps + drag: all move, prompt, Undo. Select 4 → Assign to → "4 steps assigned to Riley Wort." Shift-click selects the whole range in the tank. Done selecting clears it. |
| **P89** | Snackbar Undo right after a split undoes it, and the parts are gone. |
| **P113** | Shift-drag: no prompt, "FDH moved 1 day later (only this step)." with Undo. Only FDH moves. |
| **P114** | Mark clean on a dirty tank → "Sani 0 days". The dialog has a date (max = today) and an optional note. |
| **P115** | Mark dirty on a tank with a planned batch → "Empty · dirty 0 days · no CIP planned", plus `dirty_fill` and `dirty_no_cip` flags. The marker tooltip reads "Marked dirty by Olivia Owner · Wed Oct 21 · "note"". |
| **P116** | Beer in the tank: the ⋯ panel offers only "Mark out of service…". The API returns 422 `tank_in_use` (tested on my own brewed batch, then un-checked). |
| **P117** | History lists marks with Remove; Remove takes effect at once with a snackbar Undo. Date rules: a future date or a date before the last emptying → 422 "Pick a day from the tank's last emptying through today."; the exit day is allowed. |
| **P118** | Today after moving forward twice and scrolling resets the range to Oct 14 – Dec 2 (6 weeks) or Oct 14 – Jan 13 (12 weeks), and horizontal scroll goes back to 0. |
| **P119** | The zoom menu shows a ✓ on the current item; 2/6/12 weeks change To correctly. |
| **P120** | The middle switch is disabled until there's a mix. Opening a caret selects it. Collapse all, then the middle button, restores the 2 open tanks. Opening all one by one moves to Expand all; closing all moves to Collapse all. The mix survives a reload. |
| **P121** | Add process offers Plan batch… and CIP & Sanitize…. Step rows are 20 px with a mouse and 28 px on touch. Phase labels (Lag, Fermentation) are indented less than step labels. |
| **Access** | bartender1, barMgr and office1 are sent to `/` with 403 on GET and on every write probe. breweryDevice and taproomDevice get 403 "Not available on a shared device". brewer1, brewer2, floater and breweryMgr have access. |

**Also tried (all pass apart from the items above):**

- **Double-clicks:** Split, Apply in the move prompt, Add step's Add, Change template and Mark Save each sent exactly one request.
- **Undo after another user** (breweryMgr):
  - A different step was moved: my Undo reverts only my change.
  - The same step was moved: "Something changed since. Nothing was undone." (409).
  - The step I added was removed by them: 409.
  - Reusing an undo token: 404. Another user using my undo token: 404.
- **Splitting a batch with a later transfer:** part 1 keeps the transfer into Q1D, and part 2 gets its own transfer into Unassigned (no double-booking).
- **Adding a transfer onto a split part** works, with a CIP on the part's old tank.
- **Auto-scroll:** dragging to the right edge scrolls to the end of the range; the left and top edges scroll back. Escape while dragging cancels with no request.
- **Phone (412×915) and dark mode** (in-app Theme → Dark): the toolbar and all new dialogs fit with no horizontal overflow and readable contrast. On phone, the tank ⋯ menu is reached via "Show the tank status column". The theme was set back to Light.

## Performance (LIMITATION 2)

- `GET /api/production/schedule` for 12 weeks (Oct 14 – Jan 13, about 134 KB), 12 calls: **median 99 ms, max 175 ms**. The target is under 300 ms: **pass**.
- Split round trip via the API, 4 calls: **median 114 ms, max 182 ms**. Measured in the UI from click to response: 387 ms. Undo split: median 173 ms. The target is under 500 ms: **pass**.
- Log: `results/perf.log`.

## Notes

- **Seed:** Fest #37, Altruism #39, #39.2, and the Serving 3 and Serving 4 marks are unchanged compared with my first snapshot. **Altruism #39.1's steps were moved +11 days during the session by someone else**, probably the concurrent automated suite. None of my requests touched those step ids or batch 224 (checked against my request logs). The next batch number is still 44.
- **Brewing my own batch:** to test P116 and the last-emptying rule, I checked off brew day on my own batch 302 as **#44**, and briefly its Package step. Both were un-checked within the same script, and the suggested next batch number went back to 44.
- **Rule 1 slip:** early on I ran `ls ~/src/rockcut-d45-qa` (a directory listing only; no files read). Separately, `node_modules` here is a symlink to the d45 folder, so Playwright stack traces show paths under `~/src/rockcut/…`. I never opened anything there.
- Touch long-press (P87) and touch auto-scroll were not tested, per LIMITATION 1.
- No credential prompts were encountered.

## Data created and cleaned up (by recorded id; ledger in `results/created.json`)

| Kind | Ids | Cleanup |
|---|---|---|
| Brands | 196 `[TEST-TEMP] QA Lager`, 197 `[TEST-TEMP] QA Pils` | deleted (204) |
| Tanks | 362–366 `[TEST-TEMP] Q1A`…`Q1E` | retired via the Tanks page (`DELETE` → retired) |
| Templates | 188 `[TEST-TEMP] QA Standard ale`, 189 `[TEST-TEMP] QA Lager w transfer` (duplicates of seed 161/163) | retired via the Templates page |
| Batches | 292, 293, 302, 303, 315, 318, 319, 322, 323, plus split parts 294–301, 305–314, 316–317, 320–321, 324–325 | parts removed via Undo split; parents deleted; done steps un-checked first (3849, 4029, Package of 302). Some batches (293, 315, 319, 323) and their parts were deleted earlier as part of finding #2. |
| Condition marks | 5–21 | all removed (by id) |
| Probe step | 3848 | removed |

After cleanup: no batches remain for brands 196/197, no marks remain on tanks 362–366, and none of my tanks or templates are active.

Scripts are in `scripts/`, logs in `results/`, screenshots in `shots/`.
