# D49 builder brief

**Branch:** `d49-schedule-task-list` (checked out in `~/src/rockcut`).

**Read first:**
- `specs/d46_production_scheduling_spec.md` (APPROVED). D49 covers:
  - §3.12 (task list linkage), §3.12a (Clean not sanitized), §3.12b (Pencilled batches);
  - scenarios P90–P103, P108 and P122–P135.
  - **Not D49:** the brewhouse tablet on the schedule (§3.13's tablet bullet, P104–P107) is D50. Until then the tablet sees linked tasks read-only (§3.12, plan decision 8).
- `planning/d49_schedule_task_list_plan.md`: these are your instructions. The **lead decisions** at the top settle what the spec leaves open.
- `stepwise_results/d48_batch_changes_COMPLETE.md` (LIMITATIONS: BB1 / BB2) and `prompts/d48_lead_decisions_8.md`: Undo runs the same order guards as the direct action, which BB2 builds on.

## Working rules (as in D48)

- **Machine:** the MacBook (macOS, Homebrew; since 2026-10-26), not the Chromebook. Paths are `/Users/mgheiser/...`.
- **Servers:** the lead owns them (API :4002, UI :5174 from this checkout). After a migration, stop and say `LEAD: restart API`.
- **Long test runs:** you don't start any run longer than about 2 minutes yourself (the full ExUnit suite, the full Playwright suite). Say `LEAD: run <command>` and stop. Targeted runs in the foreground are fine.
- **When Matt types "continue" in your pane,** it means resume, not skip the lead's steps. If you stopped with `LEAD:` lines, wait for the lead's reply.
- **Playwright:** use `--workers=4` at most for targeted runs, and close every browser you start.
- **Commits:** on this branch, staging paths by name. Use `feat: D49 …` / `fix: …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tokens:** never read or print them.
- **Formatting:** format only the files you changed. Never repo-wide `mix format`.
- **Tests that read shared order** (the tank list, P- and X-numbers) assert relatively.
- **Bug fixes** (BB1, BB2): the new test fails with the fix reverted and passes with it restored. Actually revert and re-run, and give both results in your report.
- **Stops:** stop after each task with a short report and `LEAD:` lines.

## Tasks

The plan's "Tasks for the builder" lists them:
0. BB1 / BB2;
1. Clean not sanitized;
2. Pencilled batches;
3. Linkage API;
4. Linkage UI;
5. Playwright + local gate.

Do **Task 0 only**, then stop.
