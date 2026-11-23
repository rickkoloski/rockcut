# D64 independent QA report

**Date:** 2026-11-23, local copy at http://localhost:5174 (America/Denver).
**Result: fail.** 4 must-fix, 7 should-fix, 2 minor. Gap numbers match `progress.log`.
**Personas used:** owner, breweryMgr, brewer1, brewer2, floater, splitRole, barMgr, bartender1, office1, breweryDevice, taproomDevice. Not used: owner2.
**Sizes:** desktop 1366×768 unless a gap says 360.

The "n checks" counts in `progress.log` are approximate (my tallies, not counted by a script). Setup and many of the refusals were driven through the API; the main path of each feature was also driven through the UI.

## Summary

| # | Severity | Gap |
|---|---|---|
| 7 | must-fix | Un-checking a harvest saved with "This brink is empty" loses the closed yeast for good |
| 8 | must-fix | Un-checking a harvest recorded into a dirty brink leaves the brink clean |
| 9 | must-fix | History offers Remove on a closed record that the API refuses |
| 13 | must-fix | Deleting a brand that has batches returns a 500 |
| 2 | should-fix | History shows an adjustment without its direction |
| 3 | should-fix | A pitch or a count can be dated before the yeast was harvested |
| 4 | should-fix | Emptying a brink leaves its Count task open with no way to complete it by counting |
| 5 | should-fix | A lot pitch on the wrong batch can't be removed |
| 6 | should-fix | Gantt at 360 px is 405 px wide and cuts the Harvest dialog |
| 10 | should-fix | Un-ticking a Clean task doesn't make the brink dirty |
| 11 | should-fix | Deleting a brink's only count leaves its Count task ticked and Recount due off |
| 1 | minor | Pack labels on the yeast product page |
| 12 | minor | Renaming a brink leaves its open Clean task under the old name |

Totals: 4 must-fix, 7 should-fix, 2 minor.

## Must-fix

### 7. Un-check after "This brink is empty" loses the old yeast
- **Path:** brink R1, batch #64, two Yeast harvest steps. Seen through the API, not clicked through in the UI.
- **Repro:** harvest 40 lb into R1. Check off the second step into R1, 9 lb, answer "This brink is empty". Un-check the second step.
- **Expected:** the 40 lb record comes back, or there is a way to restore it.
- **Observed:** the un-check returns 200 and R1 is empty. The -40 adjustment can't be removed, by its maker or by breweryMgr (409 "That adjustment came with a harvest, so it can't be removed."). Un-checking the first harvest is then refused too. One wrong tap on the question costs the record. (The brief says un-check removes "the harvest"; it doesn't say what happens to the closed record, so please confirm the intent.)

### 8. Un-check of a "record anyway" harvest leaves a dirty brink clean
- **Repro:** R2: harvest 10 lb, dump it (dirty, "Clean R2" open). Harvest 7 lb, "Record anyway". Un-check that harvest.
- **Expected:** R2 is dirty again, since it was before the harvest.
- **Observed:** R2 is empty and clean while "Clean R2" is still open. The next harvest into it saved with no dirty question. Reproduced on N2 and R2, through the API.

### 9. Remove is offered, then refused
- **Repro:** R4: dump the brink, harvest into it again ("Record anyway"), open History.
- **Expected:** no Remove on the old record's dump.
- **Observed:** REMOVE shows under "Emptied 11/23"; the confirm says "The yeast goes back in R4"; the API answers 409 "R4 has been filled again since, so this can't be removed." Confirmed in the UI as brewer1.

### 13. Deleting a brand with batches: 500
- **Repro:** brand page 2804 → Delete Brand → Delete (brewer1; it has 23 batches).
- **Expected:** a refusal sentence.
- **Observed:** `DELETE /api/brands/2804` returns 500. The dialog stays open with no message and the page logs an unhandled error. Not a yeast screen, and I can't tell whether it predates D64.

## Should-fix

### 2. Adjustment direction
40 → 33 and 28 → 35 both read "Adjusted 7 lb" in History (the API stores the sign). Expected: which way, or the new weight.

### 3. Dates before the harvest
B7 was harvested 11/23; a pitch dated 11/1 saved (200). The Pitch dialog on B8 (harvested 11/18) also left Pitch enabled for 11/1: its date field has a maximum but no minimum. A count dated 11/10 on B8 saved too. Expected: refused, or at least warned.

### 4. Orphaned Count task
Harvest into B6, then dump it before counting. "Count B6" stays open, the brink reports Recount due while empty, and Add count is refused ("B6 is empty"). Same on B4.

### 5. Lot pitch can't be removed
Pitch a brick into the wrong batch. The product page, lot dialog and batch page offer no Remove as brewer1 (product page also checked as breweryMgr), and the API routes I guessed return 404. Deleting the batch says "Remove those first." The pitch also still drives the generation and co-ferment prefill. My planned batch 3558 is stuck because of this.

### 6. Gantt at 360 px
`document.documentElement.scrollWidth` is 405 (date fields and "4 weeks later"). With touch emulation the Harvest dialog opens 405 px wide: the left edge and Save are cut (Save spans 329-397), and Playwright could not tap Save there. At 360 px without touch emulation the dialog fits and Save works, so check a real phone. On the board, at 360 with touch, the dialog fits. The Gantt page itself may predate D64.

### 10. Un-ticking Clean
Tick "Clean N2" (brink clean), then un-tick it on the board. The task is open but the brink stays clean.

### 11. Count deleted
Harvest into N3, add a count, delete the count. The Count task stays done and Recount due is off with no count on record. Ticking "Count S1" by hand on the board has the same effect: no count, no Recount due.

## Minor

- **1.** Yeast product page: toggle reads "Bricks + bricks", two identical "$/brick" columns, pack hint reads `"brick · 1 bricks (5 lb)"`.
- **12.** Rename N2 to N2x with its Clean task open: the task still says "Clean N2". Ticking it does clear the right brink.

## Observations (not counted)

- API only: a harvest sent with an empty strain list is accepted and stored with the batch's earlier strain (batch #47, step 47665). The dialog blocks it ("Pick the strain").
- API only: a generation of 100000 is refused with "must be 1 or more".
- API only: a brink pitch with no `lock_version` is accepted (stock still never went below 0).
- Removing a pitch after the receiving batch has harvested leaves that harvest at its stored generation.
- The "harvest on top" question has no Cancel button; Escape returns to the dialog.
- An order with no lines reads "0 packs · 0 lb" for a yeast-only supplier.

## Scenarios

| # | Result |
|---|---|
| Q1 | pass: 11 reference + 2 seeded products, YB1-YB4 and `[SEED]` batches as described |
| Q2 | pass, gap 1 |
| Q3 | pass; Totals rows add up to the $2,061.49 total |
| Q4 | pass (not covered: a type **in use**) |
| Q5, Q6, Q7 | pass |
| Q8 | partial: gaps 2, 3, 4 |
| Q9 | pass, with gap 3's early count; see limits |
| Q10 | pass; refusal tried after a count only, plus gaps 7 and 8 |
| Q11 | pass: Taproom code refused, "· on Brewhouse tablet" shown, yeast routes 403 |
| Q12 | partial: gap 5; refusals correct on the Batches page and the Gantt |
| Q13 | pass: 90 route calls and 24 page loads |
| Q14 | partial: gap 6; other pages and dialogs tried fit |
| Q15 | pass: one write each |
| Q16 | pass |
| Q17 | diff clean, see below; gap 13 found while cleaning up |
| Q18 | fail: gaps 7-12; non-yeast PDH check-off, un-check and Undo behaved normally |

## Seeded diff (baseline_start.json vs baseline_end.json)

The only difference outside my own `[TEST-TEMP]` rows is `next_batch_number`, 44 → 67, because I brewed my own batches. While my batches were planned with a Nov 10 brew day, the app renumbered the seeded **Altruism P1 → P2 and Enos P2 → P3**. Batch 3558 couldn't be deleted (gap 5), so I moved it to Dec 30 and the labels went back to P1 and P2. The diff reads products, YB1-YB4 and their histories, strain types, companies, ingredients, categories, brands, the schedule and the board; it does not read seeded lots or movements row by row. Four `[TEST-TEMP] Check type …` strain types (9-12) were there before I started and aren't mine.

## Data made and cleanup

- **Brinks** 215-223 (B1-B9), 225-228 (N1-N4; N2 renamed N2x), 229-232 (R1-R4), 233-234 (S1-S2): retired, the ones with yeast dumped and cleaned first. 224 (BZ): deleted.
- **Strain type** 34: deleted.
- **Companies** 3715, 3716: deactivated. **Ingredients** 2997, 2998: left, deletion refused. **Products** 5495-5498: deactivated. **Offers** 6602, 6603, 6604. **Lots** 3595, 3596, 3597. **Order** 1710 (received).
- **Brand** 2804: left (gap 13).
- **Batches** 3548, 3556, 3557 deleted. Left, refused because of yeast: 3540-3547, 3549-3555, 3558-3565.
- **People** 1370 `[TEST-TEMP] Brewer`, 1371 `[TEST-TEMP] Tap` (made as barMgr): deactivated.
- Count and Clean tasks for those brinks remain on the board for the reseed. Opening seeded rows and dialogs was read-only; I expanded FV2 on brewer1's own Gantt view.

## Not tested, or only partly

- The dialogs at 360 px on a real phone; both questions on the Gantt with touch (gap 6 stopped it), Mark clean's dialog and the batch Yeast section's wording at 360 beyond fit.
- Which count a pitch used isn't shown in the Pitch dialog, the batch page or History, so "−2 uses −3's" was only inferred from the edit/delete refusal sentences.
- Add field on Yeast Strains: the API route I guessed is a 404, so the refusal isn't confirmed (Add subcategory is refused).
- Renaming, retiring or deleting a Strain Type in use.
- Un-check refusal after a pitch, dump or plain adjustment (only after a count, and after gap 7's closing adjustment).
- Double-tap on "Harvest on top" and on "This brink is empty"; splits and retests.
