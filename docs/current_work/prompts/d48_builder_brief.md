# D48 builder brief

**Branch:** `d48-batch-changes` (checked out in `~/src/rockcut`).

**Read first:**
- `specs/d46_production_scheduling_spec.md` (APPROVED). D48 covers:
  - §3.11;
  - the Shift-drag row and "Toolbar changes in D48" in §3.6;
  - "Marking a tank clean or dirty" in §3.8;
  - scenarios P65–P89, P110 and P113–P121.
- `planning/d48_batch_changes_plan.md`: these are your instructions. The **lead decisions** at the top settle what the spec leaves open.
- `stepwise_results/d47_batch_schedule_gantt_COMPLETE.md` and `prompts/d47_lead_decisions_5.md`: the occupancy rule, which every new state has to use.

## Working rules (as in D47)

- **Servers:** the lead owns them (API :4002, UI :5174 from this checkout). After a migration, stop and say `LEAD: restart API`.
- **Long test runs:** you don't start any run longer than about 2 minutes yourself (the full ExUnit suite, the full Playwright suite). Say `LEAD: run <command>` and stop. Targeted runs in the foreground are fine.
- **When Matt types "continue" in your pane,** it means resume, not skip the lead's steps. If you stopped with `LEAD:` lines, wait for the lead's reply.
- **Memory is tight:** use Playwright `--workers=2` at most, and close every browser you start.
- **Commits:** on this branch, staging paths by name. Use `feat: D48 …` / `fix: …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tokens:** never read or print them.
- **Formatting:** format only the files you changed.
- **Tests that read shared order** (the tank list, P-numbers) assert relatively.
- **Stops:** stop after each task with a short report and `LEAD:` lines.

## Tasks

The plan's "Tasks for the builder" lists them: 0 toolbar/layout → 1 API A → 2 API B → 3 UI A → 4 UI B → 5 Playwright + local gate. Do **Task 0 only**, then stop.
