# D48 QA recheck 3: fix cycle 3 (DEV)

- **Build:** D48 at `f255419`, as stated in RECHECK3.md, from https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev. DEV has no version endpoint, so I couldn't confirm the build myself. Prod was not touched.
- **Tester:** fresh, independent QA (Claude), 2026-10-22 (America/Denver). Headless Chromium + Playwright, timezone America/Denver. One browser per script (two-user checks used two contexts in that one browser), closed at the end of each.
- **Personas:** loaded from `auth/*.json` with `storageState`. I never opened the auth files. API calls were made from inside the page, and no token was returned.
  - A grep of `results/r3_*` for `ses_`, `dev_` and `Bearer` finds nothing. In `scripts/r3_*`, the only matches are the redaction code in `r3_lib.mjs`.
  - Two-user checks used **owner** and **breweryMgr**.
- **Data:** I used only my own `[TEST-TEMP]` data (ledger: `results/r3_created.json`), and all of it is cleaned up (see the end). The seed was only read, and all 15 seed batches and the Serving 3 / Serving 4 marks are unchanged compared with my opening snapshot.
- **Scripts:** `scripts/r3_*.mjs`. **Logs:** `results/r3_*.log`. **Screenshots:** `shots/r3_*.png`.

My batches (my tanks Q1TA–Q1TF are tank ids 855–860; note that batch ids 857/858 happen to match two tank ids):
- **A** (batch 857): Standard ale copy, brew day Thu Nov 12 in Q1TA, Package (exit) Mon Dec 7.
- **L** (batch 858): Lager-with-transfer copy, brew day Fri Nov 13 in Q1TB, template transfer into Q1TC on Fri Dec 18, Package Wed Dec 23.

## Summary

R2, R3 and R4 are **fixed** as described. R1 is fixed for six of the seven kinds that RECHECK3 lists, but **not for Undo split**. The N1 spot checks and all 12 first-pass items hold, and access is unchanged.

I found **2 new must-fix** and **3 new minor** gaps. Both must-fix gaps are about **split batches**, which the N1 rule doesn't yet cover from every direction.

| # | Item | Result |
|---|---|---|
| R1 | A vessel-touching Undo after another user changed the batch | **Fixed** for tank change, add transfer, remove transfer, template change, split, Plan batch and delete: refused with 409 `undo_stale`, and a plain Undo still works. **Not fixed for Undo split:** see **X1 (must-fix)** |
| R2 | Stale refusals in the dialogs | **Fixed** in Add step, Add a ramp, Change ramp, Add transfer / filter, Split, Plan batch and the batch dialog |
| R3 | A nothing-stays split depended on part order | **Fixed** for the rule and the message ("Part 1: The beer goes into … next, on …"). Minor **X4:** part 1's picker still offers the next tank |
| R4 | Move only could reorder transfers, with a misleading flag | **Fixed:** `transfer_order` flag after Move only, Shift-drag and a multi-select move; clears when fixed; sign-off works; real dirty fills still get `dirty_fill` |
| N1 spot | Add transfer (and through Add step), Remove transfer A→B→A, bar drag | **Holds** on all three routes. But see **X2 (must-fix)**: the tank pickers on a **split** parent or part skip the rule |
| 1–12 | First-pass items at their boundaries | **All hold** |
| Access | bartender1, barMgr, office1, breweryDevice | **Unchanged (pass)** |

### New gaps

| # | Severity | Gap |
|---|---|---|
| X1 | **must-fix** | **Undo of an Undo split** isn't stale-checked or checked against N1. After another user moves the parent into part 2's tank, Undo re-creates a split from **Q1TD into Q1TD** with no flag |
| X2 | **must-fix** | The **Ferment in** picker on a **split parent**, and the tank picker on a **part**, accept any tank: parent → part 2's tank (split Q1TD → Q1TD), or part 2 → the tank part 1 stays in (two parts in Q1TA). No flag |
| X3 | minor | **Undo split** (the button) doesn't restore the batch exactly: FDH is re-linked after PDH instead of Brew day, and when the staying part is part 2, the later transfer's tank is silently dropped to Unassigned |
| X4 | minor | R3: part 1's tank picker still offers the template transfer's destination when no part stays, and nothing warns before **Split** |
| X5 | minor | After a refused Undo ("Something changed since. Nothing was undone."), the Gantt and the open batch dialog keep showing the old tanks until a reload |

---

## Recheck-2 items

### R1. Undo after another user changed the batch: **fixed except Undo split** (see X1)

**Method:** for each kind, owner makes a change. breweryMgr then changes a vessel of the same batch (API from their own page), and owner sends their Undo. After a refusal, I had breweryMgr undo their own change, and then tried owner's Undo again. Each kind was also run with no interference. Every row ended with the batch identical to how it started.

| Kind | Interference by breweryMgr | Owner's Undo | After the interference was undone | No interference |
|---|---|---|---|---|
| Tank change (L: Transfer to → Q1TD) | Ferment in → Q1TC | **409** "Something changed since. Nothing was undone." | 200, L back to `[Q1TB, Q1TC]` | 200 |
| Tank change, same user (old R1 API repro): v1 → Q1TD, then v0 → Q1TC, then Undo the **first** | (owner's own second change) | **409** | Undo second, then first: both 200, restored | — |
| Add transfer (L, Dec 1 into Q1TD) | the new last vessel → Q1TE | **409** | 200, restored | 200 |
| Add filter (L, Dec 1 into Q1TD) | v0 → Q1TF | **409** | 200 | — |
| Remove transfer (L's Dec 18 transfer) | v0 → Q1TC (the tank the removed transfer went into) | **409** | 200, `[Q1TB, Q1TC]` | 200 |
| Template change (A → Lager w transfer) | v1 → Q1TE | **409** | 200 | 200 |
| Template change | v0 Q1TA → Q1TB | **409** | 200 | — |
| Split (A, stays + Q1TD) | part 2 → Q1TE | **409** | 200, parts gone | 200 |
| Split | adds a transfer on part 1 | **409** | 200 | — |
| **Undo split** (DELETE `/split`, then Undo of that) | parent v0 → Q1TE or Q1TD | **200, re-split. See X1** | — | 200 |
| Undo split | adds a transfer on the merged batch | **409** (correct) | — | — |
| Plan batch (`[Q1TE, Q1TF]`) | v1 → Q1TD | **409** | 200, batch removed | 200, batch removed |
| Delete (planned probe) | (the deleted batch can't be changed) breweryMgr plans another batch into the same tanks | 200, same id back, identical | — | 200, identical |

**Not over-eager:**
- Undo on L after breweryMgr changed a **different** batch (A) → 200.
- Undo on L after breweryMgr moved a step (Diacetyl test) without touching a vessel → 200, and only owner's change was reverted.

**UI (original R1 repro):**
- **Path:** Owner opens L → Transfer to = Q1TD ("… (after transfer) → [TEST-TEMP] Q1TD." with Undo). breweryMgr sets Ferment in = Q1TC. Owner clicks **Undo**.
- **Result:** the snackbar reads "Something changed since. Nothing was undone." (`shots/r3_r1_ui_stale_refused.png`), and L stays `[Q1TC, Q1TD]`. With no interference, the same UI path gives "Undone." and L comes back identical.
- See X5 about the stale view.

Evidence: `results/r3_r1_api.log`, `results/r3_r1_ui.log`.

### R2. Stale refusals: **fixed**

In each dialog I caused a refused save, then changed one input, and checked the dialog *before* saving again. In every case below the refusal **cleared**:

| Dialog | Refusal | Change that cleared it |
|---|---|---|
| Add step | Dec 8 (after exit) "The beer isn't in that tank on that day." | the day (→ Dec 7); separately, only the detail text |
| Add step | (same) | closing and reopening the dialog |
| Add a ramp | first day Dec 6 (runs past the exit) | the first day (→ Dec 5); separately, only the target (→ 50°) |
| Change ramp | 58° → 32° at 2°/day | the rate (→ 4); separately, only the target |
| Add transfer / filter | Dec 17 into Q1TB: "The beer is already in [TEST-TEMP] Q1TB." | the Into tank (→ Q1TD) |
| Split | brew day: "The split has to be after brew day." | the day |
| Plan batch | Q1TE + Q1TE: "The beer goes into [TEST-TEMP] Q1TE next, on Thu Dec 31." | the second tank; separately, only the volume |
| Batch dialog banner | Ferment in = Q1TC: "The beer goes into [TEST-TEMP] Q1TC next, on Fri Dec 18." | opening Add transfer / filter (and closing it); opening Add step; a new picker change (Transfer to = Q1TD, saved); closing and reopening |

- **Saves and Undo:** each corrected input saved, and each snackbar Undo restored the batch exactly. That covers Add step (Fining), the ramp, Change ramp (32° at 4°/day), the transfer into Q1TD, and the Transfer to change.
- **Borderline:** clicking a step's **+ Note** inside the batch dialog does *not* clear the banner. I don't count it as a gap, since a note doesn't change a tank.
- **Cosmetic:** after a refused Add in Add transfer / filter, the same message shows twice, once in the preview and once in the banner.

Evidence: `results/r3_r2_ui.log` holds the rerun from Change ramp on. The first run's log lines for Add step and Add a ramp were overwritten by that rerun and are summarized here; their screenshots remain (`shots/r3_r2_addstep_after_day_change.png`, `shots/r3_r2_ramp_after_day_change.png`). Other screenshots: `shots/r3_r2_*.png`.

### R3. A nothing-stays split and part order: **fixed** (see X4 for the picker)

**API** (L, split on Dec 1):

| Parts | Result |
|---|---|
| `[Q1TC, Q1TD]` | 422 "**Part 1:** The beer goes into [TEST-TEMP] Q1TC next, on Fri Dec 18." |
| `[Q1TD, Q1TC]` | 201: part 1 `[Q1TD, Q1TC]`, part 2 `[Q1TC, Unassigned]` |
| `[Q1TC, Q1TE, Q1TD]` | 422 "Part 1: …" |
| `[Q1TD, Q1TE, Q1TC]` | 201: part 3 gets Unassigned |
| `[(stays), Q1TC]` | 201 |
| `[Q1TC, (stays)]` | 201: part 1 `[Q1TC, Unassigned]`, part 2 (stays) `[Q1TB, Q1TC]` |
| `[Q1TD, Q1TB]` / `[Q1TB, Q1TD]` | 422 "The beer is already in [TEST-TEMP] Q1TB." |
| `[Q1TC, Q1TC]` | 422 "Two parts can’t go into the same tank." |

**UI:**
- Split dialog with part 1 = Q1TC and part 2 = Q1TD → Split → "Part 1: The beer goes into [TEST-TEMP] Q1TC next, on Fri Dec 18." (`shots/r3_r3_split_dialog.png`, and the phone view in `shots/r3_phone_split_part1_refused.png`).
- Swapping the two parts clears the message and saves. Snackbar Undo removes the parts and restores L exactly.

Evidence: `results/r3_r3.log`, `results/r3_r3_ui.log`.

### R4. The `transfer_order` flag: **fixed**

**Setup:** L with an added transfer on Dec 20 back into Q1TB (`[Q1TB, Q1TC, Q1TB]`). In date order there's no flag.

**The flag appears after each of these moves:**

| Move | Flag |
|---|---|
| API Move only: Dec 20 transfer −3 | `transfer_order`: "[TEST-TEMP] QA R3 Lager P7's transfers are out of order: on Thu Dec 17 the beer goes into [TEST-TEMP] Q1TB, which it's already in." Plus the usual D47 `out_of_order` for its link. **No `dirty_fill`** |
| API Move only: Dec 18 transfer +3 | "… on Sun Dec 20 the beer goes into [TEST-TEMP] Q1TB, which it's already in." |
| API Move only onto the same day (Dec 18) | "… on Fri Dec 18 the beer goes into [TEST-TEMP] Q1TB, before [TEST-TEMP] Q1TC that day." |
| API multi-step Move only (transfer + Carb) | `transfer_order` |
| Move all of the later transfer −3 | `transfer_order`. This is correct: the earlier transfer doesn't follow it, so the order really is wrong |
| **UI drag → Move only Transfer** | The prompt warns "Some of them would then come before the step they follow. They’ll be flagged." → `transfer_order` (`shots/r3_r4_after_move_only.png`) |
| **UI Shift-drag** | No prompt; "Transfer moved 3 days earlier (only this step)." → `transfer_order` (`shots/r3_r4_after_shift_drag.png`) |
| **UI multi-select** (Ctrl-click transfer + Package, drag, Move only 2 steps) | `transfer_order` (plus `out_of_order` for Package) |

**The flag clears when the order is fixed:**
- moving the transfer back (API, and a UI drag +3 with Move only);
- the snackbar Undo after each UI move;
- the undo token after each API move.

Undoing the "move back" brings the flag back.

**Sign-off:**
- In the flags list, **Mark OK** on the `transfer_order` row signs it off: "Signed off by Olivia Owner · Thu, Oct 22" (`shots/r3_r4_signed_off.png`).
- When the order was fixed, the flag disappeared. When the same order was re-created, it came back **still signed off**. Its key and signature were unchanged, and the message was identical, which follows the D47 signature rule.
- **Remove sign-off** works (`DELETE /flags/signoff/<key>`).
- **Note:** Mark OK signs off on the first click (the note field sits next to it). My script's second click signed off my own batch's `out_of_order` flag too. I removed both sign-offs (`results/r3_unsign.log`).

**Real dirty fills still get `dirty_fill`:** moving Q1TB's Dec 18 exit CIP to Dec 21 (Move only) gives "[TEST-TEMP] QA R3 Lager P7 (after transfer 2) fills [TEST-TEMP] Q1TB before it's cleaned after …", with no `transfer_order` flag. Undo restored it.

Evidence: `results/r3_r4_api.log`, `results/r3_r4_ui.log`, `results/r3_r4_ui2.log`, `shots/r3_r4_*.png`.

---

## Spot checks

### N1 on three routes: **holds**

**1. Add transfer / filter** (L; API, picker and preview):

| Transfer | Result |
|---|---|
| Dec 17 into Q1TC, as a Transfer or a Filter, and Nov 20 into Q1TC | 422 "The beer goes into [TEST-TEMP] Q1TC next, on Fri Dec 18." |
| Dec 17 into Q1TB | "The beer is already in [TEST-TEMP] Q1TB." |
| Dec 20 into Q1TC | "The beer is already in [TEST-TEMP] Q1TC." |
| Dec 17 into Q1TD | 201 (undone, restored) |
| Dec 20 into Q1TB (A → B → A) | 201 (undone, restored) |
| Through Add step (type Transfer, Q1TC, Dec 17) | the same 422 |

- **Into picker:** on Dec 17 it leaves out Q1TB and Q1TC; on Dec 20 it offers Q1TB and leaves out Q1TC.
- **Preview:** with Q1TB picked, changing the day to Dec 17 shows "The beer is already in [TEST-TEMP] Q1TB." before saving.

**2. Remove transfer** (A → B → A becoming A → A): L is `[Q1TB, Q1TC, Q1TB]`. Removing the Dec 18 transfer → 422 "The beer goes into [TEST-TEMP] Q1TB next, on Sun Dec 20.", and L is unchanged.

**3. Bar drag** (L's first bar onto Q1TC's row):
- The hint reads "→ [TEST-TEMP] Q1TC · the beer goes into [TEST-TEMP] Q1TC next, on Fri Dec 18" (`shots/r3_n1_drag_hint.png`).
- On the drop, the snackbar shows the same message, and L is unchanged.

Evidence: `results/r3_spot_api.log`, `results/r3_spot_ui.log`.

### First-pass items: **all hold**

| # | Check | Result |
|---|---|---|
| 1 | Transfer on A's fill day (Nov 12) / fill + 1 | 422 `before_fill` / 201 (undone) |
| 2 | Delete a split parent / a part; delete an unsplit batch, then Undo | 422 "Undo the split first." / 422 "That's a part of a split. …"; delete A → 200, then Undo → same id, identical; reusing the token → 404 |
| 3 | Transfer into the current tank | 422 "The beer is already in [TEST-TEMP] Q1TA." |
| 4 | Add step on Nov 11 / Nov 12 (brew day) | 422 "A step can't come before brew day." / 201 |
| 5 | Transfer on the exit day (Dec 7) / Dec 6 | 422 `after_exit` / 201 |
| 6 | Split parent volume; part volume | both 422 "Undo the split first."; the part dialog's Volume is read-only |
| 7 | Template change with an added transfer (UI, double-click) | One PATCH. "[TEST-TEMP] QA R3 Standard ale → [TEST-TEMP] QA R3 Lager w transfer. Dropped the added transfer into [TEST-TEMP] Q1TD." Double-clicking the snackbar **Undo** sent **one** undo request |
| 8 | Planned part dialog | "P6.2 · the real number is set when the parent’s brew day is checked off"; no Delete |
| 9 | Zoom tooltip | "Weeks on screen"; Add process opens on the first click while the tooltip shows |
| 10 | Multi-batch drag (A FDH + L Set temp 65°) | "2 batches · 2 steps moved 2 days later", with the following steps grouped under P6 and P7. "… with 19 following steps."; Undo restored both |
| 11 | Keyboard | Ctrl+Space → "1 step selected" with no dialog; Escape clears it |
| 12 | Split on brew day / exit day / brew + 1 | "The split has to be after brew day." / "The beer isn't in that tank on that day." / 201 (undone) |

Evidence: `results/r3_spot_api.log`, `results/r3_spot_ui.log`, `results/r3_spot_ui2.log`, `shots/r3_10_multi_batch_prompt.png`.

---

## New gaps

### X1 (must-fix). Undo of an Undo split isn't stale-checked, and can create a split into the tank the beer is in

- **Path:**
  1. Owner splits a planned batch (stays + Q1TD) → **Undo split** → confirms ("Split undone: … is one batch again, with part 1’s schedule." with **Undo**).
  2. breweryMgr opens the merged batch and sets **Ferment in = Q1TD** (allowed, because it isn't split now).
  3. Owner clicks **Undo** on their snackbar.
- **Expected:** RECHECK3 says the stale check covers "undo split", so this should be 409 "Something changed since. Nothing was undone.". Failing that, the N1 check on the restored result should refuse it, as a direct split does.
- **Observed:**
  - **200.** The split is re-created as parent **`[Q1TD]`** → part 2 **`[Q1TD]`** (split "into" the tank the beer is already in), and part 1 ("stays here") is in **Q1TF**, the parent's old tank.
  - For comparison, a direct split into Q1TD at that moment → 422 `same_tank` "The beer is already in [TEST-TEMP] Q1TD."
  - **No flag** for the batch or the tanks.
  - With breweryMgr moving the parent to an unused tank (Q1TE), Undo also re-splits: the parent is in Q1TE, and the "staying" part is in Q1TF.
  - The stale check *does* fire when breweryMgr adds a transfer to the merged batch instead (409). So it's the vessel-tank change that isn't seen for this kind.
- **Repro (API, exactly what the snackbar Undo sends):**
  1. `POST /batches/:id/split` (stays + Q1TD).
  2. `DELETE /batches/:id/split` → keep its `undo_token`.
  3. As another user, `PATCH /batches/:id/vessels/0 {tank_id: Q1TD}`.
  4. `POST /undo/<token>` → 200.
- **UI:** the split → Undo split → snackbar Undo path goes through `POST /undo/<token>` and re-splits (`results/r3_parent_tank_ui.log`, last section). I made the second user's change through the API.
- **Evidence:** `results/r3_r1_case6.log`, `results/r3_r1_case6b.log`, `results/r3_r1_api.log` (case 6).
- I undid the re-split and deleted the probes in the same scripts.

### X2 (must-fix). Tank pickers on a split parent or part skip the N1 / "same tank" rules

- **Path:**
  1. Split A (Q1TA) on Nov 20: "(stays here)" 12 bbl + Q1TD 8 bbl.
  2. Open the **parent** (P6) → **Ferment in = Q1TD**.
  3. Separately, open **part 2** (P6.2) → its tank = **Q1TA**.
- **Expected:** One of these:
  - the parent's tank is locked while split, like its volume, template, brand and Delete ("Undo the split first");
  - or the change is checked like a split: "The beer is already in Q1TD." / "Two parts can’t go into the same tank."
- **Observed:**
  - **Parent → Q1TD:** saves with the snackbar "[TEST-TEMP] QA R3 Lager P6 → [TEST-TEMP] Q1TD." and Undo.
    - The parent's brew-day-to-split stretch is now in Q1TD, and part 2 is "split" from Q1TD into Q1TD.
    - Part 1 "stays here" but sits in Q1TA, where no beer was before.
    - The Gantt shows the gold split arrow going *up* from Q1TD to Q1TA (`shots/r3_gap_parent_picker_gantt.png`, `shots/r3_gap_parent_picker_dialog.png`).
    - The parent's picker lists every tank. Its Volume field reads "Undo the split first to change it", but Ferment in is editable.
  - **Part 2 → Q1TA:** saves ("… P6.2 → [TEST-TEMP] Q1TA."). Both parts are now in Q1TA, which the split dialog refuses as "Two parts can’t go into the same tank." (`shots/r3_gap_part2_picker_dialog.png`).
  - **Also accepted:** the parent → an unused tank or Unassigned, and part 1 ("stays") → another tank. All return 200 through `PATCH /batches/:id/vessels/0`.
  - **No flags** in any of these cases.
- **Repro:** As in the path, on any planned split batch.
- **Evidence:** `results/r3_parent_tank.log` (API), `results/r3_parent_tank_ui.log` (UI). Each change was undone.
- **Note:** X1's interference step used this route on an unsplit batch, which is legitimate. X2 is the same picker while the batch is split.

### X3 (minor). Undo split (the button) doesn't put the batch back exactly

- **Path:** Split a batch → open the parent → **Undo split** → confirm.
- **Expected:** The batch is as it was before the split. The snackbar Undo of the split already does this.
- **Observed:**
  - **(a) Links drift.** Before the split, FDH "comes after" **Brew day**. After Split → Undo split, FDH comes after **PDH** (the step that led into the Split). Moving PDH now offers to move FDH, and the batch no longer matches its template's links. This reproduced on a fresh probe batch. The split's own undo token restored the links exactly.
  - **(b) The later tank is dropped.** On L, a split where part 2 stays (`[Q1TC, (stays)]` or `[Q1TD, (stays)]`) → Undo split → L becomes **`[Q1TB, Unassigned]`**. The template transfer loses Q1TC, because part 1's copy of it was Unassigned. The confirm does say "with part 1’s schedule", but neither the confirm nor the snackbar ("Split undone: … is one batch again, with part 1’s schedule.") mentions the lost tank. The snackbar Undo of the split restores L exactly.
- **Evidence:**
  - (a) `results/r3_r1_case6.log` ("identical to before split: false", with the links before and after).
  - (b) `results/r3_merge_tank.log`, `results/r3_r3.log` ("L restored false" after the `[TC, stays]` case).

### X4 (minor). R3: part 1's picker still offers the next tank

- **Path:** L → Split… → Day Dec 1 → part 2 = Q1TD → open part 1's tank picker.
- **Expected:** RECHECK3: "Part 1's tank picker leaves out the next tank in that case."
- **Observed:**
  - Part 1 offers "[TEST-TEMP] Q1TC · 20 bbl", the template transfer's destination, both before and after part 2 is set to Q1TD.
  - Nothing warns before **Split**.
  - The refusal after Split is correct and names part 1.
- **Evidence:** `results/r3_r3_ui.log` ("part 2 = Q1TD; part 1 options now [… Q1TC …]").

### X5 (minor). A refused Undo leaves the screen showing the old state

- **Path:** Owner changes L's Transfer to = Q1TD in the batch dialog. breweryMgr sets Ferment in = Q1TC. Owner clicks **Undo**.
- **Expected:** With "Something changed since. Nothing was undone.", the screen shows what changed, so the user can see why.
- **Observed:**
  - The open dialog still shows **Ferment in = Q1TB**, and so does a reopened dialog.
  - The Gantt still draws L's first bar on Q1TB's row, while the server has Q1TC.
  - Only a page reload shows Q1TC.
  - A user acting on what they see would make the next change against the wrong state, although the N1 checks would catch a same-tank result.
- **Evidence:** `results/r3_stale_view.log`, `results/r3_r1_ui.log`.

---

## Phone width and dark mode

**Phone (412×915, touch, Light):** no horizontal overflow and nothing off screen (the dialog paper spans 32–380 px). I checked:
- the batch dialog and its picker refusal;
- the Add transfer / filter preview refusal;
- the Split "Part 1: …" refusal (`shots/r3_phone_split_part1_refused.png`);
- Add step refused, and then cleared;
- the stale-Undo snackbar (8–404 px);
- the flags list with the `transfer_order` row.

Banners are dark red on light red (`rgb(95,33,32)` on `rgb(253,237,237)`). Evidence: `results/r3_phone.log`, `shots/r3_phone_*.png`.

**Dark (desktop, in-app Theme → Dark):** the same dialogs, with no overflow.
- Banners are `rgb(244,199,199)` on `rgb(22,11,11)`.
- The transfer preview's red is `rgb(244,67,54)` on `rgb(31,36,30)`.
- The flags list is readable, including the `transfer_order` row (`shots/r3_dark_flags_list.png`).

Evidence: `results/r3_dark.log`, `shots/r3_dark_*.png`.

**Theme:** I set owner back to Light at the end of the dark run. A fresh owner session then came up **Light** (`localStorage` "light", light background) before any click. breweryMgr is also Light (`results/r3_theme.log`).

## Access: **pass** (unchanged)

- **bartender1, barMgr, office1:** sent to `/`. Every call returns 403: `GET` schedule, `POST` transfer, `POST` split, `PATCH` vessel, `POST` step, `POST` undo and `POST` flags/signoff.
- **breweryDevice:** "Not available on a shared device … Go to Home" (`shots/r3_access_breweryDevice.png`), and all the same calls return 403.
- **brewer1** has access: `GET` 200, and the refused writes get their 422 messages (for example, "The beer goes into [TEST-TEMP] Q1TC next, on Fri Dec 18.").
- Evidence: `results/r3_access.log`.

## Performance (spot check)

- `GET /api/production/schedule` for 12 weeks (Oct 15 – Jan 14), 10 calls: median **57 ms**, max 80 ms. Target under 300 ms: **pass**.
- Split via the API: 63–67 ms. Its Undo: 90–95 ms. Target under 500 ms: **pass**.
- Evidence: `results/r3_spot_api.log`.

## Notes

- **No automated suite** was running, per RECHECK3.md.
- **Seed:** all 15 non-test batches, including Fest #37, Fest #38, Altruism #39, #39.1 and #39.2, are unchanged step by step (ids, dates, done dates, tanks), as are the Serving 3 / Serving 4 marks. I never sent a write to a seed id or a seed tank. `next_batch_number` is 44 before and after; I didn't check off any brew day.
- **Sign-offs:** the only sign-offs I made were on my own batch's flags, and I removed both.
- **Rule 1:** `node_modules` here is a symlink to the d45 folder, so Playwright stack traces show paths under `~/src/rockcut/…`. I never opened anything there.
- **Credentials:** no prompts.

## Data created and cleaned up (by recorded id; ledger `results/r3_created.json`)

| Kind | Ids | Cleanup |
|---|---|---|
| Brands | 517 `[TEST-TEMP] QA R3 Lager`, 518 `[TEST-TEMP] QA R3 Pils` | deleted (204) |
| Tanks | 855–860 `[TEST-TEMP] Q1TA`…`Q1TF` | retired (`DELETE` 200) |
| Templates | 333 (copy of seed 306), 334 (copy of seed 308) | retired (`retired_at` set) |
| Batches | 857 (A), 858 (L) | deleted (200) at the end, with no done steps |
| Probe batches | 869–872 (Plan batch / delete probes), 873 and 882 (Undo-split probes) | deleted or removed by Undo in their scripts |
| Split parts | the other ledger ids from 859 to 933 | removed by Undo split or the undo token in the same scripts |
| Added steps / transfers / tank changes / moves | many | removed by undo token or by id in the same script, each checked against the batch's earlier state |
| Flag sign-offs | `transfer_order:12626:12650`, `out_of_order:11681` | removed with Remove sign-off |

After cleanup:
- no batches remain for my brands or from my ledger;
- none of my tanks is active, and there are no marks on them;
- no flags name my batches or tanks;
- owner's theme is Light.

Evidence: `results/r3_cleanup.log`, `results/r3_tplcheck.log`.
