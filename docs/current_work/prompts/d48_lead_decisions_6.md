# D48 lead decisions 6: final QA pass findings (fix cycle 5), 2026-10-22

**Inputs:**
- Final QA pass, `stepwise_results/d48_qa_recheck4_report.md` (DEV, `1625302`):
  - X1–X5 are fixed, along with the lock, the tree rule, the exact Undo split, R1–R4, N1, the 12 first-pass items and access.
  - New: Y1 and Y2 must-fix, Y3 minor.
- DEV run 7: 528 passed, and production passed in full. The 3 board failures are flakes (2 passed on their own; task 4706).
- **Close-out rule (Matt):** a must-fix blocks the close. After this cycle: the full local and DEV suites, then **a targeted QA recheck of Y1–Y3 and split moves and check-offs only**.

Fix everything below, with tests at the level each fix lives. Commit as `fix: D48 DEV QA fix cycle 5 (…)`. **Don't push.** Run the targeted production specs, then `LEAD: run` the full suites. Status goes in `prompts/d48_fix_cycle_5_status.md`. Ask with LEAD: before any run of yours longer than about 10 minutes.

## Must-fix

**Y1. A split batch moves as one tree.** Moving a split parent's steps must keep its parts after the Split.
- **Move all** on any parent step on or before the Split (Brew day, PDH, the Split itself…) moves the Split **and every part's unfinished steps** by the same days.
  - The move prompt lists them grouped under each part's label, as the multi-batch prompt does ("P5.1", "P5.2").
  - Done steps on a part block the move with the same refusal a done following step gives today.
- **Move only** on a parent step that would put the Split after a part's first step stays allowed, as D47's move-only rule does. But it must raise the existing "Steps out of order" flag for the affected part (or a part-specific wording, whichever is cleaner). No silent state.
- **Moving the Split step itself** (drag, the step dialog or the API) is the same as Move all from the Split: the parts go with it.
- Undo reverses the whole tree move.
- **Tests:** ExUnit for Move all from Brew day, from PDH and from the Split, with the parts moving; Move only with the flag; a done part step blocking it; Undo. Playwright for the prompt listing the parts.

**Y2. The Split can't be checked off before brew day is done.**
- The Split step's complete is refused with `before_brew_day` ("Check off brew day first.") while the parent's first Brew day isn't done. That matches D47's batch-number rule.
- **Audit:** check every route that can complete a step (the dialog, the API, multi-select, and D49's board later) for the same hole on Transfer/Filter and Package. Fix any that can complete before brew day the same way.
- Un-checking must never leave a batch in a status its steps don't support. A batch with no done Brew day is **planned**, with its P-number and Delete available.
- **Tests:** ExUnit for the refusal and the audit; plus a test that a batch reached through QA's exact sequence can't exist. If it already exists in DEV data, the reseed clears it.

## Minor

- **Y3.** The Brand and Template pickers are locked on a split parent (and its parts): read-only, showing "Undo the split first to change it", like the tanks and volume. The API already refuses Template; make it refuse Brand too, with `split`. Today Brand saves for the whole family. Lock it, for consistency with the rest of the split locks.
