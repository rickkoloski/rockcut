# D48 lead decisions 3: QA recheck findings (fix cycle 2), 2026-10-22

**Inputs:**
- QA recheck, `stepwise_results/d48_qa_recheck_report.md` (DEV, `a207cb1`): **all 12 first-pass items fixed**, 1 new must-fix (N1), 5 new minor (N2–N6).
- DEV run 3 at `04a757d`: 518 passed, 3 failed. Two were the DST bug (fixed by hotfix `v2026.10.22`, now merged into this branch as `63d7ecb`). The third, the task-board-ui "✓ name readable (dark)" test, is a flake.
- Matt on the Pixel: **touch auto-scroll down works.**

Fix everything below, with tests at the level each fix lives. Commit as `fix: D48 DEV QA fix cycle 2 (…)`. **Don't push.** Run the targeted production specs, then `LEAD: run` the full suites. Write the status to `prompts/d48_fix_cycle_2_status.md`.

## Must-fix

**N1. No transfer may end up going into the tank the beer is already in, at any point in its stay.** Item 3 only checked the tank the beer is in on the transfer's day. Now:
- **The rule:** after any change to a batch's vessels (Add transfer / filter, a split part's own transfer, Remove transfer, template change), no two consecutive vessels may share a tank. Unassigned (`nil`) never counts as a match.
- **The API:** check the rule against the vessel list the change would produce, in the same transaction. Refuse with `{:same_tank, name}`, reworded for the next-vessel case: "The beer goes into Q1RC next, on Fri Dec 18." The current-tank case keeps "The beer is already in Q1RC.".
- **The UI:** the Into picker also leaves out the tank of the vessel that comes next. The preview shows the refusal before saving, as it does for item 1.
- **The preview's wording** (QA's evidence): "1 step from that day (CIP & Sanitize) move to Q1RC" lists the old tank's CIP as a step that moves. The CIP that belongs to the old tank's exit must not be counted or listed as moving. Check the actual move too, not just the text.
- **Split parts:** check the same rule for each part's copied later steps.
- **Tests:** ExUnit for the transfer and the split cases (next vessel, and the Unassigned exception), plus a Playwright test for the picker and the preview.

## Minor

- **N2.** A part whose parent's brew day is done shows "#44.1 · the parent's number", not the planned wording.
- **N3.** A split **part's** volume is locked like the parent's (`split`, "Undo the split first to change it"), in both the API and the UI.
- **N4.** A part's step floor is its parent's Split. Refuse with a new code, `before_split` ("A step can't come before the split."), for Add step and Add a ramp. `before_brew_day` stays for unsplit batches.
- **N5.** The split dialog clears its refusal when the day, the method or any part changes, as the transfer preview does.
- **N6.** Add step and Add a ramp must fall on or before the vessel's exit (Package, or the next transfer). The exit day itself is allowed. Refuse with `after_exit` ("The beer isn't in that tank on that day."). A ramp is refused whole if any of its steps would fall after the exit.
- **Check (QA couldn't confirm it):** twice, clicking part 2's bar in a **brewed** split didn't open its dialog. Reproduce it locally: brew day done, split with part 2 into another tank, click part 2's bar. Fix it if it's real; if not, say so.

## Not changing

- First-pass item 9 (zoom ✓ after a custom range) stays by design.
- The task-board-ui dark "✓ name" flake goes in the backlog as a separate task. It isn't D48 work.
