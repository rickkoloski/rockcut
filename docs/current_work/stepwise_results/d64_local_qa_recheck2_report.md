# D64 independent QA report: recheck 2 (pass 3)

**Date:** 2026-11-23, local copy at http://localhost:5174 (America/Denver).
**Result: fail.** One new must-fix (23), one should-fix (24), one minor (22). Gaps 16-21 are fixed. Gap 15 is fixed as reported, but its new screens bring 23 and 24.
**Personas used:** owner, breweryMgr, brewer1, brewer2, breweryDevice, floater, splitRole, bartender1, office1, barMgr, taproomDevice.
**Sizes:** 1366×768 unless noted; 360×780 with touch in T4 and for To order, Totals and Orders.

The check counts in `progress.log` are my estimates, not counted by a script. Paths driven only through the API are named below.

## Summary of new gaps

| # | Severity | Gap |
|---|---|---|
| 23 | must-fix | Two people edit the same count: the second save silently overwrites the first |
| 24 | should-fix | Editing a count's date across a harvest leaves Recount due and the Count task wrong |
| 22 | minor | Deleting a split part asks: delete batch "null"? |

## Gaps 15-21

| # | Verdict | Checked |
|---|---|---|
| 15 counts | fixed | History offers Edit and Delete to the maker and a manager, neither to another brewer (403 from the API). Counts used by a pitch: no buttons for the maker, 409 from the API, for the manager too. Double-tapped on a slow network at 1366 and 360 touch: one write each. Deleting the last count reopens its task. Edit or Delete already open when a pitch lands: refused with the sentence. New: 23 and 24 |
| 16 early "empty" | fixed, as the brief now intends | Harvest 11/20, "empty" on 11/15: closing entry 11/20. Pitch 11/21, "empty" on 11/19: 11/21. "Empty" on 11/22: 11/22. Un-check reopened the first with 10 lb gen 2 |
| 17 split parts | fixed | Saved on both parts in the UI after brink, lot, both same strain, both different: gen 4, 1, 4, co-ferment gen 1. Yeast pitched into one part made only that part a co-ferment |
| 18 old name | fixed | Un-ticking a Clean task after a rename shows the new name; so does a Count task reopened by deleting its count |
| 19 stale answer | fixed | A second answer after the first changed the brink is asked again ("It changed since you answered."), except on top after on top (see Observations) |
| 20 split delete 500 | fixed | "Undo the split first.", fresh, checked off and with yeast |
| 21 part deleted | fixed | "That's a part of a split. Undo the split to change it that way.", same three states |

## New gaps

### 23. must-fix: count edit overwrites another person's edit
- **Path:** Brinks → History → Edit on one count, open for brewer1 and breweryMgr (both UI, 1366).
- **Repro:** count 500 / 90%. breweryMgr saves 700 with a note. brewer1, whose dialog still shows 500, changes only viability to 61 and saves.
- **Expected:** the second save is refused, as a product edit is (409). **Observed:** saved, no message. Stored: 500 / 61%, no note; the manager's 700 and note are gone. Reproduced twice (the first time with the manager's edit through the API).
- Ranked must-fix under the brief's "data lost or changed silently".

### 24. should-fix: count date moved across a harvest
- **Repro (UI):** harvest 11/18, count 11/20, harvest on top 11/21.
  - Edit the count to 11/22: **expected** Recount due and the Count task clear, as adding a count dated 11/22 does. **Observed:** the row reads "counted 11/22 · Recount due 11/21" and the task stays open.
  - Add a count on 11/22 (task ticks), then edit it to 11/20: **expected** Recount due again, as after deleting it. **Observed:** the count is marked as before the 11/21 harvest, yet Recount due is off and the task stays ticked.

### 22. minor: "null" in the delete question
- Batch page of a split part (#44.1) → Delete Batch: `Are you sure you want to delete batch "null"?` The delete is then refused. Seen on all three parts tried.

## Observations (not counted)

- On top after someone else's on top isn't asked again: 12 + 8 + 9 = 29 lb, right.
- A count on 11/21 can be moved to 11/20, the date of a pitch, which changes the count that pitch used; it is then locked. Adding a count for that date is allowed too.
- "This brink is empty" dates its closing entry by entries only: a count on 11/22 can sit in a record emptied 11/19.
- If the brink is dumped and cleaned while the question is open, the dialog says "… is empty now. Save again to harvest into it."; the second Save works.

## Scenarios

| # | Result |
|---|---|
| T1 | pass |
| T2 | pass, with gap 22. Checked-off split: Mark not done, Undo split, then delete (204). Part with a harvest: Undo split refused until it is un-checked. Plain batch deletes |
| T3 | pass. Default brinks: the part's own first brink, and the parent's when the parent was harvested before the split. Undo of a split refused while a part has yeast, then works; undoing that from the toast restores both parts |
| T4 | fail: gaps 23, 24 |
| T5 | pass. Order of answers: on top/on top Gantt-board; on top/empty device-board, board-Gantt; empty/on top board-device, Gantt-Gantt; empty/empty board-board, Gantt-device, device-Gantt. Pitched out (Gantt) and dumped (Gantt, board, device) while open: asked the dirty question, then saved once. Also partly pitched, retired, and refilled while a question was open |
| T6 | pass. Device: on top, Undo with harvests on top, Undo of an "empty" with one on top, refusal after a count, Taproom code refused, yeast pages and the 14 yeast calls tried closed. Set temp, Transfer, CIP, Carb, Package: check, Undo, un-check put status and dates back; ramp add and Undo. Q3: "Packs" / "Sacks", 2.5 and 0 bricks refused, 3 received, To order 22, Totals add up ($1,786.49). Q13: 24 calls as six personas plus brewer1, count and split paths included; the Taproom, Office and device personas got 403 on all. Q15: one write each |
| T7 | pass |

## Seeded diff (t1_start.json vs t1_end.json)

Read as owner. One difference outside `[TEST-TEMP]` rows: `next_batch_number`, 44 → 68, from brewing my own batches. Seeded lots, movements, YB1-YB4 and their histories are identical.

## Data made and cleanup

- **Brinks** 554-597: 575, 576 deleted; the rest emptied, cleaned and retired.
- **Strain type** 43 (in use, so retired). **Companies** 4334, 4335 and **products** 6440-6443: deactivated. **Ingredients** 3595-3597: left, deletion refused. **Offers** 7602, 7603 and the grain sack offer; **lots** 4210, 4211; **order** 1944 (received): left. All my lot pitches were removed.
- **Brand** 3731 left (has batches).
- **Batches left** (yeast, or parts of a split): 4763, 4764, 4770, 4773, 4776, 4779-4781, 4785-4800. The other batches I made were deleted.
- **People** 1624, 1625: deactivated. Pass 1 and 2's (1370, 1371, 1517, 1518) are still there; I didn't touch them.

## Not tested, or only partly

- On top/on top with the device in it, or Gantt with Gantt: one opener failed and I didn't rerun that pair. On the board and device, "pitched out while open" was done as a dump only.
- Both questions in a row: can't be reached (per the brief).
- The stale questions, split flows and T6 dialogs at 360 px; a real phone.
- Steps on a real tank (CIP, transfer, package): tanks are seeded, so mine had none. Filter wasn't run.
- API only: the pitches and splits that set up T3, un-checks in T3 and the on-top chains, refusals for another brewer, the manager's 409. Un-check and Undo themselves were driven in the UI in pass 2.
- The manager's and another brewer's count screens at 360.
- Q3's inventory beyond my own products; a product edited by two people (pass 1's Q16).
