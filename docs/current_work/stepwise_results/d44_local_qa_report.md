# D44 QA report (local trial, http://localhost:5174)

**Date:** 2026-11-16 (America/Denver; the run crossed local 11 PM, so UTC was already Nov 17, which made a good day-boundary test).
**Verdict:** fail (2 must-fix, both stale-state/concurrency; every scenario's main path works).

## Personas used
bartender1, bartender2, barMgr, dualMgr, splitRole, breweryMgr, owner, owner2, floater, brewer1, office1, sales1, ownersAsst, noDept, hidden, taproomDevice, breweryDevice (read-only checks for brewer2). `newhire` returns 403 on `/api/notifications`; not in the brief, not investigated. No passwords, no sign-outs; no token was printed.

## Data made (all notes start `[TEST-TEMP]`)
IDs 192–215 (24 requests): 192 T1, 193 T7, 194 T8, 195 T9, 196/197 T10, 198/202 T12, 199 T11, 200/201 T11b, 203 T16, 204–210 T17 (one per persona), 211/212 T17 midnight/overnight, 213 T7p, 214/215 T17 noDept/hidden. Only exact ids were acted on, after reading the note.
**Cleaned:** every pending or future-approved request was cancelled by its requester (194, 196, 199, 201, 203, 205, 207, 208, 210, 211, 212, 214, 215).
**Left (can't be cancelled; reseed clears them):** denied 192, 193, 204, 206, 209, 213; cancelled 195, 200; past approved 197, 198, 202 (cancel → 422 "already passed", as designed).
**Settings restored:** owner's notification preferences were `{}` at the start; I turned "Time off requests to review" in-app off (T16), then restored with `PUT {"prefs":{}}`; verified `{}` again. No other persona's preferences were changed.

## Summary
| Severity | Count |
|---|---|
| must-fix | 2 (gaps 1, 3) |
| should-fix | 0 |
| minor | 2 (gaps 2, 4) |

## Gaps

### Gap 1 — must-fix: a decision can be overwritten by a second reviewer with a stale view
- **Path:** Time off → Review dialog (and `POST /api/time_off/:id/review`), as owner and owner2 (also barMgr/breweryMgr via API). Desktop 1366×768.
- **Expected:** once a request is approved or denied, a second Approve/Deny is refused (or the dialog refreshes); the employee isn't sent contradictory results.
- **Observed:** owner approved id 209, then owner2 (dialog opened earlier) clicked Deny: HTTP 200, no error, dialog closes, status became `denied`, reviewer and note replaced. Robin Pitch got both "approved" and "denied" notifications. Re-approving an already approved request (206) also returns 200, silently replaces the reviewer (Morgan Mash → Casey Tap) and sends a duplicate "approved" notification.
- **Repro:** two browsers, both open Review on the same pending request; approve in one, deny in the other.

### Gap 2 — minor: time off ending exactly at 12:00 AM shows a ghost row on the next day
- **Path:** View Schedule agenda and Scheduler grid, bartender1 / barMgr. Desktop.
- **Expected:** Wed Nov 18 8:00 PM → Thu Nov 19 12:00 AM appears only on Wednesday.
- **Observed:** also shows "Personal · Until 12:00 AM" on Thursday (agenda) and "Off until 12:00 AM (pending)" in Thursday's grid cell (id 211).
- **Repro:** request timed time off ending 00:00 Colorado time.

### Gap 3 — must-fix: a cancelled request can be approved
- **Path:** `POST /api/time_off/:id/review` as barMgr; same for the dialog with a stale view. API-level.
- **Expected:** a cancelled (or otherwise closed) request can't be approved; the manager gets an error.
- **Observed:** bartender2 cancelled 203; barMgr then approved it: 200, status `approved`, bartender2 notified "Your time off was approved" for time off they had cancelled, and it is back on the schedule.
- **Repro:** manager opens Review; employee cancels; manager clicks Approve.

### Gap 4 — minor: review dialog note box label overlaps typed text at phone width
- **Path:** View Schedule → time off row → dialog, barMgr, 390×844 touch. The label "Note to the employee (optional)" sits over the first line of text once filled. Desktop is fine.

## Scenarios passed
T1 (badge 1 on Schedule and Time off at once, kept after reload), T2 (notified: barMgr, dualMgr, splitRole, owner, owner2; not breweryMgr, office1, bartender2, bartender1; click opens Time off), T3 (desktop and phone: request on each of its days, pending style, no teammates', read-only dialog), T4, T5, T6, T7 (desktop and phone), T8 (403, nothing visible), T9, T10 (no notifications), T11 (message shown, nothing stored; yesterday→tomorrow accepted; today all-day and timed accepted; anything ended before today refused, including 11:59 PM yesterday while UTC was already tomorrow), T12 (desktop and phone; newest first; read-only; no horizontal scroll), T13 (review → 422; cancel of a past request → 422 for its requester; see note), T14 (both tablets: no UI, no badge, API 403), T15 (all filters as specified), T16.

T17 hunt, all correct: reviewer matrix for floater / splitRole / dualMgr / office1 / sales1 / ownersAsst / noDept / hidden (notifications, badges and Review buttons agree and match the API 403s); visibility per role; badges update after create, cancel, review without reload (also collapsed nav); multi-day across the Sun/Mon week boundary in agenda and grid; the "For" list; on-behalf entries refused (403) outside one's departments.

**Notes:** (a) cancel is requester-only: barMgr and owner get 403 on someone else's `/cancel` (the manager route is Remove). The brief's T13 wording suggests 422; read as intended. (b) Invalid review bodies return 422 before the permission check (breweryMgr got 422, not 403, for a malformed body). Harmless. (c) Seed oddity: `[SEED] Long weekend` is stored at UTC midnight, so it shows on Thu Nov 26 and Fri Nov 27 for an entry meant as Nov 27. (d) bartender1 still had `[TEST-TEMP]` notifications from before the reseed.

## Couldn't test
- "Not reviewed" on a past pending request (no way to create a past pending one).
- Conflict-warning refresh after approval (the grid's conflict count stayed at 2 because the two conflicts were unrelated shifts; I didn't make a shift on an off day).
- Concurrent badge staleness in an already-open second browser beyond a reload/navigation check (it matched the API).
- Email/push, service worker (out of scope).
