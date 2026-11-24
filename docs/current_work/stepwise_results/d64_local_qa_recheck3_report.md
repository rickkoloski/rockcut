# D64 independent QA report: recheck 3 (pass 4)

**Date:** 2026-11-23, local copy at http://localhost:5174 (America/Denver).
**Result: pass with gaps.** Gaps 22, 23 and 24 are fixed. Two new minor gaps (25, 26).
**Personas used:** owner (baselines only), breweryMgr, brewer1, brewer2 (API pitches and one harvest).
**Sizes:** 1366×768; U2 and gap 22 also at 360×780 with touch (no sideways scroll on either).

## Summary of new gaps

| # | Severity | Gap |
|---|---|---|
| 25 | minor | Saving or deleting a count someone else deleted says only "Not found" |
| 26 | minor | After the 409, the open Edit dialog keeps the old values, and Save keeps failing until Cancel and Edit again |

## Gaps 22-24

| # | Verdict | Checked |
|---|---|---|
| 22 | fixed | Batch page of a part, a split parent, a planned and an ordinary batch, 1366 and 360. The question names "#49.1", "#49.2", "#49", "P3", "#48"; the dialog was cancelled each time |
| 23 | fixed | Two sessions in the UI at 1366 and 360: Edit/Edit and Delete/Edit are 409 and the first person's values stay; Edit/Delete is refused (404, gap 25). After Cancel, History shows the current values, Edit opens with them, and saving or deleting then works (the other person's change was made through the API in that retry run). Slow network, double click by both: one write, the other 409, at both sizes. PUT or DELETE with a missing, wrong or non-numeric `lock_version`: 409 |
| 24 | fixed | Both repros from pass 3 and the reverse, driven in the UI. See U3 |

## New gaps

### 25. minor: "Not found"
- **Path:** Brinks → History → Edit (or Delete) on a count, left open; another person deletes it; Save (or Delete). 1366 and 360.
- **Expected:** a sentence saying the count was deleted. **Observed:** the dialog shows "Not found" (404). Nothing is written. Cancel goes back to History without the count.

### 26. minor: the conflict dialog doesn't show the current values
- **Path:** Edit open for brewer1 (500 / 90%), breweryMgr saves 700; brewer1 changes viability to 61, Save. 1366 and 360.
- **Expected:** the brief says "409 with the current values shown". **Observed:** "Someone else changed this count since you opened it. Close and reopen it to see their change.", the fields still read 500 / 61, and Save again is another 409. The Delete question keeps the old values the same way. Cancel (no need to close History) shows the current values, and it works from there.
- I ranked it minor because the message says what to do and nothing is lost. If "shown" meant History behind the dialog, this isn't a gap.

## Scenarios

| # | Result |
|---|---|
| U1 | pass |
| U2 | pass, with gaps 25 and 26 |
| U3 | pass. In the UI: add, re-date and delete counts across an on-top harvest; several counts, deleted one by one; hand tick, un-tick, then a note and a value edit (task stayed open) and a re-date (task followed the counts); dump then Remove, with the count re-dated or deleted while the record was emptied; "This brink is empty" then un-check, with the old record's count re-dated or deleted in between. Each gave the expected Recount due and one open Count task (or none) |
| U4 | pass. Edit open while a harvest on top lands: a value edit and a re-date both kept the task right. Edit open while a pitch lands: refused with the sentence. Pitch removed: the count unlocks and edits. Count re-dated and harvested on top at the same moment: both saved, Recount due right. Pitch, split, a harvest from each part on top: gen 2, 24 lb, one Count task, ticked by one count |

## Observations (not counted)

- A hand tick survives adding, re-dating or deleting a count from before the latest harvest, so a brink can show no count at all with Recount due off. It fits "a hand tick clears Recount due".
- After a dump (or an "empty" harvest) whose count was then deleted or moved before the harvest, Remove (or un-check) makes a second Count task beside the old ticked one. Only one is open.
- An emptied record's count can be re-dated past its dump (dump 11/21, count 11/22, API). A later count can still be moved onto the date of an earlier pitch (pass 3 noted it).
- A count and a dump in the same second: Remove isn't offered on the dump. With 2.5 s between, it is. Seen through the API only.

## Seeded diff (u1_start.json vs u1_end.json)

Read as owner, rows outside `[TEST-TEMP]`. One difference: `next_batch_number`, 44 → 56, from brewing my own batches. The reference and `[SEED]` rows, YB1-YB4 and their histories are identical.

## Data made and cleanup

- **Brinks** 656-693: emptied, cleaned, retired (all have history).
- **Company** 4349 and **products** 6467, 6468: deactivated. **Strain type** 45: retired (in use). **Ingredients** 3619, 3620: left, deletion refused. **Offers** 7627, 7628 and **lots** 4236, 4237: left.
- **Brand** 3857: left (has batches).
- **Batches left** (yeast in them, or parts of a split): 4998, 5000, 5001, 5007-5009, 5010-5014. Deleted: 4999, 5002-5004 (split of 5004 undone first, parts 5005, 5006 went with it). One cleanup call is refused as designed: Undo split of #54 (`part_step_done`).
- No people or codes made this pass. The T and R staff people from earlier passes weren't checked.

## Not tested, or only partly

- The brief asked to drive the UI. Harvests, the dumps, pitches, the splits, the un-checks and the concurrent changes by the other person in U3, U4 and the U2 retry were through the API; the U3/U4 counts were added, edited and deleted in the UI except those used as setup in U3c, U3e, U3f and U4. The "empty" answer ran once in the UI.
- U3 and U4 ran at 1366 only; the 360 runs covered U2 and the gap 22 question. A real phone wasn't used.
- The Gantt and the board were not re-driven for un-check refusals beyond the API 409; the device wasn't used.
- Hand ticks were on the board with "On today" only. A hand tick when the Count task is due today (no "which day" question) wasn't run.
- Cases I didn't reach: a count edit racing a dump, two people deleting on a slow network.
