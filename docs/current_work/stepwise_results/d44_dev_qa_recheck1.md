# D44 DEV QA: recheck 1

Build: `debb528a377806df9d98acdbcde803c321bd9c43` (`/api/health` and the ribbon `DEV · debb528` agree). Tested 2026-11-17 on DEV only.

## Verdict

**Pass.** All earlier gaps are closed. There are two new minor gaps and no must-fix or should-fix. No 5xx and no unexpected console errors.

## Earlier gaps

| Gap | Status | Evidence |
|---|---|---|
| G1 stale badge on navigation | **Closed** | R1 |
| G2 note limits and wrapping | **Closed** (see N1 for a form wrinkle) | R2 |
| G3 slow cancel | **Not reproduced** | R3: cancel 103/104/102 ms |
| G4 no past `[SEED]` | **Closed** | R4 |
| G5 no dot on phone ☰ | **Closed** | R5 |
| G6 year ahead/display | **Closed** | R4 |
| G7 overlap | **Closed** | R6 |
| G8 collapse button name | **Closed** | R7 |

**Correction to my first report.** I wrote that the API accepted a 5,000-character *reviewer* note. That was my script's mistake: I sent the field as `note`, but the reviewer field is `reviewer_note`, so the API ignored it. There was no reviewer-note gap. The reviewer note is now confirmed capped: 2,002 characters gives 422 and 2,000 characters saves.

## Results

| # | Result | Detail |
|---|---|---|
| R1 | PASS | barMgr on View Schedule; bartender2 created id 530. After 30 s idle with no navigation, the badge still read 0 (no polling). After one in-app click to Scheduler, the Schedule badge read 1 in 106 ms and the Time off badge read 1. Opening Time off listed the new request. |
| R2 | PASS | A 2,001-character note through the API gave 422 "should be at most 2000 character(s)". A 2,000-character unbroken note (employee, id 532) and a 2,000-character unbroken reviewer note saved. They wrap on the Time off page, in the dialog (employee, manager, desktop and 390×844), and in the bell, with no sideways scroll. On the phone the dialog buttons stay pinned while the note scrolls. See N1 for the form. |
| R3 | PASS | **Cancel** (employee badge 1→0, same page, no reload): 103, 104, 102 ms. **Approve** (manager badge n→n−1): 104, 109, 108 ms. The two are the same now (the earlier cancel took about 1.06 s). |
| R4 | PASS | The Archive shows `[SEED] Day off` (Fri Oct 30, approved by Morgan Mash) for owner and for brewer1. A request starting 2027-11-17 (365 days ahead) was accepted (544). 2027-11-18 gave 422 "Time off can be requested up to a year ahead.", from the form and the API. A 2027-01-05 request (545) reads "Tuesday, Jan 5, 2027 (all day)" on the row and in the dialog. See N2 for where the year is still missing. |
| R5 | PASS | At 390×844 touch, barMgr with 4 pending: an 8 px red dot on ☰. It is hidden with the drawer open and back when the drawer closes. bartender2 with 0 pending: no dot. After requesting: dot. After cancelling: gone. `taproomDevice`: no dot. |
| R6 | PASS | Own overlap shows "You already have time off then." in the form (values kept). A spanning overlap and a 1-minute overlap are refused. A manager's on-behalf overlap (API and UI) shows "This person already has time off then." Touching is allowed (all-day next day starting at 07:00Z, timed 9–12 then 12–3). Overlapping a denied or a cancelled request is allowed. Overlapping an approved one is refused for both messages. |
| R7 | PASS | "Collapse navigation" when expanded, "Expand navigation" when collapsed. |
| R8 | PASS | At 390 px the 366-day message shows with no overflow. A DST-day request (Sun Mar 14 2027, all day) is correct (ends 05:59Z). A multi-day request across the year boundary shows "Wednesday, Dec 30 – Saturday, Jan 2, 2027" and one agenda row per day. The Time off page's manager on-behalf form shows the overlap message and the year-ahead message, and a valid on-behalf request is approved at once (555). The Scheduler chip dialog for a next-year request works. |

## New gaps

**N1 (minor). The note form silently shortens a 2,001+ character note and submits it.**
- Path: Time off → note field.
- Expected (RECHECK R2): the 2,001-character note is refused.
- Observed: the field stops at 2,000 characters, so pasting 2,001 trims it and Submit succeeds with the shortened note (id 531, no message). The API refuses 2,001 correctly.
- Repro: `scripts/r2.js`.

**N2 (minor). The year is missing from the agenda day header and the Scheduler week label for next-year dates.**
- Path: View Schedule agenda, Scheduler.
- Expected: dates outside the current year show the year.
- Observed: the row and dialog show it, but the agenda header reads "Tuesday, Jan 5" and the Scheduler week reads "Jan 4 – 10". The Time off page range also shows the year only on the end date ("Dec 30 – Jan 2, 2027").
- Repro: `scripts/r4.js`, `scripts/r8d.js`.

## Data made and cleaned

Every request I made has a `[TEST-TEMP]` note.
- **Cancelled by the employee through the UI or API:** 530, 538–540, 546, 551.
- **Denied by exact id (cleanup):** 531–537, 541–545, 547–550, 552–555. The ones I denied by exact id did not exist before this recheck; I acted on nothing with a lower id, and I checked 531 and 546 afterwards to confirm they were mine.
- No past rows were created this time, and none of mine were left approved or pending.
- Not mine, left alone: `[TEST-TEMP]` rows 497–529 (ids below my first), including past approved 505 and 516–518, and the 3 non-test rows (`[SEED]`).
- No notification preferences changed (nothing to restore).
