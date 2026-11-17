# D44 DEV QA: recheck 2

UI `490f913` (ribbon `DEV · 490f913` on every load, including after two reloads under the service worker). The API is still `debb528` as stated. Tested 2026-11-17, DEV only.

## Verdict

**Pass.** N1 and N2 are closed. No new product gaps. One item could not be exercised (below). No console errors.

| Gap | Status |
|---|---|
| N1 note field cut silently | **Closed** |
| N2 year missing on agenda header and Scheduler label | **Closed** (Publish-week year variant untested, see below) |

## Results

**Q1 PASS.** Tested in the request form, the review note and the Remove confirm note, at desktop and 390×844. A real Ctrl+V paste of 2,100 characters kept 2,000 and showed "2,000 / 2,000 · the rest was cut". Deleting one character gave "1,999 / 2,000" with no message. The counter first appears at 1,800 (nothing at 1,700). Typing exactly to 2,000 showed no cut message, and one more typed character showed it. Clearing the field removes the counter.

**Q2 PASS.**
- **Agenda:** headers read "Friday, Jan 1, 2027" and "Tuesday, Jan 5, 2027". "Thursday, Dec 31" and the November headers show no year (current year).
- **Scheduler:** the New Year week reads "Dec 28, 2026 – Jan 3, 2027" and the 2027 week "Jan 4 – 10, 2027". Current-year weeks are unchanged ("Nov 16 – 22" and so on), and going back a year gives "Dec 22 – 28, 2025".
- **Phone:** at 390×844 the longest label fits (box 66–265 px), with no sideways scroll on the agenda or the Scheduler.

**Q3 PASS.**
- **Submit:** a pasted over-long note submits as exactly 2,000 characters (id 591). The counter and message clear after submit.
- **Review:** the reviewer note after a cut saves at 2,000. Reopening the dialog starts with an empty field and no stale message.
- **Console:** no console errors.

## Not covered

The **Publish week** question's year variant. The question only appears when the week has draft shifts, and no 2027 week has any. The current-year question reads "Publish 2 draft shifts for Nov 23 – 29?", unchanged. I cancelled it, so nothing was published. I did not create draft shifts just to test this.

My test method matters for N1. A programmatic `fill()` or inserted text, which a browser clamps to 2,000 before the app sees it, shows the counter but not the "rest was cut" message. Real paste and real typing both show it, so users get the message.

## Data

Every request I made has a `[TEST-TEMP]` note. Ids 587–591 (bartender1) were all denied by exact id, after checking each was mine. Nothing of mine is pending or approved. A request created by the first Q1 attempt failed (an overlap), so nothing else was left. No notification preferences changed. I left other people's `[TEST-TEMP]` rows alone (584–586 and lower).
