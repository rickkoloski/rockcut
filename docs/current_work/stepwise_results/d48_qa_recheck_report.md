# D48 QA recheck: fix cycle 1 (DEV)

- **Build:** D48 at `a207cb1` (DEV API v52, UI v55), from https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev. Prod was not touched.
- **Tester:** fresh, independent QA (Claude), 2026-10-22 (America/Denver). Headless Chromium + Playwright, timezone America/Denver, one browser per script, closed at the end of each.
- **Personas:** loaded from `auth/*.json` with `storageState`. The auth files were never opened. API calls were made from inside the page and no token was returned. A grep of my `results/rc_*` and `scripts/rc_*` for `ses_`, `dev_` and `Bearer` finds nothing.
- **Data:** I used only my own `[TEST-TEMP]` data (ledger: `results/rc_created.json`), and all of it is cleaned up (see the end). The D48 seed examples were only read. They are unchanged compared with my opening snapshot.
- **Scripts:** `scripts/rc_*.mjs`. **Logs:** `results/rc_*.log`. **Screenshots:** `shots/rc_*.png`.

## Summary

All 12 findings are **fixed**. The boundary days are consistent everywhere: fill day refused, fill + 1 allowed, exit − 1 allowed, exit day refused. Every default day saves without a refusal, and Undo works after each change, including a refused-then-corrected change and a batch delete.

I found **1 new must-fix** and **5 new minor** gaps. They sit next to the fixes.

| # | Was | Recheck |
|---|---|---|
| 1 | must-fix: transfer before brew day | **Fixed** |
| 2 | must-fix: deleting a split parent | **Fixed** |
| 3 | must-fix: transfer into the current tank | **Fixed** for the current tank. **New must-fix N1:** the same result is reachable through the tank the beer moves to *next* |
| 4 | Add step before brew day | **Fixed**. Minor **N4** (the message for a part) and **N6** (no ceiling after the exit) are nearby |
| 5 | Transfer after Package | **Fixed** |
| 6 | Split parent volume editable | **Fixed** for the parent. Minor **N3:** a *part's* volume is still editable |
| 7 | Template change message and links | **Fixed** |
| 8 | Part dialog P-number and Delete | **Fixed** for planned parts. Minor **N2:** wrong wording once the parent is brewed |
| 9 | Zoom ✓ after a custom range | **Fixed** (by design, with a tooltip); the tooltip doesn't block clicks |
| 10 | Multi-batch drag prompt | **Fixed** |
| 11 | Keyboard multi-select and Escape | **Fixed** |
| 12 | Split before brew day: vague message | **Fixed**. Minor **N5:** the split dialog keeps a stale error |
| access | 403 / sent Home | **Unchanged (pass)** |

### New gaps

| # | Severity | Gap |
|---|---|---|
| N1 | **must-fix** | A transfer into the tank the beer goes to **next** is accepted, which turns the template's later transfer into a same-tank transfer, with a CIP on a full tank and no flag |
| N2 | minor | A brewed part's dialog reads "#44.1 · the real number is set when the parent's brew day is checked off", but it already is |
| N3 | minor | A split part's volume can be changed, so the parts no longer add up to the parent |
| N4 | minor | A part refuses a step before its split with "A step can't come before brew day.", even when the day is after brew day |
| N5 | minor | The split dialog keeps the previous refusal on screen after you change the day |
| N6 | minor | Add step (and Add a ramp) accepts a day after the beer has left the tank (after Package) |

---

## Item by item

All dates are for my batches:
- **A:** Standard ale copy, brew day Thu Nov 12 in Q1RA, Package (exit) Mon Dec 7.
- **L:** Lager-with-transfer copy, brew day Fri Nov 13 in Q1RB, template transfer into Q1RC on Fri Dec 18, Package Wed Dec 23.
- **T:** brew day Oct 15 in Q1RC, so it is "in a tank today".

### 1. Add transfer / filter before brew day: **fixed**

**API boundaries:**
- A: Oct 22 (today), Nov 11, and Nov 12 (fill day) → 422 `before_fill` "The beer isn't in that tank on that day."
- A: Nov 13 → 201.
- L, second tank: Dec 18 (the fill day of Q1RC) → 422 `before_fill`. Dec 19 → 201.
- Part 2 of a split on Nov 20: Nov 20 → 422, Nov 21 → 201. Part 1 ("stays"): Nov 15 and Nov 20 → 422, Nov 21 → 201.

**Preview:** the dialog shows "The beer isn't in that tank on that day." in the preview as soon as the day is wrong, before saving (`shots/rc_ref_transfer_before_fill.png`). Add stays enabled. Clicking it gets the same 422 message at the top of the dialog, and nothing changes.

**Default day:**
- Batch brewing weeks out (A): Nov 13 (brew day + 1).
- Batch in a tank today (T): Oct 22 (today).

Both defaults saved without a refusal, and each snackbar Undo restored the batch exactly (`results/rc_ui_defaults.log`).

**Refused, then corrected, then Undo:** Dec 8 refused → changed to Nov 20 → 201 → Undo → the batch is identical to before (`results/rc_ui_refuse.log`).

### 2. Deleting a split parent: **fixed**

**Parent while split:**
- The dialog shows "Undo the split first to delete it." in place of Delete planned batch (`shots/rc_parent_dialog.png`).
- `DELETE /batches/:parent` → 422 "Undo the split first.".
- Parent and parts are all still there.

**Parts:** no Delete button (planned and brewed). `DELETE /batches/:part` → 422 "That's a part of a split. Undo the split to change it that way."

**Delete + Undo of an unsplit planned batch:**
- **API:** L with 3 vessels, a slotted-in Addition (with notes and its comes-after/leads-to), a 3-step ramp linked after Fermentation, and an added Filter (with its CIP). After `DELETE` and then `POST /undo/:token`, it comes back with the **same id**. Every step, date, vessel, temperature, note, ramp group, link and default answer is identical (`results/rc_api3.log`). Reusing the token → 404.
- **UI:** batch P9 (a ramp and an Addition) → Delete planned batch → Delete → "…P9 deleted." → Undo → identical (`results/rc_ui_delete.log`).

### 3. Transfer into the tank the beer is already in: **fixed** (but see N1)

**Into picker:**
- A's picker leaves out Q1RA and still offers Unassigned.
- T's picker leaves out Q1RC.

**API:** into the current tank → 422 `same_tank` "The beer is already in [TEST-TEMP] Q1RA." The same holds on L's second vessel (Q1RC) and on both split parts. A filter into Unassigned → 201.

**Split dialog:** the current tank is offered only as "[TEST-TEMP] Q1RA (stays here)". An API split with an explicit `tank_id` of the current tank → 422 `same_tank`.

### 4. Add step before brew day: **fixed**

**API, Add step on A:**
- Oct 22 and Nov 11 → 422 `before_brew_day` "A step can't come before brew day."
- Nov 12 (brew day) and Nov 13 → 201.

**API, Add a ramp:** first day Nov 11 → 422 (same message). Nov 12 → 201.

**Part (split Nov 20):**
- Part 2: Nov 19 → 422, Nov 20 → 201.
- Part 1: Nov 19 → 422, Nov 20 → 201.
- Part 2 ramp on Nov 19 → 422.
- The floor is the parent's Split day, as specified. See N4 for the wording.

**Defaults:**
- Add step: Nov 13 for A (brew day + 1), Oct 22 for T (today).
- Add a ramp: the same, with the preview "3 Set temp steps: 60°, 55°, 50°, Fri Nov 13 – Sun Nov 15."

All of these saved without a refusal, and Undo restored each one.

**UI:** the refusal shows at the top of the dialog after Add (`shots/rc_ref_addstep_before_brew.png`, `shots/rc_ref_ramp_before_brew.png`). Brew day was then accepted, and Undo restored the batch.

### 5. Transfer after Package: **fixed**

- A: Dec 7 (exit day), Dec 8 and Dec 20 → 422 `after_exit` "The beer isn't in that tank on that day."
- A: Dec 6 → 201.
- L: Dec 23 and Dec 24 → 422.
- The UI preview shows the same message for Dec 7 and Dec 8 (`shots/rc_ref_transfer_after_exit.png`).

### 6. Split parent volume: **fixed** (but see N3)

- The parent's Volume field reads "Undo the split first to change it" and can't be edited or saved.
- `PATCH /batches/:parent {volume_bbl: 30}` → 422 "Undo the split first."
- The volume stayed at 20.

### 7. Template change: **fixed**

**Setup:** batch P9 had a ramp after Fermentation, an Addition after FDH, and an added transfer into Q1RD.

**Change to the Lager-with-transfer copy:**
- The snackbar reads "[TEST-TEMP] QA RC Standard ale → [TEST-TEMP] QA RC Lager w transfer. Kept 4 added steps; dropped the added transfer into [TEST-TEMP] Q1RD."
- The ramp keeps Fermentation → 60° → 55° → 50°.
- The Addition (that template has no FDH) is re-linked after "Set temp - 65°".

**Change back (a template with fewer tanks):**
- "… → [TEST-TEMP] QA RC Standard ale. Kept 4 added steps."
- The Addition is linked after FDH again, and the ramp is still linked.
- No added step ended up unlinked.

**Other checks:**
- Double-clicking Change template sent one PATCH.
- The brand change gave "…P9 is now [TEST-TEMP] QA RC Pils P9."

Evidence: `results/rc_ui_tpl.log`, `shots/rc_tpl_to245_after.png`.

### 8. Part dialog: **fixed** for planned parts (but see N2)

- Planned parts read "P6.1 · the real number is set when the parent's brew day is checked off" and "P6.2 · …" (`shots/rc_part1_dialog.png`, `shots/rc_part2_dialog.png`).
- There's no Delete button.

### 9. Zoom label after a custom range: **fixed** (by design)

- Hovering the zoom button shows the tooltip "Weeks on screen" (aria-label "Zoom: 6 weeks on screen").
- The ✓ is on the current zoom. After a custom From/To it stays on the zoom in use, which matches "zoom = weeks on screen".
- **The tooltip doesn't block clicks:**
  - Right after picking 2 weeks, no tooltip is left open, and Add process opens its menu on the first click.
  - With the tooltip showing (mouse resting on the zoom button), clicks on Add process, Today and Set up all land.
- Evidence: `results/rc_ui_zoom.log`, `shots/rc_9_zoom_tooltip.png`. I put the zoom back to 6 weeks afterwards.

### 10. Multi-batch drag prompt: **fixed**

- **Path:** Ctrl-click FDH (P6) and Set temp 65° (P7) → drag 1 day.
- **Prompt:** "2 batches · 2 steps moved 1 day later". The following steps are grouped under "[TEST-TEMP] QA RC Lager P6" (7 steps) and "[TEST-TEMP] QA RC Lager P7" (15 steps).
- **After Apply:** "2 steps moved 1 day later, with 22 following steps." Undo restored both batches exactly.
- Evidence: `shots/rc_10_multi_batch_prompt.png`, `results/rc_ui_drag.log`.

### 11. Keyboard: **fixed**

**Ctrl+Space on a focused step:**
- On FDH: "1 step selected", and no dialog opens.
- Adding Package: 2 selected.
- Adding PDH: 3 selected.
- Ctrl+Space on PDH again: back to 2.

**Escape:**
- With a selection active, Escape clears the selection.
- With a selection active **and** a step dialog open, the first Escape clears the selection and the dialog stays open. The second Escape closes the dialog.

**Plain Space / Enter** still opens the step dialog.

Evidence: `results/rc_ui_misc.log`.

### 12. Split before brew day: **fixed** (but see N5)

- API: Nov 11 and Nov 12 (brew day) → 422 `split_before_brew` "The split has to be after brew day."
- API: Nov 13 and Dec 6 → 201 (each was undone).
- API: Dec 7 (exit) and Dec 8 → 422 `after_exit` "The beer isn't in that tank on that day."
- The UI shows the same messages (`shots/rc_ref_split_2026-11-12.png`, `shots/rc_phone_split_refused.png`).
- The split dialog's default day (Nov 13 for A, Oct 22 for T) saved without a refusal, and snackbar Undo removed the parts.

### Access: **pass** (unchanged)

- bartender1, barMgr and office1 are sent to `/`. GET schedule, POST transfer, POST split and DELETE batch all return 403.
- breweryDevice gets the "Not available on a shared device … Go to Home" page, and all four calls return 403. This matches the first pass.
- brewer1 still has access (200; refused dates get the 422 messages).
- Evidence: `results/rc_access.log`, `shots/rc_access_breweryDevice.png`.

### Phone width (412×915, touch)

- None of these have horizontal overflow or controls off screen:
  - the batch dialog;
  - Add step and Add a ramp, including their refusal messages;
  - Add transfer / filter with its preview refusal;
  - Split, including its refusal;
  - the parent dialog while split, the part dialog, and the zoom menu.
- The dialog paper is 348 px wide. Evidence: `results/rc_phone.log`, `shots/rc_phone_*.png`.
- Cosmetic only: the split dialog's part tank pickers cut "[TEST-TEMP] Q1RA (stays here)" to "[TEST-…". That's because of my long test tank names, so I'm not reporting it as a gap.

---

## New gaps

### N1 (must-fix). A transfer into the tank the beer goes to next is accepted, and it creates a same-tank transfer

- **Path:** Batch L (Lager with transfer: Q1RB, then the template's **Transfer into Q1RC on Fri Dec 18**). Batch dialog → Add transfer / filter… → Day **Thu Dec 17** → Into **[TEST-TEMP] Q1RC** → Add.
- **Expected:** This should be refused (or the later transfer should be dropped or re-pointed), since the beer would then be "transferred" into Q1RC on Dec 18 while it's already in Q1RC. That is exactly the situation item 3 now refuses.
- **Observed:**
  - **Picker:** Q1RC is offered. The picker only leaves out the tank the beer is in *that day*.
  - **Preview:** "1 step from that day (CIP & Sanitize) move to [TEST-TEMP] Q1RC; [TEST-TEMP] Q1RD gets a CIP & Sanitize that day." This is misleading: it says the old tank's cleaning step moves into the new tank.
  - **Response:** 201. The vessels become `[Q1RB, Q1RD, Q1RC, Q1RC]`.
  - **The Dec 18 Transfer:** its step dialog still reads "Transfer · [TEST-TEMP] Q1RC". It now goes **Q1RC → Q1RC**.
  - **The CIP:** a **CIP & Sanitize on Q1RC on Dec 18** sits in the middle of the beer's stay in Q1RC (Dec 17–23).
  - **No flag:** the flags API lists nothing for L or Q1RC, and Q1RC's status is normal.
  - The same thing happens through the API: `POST /batches/:id/transfers {due_on: "2026-12-17", tank_id: <Q1RC>}` → 201.
- **Repro:**
  1. Plan a batch from a template with a transfer (seed "Lager with transfer").
  2. Add a transfer the day before the template's transfer, into the template transfer's destination tank.
- **Evidence:**
  - `shots/rc_gap_L_transfer_into_next_tank_dialog.png` (picker and preview)
  - `shots/rc_gap_L_transfer_into_next_tank_gantt.png` (two arrows into Q1RC, and the CIP hatch inside the Q1RC bar)
  - `shots/rc_gap_L_transfer_step_dialog.png`, `shots/rc_gap_L_cip_on_full_tank_dialog.png`
  - `results/rc_api1.log` ("L transfer 2026-12-17 into 540 -> 201"), `results/rc_ui_L_variant.log`, `results/rc_ui_L2.log`
- The added step was removed afterwards and L was confirmed back to its earlier state.

### N2 (minor). A brewed part's dialog says the real number isn't set yet

- **Path:** Split a batch → check off the parent's brew day (number #44) → open part 1.
- **Expected:** "#44.1 · the parent's number" (RECHECK item 8).
- **Observed:**
  - Title: "[TEST-TEMP] QA RC Pils #44.1".
  - P-number line: "**#44.1 · the real number is set when the parent's brew day is checked off**". The parent's brew day already is checked off; the line still uses the planned wording.
- **Repro:** As in the path, on any split batch whose brew day can be checked off (brew day today or earlier).
- **Evidence:** `results/rc_ui_brewed.log`, `shots/rc_brewed_dialog_513.png`.
- I un-checked the brew day and undid the split in the same script. The next batch number is still 44.

### N3 (minor). A split part's volume is editable, so the parts stop adding up

- **Path:** Split a 20 bbl batch into 12 + 8 → open part 2 → Volume shows an editable field with **Save** (no "Undo the split first"). Via the API, `PATCH /batches/:part {volume_bbl: 9}` → **200**.
- **Expected:** Locked like the parent (item 6), or checked so the parts still add up to the parent's volume. The split dialog itself refuses "The parts add up to 21 bbl, but … is 20 bbl."
- **Observed:** The parts are 12 + 9 = 21 bbl under a 20 bbl parent. Undo split then merges back to 20 bbl, so the edit disappears silently.
- **Evidence:** `results/rc_api2.log` ("PATCH part volume 9 200"), `shots/rc_part2_dialog.png`.

### N4 (minor). A part's step floor uses the brew-day message

- **Path:** Batch brewed Nov 12, split on Nov 20 → on a part, Add step on **Nov 19** (also Add a ramp).
- **Expected:** A message about the split, e.g. "A step can't come before the split."
- **Observed:** 422 "**A step can't come before brew day.**", although Nov 19 is a week after brew day. The rule is right (the floor is the Split day); only the wording is wrong.
- **Evidence:** `results/rc_api2.log`.

### N5 (minor). The split dialog keeps a stale refusal

- **Path:** Split… → Day = brew day → Split → refused "The split has to be after brew day." → change Day to the exit day (Dec 7).
- **Expected:** The error clears (or updates) when the day changes, like the transfer preview does.
- **Observed:** "The split has to be after brew day." stays at the top of the dialog for the new day. Only after Split is clicked again does it change to "The beer isn't in that tank on that day."
- **Evidence:** `results/rc_ui_refuse.log` ("split 2026-12-07 before save …").

### N6 (minor). Add step accepts a day after the beer has left the tank

- **Path:** Add step… on A (Package and exit Mon Dec 7) → Day **Thu Dec 10**.
- **Expected:** Refused, like a transfer after the exit (item 5), since the beer is gone.
- **Observed:** 201. The Addition is placed in Q1RA three days after Package, with no flag. Exit day itself (Dec 7) was also accepted, which is reasonable for a same-day step.
- **Evidence:** `results/rc_api1.log` ("add Addition 2026-12-10 201"; the step was removed).

---

## Notes

**Undo:**
- Every Undo I tried restored the exact prior state. That covers each dialog's default save, refused-then-corrected changes, the multi-batch move, the template change and delete.
- Double-clicking Add (transfer) and Change template each sent one request.

**Performance (spot check):** `GET /api/production/schedule` for 12 weeks took a median of 103 ms (max 175 ms) over 8 calls. A split via the API took 196 ms. Both are well under target.

**Not confirmed:** twice, clicking the bar of part 2 of my *brewed* split (in Q1RD) didn't open its dialog. Part 2 of a planned split opened fine. I didn't dig further, so I'm not reporting it.

**P-numbers:** my batch T was planned with a past brew day, so it took P1 and shifted the other planned P-numbers for the session, as the brief allows. T is deleted now.

**Brew-day check-off on T:** I checked it off once (#44) to test N2 and un-checked it at once. `next_batch_number` is 44 before and after.

**No automated suite** was running, per the request.

**Seed:**
- Fest #37 (418), Altruism #39 (419), #39.1 (420) and #39.2 (421) are unchanged step by step (ids, dates, done dates, tanks), as are the Serving 3 and Serving 4 marks.
- I never sent a write to a seed id or seed tank.

**Credentials:** no prompts.

## Data created and cleaned up (by recorded id; ledger `results/rc_created.json`)

| Kind | Ids | Cleanup |
|---|---|---|
| Brands | 316 `[TEST-TEMP] QA RC Lager`, 317 `[TEST-TEMP] QA RC Pils` | deleted (204) |
| Tanks | 538–542 `[TEST-TEMP] Q1RA`…`Q1RE` | retired (`DELETE` 200) |
| Templates | 244 (copy of seed 217), 245 (copy of seed 219) | retired (`DELETE` 200) |
| Batches | 496, 497, 504, 515 | deleted (200), with no done steps left |
| Split parts | 498–503, 505–514, 516–517 | removed by Undo split / snackbar Undo during the session |
| Added steps / ramps / transfers | many | removed by id or by Undo during the session |

After cleanup: no batches remain for brands 316/317, no tank of mine is active, and there are no marks on my tanks (`results/rc_cleanup.log`).
