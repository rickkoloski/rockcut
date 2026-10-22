# D48 DEV QA fix cycle 4: status, 2026-10-22

Branch `d48-batch-changes`, on top of `577de4a`. Committed as `fix: D48 DEV QA fix cycle 4 (…)`, **not pushed**.

**Inputs:**
- `prompts/d48_lead_decisions_5.md`: the rule extended to splits, X1–X5, and Matt's close-out rule;
- `stepwise_results/d48_qa_recheck3_report.md`.

## The model (one migration)

`20261022140001_add_split_stays_and_links` adds two columns to `batches`:
- **`split_stays`** (boolean, on a part): the part that stays in the parent's tank. Until now this was only implied by tank equality, so after a tank change nothing could tell which part was meant to stay. That's what let X1 and X2 through. For splits made before the migration, it's backfilled: the part whose first tank is the parent's last tank.
- **`split_links`** (map, on the parent while it's split): the parent's links into and out of the steps the split moved, with the moved ends written as the keeping part's copies. Undo split puts them back (X3).

The schedule serializes `split_stays` on each batch (`SchedBatch.split_stays`).

**The part that stays continues in its parent's tank** (`BatchChanges.keep_stayer!/2`). It's one tank, so the two move together:
- the parent's last tank changes (Ferment in / Transfer to, a bar drag, or a transfer added or removed before the Split) → the staying part's first tank follows;
- the staying part's first tank changes → the parent's last tank follows.

QA's other "accepted" cases (the parent → an unused tank, part 1 "stays" → another tank) are now coherent moves, not refusals. **This is my call, not one the lead's text spells out.** The alternative is to refuse them, e.g. "Undo the split first". See the questions.

## Fixed (with tests)

| Item | Change | Tests |
|---|---|---|
| **The tree rule** | `BatchChanges.no_tree_twice!/3` / `tree_twice/3`. On a split (the parent or a part):<ul><li>`tank_twice` along the parent and along each part, with a part's refusal named (`{:part, n, …}`);</li><li>a part that leaves doesn't start in the tank the beer is in at the Split, nor in another part's tank.</li></ul>Messages, all `same_tank`:<ul><li>"Part 2: The beer is already in Q1TD." (the parent, or a transfer before the Split, into part 2's tank);</li><li>"Part 2 can't go into Q1TA: part 1 stays there." (part 2 into the staying part's tank);</li><li>"Part 1 can't go into Q1TD: part 2 goes there." (the staying part into part 2's tank, or two leaving parts in one tank, named on the part the change was on).</li></ul>A batch that isn't split gets `no_tank_twice!` exactly as before.<br>**Used by:** tank change (`set_vessel_tank`: picker and bar drag), add transfer / filter (also through Add step), remove transfer, split (a final whole-tree check), and every Undo. Template change is still refused on a split. | ExUnit `split_tree_test` (new, 17 tests): parent → part 2's tank; part 2 → the staying tank; the staying part → part 2's tank; the parent → another tank and back (the part follows); its Undo restores both; a transfer before the Split (refused into part 2's tank; into a free tank the staying part follows; removing it brings both back); nothing stays (shared tank, back into the parent's); a part's own path named. Controller test: the three messages over HTTP. |
| **X1** | **Undo:**<ul><li>the stale check's vessel record now covers the **whole split tree** of every batch whose vessels a write changed, including the parent of the parts an Undo split deleted. The merged batch's Ferment in is in that record, so changing it makes the Undo of the Undo split a 409.</li><li>A write on a part now tracks its parent and the other parts too (needed for the staying part's tie).</li><li>What an Undo puts back is checked with the tree rule from each touched tree's root. That covers every batch a record touches, not only the ones in its vessel record.</li></ul> | ExUnit: QA's sequence (other user → part 2's tank: `undo_stale`, nothing re-split); an unused tank (stale too); nothing changed (re-splits with part 1 staying); the tree rule on its own (a record without the vessel hashes, as from before R1: `{:part, 2, {:same_tank, "FV9"}}`). Controller: the HTTP 409. |
| **X2** | **API:** as above.<br>**UI:** `treeRefusal()` in `lib/gantt.ts` mirrors the API's rule, including the staying part's tie.<ul><li>On a split, the batch dialog's pickers (the parent's Ferment in / Transfer to, a part's tanks) leave out every tank it refuses. The tank already picked stays shown.</li><li>A bar drag's hint gives the reason ("→ FV2 · Part 2 can't go into FV2: part 1 stays there"). The drop is refused by the API with the same message.</li><li>A batch that isn't split keeps its pickers as they were (all tanks, refusal in the banner).</li></ul> | Vitest `gantt.test` (4 cases); Playwright `d48-fix-cycle-4` (the parent's picker leaves out part 2's tank, and another tank takes part 1 with it, then Undo; part 2's picker leaves out the staying tank; the bar drag's hint and refusal) |
| **X3** | **Undo split:**<ul><li>merges back the part that **stays** (else part 1, the part that kept the later tanks), so the later tanks survive whichever part stayed;</li><li>puts back `split_links`, so FDH (here: the Transfer) follows Brew day again, not the step before the Split;</li><li>falls back to the old relinking for a split made before the migration.</li></ul>The confirm and the snackbar name the part ("with part 2's schedule"). | ExUnit: split, then Undo split, then compare with the pre-split batch (steps without ids, links by step, vessels, row). Run for part 1 stays, part 2 stays and nothing stays, on a lager with an added step before the Split. |
| **X4** | <ul><li>Part 1's picker leaves out the next tank whenever no **other** part stays. Before, it was asked with part 1 itself still "(stays here)", which is QA's path.</li><li>The split dialog shows the refusal before **Split**, as the transfer preview does (`split-preview`): "Part 1: The beer goes into … next, on …", or "Two parts can't go into the same tank."</li></ul> | Playwright `d48-fix-cycle-4` (QA's path; the preview), `d48-fix-cycle-3` R3 updated (b isn't offered to staying part 1; reached through part 2 staying, then the preview and the API refusal) |
| **X5** | A refused Undo refetches the schedule (`flows.undo`), so the chart and the batch dialog (which reads the schedule) show the server's tanks at once. | Playwright `d48-fix-cycle-4` (other user's Ferment in; after the 409, the bar is on that tank's row and the reopened dialog shows it) |

**Changed tests (by design):**
- `splits_marks_test`: a part's own transfer refusal is now named ("Part 1: …"), as decided.
- `undo_vessels_test` "split: stale…": the interfering change moved the parent into BBT1. That's now refused, because staying part 1 would go from BBT1 into BBT1. It uses a free tank instead (part 1 follows) and still gets `undo_stale`.
- `d48-fix-cycle-3` R3: picked b for part 1 while part 1 stayed, which X4 removes.

`tests/COVERAGE.md` has rows for X1–X5.

## Revert check (temporary worktree)

- `git worktree add --detach ../rockcut-d48-revert4 577de4a`. This cycle's four ExUnit files were copied in: `split_tree_test`, `undo_vessels_test`, `splits_marks_test` and the batch-changes controller test. `deps` was symlinked, and `_build` copied.
- **59 tests, 18 failures**, each for the expected reason:
  - **X2:** the parent → part 2's tank, part 2 → the staying tank, the staying part → part 2's tank, nothing-stays sharing and the transfer into part 2's tank all gave `{:ok, …}`. The parent → another tank left part 1 behind (FV1, not FV10), and so did its Undo case. A part's own path wasn't named.
  - **X1:** QA's sequence and the unused-tank case re-split (`{:ok, …}`), and so did the tree-rule-on-restore case.
  - **X3:** in all three cases, the merged batch differed. The Transfer came back after PDH instead of Brew day, and with part 2 staying, vessel 1 was `nil` (QA's dropped tank).
  - **The new field:** `split_stays` missing (KeyError / `nil`, 2 tests).
  - **Changed by design:** the two tests listed above.
- **Cleanup:** `deps` was unlinked, then the worktree removed (`git worktree remove --force`). The main checkout's `deps` is intact. `rockcut-d48-deploy` is the lead's and untouched.

## Results

- **ExUnit (targeted):** 249 tests, 0 failures. This covers `production/*` (with the new `split_tree_test`), `production_test`, `seeds/*`, the three production controller tests, `device_route_matrix_test` and `authz_boundary_test`. `mix compile --warnings-as-errors --force` is clean; the files I changed pass `mix format --check-formatted`. I put back `batch.ex`'s `cast` list after `mix format` rewrapped it: my change there is only the two fields.
- **UI:** tsc and ESLint (`src/pages/production`, `src/lib`, `src/hooks`, the two specs) are clean. Vitest: 174 passed.
- **Playwright (targeted):** **pending.** The running API needs the migration first (LEAD below).

## Questions for Matt

1. **The staying part moves with its parent's tank.** When the parent's Ferment in (or last Transfer to) changes on a split batch, or a transfer is added before the Split, the part that stays follows it, and the reverse. Changing either is "the beer that stays is in that tank". The alternative is to lock the parent's last tank and the staying part's first tank while split ("Undo the split first"), like volume and template. I went with following. Say if you'd rather lock them.
2. **Undo split after changes to the parts.** It merges the part that stays (else part 1) as it is *now*, with the links from split time where both ends still exist. An exact restore is only promised when nothing changed since the split. The snackbar Undo of the split itself is still exact.

## LEAD:

- `LEAD: restart API`. There's a new migration (`20261022140001_add_split_stays_and_links`), so run `cd rockcut_api && mix ecto.migrate` before `mix phx.server`. DEV also needs it at its next deploy. The backfill marks existing staying parts, including the seed's #39.1.
- After the restart, I'll run the targeted production Playwright specs (`--project=production --workers=1`: d48-toolbar, d48-batch-changes, d48-split-select, d48-fix-cycle-1 to 4, batches, d47-qa-fixes, steps and gantt; about 9 min) and update this file.
- Then `LEAD: run cd rockcut_api && mix test` (the full ExUnit suite), and `LEAD: run cd rockcut-ui && npx playwright test` (the full default suite, `--workers=2` at most).
- Undo tokens made before this code have no tree in their vessel record. They undo as in cycle 3, now with the tree check, and they expire in 2 minutes anyway.
