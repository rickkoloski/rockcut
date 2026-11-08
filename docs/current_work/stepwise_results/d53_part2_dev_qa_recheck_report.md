# D53 Part 2 (Boards): QA recheck after fix cycle 1 (DEV)

| | |
|---|---|
| **Build** | `f9a3a1e5c4687cf6f48c7edccdcd0619073c3660` (`/api/health`; ribbon `DEV · f9a3a1e — fictional test data only`) |
| **Date** | Sun 2026-11-08, about 11:14–11:30 America/Denver (18:14–18:30Z) |
| **Environment** | DEV only. Prod not touched. Source not read. |
| **Personas used** | `owner`, `barMgr`, `bartender1`, `breweryMgr`, `brewer1`, `taproomDevice`, plus one `[TEST-TEMP]` person created through the API (never signed in) |

## Result

**Pass with gaps: 0 must-fix, 0 should-fix, 1 minor.** All nine gaps from the first report are fixed and behave as BRIEF2 describes. The regression sweep (B3, B4, B6, B7) and the Part 1 task-board pass found nothing broken. I saw no 500 or page error in any run.

| # | Severity | Gap | Status |
|---|---|---|---|
| 6 | must-fix | Blank card title, list name or label name → 500 | **Fixed**: 422 "can't be blank" (18 requests) |
| 7 | must-fix | Out-of-range ids → 500 | **Fixed**: 404 or 422 on every Boards row, and no 500 on the task boards. See gap 10 for a leftover. |
| 1 | should-fix | ⋮ → Rename did nothing | **Fixed** (mouse and keyboard) |
| 5 | should-fix | Chip said "Removed" with one of two tasks still live | **Fixed** |
| 2 | minor | Unsaved description dropped on close | **Fixed** on ✕, Escape, backdrop and Back |
| 3 | minor | Enter on "Add the label" did nothing | **Fixed** |
| 4 | minor | Non-manager could restore a list holding a locked card | **Fixed**: 423 |
| 8 | minor | Archived list could be renamed | **Fixed**: 422 |
| 9 | minor | History said "(left the bar board)" | **Fixed**: "(left the Taproom)" |
| **10** | **minor (new)** | Task boards accept out-of-range ids silently: a `before_id` the server doesn't recognise → 200 and the task goes to the end; a History `task_id` it can't parse drops the filter | New |

## New gap

### 10. Task boards accept out-of-range ids silently (minor)

- **Path:** the task-board parts of gap 7 that BRIEF2 says should now give 404/422.
- **Expected:** 404 or 422, the same as the Boards. A board card move with a foreign or missing `before_id` gets 404.
- **Observed:** there are no 500s, but there are no 4xx either:
  - `POST /api/boards/bar/tasks/:id/move` with `before_id` set to `1e20`, `99999999999999999999`, `999999`, `"abc"`, `-1`, or a task on another day returns **200**, and the task moves to the end of the day. Only a real `before_id` on that day positions it. This matches how any unknown id is treated, so nothing is lost, but the client gets no signal.
  - `GET …/tasks/history?task_id=99999999999999999999` (also `1e20`, `abc`, `-1`) returns **200 with the whole board's History** (926 rows, page 1), as if no filter were set. An in-range missing id (`999999`) correctly returns 0 rows. A screen asking for one task's history would show every task's.
  - A huge History `page` (`99999999999999999999`, `1e20`, `-1`, `abc`) returns page 1. `2147483648` and `9223372036854775807` are clamped to `page: 1000000` and return no rows. The Boards History behaves the same. This is harmless; I'm noting it because it's inconsistent.
- **Not affected:** task URL ids (`GET`/`PATCH`/`DELETE`/`move` on `/tasks/99999999999999999999`) → 404, and `assignee_ids:[1e20]` on create or edit → 422.
- **Repro:** as `bartender1`, `POST /api/boards/bar/tasks/<your task>/move` with `{"due_on":"2026-11-12","before_id":1e20}` → 200. As `barMgr`, `GET /api/boards/bar/tasks/history?task_id=1e20` → 200 with all rows.

## Scenarios

| # | Result | Notes |
|---|---|---|
| R1 | **Pass** (gap 10 minor) | **6:** as `bartender1`, card title `""`, `"   "` and `null` on PATCH and create, list name the same, and title missing on create. As `barMgr`, label name `""`, `"   "` and `null`, and new label `"   "` and `null`. All 18 → 422 "can't be blank", and the card was unchanged. **7:** every row of my original table → 404, or 422 for id arrays and the checklist order, including `send_to_tasks` with `assignee_ids:[1e20]` (422) and `then_list_id`/`list_id` `1e20` (404). I also tried 14 more URL-id endpoints (PATCH card, archive and restore card and list, notes POST, lock, delete, label PATCH, and `2^31`, `2^63`, `-huge` and `1.5` list ids), and all gave 404. Task boards: see gap 10. **1:** ⋮ → Rename focuses a "List name" field holding the current name, with the mouse and with keyboard Enter. Escape cancels with no request. **5:** a per-item send shows **"2 on the task list"**, then **"On the task list"** after one task is deleted, then **"Removed from the task list"** after both are. The card dialog lists each task's state. **2:** ✕, Escape, backdrop click and Android back (`page.goBack()`) each ask "Discard your changes to the description? What you typed in the description isn't saved." with KEEP EDITING and DISCARD. Nothing is sent either way. **3:** Enter on `Add the label "…"` → `POST /labels`, then the card's `label_ids` update. **4:** `barMgr` locks a card in list Y and archives Y. `bartender1` restoring Y → **423** "This list holds a locked card, so only a manager can restore it", and Y stays archived. **8:** renaming an archived list → 422 "That's archived. Restore it first", for a non-manager and for `barMgr`. **9:** a `[TEST-TEMP]` person on a Taproom card and an archived Taproom card was removed from the Taproom. They came off both cards, and History reads "Took [TEST-TEMP] R1 Leaver off … **(left the Taproom)**" (`reason: left_bar`). |
| R2 | **Pass** | Clicking the list title still renames it, with one History row per rename. `barMgr` restores the locked-card list (200). The card stays locked, and a non-manager edit of it → 423. Through the UI, a non-manager's RESTORE in Archived shows the 423 message. A per-item send with both tasks deleted → "Removed from the task list". **Discard** closes the card, and on reopening the description is the saved one, not the discarded text. **Keep editing** returns to the card with the typed text intact and the URL unchanged, for all four ways of closing. With nothing unsaved, all four close at once with no prompt. After SAVE, Escape closes at once. **Escape inside the label picker** (empty, with text typed, or with a dirty description) closes only the picker, and the card stays open with its text. The same goes for the People picker. Escape after the picker has closed goes to the card and prompts if the description is dirty. |
| R3 | **Pass** | **B3** (`bartender1`, UI): add a card; SAVE a description; two checklist items, one ticked; two notes, with one edited ("edited") and one deleted; a person; a due date; a seed label; mouse drag Ideas → Planned; archive; Archived search by title and by description (ignoring case), where a note doesn't match; restore. After reload, everything persisted and the card is back in Planned. **B4** (API): **71 of 71 as expected.** A locked list and a card in it, and a locked card in an open list. Rename, move, archive and add a card in the locked list → 423, and unlock and delete → 403. On each card, title, description, due date, people, labels, an empty PATCH, archive, the checklist (add, toggle, rename, reorder, delete), move and Send → 423. Notes add, edit and delete own → 201, 200 and 204. Watch works. Archiving the open list holding the locked card → 423. Label manage, lock and History as a non-manager → 403. Restoring an archived locked card → 423 for a non-manager and 200 for a manager. The manager edits, moves into, renames and ticks the locked items. Company: `barMgr` lock and History → 403, owner lock → 200, `barMgr` editing it → 423, and a note from `barMgr` → 201. **B6** (UI): notes mode puts one task on the due date (Nov 14) with both people, notes "description + ☑/☐ lines", and the chip "On the task list". Per item, plus a move to Done, on an overdue card ("The card was due before today") gives two tasks Today and the chip "2 on the task list", and the card is in Done. Task → Edit shows "From the Taproom board: [TEST-TEMP] R3 send notes", which links to `/boards/bar/cards/362` and opens the card. **B7** (`taproomDevice`, 1280×800 touch): no Add a card, Add a list or ⋮. The gear shows Show/All only, and clicking a list title doesn't edit it. A drag sends nothing. The card dialog's only control is Close, and Escape closes it with no prompt. 17 API calls (writes, a blank title, Archived, History, Company create, the Brewery board) → 403, and Company read → 200. |
| R4 | **Pass** | `brewer1`, Brewery task board. A task with Jake and Riley shows both; adding Morgan, then cutting to Riley alone, works. A weekly series with Jake and Riley, edited "following" from the 2nd occurrence to Jake and Morgan, changes 11/16 onward and leaves 11/09. History: `edited`, `scope: following`, `people: {added:[Morgan], removed:[Riley]}`, `count: 52`. `?task_id=<occurrence>` returns that series' row only. **Moves with `before_id`:** ABC → C before A = CAB; A before B (already before it) = CAB; B to the end; A to 11/14; B to 11/14 before A = BA; C to Future and back before B = CBA; A before itself, no change. The board renders in the UI. The Taproom task board → 403 for `brewer1`. |

## Data made and cleaned

| Item | What happened |
|---|---|
| Board lists | 5 `[TEST-TEMP] R1/R3 …` lists on the Taproom board (one archived, one restored by a manager). All **deleted for good** by `barMgr`. |
| Board cards | 15 `[TEST-TEMP] R1–R3 …` Taproom cards and 1 Company card. All **deleted for good**, including archived and locked ones. |
| Labels | `[TEST-TEMP] R1 lbl`, `R1 Enter`, `R2 Enter2` and `R3 lbl` (Taproom), all **deleted**. |
| Task-board tasks | Taproom: 6 one-offs (`[TEST-TEMP] R1 task`, `R1 task 2`, `R3 send notes`, `R3p one`/`two`, `R2 item one`). Brewery: 1 weekly series (`R4 following`) and 4 one-offs (`R4 two people`, `R4 move A/B/C`). All **deleted**. Six more per-item tasks were deleted during R1 as part of the test. A rescan of Taproom, Brewery, Office and Sales from 2026-10-26 to 2027-03-31 found 0 left. |
| People | `[TEST-TEMP] R1 Leaver` (3490), `test-temp-d53p2-r1leaver@rockcut-test.com`, created through `POST /api/users` as `owner`. They were removed from the Taproom (the gap 9 test) and are now **deactivated**, with no departments and no staff code. |
| `[SEED]` data | Unchanged. All seven seed cards still have `updated_at` 18:12:36Z (the reseed, before my first call), and the same lists, positions and locks. |
| Shared personas | No theme, membership or password changes, and no sign-outs. |
| History | My rows can't be removed and remain in the Taproom and Company board History and the Taproom and Brewery task History. |
| Messages | None posted. |

## How I ran this, and things to know

- **No temporary passwords:** the only `[TEST-TEMP]` person was created through the API as `owner`. Inside the page, the response had every key matching `pass|token|secret` deleted before it was returned (`scripts/recheck/mkperson.js`), so no `temp_password` value reached my session output, a log or a file. I never signed in as that person. I changed their membership and active flag as `owner`.
- **Session value:** read inside the page for API calls (`scripts/lib.js`), as before. It was never returned, printed, logged or screenshotted, and `auth/*.json` wasn't opened. A scan of `results/` and `scripts/` found no credential-like strings.
- **Someone else is writing `[TEST-TEMP]` data on the Taproom board.** History showed lists and cards like `[TEST-TEMP] Locked mw85n7t8hvs3`, `Tablet mw85…` and `Watched mw85…` being created and deleted while I worked. It looks like another automated run. My cleanup matched only `[TEST-TEMP] R1–R4 …` names and my R4 task titles, so I left theirs alone.
- **Not a bug, but worth knowing:** confirming a list rename sends the same `PATCH …/lists/:id` twice, probably once on Enter and once on blur. It makes only one History row and no visible effect. Choosing a label or person closes the picker, so a later Escape closes the card (or prompts, if the description is dirty), which is consistent.
- **Scripts:** `scripts/recheck/`. Screenshots: `results/r1_*.png`, `r2_*.png`, `r3_*.png`, `r4_taskboard.png`. Progress: `results/progress_recheck.log`.

## What I couldn't test

- **Anything that needs the `[TEST-TEMP]` person's own session** (under the no-temporary-passwords rule). I didn't check, for example, that the leaver sees the Taproom board disappear, or what notifications they get. Gap 9 only needed the manager's History view, so it was fully tested.
- **B5 (Watch) and B8 (leaving/deactivation):** not re-run, as BRIEF2 says.
- **Push, real phones and tablets, and a real Android back button:** as before, the browser was emulated Chromium and Back was `page.goBack()`.
- **Gap 7 on the Office and Sales task boards:** I tried it on the Taproom task board, and ran R4 on the Brewery one.
