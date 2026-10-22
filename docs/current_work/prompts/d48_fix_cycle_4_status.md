# D48 DEV QA fix cycle 4: status, 2026-10-22

Branch `d48-batch-changes`, on top of `577de4a`. Two commits, **not pushed**:
- `e30b788` `fix: D48 DEV QA fix cycle 4 (split tree rule, Undo of Undo split, exact Undo split)`;
- `fix: D48 fix cycle 4 lock tanks while split`: Matt's answer 1, which replaces the "staying part follows the parent" behavior from the first commit, plus a fix to my cycle-3 spec edit.

**Inputs:**
- `prompts/d48_lead_decisions_5.md`: the rule extended to splits, X1–X5, Matt's close-out rule, and Matt's answers to my two questions;
- `stepwise_results/d48_qa_recheck3_report.md`.

## The model (one migration)

`20261022140001_add_split_stays_and_links` adds two columns to `batches`:
- **`split_stays`** (boolean, on a part): the part that stays in the parent's tank. Until now this was only implied by tank equality, so after a tank change nothing could tell which part was meant to stay. That's what let X1 and X2 through. For splits made before the migration, it's backfilled: the part whose first tank is the parent's last tank.
- **`split_links`** (map, on the parent while it's split): the parent's links into and out of the steps the split moved, with the moved ends written as the keeping part's copies. Undo split puts them back (X3).

The schedule serializes `split_stays` on each batch (`SchedBatch.split_stays`).

**Locked while split** (Matt's answer 1; `BatchChanges.unlocked!/2`). While a batch is split:
- the parent's tanks and the staying part's first tank can't change. The API answers `split` ("Undo the split first.");
- no transfer can be added on the parent, or removed from it. All of the parent's vessels come before the Split.

Still allowed, under the tree rule:
- a leaving part's first tank;
- **any part's later vessels** (its own transfers and their tanks). Matt's answer names a leaving part's. I read "the staying part's tank" as its first one, so the staying part's later tanks change too. Say if those should lock as well.

The first commit's `keep_stayer!` (the staying part following its parent) is gone, with its tests.

## Fixed (with tests)

| Item | Change | Tests |
|---|---|---|
| **The lock** (Matt) | `unlocked!/2` refuses with `split` in `set_vessel_tank` (the parent's any vessel, the staying part's vessel 0) and in add / remove transfer on a split parent (also through Add step).<br>**UI:** `splitLocked()` in `lib/gantt.ts`. On a split, the batch dialog's locked pickers are read-only, with "Undo the split first to change it". **Add transfer / filter…** is off on a split parent. A locked bar's drag hint reads "→ Q1SE · Undo the split first to change it", and the drop is refused ("Undo the split first."). | ExUnit `split_tree_test`: the parent's tank (into a part's tank, a free one, Unassigned), the staying part's tank, add transfer on the parent, remove transfer on the parent (a lager split after its transfer), the parent locked with nothing staying. Controller: `split` for the parent and the staying part. Vitest: `splitLocked`. Playwright `d48-fix-cycle-4`: read-only pickers with the helper, Add transfer off, the parent's bar drag (hint and drop). |
| **The tree rule** | `BatchChanges.no_tree_twice!/3` / `tree_twice/3`. On a split (the parent or a part):<ul><li>`tank_twice` along the parent and along each part, with a part's refusal named (`{:part, n, …}`);</li><li>a part that leaves doesn't start in the tank the beer is in at the Split, nor in another part's tank.</li></ul>Messages, all `same_tank`:<ul><li>"Part 2: The beer is already in Q1TD." (a leaving part's later tank, or a part back into the parent's tank when nothing stays);</li><li>"Part 2 can't go into Q1TA: part 1 stays there." (part 2 into the staying part's tank);</li><li>"Part 2 can't go into Q1TD: part 1 goes there." (two leaving parts in one tank, named on the part the change was on).</li></ul>A batch that isn't split gets `no_tank_twice!` exactly as before.<br>**Used by:** a part's tank change (`set_vessel_tank`: picker and bar drag), add / remove transfer on a part (also through Add step), split (a final whole-tree check), and every Undo. Template change is still refused on a split. | ExUnit `split_tree_test` (15 tests with the lock and X1/X3 ones): part 2 → the staying tank, then a free one; nothing stays (shared tank, back into the parent's, a free one); a part's later tanks and transfers (part 2 back into its own tank, part 1's later tank, a transfer on part 2). Controller test: the message over HTTP. |
| **X1** | **Undo:**<ul><li>the stale check's vessel record now covers the **whole split tree** of every batch whose vessels a write changed, including the parent of the parts an Undo split deleted. The merged batch's Ferment in is in that record, so changing it makes the Undo of the Undo split a 409.</li><li>A write on a part now tracks its parent and the other parts too, so its stale check and tree rule cover the whole split.</li><li>What an Undo puts back is checked with the tree rule from each touched tree's root. That covers every batch a record touches, not only the ones in its vessel record.</li></ul> | ExUnit: QA's sequence (other user → part 2's tank: `undo_stale`, nothing re-split); an unused tank (stale too); nothing changed (re-splits with part 1 staying); the tree rule on its own (a record without the vessel hashes, as from before R1: `{:part, 2, {:same_tank, "FV9"}}`). Controller: the HTTP 409. |
| **X2** | **API:** as above.<br>**UI:** `treeRefusal()` in `lib/gantt.ts` mirrors the API's rule, the lock first.<ul><li>On a split, a part's unlocked pickers leave out every tank it refuses. The tank already picked stays shown.</li><li>A bar drag's hint gives the reason ("→ FV2 · Part 2 can't go into FV2: part 1 stays there"). The drop is refused by the API with the same message.</li><li>A batch that isn't split keeps its pickers as they were (all tanks, refusal in the banner).</li></ul> | Vitest `gantt.test` (4 cases); Playwright `d48-fix-cycle-4` (part 2's picker leaves out the staying tank and offers a free one; part 2's bar drag: hint and refusal) |
| **X3** | **Undo split:**<ul><li>merges back the part that **stays** (else part 1, the part that kept the later tanks), so the later tanks survive whichever part stayed;</li><li>puts back `split_links`, so FDH (here: the Transfer) follows Brew day again, not the step before the Split;</li><li>falls back to the old relinking for a split made before the migration.</li></ul>The confirm and the snackbar name the part ("with part 2's schedule"). | ExUnit: split, then Undo split, then compare with the pre-split batch (steps without ids, links by step, vessels, row). Run for part 1 stays, part 2 stays and nothing stays, on a lager with an added step before the Split. |
| **X4** | <ul><li>Part 1's picker leaves out the next tank whenever no **other** part stays. Before, it was asked with part 1 itself still "(stays here)", which is QA's path.</li><li>The split dialog shows the refusal before **Split**, as the transfer preview does (`split-preview`): "Part 1: The beer goes into … next, on …", or "Two parts can't go into the same tank."</li></ul> | Playwright `d48-fix-cycle-4` (QA's path; the preview), `d48-fix-cycle-3` R3 updated (b isn't offered to staying part 1; reached through part 2 staying, then the preview and the API refusal) |
| **X5** | A refused Undo refetches the schedule (`flows.undo`), so the chart and the batch dialog (which reads the schedule) show the server's tanks at once. | Playwright `d48-fix-cycle-4` (other user's Ferment in; after the 409, the bar is on that tank's row and the reopened dialog shows it) |

**Changed tests (by design):**
- `splits_marks_test`: a part's own transfer refusal is now named ("Part 1: …"), as decided.
- `undo_vessels_test` "split: stale…" (now "…once a part's vessel changed"): the interfering change moved the parent, which is now locked. It changes part 2's tank instead, and still gets `undo_stale`.
- `d48-fix-cycle-3` R3: picked b for part 1 while part 1 stayed, which X4 removes. Now part 1 goes into c first, then part 2 takes "(stays here)", then part 1 takes b. My first edit clicked part 2's "(stays here)" while part 1 still stayed, which is disabled. That was the one failure in the first Playwright run below.

`tests/COVERAGE.md` has rows for X1–X5.

## Revert check (temporary worktree, first commit)

- `git worktree add --detach ../rockcut-d48-revert4 577de4a`. This cycle's four ExUnit files were copied in: `split_tree_test`, `undo_vessels_test`, `splits_marks_test` and the batch-changes controller test. `deps` was symlinked, and `_build` copied.
- **59 tests, 18 failures**, each for the expected reason:
  - **X2:** the parent → part 2's tank, part 2 → the staying tank, the staying part → part 2's tank, nothing-stays sharing and the transfer into part 2's tank all gave `{:ok, …}`. The parent → another tank left part 1 behind (FV1, not FV10), and so did its Undo case. A part's own path wasn't named.
  - **X1:** QA's sequence and the unused-tank case re-split (`{:ok, …}`), and so did the tree-rule-on-restore case.
  - **X3:** in all three cases, the merged batch differed. The Transfer came back after PDH instead of Brew day, and with part 2 staying, vessel 1 was `nil` (QA's dropped tank).
  - **The new field:** `split_stays` missing (KeyError / `nil`, 2 tests).
  - **Changed by design:** the two tests listed above.
- The lock commit changed some of these tests: the "follows" ones became lock tests. I didn't repeat the revert check for it. On the old code the lock tests would fail the same way as the X2 ones (`{:ok, …}`).
- **Cleanup:** `deps` was unlinked, then the worktree removed (`git worktree remove --force`). The main checkout's `deps` is intact. `rockcut-d48-deploy` is the lead's and untouched.

## Results

- **ExUnit (targeted), after the lock:** 247 tests, 0 failures. This covers `production/*`, `production_test`, `seeds/*`, the three production controller tests, `device_route_matrix_test` and `authz_boundary_test`. `mix compile --warnings-as-errors` is clean, and the files I changed pass `mix format --check-formatted`. I put back `batch.ex`'s `cast` list after `mix format` rewrapped it: my change there is only the two fields.
- **UI, after the lock:** tsc and ESLint (`src/pages/production`, `src/lib`, `src/hooks`, the two specs) are clean. Vitest: 174 passed.
- **Playwright, targeted** (`--project=production --workers=1`), after the lead's restart with the migration and a refreshed seed:
  - **Run 1** (first commit): d48-toolbar, d48-batch-changes, d48-split-select, d48-fix-cycle-1 to 4, batches, d47-qa-fixes, steps and gantt. **77 passed, 1 failed** (9.1 min). The failure was `d48-fix-cycle-3` R3, the spec mistake described above.
  - **Run 2** (after the lock): d48-fix-cycle-3, d48-fix-cycle-4 and d48-split-select, **15 passed** (2.2 min); then batches and d48-batch-changes (the batch dialog and the drag hint changed), **24 passed** (2.7 min).
  - Not rerun after the lock: d48-toolbar, d48-fix-cycle-1/2, d47-qa-fixes, steps and gantt. They don't use split batches, and they passed in run 1.

## Matt's answers (applied)

1. **Lock:** applied as above. Open reading: the staying part's **later** tanks (and a leaving part's first tank) stay changeable under the tree rule; only the staying part's first tank is locked.
2. **Undo split after edits:** kept as built.

## LEAD:

- No new migration in the lock commit, and no restart needed. The running API's code reloader picked up the lock: run 2's lock checks got "Undo the split first." from it.
- `LEAD: run cd rockcut_api && mix test` (the full ExUnit suite).
- `LEAD: run cd rockcut-ui && npx playwright test` (the full default suite, `--workers=2` at most).
- DEV needs the migration at its next deploy. The backfill marks existing staying parts, including the seed's #39.1.
- Undo tokens made before this code have no tree in their vessel record. They undo as in cycle 3, now with the tree check, and they expire in 2 minutes anyway.
