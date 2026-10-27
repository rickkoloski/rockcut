# D49 handoff note (PR description)

**Deliverable:** D49, production scheduling part 4: task list linkage
(§3.12), Clean not sanitized (§3.12a), pencilled batches (§3.12b), and
D48's minors BB1 / BB2 (PortableMind task 4632). The brewhouse tablet on
the schedule (§3.13, P104–P107) is **D50** (Matt, 2026-10-26). D46–D49 go
to prod in one release after D49; §3.14's clean-up of the old batches runs
then.
**Spec:** `docs/current_work/specs/d46_production_scheduling_spec.md`
(§3.12, §3.12a, §3.12b); scenarios P90–P103, P108, P122–P135
**Plan:** `docs/current_work/planning/d49_schedule_task_list_plan.md`;
lead decisions `prompts/d49_lead_decisions_1.md` … `_9.md`
**Branch:** `d49-schedule-task-list`, cut from `develop` (`46bcf34`).
**SHA for DEV:** the branch head at the push. App code as of `9f4539e`;
`1f3d5cd` and later are tests and docs.

## What changed

Scenario → test for every row is in `rockcut-ui/tests/COVERAGE.md` (D49
section).

| # | Area | Change | Scenarios |
|---|---|---|---|
| 0 | **BB1 / BB2** (D48's minors) | BB1: a refused snackbar Undo keeps its button until the token runs out (only `undo_expired` / `not_found` drop it). BB2: Undo checks the order rules **before** the stale check, so the Split's Undo after a part's full Package, brew day's in a split family, a Split un-check's after brew day and a late Split's refuse with the rule's own code and work once the blocker is cleared (a late Split's parts get their dates back). `updated_at` is out of the Undo hash; a real change since is still `undo_stale` | BB1, BB2 |
| 1 | **Clean not sanitized** | `cleaned` condition mark; the tank ⋯ panel's Mark… list (mockup B, rows ≥ 56 px, current state greyed); one cleanliness timeline per tank (`dirty` / `cleaned` / `sanitized`); CIP variants (`cip_method`: CIP & Sanitize, CIP - no sani, Sanitize) in the standalone CIP dialog, the empty-spot menu, the step dialog (unfinished only) and templates; status "Clean no sani N days" (amber); the soft flag **Filling a tank that isn't sanitized** (`unsanitized_fill`, signed off as D47's); "The tank was dirty: run a CIP first." | P122–P129 |
| 2 | **Pencilled batches** | `batches.pencilled` (planned only; parts follow their parent); X-numbers (X1, X1.2) beside P-numbers; Plan batch → Pencil in / Schedule; the batch dialog's Schedule this batch / Pencil in (`step_done` once a step is done), all with Undo; muted flags (not counted, no Mark OK, `flag_muted`; no "No tank within 3 days"; a scheduled batch keeps its own overlap flag); brew day on a pencilled batch → "Schedule this batch first." (`schedule_first`) with a Schedule button; drawn faded and hatched, labeled Pencilled | P130–P135 |
| 3 | **Linkage API** | `tasks.production_step_id` (one link column). `Production.TaskLink`: `want/1` (title "FV3 · Galactic #33 · Set temp - 48°", day, done, notes, assignee; no task for a phase marker, a step off the list or a pencilled batch) and `sync!/1`, run at the end of `Undo.track/4` (every schedule write), after `Undo.undo/2` and after tank, step type and brand renames, in the write's own transaction. **Board writes on a linked task go to Production** (move → `Steps.move` with the move prompt's contract, complete → `Steps.complete`, uncomplete, notes / assignee, delete → `on_task_list` off with 200 + `undo_token`); title, repeats, Future and `stop_repeating` → 422 `linked_task`; a shared tablet → 403 `linked_task_device` (with a code or without; "Sign in as me" is a person). `production: {step_id, batch_id, batch_status, planned, step_name, batch_label}` on each task; `GET …/tasks?linked=true`; `users.show_planned_batches` in `/api/me` and `PUT /api/me/show_planned_batches`. Move all to today leaves linked tasks. Leaving the Brewery unassigns the person's unfinished steps | P90–P101, P103, P108 |
| 4 | **Linkage UI** | The Brewery board reuses the Gantt's flows (move prompt, batch-number prompt, Schedule first, the schedule's Undo snackbar): drag and Change day… (no Future), check-off (never "where should it show"), Edit ("This task comes from the production schedule", Open in schedule, notes and assignee), Delete ("Take this off the task list? It stays on the production schedule."), Open in schedule in the menu, no recurring options. Planned batch pill; **Show planned batches** switch beside Hide completed / Hide shifts (per person, on the server). On a shared tablet linked tasks are read-only (no checkbox, no drag, "Do this on the production schedule."). The Gantt's **Task list** panel (today → +6, Late from the board's Unfinished list; check off, Move to, assign, Open; an icon at phone width). `/brewery/production?step=&day=` opens a step's dialog. No task-list switch for phase markers (decision 6.1). The Dashboard's Today's tasks card opens a linked task's step on the schedule when it needs a prompt (decision 8.3) | P90–P103, P108, P125, P130–P135 |
| 5 | **Other fixes** | The step dialog keeps focus after a refused action (since D47: Escape right after a refusal missed the dialog). Move all's count and button cover only the board's own tasks | — |

## Migrations

Four, all `change` (reversible; rolled back and migrated again on the
test DB, 2026-10-26):
- `20261026120001_add_cip_method`: `production_steps.cip_method`, `template_steps.cip_method`;
- `20261026140001_add_pencilled_to_batches`: `batches.pencilled` (default false);
- `20261026160001_add_production_step_to_tasks`: `tasks.production_step_id` (FK, `on_delete: :delete_all`, unique index);
- `20261026160002_add_show_planned_batches_to_users`: `users.show_planned_batches` (default true).

No backfill: prod has no schedule data yet (§3.14 clears the old batches
at the release), and DEV reseeds (the seed calls `TaskLink.sync!`).
`tank_condition_marks.state` gains `cleaned` in the schema only. No new
dependencies, secrets or config.

## New routes

- `POST /api/production/batches/:id/schedule`, `POST /api/production/batches/:id/pencil` (people only, in the device route matrix);
- `PUT /api/me/show_planned_batches` (people only);
- `GET /api/boards/:dept/tasks` takes `linked=true`; the board's task writes take `answer` and `preview` on a linked task.

## DEV seed

A Clean not sanitized mark on FV1 (Enos fills it later: the soft flag), a
`[SEED]` CIP - no sani on FV7 tomorrow, a pencilled Oktoberfest X1 in
Unassigned, and the Brewery board's linked tasks for every seeded step
(about 100, done ones checked off on their day), Altruism P1's with the
Planned batch pill. **Reseed DEV** (`mix rockcut.synthetic.reset`) after
the migrations.

## Tests

- **ExUnit (full, the lead, at `57f9718`; no API change since): 1782 passed.**
- **Full Playwright, every project (the lead, `--workers=4`, at `9f4539e`, after a local reseed): 563 passed**; G4 failed (flake 4933) and S71 (`task-board-phone:508`) failed once and passed 3 of 3 alone. **Final gate run (the lead, `1c09258`, after a local reseed): ExUnit 1782 passed; Playwright every project 564 passed, G4 failed (flake 4933), S71 passed; `tsc` clean; `vite build` clean; lint as below.**
- **New specs:** `regression/tasks/task-board-linked.spec.ts` (15: P90–P101, P103, P108, P125, P130/P132/P133/P135, the tablet, decision 8.3), `regression/production/d49-task-list.spec.ts` (3: P102, Show planned batches, markers), `d49-clean-not-sanitized` (9), `d49-pencilled` (4), `d49-undo-retry` (BB1). Every UI write in them is checked again after a reload or a navigation. ExUnit: `task_link_test` (want/1, sync! after every kind of write, one transaction, the move cost), `task_board_linked_test` (the dispatch, the tablet, `show_planned_batches`), `clean_not_sanitized_test`, `pencilled_test`, the BB2 block in `split_moves_test`, device route matrix cases.
- **Revert runs (2026-10-26, local):**

  | Fix | Test | Fix reverted | Restored |
  |---|---|---|---|
  | BB2 (`undo.ex`, rules before the stale check) | `split_moves_test` | 6 failed / 30 (the five BB2 routes and the AA1 control) | 30 passed |
  | BB1 (`flows.tsx`, the refused Undo keeps its button) | `d49-undo-retry` | failed (`gantt-undo` not enabled after the refusal) | passed |
  | Step dialog focus (`StepDialog.tsx`) | `d48-fix-cycle-5` Y2/Y3, `d48-fix-cycle-6` Z1, ×3 each | 6 of 6 failed (the dialog stays open on Escape) | 6 of 6 passed |
  | Move all with linked tasks (`TaskBoard.tsx`, `UnfinishedCard.tsx`) | `task-board-range` S20 | failed (the confirm counts the linked task: "Move N unfinished tasks" with the wrong N) | passed |

- **`sync!` cost (ExUnit, test DB on the MacBook):** a move with `sync!` 14 ms at 30 batches / 630 linked tasks (budget 500 ms); `sync!` alone 7 ms; a tank rename 10 ms.
- **Static:** `tsc --noEmit -p tsconfig.app.json` clean; `vite build` clean; `pnpm lint` 27 problems (26 errors, 1 warning), all pre-existing in the brewing pages (task 4084); D49's 43 changed TS files lint clean. Vitest 175 passed.
- **Playwright projects:** `brewery-board` now runs **after** `production` (both write the Brewery board). A production failure skips the board project: rerun it with `--no-deps`. Full run 20.5 → about 30 minutes.

## DEV must exercise

- **brewer1 on the Brewery board** with the seed's linked tasks: drag one to another day (the move prompt), check off a step due today and one from the Unfinished card (off-plan prompt), brew day of Altruism P1 (the batch number), Edit → Open in schedule, Delete → Undo, the Planned batch pill and Show planned batches (then `brewer2`'s board unaffected).
- **The Gantt as brewer1:** the Task list panel (desktop and phone width), the step dialog's switch, pencil in / schedule Oktoberfest X1 and watch its tasks come and go, Mark… Clean not sanitized on an empty tank, the CIP variants.
- **The brewhouse tablet (Samsung, breweryDevice):** linked tasks read-only (no checkbox, no drag, the menu says why); the board's own tasks still take a staff code; "Sign in as me" can check off a linked task.
- **breweryMgr / owner:** the same writes (owners pass Authz); a non-Brewery person can't reach any of it.
- **The Brewery Dashboard (Pixel):** Today's tasks with linked tasks; a brew day there opens the step on the schedule.

## ⚠ LIMITATIONS: what local could NOT tell us

- **`sync!` timing on the release build with the full seed.** Measured only in ExUnit on the MacBook (14 ms per move at 630 linked tasks). DEV: watch a move and a tank rename on the release build.
- **The board's move prompt and the read-only linked tasks on the Samsung tablet.** Tested in desktop Chrome and emulated phones only.
- **The Task list panel at phone width.** Checked at 412 px for the toolbar's height (the button is an icon there); the panel itself only at desktop width.
- **A refused Undo is replaced by the same person's next write** (decision 1.2): when the person who got the refusal clears the blocker themselves, that write's snackbar replaces the refused one. The retry works when someone else clears it (BB1). Follow-up.
- **Other dialogs with the step dialog's focus gap** (decision 3.2): a dialog that disables its button while busy may drop focus briefly, so an immediate Escape can miss it. Fixed in the step dialog only.
- **S71** (`task-board-phone:508`, "list bottom … still scrolling") failed once in a full local run, then 3 of 3 alone: a load flake, but the seed's linked tasks make the phone's day list longer. Watch it on DEV.
- **Board order of linked tasks:** a task that changes day lands at the bottom of the new day, and one deleted and recreated by Undo loses its spot within the day (decision 6, accepted). Linked tasks have no board History (decision 6.4).
- **The Dashboard card** sends a linked task needing a prompt to the schedule; it doesn't run the prompt itself (decision 8.3).
- **Flakes:** 4933 (device_signout G4).
