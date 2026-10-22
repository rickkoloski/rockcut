# D48 lead decisions 5: QA recheck 3 findings (fix cycle 4), 2026-10-22

**Inputs:**
- QA recheck 3, `stepwise_results/d48_qa_recheck3_report.md` (DEV, `f255419`):
  - R2, R3 and R4 are fixed;
  - R1 is fixed except for Undo split;
  - N1 and the 12 first-pass items hold.
  - New: X1 and X2 must-fix, X3–X5 minor, all around split batches.
- DEV run 6 (with the seed guard): 527 passed, 1 failed (the known flake, task 4706). The run 5 seed change was Matt editing DEV by hand.

Fix everything below, with tests at the level each fix lives. Commit as `fix: D48 DEV QA fix cycle 4 (…)`. **Don't push.** Run the targeted production specs, then `LEAD: run` the full suites. Status goes in `prompts/d48_fix_cycle_4_status.md`.

## The rule, extended to splits

**N1 now covers the whole tree, not just one batch's vessel list.** A split batch is a tree: the parent's vessels up to the Split, then each part's vessels.
- **No repeats along any path:** along every path from the first vessel through the split into each part, no two vessels in a row share a tank. A part that **stays** continues in the parent's last tank by design: that's not a repeat.
- **No shared tanks among parts that leave:** two parts that leave can't start in the same tank, and a part that leaves can't start in the tank the staying part is in.

Check both rules on the state any change would produce, in the same transaction. That covers:
- a tank change on the parent or on any part;
- adding or removing a transfer on the parent or on a part;
- splitting;
- Undo split;
- every Undo.

Refuse with `same_tank`, and name the part when a part is involved ("Part 2: The beer is already in Q1TD." / "Part 2 can't go into Q1TA: part 1 stays there.").

## Must-fix

- **X1.** **Undo of an Undo split** gets the batch-wide stale check (409 `undo_stale`) and the tree rule on the restored state, like every other vessel-touching Undo since R1. Add a test for QA's sequence.
- **X2.** **The tank pickers** on a split parent (Ferment in / Transfer to) and on a part follow the tree rule:
  - they leave out the tanks that would break it;
  - the API refuses them too;
  - a bar drag onto another row on a split batch is checked the same way.
  - Tests: ExUnit for both of QA's cases, and Playwright for the pickers.

## Minor

- **X3. Undo split restores the batch exactly:** steps, links (FDH links from Brew day again, as before the split) and every vessel's tank, whichever part stayed. Keep a full snapshot at split time if that's simplest. Add a test that splits, undoes the split and compares the batch with its pre-split state, for both "part 1 stays" and "part 2 stays".
- **X4.** Part 1's tank picker leaves out the next tank when no part stays (the R3 rule, now in the picker). The split dialog shows the refusal before **Split**, as the transfer preview does.
- **X5.** After a refused Undo, refetch the schedule, and the open batch dialog's batch, so the screen shows the real state at once.

## Not changing

- The three-save swap (Matt).
- R4 stays allowed-and-flagged (Matt).

## Close-out rule (Matt, 2026-10-22)

After fix cycle 4: the full local and DEV suites, then a **final, split-focused QA pass**. If it finds only minors, D48 closes, and those minors become D49's first fix items. A must-fix still blocks close-out.
