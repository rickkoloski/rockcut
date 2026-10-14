# D41 QA acceptance report: department task boards (DEV)

| | |
|---|---|
| Tester | Claude (independent QA, synthetic personas only) |
| Time (UTC) | 2026-10-14 06:19 – 06:58 (Denver: Wed 10/14, 00:19 – 00:58) |
| Target | https://rockcut-ui-dev.fly.dev (D41 `e61869d`) on https://rockcut-api-dev.fly.dev (`1d61ba8`). Prod not touched. |
| Method | Node 20 + Playwright Chromium, `timezoneId: America/Denver`, one browser at a time. Each persona was loaded with `newContext({ storageState: 'auth/<key>.json' })`. API calls were made from inside the page with the page's own token, which never left the page. Output was scrubbed for `ses_` / `dev_` / `Bearer` / JWTs, and a final grep of `results/` and `shots/` found none. Desktop runs used 1440×900, plus 1600×2200 for drag tests and 1920/2560 for the wide layout. Phone checks used 412×915 with `hasTouch`/`isMobile` and are **emulated**. Scripts are in `scripts/`, raw output in `results/`, screenshots in `shots/`. |

## Result: **PASS with gaps**

Every scenario S101–S120 passed, as did the S116 substitute. No must-fix defects were found. There are two minor gaps and some notes, listed below.

## Gaps

### G1 (minor): "1 week", "Hide completed" and the phone view are remembered for all boards, not per board
- **Path:** owner → `/tasks/brewery` → click **1 WEEK**, turn on **Hide completed** → switcher → Taproom (and All departments).
- **Expected (LIMITATIONS 7):** 1 week, Hide completed and the phone view are remembered per board.
- **Observed:** Taproom and All departments open in 1 week with Hide completed on. Each setting is stored once per browser (`rockcut.tasks.span`, `rockcut.tasks.hideCompleted`, `rockcut.tasks.phoneView`), with no board key. On the phone, picking One day on All departments also made `/tasks/bar` open in One day. The All / My tasks / Unassigned filter is not remembered at all: it resets to All on each switch. Settings do survive a reload.
- **Repro:** `scripts/settings.mjs`, `scripts/phone2.mjs` → `results/settings.json`, `results/phone2.json`.
- **Note:** if one shared setting is the intended design, this is a spec wording issue rather than a bug.

### G2 (minor): a move on one board accepts another board's task as `before_id`
- **Path:** owner → `POST /api/boards/bar/tasks/<Taproom task>/move` with `{due_on: today, before_id: <Brewery task 8176>}`.
- **Expected:** the request is rejected (404 or 422), like every other cross-board ID.
- **Observed:** 200. The Taproom task moved to today and the foreign `before_id` was ignored. The Brewery task and the Brewery board were unchanged (same `updated_at` and positions), so **nothing crossed boards**. It is only lax validation.
- **Repro:** `scripts/cross2.mjs` → `results/cross2.json` (`probe.move_bar_before_brew`).

### Notes (not counted as D41 gaps)
- **N1, `newhire` persona:** the UI demands a password change ("Set a new password … Current (temporary) password"). Under rule 8 I stopped there: I did not enter or change a password and did not use this persona for any scenario. The API still answers 200 to `GET /api/boards/bar/tasks` for this user while the UI blocks them. That looks like existing behaviour, not D41.
- **N2, phone One-day view:** **Next** jumps by the whole range (10/14 → 10/28), not by one day. It does the same on Taproom, Brewery and All departments, so All behaves "as on a board", but it may surprise phone users.
- **N3, API naming:** non-Brewery board headers carry `no_brewers: true/false`. It is not visible in the UI, which correctly shows "No one scheduled".

## Scenarios

| # | Result | Evidence |
|---|---|---|
| S101 | PASS | `bartender1` nav → Tasks → `/tasks/bar`, title "Taproom tasks", no switcher, no ⋮ menu, no Daily card. Headers on 10/14–10/16 (Sam Pour Bar-open; Alex Draft Bar-close) match the API. `s101-bartender1-taproom.png` |
| S102 | PASS | Typed `/tasks/brewery` → `/tasks/bar`. `GET /api/boards/brewery/tasks` → 403. |
| S105 | PASS | Assignee list: Anyone, Alex Draft, Casey Tap, Dana Dual, Jordan Float, Rowan Split, Sam Pour, Taylor New. All are Taproom members; no owners, no `brewer1`. PATCH or POST with `brewer1` → 422 "must be a Taproom member" (`office1` → 422 too). PATCH with owner → 200. `s105-assignee-list.png` |
| S103 | PASS | `floater` switcher lists Brewery and Taproom. After switching to Taproom, `/tasks` opens Taproom; after switching back to Brewery, `/tasks` and nav → Tasks open Brewery. Stored in `rockcut.tasks.board`. |
| S104 | PASS | Owner switcher: Brewery, Taproom, Office, Sales, All departments, each with a color dot (#B8742A, #2E6DB4, #3F8F5B, #7A4FB0). Each board has add buttons and a ⋮ menu: History plus Edit Daily items (Brewery, Taproom) or Set up Daily checks (Office, Sales). History API → 200 on all four. |
| S106 | PASS | `floater`'s weekly `[TEST-TEMP]` series on Brewery: 53 occurrences, 2026-10-15 → 2027-10-14. 0 on the Taproom API and UI. Office and Sales → 403 for `floater`. |
| S107 | PASS | `barMgr` ⋮ → Set up Daily checks → added "[TEST-TEMP] Lines cleaned". The Taproom card shows "Daily 0/1" on all 14 days and the menu now says Edit Daily items. Brewery still has Backups, Gravities, Temps, Pressures (4). `s107-taproom-daily-card.png` |
| S108 | PASS | Taproom History lists only Taproom entries (Lines cleaned, S105 add/reassign, earlier Taproom test entries). Nothing from Brewery, e.g. no S106 series. `s108-taproom-history.png` |
| S109 | PASS | `breweryMgr` typed `/tasks/bar` → `/tasks/brewery`. `GET /api/boards/bar/tasks/history` → 403. |
| S110 | PASS | `splitRole`: Taproom ⋮ = History + Set up Daily checks (Taproom had no items yet; after S107 it would be Edit Daily items); history API → 200. Brewery: no ⋮, no Daily menus; history API → 403. |
| S111 | PASS | `dualMgr` switcher: Taproom, Office. Manager ⋮ on both; history 200/200; Brewery history 403. Typed `/tasks/brewery` → `/tasks/bar`. |
| S112 | PASS | Throwaway person `temp-58c63407@rockcut-test.com` (id 1515) was assigned one task on each board, then taken off the Taproom in Users & Roles (Taproom role "— None —" → Save; `PUT /api/users/1515/memberships`). The Taproom task became unassigned and the Brewery task kept them. Taproom History says "Unassigned … from [TEST-TEMP] QA Leaver 58c63407 (left the Taproom)". `s112-taproom-history.png` |
| S113 | PASS | `brewer1` `/brewery/tasks` → `/tasks/brewery`; with `?from=10/16&to=10/22`, both are kept and the From field shows 10/16. |
| S114 | PASS | `noDept`: no Tasks in nav; `/tasks`, `/tasks/bar`, `/tasks/all` and `/brewery/tasks` → Home; all board APIs → 403, POST → 403. Taproom tablet: every board API (4 boards + history + all, GET/POST/PATCH) → 403; `/tasks` shows "Not available on a shared device". |
| S115 | PASS | `floater` PATCH, `done`, and DELETE `/api/boards/bar/tasks/8176` (a Brewery task) → 404 each, and the task is unchanged (same title, day and `updated_at`). `brewer1` → 403. |
| S116 (substitute) | PASS | Weekly `[TEST-TEMP]` series created on Taproom: 52 occurrences, 2026-10-16 → 2027-10-08 (the next, 10/15/2027, is past +12 months). 0 on Brewery, Office and Sales; in All it is tagged `bar` only. |
| S117 | PASS | `brewer1` at desktop width: add ×2; tick/untick with no dialog on today's card; reorder within a day; drag to the next day (`move due_on 10/15`); Unfinished → 10/16; Future add; Daily tick Gravities 1/4 → 2/4 → back to 1/4; weekly repeat (Sat ×4 in 4 weeks). `breweryMgr` History lists all of these. D38/D39 behaviour is unchanged. |
| S118 | PASS | `/tasks/all` titled "All departments", no schedule header (0 header nodes), no My tasks filter. For all 14 days, each day's sections, order, Daily counts and card IDs match the four boards' APIs (0 mismatches). Today: Brewery (Daily 1/4) then Taproom. Tomorrow: Brewery (Daily 0/4), Taproom, Office (Run payroll). Sales never appears. Taproom shows a Daily count only because of the S107 item. Unfinished and Future are grouped Brewery then Taproom. `s118-all-desktop.png` |
| S119 | PASS | Tapping a Taproom card (tomorrow), an Unfinished card and a Future card opens `/tasks/bar` with the card visible. A 10/30 card opened `/tasks/brewery?from=10/30&to=11/12`. The task menu → Edit → rename was saved (verified by API). On All: 0 checkboxes, 0 add buttons, 0 menus, 0 sortable nodes (the board has 7). Dragging and right-clicking do nothing. |
| S120 | PASS | `breweryMgr` and `floater`: no All departments in the switcher; `/tasks/all` → their own board; `GET /api/boards/all/tasks` → 403. |

## LIMITATIONS: what I found

1. **Migrations on D38/D39 data:** OK. The Brewery board looks and behaves as before: older non-seed tasks (`Mh test 1` in Future, `Test2` in Unfinished) are still present and in place. Series reach about 12 months: Keg Wash 53 (to 2027-10-13), Glycol check 12 (monthly, last Friday, to 2027-09-24), Calibrate pH meter 4 (quarterly, to 2027-07-15). History goes back to 2026-10-12 through the API (~3,950 entries over 79 pages; byDay 10/12: 1,447, 10/13: 2,033) and stays readable. In the UI I clicked Load more 27 times and reached entries from Tue 10/13 with no "undefined/null" text. I did not click to the very end.
2. **Headers:** OK. Each board's header was compared with its API and with department membership for 28 days on each of the four boards. No mismatches and no foreign people. Positions per board: Brewery = Brewer, Taproom = Bar-open/mid/close, Office = Office, Sales = Sales. Events appear only on Brewery ("Brew day: Hazy IPA", 10/14). Open shifts appear on their own board (Brewery 10/17 Brewer; Taproom 10/17 Bar-mid). Days with nothing show "No one scheduled". `floater` and `splitRole`, who belong to both, never leaked into the other board's header.
3. **Fast switching:** OK. `floater`, `splitRole`, `dualMgr` and `owner` switched 4×/4×/4×/2× rounds, sampled at 0, 50, 150 and 400 ms, then did 6 rapid switches with no waits, then browser back and forward. Across 148 samples there were no foreign cards, no Daily card on a board without items, no wrong manager tools, no foreign header and no wrong final board. Edit, switch away, come back: a Taproom task was absent on Office, present on Taproom and in All under Taproom.
4. **Writes never cross boards:** OK. Taproom actions (series edit "this and all following", Daily tick, Move all to today, deleting one occurrence) left Brewery, Office and Sales identical. Snapshots were compared before and after the delete and API probes. For the earlier writes I checked after the run: Brewery series counts, Daily 1/4 and the 5 Unfinished were all as before. Cross-board probes with a Brewery ID on Taproom routes (PATCH, complete, move, DELETE, Daily check with Brewery item 2) → 404. See G2 for `before_id`.
5. **All departments on DEV data:** OK. Desktop is covered in S118/S119. Phone (emulated): the switcher sits in the toolbar beside the calendar ("Days shown"), with All days / One day views and no horizontal overflow. One day on All shows today's Brewery and Taproom sections. Tapping Run payroll (tomorrow) opened `/tasks/office` on 10/15 in One day. Next jumps by range, see N2.
6. **Wide layout:** OK. At 1920 and 2560 the All view has no page or grid overflow, two rows of 7 equal columns (174 px / 245 px) and no clipped titles. `wide-all-1920.png`, `wide-all-2560.png`
7. **Remembered settings:** the board is remembered per browser (OK). Span, Hide completed and phone view are shared across boards, see **G1**.
8. **Taproom tablet:** OK. 403 on every board route and method tried.

## Cleanup

All of these are verified gone by an API sweep of all four boards from today−14 to today+380 (0 `[TEST-TEMP] QA` items remain):
- **Tasks deleted:** 8265, 8319, 8320, 8321, 8322, 8323, 8324, and the Taproom "switch-back" task.
- **Series deleted** ("this and following" from the first occurrence): 204 (Brewery S106), 205 (Brewery S117), 206 (Taproom).
- **Daily item retired** through Edit Daily items: Taproom "[TEST-TEMP] Lines cleaned" (id 187). I unticked it first. The Taproom Daily card is hidden again and its menu is back to "Set up Daily checks".
- **Person deactivated:** throwaway person 1515 (`temp-58c63407@rockcut-test.com`), now `active: false`.

The Brewery's four Daily items were not edited. My Gravities tick was undone, so Brewery is back to 1/4.

**Left for the lead's DEV reset:**
- **Move all to today:** this moved Taproom's "[SEED] Restock the walk-in cooler" from 10/12 to today. This was allowed.
- **History rows:** every write above is in Brewery and Taproom History. History can't be deleted.
- **Throwaway person:** they still exist, deactivated.
- **Nothing I could not clean.**
