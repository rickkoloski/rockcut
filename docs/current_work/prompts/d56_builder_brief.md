# D56 builder brief — Stage 1 (Pre-brew steps, API)

2026-11-12 · lead → builder.

**Read first:** `docs/current_work/specs/d56_production_timing_spec.md` (approved, decisions
1–10) and `docs/current_work/planning/d56_production_timing_plan.md`. This brief covers **plan
Stage 1 only** (spec §3.1, server side). Stop after it and report.

**Context you need:** D56 absorbed D57 (test results, Stages 3–4) and dropped multi-day steps;
ignore anything about multi-day in the git history. The branch already holds an unrelated
Boards fix (`d627538`, 5791). Leave it alone.

**Where:** `~/src/rockcut`, branch `d56-production-timing` (checked out; don't switch). Small
commits (`feat: D56 …`), staging paths by name. No push, merge or rebase. The lead runs the
servers (API :4002, UI :5174). Ask with `LEAD:` if you need a restart or a migration on the dev
DB. **Only `mix format` the files you change** (a repo-wide format reflows the legacy tree).

## Do

1. **Validation** (spec §3.1; decisions 7, 10):
   - `TemplateStep.changeset`: `day_offset` −30…365.
   - Negative offset only for a plain step type or a custom step, with no phase and vessel 0.
     Otherwise 422 `not_before_brew`, "A <type name> can't be before brew day." The type is set
     outside the changeset (in `Production`), so put the check where the type is known. That
     includes changing the type or the day of an existing template step.
   - Confirm the template's first Brew day must still be at day 0. If nothing enforces that
     today, say so in `LEAD:`. Don't add it on your own.
2. **Copying:** `Batches.copy_steps!/4` should already work. Prove it with a test. Confirm that
   `add_package_cips!` and the two-day brew's "2 of 2" don't pick up a pre-brew step.
3. **Moves with brew day** (decision 2):
   - Add a helper for the batch's **unfinished** steps due before its first Brew day (dates as
     they are before the write).
   - In `Steps.move/3`: when the first Brew day is among the moved steps, its batch's pre-brew
     steps move by the same days. They don't count as "following" steps for the prompt, and they
     move whatever the answer is (including `move_only`).
   - The same goes for a Brew day check-off on another day (`Steps.complete/4`'s off-plan move)
     and the batch dialog's date box, whichever function that is. Reuse the move plan/changes;
     don't write a second move engine.
   - The whole-batch drag (`BatchChanges`) should already move every unfinished step. Confirm it
     with a test.
   - Split parts: a pre-brew step belongs to the root batch. Confirm that a split part's moves
     don't touch it, and that moving the root's brew day does.
4. **Refusals:**
   - Moving a pre-brew step itself to the first Brew day or later is 422 `before_brew_day`, "A
     pre-brew step stays before brew day."
   - `preview: true` returns the same refusal, so the Gantt drag hint can show it in Stage 2.
     Check what shape the drag hint reads today and match it.
   - The same for any write path that sets a step's date: the date box, and Undo restoring rows.
     (Undo restores the previous valid state, so it
     should be fine. Confirm it.) A pre-brew step checked off on or after brew day is the open
     question below.
5. **Check-off** (spec §3.1, as corrected): a pre-brew step on a **planned** batch can be checked
   off, with no batch-number prompt and no fill. Confirm that `check_off_order!` doesn't block it.
   A pencilled batch still gets `schedule_first`.
6. **No tank time:** tests showing that a pre-brew step doesn't change `Parts.part/2`'s
   `start`/`end`, doesn't create an overlap flag with a batch that leaves the tank the day before
   brew day, and doesn't change `TankStatus`.
7. **Task wording:** `TaskLink` gives a pre-brew step a task worded with vessel 0's tank (or
   "Unassigned"), with the Planned batch marking. Test it.
8. **Undo:** a brew-day move that carried pre-brew steps is undone in full (both come back).

## LEAD: questions to raise, not decide

- A pre-brew step **checked off late, on or after brew day**: should the check-off be refused,
  or allowed with the step left on its planned day (done_on recorded)? Leave today's behavior in
  place for that one case, report what it is, and carry on with the rest. The lead asks Matt.

## Don't

- No UI (Stage 2), no test results (Stage 3), no small items (Stage 4), no Playwright yet.
- Don't touch `CLAUDE.md`, the spec, the plan or the handoffs.

## Done when

`MIX_ENV=test mix test` green twice, `mix compile --warnings-as-errors` clean. Commits on the
branch. Reply with: commits, files, test counts, the answer to the check-off question, and
`LEAD:` notes.
