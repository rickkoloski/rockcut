# D48 DEV QA fix cycle 1: status, 2026-10-22

Paused for a machine reboot (lead's instruction). Branch `d48-batch-changes`. The fix cycle is committed as `a0fa314`, as it stood when the targeted run finished.

**Inputs:**
- `prompts/d48_lead_decisions_2.md`;
- `stepwise_results/d48_qa_report.md` (3 must-fix, 9 minor, Matt's Pixel finding).

## Fixed in `a0fa314` (with tests)

| Item | Change | Tests |
|---|---|---|
| **M1** | **API:**<ul><li>A transfer or filter must fall after its tank's fill and before its exit (422 `before_fill` / `after_exit`, "The beer isn't in that tank on that day."). This also covers Add step with a Transfer/Filter type.</li><li>Added steps and ramps start on brew day or later (`before_brew_day`, "A step can't come before brew day."). For a part, the floor is its parent's Split.</li><li>A split must be after brew day (`split_before_brew`, "The split has to be after brew day.") and before the tank's exit (`after_exit`).</li></ul>**UI:**<ul><li>Add step and Add a ramp default to today, or brew day + 1 for a batch still to brew.</li><li>Transfer and Split default to the first day after the current tank's fill, on or after today.</li><li>The transfer preview shows the refusal before you save.</li></ul> | ExUnit `batch_changes_test` ("when the beer is there"), `splits_marks_test`, controller test; Playwright `d48-fix-cycle-1` (M1, M3) |
| **M2** | **API:**<ul><li>`Batches.delete_planned` refuses a split parent with `split` ("Undo the split first.").</li><li>Undo puts rows back in table order and then by id (parents before parts), and deletes in reverse.</li><li>New ExUnit test: deleting a planned batch with vessels, links and a ramp, then Undo, restores it identically.</li></ul>**UI:** Delete is replaced by "Undo the split first to delete it." on a split parent, and there's no Delete on parts. | ExUnit `splits_marks_test`, controller test; Playwright `d48-fix-cycle-1` |
| **M3** | A transfer into the tank the beer is already in is refused with `{:same_tank, name}`, shown as `same_tank` "The beer is already in FV2.". The Into picker leaves that tank out. For splits, an explicit pick of the current tank is refused too; "(stays here)" is the only way to stay, and the split dialog doesn't offer the current tank again. | ExUnit, controller test, Playwright |
| **6** | A split parent's volume is refused (`split`). In the UI it's read-only with "Undo the split first to change it". | ExUnit, Playwright |
| **7a** | The template-change message names dropped added transfers: "… Kept 1 added step; dropped the added transfer into Q1D." / "Dropped the added transfer into Q1D." | ExUnit, Playwright |
| **7b** | **Cause found:** QA's ramp head had been checked off early, which moved it to before brew day, so no rebuilt step came before it and nothing linked in. Kept chains now link from the latest rebuilt step on or before their date, or else from the tank's first step (the "Steps out of order" flag then shows it). Ramps keep their own chain. | ExUnit (two tests) |
| **8** | A part's dialog shows "P5.2 · the real number is set when the parent's brew day is checked off" (or "#45.2 · the parent's number") and has no Delete. | Playwright |
| **9** | The zoom button has the tooltip "Weeks on screen". Nothing else changed. | Playwright |
| **10** | The move preview returns `batches` and each step's `batch_id`. The prompt's subtitle reads "2 batches · 2 steps moved 1 day later", with the following steps grouped under each batch's label. | ExUnit controller test, Playwright |
| **11** | Ctrl/Cmd+Space on a focused dot or diamond toggles it in the selection. Escape clears an active selection first (a capture-phase listener, off during a drag). | Playwright |
| **12** | Covered by M1 ("The split has to be after brew day."). | ExUnit, controller test |
| **Pixel** | The auto-scroll edge zones are now measured against the part of the grid that's on screen (`visualViewport`). At the grid's end the page scrolls instead, and the drag offsets count the page scroll. | Playwright `d48-fix-cycle-1` "a phone" (412×915): it aims inside the new zone but more than 40 px from the grid's real bottom (outside the old zone) and checks the grid scrolls down, then the page. **Matt rechecks on the Pixel.** |

COVERAGE.md has rows for all of these.

## Targeted results (before the commit)

- **ExUnit:** 209 tests, 0 failures. This covers `production/*`, `production_test`, `seeds/synthetic_test`, the three production controller tests, `device_route_matrix_test` and `authz_boundary_test`. `mix compile --warnings-as-errors` is clean.
- **UI:** tsc and ESLint (production files) are clean; Vitest 166 passed.
- **Playwright** (d48-toolbar, d48-batch-changes, d48-split-select, d48-fix-cycle-1, batches, d47-qa-fixes, steps and gantt; `--workers=1`, 8.2 min): **65 passed, 3 failed.**
  1. **`d48-toolbar.spec.ts:89` P120:** `page.getByTestId('gantt-add-process').click()` at line 168 timed out. That's the keyboard part, after Escape closes the CIP dialog. **Not yet investigated.** Suspects:
     - the new "Weeks on screen" tooltip on the zoom button;
     - the new capture-phase Escape listener, though it should only listen while a selection is active.

     Run that test on its own first.
  2. **`gantt.spec.ts:32` P49–P51:** FV4 reads "Day 19 · Fermentation · 68° · 58° change late" where the test expects "… set to 58° today".
  3. **`gantt.spec.ts:50` P46:** the Set temp 58° diamond is `late`, not `today`.

  Failures 2 and 3 both look like the seed being a day old: it was seeded relative to Oct 21 and the date rolled to Oct 22 during the run. **Reseed local and re-run `gantt.spec.ts`** before treating either as a bug.

## What's left

1. Reseed local. Re-run `gantt.spec.ts` (expect it to pass) and `d48-toolbar.spec.ts -g P120` (investigate and fix it if it still fails).
2. Re-run the targeted production specs. Then `LEAD: run` the full ExUnit and the full default Playwright suite.
3. On DEV: Matt rechecks touch auto-scroll down on the Pixel, and QA rechecks the 12 items.
