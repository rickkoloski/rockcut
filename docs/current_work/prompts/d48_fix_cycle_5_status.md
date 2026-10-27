# D48 DEV QA fix cycle 5: status, 2026-10-22

Branch `d48-batch-changes`, on top of `4e77b83`. Two commits (`4caa431`, then Matt's answer 4), `fix: D48 DEV QA fix cycle 5 (…)`, **not pushed**.

**Inputs:**
- `prompts/d48_lead_decisions_6.md` (Y1, Y2 must-fix; Y3 minor);
- `stepwise_results/d48_qa_recheck4_report.md`.

No migration, so no restart: the running API's code reloader picked up the changes, and the targeted Playwright runs below used it.

## Fixed (with tests)

| Item | Change | Tests |
|---|---|---|
| **Y1** | **The move graph** (`Steps.graph!`):<ul><li>a step of a split batch loads the whole family (the parent and every part);</li><li>the parent's Split links to each part's first steps. These are virtual links, not stored: `Parts.split_links/3`, the part's steps with no link into them from another of its steps.</li></ul>**Moves:**<ul><li>**Move all** on any parent step on or before the Split walks on through the Split into the parts. The parts' unfinished steps move by the same days.</li><li>The preview's `batches` lists the parent and each part, so the prompt groups the following steps under "… P5.1" and "… P5.2", as the multi-batch prompt does.</li><li>**The Split itself** (drag, the batch dialog's date, the step dialog's Move, the API, a late check-off) **carries** its parts' steps with either answer. They're returned as a new preview field, `carried`. With nothing else following there's no prompt, and the snackbar reads "Split - Transfer moved 3 days later, with … P5.1 and … P5.2.". When nothing stays, the CIP follows the Split: the prompt asks about the CIP and says "… P5.1 and … P5.2 move with it either way."</li><li>**Shift** (dragging the parent's bar in time) does the same while the Split isn't done (`Batches.shift`).</li></ul>**Done part steps:**<ul><li>A done step on any part refuses each of those moves (Move all through the Split, any move of the Split, the parent's Shift). The error is `part_step_done`: "… P5.2: Carb is already done, so the split can't move. Mark it not done first.".</li><li>The Move all case is refused when it's applied; a move of the Split itself is refused already at the preview.</li><li>Move only on Brew day, which leaves the Split, is still allowed.</li></ul>**The flag:**<ul><li>A part's first step dated before its parent's Split raises `out_of_order`, "… P5.2: Carb is before Split - Transfer, the step it follows." (on the part and the parent). Key `out_of_order:split<id>:<step>`; the signature recipe is unchanged.</li><li>It's computed from the schedule, so it covers any route, such as a part's own Move only or Shift. The move prompt's "They'll be flagged." sees the same links.</li></ul>**Undo:** reverses the whole tree. The undo scope already covers a batch's split parts. | ExUnit `split_moves_test` (new, 8 Y1 tests):<ul><li>Move all from Brew day (the preview's groups, the parts +7, no flag);</li><li>from FDH;</li><li>the Split with no answer, with Move only, and with QA's +20;</li><li>Shift;</li><li>Move only on Brew day;</li><li>a part's Carb before the Split (flag, message, cleared by a move back);</li><li>a done part step (Move all, the Split, its preview, Shift; Move only still allowed);</li><li>Undo of a Move all and of the Split's move.</li></ul>`splits_marks_test`: changed by design (below). Controller test: the preview's groups, `carried`, the move and its Undo, the refusal's message.<br>Playwright `d48-fix-cycle-5`: the prompt lists P.1 and P.2 under their labels, with Move all as the default; Apply, then Undo; the Split's own date gives no prompt and the snackbar names the parts; Undo. |
| **Y2** | **Check-off** (`Steps.complete`, the only route that completes a step; the CIP route and, later, D49's board go through it):<ul><li>a Split, a Transfer/Filter or a Package (full or partial) is refused while the batch's first Brew day isn't done (a part's: its parent's).</li><li>The error is `before_brew_day`, "Check off brew day first.", already at the preview, so the step dialog shows it at once.</li></ul>**Audit:** multi-select has no check-off (only move and assign). The Gantt and batch dialogs check off through the step dialog, so every route gets the rule. Transfer/Filter and Package had the same hole: Package made a batch with no brew day "completed", like the Split. A Transfer done before brew day empties a tank that was never filled.<br>**Un-checking:**<ul><li>A Split or a full Package now goes back to what the steps support (`open_status`): fermenting once brewed, else **planned with no number**. So a batch already in QA's state is put right by Mark not done: back to its P-number, with Delete available after Undo split.</li><li>**New:** brew day can't be un-checked while a Split, Transfer/Filter or Package of the batch or its parts is done. The error is `exit_done`, "Mark Split - Transfer not done first." Without it, un-checking brew day would leave a "planned" batch with a done exit (see Questions).</li></ul>**DEV data:** QA recovered and deleted all four affected batches (1144, 1150, 1154, 1163), and the synthetic seed has no done exit before a done brew day, so the reseed leaves none. | ExUnit `split_moves_test` (5 Y2 tests):<ul><li>QA's exact sequence can't happen: the refusal, in the preview and the write; the batch stays planned with its P-number, and Undo split then Delete work;</li><li>a part's Package;</li><li>a lager's Transfer and Package, while another step can still be checked off;</li><li>the brewed control (check off and un-check the Split; brew day refused while it's done; then planned with no number);</li><li>a batch already in QA's state (written directly) is put right by Mark not done.</li></ul>`schedule_test`: two tests changed by design (below). Controller test: the 422 and its message. Playwright `d48-fix-cycle-5`: the step dialog's refusal; the batch stays planned with its P-number. |
| **Y3** | **API:** `change_brand` refuses a split parent with `split` ("Undo the split first."); a part still gets `split_part`. The parts no longer follow a brand change, because one can't happen while split.<br>**UI:** the batch dialog shows Brand and Template on a planned split parent **and** its parts as disabled pickers with "Undo the split first to change it". The parts showed plain text before. | `batch_changes_test`: changed by design (below). Controller test: the 422. Playwright `d48-fix-cycle-5`: both pickers disabled on the parent and on part 1, with the helper. |

**Changed tests (by design):**
- `splits_marks_test` "a step added to a part is unaffected by the parent's moves" is now "a parent's Move all takes the parts along; Move only leaves them". That test pinned the Y1 behavior.
- `batch_changes_test` "change brand: … parts too (P84)" is now "… locked while split (DEV QA Y3)".
- `schedule_test`: "on plan … Package (P112)" and "a full Package checked off early (M3)" set the batch to fermenting without a done brew day. They now also mark brew day done.
- Playwright `schedule.ts`, `Made.cleanup()`: un-checks a brewed batch's done Transfers and Packages (latest first) before its brew day, because `exit_done` now refuses the old order.

**Spec:** §3.11 Split has two new lines: Y2's check-off rule and Y1's "moves as one". "Change brand" now reads "(planned, not split): locked while split". `tests/COVERAGE.md` has rows for Y1–Y3.

## Revert check (temporary worktree)

- `git worktree add --detach ../rockcut-d48-revert5 4e77b83`. This cycle's five test files were copied in: `split_moves_test` and the four changed ones. `deps` was symlinked and `_build` copied.
- **99 tests, 15 failures**, each for the expected reason:
  - **Y1 (8):**
    - the parts didn't move (Move all from Brew day or FDH, Shift moved 4 steps and not 10, Undo);
    - no `carried`;
    - no flag for Carb before the Split;
    - the preview's `batches` was only the parent;
    - a done part step didn't refuse;
    - plus the controller test and the changed `splits_marks_test`.
  - **Y2 (5):** the Split, a part's Package and a lager's Transfer/Package checked off (`{:ok, …}`). Brew day un-checked while the Split was done. QA's bad state stayed brewed.
  - **Y3 (1):** the parent's brand change saved (`{:ok, …}`).
  - The two `schedule_test` changes pass on the old code, as expected: they only add a done brew day.
- **Cleanup:** `deps` was unlinked, then the worktree removed (`git worktree remove --force`). The main checkout's `deps` is intact. `rockcut-d48-deploy` is the lead's and untouched.

## Results

- **ExUnit (targeted):** 261 tests, 0 failures. This covers `production/*` (with the new `split_moves_test`), `production_test`, `seeds/*`, the three production controller tests, `device_route_matrix_test` and `authz_boundary_test`. `mix compile --warnings-as-errors --force` is clean, and the files I changed pass `mix format --check-formatted`.
- **UI:** tsc and ESLint (`src/pages/production`, `src/lib`, the new spec, `schedule.ts`) are clean. Vitest: 174 passed.
- **Playwright, targeted** (`--project=production --workers=1`), on the lead's running servers:
  - **Run 1:** d48-fix-cycle-1 to 5, d48-split-select and flags-cips. **29 passed** (4.0 min).
  - **Run 2:** d48-toolbar, d48-batch-changes, batches, d47-qa-fixes, steps and gantt. **56 passed** (5.7 min).
  - Every spec's seed check passed.

## Matt's answers (2026-10-24, decisions 6)

1–3. **Kept as built:** the `part_step_done` refusal for moving a split, the `exit_done` refusal on un-checking brew day (every batch), and the partial Package waiting for brew day.

4. **Changed.** Move all from a split parent's Brew day now titles the prompt "Galactic P5 and its 2 parts · Brew day moved 7 days later", not "3 batches · …".
   - The preview's `batches` entries now carry `split_parent_id`.
   - The prompt uses that wording when the batches are exactly one split parent and its parts.
   - Anything else is still "N batches · …", including a move that only touches parts, or a family plus another batch.
   - **Tests:**
     - ExUnit `split_moves_test`: the preview's `split_parent_id`s.
     - Playwright `d48-fix-cycle-5`: the new heading.
     - `d48-fix-cycle-1`'s "2 batches · 2 steps moved 1 day later" is unchanged and still passes.
   - **Rerun** after the lead's Oct 24 reseed:
     - ExUnit: `split_moves_test` (13) and the batch-changes controller test (14), 0 failures; compile clean.
     - tsc and ESLint: clean.
     - Playwright (`--workers=1`): d48-fix-cycle-5, d48-fix-cycle-1 and d48-split-select, **15 passed** (1.9 min).

## LEAD:

- No migration, no restart needed.
- `LEAD: run cd rockcut_api && mix test` (the full ExUnit suite).
- `LEAD: run cd rockcut-ui && npx playwright test` (the full default suite, `--workers=2` at most).
- Then the DEV deploy and full DEV suite, and the targeted QA recheck of Y1–Y3, split moves and check-offs (Matt's close-out rule).
