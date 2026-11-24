# D64 DEV QA report

- **Date:** 2026-11-23 (America/Denver). **Build:** `0a56b70`, seen on every page checked.
- **Personas:** brewer1, brewer2, breweryMgr, owner, floater, splitRole, barMgr, bartender1, office1, sales1, noDept, hidden, newhire, taproomDevice, breweryDevice. Not used: owner2, ownersAsst, dualMgr, bartender2.
- **Method:** Playwright at 1366x768 and 360x780 touch. Some set-up and many negative checks went through `lib.js` `api()`.
- **Result: pass with gaps.** No must-fix. No 5xx responses on the pages my scripts recorded. Seeded data unchanged.

| Severity | Count | Gaps |
|---|---|---|
| must-fix | 0 | |
| should-fix | 1 | 3 |
| minor | 3 | 1, 2, 4 |

## Gaps

**Gap 1 (minor, 1366)** Order page footer unit.
Path: Purchasing, an order with a brick line and pitchable lines. Expected: the units used elsewhere (the New order dialog reads "20 bricks, 12 pitchables"). Observed: the page footer reads "32 packs · 32 each · $440.00". Repro: order 411 lines 20 / 6 / 6, open `/ingredients/orders/411`.

**Gap 2 (minor, 1366)** Blank "Voided" records in brink History.
Path: harvest into a brink, un-check or Undo it, open History. Expected: no row, or one that says what it was. Observed: "Voided | gen 1" with no date, person, weight or entry, one per undone harvest (B5 showed three, B7 four). Repro: brinks 53, 55, 56. May be intended; please confirm.

**Gap 3 (should-fix, 360)** Phone back on Dump brink and Mark clean leaves the page.
Path: Brinks, Actions, Dump brink (or Mark clean), phone back. Expected: the dialog closes, page stays. Observed: the app goes to the previous page. Repeated 2 of 2 for Dump. The Remove pitch confirmation on the batch page does the same (1 of 1). Nothing is saved. Pitch, Add count, Adjust weight, History, count Edit, lot Pitch, Add product and Yeast settings all close correctly.

**Gap 4 (minor, 360)** "Harvest on top" is accepted after someone else changed the brink.
Path: open the brink question, another session adjusts the brink (10 to 9 lb), answer "Harvest on top". Expected from the brief: asked again ("if the yeast changed, the second is asked again"). Observed: recorded at once (9 + 1 = 10 lb, gen 2, correct). Answering "This brink is empty" after a change did ask again, in the D5 run. Requests: "on top" sends the record id only; "empty" also sends the lock version. The stored weight is right, so this may be intended.

## Scenarios

| # | Result | Notes |
|---|---|---|
| D1 | PASS | 9 pages by URL and after reload, no console errors. Settings read-only for brewer1. |
| D2 | PASS | 408 API paths saved in `baseline_d2.json`: 11 reference products, 4 types, YB1-YB4, 35 movement rows. |
| D3 | PASS | Product, offer, order, receive (pitch size required on Liquid), Mother pitch, gen 1, 2 and 3, on top, "empty", co-ferment gen 1 and repitch gen 2, dump, clean from the board and from Mark clean, Yeast dumped, device with staff code, Taproom code and wrong code refused. Stock, Totals, tasks and the batch pages opened agree. |
| D4 | PARTIAL | Split: both parts inherit the parent's pitch (gen 2). Un-check or Undo tested after plain, on top, "empty" and dirty answers on the Gantt; plain on the board; on top and "empty" on the device. Refusals correct. |
| D5 | PASS | Double tap gave one write each: harvest Save and both question buttons, brink pitch, count Add/Edit/Delete, Dump, Remove, with and without throttling; lot pitch fast only. Slow Adjust got one refused 422 (same weight entered), so it is not a throttled success. Two people: stale count edit and stale adjust refused; deleted count, entry, pitch, brink and type say so; refused Retire says why. Re-ask tested with "empty". |
| D6 | FAIL | Gaps 3 and 4. No sideways scroll on the 12 pages or the dialogs opened. |
| D7 | PASS | 20 yeast, count, pitch and settings routes: 403 for both devices and 7 other personas. Employees 403 on settings writes. Pages redirect home or say "Not available on a shared device". Service worker active, reload and back fine. |
| D8 | PARTIAL | Set temp, Package and CIP checked off and undone on a tankless batch, its steps compared unchanged afterwards. |
| D9 | see below | Hunt, clean-up, seeded diff. |

## D9

- Hunt: 24 API attempts. Most refused with a clear sentence (whole bricks, over stock, negative, future dates, date before harvest, over 100 %, empty brink, retire while holding yeast, delete a type in use). Two did not test what I meant: "half-brick movement" was refused for its kind, and the Liquid lot without a pitch size was refused for a missing supplier.
- Observation (not a gap): `POST /api/yeast/brinks/:id/pitch` with no `lock_version` is accepted (200). The UI always sends it.
- "Add field" on Yeast was a 404 on the path I guessed, so that refusal was not confirmed. Add subcategory is refused (422).
- Seeded diff: only `next_batch_number` changed (44 to 56). Board tasks compared one by one over 8 windows: no seeded task changed. Roster, strain types, brinks, products, lots, movements and companies match, after leaving out rows marked `[TEST-TEMP]`.

## Not tested

- D8 tank, Transfer, and CIP/Package on a tank: a check-off is dated today, and FV7, the only tank I found without a seeded batch, has a seeded CIP on Nov 24. Skipped, as the brief allows.
- 360 px: the Split dialog, and Harvest with its questions on the Gantt (done on the board instead). Diacetyl test's result dialog was opened and cancelled.
- A throttled successful Adjust double tap; un-check on board and device after every answer; the Undo button on the device after "empty".
- "Add field" refusal; strain type rename collision; partner settings beyond the routes listed.

## Data made

- Brinks 49-56 and 57 (54, 57 deleted; 49-53, 55, 56 dumped, cleaned, retired). Strain types 7 (renamed, retired) and 8 (deleted).
- Strains 774, 775; company 776 (deactivated); products 1019, 1020, 1021 (deactivated); offers 1559-1561; lots 980-982; order 411.
- Brand 6996 (kept, has batches). Batches 10346-10361: 10346, 10353 and 10359 deleted; the rest kept, as their delete is refused.
- People 6304 and 6305 deactivated. Temporary passwords were not used. While making 6304, its temporary password and, for both, a staff code appeared in my session output.
- Harvest, count, pitch, dump entries and Count/Clean tasks on my own brinks, left for the reseed.
- `results/progress.log` was empty at the start. After the run I corrected lines in it: the D8 count (4 to 3), the D3, D4, D5 and D7 check counts (estimates, never tallied), D4 from PASS to PARTIAL, and the D8 tank wording. D7: the count-edit route (PUT) was not probed for refused personas.
