# D48 DEV QA fix cycle 6: status, 2026-10-26

Branch `d48-batch-changes`, on top of `65972b8`. One commit, `fix: D48 DEV QA fix cycle 6 (…)`, **not pushed**.

**Inputs:**
- `prompts/d48_lead_decisions_7.md` (Z1 must-fix; Z2, Z3 minor);
- `stepwise_results/d48_qa_recheck5_report.md`.

No migration, so no restart: the running API's code reloader picked up the changes, and the targeted Playwright runs below used it.

## Fixed (with tests)

| Item | Change | Tests |
|---|---|---|
| **Z1** | **Order guards** in `Steps.complete` / `Steps.uncomplete`, the only routes that check a step off or un-check it. The step dialog, the API, a late (off-plan) check-off and the CIP routes (`/cips/:id/complete` calls `complete_step`) all go through them. Multi-select still has no check-off.<ul><li>**A part's exit waits for the Split.** A part's Transfer/Filter or Package (full or partial), on any part including the staying one, is refused while its parent's Split isn't done: `before_split`, "Check off Split - Transfer first." (the Split's own name, so "Split - Filter" where that's the method). It's refused at the preview too, so the step dialog shows it at once. `before_brew_day` is checked first, so it wins when brew day isn't done either. (The code `before_split` already existed for a move-date refusal in `BatchChanges`; this one has its own message.)</li><li>**The Split stays done while a part's exit is.** Mark not done on the Split is refused with `part_exit_done`, "Mark Galactic #40.2: Package not done first." (the part's label and the step). Undo split's `part_step_done` is unchanged.</li><li>**Part status, which way I went:** the cheap one, in `open_status`. A part's status after un-checking its Package is `planned` while its parent's Split isn't done (else `fermenting`). Also, after **any** un-check in a split family whose Split isn't done (or is the step being un-checked), every part is set to `planned` (`unfill_parts/3`). So a part already in the Z1 state is put right by the next un-check anywhere in its family, for example brew day. The reseed clears DEV in any case.</li><li>**Changed by design:** un-checking the Split used to leave a part `fermenting` if one of its steps (a Carb, say) was done. Now every part is planned once the Split isn't done, as Matt's rule says. No existing test pinned the old behavior.</li></ul> | ExUnit `split_moves_test`, new describe "Z1" (6 tests):<ul><li>QA's route 2: each part's Package (the staying part and part 2) refused in the preview and the write, statuses stay planned; the control, a part's Carb before the Split, still checks off and un-checks;</li><li>`before_brew_day` wins over `before_split`;</li><li>QA's route 1: `{:part_exit_done, "Galactic #40.2", "Package"}`, then the order back (Package → Split → brew day) leaves every part planned;</li><li>un-checking the Split makes a part with a done Carb planned;</li><li>a part left fermenting (written directly) is put right by un-checking brew day;</li><li>a lager split before its transfer: a part's Transfer is refused; the unsplit lager's Package-before-Transfer still checks off (completed) and un-checks (fermenting).</li></ul>Controller test (`production_batch_changes_controller_test`): both 422s and their messages, the refusal in the preview and the write.<br>Playwright `d48-fix-cycle-6` "Z1": the step dialog's refusal on part 2's Package with the Split not done ("Check off Split - Transfer first.", nothing saved), and on Mark not done of the Split with part 2's Package done ("Mark … #T….2: Package not done first."). |
| **Z2** | The check-off snackbar (`flows.tsx`, `checkOff`): when the Split done on another day carries parts, it reads "Split - Transfer done, 5 days late. … P6.1 and … P6.2 moved with it." ("early" for an early one). With a following CIP and Move all it adds "and 1 following step". Other check-offs keep their wording. Undo unchanged. | Playwright `d48-fix-cycle-6` "Z2": the exact wording (labels from the schedule, days computed), the parts moved, Undo restores the tree and the Split is not done. |
| **Z3** | `Steps.update` (the step PATCH, also used for a standalone CIP through `/steps/:id`) refuses `due_on`, `done_on` and `completed_at` with 422 `date_not_here`, "To change a step's date, move it (or check it off on the day it was done)." Nothing else in that request is saved. The fields it really saves are unchanged. The UI never sends a date there (checked: `StepDialog.changes()`, `BatchDialog` patch; `BatchChanges` takes only its `@edit_fields`). | Controller test (`production_schedule_controller_test`): each of the three fields → 422 with the message; the step's date and notes unchanged. |

**Also fixed (test only):** `production_controller_test` "out-of-service periods" failed today (Oct 26). Its "now" period (today − 3 … today + 2) overlapped the test's own fixed Tue Oct 27 period, so the add gave `outage_overlap`. It's a calendar time bomb, not this cycle's code. The "now" period now goes on a second tank. It fails on any day from Oct 25 to Nov 5, so it would have failed the lead's full suite.

**Spec:** §3.11 Split has a new line for Z1 and Z2. `tests/COVERAGE.md` has rows for Z1–Z3.

## Revert check (temporary worktree)

- `git worktree add --detach ../rockcut-d48-revert6 65972b8`. This cycle's four changed test files were copied in. `deps` was symlinked and `_build` copied.
- **44 tests, 7 failures**, each a new test, each for the expected reason: the five Z1 `split_moves_test` tests (a part's Package / Transfer checked off before the Split, the Split un-checked under a done part Package, a part left fermenting), the Z1 controller test, and the Z3 PATCH (200, not 422).
- "`before_brew_day` wins" passes on the old code, as expected, since that refusal was already there. The outage test passes with its fix.
- **Cleanup:** `deps` unlinked, then the worktree removed. The main checkout's `deps` is intact, and `rockcut-d48-deploy` (the lead's) is untouched.

## Results

- **ExUnit (targeted):** 268 tests, 0 failures (after the time-bomb fix; 1 failure before it, the outage test above). This covers `production/*` (with the new Z1 tests), `production_test`, `seeds/*`, the three production controller tests, `device_route_matrix_test` and `authz_boundary_test`. `mix compile --warnings-as-errors --force` is clean, and the files I changed pass `mix format --check-formatted`. (`formula_controller_test.exs` fails the format check on `develop` already; I didn't touch it.)
- **UI:** tsc and ESLint (`src/pages/production`, `src/lib`, the new spec) are clean. Vitest: 174 passed.
- **Playwright, targeted** (`--project=production --workers=1`), on the lead's running servers: 
  - **Run 1:** d48-fix-cycle-1 to 6, d48-split-select and flags-cips. **31 passed** (4.4 min).
  - **Run 2:** d48-toolbar, d48-batch-changes, batches, d47-qa-fixes, steps and gantt. **57 passed, 2 failed** (6.3 min). Both failures are in `gantt.spec.ts` (P49–P51, P46), and both are the local seed's age, not this cycle. They expect the seed's Crusher #42 "Set temp - 58°" due **today**, but the local DB was last reseeded on Oct 24, so on Oct 26 it's "58° change late" / `data-state="late"`. Nothing in this cycle touches status lines or diamonds. A local reseed before the full suite should clear them.
  - Every spec's seed check passed.

## LEAD:

- No migration, no restart needed.
- `LEAD: reseed local` (synthetic seed) before the full Playwright suite: the gantt seed checks are dated from the reseed day (see Results).
- `LEAD: run cd rockcut_api && mix test` (the full ExUnit suite).
- `LEAD: run cd rockcut-ui && npx playwright test` (the full default suite, `--workers=2` at most).
- Then the DEV deploy and full DEV suite, and the targeted QA recheck of Z1–Z3 and split check-off order (Matt's close-out rule).
