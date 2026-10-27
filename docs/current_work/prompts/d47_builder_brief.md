# D47 builder brief

**Branch:** `d47-batch-schedule-gantt` (checked out in `~/src/rockcut`).
**Read first:**
- `specs/d46_production_scheduling_spec.md` (APPROVED). D47 = §3.5–§3.10, scenarios P20–P64 and P109, plus the Gantt parts of P1/P2, P4 and P6–P10.
- `planning/d47_batch_schedule_gantt_plan.md`, the instructions. Its **lead decisions** at the top override anything the spec leaves open.
- PortableMind task 4650 (in the plan's decision 1) and `stepwise_results/d46_qa_recheck.md` (N1–N4).

**Also see:**
- The D46 code you're building on: `lib/rockcut_api/production.ex`, `lib/rockcut_api/production/`, `rockcut-ui/src/pages/production/`, `rockcut-ui/src/lib/production.ts`.
- The mockup, for the Gantt's look and wording: `docs/current_work/reference/tank_schedule_mockup.html` (local only; its JS is sample code, not a design to copy).

## Working rules (as D46, plus one)

- Servers belong to the lead (API :4002, UI :5174 from this checkout). After a migration, or when you need a restart, stop and say `LEAD: restart API` (or UI). Don't start your own servers on those ports.
- **Full or long test runs (the Playwright suite, or anything over ~2 minutes) are not run by you in a background shell.** Say `LEAD: run <command>` and stop. The lead runs it in a visible herdr tab and sends you the result. Short targeted runs (one spec file, `mix test path`) are fine in the foreground.
- **Memory is tight:** Playwright `--workers=2` at most, one run at a time, close every browser you start.
- Commit on this branch, staging paths by name. Messages are `feat: D47 …` / `fix: …` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read or print tokens; use the harness storageState files.
- Format only the files you changed (never a repo-wide `mix format`).
- Stop after each task with a short report and `LEAD:` lines (questions, restarts, anything that deviates from the spec or plan).

## Task 0: task 4650 + Split - Transfer / Split - Filter

The plan's decision 1, in its own commit or two: N1, N2, N3, N4a–c, item 10 (the drag handle) and the template `split_method` (P109). Add ExUnit tests and update or add Playwright specs for what changed. Stop with `LEAD: restart API` (the migration) and the targeted test results.

## Task 1: API A

Migrations (batches changes, `batch_vessels`, `production_steps`, `production_step_links`, `flag_signoffs`, `production_undos`). Then `Production.Batches`, `Production.Steps` (move and complete with `preview`), P-numbers and the next number, `Production.Schedule.load`, and the routes for those, with ExUnit tests. Stop with `LEAD: restart API`.

## Task 2: API B

`TankStatus`, `Flags` and sign-offs, `Cips`, `Undo` (wired into every write), the `retire_tank` check, and the DEV seed (plan "DEV seed"). Add ExUnit tests, including the performance check. Stop with `LEAD: restart API`, `LEAD: reseed local` and the test count.

## Task 3: UI A

`/brewery/production` becomes the read-only Gantt: toolbar, grid, rows, bars, dots, initials, status lines, flag badges, stacking, out-of-service bands, transfer arrows, expand, « / », range and zoom, legend. Add the Set up menu and remove the Batches nav entry. Drive it in a browser as `brewer1` on the seeded data, at desktop and phone widths, in light and dark.

## Task 4: UI B

Plan batch, the drags (pointer hook, long-press on touch), the move prompt from the server preview, the brew-day number prompt, the batch, step and CIP dialogs, the Flags list, out of service on the Gantt (tap menu, ⋯ panel, band click), and the Undo snackbar.

## Task 5: Playwright + local gate

Specs in `tests/regression/production/` as the plan maps them (relative P-number assertions), and `tests/COVERAGE.md`. Then the full local gate: ExUnit, tsc/build/lint, Vitest, and `LEAD: run` the full Playwright default suite. Report the results and any LIMITATIONS for the DEV handoff.
