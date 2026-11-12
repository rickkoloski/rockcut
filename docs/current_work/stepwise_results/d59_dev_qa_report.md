# D59 Owners department: independent QA report (DEV)

- **Build:** `b660fd0cef8de0954e44dbfcdddaa8e0e56b688d` (`GET /api/health` → `env: dev, status: ok`; ribbon `DEV · b660fd0`)
- **Date:** 2026-11-11 (America/Denver)
- **Environment:** https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev only. Prod was never touched.
- **Method:** Playwright (headless Chromium) driving the UI with the provided storageState files. API calls were made from inside each persona's page using that page's own session. No tokens, codes or `temp_password` values were printed, logged or screenshotted. Screenshots are in `results/shots/` and scripts are in `scripts/`.
- **Sizes:** desktop 1366×768 for everything. Q2, Q4 and Q6 were repeated at phone width (390×844, touch, mobile).
- **Personas used:** `owner`, `owner2`, `ownersAsst`, `dualMgr`, `breweryMgr`, `office1`, `sales1`, `noDept`, `bartender1`, `taproomDevice`, `breweryDevice`.

## Verdict: **fail**

All the user-facing paths behave as the brief says. Owners never shows up in a non-member's lists, switchers, dialogs, typed URLs, notifications or schedule, and every Owners board and channel route refuses them. **But two API surfaces still give Owners away to every signed-in non-member, including shared devices:**

- `/api/departments` returns the department.
- `/api/roster` returns who is in it.

Validation errors also name Owners to people who can't see it. Under the brief's must-fix definition ("Owners … name visible to someone who isn't an owner or member"), these are must-fix.

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 2 | 5, 6 |
| should-fix | 1 | 1 |
| minor | 4 | 2, 3, 4, 7 |

## Gaps

### Gap 5: must-fix: `/api/departments` and `/api/roster` expose Owners and its membership to every non-member (desktop; API)
- **Path:** sign in as any non-member (`office1`, `sales1`, `noDept`, `breweryMgr`, `dualMgr`, `taproomDevice`, `breweryDevice`), then `GET /api/departments` and `GET /api/roster`. The app's own pages call both of these on load.
- **Expected:** Nobody but owners and members sees Owners "anywhere else", including its name.
- **Observed:**
  - `/api/departments` returns `{"id":6,"name":"Owners","key":"owners","color":"#37474F","owners_only":true,"scheduling":false}` to all of them.
  - `/api/roster` returns `{"id":3820,"name":"Ellis Assist","departments":["office","owners"]}`, which tells any employee, and even a shared tablet, who is in Owners.
  - The UI doesn't render either value, so nothing shows on screen. But it is in every page load's network traffic.
- **Repro:** `node scripts/q6_api.js office1` (look at the `departments` and `roster` lines). It reproduces the same way for every non-member persona and both devices.

### Gap 6: must-fix: API errors name Owners to non-members (desktop; API)
- **Path:** as `breweryMgr`, `POST /api/positions {"name":"…","department_id":6,"group":"Owners"}`.
- **Expected:** A neutral refusal (403/404/422 without the name), like the other Owners routes, which return `{"error":"Forbidden"}` to non-members.
- **Observed:** `422 {"errors":{"department_id":["Owners isn't on the schedule"]}}`. Two related signals:
  - Owners routes answer non-members with 403, but an unknown department key (`/api/boards/OWNERS/tasks`, `/api/boards/6/tasks`) answers 404. That difference confirms an `owners` board exists.
  - For `dualMgr`, a user create that includes Owners returns `403 "Cannot assign roles in department: owners"`. That one is lower risk, because a manager can already see Owners membership chips by design.
- **Repro:** as above. Compare with `POST /api/schedule_events` with `department_id:6` as `breweryMgr`, which correctly gives a neutral `403 Forbidden`.

### Gap 1: should-fix: the API accepts an owner as assignee on non-Owners boards (desktop; API)
- **Path:** as `owner`:
  - `POST /api/boards/brewery/tasks {"title":"[TEST-TEMP] …","assignee_ids":[<Avery Owner>]}`
  - the same on `/api/boards/office/tasks`
  - `PATCH /api/idea_boards/brewery/cards/<id> {"assignee_ids":[<Avery Owner>]}`
- **Expected:** "Every other board still offers only its own members (no owners)." The UI picker on Brewery correctly lists only Brewery members, and a non-member non-owner is refused (`422 "Pat Ledger must be a Brewery member"`).
- **Observed:** `201` / `200`. The owner (not a Brewery or Office member) is saved as assignee. The task shows "AO" on the Brewery board for `breweryMgr` and `breweryDevice`, and stays assigned after an edit through the UI. So the server rule is wider than the UI's, and a board can carry an assignee its own picker can't show or re-select. This may predate D59, but it contradicts the stated rule.
- **Repro:** the API calls above (cleaned up afterwards).

### Gap 2: minor: Owners task board offers "Hide shifts" (desktop + phone)
- **Path:** `owner` or `ownersAsst` → Tasks → Owners → Board settings.
- **Expected:** Owners has no schedule header, so there are no shifts to hide.
- **Observed:** The menu still has a "Hide shifts" toggle. It does nothing visible.

### Gap 3: minor: Owners membership is called "Member" in the dialog but "employee" in the grid (desktop)
- **Path:** `owner` → Users & Roles. Give a person Owners = Member, then look at the Roles column.
- **Observed:** The grid says `Office: employee, Owners: employee`. The dialog says "Member" and "Owners has no managers". `dualMgr` sees the same "Owners: employee" text in the grid.

### Gap 4: minor: locked-card wording uses the owner's name, not "Locked by an owner" (desktop)
- **Path:** `owner` locks a `[TEST-TEMP]` card on the Owners Idea Board, then `ownersAsst` opens it.
- **Expected:** "Locked by an owner" / "Only an owner can change it".
- **Observed:**
  - Dialog alert: "Locked by Olivia Owner · Nov 11. Only an owner can change it. Notes stay open."
  - Card face tooltip: "Locked by Olivia Owner · Nov 11".
  - The API's 423 body does say `"Locked by an owner"`, and the second sentence matches the spec.

### Gap 7: minor: assignee refusal message grammar (desktop; API)
- **Path:** as `owner`, `POST /api/boards/owners/tasks` (or `PATCH` an Owners card) with a non-member, non-owner assignee.
- **Observed:** `"Jake Brewer must be a Owners member"`. The grammar is wrong ("a Owners"), and the message leaves out that owners are also allowed.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Health sha and ribbon `DEV · b660fd0` both match. |
| Q2 | PASS (gaps 1, 2, 7) | **Switcher:** Brewery, Taproom, Office, Sales, **Owners**, All departments. No schedule header on Owners. **Assigning:** the picker offered Ellis Assist, Avery Owner and Olivia Owner. A task assigned to `owner2` and `ownersAsst` saved and survived a reload. The Brewery picker offered only Brewery members. **Owners features:** a weekly repeat task, Daily items (add, then they show on every day) and History all worked. **Phone:** switcher, add-with-picker and reload all fine. |
| Q3 | PASS (gap 3) | **Choices:** the Users & Roles Owners choice is "— None — / Member" only, with "Owners has no managers". **Add/remove:** added a `[TEST-TEMP]` Office person to Owners; the API confirmed `owners:employee`, the roster showed them and the Owners picker offered them. Removing it again worked. `ownersAsst`'s `/api/me` shows the Owners task and Idea boards. **Manager refused:** Owners as `manager` returned 422 "Owners has no managers" as `owner`, on both create and membership PUT. |
| Q4 | PASS | `ownersAsst` on desktop and phone: add, tick, untick, Change day → tomorrow, edit title and notes, and delete all worked. No History, no Daily setup and no Daily card menu. The API gave 403 for history and daily-item create. The seeded Owners task was visible and untouched. |
| Q5 | PASS (gaps 1, 4) | **`ownersAsst`:** added a card, assigned people (picker offered members + owners; a non-member got 422), added a note, and dragged the card Ideas → Planned. No History, Lock or Edit labels. The API refused History/lock/unlock/label-rename with 403. **`owner`'s lock:** after `owner` locked a `[TEST-TEMP]` card, `ownersAsst` saw a read-only dialog. The API refused edit/move with 423 "Locked by an owner", and archiving the list that holds the card was refused. Members can create labels inline, the same as on Office and Company boards. |
| Q6 | **FAIL (gaps 5, 6)** | **UI (desktop + phone, `dualMgr`/`office1`/`sales1`/`noDept`/`breweryMgr`):** Owners appears in no task or idea switcher, `/tasks`, `/tasks/all`, Idea Boards, Messages channels, Calendar sync, View Schedule filter, Scheduler, or the Users & Roles Add/Edit department choices. **Typed URLs:** `/tasks/owners` and `/boards/owners` redirect to the person's own board. `/messages/dept:owners` shows "Channel not found". **API:** all 28 Owners task, Idea Board and channel routes (read and write) were refused (403/404). Notifications showed nothing. The leaks are the API ones in gaps 5 and 6. |
| Q7 | PASS | `dualMgr` saw "Owners member · Only owners change Owners membership" as a read-only line. Rename + Office role → Manager, adding Taproom, and removing Taproom all saved, and Owners stayed after a reload each time (the UI PUT omits Owners and the server keeps it). **API, nothing changed in any case:** adding Owners (alone, with an Office change, or swapping Office for Owners) gave 403. Removing Owners with role null/"none" gave 422. Owners as manager gave 422. Create-with-Owners gave 403. An empty membership PUT removed only Office and kept Owners. |
| Q8 | PASS (gap 6) | **UI, as `owner` and `breweryMgr`:** no Owners in the Scheduler grid, Add shift positions, Add event departments, Positions dialog, Templates, View Schedule department filter or Calendar sync. **API, all 422 "Owners isn't on the schedule":** position create in Owners; moving an existing `[TEST-TEMP]` Office position into Owners (PATCH and PUT); event create; weekly series create; moving an Office event or series into Owners (scope all/following). A shift with no position gave 403. Rotating a department calendar feed for Owners gave 404 (`owner` and `breweryMgr`). |
| Q9 | PASS | The Add shared device home picker lists Brewery, Office, Sales, Taproom. API create with home = Owners gave 422 "can't be Owners". Device count stayed at 2, and no device was created or changed. |
| Q10 | PASS | `ownersAsst` posted in Owners; `owner` and `owner2` read it (API + UI). `owner2` (in-app on) got the "Owners · Ellis Assist: …" bell notice. `office1` got 403 on the channel and no notice; so did `dualMgr`. `office1` posted in Office, and `owner2` (in-app on, not an Office member) got no notice. Prefs were restored exactly (see below). |
| Q11 | PASS (gap 5 applies) | **Both devices:** typed `/tasks/owners` and `/boards/owners` redirect home, and `/messages/dept:owners` shows "Not available on a shared device". All Owners routes were refused (403). Their own task board, Idea Board and Company board load read-only. |
| Q12 | PASS | **Tasks → All departments:** Owners is the last group on each day and includes the Owners task. **Idea Boards:** Brewery, Taproom, Office, Sales, **Owners**, Company. **Messages:** All-staff, Managers, Brewery, Office, Sales, Taproom, **Owners**. **Departments:** `/api/departments` and the Users & Roles dialog put Owners last. |
| Q13 | PASS | `dualMgr` edited an Office-only `[TEST-TEMP]` person (rename + add Taproom); it saved with no errors. The Scheduler as `breweryMgr` loads and navigates weeks. A Brewery task create/complete/delete worked, and Brewery task and Idea history mention no Owners. `bartender1` Messages, the Company and Office boards, and an Office post all work. Existing department colours are consistent across lists. Nothing odd was seen in existing boards or channels. |

No 5xx, crash or hang was seen in any response or page during the run.

## Data made and cleaned

| Kind | Id / name | Outcome |
|---|---|---|
| People | 3904 `[TEST-TEMP] Q3 Office …` | deactivated |
| People | 3905 `[TEST-TEMP] Q7 Office+Owners …` | deactivated |
| People | 3906 `[TEST-TEMP] Q7 Office only …` | deactivated |
| Owners tasks | 125550, 125604, 125607, 125608 | deleted |
| Owners weekly repeat | series 1728 (125551–125562) | deleted with "this and all following" |
| Brewery task | 125605 | deleted |
| Brewery task | `[TEST-TEMP] Q13 brewery regression` + 125610 | deleted |
| Office task | 125606 | deleted |
| Owners Daily item | 1675 | retired, then deleted |
| Owners Idea Board cards | 608, 609 | archived and deleted (609 unlocked first) |
| Owners Idea Board list | 426 | archived and deleted |
| Owners label | 81 | deleted |
| Brewery Idea Board card | 610 | archived and deleted |
| Position | 11 `[TEST-TEMP] Q8 pos` (Office) | deleted |
| Schedule event | 22090 (Office, draft) | deleted |
| Event series | 905 / 22091 (Office, 53 draft events) | all deleted |
| Message (can't be deleted) | Owners channel, by `ownersAsst`: `[TEST-TEMP] Q10 owners post d59qa` | remains |
| Message (can't be deleted) | Office channel, by `office1`: `[TEST-TEMP] Q10 office post d59qa` | remains |

After cleanup, the Owners task board holds only `[SEED] Review the quarterly numbers`, and the Owners Idea Board holds only `[SEED] Second taproom location` in its four seeded lists.

- **Notification preferences:** `owner2` and `office1` were both `{}` before. I set `message_posted.in_app = true` for Q10, then restored both to exactly `{}` with `PUT {"prefs":{}}` and read them back to confirm.
- **Side effect to know about:** in Q7, a `dualMgr` API membership PUT with `[]` removed Office from my `[TEST-TEMP]` person (3905). As designed, the app then **rotated the Office calendar feed link** and sent a "Re-subscribe to your Rockcut calendar" notice to Office feed holders and owners. Anyone subscribed to DEV's Office feed needs the new link. Seeded personas were not otherwise changed.

## Couldn't test / limits

- **Push notifications:** untested, since push can't be received here. Only the in-app side was confirmed.
- **`owner`'s in-app notice for the Owners post:** `owner`'s message pref defaults to off, and only `owner2`/`office1` prefs may be changed. So for `owner` I confirmed only that they can read the post.
- **Signing in as a `[TEST-TEMP]` person:** not possible (no passwords). Member access was checked through the API as `owner`, with `ownersAsst` as the reference.
- **Changing an existing device's home to Owners:** not tried, because it would modify a seeded device. Only create was tested.
- **Templates / Copy last week / series into Owners:** every route into Owners (creating or moving a position, event or series) was refused. So no Owners shift could be made for a template or copy to carry, and the template-apply and copy paths themselves couldn't be pointed at Owners.
- **Phone width** was covered only for Q2, Q4 and Q6, as the brief asks.
- **Ordering for non-owner members** (e.g. `ownersAsst`'s switcher: Office, Owners) was checked only in passing.
