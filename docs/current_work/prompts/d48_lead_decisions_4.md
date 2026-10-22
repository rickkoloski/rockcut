# D48 lead decisions 4: QA recheck 2 findings (fix cycle 3), 2026-10-22

**Inputs:**
- QA recheck 2, `stepwise_results/d48_qa_recheck2_report.md` (DEV, `48f5688`): N1–N6 and the addendum are all fixed, and the 12 first-pass items still hold. New: R1 must-fix, R2–R4 minor.
- DEV run 4 at `48f5688`: 523 passed, 1 failed (the known flake, task 4706).
- Matt: keep the three-save swap (decisions 3, addendum item 4).

Fix everything below, with tests at the level each fix lives. Commit as `fix: D48 DEV QA fix cycle 3 (…)`. **Don't push.** Run the targeted production specs, then `LEAD: run` the full suites. Status goes in `prompts/d48_fix_cycle_3_status.md`.

## Must-fix

**R1. Every Undo must be stale-checked, and its result must pass the N1 rule.**
- **Stale check:** a vessel-tank change's undo is currently neither stale-checked nor re-validated. Give it the same `undo_stale` check the transfer undo has: if the batch's vessels changed after that change, refuse with 409 `undo_stale` ("Something changed since. Nothing was undone.").
- **Audit all undo kinds:** check every kind the D47/D48 Undo can restore (tank changes, template and brand changes, add/remove step, ramps, transfers, splits, undo split, delete, moves). Any of them that can change a batch's vessels must run the N1 check on the restored state, in the same transaction, and refuse with `same_tank` if it fails.
- **Tests:**
  - ExUnit for the two-user sequence from QA (as R1 describes it);
  - one test per undo kind that touches vessels;
  - a controller test for the 409.

## Minor

- **R2. Every changing dialog clears its refusal when its input changes**, as Split does (N5): Add step, Add a ramp, Change ramp, Plan batch, and the batch dialog's banner when the picker changes or another dialog opens from it. If several dialogs repeat the same pattern, share it rather than copying it five times.
- **R3. A split where nothing stays checks each part on its own and names it:** "Part 1: The beer goes into Q1SC next, on Fri Dec 18." The split dialog's tank picker for each part leaves out tanks that would break the rule for that part, in the same way the Into picker does. The order dependence itself is fine: part 1 keeps the template's later transfer, and that rule stays.
- **R4 (changed by Matt, 2026-10-22): allow it, but flag it correctly.** A Move only (or a Shift-drag, or a multi-select move) that puts a batch's transfers out of date order stays **allowed**, as D47's move-only rule does. In its place:
  - add a flag, kind `transfer_order`, on the batch: "P7's transfers are out of order: on Thu Dec 17 the beer goes into Q1SB, which it's already in." Name the transfer and the tank.
  - In that case the flag replaces the misleading `dirty_fill` for the same pair. Keep `dirty_fill` where it's genuinely about cleaning.
  - The move prompt's "They'll be flagged." stays.
  - The flag clears when the order is fixed (Move all, a move back, or Undo).
  - It follows D47's flag rules (sign-off etc.).
  - Tests: ExUnit for the flag appearing and clearing; Playwright for the flag showing after a Move only.

## Not changing

- The three-save swap (Matt).
- The theme note: QA's owner theme was left Dark at one point and it set it back. That's not a D48 issue. But check whether a test or QA run toggling owner's color mode on DEV could explain the task-board flake (task 4706). If it could, add that to the status as a lead note; don't fix it here.
