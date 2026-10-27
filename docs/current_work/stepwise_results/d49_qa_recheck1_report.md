# D49 QA recheck 1 (DEV, fix cycle 1)

- **Build:** D49 fix cycle 1 at `fe26ae3` (DEV API v61 / UI v64), as stated in RECHECK1.md. DEV has no version endpoint, so I couldn't confirm the build myself.
- **Environment:** https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev. I didn't touch prod.
- **Tester:** Claude (independent QA agent), run for matthewheiser@gmail.com
- **Date:** 2026-10-27 (America/Denver; DEV "today" = Tue Oct 27 2026)
- **Method:** Playwright Chromium, one browser at a time (two contexts for the owner + breweryMgr runs). Logins came from `auth/<persona>.json`, which I passed by path as storageState and never opened. Most steps went through the UI. API probes ran from inside the logged-in page by rerouting one of the app's own requests, so the auth header was never read or printed. No screenshot shows a token.
- **Personas used:** `owner`, `breweryMgr`, `brewer1`, `brewer2`, `breweryDevice` (1280×800, touch).

## Summary

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Gap 1 (must-fix): BB2 retried Undo | ✅ **fixed** | The repro now works: refused with the rule (422 `part_exit_done`), then after breweryMgr's **Mark not done**, the same Undo gives "Undone." (200). Every part date goes back to the original plan. Variants pass: "move only", a follower moved by hand (stays where it was put), and a 90 s wait between the refusal and the retry. |
| 2 | Gap 2 (must-fix): dirty flags after a same-day CIP | ✅ **fixed** | CIP & Sanitize (Already done) today + Mark Dirty today + fill next week → "fills … which was marked dirty on Oct 27" and "… was marked dirty and has no CIP planned". These match the status "Empty · dirty 0 days · no CIP planned". Variants pass (see below). |
| 3 | Gap 3: Dashboard Today's tasks | ✅ **fixed** | Show planned batches on: the planned brew day is listed with the **Planned batch** pill. Off: it's hidden, and still hidden after a reload. |
| 4 | Gap 4: Undo snackbar | 🟡 **partly fixed** | Fixed: it no longer covers the dialog's buttons (now top-centre). It disappears when the 2-minute token expires (hovered, it lasted until about 2:00, then went away). It's outside the aria-hidden root with `role="alert"`, so screen readers get it. **Not fixed:** a keyboard user can't reach Undo while a dialog is open (new gap A). |
| 5 | Gap 5: tablet linked-task popover notes | ✅ **fixed** | breweryDevice 1280×800 touch: the popover shows the notes ("[TEST-TEMP] tablet note: check the hop bag") above "Do this on the production schedule." |
| 6 | Gap 8: phase marker on the task list | ✅ **fixed** | `PATCH` on marker steps (Lag and Fermentation on a brewed batch, Lag on a planned batch), `PATCH` on a template marker entry (full body and flag only) and `POST` of a new template phase start, all with `on_task_list: true`, return **422** `marker_task_list`, "A phase marker can't go on the Brewery task list." Nothing was stored. The template entry dialog still saves a marker (200), and so does Add phase start (201). |
| 7 | Notification preferences | ✅ **fixed** | Fast In-app off → Push off: both stay off after a reload, and other events' settings are kept. The switches are disabled until the prefs load, and the second PUT waits for the first and carries both changes. brewer1 was restored to its starting `{}`. |

**New gaps:** 1 minor (A) and 2 minor observations (B, C). No must-fix.

---

## Retests in detail

### 1. Gap 1: BB2 retried Undo (fixed)
Setup (owner): `[TEST-TEMP] RCbrew` batch in `[TEST-TEMP] R1A`, brewed Oct 20 (#44). Split on Oct 29, part 1 stays in R1A and part 2 goes to `[TEST-TEMP] R1B`. Part 2's Package is planned Nov 14.

QA's repro, run as one timed script (UI throughout, owner and breweryMgr side by side):

| t | Who | Action | Result |
|---|---|---|---|
| 3 s | owner | Gantt → Split - Transfer → Check off (today, 2 days early) | Snackbar "Split - Transfer done, 2 days early. …#44.1 and …#44.2 moved with it. UNDO". Parts move 2 days earlier (Package → Nov 12). |
| 6 s | breweryMgr | Part 2's Package (Nov 12) → Check off → "Package done 16 days early" → Apply (move all) | Package and its CIP move to Oct 27 |
| 7 s | owner | UNDO | 422 "Mark [TEST-TEMP] RCbrew #44.2: Package not done first." UNDO stays. ✔ |
| 10 s | breweryMgr | Package → **Mark not done** | Package **and the CIP that moved with it** go back to Nov 12 |
| 11 s | owner | same UNDO | **"Undone."** (200) |

Afterwards every step on #44, #44.1 and #44.2 was on its original planned date (Split Oct 29, FDH Nov 2 … Package/CIP Nov 14).

Variants:
- **Move only:** the Package check-off with "Move only Package" moves just the Package to today. Mark not done puts it back on Nov 12, and the retried Undo works ("Undone.").
- **Follower moved by hand after the check-off:** Package checked off (move all), so it and its CIP go to Oct 27. Then the CIP is moved by hand to Oct 30 (`steps/move`, days 3). Mark not done on the Package puts the Package back on **Nov 12**, and the CIP **stays on Oct 30**. ✔ Later, owner Mark not done on the Split also left that CIP on Oct 30 while the rest of the part moved back.
- **Board path:** on the Brewery board, Mark not done on a late FDH that had moved to today put it back on its planned Oct 22. ✔
- **Mark not done on the Split itself** (owner, after its token expired): the Split goes back to Oct 29, and both parts get all their dates back.
- **Long wait (BB1):** after the refusal I waited 97 s. The UNDO button stayed the whole time, and the retry at 102 s worked.

Screenshots: `r1_bb2_undo_refused.png`, `r1_bb2_undo_worked.png`, `r1v_moveonly_refused.png`, `r1v_moveonly_worked.png`, `r1v_hand_after.png`, `bb1_refused_long.png`, `bb1_after_wait.png`, `bb1_long_retry.png`.

### 2. Gap 2: dirty flags after a same-day CIP (fixed)
brewer1, all through the UI:

| Tank | Steps | Status | Flags |
|---|---|---|---|
| `[TEST-TEMP] R2` | CIP & Sanitize today (Already done) → Mark… Dirty today → plan a fill Nov 3 | Empty · dirty 0 days · no CIP planned | `dirty_fill` "…P4 fills [TEST-TEMP] R2, which was marked dirty on Oct 27."; `dirty_no_cip` "…was marked dirty and has no CIP planned." ✔ |
| `[TEST-TEMP] R3` (reverse order) | Mark Dirty today → CIP & Sanitize today (Already done) → fill Nov 4 | Sani 0 days | none ✔ |
| `[TEST-TEMP] R4` | Dirty Oct 26 → CIP - no sani today (Already done) → Dirty today → fill Nov 4 | Empty · dirty 0 days · no CIP planned | `dirty_fill` + `dirty_no_cip` ✔ |
| `[TEST-TEMP] S2` (CIP checked off as a task, not "Already done") | CIP & Sanitize task today → Check off → Mark Dirty today | Empty · dirty 0 days · no CIP planned | `dirty_no_cip` ✔ |

In every case the status and the flags agree. Screenshot: `r2_after_fill.png`.

### 3. Gap 3: Dashboard Today's tasks (fixed)
brewer1, with a planned batch "[TEST-TEMP] S1 · [TEST-TEMP] RCbrew P1 · Brew day" due today:
- Show planned batches **on**: the Dashboard lists it with the **Planned batch** pill (`r3_dash_on.png`).
- Turned **off** on the board (`PUT /api/me/show_planned_batches false`) → Dashboard: it's gone. The rest of the list is unchanged, and it's still gone after a reload (`r3_dash_off.png`).
- I turned the setting back on afterwards.

### 4. Gap 4: Undo snackbar (partly fixed)
brewer1, 1440×900, pencilled `[TEST-TEMP] RCbrew X2` → batch dialog → **Schedule this batch**, then **Pencil in**:
- **Covering buttons: fixed.** The snackbar is now at the top centre (y 24–72). "Delete planned batch", "Pencil in" and "Close" (y 824) are all clickable, and `elementFromPoint` hits them (`r4_after_schedule.png`). It now sits over the dialog's title for a few seconds (observation C).
- **Outliving its token: fixed.** After a tank Mark, I kept the pointer on the snackbar (hover pauses auto-hide). UNDO stayed until about 117 s and was gone at 121 s, so it never offered an expired Undo (`r4_hover_end.png`). Without hover it hides after about 6–8 s, inside or outside a dialog. After a **refused** Undo it stayed for the full wait (>97 s), so BB1/BB2 aren't affected.
- **Screen reader: fixed.** The snackbar is now portaled outside `#root` (which is `aria-hidden="true"` while the dialog is open), with no aria-hidden or inert ancestors, and it has `role="alert"`. It is announced.
- **Keyboard: not fixed.** See gap A.

### 5. Gap 5: tablet popover notes (fixed)
breweryDevice, 1280×800, `hasTouch`. Tapping "[TEST-TEMP] R1A · [TEST-TEMP] RCbrew #44 · PDH" (notes set on the step) shows the title, "Tue 10/27 · Anyone", **the notes text**, and "From the production schedule. Do this on the production schedule." Linked cards still have no checkbox (`r5_tab_popover.png`, `r5_tab_board.png`).

### 6. Gap 8: marker on the task list (fixed)
- `PATCH /api/production/steps/{Lag 27921, Fermentation 27922}` (brewed batch) and `{Lag 27954}` (planned batch, with `notes` in the same body) with `on_task_list: true` all returned **422** `{"error":"marker_task_list","message":"A phase marker can't go on the Brewery task list."}`. A re-read showed `on_task_list: false`, and the notes weren't stored either (the whole write was refused).
- Template `[TEST-TEMP] RC template` (a duplicate of the seed Standard ale): `PATCH …/templates/534/steps/3964` (Lag) with the full body + `on_task_list: true` → 422, and with the flag alone → 422. `POST …/templates/534/steps` for a new phase start (Crash) with `on_task_list: true` → 422, nothing created.
- UI: Edit Lag → notes → Save → `PATCH` 200 (`on_task_list: false`). Add phase start (Diacetyl rest, day 15) → `POST` 201. The dialog still saves markers (`r8_marker_entry_dialog.png`).

### 7. Notification preferences (fixed)
Starting state for brewer1: `GET /api/notification_preferences` → `{}` (all defaults).
- **Where it is:** RECHECK1 says account menu → Notification preferences. The account menu only has Profile / Theme / Log out (`r7_account_menu.png`), and Profile has no preferences either. The **Notification preferences** button is in the **Notifications (bell)** panel (`r7_bell.png`). This is a difference from the doc, not a gap.
- **Fast run (real network):** I clicked In-app off and then Push off with no waits. Two PUTs went out (`{"task_shift_end":{"in_app":false}}`, then `{…"in_app":false,"push":false}`), both 200. After a reload, both are off. ✔
- **Clicks before the dialog loads** (GET delayed 2 s with a test route): both switches are **disabled** until the prefs arrive, so the early clicks do nothing and nothing is written. No wipe. ✔ (`r7_race_before_load.png`)
- **Second click while the first PUT is in flight** (first PUT delayed 1.5 s): the second PUT went out only after the first finished, and it carried both changes plus the other events' saved values. Final state: `task_shift_end` in-app/push off, and the earlier non-default `shift_reminder.push = true` and `message_posted.in_app = true` were still there after a reload. ✔ (`r7_inflight_settled.png`)
- **Restored:** `PUT {"prefs":{}}` → `GET` `{}`. The 14 switches match the starting screenshot.

---

## New gaps

| # | Severity | Gap |
|---|---|---|
| A | minor | With a dialog open, a keyboard user can't reach the snackbar's UNDO. |
| B | minor (observation) | The Undo snackbar hides after about 6–8 s, while its token lasts 2 min. |
| C | minor (observation) | The snackbar now covers the dialog's title while it shows. |

### A (minor): keyboard can't reach Undo while a dialog is open
- **Path:** brewer1 → batch dialog → Schedule this batch (or Pencil in), with the dialog still open.
- **Expected (RECHECK1 item 4):** Undo can be reached by keyboard while a dialog is open.
- **Observed:** the dialog's focus trap keeps focus inside it. Sixty Tabs and four Shift+Tabs cycle only through dialog controls (Shift+Tab from the start wraps to "Close"). F6 does nothing, and there's no Ctrl+Z or ⌘Z shortcut (no request sent). The UNDO button has `tabIndex 0` but is outside the trap. With the ~8 s auto-hide (B), a keyboard user has no way to undo from a dialog. Screen readers do announce it (`role="alert"`).
- **Repro:** brewer1, 1440×900 → any pencilled batch → Schedule this batch → press Tab or Shift+Tab repeatedly → focus never lands on UNDO.

### B (minor, observation): the snackbar hides long before its token expires
- Without hover, the Undo snackbar disappears after about 6–8 s (measured after Pencil in inside a dialog and after a tank Mark outside one). The token lasts 2 minutes, so an Undo that's still valid can't be reached once the snackbar is gone. After a refused Undo it does stay (>97 s). I'm noting it because the brief describes "the Undo button stays while its 2-minute token lasts" and because it makes A worse. If ~8 s is the intended design, this is fine.

### C (minor, observation): the snackbar sits over the dialog title
- At 1440×900 the top-centre snackbar (x 369–1071, y 24–72) covers the batch dialog's title ("[TEST-TEMP] RCbrew P11") while it shows (`r4_after_schedule.png`). It's cosmetic and lasts a few seconds.

---

## Regression sweep (short)

| # | Result | Notes |
|---|---|---|
| P90 | ✅ pass | Titles like "[TEST-TEMP] S1 · [TEST-TEMP] RCbrew P1 · Brew day". Planned-batch tasks have `planned: true` and the pill (26 pills on brewer1's board). There are 0 marker tasks (Lag / Fermentation / Conditioning …) across the board (`p90_board.png`). |
| P91 | ✅ pass | Off → 0 pills, still off after a reload, the planned P1 brew day hidden (`p91_off.png`). brewer2: still on, 26 pills. brewer1 turned back on. |
| P92 | ✅ pass | Board drag of "R1A · #44.1 · FDH" Sat 10/31 → Mon 11/2 → prompt "FDH moved 2 days later" with move all / move only → Apply → Gantt shows FDH Nov 2 and the 8 following steps moved. Apply `POST steps/move` took **166 ms** (`p92_prompt.png`). A drop on the empty space below a column's cards didn't register, but a drop onto the cards did. That's normal drop-target behaviour. |
| P93 | ✅ pass | Board checkbox on "R3 · #45 · Set temp - 58°" due today → done, no extra dialog. Tank status "Day 18 · Crash · 58°". |
| P94 | ✅ pass | FDH planned Oct 22, checked off on the board → "FDH done 5 days late … now Tue Oct 27" with the move prompt (`p94_prompt.png`). When the only follower (Set temp - 58°) was already done, it moved to today with no prompt, which is reasonable since there was nothing to move. |
| P95 | ✅ pass | Board checkbox on a planned batch's brew day → "Brew day for [TEST-TEMP] RCbrew P1 · Batch number · Suggested: 46" on the board → Check off (`p95_prompt.png`). |
| P99 | ✅ pass | Board → task → Delete → "Take off the task list … It stays on the production schedule." → Take off (`DELETE /boards/brewery/tasks/…` 200). It's off the board, and the step is still on the Gantt (Wed Oct 28) with `on_task_list: false` (`p99_confirm.png`). |
| P122 | ✅ pass | `[TEST-TEMP] S3` at "Sani 7 days" → Mark… Clean not sanitized, today → "Clean no sani 0 days" in amber (rgb 237,108,2), a marker on Oct 27, snackbar UNDO → back to "Sani 7 days" (`p122_after.png`). |
| P123 | ✅ pass | Fill planned Nov 3 → only "…P5 fills [TEST-TEMP] S3, which isn't sanitized." (soft, no dirty flags). Mark OK → signed off. Mark… Clean & sanitized → "Sani 0 days", flag gone (`p123_flags.png`). |
| P124 | ✅ pass | `[TEST-TEMP] R2` dirty (with `dirty_fill` + `dirty_no_cip`) → Mark… Clean not sanitized → "Clean no sani 0 days". The dirty flags are replaced by the unsanitized-fill flag (`p124_after.png`). |
| P130 | ✅ pass | Pencil in, Lager with transfer, **Nov 6** (not Mar 9, so the 3-day tank rule and P131's overlap actually come into play), Unassigned → "[TEST-TEMP] RCbrew X1" (seed Oktoberfest renumbered to X2), aria "… pencilled in", opacity 0.45, Unassigned row, 0 board tasks, **no** flags (`p130_gantt.png`). |
| P131 | ✅ pass | Dragged X1 into `[TEST-TEMP] R4` on top of the scheduled Nov 4 batch (`PATCH …/vessels/0`) → `tank_overlap` and 2× `dirty_fill`, all `muted: true`. The chip stayed "14 flags · 1 signed off" (17 flags, 3 muted, not counted). |
| P132 | ✅ pass | Schedule this batch → "X1 → P10, Enos P10 → P11, Oktoberfest X2 → X1, [TEST-TEMP] RCbrew X3 → X2". Drawn normally, its brew day on the board (Nov 6, Planned batch), flags unmuted. Snackbar UNDO → back to X1, pencilled, flags muted, 0 board tasks (`p132_after.png`). |
| BB1 | ✅ pass | The refusal names the rule, and UNDO stays (>97 s) while the token lasts. |

**Changed since the first pass:** BB2 now works whatever day the part's exit step is checked off on (gap 1). The snackbar sits at the top centre and auto-hides after about 8 s (it used to sit at the bottom and could stay up). Dashboard Today's tasks follows the toggle. The tablet popover shows notes. The board drag, move prompt and P-number renumbering behave as before.

---

## Data I made and cleaned up

| What | Ids / names | Cleanup |
|---|---|---|
| Brand | `[TEST-TEMP] RCbrew` (1025) | Deleted (204) |
| Tanks | `[TEST-TEMP] R1A` 1695, `R1B` 1696, `R2` 1697, `R3` 1698, `R4` 1699, `S1` 1700, `S2` 1701, `S3` 1702 | Retired (`DELETE` 200). Gone from the schedule. |
| Template | `[TEST-TEMP] RC template` (534, a duplicate of the seed Standard ale, renamed at once; phase start 3976 added) | Retired from the UI (`DELETE /templates/534`) |
| Batches | 2055 (#44) + split parts 2056/2057, 2058, 2059, 2060, 2061 (#46), 2062 (X2/X3), 2063 (#45), 2064, 2065 (X1) | Done steps un-checked (brew days, FDH, Split), split undone (Undo split), all deleted |
| Standalone CIPs | 27952, 27966, 27967, 27994 | Deleted |
| Condition marks | 117–125, 127, 128, 129 | Deleted |
| Flag sign-off | `unsanitized_fill:2064.0` (mine) | Went away with the batch |
| Board tasks | Every linked task for the above | Re-checked over Sep 1 2026 – Apr 30 2027: no `[TEST-TEMP]` batches and no `[TEST-TEMP]` board tasks left |
| Persona settings | brewer1 Show planned batches (toggled) | Back **on** (its starting value) |
| | brewer1 notification preferences (changed in item 7) | Restored to `{}`, the starting value |

**Mistake I made and reverted:** while testing P123, a second "Mark OK" click (the list had re-rendered) signed off the **seed** flag "Enos P9 fills FV1, which isn't sanitized." (`unsanitized_fill:1912.0`). I removed that sign-off right away (`DELETE /flags/signoff/unsanitized_fill%3A1912.0` 200). Afterwards `signed_off: false`, `signoff: null`, as at the start. I also opened the seed Crusher #42 brew day dialog by mistake and closed it without saving; no request was sent.

**Checked after cleanup:** the seed labels are back to Altruism P1, Galactic P2, Crusher P3, Altruism P4, Enos P5, Oktoberfest X1, Enos P6 (plus Altruism #39.1/#39.2). The tank list is back to the 13 seed tanks. Flags are back to the original 7 keys, with the one original seed sign-off (`too_big:1912.0`). No other `[SEED]` record was changed. Linked-task renumbering shifted seed labels while my batches existed, and they reverted when the batches were deleted.

**Leftovers that aren't mine:** step types "[TEST-TEMP] Fining zq35nj" (62) and "[TEST-TEMP] Hop stand  zofqng" (61), and the retired phase "[TEST-TEMP] Souring zu18bo", were already on DEV before I started. I left them alone. brewer1's notifications panel shows each "You've been scheduled" entry twice with the same timestamp. That's from someone else's scheduler activity, outside D49, and I didn't investigate it.

## Screenshots (in `results/recheck1/`)
Item 1: `r1_plan_dialog`, `r1_brewday_dialog`, `r1_brewday_after`, `r1_batch_dialog`, `r1_split_dialog`, `r1_owner_split_prompt`, `r1_owner_split_after`, `r1_mgr_package_prompt`, `r1_mgr_marknotdone`, `r1_bb2_undo_refused`, `r1_bb2_undo_worked`, `r1v_moveonly_refused`, `r1v_moveonly_worked`, `r1v_hand_state`, `r1v_hand_after`, `bb1_refused_long`, `bb1_after_wait`, `bb1_long_retry` · Item 2: `r2_after_fill`, `r2_stuck` · Item 3: `r3_dash_on`, `r3_dash_off` · Item 4: `r4_after_schedule`, `r4_after_tab`, `r4_hover_end` · Item 5: `r5_tab_board`, `r5_tab_popover` · Item 6: `r8_templates`, `r8_dup`, `r8_tpl_open`, `r8_marker_entry_dialog` · Item 7: `r7_account_menu`, `r7_profile`, `r7_bell`, `r7_prefs_initial`, `r7_after_fast_toggle`, `r7_race_before_load`, `r7_race_settled`, `r7_inflight_settled` · Sweep: `p90_board`, `p91_off`, `p92_mid`, `p92_prompt`, `p93_setup_state`, `p93_after`, `p94_prompt`, `p95_prompt`, `p95_after`, `p99_menu`, `p99_confirm`, `p122_after`, `p123_flags`, `p124_after`, `p130_dialog`, `p130_gantt`, `p131_mid`, `p132_after` · Orientation: `orient_*`.
