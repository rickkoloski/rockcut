# D49: Task List Linkage, Clean Not Sanitized, Pencilled Batches — Completion Record

**Status:** COMPLETE on DEV. Merged to `develop` 2026-10-27 (PR #36). **Not on prod:** D46–D49 go to prod in one release next.
**Spec:** `specs/d46_production_scheduling_spec.md` (§3.12 task list linkage, §3.12a Clean not sanitized, §3.12b Pencilled batches; scenarios P90–P103, P108, P122–P135; D48's BB1 / BB2)
**Plan:** `planning/d49_schedule_task_list_plan.md`
**Brief / lead decisions:** `prompts/d49_builder_brief.md`, `prompts/d49_lead_decisions_1.md` … `_10.md`
**Handoff note (PR description):** `stepwise_results/d49_handoff_note.md`
**QA:** `stepwise_results/d49_qa_report.md`, `d49_qa_recheck1_report.md`
**PortableMind:** task 4632 (D49). Split out: **D50**, the brewhouse tablet on the schedule (task 4934). Backlog from the gate: 4949 (same-day dots overlap in a collapsed row), 4950 (Undo snackbar over a dialog). Flake: 4933.

## What shipped

| # | Item |
|---|---|
| 0 | **BB1 / BB2:** a refused snackbar Undo keeps its button until the token runs out; Undo checks the order rules before the stale check (refusals name the rule) and works once the blocker is cleared. `updated_at` is out of the Undo hash. |
| 1 | **Clean not sanitized:** the `cleaned` mark and the Mark… list; CIP variants (`cip_method`: CIP & Sanitize, CIP - no sani, Sanitize) in templates, the CIP dialog, the empty-spot menu and the step dialog; one cleanliness timeline per tank; "Clean no sani N days"; the soft flag `unsanitized_fill`. |
| 2 | **Pencilled batches:** `batches.pencilled`, X-numbers, Pencil in / Schedule this batch with Undo, muted flags, "Schedule this batch first." on a check-off, faded hatched bars. |
| 3 | **Linkage:** `tasks.production_step_id`, `Production.TaskLink.sync!` after every schedule write, Undo and rename; board writes on a linked task go to Production (move prompt, batch-number and off-plan prompts, notes, assignee, delete → off the task list); 422 `linked_task`, 403 `linked_task_device`; Planned batch pill and per-person **Show planned batches**; the Gantt's **Task list** panel; `/brewery/production?step=&day=`; phase markers never get a task (Matt; the API refuses `marker_task_list`). The Dashboard card opens the step on the schedule when a prompt is needed. |
| 4 | **Other fixes:** the step dialog keeps focus after a refused action (since D47); Move all to today counts only the board's own tasks; Notification preferences keep a change when the first read lands late (found on DEV); "Mark not done" puts back steps its own check-off moved (QA 1); a Dirty mark after a same-day CIP raises the dirty flags (QA 2); the Undo snackbar moves clear of dialogs and hides when its token expires (QA 4); the tablet popover shows notes (QA 5). |

**Migrations (all reversible, additive):** `20261026120001_add_cip_method`, `20261026140001_add_pencilled_to_batches`, `20261026160001_add_production_step_to_tasks`, `20261026160002_add_show_planned_batches_to_users`, `20261027120001_add_checkoff_move_to_production_steps`.

**DEV seed:** a Clean not sanitized mark on FV1, a CIP - no sani on FV7, a pencilled Oktoberfest X1, and linked tasks for every seeded step (`sync!` after the batches).

**Playwright projects:** `brewery-board` runs after `production` (both write the Brewery board). A production failure skips the board project; rerun it with `--no-deps`.

## Testing

- **Final local gate (`fe26ae3`):** ExUnit **1786 / 0**. Full Playwright 567 passed, 1 failed (G4, flake 4933). `tsc` and `vite build` clean; lint has only the 26 errors + 1 warning already on `develop` (task 4084).
- **Revert runs:** BB2, BB1, the step dialog focus, Move all, Notification preferences (S35, on DEV's timing), QA 1, QA 2, QA 3, QA 4, QA 5 and QA 8 each fail with the fix reverted and pass with it restored (`d49_handoff_note.md`, the commits).
- **DEV runs:**

  | Run | SHA | Result |
  |---|---|---|
  | 1 | `6474383` (API v60 / UI v63) | production 374 / 1 failed (P134, a test race); `brewery-board` rerun 189 / 3 failed (S28 a collision with a local run; S35 a real bug; S163 a test race) |
  | 2 | `fe26ae3` (API v61 / UI v64) | **571 passed / 0 failed** |

- **`sync!` cost:** 14 ms per move at 630 linked tasks (ExUnit); on DEV a move ~120–166 ms and a tank rename ~180 ms end to end (budget 500 ms).
- **QA:** a first pass (2 must-fix, 7 minor) and fix cycle 1, then a targeted recheck: 6 of 7 fixed, gap 4 partly, **no must-fix**. D49 closed under Matt's close-out rule; the recheck's minors A–C went to the backlog (4950).

## LIMITATIONS / for later

- **A refused Undo is replaced by the same person's next write** (decision 1.2).
- **Other dialogs** that disable a busy button may drop focus briefly (decision 3.2).
- **Linked tasks:** no board History; a task that changes day lands at the bottom of the new day (decision 6.4).
- **The Dashboard card** sends a linked task that needs a prompt to the schedule (decision 8.3).
- **Undo snackbar over a dialog:** not reachable by keyboard, hides after ~6–8 s, covers the dialog's title (4950).
- **Same-day dots** overlap in a collapsed Gantt row (4949).
- **The brewhouse tablet** sees linked tasks read-only until D50.
- **Flake:** 4933 (device_signout G4).

## Notes for the release and D50

- The release after D49 ships D46–D49 together, with §3.14's prod clean-up of the old batches (a read-only count first; deletion only on Matt's go). Five D49 migrations plus D46–D48's run at boot.
- D50 (task 4934): the brewhouse tablet writes the schedule and linked tasks with a staff code (§3.13, P104–P107).
