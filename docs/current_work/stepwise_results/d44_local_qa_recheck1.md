# D44 QA recheck 1 (local, http://localhost:5174)

**Date:** 2026-11-17 (America/Denver; the run started just after local midnight, so "today" was Nov 17). Fresh seed.
**Verdict:** all four gaps closed, no new gaps. Pass.

## Gaps from the first report
| Gap | Result |
|---|---|
| 1 must-fix: stale reviewer overwrites a decision | **Closed** (R1) |
| 2 minor: ghost row for time off ending 12:00 AM | **Closed** (R3, R6) |
| 3 must-fix: cancelled request can be approved | **Closed** (R2) |
| 4 minor: phone note label covers text | **Closed** (R4) |

## Results
- **R1 pass.** owner and owner2 on request 310: owner approved (200); owner2's Deny from the older dialog got 409 "This request has changed since you opened it."; status stayed approved, reviewer and note stayed owner's; the dialog then showed the approved request with Close/Remove and the message; bartender2 has one notification. API approve on the approved request (no `expected_status`) → 409 "This request has already been approved."; still one notification, reviewer unchanged.
- **R2 pass.** barMgr's dialog open, bartender1 cancels (311), barMgr clicks Approve → 409 "changed since you opened it."; status stays cancelled; dialog shows the cancelled request with only Close; no notification.
- **R3 pass.** Thu Nov 19 8:00 PM → Fri Nov 20 12:00 AM (312) appears on Thursday only, in the agenda and the Scheduler grid.
- **R4 pass.** 390×844 touch, typed a multi-line note in the review dialog from View Schedule and from the Time off page: the label stays on the border, text clear.
- **R5 pass.** `[SEED] Long weekend` shows on Fri Nov 27 only (stored 07:00Z–06:59Z).
- **R6 pass.**
  - Nine stale-409 paths, each driven in the UI with a second actor changing the request first: agenda approve / deny / Remove; Scheduler approve / deny / Remove; Time off page deny / approve / Remove. All gave 409 "changed since you opened it.", nothing saved, status unchanged by the refused action, no notification from the refused reviewer (all decision notifications came from the actor who acted first), and the dialog updated with the right buttons (Close only after cancelled/denied; Close/Remove after approved). After closing, the Time off page moved the row to the right section and the badge matched the API.
  - API state rules: approve or deny a denied request → 409 "already been denied."; approve or deny a cancelled one → 409 "already been cancelled."; wrong `expected_status` → 409 "changed"; right one → 200; Remove of approved → 200; bad status → 422; past approved → 422 "already passed" (not 409).
  - Midnight boundary: as bartender1, a request ending 12:00 AM today (last day yesterday) is refused as past; ending 12:01 AM today and ending 12:00 AM tomorrow are accepted. Approved on-behalf entries ending 12:00 AM yesterday and 12:00 AM today are in the Archive and not in Current; the badge counted exactly the three current pending ones.
  - Not tested: the badge/Archive transition at the next midnight for a *pending* request (I can't create past pending ones, and the clock didn't pass midnight again).

## Observation (not a gap)
Employee cancel of a denied request returns 422 (the UI doesn't offer it).

## Data
Requests made (all `[TEST-TEMP]`): ids 310–~335 (R1 310, R2 311, R3 312, R6 313–316 and the S1–S9 / R6c / R6d rows).
**Cleaned:** every pending or approved future one was cancelled by its requester by exact id (final badges: barMgr 0, bartender1 0, bartender2 0, owner 1 = a seed request).
**Left:** denied and cancelled rows, and past approved 315 and 316 (cancel → 422, expected); the next reseed clears them.
**Settings:** none changed; owner's notification preferences are still `{}`.
