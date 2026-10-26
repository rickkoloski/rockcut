# D48 DEV QA fix cycle 7: status, 2026-10-26

Branch `d48-batch-changes`, on top of `f1a2e19`. One commit, `fix: D48 DEV QA fix cycle 7 (…)`, **not pushed**.

**Inputs:**
- `prompts/d48_lead_decisions_8.md` (AA1 must-fix, AA2 minor);
- `stepwise_results/d48_qa_recheck6_report.md`.

No migration, so no restart: the running API's code reloader picked up the changes, and the targeted Playwright runs below used it.

## Fixed (with tests)

| Item | Change | Tests |
|---|---|---|
| **AA1** | **Undo obeys the order rules, in one place** (`Undo.restore`, so every undo kind). Before putting rows back, it notes the steps whose done state it flips: a step whose `done_on` goes from set to empty or back, against the row as it is now. A step it re-inserts counts as not done now. After putting the rows back, `Steps.order_after_undo!/2` runs the same guards a direct write does, against the schedule as the Undo leaves it:<ul><li>a step it marks **done** gets the check-off rules (`before_brew_day`, then `before_split`);</li><li>a step it marks **not done** gets the un-check rules (`exit_done`, `part_exit_done`).</li></ul>The guards are now shared functions (`check_off_order!/3`, `uncheck_order!/3`). `Steps.complete` and `Steps.uncomplete` call the same functions, so the rules exist once.<br>**Refusal shape:** the rule's own code and message (422), e.g. `part_exit_done` "Mark … #44.2: Transfer not done first.", not `undo_stale`. The Undo error path already goes through `ProductionErrors.handle`, so nothing new was needed there. The refusal rolls the transaction back, so nothing is undone and the undo record stays: the same Undo works once the blocker is cleared, within its 2 minutes.<br>**Unchanged:** the stale check and its signature (QA's caught cases, such as a full Package, still give `undo_stale`), and moves' and splits' stale and tree rules.<br>**Audit**, every undo kind that can change a step's done state. All go through `Undo.restore`, so all get the guards:<ul><li>check-off (`/steps/:id/complete`);</li><li>un-check (`/uncomplete`);</li><li>a late or off-plan check-off with its carried move (the same route; only the checked-off step flips, and the moved dates are rows like any other);</li><li>the CIP routes (`/cips/:id/complete`, `/uncomplete` call the step routes; a CIP isn't an exit, so the guards pass, as QA's note and "Don't change" want).</li></ul>Writes that delete steps and whose Undo re-inserts them (remove step, template change, Undo split, delete batch) are covered by the re-insert rule. None of them can delete a done step anyway (`step_done` / `part_step_done` / `not_planned`). | ExUnit `split_moves_test`, new describe "AA1" (5 tests), each refused with the right code and message and nothing changed, then the same Undo succeeding once the blocker is cleared:<ul><li>path A, as two sequential writes by two users (`part_exit_done`, "Transfer");</li><li>path B, Package - Partial (`part_exit_done`);</li><li>path C, the Transfer's un-check undone after the Split is un-checked (`before_split`), which works again once the Split is done;</li><li>brew day both ways on a lager: Undo of brew day's check-off while a Partial is done (`exit_done`), and Undo of the Partial's un-check after brew day is un-checked (`before_brew_day`);</li><li>controls: Undo of a plain Carb check-off and of a Split un-check still work, and recheck 6's full-Package case is still `undo_stale`.</li></ul>Controller test: path A over HTTP (brewer1 and brewer2), the 422 with "Mark Enos P1.2: Transfer not done first.", then the Undo working after brewer2 un-checks the Transfer.<br>Playwright `d48-fix-cycle-7`: path A in the UI with two contexts, owner and breweryMgr. Each checks off on the step's own day in the step dialog. The owner's snackbar Undo shows "Mark … #T….2: Transfer not done first.", and part 2 is still fermenting with its Transfer done. |
| **AA2** | Brew day's `exit_done` names the part when the done exit is a part's: "Mark Galactic #40.2: Package not done first." A parent's own exit keeps "Mark Split - Transfer not done first." This applies to direct un-checks and to Undo (the same function). | ExUnit `split_moves_test` "AA2": both wordings. The part case is set up by writing AA1's state directly, since it can no longer be reached. |

**Spec:** §3.11 Split, the Z1 line now also covers Undo (AA1) and AA2's wording. `tests/COVERAGE.md` has rows for AA1 and AA2.

## Revert check (temporary worktree)

- `git worktree add --detach ../rockcut-d48-revert7 f1a2e19`. This cycle's two changed test files were copied in. `deps` was symlinked and `_build` copied.
- **41 tests, 6 failures**, each for the expected reason:
  - paths A, B and C, and the lager's brew-day Undo: `{:ok, …}` where a refusal was expected;
  - AA2: "Package", not "Galactic #40.2: Package";
  - the controller test: 200, not 422.
- The controls pass on the old code, as they should.
- **Cleanup:** `deps` unlinked, then the worktree removed. The main checkout's `deps` is intact, and `rockcut-d48-deploy` (the lead's) is untouched.

## Results

- **ExUnit (targeted):** 275 tests, 0 failures. This covers `production/*`, `production_test`, `seeds/*`, the three production controller tests, `device_route_matrix_test` and `authz_boundary_test`. `mix compile --warnings-as-errors --force` is clean, and the files I changed pass `mix format --check-formatted`.
- **UI:** no app code changed this cycle; ESLint on the new spec is clean.
- **Playwright, targeted** (`--project=production --workers=1`), on the lead's running servers (reseeded today):
  - **Run 1:** d48-fix-cycle-1 to 7, d48-split-select and flags-cips. **32 passed** (4.7 min).
  - **Run 2:** d48-toolbar, d48-batch-changes, batches, d47-qa-fixes, steps and gantt. **59 passed** (6.3 min). The gantt seed checks pass again after today's reseed.
  - Every spec's seed check passed. Each run used one browser at a time, and each was closed.

## LEAD:

- No migration, no restart needed.
- `LEAD: run cd rockcut_api && mix test` (the full ExUnit suite).
- `LEAD: run cd rockcut-ui && npx playwright test` (the full default suite, `--workers=2` at most).
- Then the DEV deploy and full DEV suite, and the targeted QA recheck of AA1–AA2 (Undo around the Split).
