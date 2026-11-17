# D44 DEV QA report

Build under test: `3ca49a10623d0ed32e6c942ccb880d6ca0721984` (`/api/health` and the ribbon `DEV · 3ca49a1` agree, on every load). Tested 2026-11-17 against rockcut-ui-dev / rockcut-api-dev only. Prod was never touched.

## Verdict

**Pass, with two should-fix gaps and a few minors. No must-fix.** The core flows work on the release build: request, notify, approve, deny, remove, stale-view handling, badges, service worker, shared-tablet refusal, authorization. I found no 5xx and no unexpected console errors. The only console errors were the expected 409s in D2.

## Scenarios

| # | Result | Notes |
|---|---|---|
| D1 | **PASS** | bartender1 requested PTO Nov 20–21 with a note (id 478). It was pending, and the Schedule and Time off badges showed 1 about 460 ms after submit. They survived a reload. barMgr and owner got "requested time off" (breweryMgr got none). Clicking the bell item opened `/time_off`. barMgr approved from the Scheduler chip with a note (192 ms). bartender1 got "Your time off was approved … Approved by Casey Tap / [note]", and both badges cleared. |
| D2 | **PASS** | Ran three times with barMgr and owner2 both holding Review open: from the Scheduler chip (479), the agenda (480) and the Time off page (481). barMgr approved in 174–213 ms. owner2's stale Deny returned 409 in 151–202 ms. The message "This request has changed since you opened it." was visible 162–210 ms after the click. The dialog then re-rendered as Approved, with "Approved by Casey Tap · time", the message and Remove. The employee got exactly one notification per request. |
| D3 | **PASS, one gap** | Badge delay on the acting browser: create about 100 ms, approve about 315 ms, deny about 315 ms, cancel **about 1060 ms**. A second, already-open browser did not update passively, even after 10 s. After a full reload it caught up. After in-app navigation it did not (see G1). |
| D4 | **PASS** | Owner and bartender1. The ribbon read `DEV · 3ca49a1` on every load, and no old screen appeared. The service worker was registered after load 1 and controlled the page from reload 2 (owner) or reload 1 (bartender1). With it controlling, the badge, the Time off page (Current and Archive, read-only, newest first), the agenda rows and the dialog all worked. No inline Approve/Deny, only **Review**. |
| D5 | **PASS, data gap** | `[SEED] Long weekend` (448, Jake, pending) appears on Fri Nov 27 only, in the agenda, in the Scheduler grid (correct column, "Off (pending)") and on the Time off page. `[SEED] Appointment` (449) is Thu Nov 19, 1–4 PM, in all three places. Nothing is a day early or late. **No past `[SEED]` requests exist.** The Archive and `when=past` hold only `[TEST-TEMP]` rows (G4). |
| D6 | **PASS** | Push permission was "denied" with no subscription. The request and the review still succeeded with no 5xx and no error message. The bell showed both "approved" and "denied" notifications. Notification preferences list "Time off requests to review" and "Your time off request was decided" (In-app on, Push off by default). |
| D7 | **PASS, gaps below** | See "Open hunt". |

## Gaps

**G1 (should-fix). Open manager browser's badge does not catch up on in-app navigation.**
- Path: barMgr on View Schedule; bartender2 creates a request elsewhere.
- Expected (BRIEF D3): the open browser catches up on reload or navigation.
- Observed: badges stay 0 across SPA navigation (View Schedule → Time off → Scheduler → View Schedule, 4 s each, and again in an earlier run). `/api/me` already says `pending_time_off: 1`. A full reload shows 1. The Time off page was also not re-fetched.
- Repro: `scripts/d3d.js`.

**G2 (should-fix). One long unbroken note makes the Time off page scroll sideways.**
- Path: Time off, at 390×844 touch and at desktop.
- Expected: the note wraps or truncates.
- Observed: a 4,500-character note with no spaces made the page 41,388 px wide (id 488). A long pasted URL would probably do the same. The `<img onerror>` text in that note stayed inert (no XSS).
- Related: the API accepts a 5,000-character reviewer note (200, 487) and a ~4,500-character requester note. Neither has a length limit.

**G3 (minor). Cancel is slower than the other badge updates.** About 1.06 s versus 0.1–0.3 s for create, approve and deny. Cancelling the pending request still cleared the badge without a reload.

**G4 (minor, data). DEV has no past `[SEED]` requests**, so "past seeded requests are in the Archive" could not be checked. The Archive contains only leftover `[TEST-TEMP]` rows from an earlier pass (ids 453, 464–466).

**G5 (minor). Phone, nav closed: no badge on the hamburger.** The badges show in the open drawer and in the collapsed desktop rail. If "collapsed" was meant to include the phone top bar, there is nothing to see there until the drawer is opened.

**G6 (minor). The year is not shown on the Time off row.** A 2099-12-18 request reads "Friday, Dec 18 (all day)". The API accepts requests with no upper date limit (id 493).

**G7 (minor, no brief ruling). Overlap with already-approved time off is allowed.** Employee request 492 (Nov 20, same day as approved 478) was created as pending with no warning.

**G8 (minor, a11y, probably pre-existing). The desktop nav collapse button has no accessible name.**

## Open hunt: checked and fine

- **Authorization.** On a pending request of mine (487), review attempts by bartender2, breweryMgr, brewer1 and the requester themself all got 403 and the request stayed pending. Only after those checks did barMgr deny it. A status other than approved or denied gets 422. Another department's manager cannot see the request, and breweryMgr cannot enter time off for a Taproom employee (403).
- **Shared tablets.** Both devices get 403 "Not available on a shared device" on GET and POST.
- **Validation.**
  - Past dates for yourself: 422 "This date has passed. Ask your manager to enter it for you.", for an employee and for a manager.
  - A manager entering past time off for someone else: approved at once (489).
  - End before start, zero length, bad type, no dates, and an employee passing another `user_id`: all refused (422/403).
  - A request that started earlier and ends today: allowed (490).
- **Self-approval.** barMgr approved their own request (491). barMgr got no "approved" notification, and owner got "requested".
- **Remove.** The agenda dialog Remove showed the "Remove approved time off?" confirm with an optional note. The request was denied and the employee notified with the note.
- **Phone.** The form and drawer render correctly (the manager sees the "For" field). The dialog fits at 390 px. The badge shows in the drawer.

## Not covered

The agenda filters ("Open shifts only", "My shifts", position and department filters). Owner-sees-everyone and employee-sees-own-only on the agenda. `splitRole` and `dualMgr`. The "Not reviewed" label on past pending requests. These were left out to keep the pass short.

## Data I made

All notes start `[TEST-TEMP]`.

| id | By | Final state |
|---|---|---|
| 478 | bartender1 | denied (cleanup) |
| 479, 480, 481 | bartender1 | denied (cleanup) |
| 483, 484 | bartender2 | denied |
| 485, 486 | bartender2 | cancelled |
| 487 | bartender1 | denied (authorization test) |
| 488, 490, 492, 493 | bartender1 | cancelled |
| 489 | barMgr, for bartender1, Nov 10 | **approved, past, can't be cleaned up** (the next reseed clears it) |
| 491 | barMgr (own) | denied (cleanup) |

Rows from the earlier QA pass are still on DEV (ids 422–477 range, e.g. "E1…E5", "M1…M11", "O2", "N1/N2"). They are not mine and I didn't act on them. The `[SEED]` rows 448 and 449 were not touched. I did not touch Notification preferences (no change, so nothing to restore). I never signed out, revoked or changed a persona or device, and I never opened, printed or screenshotted a token.

Scripts are in `scripts/`. Screenshots are in `results/*.png`.
