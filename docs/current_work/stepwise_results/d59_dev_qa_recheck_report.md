# D59 Owners department: QA recheck after fix cycle 1 (DEV)

- **Build:** `f6c904f8612a552b73db35ebd919a1050bc463d6` (`GET /api/health` → `env: dev, status: ok`; ribbon `DEV · f6c904f — fictional test data only`)
- **Date:** 2026-11-11, 20:13–20:45 America/Denver
- **Environment:** https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev only. Prod was never touched.
- **Method:** As in the first pass. Playwright (headless Chromium) used the provided storageState files. API calls were made from inside each persona's page using that page's own session. No token, code, password or `temp_password` was printed, logged or screenshotted. New scripts: `scripts/r2_leaks.js` (network-level leak sweep), `scripts/r7_q10.js` (notifications with guaranteed pref restore), `scripts/repl2.js` / `scripts/r2.sh` (a REPL on port 9340, because the first pass's REPL still holds 9339). Screenshots are `results/shots/r*.png`.
- **Sizes:** desktop 1366×768 throughout. At phone width (390×844, touch): the R2 leak sweep, R6 board settings, R7 Q2/Q4/Q6.
- **Personas used:** `owner`, `owner2`, `ownersAsst`, `dualMgr`, `breweryMgr`, `office1`, `sales1`, `noDept`, `barMgr` (read only), `taproomDevice`, `breweryDevice`.

## Verdict: **fail** (one narrow must-fix)

The fix cycle did what it said:
- `/api/departments`, `/api/roster`, `/api/me`, channels and every page's network traffic no longer mention Owners to non-members, including both shared devices.
- Schedule refusals are neutral.
- Hide shifts is gone from the Owners board.
- The grid says "Owners: member".
- The assignee refusals are worded correctly.

**One path still names Owners to a non-member:** a manager who asks for the *manager* role in `owners` gets "Owners has no managers" (gap 9). It only shows up for someone who already typed the key `owners` into an API call, so the exposure is small. But it is the department's name shown to someone who isn't an owner or member, which the brief counts as must-fix. Two smaller existence oracles remain (gap 8), and I found one permissions hole that probably isn't D59's (gap 10).

## Summary

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 1 | 9 |
| should-fix | 1 | 10 (likely predates D59) |
| minor | 1 | 8 |

### First-pass gaps, rechecked

| Gap | Status |
|---|---|
| 1 (owners accepted as assignees on any board via API) | Accepted, unchanged. Not retested beyond seeing that pickers offer no owners on Brewery. |
| 2 (Hide shifts on Owners) | **Fixed.** Desktop and phone, `owner` and `ownersAsst`. Office still has it. |
| 3 ("Owners: employee" in grid) | **Fixed.** Shows "Owners: member" for `owner` and `dualMgr`. |
| 4 (locked card names who locked it) | Accepted, not retested. |
| 5 (`/api/departments`, `/api/roster` leak) | **Fixed.** See R2. |
| 6 (errors name Owners) | **Mostly fixed.** Position, event and series messages are neutral, and adding Owners gives "You can't assign roles in that department". The manager-role refusal still names it (gap 9). |
| 7 (assignee refusal grammar) | **Fixed.** See R6. |

## Gaps

### Gap 9: must-fix: asking for the manager role in Owners returns "Owners has no managers" to managers who can't see Owners (desktop; API)
- **Path:** as `breweryMgr`, who has no Owners anywhere:
  - `PUT /api/users/<a [TEST-TEMP] Brewery person>/memberships {"memberships":[{"department":"brewery","role":"employee"},{"department":"owners","role":"manager"}]}`
  - the same with only the Owners entry
  - `POST /api/users` with that membership list
- **Expected:** a refusal that doesn't name the department (BRIEF2: "Membership refusals don't name the department"), the same as asking for the employee role there.
- **Observed:**
  - `422 {"errors":{"memberships":["Owners has no managers"]}}` in all three cases.
  - Asking for `owners` as employee correctly gives `403 "You can't assign roles in that department"`.
  - An unknown key (`zzz`) gives `422 "unknown department"`.
  - So the manager-role answer both names Owners and confirms it exists. `dualMgr` gets the same answer (lower risk there, since a manager sees the Owners chip by design).
  - Nothing changed on either person.
- **Repro:** as above. I used person 3992 (`[TEST-TEMP] R5 Brewery only`), now deactivated; any Brewery-only person works.
- **Note:** the role check runs before the "can you assign in this department" check. Checking permission first would make this the neutral 403.

### Gap 10: should-fix: a Brewery manager can create, rename and delete a position in Office (desktop; API; probably predates D59)
- **Path:** as `breweryMgr`, `POST /api/positions {"name":"[TEST-TEMP] R5 probe","department_id":3}`, then `PATCH` and `DELETE /api/positions/<id>`.
- **Expected:** 403, as for events (`POST /api/schedule_events` with `department_id:3` as `breweryMgr` gives 403).
- **Observed:** `201`, then `200` and `200`. The position (id 13) appeared in `dualMgr`'s position list. I deleted it straight away.
- **Repro:** as above. I didn't touch any seeded position, but the same rule presumably applies to them.

### Gap 8: minor: existence oracles for Owners (desktop; API)
None of these return data or the name, but each tells a non-member who guesses the key or id that Owners exists. That runs against "Non-members can't tell Owners exists".
- `GET /api/boards/owners/tasks` and `GET /api/idea_boards/owners/lists` → `403 Forbidden`, while `/api/boards/zzz/…` and `/api/idea_boards/zzz/…` → `404`. Brewery, which `office1` also can't see, is 403 too, so it's "a board exists", not "it's Owners". Channels are uniform (`dept:zzz` is also 403).
- `POST /api/positions {"department_id":6}` → `422 "That department isn't on the schedule"`; `department_id:99` → `422 "does not exist"`.
- Membership `{"department":"owners","role":"employee"}` → `403`; `{"department":"zzz"}` → `422 "unknown department"` (see also gap 9).

## Scenarios

| # | Result | Notes |
|---|---|---|
| R1 | PASS | Health sha and ribbon `DEV · f6c904f` match. |
| R2 | PASS (gap 8) | **Pages:** `scripts/r2_leaks.js` loaded Home, Tasks, All departments, Boards, Messages, Scheduler, View Schedule, Users & Roles, Profile, Time off and Availability, and opened both switchers. It ran for `office1`, `sales1`, `noDept`, `breweryMgr`, `dualMgr`, `taproomDevice` and `breweryDevice` on desktop, and for `office1`, `noDept`, `dualMgr` and `taproomDevice` on phone. It scanned every `/api/` response for `Owners`, `"owners"`, `dept:owners`, the Owners colour and `department_id 6`. **Clean for every persona.** **Endpoints called directly:** `/api/departments`, `/api/roster`, `/api/me`, `/api/channels`, `/api/notifications`, `/api/users`, positions, schedule events, each own board's tasks, idea people and lists, and task and idea history. No Owners on screen or in traffic. `/api/departments` now lists Brewery, Office, Other, Sales, Taproom. The roster shows Ellis Assist as `["office"]`. **Only exception:** `dualMgr`'s `/api/users` includes the Owners membership of people they can edit (Ellis, a `[TEST-TEMP]` Office manager), which is the accepted read-only chip. Managers only get people in their own departments. Re-running the first pass's `q6_api.js` (28 Owners routes) as `office1` and `taproomDevice` gave 403/404 throughout. |
| R3 | PASS | `owner`, `owner2` and `ownersAsst` all get Owners last in `/api/departments`, and Ellis Assist is `["office","owners"]` on the roster. No roster entry has Owners anywhere but last. **`owner` UI:** task switcher Brewery, Taproom, Office, Sales, Owners, All departments. Idea switcher …, Sales, Owners, Company. Channels …, Taproom, Owners. **`ownersAsst` UI:** task switcher Office, Owners; idea switcher Office, Owners, Company; channels All-staff, Office, Owners. **Grid:** `owner`'s Users & Roles shows Ellis as "Office: employee, Owners: member". |
| R4 | PASS | **Dialog:** `owner` made 3990 `[TEST-TEMP] R4 Office+Owners`. In `dualMgr`'s dialog it shows "Owners member · Only owners change Owners membership." as read-only. **Saves:** rename plus Office → Manager plus add Taproom saved (UI sends PATCH, then a memberships PUT without Owners). Owners was still there after reload. Adding and removing Taproom twice more (timed, under 1 s each) kept Owners each time. **API:** as `dualMgr`, adding Owners alone, with Office kept, or with an Office role change, and creating a user with Owners, all gave `403 "You can't assign roles in that department"`. Removing Owners (`role: null`/`"none"`/`""`) gave `422 "invalid role"` (neutral, not 403). Owners stayed on 3990, and 3991 stayed Office-only. See the first note under "Couldn't test / limits". |
| R5 | **FAIL (gap 9; gaps 8, 10 found here)** | **Positions:** create in Owners, and PATCH/PUT of a `[TEST-TEMP]` Brewery position into Owners, gave `422 "That department isn't on the schedule"` for `breweryMgr`, `dualMgr` and `owner`. **Events and series:** event create, weekly and monthly series create (the payload the Add event dialog sends, captured and aborted), and moving a `[TEST-TEMP]` event into Owners (plain, `scope=all`, `following`) gave a neutral `403 Forbidden` for the managers and the neutral 422 for `owner`. **Shifts:** a shift with no position is 403. A shift posted with `department_id:6` and a normal position is created in the *position's* department (Brewery/Office), not Owners. Two stray draft shifts from this probe were deleted. Nothing landed in Owners. Membership refusals are neutral except the manager role (gap 9). |
| R6 | PASS | **Board settings:** Owners has View All, Hide completed, First day, Days shown, plus Set up Daily checks and History for `owner` only, with no Hide shifts. Same on desktop and phone for both personas; Office still has Hide shifts. **Grid:** "Owners: member". **Owners refusal (task and card):** "Jake Brewer must be an Owners member or an owner". **Other boards:** "an Office member", "a Brewery member", "a Taproom member", "a Sales member", on tasks and Idea Board cards. |
| R7 | PASS | **Q2 (`owner`):** Owners has no schedule header. Its picker offers members ([TEST-TEMP] 3990, Ellis) plus both owners. A weekly task assigned to Avery Owner and Ellis Assist saved and survived a reload. The Brewery picker lists only Brewery people. History and Daily items open. Phone switcher and picker are the same. **Q4 (`ownersAsst`):** add, tick (the "where should it show as done" prompt), untick, change day, edit title/notes, and delete, on desktop; add/tick/untick/delete on phone. History and Daily setup are absent (API 403). The seeded Owners task is unchanged. **Q6:** typed `/tasks/owners` and `/boards/owners` redirect to the person's own board, and `/messages/dept:owners` shows "Channel not found" (`office1`, `dualMgr`, `sales1` phone, `breweryMgr` phone). **Q10:** `ownersAsst` posted in Owners. `owner` and `owner2` read it. `owner2` (in-app on) got the bell notice "Ellis Assist: [TEST-TEMP] …". `office1`/`dualMgr` got 403 and no notice. `office1`'s Office post didn't notify `owner2`. **Q12:** All departments puts Owners last (Fri 11/13: Brewery, Taproom, Owners). Idea Boards and Messages order as in R3. |

No 5xx, page error, crash or hang was seen.

## Data made and cleaned

| Kind | Id / name | Outcome |
|---|---|---|
| Person | 3990 `[TEST-TEMP] R4 Office+Owners edited` (Office manager + Owners) | deactivated |
| Person | 3991 `[TEST-TEMP] R4 Office only …` | deactivated |
| Person | 3992 `[TEST-TEMP] R5 Brewery only …` | deactivated |
| Owners weekly task | series 1765 (first 129145) `[TEST-TEMP] R7 Q2 owners task` | deleted with "This and all following" (53 occurrences) |
| Owners tasks | 129198 `[TEST-TEMP] R7 Q4 asst task`, 129199 `[TEST-TEMP] R7 Q4 phone task` | deleted |
| Company Idea Board card | 656 `[TEST-TEMP] R6 assignee probe` | archived and deleted |
| Positions | 12 `[TEST-TEMP] R5 pos` (Brewery), 13 `[TEST-TEMP] R5 probe` (Office, gap 10) | deleted |
| Schedule event | 22281 `[TEST-TEMP] R5 event` (Brewery, draft) | deleted |
| Shifts | 4642 (Brewery draft), 4643 (Office draft): untitled, unassigned, created by the `department_id:6` probe | deleted |
| Message (can't delete) | Owners channel, id 613, by `ownersAsst`: `[TEST-TEMP] R7 owners post d59qa2-…` | remains |
| Message (can't delete) | Office channel, id 614, by `office1`: `[TEST-TEMP] R7 office post d59qa2-…` | remains |

Afterwards, the Owners task board holds only `[SEED] Review the quarterly numbers` (checked through 2027-11). I made nothing on the Owners Idea Board. Every series-create probe was aborted or refused, so no series was created.

- **Notification preferences:** `owner2` and `office1` were both `{}` before. I set `message_posted.in_app = true` for Q10, then restored both to exactly `{}`, read them back and confirmed (`results/r7_q10_prefs_before.json` holds the saved values).
- **Side effect to know about:** deactivating 3990, whom `dualMgr` had made an Office manager in R4, **rotated the Office calendar feed link again**. "Re-subscribe to your Rockcut calendar" notices went to Office feed holders and owners at 20:39 (`owner` and `dualMgr` got one; `barMgr` didn't). The first pass hit the same thing. Removing Taproom from my test people didn't rotate the Taproom feed.
- Seeded personas, devices, positions and rows were not changed (apart from the restored prefs above).

## Couldn't test / limits

- **Unreproduced:** in R4, two early `dualMgr` saves that removed Taproom from 3990 didn't finish within the 1.5–2 s my script waited before reloading. The first sent no request; the second sent only the PATCH and the dialog stayed open with no message. Six later attempts, timed and waiting for the dialog to close, all finished in under 1 s with PATCH then PUT, on both the Owners person and an Office-only person. I think my reload cut off a slow request; I'm not counting it as a gap.
- **Push notifications:** untested (they can't be received here); only in-app was checked. `owner`'s own in-app notice is untested, because only `owner2`/`office1` prefs may be changed.
- **Signing in as a `[TEST-TEMP]` person:** not possible (no passwords).
- **Gaps 1 and 4** are accepted and weren't retested in depth.
- **Templates / Copy last week:** still unreachable for Owners, since no Owners position, event or series could be made.
- **Changing an existing device's home to Owners:** not tried (it would change a seeded device).
