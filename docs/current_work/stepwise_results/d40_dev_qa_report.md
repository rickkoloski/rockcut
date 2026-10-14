# D40 QA report: shared tablets on the boards, staff codes for everyone, shift-end reminder, dashboard card

- **Tester:** Claude (independent QA agent), working in `~/src/rockcut-d40-qa` only
- **Time (UTC):** 2026-10-14 19:33 – 20:46
- **Target:** DEV only. UI https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev, build D40 `0f2f0a0` (as briefed; the build hash was not independently checked)
- **Method:** Node + Playwright 1.63 (Chromium, headless, `America/Denver`), one browser per script, personas loaded from `auth/*.json` via `storageState`. API calls went through `page.evaluate` with the page's own token (tokens never printed). Throwaway people were created as `owner`, and their codes were set by `breweryMgr`/`barMgr`. The route list came from the deployed UI bundle. No Rockcut source was read. Scripts: `scripts/`, logs: `results/`, screenshots: `shots/`.
- **Concurrency note:** someone else was using DEV during the run. Tasks "Matt test 3" and "Test2", a `[TEST-TEMP] D40 brewhouse …` run at 19:32 UTC and Jake completing tasks at 19:30 UTC were not mine. Open-task counts reflect the board at each moment.

## Result: **PASS with gaps**

Every D40 scenario I could run behaved as specified, including the reminder on the real clock. That includes a reminder that real persona `brewer1` received for his real 7a–3p shift. No write went through without a code or under the wrong person. The gaps below are all **minor**. One of them is security-flavoured (gap 1).

## Gaps

| # | Severity | Path | Expected | Observed | Repro |
|---|---|---|---|---|---|
| 1 | minor (security) | `breweryDevice` → board → untick a Daily item (also task delete) | The staff code travels in the request body, as it does for every other tablet write | The code goes in the **URL query string**: `DELETE /api/boards/brewery/daily_checks/2026-10-14/3?staff_code=2045`. Task delete goes the same way. The deployed UI bundle builds `DELETE …/tasks/<id>` with `{params: {staff_code}}`, and the API accepted `DELETE /api/boards/brewery/tasks/11224?staff_code=…` from the tablet. I did not watch a UI task-delete on the wire. URLs end up in proxy and access logs, so a 4-digit code that authorises writes as a person gets logged in clear text. | On the tablet, act with a code, untick Temps, and watch the network (`results/tabflow.log`, "6 reqs") |
| 2 | minor | Shift-end reminder bell entry (S32) | The entry lists today's open tasks (theirs first, then unassigned, then others' with initials) **and the unticked Daily checks** | The title has the counts ("Still open today: 7 tasks, Daily 1/4"). The body lists only the first 3 tasks plus "+4 more" and never names the unticked Daily items. Because of the 3-task cap, "others' with initials" were never visible in any entry I received. | Tasks today for H, for A and unassigned; H's shift ends in 62 min; H's bell at 19:51 UTC shows `[TEST-TEMP] QA S32b for H, [SEED] Package FV6, [SEED] Keg Wash, +4 more` (`results/rem3.log`). Push content could not be checked (no push subscription in headless Chromium). |
| 3 | minor (UX) | Tablet → tick a task → code dialog → wrong code | The checkbox doesn't look done while nothing has been saved | The checkbox shows **ticked** behind the dialog, and stays ticked after "That staff code isn't right". It goes back to unticked on Cancel, and no write is made. An onlooker could think the task is done. | Tick `[TEST-TEMP] QA S9g task`, enter `0000` (`shots/flow_wrongcode_checked.png`, `shots/S46_locked.png`) |
| 4 | minor (UX) | Tablet locked (S46) → reload → tap a write | The dialog says the tablet is locked | After a reload the dialog shows the normal "Records who made this change…" text. The lock message appears only after a code is typed (the server answers 429 `staff_code_locked`). | `results/s46.log` "after reload, tap", `shots/S46_locked_after_reload.png` |
| 5 | minor (UX) | `taproomDevice` → act as D on Tasks → Buy-a-Beer Board | — | The "Acting as …" banner stays on the beer board. The beer board ignores it, as in D37: each action still asks for a code and records whoever's code is typed. The banner can therefore say "Acting as D" while an entry is recorded as someone else. Beer-board behaviour itself is unchanged (see T1). | `results/t1.log` |
| 6 | minor (UX) | Tablet board, scrolled down | The person acting can see who they're acting as | The acting banner sits at the top of the page, not pinned. On the long Brewery board it scrolls out of view while you tick tasks lower down. | `shots/S43_after_code.png` |

## Scenarios

| # | Result | Evidence |
|---|---|---|
| S42 | PASS | The brewhouse tablet lands on `/tasks/brewery`. No History, Edit Daily items, My tasks, board switcher or All departments. Board filter is ALL/UNASSIGNED only. `/tasks/bar`, `/tasks/all`, `/tasks/office` and `/tasks/sales` redirect to `/tasks/brewery` (`shots/S42_landing.png`). |
| S9g | PASS | Tapping a task opens its menu (Edit, Add notes, Mark completed, Change day…, Move, Delete) with no request and no code. "Mark completed" opens "Who's making this change? / Your staff code" before any request is sent. |
| S43 | PASS | Tick Temps → code dialog → A's code (2045) → `PUT …/daily_checks/2026-10-14/3` 200, then "Acting as [TEST-TEMP]" banner. Ticking Gravities right after sent no dialog (200). In `breweryMgr`'s History: "Temps · daily_ticked · [TEST-TEMP] QA Brewer A · on_shared_device: true". Temps and Gravities were unticked afterwards. Note: the banner shows the first word of the name, which for test names is "[TEST-TEMP]". |
| S44 | PASS | Added `[TEST-TEMP] QA S68 weekly` with a code at 19:41:27. Then 5 min 15 s with **scrolling only** → the banner was gone. The second add (`[TEST-TEMP] QA S44 second`) asked for the code again; no request was sent before the code. |
| S45 | PASS | D's code (Taproom-only, 6866) on the brewhouse tablet → 422 `staff_code_invalid`, "That staff code isn't right". The removed person C's code (7448, Taproom-only after S49) was also rejected. |
| S46 | PASS | 5 wrong codes (7448, 5597, 8618, 8518, 8923) at 20:05:56–20:06:03. Attempts 1–4 → "That staff code isn't right". Attempt 5 → 429 `staff_code_locked` "Too many wrong codes. Try again in 10 minutes, or use Sign in as me." A valid code during the lock → 429 (UI and API). The Taproom tablet still accepted D's code during the lock. At 20:17:05 a valid code was accepted again, so the lock lasted about 10 minutes and has expired. |
| S47 | PASS | `POST /api/boards/brewery/tasks` from the tablet with no code → 422 `staff_code_required`. The same holds for complete, PATCH, DELETE, move, daily tick/untick, move_overdue_to_today and stop_repeating. |
| S48 | PASS | `breweryMgr` → Users & Roles → `[TEST-TEMP] QA Brewer B` → Staff code → Suggest (5597) → Save. Reopening shows "Show staff code", which reveals 5597. `barMgr` gets 403 on GET and PUT of A's (Brewery-only) code, and B isn't listed for `barMgr`. `breweryMgr` gets 403 on D (Taproom-only). A duplicate code → 422 "That code is already in use". |
| S49 | PASS | `breweryMgr` set B's Brewery role to "— None —" → B has no memberships, `has_staff_code: false`, code `null`. `[TEST-TEMP] QA S49 for B` (10/15) became unassigned. C (Brewery+Taproom, code 7448) removed from Brewery → still Taproom, code 7448 kept. C's Brewery task also became unassigned, and C's code is now rejected on the brewhouse tablet. |
| S68 | PASS | On the tablet: Add a task → Repeat Weekly (Wed) → Save → code dialog → `POST` with `repeat: weekly` 201. History: "[TEST-TEMP] QA Brewer A · created · repeat weekly · on_shared_device: true". |
| T1 | PASS | The Taproom tablet keeps its "Taproom tablets" landing and has a Tasks link to `/tasks/bar`, with no History, Daily setup, My tasks or switcher. Brewery-only code (B) → "That staff code isn't right". D's code → task created, "Acting as" banner, `created_by_name: [TEST-TEMP] QA Tap D`. A second write within 5 min needed no code. `/tasks/brewery` and `/tasks/all` → `/tasks/bar`. Beer board: add with a Brewery-only code → 422 `staff_code_invalid`; add with D's code → "Added. Recorded as [TEST-TEMP] QA Tap D"; delete with D's code → removed, recorded as D. |
| T2 | PASS | From the brewhouse tablet: `GET /api/boards/bar/tasks` 403, `GET /api/boards/all/tasks` 403, `GET /api/boards/brewery/tasks/history` 403, `POST /api/boards/brewery/daily_items` 403. All four are still 403 when a valid `staff_code` is added. |
| S50 | PASS | `brewer1` `/brewery` → "Today's tasks" card: "Daily 1/4", Daily: Gravities/Temps/Pressures (tickable), the first five open tasks, "+2 more", "5 unfinished from earlier days" (matches the board's Unfinished (5)). Ticking 3 tasks and Temps on the card → the board showed them done and Daily 2/4. With those done, the card showed the two assigned tasks with initial badges. |
| S32 | PASS (gap 2) | E's shift 19:35–20:37 UTC was published at 19:35:45. One entry at **19:41:26**: "Still open today: 3 tasks, Daily 3/4", listing `[SEED] Package FV6, [SEED] Keg Wash, [TEST-TEMP] QA S9g task`, which matched the board's open tasks and Daily 3/4 at that moment. Second check with H (19:47–20:49): own task first, then unassigned, "7 tasks, Daily 1/4", which matched the board. Tapping the entry (logged in as E through the login form) opened `/tasks/brewery` on today (`shots/S32_after_tap.png`). |
| S33 | NOT RUN | "Nothing open" needs every task on today's Brewery board done, and those include `[SEED]` tasks and another user's tasks that I may not complete. |
| S35 | PASS | F turned off "Unfinished tasks before shift end" (In-app and Push) in bell → ⚙ Preferences (`task_shift_end: {in_app:false, push:false}`). F's shift had the same times as E's, but F got no entry while E's arrived on the same run. Still none at the 20:43 check. |
| S36 | PASS | The first 45-min shift for G was created after its reminder time and so proves nothing. The second, timed shift (20:07–20:52, created 19:47) gave G no entry by 20:43. |
| S37 | PASS | Taproom (Bar-mid) shift 19:35–20:37 for C, who was a Brewery member at the time → no entry (E's arrived on the same run). |
| S34 | PASS | At 19:47:38 E's shift was extended by an hour (ends 21:37; the PATCH kept it published, and E got "Your schedule has changed"). Checked at 20:43:34, after the run that would have re-fired around 20:37–20:41: E still has exactly one "Still open today" entry (19:41:26). |

Extra, from the real clock: real persona `brewer1` (Jake, published shift 7:00a–3:00p MT) got "Still open today: 5 tasks, Daily 1/4" at **20:01:26 UTC**, 59 minutes before the shift ended. The count matched the board at that moment.

## LIMITATIONS items: what I found

1. **Tablet flow with real latency.** No write went through without a code or under the wrong person.
   - Cancel → no request, and the checkbox reverts.
   - Double-tap → one dialog, no request.
   - A forced click on another task while the dialog was open → nothing sent.
   - Two writes fired in the same tick → one dialog; after the code, both were sent with it (both 200, attributed to A).
   - Drag-and-drop to another day → code dialog; Cancel snaps the task back with no request.
   - The timer survives client-side navigation to Schedule and back (the next write needed no code).
   - A reload ends acting. Done ends acting.
   - Taps (no writes) once a minute for 6 minutes kept acting alive (`results/timer.log`); 5+ minutes of scrolling only ended it.
   - "Sign in as me" (A, through the tablet's form) wrote without a code and SIGN OUT returned to the Brewhouse tablet.
   - Cosmetic issues: gaps 3, 4 and 6.
2. **Device surface.** Both tablets show "Not available on a shared device" at `/users`, `/profile`, `/activity`, `/devices`, `/settings`, `/scheduler`, `/batches`, `/brands`, `/ingredients`, `/time_off`, `/availability`, `/brewery` (dashboard), `/brewery/tasks`, and `/tasks/<own>/history` and `/daily-items`. Other boards redirect to the tablet's own board.
   - **API, 403:** other boards (read and write), `all`, history, daily_items writes, `/api/users`, staff_code GET/PUT, `staff_codes/suggest`, `owner/activity`, `devices`, `notifications`, `notification_preferences`, `time_off`, `availability`, `batches`, `recipes`, `calendar_feeds`, `beer_board/history`, `POST /api/users`, `POST /api/shifts`, message posting.
   - **API, readable (by design, I assume):** `/api/roster` (names and departments of all staff), `/api/shifts`, `/api/schedule_events`, `/api/channels` (read only), the Messages page, and the brewhouse tablet's own `daily_items` list.
3. **Reminder on a real clock.** It works: entries arrived 54–59 minutes before shift end, on what looks like a 5-minute cycle (:41:26, :51:26, :01:26). Opt-out, Taproom and 45-minute shifts were all respected. Gap 2 covers the content.
4. **Staff codes in Users & Roles.**
   - `owner`: section shown, with Show and Suggest, for B, C and D.
   - `breweryMgr`: Brewery people only (403 on Taproom-only D).
   - `barMgr`, `dualMgr`, `splitRole` (Taproom manager): Taproom people (D, and C who was in both); Brewery-only B isn't listed.
   - `brewer1`, `bartender1`, `floater`, `office1`, `noDept`: no Users & Roles, and 403 on `GET/PUT /api/users/<id>/staff_code`, `staff_codes/suggest` and `/api/users`.
5. **Dashboard card vs board.** Consistent in both directions: ticks on the card showed on the board, unticks on the board showed on the card after client-side navigation back, and "+N more" and "N unfinished from earlier days" matched the board.
6. **Beer board on the Taproom tablet.** Same as before: per-action code field, Taproom codes only (a Brewery-only code → `staff_code_invalid`), "Recorded as …" notice, add and delete work. The only new thing is the D40 acting banner showing there (gap 5).

## Test data and cleanup

- **Throwaway people** (all `[TEST-TEMP] QA …`, `temp-<hex>@rockcut-test.com`), with the codes I set:
  - A 1598 (Brewery, 2045)
  - B 1599 (Brewery, 5597, cleared by S49)
  - C 1600 (Brewery+Taproom, 7448)
  - D 1601 (Taproom, 6866)
  - E 1602 (1138)
  - F 1603 (2943)
  - G 1604 (8049)
  - H 1605 (no code)
- **Tasks:** all `[TEST-TEMP] QA …` tasks were deleted, including the S68 weekly series (`scope=following` from its first date) and the Taproom T1 task. The final sweep of both boards found no `[TEST-TEMP] QA` tasks.
- **Daily items:** Brewery today is back to how I found it (Backups ticked by Riley; Gravities, Temps and Pressures unticked).
- **Beer board:** the T1 entry was deleted.
- **Brewhouse tablet:** locked 20:06–~20:16 UTC, then confirmed unlocked at 20:17. Not left locked. The Taproom tablet was never locked: it had 2 wrong codes, the last at ~19:55.
- **Real data touched:** none, apart from reads. The reminder that `brewer1` received was generated by the system.
- **Shifts:** all 6 test shifts were deleted (1694–1699; 1697 by `barMgr`). No `[TEST-TEMP] QA` shifts are left for 10/13–10/16.
- **People:** throwaways A–H are deactivated. Deactivating them also cleared their staff codes (`has_staff_code: false` for all, which matches "code cleared on deactivation"). Throwaway passwords were changed through the forced-reset flow and are not recorded here.
- **Could not clean up:** nothing. Notifications that the system generated for the throwaways and for `brewer1` stay in their bells. History entries for my test actions stay in Brewery and Taproom History.
