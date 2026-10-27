# D49: Task List Linkage, Clean Not Sanitized, Pencilled Batches — Implementation Plan

**Spec:** `specs/d46_production_scheduling_spec.md` (APPROVED). D49 covers:
- §3.12 Task list linkage, §3.12a Clean not sanitized, §3.12b Pencilled batches;
- D48's minors BB1 / BB2 (`stepwise_results/d48_batch_changes_COMPLETE.md`, LIMITATIONS);
- scenarios P90–P103, P108 and P122–P135.

**Not D49:** the brewhouse tablet on the schedule (§3.13's tablet bullet, P104–P107) is **D50** (Matt, 2026-10-26). D49 goes to prod in the release after it merges, with D46–D48 (§3.14's data clean-up runs then).

**Created:** 2026-10-26 · **Branch:** `d49-schedule-task-list` from `develop` (`46bcf34`) · **Task:** PortableMind 4632
**Builds on:**
- D47/D48's `Production.Batches`, `Steps`, `Cips`, `Flags`, `TankStatus`, `ConditionMarks`, `Splits`, `BatchChanges`, `Undo`;
- D38–D42's `Tasks` and `TaskBoardController` (the Brewery board), D40's `StaffCodeActing` and `Authz.Device`;
- the Gantt in `pages/production/Gantt/` and the board in `pages/tasks/`.

## Lead decisions for D49

1. **Scope and order** (Matt, 2026-10-26): everything in the spec's D49 except the tablet. Build the Gantt-side items first and the linkage last, so the linkage is written against the final step model: pencilled batches never get tasks, and the CIP variants have their own titles, from the start.
2. **BB1 / BB2 first** (task 0). They're fixes to D48 code that's fresh in the record.
   - **BB1:** a refused snackbar Undo keeps its button while the token is still valid. Only `undo_expired` and `not_found` drop it.
   - **BB2:** the four routes (the Split's Undo after a part's full Package, brew day's Undo in a split family, a Split un-check's Undo after brew day, a late Split check-off's Undo) refuse with the **rule's own code and message**, the same ones as the direct action. They stay undoable once the blocker is cleared. Don't loosen the stale check itself: the rule is checked first, before the hash compare, and a real outside change still gives `undo_stale`. Each route gets an ExUnit test, and the late-Split one also checks that the parts get their dates back.
3. **Clean not sanitized** (§3.12a):
   - `tank_condition_marks.state` gains `cleaned`.
   - **CIP variants:** a `cip_method` column on `production_steps` and `template_steps` (`sanitize_full` default, `no_sani`, `sanitize`), like `split_method`. The step's name comes from the type plus the variant: "CIP & Sanitize", "CIP - no sani", "Sanitize". The step dialog's switch only works on an unfinished CIP.
   - **One cleanliness timeline per tank.** Extend D48's helper (exits, done CIPs, marks, latest wins). Don't add a parallel one. Its states become `dirty`, `cleaned` (CIP - no sani, or a `cleaned` mark) and `sanitized` (CIP & Sanitize, a `clean` mark, or a Sanitize on a `cleaned` / `sanitized` tank). A Sanitize on a dirty tank leaves it dirty, and the step carries `sanitize_on_dirty` for the step dialog's line.
   - **Planned steps count for the flags:** CIP & Sanitize and CIP - no sani count as a planned CIP. A Sanitize after a planned CIP - no sani makes the fill clean.
   - **The new soft flag** `unsanitized_fill` ("Filling a tank that isn't sanitized") goes through D47's sign-off rules.
   - **Status line:** "Clean no sani N days" in amber.
   - **UI:** the tank ⋯ dialog's Mark… vertical list, per mockup B and the spec's layout bullets. The standalone CIP dialog and the empty-spot menu get the variant choice. Add process ▾ → CIP… replaces CIP & Sanitize…. Templates get the variant on CIP entries.
4. **Pencilled batches** (§3.12b):
   - **`batches.pencilled` boolean**, only while `planned`. Pencilled isn't a new status, so every planned-batch rule (moves, D48 changes, splits) keeps working with no new branches. Parts follow their parent.
   - **X-numbers:** `p_numbers/1` returns both sequences: P for scheduled planned batches and X for pencilled ones, each by brew date, renumbered the same way. Labels: "Oktoberfest X1", "X1.2" for a part.
   - **Writes:**
     - `POST /batches` takes `pencilled`;
     - `POST /batches/:id/schedule`;
     - `POST /batches/:id/pencil` (refused with `step_done` once any step of the tree is done).
     All are tracked by Undo.
   - **Flags:** they carry `muted: true` on a pencilled batch, aren't counted, can't be signed off (`flag_muted`), and skip "No tank assigned within 3 days". A scheduled batch's own overlap flag with a pencilled one stays unmuted.
   - **Brew day:** completing it on a pencilled batch returns 422 `schedule_first` ("Schedule this batch first."). The UI offers Schedule, then retries the check-off.
   - **Drawing:** faded and hatched, with a "Pencilled" label, in any row.
5. **One link column.** Use `tasks.production_step_id` (unique, `on_delete: :delete_all`) and skip a second `production_steps.task_id`. One FK means nothing has to be kept consistent between two columns. The spec's data row says so.
6. **The step is the source; tasks are derived.** Add a `Production.TaskLink` module:
   - **`want/1`** gives a step's task fields:
     - the step has a task when `on_task_list`, it isn't a marker, and its batch isn't pencilled (a standalone CIP always qualifies);
     - **title** "FV3 · Galactic #33 · Set temp - 48°", with "No tank · …" when unassigned;
     - **fields:** `due_on`, done (`completed_on` = `done_on`, `completed_by` = `done_by`), `notes` and `assignee_id`, all from the step;
     - the department is Brewery.
   - **`sync!/1`** runs inside the write's transaction. It compares the wanted task for every **unfinished** step, plus the steps the write touched, with the existing tasks, and creates, updates or deletes only the ones that differ. It recomputes everything so no path is missed: P- and X-renumbering, a tank rename, a type rename and a brand rename all retitle other batches' tasks. At brewery scale (~30 batches) that's a few hundred rows; keep it within the 500 ms move budget, and measure it.
   - **Where it runs:**
     - at the end of `Undo.track/4`, which every schedule write already goes through;
     - after `Undo.undo/2`;
     - after the setup writes that change titles (tank, step type and brand rename, retire).
   - **Tasks are not Undo-tracked.** Undo restores the production rows, then `sync!` rebuilds the tasks. A task deleted by Undo and created again loses its board position within the day. That's accepted.
   - **Board-only fields:** `position` within a day is never synced, and `completed_display` doesn't apply to linked tasks.
7. **Board writes on a linked task go to Production** (`TaskBoardController`, one dispatch for linked tasks). Each one also asks `Authz.can?(user, :write, :production)`:
   - **move / Change day** → `Steps.move([step], days, answer)`, with the same contract as `POST /steps/move`: no `answer` means the server returns the `following` set for the prompt;
   - **complete** → `Steps.complete` (the batch-number and off-plan prompts, with the same codes). The "where should it show" path is skipped;
   - **uncomplete** → `Steps.uncomplete`;
   - **update** → `notes` / `assignee_id` through `Steps.update`. A title or recurrence change returns 422 `linked_task` ("This task comes from the production schedule.");
   - **delete** → `on_task_list: false` (the step stays);
   - **stop_repeating / series** → `linked_task`;
   - **reorder within a day** stays a board write;
   - **responses** carry the production undo token, so the board's snackbar Undo calls `POST /api/production/undo/:token`.
8. **The tablet until D50** (Matt, 2026-10-26): read-only for linked tasks.
   - Every write above from a device returns 403 `linked_task_device` ("Do this on the production schedule."), with or without a staff code.
   - The board hides the checkbox, the drag handle and Edit on linked tasks when it runs on a device, and shows no Open in schedule there.
   - A person signed in with "Sign in as me" is a person (D34), not the device, and can do everything.
   - Add the device cases to the route-matrix test.
9. **"Show planned batches":** a `users.show_planned_batches` boolean (default true) in `/api/me`, written by `PUT /api/me/show_planned_batches` (like D43's `PUT /api/me/color_mode`; people only) (Matt, 2026-10-26: on the server, per person). The board filters by it on the client. A linked task's JSON carries `production: {step_id, batch_id, batch_status, planned}`, which drives the Planned batch pill and the filter. Pencilled batches have no tasks, so they never show (P135).
10. **The Task list panel** on the Gantt (toolbar **Task list**):
    - **Data:** the Brewery board's `GET /api/boards/brewery/tasks` with `linked=true` and the range today−30 → today+6. Late means unfinished before today. Don't add a second endpoint.
    - **Rows:** each has a checkbox, the title, two lines of notes, "Move to [date]", an assignee picker and Open (the step dialog). It uses the same write paths and prompts as the board.
    - It follows "Show planned batches" as the board does.
11. **Shift-end reminders** (D40) pick up linked tasks with no change. Check it in a test; don't build anything new.
12. **Existing data:** there's no backfill migration. DEV reseeds, and the seed calls `TaskLink.sync!` after it builds the batches. Prod has no schedule data (§3.14 clears the old batches at the release).

## API (`rockcut_api`)

**Migrations:**
- `tasks.production_step_id` (FK `production_steps`, unique, `on_delete: :delete_all`);
- `production_steps.cip_method`, `template_steps.cip_method`;
- `batches.pencilled` (default false);
- `users.show_planned_batches` (default true).

The `tank_condition_marks.state` values are validated in the schema, so `cleaned` needs no migration.

**Modules:**
- **New:** `Production.TaskLink`.
- **Changed:** `ConditionMarks`, `TankStatus`, `Flags` (`cleaned` / `sanitized`, the variants, `unsanitized_fill`, muted flags), `Batches` (X-numbers, schedule / pencil), `Cips` and `Steps` (variants; `schedule_first`), `Undo` (BB2, `sync!`), and `TaskBoardController` with `Tasks` (the linked dispatch).

**Routes:**
- `POST /api/production/batches/:id/schedule`
- `POST /api/production/batches/:id/pencil`
- `PUT /api/me/show_planned_batches`
- `GET /api/boards/:dept/tasks` gains `linked=true`

**Error codes:**
- `linked_task`, `linked_task_device`;
- `schedule_first`, `flag_muted`;
- BB2's rule codes, reused from the direct actions.

**DEV seed:**
- linked tasks on the Brewery board, including a Planned batch one;
- a `cleaned` mark;
- a CIP - no sani;
- a pencilled batch (X1) in Unassigned;
- the seed guard updated for the new seed rows.

## UI (`rockcut-ui`)

- **Task 0:** BB1 in the shared Undo snackbar.
- **Gantt:**
  - the Mark… list in the tank ⋯ dialog;
  - the amber status;
  - the CIP variant choice (standalone dialog, empty-spot menu, step dialog switch, template editor);
  - "The tank was dirty: run a CIP first." in the step dialog;
  - pencilled drawing and labels;
  - muted flags in the Flags list, left out of the chip count;
  - Plan batch's Pencil in / Schedule choice;
  - the batch dialog's Schedule this batch / Pencil in;
  - the `schedule_first` prompt with a Schedule button;
  - the **Task list** panel.
- **Brewery board:**
  - the Planned batch pill;
  - the "Show planned batches" toggle (in the board's menu, saved by `PUT /api/me/show_planned_batches`);
  - linked tasks:
    - drag and Change day run the move prompt;
    - check-off runs the batch-number and off-plan prompts, and never "where should it show";
    - Edit shows "This task comes from the production schedule" with Open in schedule, and notes and assignee are still editable;
    - Delete asks "Take this off the task list? It stays on the production schedule.";
    - no recurring options;
  - on a device: read-only (decision 8).
- **Reuse the Gantt's prompt components** on the board (move prompt, batch number). Don't make second copies.

## Tests

**ExUnit:**
- **BB1 / BB2:** the four routes refuse with their rule codes, then succeed once the blocker is cleared; the late-Split dates come back.
- **Marks and variants:**
  - the cleanliness timeline: `cleaned`, the three variants done and planned, Sanitize on dirty, latest wins;
  - `unsanitized_fill` and its sign-off;
  - P128's planned CIP - no sani + Sanitize sequence;
  - the template variant copying onto a planned batch.
- **Pencilled:**
  - X-numbers and renumbering both ways;
  - schedule / pencil and their Undo;
  - `step_done` refusal;
  - muted flags and `flag_muted`;
  - no "within 3 days" flag;
  - `schedule_first`;
  - parts.
- **TaskLink:**
  - `want/1` for every step kind (marker, custom, standalone CIP, part, unassigned, pencilled);
  - `sync!` after plan, move, renumber, tank / type / brand rename, split, Undo split, change template, pencil / schedule, `on_task_list` off / on, and Undo;
  - one transaction: a refused write leaves no task changes.
- **Board dispatch:**
  - move with and without `answer`;
  - complete with the batch-number and off-plan prompts;
  - uncomplete, notes / assignee, `linked_task` refusals, delete → `on_task_list` false;
  - a non-Brewery person refused;
  - the device refused (`linked_task_device`), and "Sign in as me" allowed.
- **Other:** `show_planned_batches` in `/me`; shift-end reminders include linked tasks; Authz boundary as before.

**Playwright** (`tests/regression/production/` and `tests/regression/tasks/`) for P90–P103, P108 and P122–P135, plus `COVERAGE.md`:
- Use your own `[TEST-TEMP]` data, with relative P- / X-number checks.
- P91 checks `brewer2`'s board in a second context.
- The read-only tablet board uses the `breweryDevice` storageState.
- Mockup-B tap targets (≥ 56 px rows) are checked by size.

**Local gate:** per `three_environment_workflow.md` §3. Full runs only through `LEAD: run` (the lead runs them in a visible herdr tab).

**LIMITATIONS to carry to DEV (expected):**
- `sync!` timing on the release build with the full seed, measured against the 500 ms move budget;
- the board's move prompt and the read-only linked tasks on the Samsung tablet;
- the Task list panel at phone width.

## Tasks for the builder

0. **BB1 / BB2** (decision 2). Stop.
1. **Clean not sanitized**, API and UI (decision 3). Stop with `LEAD: restart API` and the test count.
2. **Pencilled batches**, API and UI (decision 4). Stop with `LEAD: restart API`.
3. **Linkage API** (decisions 5–9, 11, 12):
   - migrations, `TaskLink`, the board dispatch;
   - renames, the device refusals, `show_planned_batches`;
   - the DEV seed.

   Stop with `LEAD: restart API`, `LEAD: reseed local` and the test count.
4. **Linkage UI:**
   - the board pill and toggle, linked-task prompts, the Edit and Delete texts;
   - the device read-only view;
   - the Gantt Task list panel;
   - the step dialog switch.
5. **Playwright + local gate.**
