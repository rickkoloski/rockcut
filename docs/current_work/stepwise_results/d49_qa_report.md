# D49 independent QA report (DEV)

- **Build:** D49 at `6474383` (DEV API v60 / UI v63), as stated in the brief. DEV has no version endpoint, so I couldn't confirm the build myself.
- **Environment:** https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev. I didn't touch prod.
- **Tester:** Claude (independent QA agent), run for matthewheiser@gmail.com
- **Date:** 2026-10-27 (America/Denver; DEV "today" = Tue Oct 27 2026)
- **Method:** Playwright Chromium. Each persona logged in from its `auth/<persona>.json` storageState, which I passed by path and never opened. One browser at a time (one context, or two when testing owner and breweryMgr side by side for BB). Most steps went through the UI. I sent API probes from inside the logged-in page by rerouting one of the app's own requests, so the app's auth header was passed through and never read or printed. No screenshot shows a token.
- **Personas used:** `brewer1` (main), `brewer2`, `owner`, `breweryMgr`, `breweryDevice` (1280×800, touch), `bartender1`, `noDept`, `office1`, `taproomDevice`.

## Summary

| # | Severity | Gap |
|---|---|---|
| 1 | **must-fix** | BB2: after the blocker is cleared, the retried Undo of a Split fails with "Something changed since. Nothing was undone." (409 `undo_stale`) whenever the part's exit step was checked off on a day other than its planned day. That is the normal case. The parts don't get their dates back. |
| 2 | **must-fix** | A tank marked **Dirty** on the same day as a done CIP shows "Empty · dirty … · no CIP planned" in red, but raises **no** dirty flags. A planned fill of that dirty tank gets no "Filling a dirty tank" flag, and there's no "no CIP planned" flag. |
| 3 | minor | The Brewery Dashboard's **Today's tasks** card ignores **Show planned batches** = off. Planned-batch tasks still show there, with no Planned batch pill. The board and the Gantt Task list panel do honour the setting. |
| 4 | minor | The Undo snackbar sits over the batch dialog's bottom buttons ("Schedule this batch" / "Delete planned batch"), so they can't be clicked. In one run it stayed up after its 2-minute token had expired, and Undo then answered "It's too late to undo that." While a dialog is open, the snackbar is inside the aria-hidden app root, so screen readers can't reach it. |
| 5 | minor | The tablet's read-only popover for a linked task doesn't show the task's notes. The card shows a notes icon, but the brewer at the tablet can't read the notes. |
| 6 | minor | When a step is taken off the task list (board Delete), its dot disappears from the collapsed Gantt row. The step is still on the schedule, but only visible after expanding the tank row. That reads as "the step vanished". |
| 7 | minor | In the collapsed Gantt row, two steps on the same day share one spot. The upper dot (here a part's Set temp) takes the click, so the Split - Transfer under it can't be clicked. Workarounds: expand the row, use the keyboard, or use the Task list panel. |
| 8 | minor | The API accepts `on_task_list: true` on a phase marker (Lag) and stores it. No task is created, so the "markers never become tasks" rule holds, but the write should be refused. The UI doesn't offer the switch on markers. |
| 9 | minor | You can check off a step on a **planned** (scheduled, not pencilled) batch whose brew day isn't done. FDH checked off before brew day was accepted. This may be the existing design; I'm noting it because pencilled batches do block this. |

---

## Gaps in detail

### 1 (must-fix): BB2 retried Undo fails once the blocker is cleared
- **Path:** `owner` checks off a Split - Transfer early → `breweryMgr` checks off a part's exit step (Package) → `owner` clicks Undo (refused, correctly) → `breweryMgr` un-checks the Package → `owner` clicks the same Undo again.
- **Expected:** the same Undo now works, and the parts get their dates back.
- **Observed:** the second Undo returns **409 `undo_stale`, "Something changed since. Nothing was undone."** The Split stays done, the parts keep their moved dates, and the snackbar keeps offering an Undo that can't succeed. Root cause as far as I can see from outside: checking off the part's Package moves it from its planned day (Nov 6) to today. "Mark not done" leaves it on today, so the part's dates no longer match what the Undo token captured.
- **When it does work:** in an earlier run the part's Package already happened to be due today, so nothing moved, and the retried Undo succeeded ("Undone."). So BB2 only works when the exit step is checked off on exactly its planned day.
- **Repro:**
  1. As owner, on a `[TEST-TEMP]` batch, split on Oct 29 (part 2 to another tank).
  2. As owner, Gantt → Split - Transfer → Check off (today, 2 days early). Snackbar: "Split - Transfer done, 2 days early. … #44.1 and … #44.2 moved with it. UNDO".
  3. As breweryMgr, Gantt → part 2's Package (planned Nov 6) → Check off → "Package done 8 days early" prompt → Apply.
  4. As owner, click Undo → "Mark [TEST-TEMP] QAbrew #44.2: Package not done first." (422 `part_exit_done`). Undo stays. ✔
  5. As breweryMgr, open the Package → Mark not done (`POST /steps/25882/uncomplete` 200).
  6. As owner, click Undo → **"Something changed since. Nothing was undone."** (409).
- I ran this both with breweryMgr's steps through the API and fully through the UI. Same result both times.
- **Screenshots:** `bb_undo_refused.png` (step 4), `bb2_undo_stale.png` (step 6), `bb_undo_worked.png` (the earlier lucky run).

### 2 (must-fix): a tank marked dirty after a same-day done CIP raises no dirty flags
- **Path:** Add process → CIP… → CIP & Sanitize, today, Already done, on a clean tank → ⋯ → Mark… → **Dirty**, today → plan a batch into the tank next week.
- **Expected:** status "Empty · dirty 0 days · no CIP planned", a "no CIP planned" flag, and a "Filling a dirty tank" flag on the fill.
- **Observed:** the status is correct (red "Empty · dirty 0 days · no CIP planned", `alert: true`, warning marker on today). But **the flags list is empty for the tank and for the batch**, and the flag chip doesn't change. The status and the flags disagree, so a fill into a dirty tank isn't flagged. The flag logic seems to treat the same-day done CIP as cleaning the tank *after* the dirty mark.
- **Control:** I deleted that done CIP and left everything else alone. Both flags appeared at once: "`[TEST-TEMP] QAbrew P10 fills [TEST-TEMP] QA4, which was marked dirty on Oct 27.`" and "`… was marked dirty and has no CIP planned.`"
- **Repro** (brewer1, `[TEST-TEMP] QA4`): CIP & Sanitize today, Already done → Mark… Dirty today → Plan batch brew Nov 6 into QA4 → flags list shows nothing for QA4.
- I first hit this on `[TEST-TEMP] QA1` (CIP & Sanitize checked off on the board today, then marked Dirty today). The fill planned there had no flag either.
- **Screenshot:** `gap_dirty_no_flags.png`

### 3 (minor): Dashboard Today's tasks ignores Show planned batches
- **Path:** brewer1, Tasks → Brewery → turn Show planned batches off → Brewery → Dashboard.
- **Expected:** planned-batch tasks hidden, as on the board.
- **Observed:** "[TEST-TEMP] QS1r · [TEST-TEMP] QAbrew P2 · Brew day" (a planned batch) is still listed, and without the Planned batch pill. With the same setting, the board (0 shown) and the Gantt Task list panel (0 Planned batch items) both hide it.
- **Screenshot:** `dash.png`

### 4 (minor): Undo snackbar covers the batch dialog's buttons and can outlive its token
- **Path:** brewer1, batch dialog → Pencil in (or Schedule this batch) → the dialog stays open, and a snackbar appears with "…Batch numbers updated: … UNDO".
- **Observed:** the snackbar (y 777–876 at 1440×900) sits on top of the dialog's "Schedule this batch" button, and Playwright reports the snackbar intercepting the click. In one run (dialog left open about 5 minutes) the snackbar was still showing UNDO, and clicking it gave "It's too late to undo that." (422 `undo_expired`). The brief says the Undo button stays only while its 2-minute token lasts. While the dialog is open, the snackbar is inside `#root[aria-hidden=true]`, so screen readers can't reach the Undo.
- **Screenshot:** `gap_snackbar_covers_schedule.png`

### 5 (minor): the tablet's linked-task popover doesn't show notes
- **Path:** breweryDevice (1280×800, touch) → Brewery tasks → tap "[TEST-TEMP] QA2 · [TEST-TEMP] QAbrew #44.1 · Set temp - 38°". The card shows the notes icon, and the task has notes "[TEST-TEMP] note from gantt".
- **Observed:** the popover shows the title, "Fri 10/30 · Anyone" and "From the production schedule. Do this on the production schedule." It doesn't show the notes, and there's nowhere else on the tablet to read them.
- **Screenshot:** `tab_tap_linked.png`

### 6 (minor): a step taken off the task list disappears from the collapsed Gantt row
- **Path:** brewer1, board → Delete "…#44 · Set temp - 32°" → Take off → Gantt.
- **Observed:** the step is kept (`on_task_list: false`, still due Oct 30), as expected, but its dot is gone from the collapsed QA2 row. It only shows as a diamond after expanding the row. "On the Gantt the step stays" holds in the data and in the expanded view.
- **Screenshots:** `p99_gantt_missing_step.png`, `p99_gantt_expanded.png`

### 7 (minor): same-day dots overlap in the collapsed row
- **Path:** the Split - Transfer and the part's Set temp - 48° fall on the same day in the collapsed QA2 row.
- **Observed:** clicking the spot opens the Set temp. The Split's dot can't be clicked with the mouse. Keyboard focus and Enter on the dot still work, as do expanding the row and the Task list panel.

### 8 (minor): the API accepts the task-list flag on a phase marker
- `PATCH /api/production/steps/<Lag id> {"on_task_list": true}` → 200, stored as `on_task_list: true`. No board task was created.

### 9 (minor / observation): steps on an unbrewed planned batch can be checked off
- brewer1 checked off FDH (P94) on `[TEST-TEMP] QAbrew P1`, a planned batch whose brew day wasn't done. It was accepted and the batch stayed "planned".

---

## Scenarios run

| # | Result | Notes |
|---|---|---|
| P90 | ✅ pass | Title format "`<tank> · <batch> · <step>`" and Planned batch pill as specified. Lag/Fermentation/Conditioning markers don't appear. When P-numbers renumbered, the titles followed. (`p90_board.png`) |
| P91 | ✅ pass | Turned off: hidden, `PUT /api/me/show_planned_batches` sent, still off after reload. brewer2 unaffected (22 pills shown). |
| P92 | ✅ pass | Board drag of FDH +2 days → move prompt (move all / move only) → Apply → FDH and the 8 following steps moved on the Gantt. PDH (no following steps) moves without a prompt, which is correct. "Change day…" in the menu gives the same prompt. The prompt's UNDO writes nothing. (`p92_prompt.png`) |
| P93 | ✅ pass | "Set temp - 58°" due today checked off on the board: done on the Gantt, tank status "· 58°", no extra dialog. |
| P94 | ✅ pass | FDH planned 2 days ago, checked off → moved to today, move prompt ran, Apply moved the following steps. |
| P95 | ✅ pass | Brew day on the board → batch number prompt ("Suggested: 44") → move prompt (18 days late). |
| P96 | ✅ pass | Edit shows "This task comes from the production schedule" + OPEN IN SCHEDULE. Notes and Assign to are editable. No title, day or repeat fields. |
| P97 | ✅ pass | Assigned Riley Wort from the board → "RW" appears above the dot on the Gantt. I didn't confirm Riley Wort is the `brewer2` account; the check doesn't depend on who it is. |
| P98 | ✅ pass | Notes changed in the Gantt step dialog → the board task shows the same notes. |
| P99 | ✅ pass* | "Take off the task list" confirm → off the board, step kept with the switch off. *See gap 6. |
| P100 | ✅ pass | Switch turned back on in the step dialog → task back on its day. |
| P101 | ✅ pass | Batch dragged to another tank → titles "QS1 · …". Batch number entered → "#44". Tank renamed → "QS1r · …". |
| P102 | ✅ pass | Late / Today / next 6 days. Check off, Move (with prompt), Assign and Open all work. Also at 412 px (see below). |
| P103 | ✅ pass | Standalone CIP shows as "`[TEST-TEMP] QA1 · CIP & Sanitize`". Checked off on the board → "Sani 0 days". |
| P108 | ✅ pass | No Repeat in the linked-task menu or Edit. API `PATCH` with `title` or `repeat` → 422 `linked_task`. |
| P122 | ✅ pass | Used a `[TEST-TEMP]` copy at "Sani 40 days", because seed Serving 1 starts dirty. Result: "Clean no sani 0 days" in amber, marker on today, snackbar Undo → back to "Sani 40 days". |
| P123 | ✅ pass | Fill planned next week → "…fills [TEST-TEMP] QS2, which isn't sanitized." (soft, no dirty flags). Mark OK → signed off. Mark… Clean & sanitized clears it, and so does a CIP & Sanitize planned before the fill. |
| P124 | ✅ pass | Dirty tank → Clean not sanitized → dirty flags replaced by the unsanitized-fill flag, "Clean no sani 0 days". (Gap 2 is the same-day case.) |
| P125 | ✅ pass | CIP - no sani, Already done, on a dirty tank → "Clean no sani 0 days", dirty flags gone, board shows "`[TEST-TEMP] QS3 · CIP - no sani`" (done). |
| P126 | ✅ pass | Exit CIP switched to CIP - no sani → step and task renamed. Next fill gets "isn't sanitized", not dirty. Extra check: switching it to Sanitize gives a dirty-fill flag, which is correct. |
| P127 | ✅ pass | Sanitize, Already done → "Sani 0 days". Fill after it has no flags. |
| P128 | ✅ pass | CIP - no sani Mon + Sanitize Tue + fill Wed → no flags. Deleting the Sanitize (with confirm) → "isn't sanitized". |
| P129 | ✅ pass | Sanitize, Already done, on a dirty tank → still "Empty · dirty 1 day". Step dialog: "The tank was dirty: run a CIP first." |
| P130 | ✅ pass | Pencil in, Lager with transfer, Mar 9 2027, Unassigned → faded, "· Pencilled", Unassigned row, no board tasks, no tank flag. It got **X2** (seed Oktoberfest X1 already existed) and numbers re-sort by date. |
| P131 | ✅ pass | Pencilled batch dragged into a tank with a scheduled batch → moved. Overlap and dirty-fill flags `muted`. The chip counted 14 = unmuted only. |
| P132 | ✅ pass | Schedule this batch → P14 by date, Enos P14→P15, X's renumbered. Board tasks appeared, flags unmuted. Snackbar Undo → back to X1, tasks gone, flags muted again. (See gap 4 for the snackbar.) |
| P133 | ✅ pass | Pencil in → back to X1, board tasks removed, faded. With a done step, the button is hidden and the API refuses (422 `step_done`). |
| P134 | ✅ pass | Checking off a pencilled brew day → "Schedule this batch first." with a SCHEDULE button. Nothing done (preview 422 `schedule_first`; a direct API complete is also refused). SCHEDULE → then the batch number prompt. |
| P135 | ✅ pass | Show planned batches on: no pencilled tasks on the board. Even forcing `on_task_list` and assigning on a pencilled step doesn't create a task. |
| BB1 | ✅ pass | Refusal names the rule ("Mark … Package not done first."). Undo stays. |
| BB2 | ❌ **fail** | Gap 1. |
| P104–P107 (D50) | ✅ D49 behaviour holds | breweryDevice: complete / notes / move / assign / delete of linked tasks or steps → 403 "Do this on the production schedule." or "Not available on a shared device". No checkboxes on linked cards. |

### Limitations section, checked on DEV

| Item | Result |
|---|---|
| Move and tank-rename speed with the full seed | ✅ Step move (move all) 116–128 ms, preview 77–160 ms (4 runs, plus a 126 ms board drag). Tank rename `PATCH` 178 ms, 265 ms from click to dialog closed. Linked titles updated straight away. All under 500 ms. |
| Tablet 1280×800 touch, breweryDevice | ✅ Linked tasks are read-only: no checkbox, tap shows "Do this on the production schedule.", a touch long-press drag only scrolls (no request). Every write path is refused server-side. Gap 5 (notes not shown). The tablet can't reach the board's move prompt on D49, by design. |
| Gantt Task list panel at 412 px | ✅ Full-width sheet, no horizontal scroll. Move with prompt, check off, assign and Open all worked by touch. (`phone_tasklist.png`, `phone_move_prompt.png`) |
| Phone board vertical, long-press drag down the page (S71) | ✅ With 91 linked tasks in range: long-press on Fri 10/30, auto-scroll down to Mon 11/2, drop → move prompt (3 days later) → Apply. (`phone_drag_mid.png`, `phone_drag_applied.png`) |
| A refused Undo replaced by the same person's next write | Known and accepted; not retested. |
| Dialogs other than the step dialog may lose focus briefly | Known; I didn't see it cause a problem. |
| Linked tasks have no History; a moved task lands at the bottom of its new day | Known and accepted; consistent with what I saw. |
| Dashboard Today's tasks sends brew day to the schedule | ✅ As designed: a simple linked task checks off in place, and brew day opens the schedule's step dialog. Gap 3 found here. |

### Permission probes (API, from the persona's own logged-in page)
- `bartender1`, `noDept`, `office1`: read the board, edit, complete or delete a linked task, complete or move a step, mark a tank, schedule a batch → all **403 Forbidden**. ✅
- `taproomDevice`: same → 403 (Forbidden / "Not available on a shared device"). ✅
- `breweryDevice`: every linked-task and production write → 403. ✅

### Not tested
- **MOVE ALL TO TODAY** on the board's Unfinished section with linked tasks in it. The section always holds `[SEED]` tasks, so clicking it would change seed data.

---

## Data I made and cleaned up

| What | Ids / names | Cleanup |
|---|---|---|
| Brand | `[TEST-TEMP] QAbrew` (id 921) | Deleted (204) |
| Tanks | `[TEST-TEMP] QA1` 1530, `QA2` 1531, `QS1` (renamed `QS1r`) 1532, `QA3` 1533, `QS2` 1534, `QA4` 1535, `QS3` 1536, `QA5` 1537 | Retired (`DELETE` sets `retired_at`; the app has no hard delete). Gone from the schedule and the tank lists. |
| Batches | 1893–1903 (QAbrew P/X batches, including pencilled X1/X3 and #44) and split parts 1904/1905 | Split undone (Undo split), steps un-checked, brew day un-checked (frees #44), every batch deleted. |
| Standalone CIPs | 25755, 25810, 25811, 25812, 25840 (25769 and 25813 were deleted during the tests) | Deleted |
| Condition marks | 93, 94, 97, 99, 100, 101, 102, 103 on my tanks (95 and the undone ones were already removed) | Deleted |
| Flag sign-off | `unsanitized_fill:1896` | Went away with the batch |
| Board tasks | Every linked task for the above | None left; a check over Oct 12–Dec 6 found no `[TEST-TEMP]` tasks |
| Persona setting | brewer1 "Show planned batches" was toggled during the tests | Back **on** (its starting value) |
| Persona setting | `bartender1`, `noDept`, `office1`: `PUT /api/me/show_planned_batches true` during the probes | Left at `true`. I didn't know the previous value; `true` appears to be the default. |

**Checked after cleanup:** seed labels back to Altruism P1, Galactic P2, Crusher P3, Altruism P4, Enos P5, Enos P6, Oktoberfest X1. Tank list back to the 13 seed tanks. Flags back to the original 7 (1 signed off). No `[SEED]` record was changed. Linked-task renumbering shifted seed labels temporarily while my batches existed, and they reverted when the batches were deleted.

**Leftovers that aren't mine:** step types "[TEST-TEMP] Fining t5s4lm" (60) and "[TEST-TEMP] Hop stand t45ad8" (59) were already on DEV before I started, along with condition marks on unknown tank ids 1468–1477. I left them alone.

## Screenshots (in `results/`)
`p90_board`, `p91_off`, `p92_prompt`, `p93_after`, `p94_prompt`, `p95_prompt`, `p95_after`, `p95_done`, `p96_menu`, `p96_edit`, `p97_board`, `p97_boardcard`, `p97_gantt`, `p98_dialog`, `p98_board`, `p99_confirm`, `p99_gantt_missing_step`, `p99_gantt_expanded`, `p100_dialog`, `p101_drag`, `p102_panel`, `p102_move`, `p102_check`, `p102_open`, `p103_cipdialog`, `p108_linked_edit`, `p122_after`, `p122_marker`, `p123_flags`, `p124_after`, `p125_board`, `p126_dialog`, `p128_delete`, `p129_dialog`, `p130_dialog`, `p130_gantt`, `p132_dialog`, `p132_after`, `p133_confirm`, `p133_refused`, `p134_prompt`, `p134_after_schedule`, `bb_split_dialog`, `bb_owner_checkoff_prompt`, `bb_undo_refused`, `bb_undo_worked`, `bb2_undo_stale`, `gap_dirty_no_flags`, `gap_snackbar_covers_schedule`, `marker_dialog`, `dash`, `dash_brewday`, `tab_home`, `tab_board`, `tab_tap_linked`, `tab_touchdrag_mid`, `tab_touchdrag_after`, `phone_gantt`, `phone_tasklist`, `phone_move_prompt`, `phone_open_step`, `phone_board`, `phone_drag_mid`, `phone_drag_after`, `phone_drag_applied`.
