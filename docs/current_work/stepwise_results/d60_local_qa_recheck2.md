# D60 local QA: recheck 2

- **Date:** 2026-11-18, about 11:13–11:20 America/Denver, against http://localhost:5174.
- **Rules:** same as `BRIEF.md`. I tested through the browser and the in-page API only, and did not read the app source.
- **Personas used:** brewer1 for all scenarios. I also read the stored sacks/lb setting for brewer2 and breweryMgr, but did not use or change them.
- **Size:** desktop 1366×768.
- **Verdict: pass.** Gaps 15 and 16 are closed, nothing from recheck 1 broke, and there are no new gaps. R1–R3 all passed.

## Gaps

| Gap | Now | Evidence |
|---|---|---|
| 15 (minor): Delete offered on lots that can't be deleted | **closed** | Delete is **disabled**, with the reason written directly under it:<br>• lot 279, a later Used movement: "This lot has movements after its first; correct it with a movement or a count"<br>• lot 280, only a "Counted, no change" after its first: same sentence<br>• lot 281, used by my `[TEST-TEMP]` recipe: "A recipe uses this lot, so it can't be deleted"<br>A forced click on the disabled button opens no confirm. The API still refuses all three (422, same texts). After I deleted the recipe, lot 281's Delete became enabled. Lot 278 (only its first movement): Delete enabled, confirm "Delete lot [TEST-TEMP] S-FIRST? Its Received 4 sacks (200 lb) goes too."; Cancel kept it (API 200); Delete removed it (404, row gone). |
| 16 (minor): quantities under 0.01 lb | **closed** | **lb mode:** `0.001`, `0.004` and `0.009` show "Enter at least 0.01 lb" in Add lot, Record movement, Count total and both Count by lot boxes. Save is disabled in all of them; `0.01` is accepted.<br>**Sacks mode:** the message appears under the Sacks/lb row for lb values in the same range, and for Sacks `0.0001` (= 0.005 lb), with Save disabled. Sacks `0.0002` (= 0.01 lb) and `0.001` (= 0.05 lb) are allowed, which is correct.<br>**No requests** were sent during any of these probes, including a forced Save click with 0.004.<br>**Real saves:** a 0.01 lb Used movement saved (201, movement 487). A by-lot count of `0` saved in lb mode (lot 281 −200 lb → Depleted). A total count of `0` saved in sacks mode (201). |

## Scenarios

| # | Result | Checks |
|---|---|---|
| R1 | PASS | 12: three disabled-with-reason cases, a forced click on each, three API 422s, the recipe deletion that re-enables Delete, and confirm / Cancel / Delete on the deletable lot |
| R2 | PASS | 52: 4 values × 5 boxes in lb mode; the lb and Sacks boxes in sacks mode (including by-lot); message placement; nothing sent; 0.01 saved; count 0 in both modes |
| R3 | PASS | 12, listed below |

### R3 checks

- **Save lock:** a slow-network double-click on Save in Add lot wrote one lot (282).
- **Lot dialog:** it opens, edits (Moisture 5.2 plus a note, one PUT, "Moisture 5.20" marked in the list), closes with Escape, and reopens normally.
- **Number rule:** Moisture `5,2` is refused ("Use . for the decimal point", Save disabled).
- **Sack size rule:**
  - With only its first movement, the lot's Sack size and Delete are enabled.
  - After one movement, Sack size is disabled ("Fixed: the lot has movements after its first") and Delete is disabled.
  - The API refuses a sack-size change (422).

## Data I made, and cleanup

All names start with `[TEST-TEMP]`. Each row was read back and its name checked before any delete, deactivate or count, by exact id.

| Kind | Ids | End state |
|---|---|---|
| Maltster product | 246 R2 product (Weyermann 2-Row) | **deactivated** |
| Supplier offer | 245 R2 offer | **deactivated** |
| Lots | 279 S-USED, 280 S-COUNTED, 281 S-RECIPE (all Depleted after the count of 0), 282 S-R3 (Available, 99 lb) | remain (they have movements) |
| Lot | 278 S-FIRST | deleted in R1, as the test intended |
| Movements | ids from 486 up on product 246 (counts, 0.01 lb used, 1 lb used) | remain (they can't be deleted) |
| Brand, recipe | brand 5734 R2 Brand, recipe 32, recipe ingredient 43 | deleted (API 404 afterwards) |

I touched no `[SEED]` lot, reference product or reference company.

**Sacks/lb setting:**
- After this reseed, brewer1, brewer2 and breweryMgr started with a stored `{"ingredients":{"quantity_display":"sacks"}}`. That is different from the empty `{}` in earlier passes.
- I changed only brewer1, to lb for R2, and set it back to `sacks`. That is **exactly the starting value**, so this time the restore is exact.
- brewer2 and breweryMgr were never changed.

## What I couldn't test

- **A price dated "today" late in the Colorado evening vs UTC:** I can't move the server clock. This is unchanged from the earlier passes.
- **Phone width (360 px) for the new message and the disabled Delete:** RECHECK2 didn't ask for it, and I didn't check it.
