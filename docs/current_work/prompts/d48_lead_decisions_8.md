# D48 lead decisions 8: targeted QA recheck 6 findings (fix cycle 7), 2026-10-26

**Inputs:**
- Targeted QA recheck 6, `stepwise_results/d48_qa_recheck6_report.md` (DEV, `889c151`, API v57 / UI v60):
  - Z1 (for check-offs and un-checks), Z2 and Z3 are fixed. The spot checks pass (Y1, Y2, split lock, seed Altruism #39).
  - New: AA1 must-fix, AA2 minor.
- Local gates at `889c151`: ExUnit 1716/0, Playwright 534 passed / 1 skipped. DEV run 9: 535 passed.
- **Close-out rule (Matt):** a must-fix blocks the close. After this cycle: the full local and DEV suites, then **a targeted QA recheck of AA1–AA2 (Undo around the Split) only**.
- **Matt (2026-10-26):** fix AA1 by making Undo obey the same order rules as a direct check-off or un-check, and fold AA2 into this cycle.

Fix everything below, with tests at the level each fix lives. Commit as `fix: D48 DEV QA fix cycle 7 (…)`. **Don't push.** Run the targeted production specs, then `LEAD: run` the full suites. Status goes in `prompts/d48_fix_cycle_7_status.md`. Ask with LEAD: before any run of yours longer than about 10 minutes.

## Must-fix

**AA1. Undo can't get around the order guards.** QA's paths (report §AA1):
- **A (two users, UI):** owner checks off the Split; breweryMgr checks off part 2's Transfer; owner's snackbar Undo → 200. Part 2 is planned with a done Transfer, and the Split isn't done.
- **B (one user):** Split ✓ → part 2's Package - Partial ✓ → Undo the Split check-off → 200.
- **C (one user):** Split ✓ → part 2's Transfer (or Partial) ✓ → Mark that exit not done → Mark the Split not done → Undo the exit's un-check → 200.

Today the stale check catches only the full Package (it changes the part's status). A Transfer or a Partial doesn't, so it slips through.

**The rule:** an Undo that changes a step's done state goes through the same guards as doing it directly.
- **Undoing a check-off is an un-check:** `exit_done` (brew day while an exit is done) and `part_exit_done` (the Split while a part's exit is done).
- **Undoing an un-check is a check-off:** `before_brew_day` and `before_split`.
- **Refusal:** with the guard's own code and message (for example "Mark … #44.2: Transfer not done first."), not the generic `undo_stale`. Nothing is undone, and the Undo stays available, so it works once the user clears the blocker. If the existing Undo error shape can't carry a specific code cleanly, use `undo_stale` with the guard's message, and say which in the status file.
- **Where:** in the Undo path itself (one place, every undo kind that touches `done_on`), not by widening the stale check's signature. Moves and splits keep their current stale rules.
- **Audit:** list every undo kind that can change a step's done state (check-off, un-check, a late / off-plan check-off with its carried move, the CIP route) and confirm each one goes through the guards.
- **Tests:** ExUnit for paths A (as two sequential writes), B and C, each refused with the right code and message and nothing changed. Then the same Undo succeeds after the blocker is cleared. Plus controls: undoing a plain check-off or un-check with no blocker still works, and recheck 6's caught cases (full Package) are still refused. Playwright: path A in the UI with two contexts (owner + breweryMgr). The owner's Undo shows the refusal, and part 2 is unchanged.

## Minor

- **AA2. `exit_done` names the part.** When the done exit blocking a brew-day un-check is on a part, say so: "Mark … #44.2: Transfer not done first.", as `part_exit_done` does. A parent's own exit keeps today's wording ("Mark Transfer not done first."). ExUnit for both.

## Don't change

- Z1–Z3 and Y1–Y3 as QA confirmed them, including the refusal codes and messages.
- CIP & Sanitize can still be checked off before brew day or the Split (QA's note). It isn't an exit and doesn't change status.
