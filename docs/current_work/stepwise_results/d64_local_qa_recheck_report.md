# D64 independent QA report: recheck (pass 2)

**Date:** 2026-11-23, local copy at http://localhost:5174 (America/Denver).
**Result: fail.** 1 must-fix, 6 should-fix and 1 minor new gaps (14-21). Of the 13 pass 1 gaps, 10 are fixed and 3 are partly fixed (1, 8, 11).
**Personas used:** owner, breweryMgr, brewer1, brewer2, barMgr (only to make the Taproom employee), breweryDevice. Pass 1's access checks (Q13) were not repeated.
**Sizes:** 1366×768 unless a gap says otherwise; 360×780 with touch, and 768×1024, in R6.

The check counts in `progress.log` are my tallies, not counted by a script. Where a path was driven only through the API, this report says so.

## Summary of new gaps

| # | Severity | Gap |
|---|---|---|
| 20 | must-fix | Deleting a batch that has been split returns a 500 |
| 14 | should-fix | Un-checking a "record anyway" harvest with a harvest on top leaves the brink not dirty |
| 15 | should-fix | No screen edits or deletes a cell count |
| 16 | should-fix | "This brink is empty" with an earlier date writes an adjustment before the old record's first harvest |
| 17 | should-fix | Harvest on a split part ignores the yeast pitched into the parent |
| 19 | should-fix | Two brewers at the "shows yeast" question: the second answer closes the first one's new harvest |
| 21 | should-fix | The batch page deletes one part of a split, which Production refuses |
| 18 | minor | Clean task reopens under the brink's old name |

## Pass 1 gaps

| # | Verdict | Checked |
|---|---|---|
| 1 labels | partly | Product page: no "Bricks + bricks" toggle, one "$/brick" column, "1 brick". The Add offer hint still reads `"brick · 1 (5 lb)"` (and `"pitchable · 1 (5 lb)"`) |
| 2 direction | fixed | History: "Adjusted −7 lb (40 → 33)", "+2.5 lb (33 → 35.5)" |
| 3 dates | fixed | Pitch, Add count, Adjust: the day before disabled in the dialog and 422 from the API; same day works. Editing a count to the day before: 422 (API only, gap 15). Dump 422 (API; its dialog has no date). After an on-top harvest dated earlier, the limit moves to that date. Gap 16 gets around it |
| 4 Count task | fixed | Dump, adjust to 0 and pitch-out each delete the open Count task; removing the dump brings it back |
| 5 lot pitch | fixed | Remove on the product page and batch page, by its maker and (API) a manager; another brewer gets no button and 403; refused after a count, button gone; stock goes back |
| 6 Gantt at 360 | fixed | 360 wide with touch; Harvest dialog and each question tapped and saved. 768 and 1366 toolbars fit |
| 7 empty, un-check | fixed | Gantt, board, device and Undo: old record back with weight, gen and count; with on-top harvests, when the last one is un-checked |
| 8 anyway, un-check | partly | Dirty again on board and device; stays clean if cleaned since. Gap 14 is the exception |
| 9 Remove offered | fixed | Not offered or accepted after a refill or on a retired brink; works again once restored |
| 10 Clean un-ticked | fixed | Un-ticking makes an empty brink dirty again |
| 11 count deleted | partly | Deleting the last count reopens its task (API only, gap 15). Ticking "Count C7" by hand still leaves no count and no Recount due, as in pass 1; the recheck brief doesn't mention that half |
| 12 rename | fixed | Open Count and Clean tasks follow the new name. A ticked one doesn't: gap 18 |
| 13 brand delete | fixed | "… has 12 batches, so it can't be deleted.", same for a recipe, shown in the dialog. An empty brand deletes |

## New gaps

### 20. must-fix: deleting a split batch, 500
- **Path:** a batch with no yeast, split into two parts; batch page → Delete Batch → Delete (brewer1).
- **Expected:** a refusal sentence, or the delete. **Observed:** `DELETE /api/batches/4244` returns 500, "Something went wrong on the server. Please try again." Nothing is deleted.
- **Repro:** 3 of 3: 4244 (split not checked off), 4247 (checked off), 4227 (had held yeast). With the parts gone the delete works. Not yeast-specific, and I can't tell whether it predates D64.

### 14. should-fix: dirty mark missing
- **Repro:** dump a brink (dirty). Harvest 8 lb, Record anyway. Harvest 3 lb on top. Un-check the 8 lb one on the board.
- **Expected:** 3 lb and dirty ("A brink can then hold yeast and be dirty").
- **Observed:** 3 lb, not dirty, "Clean A5" still open. The next harvest goes straight to the yeast question. Un-checking the 3 lb one then makes it dirty. Reproduced on A2 (API) and A5 (board). I found no other way to reach a brink with yeast that is also dirty, so "asks both questions" could not be seen.

### 15. should-fix: counts can't be corrected
- `PATCH` and `DELETE /api/yeast/counts/:id` work, but the row, the actions menu and History (brewer1 and breweryMgr) and the Add count dialog offer neither. A wrong count can only be covered by a newer one. Read literally, the brief's "(or the reverse)" would make this must-fix; I ranked it lower because nothing is stored wrong.

### 16. should-fix: closing adjustment before the harvest
- **Repro (UI):** harvest 10 lb into S1 on 11/20. Check off another batch's step with **Done on** 11/15 into S1, "This brink is empty".
- **Expected:** refused, as for any adjustment before the first harvest. **Observed:** saved. History: "11/20 Harvested 10 lb", then "11/15 Adjusted −10 lb (10 → 0)", under "Emptied 11/15".

### 17. should-fix: split parts forget the pitch
- **Repro:** pitch from a gen 3 brink into #73: its harvest prefills TX-D1 gen 4. Split #73, then open the Harvest dialog on #73.1 or #73.2.
- **Expected:** TX-D1 gen 4. **Observed:** "Nothing was recorded as pitched into this batch", empty strain and gen **1** prefilled; the parts' pages say "No yeast recorded for this batch". Picking the strain and saving would store gen 1; I stopped before Save.

### 19. should-fix: stale answer
- **Repro (UI):** brewer1 and brewer2 both reach "P1 shows yeast in brink" over 12 lb. brewer1 answers "This brink is empty" (8 lb gen 5), then brewer2 does (9 lb gen 1).
- **Expected:** brewer2 is asked again about the new 8 lb. **Observed:** no second question; the 8 lb is closed at −8. It stays in History, and un-checking brewer2's harvest should reopen it (not tried here; that order worked in R9).

### 21. should-fix: one part of a split deleted
- Batch page of #83.1 → Delete Batch: deleted (204), leaving #83 and #83.2. `DELETE /api/production/batches/4228` on another part answers "That's a part of a split. Undo the split to change it that way." Seen on 4245 (planned) and 4248 (fermenting).

### 18. minor: old name
- Rename M6 to M6r after its Clean task is ticked, then un-tick: the brink is dirty, the open task reads "Clean M6".

## Observations (not counted)

- Un-ticking a Clean task while the brink holds yeast, or the older of two, leaves an open Clean task on a brink that isn't dirty; Mark clean then refuses. Ticking it on the board closes it.
- Retiring a dirty brink leaves its Clean task on the board.
- A double un-check sends two requests; the second gets 422 "not done". One write.

## Scenarios

| # | Result |
|---|---|
| R1 | pass |
| R2 | partial: gap 14 |
| R3 | partial: gap 15 (gap 12's leftover is gap 18) |
| R4 | partial: gap 16 |
| R5 | pass |
| R6 | pass, with the hint text under gap 1 |
| R7 | pass: un-check refused after pitch, dump, adjustment and adjust to 0 (Gantt, board, API). Type in use: rename and retire in the UI, delete disabled and 422; a retired type is refused on a new strain. Add field isn't offered and the API refuses it |
| R8 | partial: gap 17. On top, This brink is empty, un-check (Gantt, board), Remove of a brink and a lot pitch: one write each. PDH check/Undo, FDH, Diacetyl fail + retest + Undo + pass: normal |
| R9 | partial: gaps 18 and 19. Un-check vs pitch and Remove vs harvest at once: one wins, stock right |
| R10 | fail: gaps 20 and 21 found while cleaning up; seeded diff clean |

## Seeded diff (r1_start.json vs r1_end.json)

35 lots and 35 movements identical row by row. The only difference outside `[TEST-TEMP]` rows is `next_batch_number`, 44 → 83, from brewing my own batches. I planned them for Dec 30 and moved them with the brew day, so no seeded P-number changed this time. The diff reads products, lots, movements, YB1-YB4 and histories, strain types, ingredients, categories, features, companies, orders, recipes, brands, users, the schedule, batch yeast and the board.

## Data made and cleanup

- **Brinks** 377-423: 379, 380, 390, 400, 408, 422 deleted; the rest emptied, cleaned and retired (412, M3, was already retired during R9).
- **Strain type** 39 (in use, so retired). **Company** 4090, **products** 6068, 6069: deactivated. **Ingredients** 3360, 3361: left, deletion refused. **Offers** 7205, 7206. **Lots** 3964, 3965. Movement 5244 stays (counted since).
- **Brands:** 3334 left (has batches); 3335, 3336, 3337 and **recipe** 129 deleted.
- **Batches left** (yeast, or parts of a split): 4201-4204, 4206-4211, 4213-4216, 4223, 4231-4236, 4238-4240, 4242, 4243. Others made between 4199 and 4249 were deleted.
- **People** 1517, 1518: deactivated. Pass 1's 1370 and 1371 were still in the database, deactivated; my first setup run tried those emails and opened their dialogs, saving nothing.

## Not tested, or only partly

- Both questions in a row (gap 14), so not at 360 either.
- A real phone; "harvest on top" through the device; device Undo with harvests on top.
- Manager removal of a lot pitch, count edits and deletes, most on-top chains and the two-person races in R9: API only.
- Ramp, transfer, package and CIP steps; Undo of a split; a harvest saved on a split part.
- Pass 1's Q3, Q13 and Q15 were not repeated beyond what R5 and R8 cover.
