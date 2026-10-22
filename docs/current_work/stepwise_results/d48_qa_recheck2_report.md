# D48 QA recheck 2: fix cycle 2 (DEV)

- **Build:** D48 at `48f5688` (DEV API v53, UI v56), as stated in RECHECK2.md, from https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev. DEV has no version endpoint (`/api/health` only returns `ok`), so I couldn't confirm the build number myself. Prod was not touched.
- **Tester:** fresh, independent QA (Claude), 2026-10-22 (America/Denver). Headless Chromium + Playwright, timezone America/Denver, one browser per script, closed at the end of each.
- **Personas:** loaded from `auth/*.json` with `storageState`. I never opened the auth files. API calls were made from inside the page, and no token was returned. A grep of `results/r2_*` and `scripts/r2_*` for `ses_`, `dev_` and `Bearer` finds nothing.
- **Data:** I used only my own `[TEST-TEMP]` data (ledger: `results/r2_created.json`), and all of it is cleaned up (see the end). The seed was only read, and it is unchanged compared with my opening snapshot.
- **Scripts:** `scripts/r2_*.mjs`. **Logs:** `results/r2_*.log`. **Screenshots:** `shots/r2_*.png`.

My batches:
- **A:** Standard ale copy, brew day Thu Nov 12 in Q1SA, Package (exit) Mon Dec 7.
- **L:** Lager-with-transfer copy, brew day Fri Nov 13 in Q1SB, template transfer into Q1SC on Fri Dec 18, Package Wed Dec 23.
- **T:** brew day Oct 15 in Q1SD, so it is "in a tank today".

## Summary

All six recheck-1 items (N1–N6) are **fixed**, and the addendum works as described. The N1 rule ("two vessels in a row can't share a tank") holds on every route I tried:
- Add transfer / filter, including through Add step;
- Remove transfer;
- Split, including a split part's own later transfer;
- template change;
- Plan batch;
- the Ferment in / Transfer to pickers;
- dragging a bar onto another tank's row.

The refusal wording is right on all of them. All 12 first-pass items still hold at their boundaries, and access is unchanged.

I found **1 new must-fix** and **3 new minor** gaps:

| # | Item | Result |
|---|---|---|
| N1 | Transfer into the tank the beer goes to next | **Fixed** everywhere a vessel's tank can change; see R1 for a way around it through Undo |
| N2 | A brewed part said its number wasn't set | **Fixed**: "#44.1 · the parent's number" / "#44.2 · the parent's number" |
| N3 | A part's volume was editable | **Fixed**: read-only with "Undo the split first to change it"; Save is disabled; API 422 |
| N4 | A step before a part's split said "…before brew day." | **Fixed**: "A step can't come before the split." (Add step and Add a ramp, both parts) |
| N5 | The split dialog kept a stale refusal | **Fixed** in the split dialog. See R2: the same problem is still in four other dialogs |
| N6 | Add step accepted a day after the tank's exit | **Fixed** for Add step, Add a ramp and Change ramp, on the first and on a later tank |
| Addendum | Pickers, bar drag, Plan batch, and the swap through Unassigned | **Works**: red drag hint, refused drop with a snackbar, swap in three saves |
| 1–12 | First-pass items | **All still hold** (spot checks below) |
| Access | bartender1, barMgr, office1, breweryDevice | **Unchanged (pass)** |

### New gaps

| # | Severity | Gap |
|---|---|---|
| R1 | **must-fix** | **Undo** of a tank-picker change, after another user changed the other vessel, makes **Q1SC → Q1SC** with no flag |
| R2 | minor | Add step, Add a ramp, Change ramp, Plan batch and the batch dialog keep a stale refusal after you correct the input |
| R3 | minor | A split where nothing stays is refused or accepted depending on **part order**, and the refusal doesn't say which part |
| R4 | minor | **Move only** on a transfer can put transfers out of order (Q1SB → Q1SB by date); the only flag is a misleading "dirty fill" |

---

## Recheck-1 items

### N1. Transfer into the tank the beer goes to next: **fixed**

Batch L is Q1SB (Nov 13 – Dec 18), then Q1SC (Dec 18 – 23). All of these were checked through the API and in the UI unless noted.

**Add transfer / filter:**
- Dec 17 into Q1SC, as a Transfer or a Filter → 422 `same_tank` "The beer goes into [TEST-TEMP] Q1SC next, on Fri Dec 18."
- Nov 20 into Q1SC (weeks ahead) → the same message.
- Dec 17 into Q1SB → "The beer is already in [TEST-TEMP] Q1SB."
- Dec 20 into Q1SC → "The beer is already in [TEST-TEMP] Q1SC."
- Allowed:
  - Dec 17 into Q1SD → `[Q1SB, Q1SD, Q1SC]`, and the template's Dec 18 CIP moves to Q1SD;
  - Dec 17 into Unassigned;
  - Dec 20 into Q1SB (A → B → A).
- Each allowed change was undone with its undo token, and L came back identical.

**Through Add step** (type Transfer or Filter, into Q1SC on Dec 17): the same 422. Into Q1SD → 201.

**Into picker:**
- Dec 17 and Nov 20: leaves out **both** Q1SB and Q1SC, and still offers Unassigned.
- Dec 20: offers Q1SB, leaves out Q1SC.

**Preview:**
- Pick Q1SB on Dec 20, then change the day to Dec 17. The preview turns to "The beer is already in [TEST-TEMP] Q1SB." before saving.
- Add then gets the same 422. Correcting to Q1SD saves, and Undo restores L exactly.
- Double-clicking Add sent one POST.

**Preview wording:** for Dec 17 into Q1SD, the preview reads "0 steps from that day (none) move to [TEST-TEMP] Q1SD; [TEST-TEMP] Q1SB gets a CIP & Sanitize that day." The exit CIP is no longer listed as moving, as specified. ("0 steps … (none) move" reads a little oddly, but it's accurate.)

**Remove transfer (A → B → A becoming A → A):**
- L with an added transfer on Dec 20 into Q1SB is `[Q1SB, Q1SC, Q1SB]`.
- Removing the Dec 18 template transfer:
  - **UI:** the confirm reads "Remove the Transfer on Fri Dec 18? The beer stays in [TEST-TEMP] Q1SB …"; Remove is refused with "The beer goes into [TEST-TEMP] Q1SB next, on Sun Dec 20.", and nothing changes (`shots/r2_remove_transfer_ABA_refused.png`).
  - **API:** 422 with the same message.

**Unassigned in between:** on a separate test batch, `[Q1SG, Q1SH, Q1SG]` → the middle vessel set to Unassigned gives `[Q1SG, Unassigned, Q1SG]` → 200, allowed as specified.
- Setting the middle vessel to Q1SG → 422 "The beer is already in [TEST-TEMP] Q1SG."
- Removing the first transfer, which would leave `[Q1SG, Q1SG]` → 422 (`results/r2_unassigned.log`).

**Split part's own later transfer:**
- Part 2 (Q1SD) into Q1SD and part 1 (Q1SA) into Q1SA → "The beer is already in …".
- Into Q1SE → 201.
- Part 1's fill-day floor still applies: the split day → `before_fill`; the split day + 1 → 201.

**Split of L** (whose template transfer goes into Q1SC):
- "(stays here)" + Q1SC → 201. Part 1 is `[Q1SB, Q1SC]`, and part 2 is `[Q1SC, Unassigned]`, so its copy of the later transfer goes to Unassigned. No same-tank pair.
- Nothing stays, `[Q1SC, Q1SD]` → refused. See R3.

**Template change:**
- A (Q1SA) → the Lager-with-transfer template gives `[Q1SA, Unassigned]`.
- L → Standard ale gives `[Q1SB]`.
- An extra `tank_ids` in the PATCH is ignored. I found no way to get a same-tank pair this way.
- With an added transfer into Q1SD, the message reads "… Dropped the added transfer into [TEST-TEMP] Q1SD." and the result is `[Q1SA, Unassigned]`.

**Plan batch:**
- **API:** `tank_ids: [Q1SE, Q1SE]` → 422 "The beer goes into [TEST-TEMP] Q1SE next, on Thu Dec 31." `[Q1SE, Q1SF]`, `[Q1SE, null]` and `[null, null]` → 201; each was deleted at once.
- **UI:** Q1SE + Q1SE shows the same message in the dialog (`shots/r2_plan_same_tank_refused.png`). Q1SF then saves, double-clicking Save sends one POST, and Undo removes the new batch.

**Ferment in / Transfer to pickers** (`PATCH /batches/:id/vessels/:i`):
- Transfer to = Q1SB → "The beer is already in [TEST-TEMP] Q1SB."
- Ferment in = Q1SC → "The beer goes into [TEST-TEMP] Q1SC next, on Fri Dec 18."
- Both show inside the dialog, and the picker goes back to its old value. The API gives the same 422s.
- A corrected change (Transfer to = Q1SD) saved, and snackbar Undo restored L exactly.

**Bar drag:**
- L's first bar onto Q1SC's row: the hint reads "→ [TEST-TEMP] Q1SC · the beer goes into [TEST-TEMP] Q1SC next, on Fri Dec 18" in white on red.
- On the drop, the API returns 422, and the snackbar reads "The beer goes into [TEST-TEMP] Q1SC next, on Fri Dec 18." (`shots/r2_drag_v0_onto_Q1SC_next.png`).
- The second bar onto Q1SB's row: "the beer is already in [TEST-TEMP] Q1SB", refused the same way.
- Onto Q1SD: a plain hint, then "… (after transfer) → [TEST-TEMP] Q1SD." with Undo, which restored L.
- Dropping a bar on its own row sends nothing.

**Swap (addendum):**
- Q1SB ↔ Q1SC takes three saves:
  1. Transfer to → Unassigned
  2. Ferment in → Q1SC
  3. Transfer to → Q1SB
- Each step saved with its own snackbar and ended at `[Q1SC, Q1SB]` with the steps unchanged.
- The reverse swap restored L exactly (`results/r2_ui_pickers.log`, `shots/r2_picker_swapped.png`).

Evidence: `results/r2_api1.log`, `results/r2_ui_xfer.log`, `results/r2_ui_drag.log`, `results/r2_ui_pickers.log`, `results/r2_ui_spot.log`, `results/r2_unassigned.log`.

### N2. A brewed part's number: **fixed**

- **Setup:** I split T today (Oct 22; "(stays here)" 12 bbl + Q1SE 8 bbl), then checked off the parent's brew day as **#44**.
- Part 1 reads "**#44.1 · the parent's number**", with the title "[TEST-TEMP] QA R2 Pils #44.1".
- Part 2 reads "**#44.2 · the parent's number**".
- Before brewing, the planned parts read "P1.1 / P1.2 · the real number is set when the parent's brew day is checked off".
- I un-checked brew day and undid the split in the same script. `next_batch_number` is 44 before and after.
- Evidence: `results/r2_ui_n2.log`, `results/r2_ui_n2b.log`, `shots/r2_n2_brewed_part1.png`, `shots/r2_n2_brewed_part2.png`.

### N3. A part's volume: **fixed**

- Both parts show Volume as read-only (`readonly`) with "Undo the split first to change it", and **Save is disabled**. This holds planned and brewed.
- `PATCH /batches/:part {volume_bbl: 9}` → 422 "Undo the split first." (both parts). The volumes stayed at 12 / 8 under the 20 bbl parent.
- Also unchanged: the parent's volume and the parent's Delete → 422 "Undo the split first."
- Evidence: `results/r2_api1.log`, `results/r2_ui_n2.log`, `shots/r2_part2_planned_dialog.png`.

### N4. A step before a part's split: **fixed**

**API** (A split on Nov 20; both parts):
- Add step on Nov 19 → 422 `before_split` "A step can't come before the split."
- Add step on Nov 20 → 201.
- Add a ramp first on Nov 19 → the same 422; on Nov 20 → 201.

**UI** (T split on Oct 22; both parts):
- Add step on Oct 21 shows "A step can't come before the split." The corrected Oct 22 saves, and Undo restores it.
- Add a ramp on Oct 21 gives the same message.

Evidence: `results/r2_api1.log`, `results/r2_ui_parts.log`, `shots/r2_n4_part2_add_step.png`.

### N5. The split dialog's stale refusal: **fixed** (but see R2)

- After a refusal ("The split has to be after brew day." or "The beer isn't in that tank on that day."), the message cleared when I changed:
  - the **day**;
  - the **method** (Transfer → Filter);
  - a part's **volume**;
  - a part's **tank**;
  - the parts (**Add part**).
- A valid split then saved; double-clicking Split sent one POST. Snackbar Undo removed the parts and restored A exactly.
- Evidence: `results/r2_ui_split.log`, `shots/r2_n5_after_day_change.png`.

### N6. Steps after the tank's exit: **fixed**

**A** (exit is Package, Mon Dec 7):
- Add step: Dec 6 and Dec 7 → 201; Dec 8 → 422 `after_exit` "The beer isn't in that tank on that day."
- Add a ramp 60→40 at 10°/day:
  - first on Dec 5 (ends on the exit day) → 201;
  - first on Dec 6 (would end Dec 8) → 422, refused whole;
  - first on Dec 8 → 422.
- **Change ramp** on the template ramp (58° → 32°):
  - at 2°/day (14 steps, past the exit) → 422, and nothing changed;
  - at 4°/day (ends on Dec 7) → 200;
  - 34° at 7°/day → 200.
  - Each was undone.

**L, first tank** (Q1SB, exit = transfer on Dec 18), Add step with "First tank · Q1SB" (`vessel_index: 0`):
- Dec 17 and Dec 18 → 201;
- Dec 19 → 422.
- A ramp in Q1SB starting Dec 16 (ends Dec 18) → 201; starting Dec 17 → 422.

**L, later tank** (Q1SC, exit = Package on Dec 23):
- Add step: Dec 18, Dec 22 and Dec 23 → 201; Dec 24 → 422.
- A ramp starting Dec 21 → 201; starting Dec 22 → 422.

**UI:** all three dialogs show the message after Add or Save, and the corrected input saves with a working Undo. See R2 about the message staying on screen.

Evidence: `results/r2_api1.log`, `results/r2_ui_n6.log`, `results/r2_ui_n6b.log`, `results/r2_ui_n6c.log`, `shots/r2_n6_*.png`.

---

## First-pass items: spot checks (one boundary each)

| # | Check | Result |
|---|---|---|
| 1 | Transfer on A's fill day (Nov 12) and fill + 1 | Nov 12 → 422 `before_fill`; Nov 13 → 201 (undone). Default day on L: Nov 14 (brew + 1). **Holds** |
| 2 | Delete a split parent; delete an unsplit batch, then Undo | Parent → 422 "Undo the split first."; parts have no Delete. `DELETE` A → 200, then Undo → **same id**, identical. **Holds** |
| 3 | Transfer into the current tank | 422 "The beer is already in [TEST-TEMP] Q1SA."; the picker leaves it out. **Holds** |
| 4 | Add step on Nov 11 / Nov 12 (brew day) | 422 "A step can't come before brew day." / 201. Default Nov 13 (brew + 1). **Holds** |
| 5 | Transfer on the exit day (Dec 7) / Dec 6 | 422 `after_exit` / 201. **Holds** |
| 6 | Split parent's volume | 422 "Undo the split first." **Holds** |
| 7 | Template change with an added transfer | "[TEST-TEMP] QA R2 Standard ale → [TEST-TEMP] QA R2 Lager w transfer. Dropped the added transfer into [TEST-TEMP] Q1SD."; double-click sent one PATCH. **Holds** |
| 8 | Planned part dialog | "P1.2 · the real number is set when the parent's brew day is checked off"; no Delete. **Holds** |
| 9 | Zoom tooltip | "Weeks on screen"; Add process opens on the first click while the tooltip shows. **Holds** |
| 10 | Multi-batch drag | "2 batches · 2 steps moved 2 days later", with following steps grouped under P6 and P7. **Holds** |
| 11 | Keyboard | Ctrl+Space → "1 step selected" with no dialog; Escape clears it. **Holds** |
| 12 | Split on brew day / exit day | "The split has to be after brew day." / "The beer isn't in that tank on that day." **Holds** |

Evidence: `results/r2_api1.log`, `results/r2_ui_spot.log`, `results/r2_ui_drag5.log`.

---

## New gaps

### R1 (must-fix). Undo of a tank-picker change can create a same-tank pair (Q1SC → Q1SC)

- **Path:**
  1. Batch L is Q1SB → Q1SC (template transfer on Dec 18).
  2. **Owner** opens L → **Transfer to = Q1SD**. The snackbar reads "… (after transfer) → [TEST-TEMP] Q1SD." with **Undo**.
  3. Meanwhile **breweryMgr** sets **Ferment in = Q1SC**. That's allowed, because the next tank is now Q1SD.
  4. Owner clicks **Undo** on their snackbar.
- **Expected:** Undo is refused, like other stale undos ("Something changed since. Nothing was undone."), or it is checked against the N1 rule.
- **Observed:**
  - Owner sees "**Undone.**", and L is now **`[Q1SC, Q1SC]`**. The Dec 18 Transfer goes Q1SC → Q1SC, with a **CIP & Sanitize on Q1SC on Dec 18** in the middle of the beer's stay. This is exactly what N1 set out to prevent.
  - **No flag:** the flags API lists nothing for L or Q1SC, and Q1SC's status is normal.
  - The same happens through the API: `PATCH vessels/1 → Q1SD`, `PATCH vessels/0 → Q1SC`, then `POST /undo/<first token>` → **200** `[Q1SC, Q1SC]`.
- **For comparison, the undo-stale guard does work** for a transfer: undoing an added transfer after another user changed the last tank → 409 `undo_stale` (`results/r2_api3.log`). It's the vessel-tank undo that is neither stale-checked nor re-validated.
- **Repro:**
  1. Two users have a two-tank batch open.
  2. User 1 changes Transfer to.
  3. User 2 changes Ferment in to user 1's *old* Transfer-to tank.
  4. User 1 clicks Undo.
- **Evidence:**
  - Logs: `results/r2_ui_undo_other2.log` (UI, owner + breweryMgr) and `results/r2_api2.log` (API).
  - Screenshots: `shots/r2_gap_undo_same_tank_gantt.png` (the Q1SC row expanded; Transfer on Dec 18 inside Q1SC's own bar) and `shots/r2_gap_undo_same_tank_dialog.png`. These two were taken while owner's theme was still dark; see Notes.
- I put L back to Q1SB → Q1SC straight away.

### R2 (minor). Four dialogs still keep a stale refusal (N5 was fixed only in Split)

- **Path:** In each dialog, make a refused save, then correct the input.
- **Expected:** The refusal clears when the input changes, as the split dialog now does (N5) and as the transfer preview does.
- **Observed:** The old message stays at the top until the next save:
  - **Add step:** Dec 8 → "The beer isn't in that tank on that day." It is still shown after changing the day to Dec 7, which is valid and saves. The same happens with "A step can't come before the split." after a correction from Oct 21 to Oct 22 on a part.
  - **Add a ramp:** Dec 6 → refused. After changing to Dec 5, the dialog shows the old error **and** a valid preview at once: "3 Set temp steps: 60°, 50°, 40°, Sat Dec 5 – Mon Dec 7."
  - **Change ramp:** 2°/day → refused. After changing to 4°/day, the error stays above "New steps: 58°, 54°, …, 32°."
  - **Plan batch:** Q1SE + Q1SE → "The beer goes into [TEST-TEMP] Q1SE next, on Thu Dec 31." It stays after picking Q1SF.
  - **Batch dialog:** after a refused Ferment in pick, the red banner stays (it has an ✕) while the picker shows the old tank again. It is still there after opening Add transfer / filter (`shots/r2_dark_transfer_preview_refusal.png`).
- **Note:** none of these dialogs warns before Save. For example, the Add a ramp preview for Dec 6 shows "Sun Dec 6 – Tue Dec 8" with no hint that it runs past the exit. That's allowed by the spec (only the transfer preview is required to warn), but it adds to the confusion when the stale message stays.
- **Evidence:** `results/r2_ui_n6.log`, `results/r2_ui_n6b.log`, `results/r2_ui_parts.log`, `results/r2_ui_spot.log`, `shots/r2_addstep_stale_error.png`.

### R3 (minor). A split where nothing stays depends on part order

- **Path:** L → Split… → Day Dec 1 → Part 1 = Q1SC, Part 2 = Q1SD → Split.
- **Expected:** The same tanks give the same result whichever part is listed first. If it's refused, the message says which part is the problem.
- **Observed:**
  - `[Q1SC, Q1SD]` → 422 "The beer goes into [TEST-TEMP] Q1SC next, on Fri Dec 18." Part 1 keeps the template's later transfer into Q1SC; part 2 would get Unassigned.
  - `[Q1SD, Q1SC]` → **201**. Part 1 is `[Q1SD, Q1SC]` and part 2 is `[Q1SC, Unassigned]`. The same plan works with the rows swapped.
  - The refusal reads as if it were about the whole batch: it doesn't name part 1 and doesn't suggest the swap. The split dialog offers Q1SC for both parts.
  - "(stays here)" + Q1SC also works (part 2 gets Unassigned).
- **Repro:**
  1. Use a template with a transfer.
  2. Split before that transfer with nothing staying, and put the template transfer's destination tank as part 1.
- **Evidence:** `results/r2_ui_spot.log`, `results/r2_api1.log`, `shots/r2_split_L_part1_next_tank.png`.

### R4 (minor). Move only on a transfer can reorder transfers; the flag names the wrong problem

- **Path:**
  1. L with an added transfer on Dec 20 into Q1SB (`[Q1SB, Q1SC, Q1SB]`).
  2. Expand Q1SB and drag the Dec 20 Transfer 3 days earlier.
  3. Pick **Move only Transfer** → Apply.
- **Expected:** The N1 rule ("after any change") applies by date order, so this is refused. Or, at least, the flag says the beer is transferred into the tank it's already in.
- **Observed:**
  - The prompt warns "Some of them would then come before the step they follow. They'll be flagged." and Apply succeeds.
  - Result:
    - Transfer into vessel 2 (**Q1SB**) on **Dec 17**, while the beer is still in Q1SB;
    - then the Transfer into Q1SC on Dec 18;
    - then Q1SC's CIP on Dec 20, with the beer back in Q1SB.
  - By date, that's a Q1SB → Q1SB transfer. The vessel list `[Q1SB, Q1SC, Q1SB]` itself passes the rule.
  - The only flag is `dirty_fill`: "[TEST-TEMP] QA R2 Lager P7 (after transfer 2) fills [TEST-TEMP] Q1SB before it's cleaned after [TEST-TEMP] QA R2 Lager P7."
  - The same API move with Move only works the other way as well (the Dec 18 transfer to Dec 21, after the Q1SB one), and so does a move onto the same day. Move all keeps the order and is fine.
- **Why minor:** it's flagged (move-only conflicts are flagged by design since D47) and needs an A → B → A batch. But the flag doesn't describe the real problem.
- **Evidence:** `results/r2_ui_reorder.log`, `results/r2_api2.log`, `shots/r2_gap_reorder_prompt.png`, `shots/r2_gap_reorder_gantt.png`. Undone; L was restored.

---

## Phone width and dark mode

**Phone (412×915, touch, Light):** no horizontal overflow and nothing off screen in any of these:
- the batch dialog and the picker refusal;
- the Add transfer / filter preview refusal;
- the split refusal;
- Add step and Add a ramp after the exit;
- the Plan batch refusal.

The dialog paper spans 32–380 px. The refusals use dark red on light red (`rgb(95,33,32)` on `rgb(253,237,237)`). Screenshots: `shots/r2_phone_*.png`. The phone run's log lines were overwritten by the dark run, and are summarized here.

**Dark (desktop, in-app Theme → Dark):** the same dialogs and the drag hint, with no overflow.
- Refusal banners are light red on near-black (`rgb(244,199,199)` on `rgb(22,11,11)`).
- The transfer preview's red text is `rgb(244,67,54)` on `rgb(31,36,30)`, which is readable.
- The drag hint is white on red.
- Evidence: `results/r2_phone_dark.log`, `shots/r2_dark_*.png`.

**Theme reset:** at the end of the dark run I set the theme back to Light. A fresh owner session still came up **Dark**: the setting is kept per user on the server, and my reset hadn't been saved. I set it back to Light again and confirmed Light in a fresh owner session (`results/r2_theme.log`). breweryMgr was never changed and is Light.

## Access: **pass** (unchanged)

- **bartender1, barMgr, office1:** sent to `/`. Every call returns 403:
  - `GET` schedule;
  - `POST` transfer;
  - `POST` split;
  - `PATCH` vessel (the new picker endpoint);
  - `POST` step.
- **breweryDevice:** "Not available on a shared device … Go to Home", and all of the calls above return 403 (`shots/r2_access_breweryDevice.png`).
- **brewer1** has access: 200, and refused dates or tanks get the 422 messages.
- Evidence: `results/r2_access_perf.log`.

## Performance (spot check)

- `GET /api/production/schedule` for 12 weeks (Oct 15 – Jan 14, about 128 KB), 10 calls: median **105 ms**, max 176 ms. Target under 300 ms: **pass**.
- Split via the API: 112–196 ms. Undo split: 175–184 ms. Target under 500 ms: **pass**.

## Notes

- **Picker consistency (observation, not reported as a gap):** the Add transfer **Into** picker leaves out the current and next tanks. The batch dialog's **Ferment in / Transfer to** and the **Plan batch** tank pickers still list them, and refuse after you pick. That fits the addendum ("follow the N1 rule"), but it's inconsistent.
- **Old API shape:** `PATCH /batches/:id {tank_ids: [...]}` (used by the UI before this build) now returns **200 and silently ignores** the field. The UI uses `PATCH /batches/:id/vessels/:i`. This isn't a user path, but a 200 for a no-op could mislead an old client.
- **Not reproducible:**
  - Once, A's canonical form differed after a split → part edits → Undo split sequence. I re-ran every combination, and each restored A exactly (`results/r2_diffA*.log`). The likely cause is a P-number shift from my own plan probes; the brief allows P-numbers to shift.
  - Part 2's bar not opening (as in recheck 1) was my click, not the app: with the bar scrolled into view, it opened every time.
- **Brew-day check-off on T:** I checked it off as #44 twice, to test N2 on each part, and un-checked it each time in the same script. `next_batch_number` is 44 before and after.
- **No automated suite** was running, per RECHECK2.md.
- **Seed:** Fest #37 (525), Fest #38 (521), Altruism #39 (526), #39.1 (527), #39.2 (528), Altruism P1 (523) and P4 (304), and the Serving 3 / Serving 4 marks are unchanged step by step (ids, dates, done dates, tanks). I never sent a write to a seed id or a seed tank.
- **Credentials:** no prompts.

## Data created and cleaned up (by recorded id; ledger `results/r2_created.json`)

| Kind | Ids | Cleanup |
|---|---|---|
| Brands | 380 `[TEST-TEMP] QA R2 Lager`, 381 `[TEST-TEMP] QA R2 Pils`, 382 `[TEST-TEMP] QA R2 Unassigned` | deleted (204) |
| Tanks | 637–642 `[TEST-TEMP] Q1SA`…`Q1SF`, 643–644 `Q1SG`, `Q1SH` | retired (`DELETE` 200) |
| Templates | 273 (copy of seed 246), 274 and 275 (copies of seed 248) | retired (`DELETE` 200) |
| Batches | 609 (A), 610 (L), 611 (T), 652 (Unassigned test) | deleted (200), with no done steps left |
| Plan probes | 612–614, 641 | deleted at once, or removed by Undo |
| Split parts | 615–640, 642–651 (ids from the ledger) | removed by Undo split or snackbar Undo during the session |
| Added steps / ramps / transfers / tank changes | many | removed by undo token or by id during the session, each checked against the batch's earlier state |

After cleanup: no batches remain for my brands, none of my tanks is active, there are no marks on my tanks, and owner's theme is Light (`results/r2_cleanup.log`, `results/r2_unassigned.log`, `results/r2_theme.log`).
