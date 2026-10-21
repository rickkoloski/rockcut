# D47: Batch Schedule and Gantt — Implementation Plan

**Spec:** `specs/d46_production_scheduling_spec.md` (APPROVED 2026-10-20), §3.5–§3.10, scenarios P20–P64 and P109. Also the Gantt parts that D46 deferred: P1/P2 (row order), P4 (retire refused), P6–P10 (out of service on the Gantt).
**Created:** 2026-10-21 · **Branch:** `d47-batch-schedule-gantt` from `develop` (`9f9c229` or later) · **Task:** PortableMind 4630 (+ 4650 first)
**Builds on:** D46 (`RockcutApi.Production`, `/api/production`, `pages/production/`, `lib/production.ts`).

## Lead decisions for D47 (where the spec leaves room)

1. **Task 0 is task 4650** (the D46 follow-ups), in its own commit before any D47 work: N1 (transfers out of day order: refuse with "Transfers stay in day order: this one would come before the transfer on day 25." and keep "Into tank" from offering a tank that already exists), N2 (the Remove dialog warns "The tanks after this transfer depend on it." and lists what becomes incomplete), N3 (the ramp dialog caps the change per day at |start − target| with an inline error; the server message names the actual rule), N4a–c (messages and copy), item 10 (sortable rows: move the drag `role="button"` onto a handle, not the whole row), item 11 (concurrent edits: no fix; the 60-second refetch covers it, as P61 accepts).
   **Also in task 0: Split - Transfer / Split - Filter** (Matt, 2026-10-21; spec §3.4, P109). Add `template_steps.split_method` (`transfer` / `filter`, required for a Split, default `transfer`; the migration sets existing Splits to `transfer`). The editor's Add/Edit step offers Transfer / Filter for a Split, and the name shows "Split - Filter" before any addition. The method doesn't change behavior: a Split is still the tank's exit. The batch split itself (one method for the whole split; one part may stay; no two parts in one tank) is D48 (P110).
2. **Scheduled batches only.** The Gantt, P-numbers, flags and status consider only batches that have `batch_vessels` (planned through the schedule). Older `batches` rows are ignored by all of it. They are deleted on prod at the release (§3.14). The **DEV seed deletes the legacy synthetic batches**, with their brew turns and log entries, so DEV matches prod after the clean-up and the number scenarios (P36 "highest brewed #43") hold. Batch-number uniqueness and the "next number" suggestion cover every row in `batches` (the index is table-wide anyway).
3. **A CIP after Package.** Templates add a CIP only for a Transfer/Filter (D46). When a batch is **planned**, every vessel whose exit is Package and that has no CIP & Sanitize gets one on the Package day, linked `move_all` from it. Templates stay as they are. A part's bar therefore always runs from its fill (Brew day for the first tank, the Transfer/Filter for a later one) to its CIP.
4. **Move and check-off previews come from the server.** `POST /steps/move` and `POST /steps/:id/complete` take `preview: true` and then return what would happen without writing: the following steps with their new dates, the default answer, out-of-order warnings and P-number changes. The prompt shows that preview; Apply sends the same call without `preview`. The graph logic lives only in Elixir.
5. **Undo is server-side**, as the spec says: a `production_undos` table (`token`, `user_id`, `expires_at`, `entries` JSON). Each entry has a table, an id, a before-image (null for an insert) and an after-image hash. `POST /undo/:token` restores the before-images in one transaction if every row still matches its after-image; otherwise it returns 409 `undo_stale` ("Something changed since. Nothing was undone."). Tokens last 2 minutes and are pruned on write. Tracked tables: `batches`, `batch_vessels`, `production_steps`, `production_step_links`, `tank_outages`, `flag_signoffs`. Only the user who made the change can undo it.
6. **"Remembered per person" = this browser, keyed by user id** (`rockcut.production.<userId>.range|collapsed|expanded|zoom`), like the board's Hide shifts (D45). Nothing new on the server. The tablet (D49) gets its own key.
7. **The Gantt is our own component**: CSS grid plus absolutely positioned bars and dots in day columns, with no charting library. Dragging uses one pointer-event hook (`useTimelineDrag`): mouse drags at once; touch drags after a 450 ms long-press; a plain swipe scrolls. `@dnd-kit` stays for the lists. Drags snap to whole days and to rows.
8. **Phase on a day.** A tank's phase is the latest one started by (a) a typed step with `starts_phase_id` that is **done**, or (b) a phase marker whose day has come and whose linked predecessors are all done. Markers can't be checked off in D47 (they're not tasks until D49).
9. **"Day N"** = today − the first Brew day's `done_on`. The status temperature is the last checked-off Set temp; before any, the Brew day's `temperature` if it has one, otherwise no temperature.
10. **Brew day's number prompt** applies to the **first** Brew day only ("Brew day - 1 of 2" on a two-day brew). The schedule payload includes `next_batch_number` (the suggestion).
11. **D48 stays out:** the batch dialog shows template and brand read-only (no change), and has no Add step, Remove, Split, Add transfer or multi-select. The step dialog has no Remove.
12. **Old Batches nav entry removed** (`App.tsx` `/batches` link). The route and page stay until they're deleted later.

## API (`rockcut_api`)

**Migrations** (forward-only):
- `batches`: `batch_number` nullable; drop the unique index on `batch_number` and add a unique index on `lower(batch_number)` (SQLite: rebuild the table if needed; check every FK into `batches` survives); add `volume_bbl` (decimal), `template_id` (FK, nilify), `brew_two_days` (bool, default false). `Batch.changeset` allows a null number only when the batch is `planned`.
- `batch_vessels`: `batch_id` (cascade), `vessel_index`, `tank_id` (nilify, null = Unassigned); unique `[batch_id, vessel_index]`.
- `production_steps` (§3.5 table, including `split_method`, copied from the template), indexes on `batch_id`, `tank_id`, `due_on`, `assignee_id`.
- `production_step_links`: unique `[from_step_id, to_step_id]`, cascade on both.
- `flag_signoffs`: unique `flag_key` (one sign-off per flag; signing again replaces it).
- `production_undos` (decision 5).

**Modules.** `production.ex` is already 1,150 lines, so D47 goes in new modules under `lib/rockcut_api/production/`. Each multi-row change happens in one `Repo.transaction`.
- `Production.Batches`: `plan/2` (copies template steps and links with `due_on` = brew day + offset; two-day brew → "1 of 2" / "2 of 2"; vessels from the template's vessel indexes with the chosen tanks; decision 3's CIP), `delete_planned/1`, `shift/2` (unfinished steps; a planned batch's every step), `set_vessel_tank/3`, `update/2` (volume, batch_number with the rules), `p_numbers/0` (planned top-level batches by first brew day, then id), `next_batch_number/0`, and a `renumbered` diff for every write that can change P-numbers.
- `Production.Steps`: `following/1` (unfinished steps reachable through links, excluding the moved ones), `default_answer/1`, `move/3` (`ids`, `days`, `answer`, `preview`), `complete/2` (`done_on`, `batch_number` for a planned first Brew day → status `fermenting`; Package → `completed`; off-plan → move by the difference and apply `answer`; 422 `answer_required` with the preview when an off-plan check-off with following steps has no answer), `uncomplete/1` (first Brew day → `planned`, number cleared; Package → `fermenting`), `update/2` (detail, temperature, notes ≤ 2000, assignee must be a Brewery member, `on_task_list`), `assign/2`.
- `Production.Cips`: standalone CIP create (`already_done` records it done), update, delete, complete, uncomplete, move.
- `Production.Schedule.load(from, to, today)`: one payload (§3.15). Load everything in range plus the parts overlapping it, preloaded in a few queries (no N+1), with step names resolved from types (renaming a type renames every batch's step).
- `Production.TankStatus.for(tank, parts, cips, outages, today)` and `Production.Flags.compute(schedule, signoffs)`: pure functions, unit-tested on plain structs. Each flag has `key` (kind + ids, stable) and `signature` (a hash of the dates, tank and volume involved), `signed_off` and `was_signed_off`. Flags are computed over a window wide enough to be correct for the range (the parts overlapping it plus their neighbors in the same tanks).
- `Production.Undo`: `track(user, fn -> ... end)` captures before- and after-images for the rows the function reports, stores the token, and returns `{result, token}`; `undo(user, token)`.
- `retire_tank`: fill in D46's `batches_in_tank/1` (batches with an unfinished step in a part on that tank) so P4 refuses with the list.
- Every write response: the changed batch(es) or step(s) as the schedule serializes them, plus `undo_token`, `renumbered` and the flags touched. The client then refetches the schedule. A response doesn't have to be a full patch.

**Routes** (in the D46 `scope "/api/production"`, people only until D49): as listed in spec §3.15 for D47, plus `preview` on move and complete. `:production, :write` for every write, `:read` for `GET /schedule`. Error codes: `batch_number_required`, `batch_number_taken`, `batch_number_invalid` (blank or > 20 characters), `answer_required`, `step_done`, `not_planned` (deleting a brewed batch), `volume_invalid`, `range_invalid` (more than 730 days), `undo_stale`, `undo_expired`.

**DEV seed** (`Seeds.Synthetic`, idempotent, today-relative; the batches use real brand names): delete the legacy synthetic batches (decision 2). Then add `[SEED]` scheduled batches that cover the scenarios:
- Crusher #42 in FV4, brewed 18 days ago, in Fermentation at 68°, with "Set temp - 58°" due today.
- A batch in FV5 whose 32° step is a day late.
- Galactic #40 in FV2.
- Fest #38, FV7 → Serving 2 after a transfer.
- Serving 1 emptied 8 days ago with no CIP.
- Altruism P1 and one more planned batch later.
- Highest brewed plain number #43.
- One signed-off flag, and steps assigned to `brewer1` and `brewer2`.

The reseed cleans up `[TEST-TEMP]` batches (brand or notes tag) and every standalone CIP or sign-off on `[TEST-TEMP]` tanks.

## UI (`rockcut-ui`)

- **`/brewery/production` becomes the Gantt** (`pages/production/Gantt/`). The D46 hub cards move under **Set up ▾** (Tanks, Templates, Phases & steps). Remove the Batches nav entry.
- **Data:** `useApiQuery(['production','schedule',from,to])`, refetched on window focus and every 60 s; every write invalidates it. Types in `lib/production.ts`; the date math (day columns, tracks, stacking) in pure functions with Vitest tests (`lib/gantt.ts`).
- **Toolbar** (§3.6) without Task list (D49): zoom 2/6/12 weeks (6 by default), Today, ‹ 4 wks · From – To · 4 wks › (7–730 days), Expand all / Collapse all, the flag chip, Add CIP & Sanitize, Plan batch, Set up ▾.
- **Grid** (§3.6): a sticky tank column with « / », and a sticky date header. Weekends, the today line and gridlines. Tank rows, then Unassigned. Collapsed rows show bars colored by phase over time (the D46 palette and `TemplatePreview`'s segment logic, generalized), planned bars ghosted, dots, initials (hidden below 14 px per day), flag badges, stacking, standalone CIP blocks, out-of-service bands, and transfer arrows (split arrows wait for D48). Expanded rows show diamonds and links. Then the legend.
- **Interactions** (§3.6 table) except multi-select. Tapping an empty spot opens a menu (Plan a batch / Add CIP & Sanitize / Mark out of service, which reuses D46's `OutageDialog`). Tank ⋯ opens a panel with the periods (Now / Coming up / Past) and Mark out of service. Click a band to open the period's dialog.
- **Dialogs:** Plan batch (§3.5) with tank pickers showing capacity and out-of-service; the move prompt (§3.7, built from the server preview); the brew-day number prompt; the batch dialog (§3.5 without the D48 actions); the step dialog (§3.5 without Remove; typed notes are kept on close); the standalone CIP dialog; the Flags list (§3.9).
- **Undo snackbar**: 6 s, on every write, calls `POST /undo/:token`.
- **Keyboard:** every dot, diamond, bar and band is focusable; Enter opens it.
- **Phone (< 560 px):** names-only column by default; every dialog works.
- `data-testid`s on rows (`gantt-row-<tankId>`), bars (`gantt-bar-<batchId>-<vessel>`), dots (`gantt-step-<stepId>`), bands, dialogs and buttons.

## Tests

- **ExUnit:**
  - P-numbering (brew-day order, then id; renumber diffs).
  - Next-number suggestion: plain numbers only; "44b" doesn't count; duplicates ignoring case.
  - Brew-day completion with and without a number (`batch_number_required`); un-check frees the number.
  - Plan: two-day brew, vessels, Package CIP (decision 3).
  - `following` and `default_answer`; move all / only; finished steps never move; out of order.
  - Off-plan completion.
  - Shift: planned vs brewed.
  - Vessel tank change touches only that part.
  - Statuses: every row of §3.8.
  - Every flag kind, plus sign-off signatures (a signature change reopens the flag).
  - Standalone CIP clears the dirty flags.
  - Undo: restore, `undo_stale`, expiry, another user.
  - Retire a tank that is in use (P4).
  - Renaming a type renames batch steps.
  - Authz 403/200 as in D46.
  - Performance: a seeded 12-week schedule with 10 tanks and 30 batches loads in < 300 ms locally (log the time).
- **Playwright** `tests/regression/production/` for P20–P64, plus P1/P2 (Gantt rows), P4, and P6–P10 (on the Gantt).
  - Use their own `[TEST-TEMP]` brands or tanks where they can.
  - **P-number assertions are relative:** read the numbers before the change and compare after (other planned batches exist).
  - Drags use the mouse. Touch long-press (P87 is D48) is checked by hand.
  - P61 uses two persona contexts.
  - Persist-verify after a reload throughout.
  - Update `tests/COVERAGE.md` for D47.
- **Local gate** per `three_environment_workflow.md` §3. **Full Playwright runs go in a visible herdr tab** (the lead starts them, or the builder asks `LEAD: run the full suite`). Never run them in a hidden background shell.

## Tasks for the builder

0. **4650 follow-ups** (decision 1), with tests. Stop and report.
1. **API A:** migrations, `Batches`, `Steps` (move/complete with preview), numbers, `Schedule.load`, and routes for those. Stop with `LEAD: restart API`.
2. **API B:** `TankStatus`, `Flags` + sign-offs, `Cips`, `Undo`, `retire_tank`, the DEV seed. Stop with `LEAD: restart API` and the test count.
3. **UI A:** the Gantt read-only (toolbar, grid, rows, bars, dots, status, legend, expand, «, range), Set up menu, nav change. Drive it as `brewer1` on the seed.
4. **UI B:** Plan batch, the drags, the move prompt, the brew-day prompt, the batch/step/CIP dialogs, Flags list, out of service on the Gantt, Undo.
5. **Playwright + local gate.**
