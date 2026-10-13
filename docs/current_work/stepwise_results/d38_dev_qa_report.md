# D38 QA acceptance report: Brewery Task Board (DEV)

| | |
|---|---|
| Tester | Claude (independent QA agent), for matthewheiser@gmail.com |
| Time (UTC) | 2026-10-12 12:36Z – 13:16Z (06:36–07:16 MDT, Mon 10/12 Colorado) |
| Target | DEV only: https://rockcut-ui-dev.fly.dev, https://rockcut-api-dev.fly.dev. Build D38 at `6c9e317`, as stated in the brief. I did not check the build hash myself. |
| Method | Node and Playwright scripts (Chromium, `timezoneId: America/Denver`) using the persona storage states in `auth/`. Desktop runs used 1600×1000 and 1600×1900; phone runs used 360×800 with `hasTouch`/`isMobile` and CDP touch events. Setup API calls were made from inside the page with the page's own token (`page.evaluate`). Scripts are in `scripts/`, raw logs in `results/`, screenshots in `shots/`. |

## Result: **PASS with gaps**

I found no must-fix gaps. All 58 runnable scenario rows passed. The two hardware rows (S9e, S15) were not run, as the brief says. The gaps below are all minor.

## Gaps

| # | Severity | Path | Expected | Observed | Repro |
|---|---|---|---|---|---|
| G1 | minor | Two people edit the same task. brewer2 has **Edit** open while brewer1 renames the task. | Last write wins for the field each person changed, or a warning that the task changed. A notes edit shouldn't undo someone else's rename. | The open dialog survives the 60 s refresh but keeps the old title. Saving sends the whole record (`PATCH {title, notes, assignee_id}`), so the rename is silently reverted. | brewer2: tap a task → Edit → type notes. brewer1: rename the task. Wait about 60 s and save brewer2's dialog. The server title is back to the old one (`results/sK.out`, "L2 after saving stale dialog"). |
| G2 | minor | Daily tick label (S24) | "✓ Temps — Jake Brewer, <time>" (full name, per S24) | "Temps — Jake, 6:55a": first name only. The tick shows only as the checked box. Task cards also use first names ("✓ Riley"), which matches S8. | brewer1 ticks Temps on today. `shots/S24_ticked.png` |
| G3 | minor | Edit Daily items → retire an item, then bring it back | A way to undo a retire, or a clean re-add | Retire is one-way: the dialog has no restore, and `PATCH /api/brewery/daily_items/1 {active:true}` returns 200 but the item stays inactive. Re-adding the same name creates a new item. On a day where the retired item was ticked (today, from seed), the card then shows **two "Backups" rows** and "Daily 1/5". | Retire Backups (ticked today), then add "Backups" again. `shots/restore_today_daily.png`, `results/restore_daily.log` |
| G4 | minor | A past day's Daily card after an item is added later | Past days keep their own list, counted out of 4 (S28) | The count is out of 4 (correct), but the later item still appears as an unticked row ("Daily 3/4" above five rows). It can be ticked on that past day, and the count then becomes **"Daily 4/5"**. | Add an item (or re-add Backups as in G3). Open yesterday and tick the new row: 3/4 → 4/5 → untick → 3/4. `results/sO.log`, `shots/extra_past_day_new_item.png` |
| G5 | info | History (board ⋮) | Who did each entry | Entries from 06:34–06:35 MDT, before my run and probably from the pre-reseed run, show the actor as **"Someone"**. Their actor accounts presumably no longer exist after the reseed. Every entry made during my run has the right name. | Manager → ⋮ → History → scroll to the 06:35a entries. `results/history_mgr.txt` |

Other observations (not gaps against the spec):

- **Temp password echoed back.** `POST /api/users` echoes back the password it was given (`temp_password`). For S49 it landed in my raw log. I redacted it there, and that account is now deactivated.
- **Reset not enforced on brewery routes.** The throwaway account had `must_reset_password: true`. The UI showed "Set a new password", but the brewery API still accepted its complete and Daily-tick calls. I didn't check whether other modules behave the same.
- **Shared device page.** Opening `/brewery/tasks` on the Taproom tablet shows "Not available on a shared device" rather than going Home. Every API call answers 403 as specified.
- **Publish Week has no confirm.** In the Scheduler, Publish Week published straight away with no confirm dialog. That is outside D38 and I didn't compare it with an earlier build.

## Scenarios

| # | Result | Evidence |
|---|---|---|
| S1 | PASS | Today's seeded header: "Jake Brewer · Brewer · 7:00a–3:00p · 8h". The seed shift's "[SEED] Brewer" note and Jake's 10/15 time off aren't shown. Two shifts on one day share a line: "Riley Wort · Brewer · 7:00a–11:00a, 12:00p–4:00p · 8h". Open shift: "Open · Brewer · 7:00a–3:00p". 14 days in two rows. `shots/S1-S5_headers_b1.png` |
| S2 | PASS | Days without shifts say "No brewers scheduled" and still have a Daily card. |
| S3 | PASS | I added a draft Brewer shift for brewer2 in the Scheduler UI (week of Nov 2). Before publishing, the header said "No brewers scheduled" for both the manager and brewer1. After Publish Week it showed "Riley Wort · Brewer · 7:00a–3:00p · 8h" for both. |
| S4 | PASS | Header: "No brewers scheduled / [TEST-TEMP] QA brew event · All day". The same-day Taproom event isn't shown. A timed Brewery event showed as "· 1:00p–3:30p". |
| S5 | PASS | brewer2's approved all-day time off on a day with their shifts: nothing about it in the header. |
| S6 | PASS | Added at the bottom of today's own tasks (only the "planned Sun 10/11" done-elsewhere copy sits after it). Still there and unassigned after a reload. `POST` → 201 |
| S7 | PASS | brewer2 assigned brewer1 → "JB" on the card. My tasks shows it for brewer1, not for brewer2. brewer1's `/api/notifications` didn't change. |
| S8 | PASS | brewer2 checked it: no dialog, struck through, "✓ Riley". Unchecking cleared it with no dialog. |
| S8a | PASS | **On today**: off the Unfinished card, on today after today's own tasks, "planned Sat 10/10", gone from 10/10. History: "Completed …, shown on Mon 10/12 (planned Sat 10/10)". |
| S8b | PASS | Two copies, both done and `locked`. Today's copy shows "planned Sat 10/10". A mouse drag of today's copy did nothing (no request). |
| S8c | PASS | Only on 10/10, done. Not on today. |
| S8d | PASS | Confirm "Mark not done? … goes back to open on Sat 10/10." It left today and is open on 10/10 with `overdue`, and back on the Unfinished card. |
| S8e | PASS | Cancel: still open, checkbox unticked, no History entry. |
| S8f | PASS | `POST /complete {}` on a past-day task → 422 `{"error":"display_required"}` |
| S8g | PASS | "Planned for Wed 10/14, finished today (Mon 10/12)." → On today: on today with "planned Wed 10/14", gone from 10/14. |
| S9 | PASS | Delete → confirm "Delete '…'?" → gone after a reload (`DELETE` 204). |
| S9a | PASS | Phone 360×800: bottom sheet with Edit, Add notes, Mark completed, Change day…, Move up, Move down, Delete. Add notes opens the dialog with focus in Notes. After saving, the notes icon shows and the menu says Edit notes. `shots/S9a_sheet.png`, `S9a_sheet_after.png` |
| S9b | PASS | Change day… → +42 days: gone from the range. Range set to that day shows it at the bottom. |
| S9c | PASS | Mark completed on yesterday's task opens the same "Where should … show as done?" dialog. |
| S9d | PASS | Change day…, Move up, Move down are `aria-disabled` with "Mark not done first to move it". `shots/S9d_menu.png` |
| S9e | NOT RUN | Real Pixel touch drag: for a human. |
| S9f | PASS | Hide completed: 2 → 0 done cards. Still on after a reload. Off shows 2 again. |
| S10 | PASS | Manager History: Added, Assigned, Completed (with shown-on detail), Marked not done, Deleted, Moved. Each with name and Colorado time (12:43Z shown as 6:43a). Load more fetches page 2. The task dialog's History filters by `task_id`. |
| S11 | PASS | brewer1 has no board ⋮ menu at all, so no History. `GET /api/brewery/tasks/history` → 403 |
| S12 | PASS | Mouse-dragged a 3rd-or-later today task to the top. The order persists after a reload and brewer2 sees the same. |
| S13 | PASS | Today → Tue 10/20 (second row): lands between D1 and D2. Counts went 5→4 and 2→3. Some automated attempts landed at the end of the day, but always where the on-screen placeholder showed (`shots/S13_try1_preview.png`). |
| S14 | PASS | Keyboard Space, →, Space moved it to Tue 10/13 (live region: "Dropped …, Tue 10/13, position 3 of 4"). Escape mid-move left it in place. |
| S15 | NOT RUN | Real Pixel hardware: for a human. |
| S16 | PASS | brewer1 and brewer2 dragged the same task at once to different days. Both `move` calls returned 200 and the last one won. Both screens agreed with the server 58.7 s later without a reload. |
| S17 | PASS | Empty: inline "Enter a title". 201 characters: inline "Up to 200 characters" (the field accepts the 201st character, then errors). Nothing saved. API: 422 for 201 characters and for a blank title. |
| S18 | PASS | The Unfinished card is the first column and lists the open tasks with dates (Fri 10/9 …). It doesn't list yesterday's completed task or Daily checks. |
| S19 | PASS | Dragged from the Unfinished card to Tue 10/13: left the card and landed on 10/13. |
| S20 | PASS | Confirm "Move 5 unfinished tasks to today?" (5 = 2 seed + 3 of mine). Today's own 3 come first, then the 5 oldest-first. The card disappeared. History: 5 "moved" entries. |
| S21 | PASS | No open past tasks → no Unfinished card. |
| S22 | PASS | 10-day all-past range (9/30–10/9): 10 days. The open task there has `overdue` and a 4px amber (rgb 237,108,2) edge, and is still on the Unfinished card. Previous → 9/20–9/29, Next twice → 10/10–10/19, Today → 14 days from 10/12. |
| S23 | PASS | 41-day range: "Up to 31 days" and not applied. |
| S23a | PASS | 1 week: 7 days in one row. Kept after a reload and after Today. A fresh context opens on 14 days. `shots/S23a_1week.png` |
| S23b | PASS | With 1 week as default, a 20-day range shows 20 days with neither toggle pressed. Today → 7 days. 2 weeks → 14 days from the range start (10/14) and stays after a reload. |
| S23c | PASS | Future → + Add (No day pre-ticked): bottom of Future, `due_on: null`. Still there after a reload and after Next. |
| S23d | PASS | Future task dropped between two tasks on 10/20: there, and gone from Future. |
| S23e | PASS | Dated task dropped between the two Future tasks: there, and gone from 10/13 (`move {due_on:null}`). |
| S23f | PASS | Future task → Change day +35: bottom of that day. Dated task → **Move to Future**: bottom of Future. |
| S23g | PASS | No dialog. On today with "✓ Jake / from Future", gone from Future. Mark not done → back at the bottom of Future. |
| S23h | PASS | 3 open Future tasks, no open past tasks: no Unfinished card, Future count 3, no Move all. |
| S23i | PASS | Shows "Nothing here. Drag a task here or add one." + Add a task. I checked this by making Future empty for brewer1 with My tasks, without moving the seed Future tasks. |
| S23j | PASS | Phone: strip → Future shows the Future list and + Add a task. `shots/S23j_future.png` |
| S24 | PASS* | Ticking Temps and Pressures took Daily 1/4 → 3/4 (Backups was already ticked by seed). brewer2 sees 3/4 after a reload. Unticking Temps → 2/4. *Label wording: see G2. |
| S25 | PASS | Tomorrow's checks are disabled. `PUT …/daily_checks/<tomorrow>/3` → 422 `future_day` |
| S26 | PASS | Yesterday shows "Daily 3/4" in amber (`data-behind=true`, rgb 230,81,0). Ticking the 4th → 4/4, no longer amber. Restored to 3/4. |
| S27 | PASS | Mouse-dragging a Daily card doesn't move it and sends no request. |
| S28 | PASS | Added "DO", moved it first, renamed Temps → Temperatures. Today: DO first, "Daily 1/5" (1 because of the seed Backups tick). Yesterday shows "Temperatures — Jake" and keeps "Daily 3/4". |
| S29 | PASS | Retired Backups. Yesterday still shows "Backups — Jake, 9:00a". Tomorrow has no Backups row ("Daily 0/5": DO, Gravities, Temperatures, Pressures and a test item). Today keeps Backups because it was ticked today, which is consistent with the rule. |
| S30 | PASS | brewer1 has no board ⋮ and no Daily card ⋮. `POST /api/brewery/daily_items` → 403, `PATCH` → 403, `PUT …/order` → 403 |
| S31 | PASS | 13th active item: "Up to 12 items" (UI), and the API answers 422. Duplicates "Gravities" and "gravities " show "Already on the list"; `GRAVITIES` gets 422. |
| S38 | PASS | floater (Brewery + Taproom): board loads, adds, checks ("✓ Jordan") and deletes. No History. History API → 403. splitRole: same. |
| S39 | PASS | bartender1, office1, sales1, barMgr, noDept, dualMgr, hidden, bartender2: no Brewery/Tasks nav, `/brewery/tasks` goes to `/`. All 14 brewery routes I probed answer 403. |
| S40 | PASS | owner (no memberships) gets the board, History (dialog opens) and Edit Daily items (dialog opens). owner2 is the same at the API level. |
| S41 | PASS | taproomDevice: `GET /api/brewery/tasks` → 403, and every other brewery route → 403. |
| S49 | PASS | As breweryMgr in Users & Roles: set the throwaway's Brewery role to "— None —" and saved (`PUT /api/users/983/memberships {memberships:[]}`). Their open task became unassigned (no chip). The completed task keeps "✓ [TEST-TEMP]" with their name as assignee. Yesterday's Pressures tick keeps "— [TEST-TEMP], 7:12a". |
| S51 | PASS (morning) | Today = 2026-10-12 (Colorado and server agree). The range starts on it, Add defaults to it, and its Daily card is the tickable one. With the browser clock set to 19:30 MDT (01:30Z the next UTC day), the client still used 10/12 for Today, range start, add default and the tickable Daily card. I did not see the server's own behaviour after 18:00 MDT (see LIMITATION 3). |

## LIMITATIONS: what I found

1. **Cross-origin (CORS).** I drove every write type from the UI on DEV's split origins: `POST/PATCH/DELETE /tasks`, `/complete`, `/uncomplete`, `/move`, `/move_overdue_to_today`, `PUT/DELETE /daily_checks`, `POST/PATCH /daily_items`, `PUT /daily_items/order`. Users & Roles `PATCH /users`, `PUT /memberships` and Scheduler shift create and publish also went through. Not one request failed and there were no page errors in any run (checked with `requestfailed`/`pageerror` across all logs).
2. **60 s refresh and two people at once.** The background refresh fires every about 60 s (measured 60.1 s). Another person's move showed up without a reload after 60.4 s. In S16 the screens agreed in 58.7 s. The refresh did **not** close an open task menu or Edit dialog, or lose typed text. A mouse drag held across a refresh still dropped where aimed. One gap: a stale Edit dialog overwrites someone else's change on save (G1).
3. **"Today" on a UTC server.** Tested at 06:36–07:16 MDT, so the UTC date and the Colorado date were the same. Server `today` = Colorado date. Client logic checked with a faked 19:30 MDT clock and correct. The **server-side** check after 18:00 MDT is not covered: a run after 6 pm Colorado time is still needed for that.
4. **Day header vs DEV's seeded schedule.** It matches the seed for this week: Jordan Float's overlapping Taproom "Bar-mid" shift on 10/13 is excluded, Jake's seeded 10/15 time off isn't shown, the 10/17 open shift shows as Open, and the 10/14 "Brew day: Hazy IPA · All day" event shows. Also checked against new shifts and events I created 3 weeks out (S1–S5).
5. **S49 through the UI.** Done through Users & Roles as breweryMgr (role → "— None —"), not only the API. Once removed, the person drops out of the manager's Users list, so the owner deactivated them.
6. **Phone 360×800 with touch.** One day at a time. The strip has 15 stops (14 days with open counts, ending in Future). No sideways page scroll (scrollWidth 360). Arrows and sideways swipe change day; a vertical swipe scrolls (scrollY 0→361) without changing day. Long press then drag reorders within the day and persists. Long press dragged sideways to the screen edge stays on the same day. The task menu is a bottom sheet. 1 week / 2 weeks and the range sit behind the calendar button. The manager dialogs fit: History is full-screen at 360×800, Edit Daily items is 296 px wide and nothing passes the right edge.
7. **Side effects.** Scheduler (manager), View Schedule (brewer1), Brewery Dashboard (manager and brewer1) and Users & Roles (owner) load with no API errors or page errors. Scheduler add shift, publish, delete and Users & Roles edit all worked. `shots/L7_*.png`

## Cleanup

- **Tasks:** all `[TEST-TEMP]` tasks deleted. A final sweep from −63 to +107 days plus Unfinished and Future found none.
- **Shifts and events:** shifts 1021–1024 and events 15070, 15071 (breweryMgr) and 15072 (barMgr) deleted. The week of Nov 2–8 is empty again.
- **Taproom event:** created as **barMgr**, not breweryMgr, because breweryMgr gets 403 on Taproom events. That is a deviation from rule 5.
- **Throwaway person:** `temp-0f553e66@rockcut-test.com` (id 983) was removed from the Brewery and then deactivated (`active: false`).
- **Daily ticks:** I put back the ticks I changed: today is back to Backups only, and yesterday is back to 3/4.
- **Moved by design:** Move all to today (S20) moved the 2 seed past tasks, "[SEED] Carb FV3" and "[SEED] Dry hop FV1", onto today. This is allowed by rule 4 and the lead resets DEV.
- **Not fully restored:**
  - **Daily items.** Retire can't be undone (G3), so I re-added "Backups" and moved it first. Names and order are Backups, Gravities, Temps, Pressures again. But Backups is now a new item (id 25), and the original id 1 is retired. Today and yesterday therefore show an extra "Backups" row (the retired item, which was ticked on those days). The other items I added (DO, QA5–QA11, QA13api, a second QA6) are retired, and Temperatures was renamed back to Temps.
  - **Time off 117** ("[TEST-TEMP] QA", brewer2, 11/3) could not be deleted (404). It is **cancelled**, not removed.
- No persona was signed out, demoted, deactivated or had their password changed. No credential beyond `auth/` was needed. The `newhire` persona lands on "Set a new password", so I didn't use it beyond the API access probe.
