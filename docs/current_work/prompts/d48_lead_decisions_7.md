# D48 lead decisions 7: targeted QA recheck 5 findings (fix cycle 6), 2026-10-26

**Inputs:**
- Targeted QA recheck 5, `stepwise_results/d48_qa_recheck5_report.md` (DEV, `bb38b29`, reseeded Oct 26):
  - Y1, Y2 and Y3 are fixed, and the spot checks pass (split lock, Undo split, refusals, phone width, seed Altruism #39).
  - New: Z1 must-fix, Z2 minor. One note: `PATCH /steps/:id {due_on}` is ignored but returns 200.
- **Close-out rule (Matt):** a must-fix blocks the close. After this cycle: the full local and DEV suites, then **a targeted QA recheck of Z1–Z3 and split check-off order only**.
- **Matt (2026-10-26):** fix Z1 with order guards (below), and fold Z2 and Z3 into this cycle.

Fix everything below, with tests at the level each fix lives. Commit as `fix: D48 DEV QA fix cycle 6 (…)`. **Don't push.** Run the targeted production specs, then `LEAD: run` the full suites. Status goes in `prompts/d48_fix_cycle_6_status.md`. Ask with LEAD: before any run of yours longer than about 10 minutes.

## Must-fix

**Z1. A split part can't get ahead of its parent's Split.** QA's routes (report §Z1):
1. Brew day, the Split and part 2's Package checked off. Then the Split, part 2's Package and brew day un-checked: part 2 is left `fermenting` with 0 done steps, under a planned parent.
2. Brew day done, the Split not done: a part's Package can be checked off, so the part is "completed" before any beer was split into it.

The fix guards the order, the same way Y2 guards brew day:
- **A part's exit waits for the Split.** A part's Transfer, Filter or Package (full or partial) is refused while its parent's Split isn't done. This applies to every part, including the staying part. Error `before_split`, "Check off Split - Transfer first.", already at the preview (as `before_brew_day` is). Where both apply (brew day not done either), `before_brew_day` wins.
- **The Split can't be un-checked while a part's exit is done.** Error `part_exit_done`, naming the step: "Mark P1.2: Package not done first." (the part label plus the step, as `exit_done` and `part_step_done` do). Undo split with a done part step is already refused (`part_step_done`); keep it.
- **Part status on un-check:** a part's status after any Mark not done must be one its steps and its parent's Split support. With the parent's Split not done, a part is **planned**. If `open_status` can take the parent's Split into account cheaply, do it, so a part already in the Z1 state is put right by the next un-check or status recompute. Say in the status file which way you went. DEV's reseed clears any existing bad data in any case (QA cleaned up its own).
- **Audit:** check every route that completes or un-completes a step (`Steps.complete` / uncomplete, a late off-plan check-off, the CIP route) for the two guards.
- **Tests:** ExUnit for both of QA's routes being impossible (in the preview and the write), the staying part, `before_brew_day` beating `before_split`, `part_exit_done` and its message, and the controls (a part's FDH / Carb before the Split still allowed, as QA's controls show; an unsplit lager's Package-before-Transfer unchanged). Playwright: the step dialog's refusal on a part's Package with the Split not done, and on Mark not done of the Split with a part's Package done.

## Minor

- **Z2. A late check-off of the Split names the parts it moves.** Checking off the Split on a later day carries the parts, which is correct, but the snackbar only reads "Split - Transfer done.". Name the parts as a drag of the Split does: "Split - Transfer done, 2 days late. … P6.1 and … P6.2 moved with it." (or your closest wording consistent with the existing snackbar). Undo is unchanged. Playwright: the wording.
- **Z3. `PATCH /api/production/steps/:id` with `due_on` doesn't claim success.** Today it returns 200 and changes nothing (dates go through `/steps/move`). Refuse a `due_on` (and any other date field the PATCH ignores) with 422 and a message pointing at moving the step. Keep the fields the PATCH really saves working. Controller test.

## Don't change

- The Y1–Y3 behavior QA confirmed, including `part_step_done`, `exit_done`, `before_brew_day` and the split locks.
- Moving a split (Y1) is unaffected: a part's exit date before the Split is still only flagged `out_of_order`, not refused. The new guards are about check-offs only.
