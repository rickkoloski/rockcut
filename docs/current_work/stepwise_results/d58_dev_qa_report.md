# D58 QA report: independent pass on DEV

- **Build:** `58c961cce824099231aceb8341caecff24a1f716` (`/api/health` → `env: dev, status: ok`; ribbon `DEV · 58c961c`)
- **Date:** 2026-11-12 (America/Denver)
- **Environment:** https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev only. Prod was never touched.
- **Browser:** Playwright Chromium 1.63, headless. Desktop 1366×768; phone 390×844 (touch, isMobile); tablet header at 320/360/384/400 px.
- **Personas used:** owner, breweryMgr, barMgr, dualMgr, brewer1, bartender1, taproomDevice. These were read-only or used with writes blocked: owner2, ownersAsst, floater, brewer2, bartender2, office1, sales1, noDept, breweryDevice (settings baseline), and `inactive` (as a shift target, never signed in).
- **Verdict: FAIL.** 4 must-fix, 2 should-fix, 7 minor.

The most serious issue is not on the scenario list. **Add department** lets any manager turn a read-only row into an editable one. That includes an **owner** (gap 12) and any **Owners member** (gap 13). The manager can then reset that person's password and receives the temporary password, which is an account-takeover path into owner or Owners access. Gap 7 is the same mechanism exposing Owners membership.

## Summary

| # | Severity | Scenario / area | Gap | Size |
|---|---|---|---|---|
| 12 | **must-fix** | S7 / manager rules | Manager can Add department to an **owner**, then rename them, set their staff code and **reset their password** (temp password returned to the manager) | API (desktop) |
| 13 | **must-fix** | S12 / Owners privacy | Manager can Add department to an **Owners member**, reset their password (gets the temp password), then remove the department so their memberships look unchanged | API (desktop) |
| 7 | **must-fix** | S12 / Owners privacy | Add department on a read-only row reveals **Owners** membership (in the PUT response and on the now-editable row) | desktop |
| 1 | **must-fix** | S2 / carry-over | Old local settings are **never carried over** when the server already has a *partial* entry for that board (real DEV accounts have them, e.g. brewer2, owner) | desktop |
| 4 | should-fix | S6 | Calendar-invalid date in the board URL (`2026-02-30`, `2026-11-31`): empty board, only "Enter dates as YYYY-MM-DD", URL not corrected | desktop |
| 6 | should-fix | S11/S12 / Owners privacy | A person in **Owners only** shows "No departments" to a non-Office manager, but Active is greyed with "Only a manager of every department…" (a real no-department person is editable), so the hidden membership can be inferred | desktop |
| 2 | minor | S1 | On touch, the "Board settings" tooltip stays on screen after the menu closes | 390 phone |
| 3 | minor | S4 | API accepts `view: "mine"` for a shared device (UI offers only All / Unassigned) | API |
| 5 | minor | S6 | Reversed or garbage ranges are reset to the default with **no notice** | desktop |
| 8 | minor | S16 | After a weekday split, the earlier series still says "Every Thursday", no end date, "Scheduled through Dec 9, 2027", although its last date is Dec 3, 2026 | desktop |
| 9 | minor | S17 | Deactivating a person leaves their future shifts assigned to them, with no warning | API |
| 10 | minor | S27 | `PUT /api/notification_preferences` stores any value (`null`, `{}`, `push: null`) without validation | API |
| 11 | minor | S28 | An employee can move a manager-locked list *indirectly*: moving an unlocked list in front of it succeeds and shifts the locked list | API (desktop) |

## Gaps in detail

### Gap 12 (must-fix): manager can edit and reset the password of an owner
- **Path:** breweryMgr → Users & Roles → an owner's row (read-only) → Add department → Brewery → Save. The row becomes editable. Then rename, staff code or Reset password.
- **Expected:** owners are never manageable by a manager ("Never for an owner"). Add department should not be offered on an owner's row, or should not make it editable.
- **Observed:** `/api/users` lists `addable_departments: [Brewery]` on **Olivia Owner's** row for breweryMgr. On a `[TEST-TEMP]` owner (id 4266):
  - `PUT /api/users/4266/memberships [{brewery, employee}]` → **200**; row now `can_edit: true`.
  - `PATCH name` → **200** (renamed).
  - `PUT /staff_code` → **200** (code set).
  - `POST /reset_password` → **200**, and the response carries `temp_password` to the manager.
  - Only `active: false` (403) and `is_owner: false` (silently ignored) were refused.
- **Repro:** `scripts/owner_edge.js` (as owner it creates a `[TEST-TEMP]` owner, then drives breweryMgr). The temp password was redacted and never printed.
- **Size:** API. The same row is offered in the desktop UI (Add department shown on owner rows).

### Gap 13 (must-fix): manager can take over an Owners member's account
- **Path:** breweryMgr → read-only row of an Office + Owners person (e.g. Ellis Assist) → Add department → Brewery → the row becomes editable → Reset password → Add department removed again.
- **Expected:** a manager who doesn't manage Office can't reset someone in Owners. At minimum, an Owners member shouldn't become manageable by being added to the manager's department.
- **Observed:** on `[TEST-TEMP] D58QA Office+Owners` (id 4263): add Brewery → 200; `POST /reset_password` → **200, `temp_password` returned to breweryMgr**; `PUT memberships []` → 200, leaving Office + Owners as before. The only trace is the change log. A manager can therefore sign in as any Owners member, and with them reach the Owners board.
- **Repro:** `scripts/oo_reset.js`, done on the `[TEST-TEMP]` person only, never on Ellis.
- **Note:** for ordinary staff this follows the spec ("shares a department → editable as before"), but it still means any manager can reset anyone's password in two clicks. Worth a product decision.

### Gap 7 (must-fix): Add department reveals Owners membership
- **Path:** breweryMgr → read-only row of a person in Owners → Add department → Brewery → Save.
- **Expected:** Owners stays hidden from a manager on rows they can't edit.
- **Observed:** the `PUT /api/users/:id/memberships` response (sent while the row is still read-only) includes `{department_key: "owners", department_name: "Owners"}`. The row then becomes editable and shows the Owners chip. Any manager can test anyone this way.
- **Repro:** `scripts/reveal.js` on `[TEST-TEMP]` id 4263 (restored afterwards).

### Gap 1 (must-fix): carry-over skipped when the server has a partial entry
- **Path:** a person whose server `board_settings` already has an entry for a board with only some keys (e.g. `brewery: {view: "all"}` for brewer2, `brewery: {hide_shifts: false}` for owner), opens that board in a browser that still has old `rockcut.tasks.span.brewery` / `firstDay` / `hideCompleted` / `hideShifts` keys.
- **Expected:** the old local settings are carried over (at least the keys the server lacks).
- **Observed:** no write is attempted and the local keys stay. The board shows defaults (2 weeks, Today, not hidden), so the person's old settings are effectively lost. On a board with **no** entry, carry-over works (breweryMgr and breweryDevice tried `PUT …/brewery {"span":7,"hide_completed":true,"hide_shifts":true,"first_day":"monday"}`).
- **Evidence on DEV data:** partial entries exist today for owner (brewery, office), brewer2 (brewery) and floater (bar, brewery). Given "the migrations ran on DEV's real data", real users may be in the same state.
- **Repro:** `scripts/s2d.js brewer2 brewery '<legacy json>'`. It uses real server state with the `PUT` blocked at the network, so the server is untouched. `scripts/s2c.js` reproduces it with a rewritten `/api/me`.
- **Size:** desktop 1366.

### Gap 4 (should-fix): calendar-invalid dates break the board
- **Path:** breweryMgr → `/tasks/brewery?from=2026-02-30&to=2026-03-05` (also `from=2026-11-31…`, `to=2026-02-30`).
- **Expected:** corrected the same way as other invalid ranges (board shown, URL corrected).
- **Observed:** the UI passes the date through, the API answers 422 `invalid_date`, the board area shows only "Enter dates as YYYY-MM-DD" with no days, and the URL keeps the bad range. Screenshot: `results/s6_feb30.png`.
- **Size:** desktop.

### Gap 6 (should-fix): an Owners-only person can be inferred
- **Path:** breweryMgr (or barMgr/dualMgr) → a person whose only department is Owners.
- **Observed:** the row and dialog say "No departments" (`memberships: []`), yet `can_deactivate: false` and the Active switch is greyed with "Only a manager of every department this person is in can change Active." A real no-department person (Nico None, `[TEST-TEMP] NoDept`) has Active enabled. The difference tells the manager the person is in a hidden department, which can only be Owners. Screenshot: `results/s11_owners_only_as_brewerymgr.png`.

### Gap 2 (minor): tooltip sticks on touch
- **Path:** 390×844 touch → board → tap gear → choose a setting → close. The "Board settings" tooltip stays visible over the board (`results/s1_phone_newctx.png`, `results/s3_phone.png`).

### Gap 3 (minor): device accepts view = mine
- `PUT /api/me/board_settings/bar {"view":"mine"}` as taproomDevice → 200. A device has no tasks of its own, and the UI only offers All / Unassigned. (Restored.)

### Gap 5 (minor): no notice on reversed or garbage range
- `/tasks/brewery?from=2026-12-10&to=2026-11-01` and `?from=banana&to=2026-13-45` → the URL is stripped to `/tasks/brewery` and the board shows the default 2 weeks, but there's no notice. Ranges over 31 days get "Showing 31 days (the most a board shows)".

### Gap 8 (minor): stale metadata on the earlier series after a split
- After changing the weekday "this and following" (Thu → Wed from Dec 10), the original series (944) still has `until_date: null`, `weekdays: [4]`, `generated_through: 2027-12-09`. Its edit dialog says "Every Thursday (scheduled 12 months ahead) · Scheduled through Dec 9, 2027", while its last occurrence is Dec 3, 2026. EXTEND returned `count: 0` today, so no duplicates now. Whether a later extend (once the 12-month horizon moves) would re-create Thursdays alongside the new Wednesday series couldn't be tested (see below).

### Gap 9 (minor): inactive people keep future shifts
- `[TEST-TEMP]` shift assigned to an active `[TEST-TEMP]` person → owner deactivates the person → the shift stays assigned to them, and editing notes or time still succeeds (200). There's no warning on deactivate. The new "is not active" rule correctly blocks new assignments only.

### Gap 10 (minor): notification preferences aren't validated
- `PUT /api/notification_preferences {"prefs":{"shift_scheduled":null}}`, `{…:{}}` and `{…:{"push":null}}` are all stored as given (200).

### Gap 11 (minor): locked list displaced indirectly
- barMgr locks `[TEST-TEMP] list B`. bartender1 can't drag it (no change) and `POST …/lists/621/move` → 423 "Locked by a manager". But `POST …/lists/620/move {"before_id":621}` (moving an unlocked list in front of it) → 200, and the locked list moves one place right. Fine if the lock is only meant to stop the locked list's own move. Flagging in case "a locked list keeps its place" was intended.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | health sha and ribbon `DEV · 58c961c` |
| S1 | PASS | desktop and phone: 1 week, Hide completed, Monday, My tasks saved via `PUT /api/me/board_settings/brewery`; same in a new context. Phone view (All days / One day) saved and restored in a new phone context; desktop unaffected. Gap 2. |
| S2 | PARTIAL | carries over once on an empty board (simulated "none on server" via `/api/me` interception, plus real empty accounts with writes blocked); clears the board-scoped local keys; a second load and a stale browser still holding old keys don't overwrite newer server values; other-board keys aren't applied; a failed write keeps the keys for retry. **Gap 1.** |
| S3 | PASS | desktop and phone: View Unassigned and Hide shifts kept after reload; bartender1 still `{}` |
| S4 | PASS | brewery/office/sales/owners/all → 403; 10 other paths (case, ids, body overrides, `/api/users/:id/…`, `PATCH /api/me`) 404/422; `/tasks/brewery` redirects the device to its board. Gap 3. |
| S5 | PASS | All departments Unassigned + 1 week kept in a new context; Brewery entry untouched |
| S6 | PARTIAL | 40 days, 32 days and 1900–2999 → 31 days + notice + corrected URL; API refuses >31 (422). Gaps 4, 5. |
| S7 | PASS* | all 98 users listed; Sam Pour read-only with Add department → only Brewery; added → Taproom + Brewery; owner removed Brewery → Taproom only. *Gap 12 found on this path. |
| S8 | PASS | floater's Active greyed + tooltip; on a `[TEST-TEMP]` Taproom + Brewery person: deactivate (PATCH/PUT) 403, nested `user.active` ignored, `is_owner` ignored, Taproom/Office/Owners/id 6 roles 403, Taproom kept when a manager PUTs Brewery only |
| S9 | PASS | dualMgr deactivated and reactivated a `[TEST-TEMP]` Taproom + Office person in the UI |
| S10 | PASS | barMgr deactivated and reactivated a `[TEST-TEMP]` no-department person in the UI |
| S11 | PARTIAL | Ellis: Office editable, "Owners member" chip, "Only owners change Owners membership.", Active greyed with tooltip; renaming a `[TEST-TEMP]` Office + Owners person kept Owners; dualMgr deactivate/Owners writes 403. Gap 6. |
| S12 | PASS* | breweryMgr and barMgr: no Owners in `/api/users`, `/api/users/:id`, `/api/roster`, `/api/departments`, `?department=owners`, positions, or 403 error messages (dept id 6 errors are generic). *Gaps 7 and 13 found on this path. |
| S13 | PASS | name, email, schedulable, reset password, set/remove/reveal staff code → 403 each; nothing changed (`updated_at` unchanged) |
| S14 | PASS | Office create/rename/delete/move-in/move-out and Owners create → 403; Brewery create/rename/delete OK; UI shows other departments "(view only: not your department)" |
| S15 | PASS | moved 11/20 → 11/21 (exception); added Wed then back to Fri only ("keep the 1 changed"): no twin on 11/20 either time |
| S16 | PASS | time change "this and following" from 12/3; weekday split from 12/10 (new series); title "this and following" from 11/19 and 11/26 applied across both series; 53 occurrences, 53 distinct dates, no duplicates or losses. Gap 8. |
| S17 | PASS | inactive not in the assignee list; API create and reassign → 422 `assignee_id: is not active` (also with a string id). Gap 9. |
| S18 | PASS | Remove → "Removed when you press Save." → Cancel: no request, code kept; Remove → Save: `DELETE …/staff_code`, removed |
| S19 | PASS | 7 bad ids × bartender1/taproomDevice × desktop/phone: board + "That card wasn't found" + URL `/boards/bar`; real Owners/Brewery card ids under `/boards/bar` also "not found"; `/boards/owners/...` → redirected |
| S20 | PASS | branded loading screen at once; "Still connecting…" + Retry at about 4 s; Retry loads. Failed or 500 `/api/me`: "Can't reach the server, retrying…", auto-retry at about 10 s, Try now works. |
| S21 | PASS | 320/360/384/400 px on tasks, idea board and home: header 49 px, one line, no overlaps, Sign out icon in view, no horizontal scroll |
| S22 | PASS | Ignored columns: `(blank), Extra, LongHeader_…`. Empty trailing columns not listed; repeated header once; 600-char header wraps; desktop and phone (table scrolls inside the dialog); Cancel wrote nothing (preview endpoint only) |
| S23 | PASS | "This entry was already removed", dialog closed, row gone after refresh, no page errors |
| S24 | PASS | Taproom shows "— None —"; note "The staff code is cleared when you press Save." (not shown when Brewery remains) |
| S25 | PASS | change log: "Staff code set", "Staff code shown", "Staff code removed" |
| S26 | PASS | "Sam Pour" 380 rows in UI pager and CSV, every CSV row matches; "Shared Device" 75 / 75 (all `Shared device = yes`); case-insensitive |
| S27 | PASS | blocked/denied/no PushManager/no service worker: "Notifications are blocked for this site…"; failed subscribe: "Push can't be turned on in this browser (private windows don't support it)."; no page or console errors. Gap 10. |
| S28 | PASS | drag list A right of B (desktop) → `POST …/move`, kept after reload; History (barMgr): "Moved the list …"; locked list can't be dragged, move 423, unlock 403; order put back (A before B), then both deleted. Gap 11. |

## Other observations (not filed as gaps)
- The Buy-a-Beer History search matches the literal "Shared Device", not the device's name ("Taproom tablets" → 0 rows). Some older device rows have a blank **Who** in the CSV.
- Every Users & Roles Save sends `PATCH` + `PUT memberships` and logs "User updated" even when only the staff code changed.
- Reset password in Users & Roles runs immediately with no confirmation.
- Old unscoped local keys (`rockcut.tasks.span`, `rockcut.breweryTasks.*`) are carried over but left in localStorage. That looks intentional (they apply per board), but they'll keep being read on any board with no server entry.
- DEV has only one non-test event series in Nov 2026 – Jun 2028; the scan found no duplicates or off-pattern dates.
- Many `[TEST-TEMP]` people and lists from earlier runs (D35–D58) remain on DEV. I left them alone.

## Data I created and cleaned up
All created as or through the personas above, all named `[TEST-TEMP] D58QA …`. The ids are in `results/created.json`.

| Item | Ids | End state |
|---|---|---|
| People: Taproom+Brewery, Taproom+Office, NoDept, Office+Owners, Taproom only, Taproom staffcode, temp owner | 4260–4266 | all **deactivated**; temp owner's owner flag and staff code removed first; staff codes removed |
| Positions | 16 (Office), 17 (Brewery) | deleted |
| Task series (brewery) | 140160, series 1879 + exception 140161 | deleted |
| Event series | 944 and its split 945 | deleted (0 left) |
| Shift | 4841 | deleted |
| Buy-a-Beer entry | 3906 | removed during S23 (that was the test) |
| Idea Board lists (Taproom) | 620, 621 | unlocked, archived, deleted |
| Change log entries for the above | n/a | can't be removed |

Seeded data touched within the brief: **Sam Pour** got Brewery added by breweryMgr, then removed by owner; he's back to **Taproom: employee**, active.

## Settings restored
- Baseline of all 16 personas' and devices' `board_settings` taken first (`results/baseline_board_settings.json`). Changed and restored: brewer1 (brewery), taproomDevice (bar), owner (all). The final read (`results/final_board_settings.json`) is **identical to the baseline for all 16**.
- **Restored by me (my mistake):** in S27 my script clicked brewer1's "You've been scheduled: Push" checkbox four times, writing `PUT /api/notification_preferences`. I then reset brewer1's stored preferences to `{}`. That matches every other employee and is consistent with four toggles from a default state, but I didn't read brewer1's preferences before the first click, so I can't prove `{}` was the original. The effective setting (push off for that event) equals the default either way.
- No tokens, passwords, temp passwords or staff codes were printed, logged or screenshotted. API helpers redact those fields, and staff-code digits were masked in output.

## What I couldn't test
- **A real "none on the server" for brewer1:** there's no endpoint to clear board settings (no DELETE; PUT rejects null). I simulated it by rewriting `/api/me` in the browser, and confirmed on real empty accounts (breweryMgr, breweryDevice) with the write blocked so nothing was left behind.
- **Other browsers:** only Chromium. Carry-over in Safari or Firefox, real private windows and real iOS push weren't covered; push refusal was simulated (denied permission, missing PushManager or service worker, failing subscribe).
- **Shared device used under a bartender's staff code** changing board settings: I can't read staff codes.
- **Time-dependent series behaviour** (gap 8): whether extending or nightly generation recreates Thursdays after the horizon moves.
- **Copy last week** with shifts for people since deactivated: it would copy many seeded Taproom shifts.
- **Bulk user actions:** none found (`/api/users/bulk` 404).
- S28 on phone (desktop-only per the brief).

Scripts: `scripts/` (helpers in `scripts/lib.js`). Screenshots: `results/*.png`.
