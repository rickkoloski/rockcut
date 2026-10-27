# D48 DEV QA fix cycle 3: status, 2026-10-22

Branch `d48-batch-changes`, on top of `b17bd34` (the lead's R4 change to decisions 4). Committed as `fix: D48 DEV QA fix cycle 3 (…)`, **not pushed**.

**Inputs:**
- `prompts/d48_lead_decisions_4.md`, with Matt's change to R4 (allow and flag, not refuse);
- `stepwise_results/d48_qa_recheck2_report.md` (R1 must-fix, R2–R4 minor).

## Fixed (with tests)

| Item | Change | Tests |
|---|---|---|
| **R1** | **Stale check (`Undo`):**<ul><li>A write that changes a batch's vessels now also records a hash of that batch's **whole** vessel list as the write left it (`entries["vessels"]` in the undo record; no migration).</li><li>Its Undo is `undo_stale` (409, "Something changed since. Nothing was undone.") if any vessel of that batch changed since, not only the rows the write changed. That's the gap QA found: the tank-change Undo only checked vessel 1, and the other user had changed vessel 0.</li><li>Writes that don't touch vessels (moves, ramps, steps, brand, sign-offs) record nothing extra, so their Undo isn't affected by a tank change.</li></ul>**N1 on the restored state:** after putting the rows back, in the same transaction, every batch whose vessels it touched (and still exists) runs `no_tank_twice!(batch, :all)` and refuses with `same_tank`.<br>**Audit:** the kinds that change vessels are tank change (picker and bar drag), add transfer / filter (also through Add step), remove transfer, template change, split, Undo split, Plan batch and Delete. All go through the same record, so all get both checks. On the old code, every one of add transfer, remove transfer, template change, split and Undo split could be undone into a same-tank pair (see the revert check). Moves, ramps, add / remove of other steps, brand changes and sign-offs don't touch vessels. | ExUnit `undo_vessels_test` (new, 10 tests): QA's two-user sequence; one test per kind (tank change, add transfer, remove transfer, template change, split, Undo split, Plan batch / Delete); a move's Undo is unaffected; N1 on restore (an older same-tank pair isn't put back). Controller test: the 409 and its body. |
| **R2** | New shared hook `src/hooks/useRefusal.ts`: a dialog's refusal, cleared when any of its inputs changes (compared by value, adjusted during render, so the stale message never paints).<ul><li>Used by Add step, Add a ramp, Change ramp, Add transfer / filter, Split (it replaces the N5 code there) and Plan batch.</li><li>**Batch dialog:** the banner clears when a new change starts (any picker, number, volume, brand, template), and when another dialog opens from it (Add step / ramp / transfer, Split, Undo split, Delete, a step's note).</li><li>Plan batch's per-field errors (from a changeset) are unchanged; only the banner clears.</li></ul> | Playwright `d48-fix-cycle-3` (Add step, Add a ramp, Change ramp; batch dialog → Add transfer; Plan batch's same-tank refusal clears when a tank changes) |
| **R3** | <ul><li>**API:** each part of a split is checked on its own (non-raising `BatchChanges.tank_twice/3`), and a refusal names the part: `{:part, n, reason}` → "Part 1: The beer goes into Q1SC next, on Fri Dec 18." (still `error: "same_tank"`).</li><li>**UI:** when nothing stays, part 1 (which keeps the later tanks) isn't offered the tank the beer goes into next. A tank picked before that became true stays shown, and the API's refusal names the part. The order dependence stays, as decided.</li></ul> | ExUnit `splits_marks_test` (updated for `{:part, 1, …}`), controller test (the message); Playwright `d48-fix-cycle-3` (part 1's picker, part 2's picker, the message) |
| **R4** (Matt's change) | **Allowed and flagged, not refused.** I had started a `transfer_order` refusal in `Steps.move` before the change arrived; it's taken out completely (`steps.ex` is back to how it was, and no refusal or error clause remains).<ul><li>New flag kind **`transfer_order`** (`Flags`): the Transfer/Filter into vessel k + 1 dated on or before the one into k, unless both are done. Key `transfer_order:<a>:<b>`; signature: both days and both tanks. It's computed from the schedule, so it appears after any route that reorders transfers (Move only, Shift-drag, multi-select move, a check-off on another day, a bar shift), and clears when the order is fixed (a move back, Undo, Move all).</li><li>Message: "Enos P7's transfers are out of order: on Thu Dec 17 the beer goes into Q1SB, which it's already in." when, by date, the beer is already in that tank. Otherwise: "… on Thu Nov 12 the beer goes into FV9, before BBT1 that day." (or "… before BBT1 on Fri Dec 18."). The flag's tank is the one the beer goes into.</li><li>**`dirty_fill`:** not raised for the same batch when its fill is dated on or before the earlier part's exit (the beer coming back before it left). That's the pair the new flag covers. Other `dirty_fill`s (another batch, a missing or late CIP after a real exit) are unchanged; `status_flags_test` still passes.</li><li>The move prompt's "They'll be flagged." stays. Sign-off works as for every flag (D47 rules). `Flag.kind` in `src/lib/production.ts` has the new kind.</li><li>Signature version: unchanged (`v1`). No existing flag's recipe changed; the new kind only adds signatures.</li></ul> | ExUnit `batch_changes_test` (A → B → A moved back first: flagged, no `dirty_fill`, clears on a move back; into a new tank: the other wording, clears on Undo, Move all keeps the order); Playwright `d48-fix-cycle-3` (Move only from the batch dialog's date, then the flag in the API and in the batch dialog's Flags, no `dirty_fill`) |
| **Robustness** | The `same_tank` message with no day (a vessel with no transfer into it, possible only in old data) reads "The beer goes into X next." instead of crashing in `strftime`. | — |

**Note on the A → B → A case:** after that Move only, D47's `out_of_order` link flag also shows (the moved transfer now comes before a step it follows). That's correct and was already the rule; the new flag says what the real problem is.

`tests/COVERAGE.md` has rows for R1–R4.

## Revert check (temporary worktree)

- `git worktree add --detach ../rockcut-d48-revert 3a6f4eb`; this cycle's four test files copied in (`undo_vessels_test`, `batch_changes_test`, `splits_marks_test`, the batch-changes controller test). `deps` was symlinked; `_build` and the test DB were the worktree's own.
- **67 tests, 11 failures**, each for the expected reason:
  - **R1, 7 kinds:** the tank change (QA's sequence), add transfer, remove transfer, template change, split and Undo split all gave `{:ok, …}`. Each left a same-tank pair.
  - **R1, restore check:** an older same-tank pair was put back (`{:ok, …}`).
  - **R1, controller:** 200, not 409.
  - **R3:** the bare `{:same_tank, "BBT1", ~D[2026-11-12]}`, with no part.
  - **R4:** no `transfer_order` flag. The A → B → A case gave `["dirty_fill", "out_of_order"]`, which is QA's misleading flag.
- **Cleanup:** the worktree was removed (`git worktree remove --force`, after unlinking `deps`). `git worktree list` no longer shows it; the main checkout's `deps` is intact.

## Results

- **ExUnit (targeted):** 231 tests, 0 failures. This covers `production/*` (with the new `undo_vessels_test`), `production_test`, `seeds/*`, the three production controller tests, `device_route_matrix_test` and `authz_boundary_test`. `mix compile --warnings-as-errors --force` is clean; the files I changed pass `mix format --check-formatted`.
- **UI:** tsc and ESLint (`src/pages/production`, `src/lib`, `src/hooks`, the new spec) are clean. Vitest: 170 passed.
- **Playwright, targeted** (`--project=production --workers=1`): d48-toolbar, d48-batch-changes, d48-split-select, d48-fix-cycle-1, d48-fix-cycle-2, d48-fix-cycle-3, batches, d47-qa-fixes, steps and gantt. **75 passed** (8.1 min; 74 tests plus the setup project).

## Lead note: the task-board flake (task 4706)

**Yes, a test toggling owner's color mode could explain it.** Owner's mode is one value on the server (`PUT /api/me/color_mode`), and three spec files set it:

- `ui/task-board-ui.spec.ts`, project `brewery-board`: "S151 board layers" and the flaky "owner, a done task card" set Light / Dark, then open the board and measure.
- `ui/theme.spec.ts`, project `chromium`: the G1/G2 block sets owner **Dark** in `beforeAll` and Light in `afterAll`.
- `ui/position-menu.spec.ts`, project `chromium`: sets owner Light / Dark per test, Light in `afterAll`.

`brewery-board` runs one worker at a time, but **beside** `chromium` (a full run uses `--workers=2`). So between the flaky test's `setOwnerMode('dark')` and its page load (or during it), a `chromium` worker can set owner back to Light, or the reverse. The board then loads in the other mode and the measured contrast belongs to the wrong theme.

QA toggling owner's theme on DEV during a run would do the same. QA recheck 2 says no suite was running then, so for run 4 the in-suite race is the likelier cause. Not fixed here, as decided. A fix would be to give those tests their own persona, or to run the three files in one project.

## Questions

None. Matt's R4 change is applied as written.

## LEAD:

- `LEAD: run cd rockcut_api && mix test` (the full ExUnit suite).
- `LEAD: run cd rockcut-ui && npx playwright test` (the full default suite, `--workers=2` at most).
- No migration, so no restart is needed: the undo record's new `vessels` key lives in the existing JSON column. Undo tokens made before this code have no `vessels` key and undo as before; they expire in 2 minutes anyway.
