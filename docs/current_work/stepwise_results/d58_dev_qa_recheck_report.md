# D58 QA recheck report: fix cycle 2 on DEV

- **Build:** `b59278e4a050d09829e3b24adff841d0222b0d93` (`/api/health` → `env: dev, status: ok`; ribbon `DEV · b59278e`)
- **Date:** 2026-11-12 (America/Denver)
- **Environment:** https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev only. Prod was never touched.
- **Browser:** Playwright Chromium, headless. Desktop 1366×768; phone 390×844 (touch, isMobile) for R10.
- **Personas used:** owner, breweryMgr, barMgr, dualMgr, ownersAsst, brewer1, taproomDevice. brewer2, floater and owner were also used for the R7 carry-over (see "Settings" below, which includes a mistake I made). The other personas were only read for the settings baseline.
- **Verdict: PASS WITH GAPS.** 0 must-fix, 1 should-fix, 2 minor. 13 of 14 scenarios passed; R6 is partial.

Every first-pass must-fix (gaps 1, 7, 12, 13) is fixed on the paths I could reach. So are gaps 3, 4, 5, 8 and 9. Gap 10 is fixed except one harmless case (R-3). Gap 2 doesn't happen with taps. The one remaining privacy issue is gap 6's idea in a new place (R-1). A manager can still work out that a person they partly manage is in Owners, because the dialog says the person is "also in a department you don't manage", but no such department is shown.

## Summary

| # | Severity | Scenario / area | Gap | Size |
|---|---|---|---|---|
| R-1 | should-fix | R2, R5 / Owners privacy | For a person in Office + Owners, dualMgr sees only "Office: employee" and **View only**, and the dialog says they are "also in a department you don't manage". No such department is listed, so the hidden one can only be Owners. This shows for the seeded Ellis Assist too | desktop |
| R-2 | minor | R7 / carry-over | Unscoped old local keys (`rockcut.tasks.span`, `rockcut.tasks.hideCompleted`) are carried over but **never cleared**. Scoped keys (`….brewery`) are cleared | desktop |
| R-3 | minor | R13 | `PUT /api/notification_preferences {"prefs":{"shift_scheduled":{}}}` → 200 and is stored as `{}`. Every other bad body is refused | API |

## Gaps in detail

### R-1 (should-fix): Owners membership can be inferred from the partly-managed note
- **Path:** dualMgr → Users & Roles → Ellis Assist (seeded, Office + Owners) or `[TEST-TEMP] D58QA R2 Office+Owners` (id 4368).
- **Expected:** "Owners is hidden from managers everywhere." A manager shouldn't be able to tell that someone is in Owners.
- **Observed:**
  - The row shows `Office: employee | Active | View only`.
  - The dialog says "*Ellis Assist is also in a department you don't manage, so you can change only their role in yours.*"
  - Only the Office role picker is listed. No other department appears.
  - A person in Taproom + Brewery shows the other department as a read-only chip ("Taproom: employee"). An empty "other department" is therefore always Owners.
  - An Office-only person is fully editable for dualMgr, so the "View only" difference gives it away even without the note.
  - The network data is clean: no Owners in any response (see R5). The leak is only in what the UI says.
- **Repro:** sign in as dualMgr → `/users` → open Ellis Assist. Screenshot: `r5_dualMgr_ellis.png`, `r2_dialog.png`.
- **Note:** this follows from the new rule "never anyone in Owners" combined with the hidden chip. Hiding it would mean making the note and "View only" not depend on Owners, or treating an Owners-only extra membership some other way. It's the same class as first-pass gap 6 (should-fix), so I sized it the same.

### R-2 (minor): unscoped old local keys are never cleared
- **Path:** brewer1, a browser holding the old unscoped keys `rockcut.tasks.span=7` and `rockcut.tasks.hideCompleted=true`. The server lacks those keys (simulated with `/api/me` rewritten, and the PUT intercepted so nothing reached the server). Then open `/tasks/brewery`.
- **Expected:** "Then the local keys are cleared."
- **Observed:** the PUT carries `{"span":7,"hide_completed":true}` (correct), but both unscoped keys stay in `localStorage`. In the full-entry case an unscoped `rockcut.tasks.span` also stays, while the scoped keys go. Nothing is written twice, because once the server has the keys there is nothing missing to carry over. But an old browser keeps the keys, and they would seed any board this person later opens that has no server entry.
- **Repro:** `scripts/r7_unscoped.js`, `scripts/r7_full.js`.

### R-3 (minor): `{}` for an event is still accepted
- **Path:** brewer1 → `PUT /api/notification_preferences {"prefs":{"shift_scheduled":{}}}`.
- **Expected:** the RECHECK lists "`{}` per event" among the cases to refuse.
- **Observed:** 200, stored as `{"shift_scheduled":{}}`. It's harmless (no channel overridden, the dialog shows the defaults). Every other case is refused with 422 "Preferences are on/off (true or false) for known notifications and channels" and nothing stored:
  - unknown event
  - unknown channel
  - `null` event
  - `push: null`
  - `"true"`
  - `1`
  - an array
  - a mixed good + bad body (nothing stored)
  
  `prefs` that is null, an array or missing gets 400 "prefs object required". A `"__proto__"` key gets 200 and stores nothing.
- **Repro:** `scripts/r13.js`.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | health sha `b59278e4…`, ribbon `DEV · b59278e` |
| R1 | PASS | breweryMgr adds Brewery to `[TEST-TEMP] R1 Taproom-only` through the UI. The dialog then shows only the Brewery role picker, read-only "Taproom: employee", name/email/Active/schedule disabled, no Reset password, no staff code, and the note "also in a department you don't manage". API attempts, with nothing changed (name, must_reset, staff code, memberships checked as owner): <ul><li>`PATCH`/`PUT` name, nested `user.name`, email, schedulable, active → 403</li><li>`reset_password` → 403</li><li>staff code PUT/DELETE/GET → 403</li><li>`future_shifts` → 403</li><li>`PUT memberships` with an extra `name` → 200, name ignored</li><li>`PATCH memberships`, `POST staff_code`, `…/reveal`, `…/deactivate` → 404</li></ul> |
| R2 | PASS | No Owners in the page or any response (users list, memberships replies, Add department reply). The Office role change saved through the UI keeps Owners (checked as owner). <ul><li>name, reset and staff code (PUT/DELETE/GET) → 403</li><li>`future_shifts` → 403</li><li>`PUT memberships` with only Office → Owners kept</li><li>`PUT memberships` with Owners → 403 "You can't assign roles in that department"</li><li>Add department Taproom → reply without Owners</li></ul>See R-1. |
| R3 | PASS | dualMgr on a Taproom + Office person: name edit (UI) 200, Reset password (UI) 200, staff code set 200, revealed 200, removed 200, `future_shifts` 200 `{count:0}`. The `temp_password` was never read or logged; I only recorded that it was present in the reply |
| R4 | PASS | barMgr on a no-department person: name edit and Reset password work. A staff code PUT → 422, consistent with the dialog showing no staff-code section for a person with no department |
| R5 | PASS | breweryMgr, barMgr, dualMgr. Clean for all three: <ul><li>`/api/users`, `/api/me`, `/api/departments`, `/api/positions`</li><li>`PUT …/memberships` replies</li><li>403, 404 and 422 error messages</li><li>Ellis Assist's dialog and page text</li><li>the network while the dialog was open</li></ul>Ellis's Active tooltip reads "You can't change Active for this person." for all three. `/api/users/:id` doesn't exist (404 for everyone). Managers have no User change log. Only remaining issue: R-1 |
| R6 | PARTIAL | owner adds Owners ("Member") to a `[TEST-TEMP]` Taproom person in Users & Roles and removes it again. The row shows "Owners: member" in between. A barMgr save in between keeps Owners. **ownersAsst** (Office employee + Owners member) has no Users & Roles: `/users` sends them home and `GET /api/users` → 403, so "Owners members still see and change Owners membership" couldn't be confirmed for them. If only owners are meant to manage it, this is fine. |
| R7 | PASS | Only the missing keys are sent, and server values are kept. <ul><li>**Partial, simulated** (brewer1: `/api/me` rewritten to `brewery:{span:14}`; local span 7, hide completed, Monday): PUT `{"hide_completed":true,"first_day":"monday"}`; server span 14 kept; scoped local keys cleared; no write on the second load</li><li>**Partial, real accounts, write blocked:** brewer2 `{view}` → would send `{span, hide_completed, first_day}`; floater `{hide_completed:false, span:14}` → would send only `{first_day}`; owner `{hide_shifts}` → would send `{span, hide_completed, first_day}`</li><li>A failed write keeps the local keys and retries on the next load</li><li>**Full** (brewer1, real): no write, server unchanged</li></ul>See R-2 |
| R8 | PASS | Each of these shows the default range, "That date range wasn't valid, so the board shows the default." and a URL with the range removed: <ul><li>`from=2026-02-30`, `to=2026-02-30`, `to=2026-11-31`, both bad</li><li>`2027-02-29`, month 13, `2026-11-1`</li><li>reversed, garbage, `<script>`</li><li>from-only, to-only</li></ul>`2028-02-29` (leap) is accepted. 40 days and 32 days show "Showing 31 days (the most a board shows)" with the URL corrected to 31 days. No page errors and no settings writes |
| R9 | PASS | taproomDevice: `view: "mine"` (also `MINE`, also with `span`) → 422 `view is invalid`, nothing stored. `unassigned` and `all` → 200. The device's View menu offers All / Unassigned only. brewer1 (a person) can still save `mine`. Both restored exactly |
| R10 | PASS | 390×844 touch, brewer1, writes intercepted. Tap gear → tap "Hide completed" → **tap outside at (20, 800)** closes the menu: no tooltip, now and 2.5 s later, twice (`r10_taps_round1.png`, `r10_taps_round2.png`). **With Escape:** the menu closes, the gear keeps focus and the "Board settings" tooltip shows (`r10_escape.png`). It goes away on the next tap elsewhere. This matches the team's explanation |
| R11 | PASS | breweryMgr, `[TEST-TEMP]` weekly Thursday series from Nov 12; weekday → Wednesday from the Dec 10 occurrence. Result: <ul><li>Thursdays Nov 12–Dec 3 (series 959), Wednesdays Dec 16 onward (960)</li><li>The dialog of every part (Nov 19, Nov 26, Dec 3, Dec 16, Dec 30) reads "Every Wednesday (scheduled 12 months ahead)"</li><li>56 dates, 56 distinct; EXTEND on both → `count: 0`</li><li>"This event only" title edit on a part-1 Thursday keeps it on Thursday</li><li>"This and all following" title edit from Nov 26 updates both parts with no dates added or lost</li></ul>The weekday change saved with no scope question. The first new Wednesday is Dec 16, not Dec 9 (the split counts from the Dec 10 date) |
| R12 | PASS | barMgr, `[TEST-TEMP]` Taproom person with past draft, future draft and future published shifts. <ul><li>`future_shifts` `{count:2}`; Save shows "2 future shifts will become open shifts. Deactivate?"</li><li>Cancel → still active, all three shifts unchanged</li><li>Deactivate → past keeps the person, future draft is a draft with no assignee, published is an open shift</li><li>One change-log entry, "Future shifts made open · 2 shifts"</li><li>Reactivate → shifts stay open</li><li>Person with no future shifts → no question</li></ul>**Edge cases** (owner on a Taproom + Brewery person): <ul><li>in-progress shift kept</li><li>a shift starting in 90 s made open</li><li>Brewery draft and Brewery published shifts made open</li><li>another person's shift untouched</li><li>count 3, logged "3 shifts"</li></ul>Managers get 403 on `future_shifts` for people they can't deactivate |
| R13 | PASS | see R-3. The dialog toggle saves normally (`{"prefs":{"shift_scheduled":{"in_app":false}}}` → 200). brewer1's preferences were read first (`{}`) and are back to `{}` |

## Other observations (not filed as gaps)
- `from=&to=` (both empty) keeps the URL as is and shows the default range with no notice. Other one-sided or invalid ranges get the notice.
- Deleting "this and following" from the first occurrence of a split chain also deleted the later part (the second delete got 404). That's consistent with "chain", but worth knowing.
- Ellis Assist's seeded email is `owners.asst@…`, which hints at Owners on its own. It's seed data, not the app.
- The R2 test person's own name contained "Owners" (my naming). All scans masked that name before searching.

## Data made and cleaned
All created as `owner` or a manager, all named `[TEST-TEMP] D58QA …`; ids in `results/created.json`.

| What | Ids | End state |
|---|---|---|
| People | 4367 R1 Taproom-only, 4368 R2 Office+Owners, 4369 R3 Taproom+Office, 4370 R4 NoDept, 4371 R6 Taproom, 4372 R12 Taproom shifts, 4373 R12 Taproom noshifts, 4374 PX Taproom+Brewery | all **deactivated** (0 of 8 active) |
| Event series | 959 and its split 960 (56 events) | deleted (0 left) |
| Shifts | 4904–4911 | deleted |
| Change-log entries | for the above | can't be removed |

No seeded person, device, membership or staff code was changed. bartender1 wasn't touched this time.

## Settings restored
- **Restored exactly:** brewer1 and taproomDevice, plus the 11 personas I never wrote to, which still match the baseline (`results/baseline_board_settings.json` vs `results/final_board_settings.json`).
- **Mistake: owner, floater and brewer2 (Brewery board) aren't back to the exact baseline.**
  - **What went wrong:** in R7 I blocked the carry-over write on their first load. My script then removed the block before the second load, so that second load sent real writes. There's no way to delete a key (no DELETE endpoint, and `null` → 422), so the added keys can't be removed.
  - **What I did:** I set every added key to the app's default (`first_day: today`, `hide_completed: false`, `span: 14`). The PUT reply confirms these are the effective defaults, so the boards behave exactly as before. Only the stored entries are now fuller than the baseline:

    | Persona | Baseline | Now |
    |---|---|---|
    | owner | `{hide_shifts:false}` | `{first_day:today, hide_completed:false, hide_shifts:false, span:14}` |
    | floater | `{hide_completed:false, span:14}` | `{first_day:today, hide_completed:false, span:14}` |
    | brewer2 | `{view:all}` | `{first_day:today, hide_completed:false, span:14, view:all}` |

  - A reseed or a server-side clear would put them back exactly.
- **brewer1's notification preferences:** read first (`{}`), restored to `{}`.

## What I couldn't test
- **Owner case of the new edit rule:** not tested, because the RECHECK said not to make a temp owner (covered in unit tests).
- **ownersAsst changing Owners membership (R6):** they have no Users & Roles access.
- **A real partial server entry with the write going through:** not possible without changing a seeded persona's entry in a way that can't be restored. I simulated it on brewer1 and checked real partial entries with the write blocked.
- **Time-based events:** nightly series generation and a shift that starts while the Deactivate question is open (a race on the count).
- **Other browsers:** Chromium only, no real devices.
