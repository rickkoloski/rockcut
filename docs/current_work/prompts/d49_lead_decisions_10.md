# D49 lead decisions 10 (DEV QA, fix cycle 1)

**2026-10-27** · Lead, with Matt. From the DEV gate at `6474383` (API v60 / UI v63).

## DEV checks so far

- **DEV Playwright run 1** (every project): production 374 passed, 1 failed (P134); `brewery-board` rerun `--no-deps` 189 passed, 3 failed (S28, S35, S163).
  - P134: a test race (`dd797e7`); 5 of 5 on DEV after the fix.
  - S28: ENOENT on traces (a local run emptied `test-results/` mid-run); 3 of 3 on rerun.
  - S35: a real bug in Notification preferences (a late first read overwrote a change), fixed in `ed5b5a8`, not deployed yet.
  - S163: a test that reloaded before the tick's save; fixed in `ed5b5a8`.
- **Independent QA:** `stepwise_results/d49_qa_report.md` (2 must-fix, 7 minor). Everything else passed, including the 500 ms budget (move ~120 ms, tank rename ~180 ms on DEV).

## Decisions (Matt)

1. **QA 1, BB2's retry after "Mark not done": option a.** "Mark not done" puts a step back on the day it was planned for when its own check-off moved it (the off-plan move). Un-checking then reads as if the check-off never happened, and the Undo of a write captured before the check-off works once the blocker is cleared. Keep it to the step the check-off moved, plus whatever moved with it under the same "move all" answer if that's how the check-off recorded it; say what you chose. A test: QA's repro (owner's Split early → breweryMgr's part Package 8 days early → owner's Undo refused → breweryMgr Mark not done → the same Undo works and the parts get their dates back), failing with the fix reverted.
2. **QA 2 (must-fix):** a mark made after a done CIP on the same day comes after it in the cleanliness timeline (latest wins, by time, not only by day), so "Dirty" after a same-day CIP & Sanitize raises "no CIP planned" and "Filling a dirty tank". The status and the flags read the same timeline. A test that fails without the fix.
3. **QA 3 (fix):** the Dashboard's Today's tasks card follows Show planned batches and shows the Planned batch pill.
4. **QA 4 (fix):** the Undo snackbar doesn't cover a dialog's buttons (move it clear, or above the dialog), and it hides when its token expires.
5. **QA 5 (fix):** the tablet's linked-task popover shows the task's notes.
6. **QA 6 (check):** if the collapsed Gantt row shows only task-list steps by design (D47), no change; say which. If not, show the step.
7. **QA 7 (backlog):** overlapping same-day dots in the collapsed row: a PortableMind task, not D49.
8. **QA 8 (fix):** the API refuses `on_task_list: true` for a phase marker (decision 6.1), with a clear code and message.
9. **QA 9 (no change):** checking off steps on an unbrewed planned batch is allowed (P94).

## Next

Fix cycle 1: the above plus `ed5b5a8` (already committed). Targeted local runs only. Stop with `LEAD: restart API` if there's a migration, and `LEAD: run` for the full local suites before the DEV redeploy.
