# D39 builder brief

**From:** the lead (the Claude in the Herdr `lead` tab), for Matt.
**Branch:** `d39-brewery-recurring-tasks`, in `~/src/rockcut`, cut from
`develop` after D38 merged. The spec additions and the plan are committed;
there's no code yet. The branch isn't pushed.

## Read first

1. `CLAUDE.md` (repo root).
2. `docs/process/three_environment_workflow.md` §3 (the local gate) and §6
   (the Playwright rules).
3. `docs/current_work/specs/d38_brewery_task_board_spec.md`:
   - the "Delivery split" (D39's column);
   - §3.1 (`brewery_task_series` and the `series_*` columns);
   - §3.10 (recurring tasks);
   - §3.8 "Phone width";
   - §5 (the items moved to D39);
   - scenarios S52–S67 and S69–S77.

   Build nothing from D40: the tablet, staff codes (S68), the reminder or
   the dashboard card.
4. `docs/current_work/planning/d39_brewery_recurring_tasks_plan.md`: all of
   it. Its "Decisions" section is Matt's (2026-10-12).
5. `docs/current_work/SESSION_HANDOFF_2026-10-12b.md` and
   `SESSION_HANDOFF_2026-10-12.md`: the **Gotchas** sections.

## Your limits

**You may:**
- edit code, docs and tests on this branch;
- run `mix` (including `mix deps.get`), `pnpm`, `npx playwright` and
  `curl localhost`;
- commit on this branch, using the repo's commit format and the attribution
  line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Never:**
- `git push`, `gh`, `fly`, merge, rebase, branch delete, `git stash`, or
  switching branches;
- anything on DEV or prod;
- posting in PortableMind.

**Format only the files you changed.** Never run a repo-wide `mix format`
or `mix precommit`.

**Servers:** the local API (:4002) and UI (:5174) belong to the lead. Don't
start, stop or kill them. If you need them, write "LEAD: please
start/restart the API" in your reply and wait.

**When a decision isn't in the spec or plan,** don't guess. Stop, and write
the question in your reply starting with `LEAD:`. The lead answers it or
asks Matt.

## Task 1: plan step 1, generalize `Recurrence` and add the new rules

Build plan "Order of work" step 1, as the plan's "Recurring tasks" and
"Changes → API → `Scheduling.Recurrence`" describe:

1. **Before any change**, run D32's existing recurrence and event tests and
   note the count:
   - `test/rockcut_api/scheduling/recurrence_test.exs` (or wherever they
     live);
   - the `EventSeries` and schedule event tests.

   They must pass **unchanged** at the end. Don't edit them.
2. **Generalize:** `dates/2`, `initial_horizon/1`, `extend_horizon/2`,
   `occurrence_times/2` and the private helpers stop requiring
   `%ScheduleEventSeries{}`. Match on the fields they read, so any map or
   struct with the rule fields works.
   - `occurrence_times/2` is event-only. It can keep its struct match.
   - D32 behavior must not change.
3. **New internal rule kinds** in `candidates/2`:
   - `monthly_day`: day `day_of_month` (1–31), or the month's last day
     when the month is shorter (31 → Nov 30, Feb 28/29);
   - `quarterly_day` and `quarterly_weekday`: the monthly rules, every 3
     months from the start month;
   - `annually`: the start date's month and day each year, with Feb 29 →
     Feb 28 in other years.

   For each one, honor `start_date`, `until_date`, `count` (counting
   skipped dates, as D32 does) and `skipped_dates`.
4. **A brewery horizon helper:** `through = today + 12 months`, **including**
   that date, capped by `until_date`. Name it so it's clearly separate from
   D32's exclusive `initial_horizon`, for example
   `rolling_horizon(series, today)`.
5. **Tests** (new cases in the recurrence test file, or a new
   `recurrence_rules_test.exs`):
   - each new kind;
   - day 31 across a year (S54), including a leap year;
   - last Friday through a year (S55);
   - quarterly day 15 from Oct (S56: Oct, Jan, Apr, Jul);
   - annually Mar 1 after 3 times (S57);
   - annually from Feb 29;
   - `count` with a skipped date;
   - `until_date`;
   - the inclusive rolling horizon: an annual series started today has
     next year's date.

**Done when:**
- the D32 tests pass unchanged, with the same count as before;
- the new tests pass;
- the full `MIX_ENV=test mix test` is green.

Commit as `feat: D39 Recurrence rules for monthly day, quarterly, annually`.

**Reply with:**
- the before and after test counts;
- the commit SHA;
- any `LEAD:` question.

Then stop. Don't start step 2.

## Task 2: plan step 2, migration, `TaskSeries`, and series create, top-up and delete

Task 1 was reviewed and accepted (`3fb2377`). Build plan "Order of work"
step 2, as the plan's "Recurring tasks" and "Changes → API" describe.

1. **Migration** `…_create_brewery_task_series`:
   - the `brewery_task_series` table, with the spec §3.1 columns:
     - `frequency` is the spec's word (`weekly`, `monthly`, `quarterly`,
       `annually`), plus `month_rule` (`day` or `weekday`);
     - `interval`, `weekdays`, `day_of_month`, `week_of_month`, `weekday`;
     - `start_date`, `until_date`, `count`, `generated_through`,
       `skipped_dates`;
     - `title`, `notes`, `assignee_id`, `department_id`, `created_by_id`,
       timestamps;
   - on `brewery_tasks`: `series_id` (FK, `on_delete: :nilify_all`),
     `series_date` and `series_exception` (default false);
   - a unique index on `(series_id, series_date)`, and an index on
     `brewery_task_series.generated_through`.

   Reversible. Check `down` and then `up` on the test DB, or on a scratch
   copy.
2. **Schemas:**
   - `BreweryTasks.TaskSeries`, with the validations in plan "Changes →
     API":
     - weekly: 1–7 weekdays, interval 1–4;
     - monthly and quarterly: `day` 1–31, or nth 1–4 or last (`-1`);
     - annually: no options;
     - an end date or 1–400 times, not both;
     - an end date on or after the start.
   - One public function maps a series to the `Recurrence` rule kind:
     `weekly`, `monthly_day`, `monthly_weekday`, `quarterly_day`,
     `quarterly_weekday` or `annually`.
   - `Task` gains the three `series_*` fields.
   - The task changeset doesn't let a client set them.
3. **`BreweryTasks.Series`** (new):
   - **`create(attrs, actor, today)`.** It parses the flat `repeat*` params
     (plan "Controller" list; `repeat` is the spec's frequency word), so
     the controller can pass them through in step 4. It inserts the series
     and generates every date through `Recurrence.rolling_horizon/2`. Each
     occurrence goes at the **bottom of its day**, with the bottom
     positions found in one query, not one per day.
     - It sets `generated_through`, and logs **one** History event on the
       first occurrence: `created` with the rule in `detail` (Decision 3).
     - No `due_on` → `{:error, :repeat_needs_day}`.
     - A rule with no dates in range → an error, as D32's is.
     - Return the first occurrence.
   - **`top_up(today)`.** One query finds series whose `generated_through`
     is behind `rolling_horizon(series, today)`. For each, it generates
     the dates after `generated_through`:
     - bottom of the day;
     - never a date on `skipped_dates`;
     - never past `until_date` or `count`;
     - no History events.

     It's idempotent: a second run adds nothing, and the unique index
     guards a race. It returns the count added.
   - **`delete(task, "this", actor)`.** Adds `series_date` to
     `skipped_dates`, then deletes the task, through the D38 delete path,
     so History keeps its "deleted" entry (S64).

   `BreweryTasks.create/2` calls `Series.create` when `repeat` is present
   and not `never`/empty. **Don't** change the controller or the
   update/move paths yet: that's step 3 and step 4.
4. **Tests** (`test/rockcut_api/brewery_tasks/series_test.exs`), with
   `today` pinned:
   - each rule creates the right dates (S52–S57);
   - S52's weekly series reaches 11 months out;
   - an annual series includes next year's date;
   - positions are at the bottom of days that already have tasks;
   - one `created` History event;
   - `repeat_needs_day`;
   - a validation error per invalid rule;
   - `top_up`: a day later adds exactly the new dates (S66), a second run
     adds 0, and it never goes past `until` or `count` and never fills a
     skipped date;
   - delete "this" isn't regenerated by a later `top_up` (S64);
   - completing one occurrence leaves the others open (S58, through
     `BreweryTasks.complete`).

**Done when** the new tests and the full `MIX_ENV=test mix test` are green.
D32's tests and the D38 brewery tests must pass unchanged.

Commit as `feat: D39 recurring task series, create and daily top-up`.

**Reply with:**
- the test counts;
- the SHA;
- the result of the migration's `down` and `up`;
- any `LEAD:` question.

Then stop.

## Task 3: plan step 3, series edits, stop, preview and the special moves

Task 2 was reviewed and accepted (`f62d71d`).

**Answer to your question:** don't store a `kind` column. Deriving it with
`rule_kind/1` is right, because a stored copy could drift from `frequency` and
`month_rule`. The plan now says so.

Build plan "Order of work" step 3, as the plan's "Edits" bullets and
**Decisions 2–4** describe. It's all in `BreweryTasks.Series` and
`BreweryTasks`, with no controller changes yet.

1. **`update(task, attrs, scope, actor, opts)`:**
   - A task that isn't in a series → the D38 update path, unchanged.
   - **`"this"`:** the D38 update, plus `series_exception: true` (S60).
   - **`"following"`, content only** (title, notes, assignee):
     - update the series row's content;
     - update every occurrence with `series_date >= this.series_date`
       that's open and **not** an exception;
     - this occurrence gets the change even if it's an exception;
     - earlier, finished and exception occurrences don't change (S61).
   - **`"following"` with a changed rule:** split, as D32's `split/2` and
     `remaining_count` do (S62):
     - the old series gets `until_date` = this `series_date` − 1 (or is
       deleted if this is its first date);
     - its later open occurrences are removed, and those that are
       exceptions are kept or removed per `opts[:changed]` (`:keep`, the
       default, or `:remove`) (Decision 2);
     - finished ones are never removed;
     - a new series starts on this occurrence's date with the merged
       content and the new rule;
     - this occurrence is either reused as the new series' first one, or
       replaced. Pick one and say which; it must keep its History.
   - **A `due_on` change in `attrs`, whatever the scope,** applies to this
     occurrence only and sets `series_exception` (plan "Day changes always
     apply to one occurrence"). With "following", the content goes to the
     following ones and the day to this one only.
   - A `PATCH` or `DELETE` on an occurrence with no `scope` →
     `{:error, :scope_required}`.
2. **`delete(task, "following", actor, opts)`:** ends the series the day
   before and removes this and later open occurrences, keeping or removing
   the exceptions per `opts[:changed]`. History gets one `deleted` event,
   for the occurrence acted on, with `detail` holding the counts (Decision
   3). Don't log one per removed row.
3. **`stop(task, actor, opts)`:** the series ends **on** this occurrence
   (`until_date` = its `series_date`), and later open occurrences are
   removed per `opts[:changed]`. It logs one `stopped_repeating` event
   with the counts (S63).
4. **`preview(task)`:** `%{later_open: n, later_changed: m}`. These are
   the open occurrences after this one, split into those not changed on
   their own and those that were. It's for the confirm wording (Decision
   2).
5. **Moves:** `BreweryTasks.move` and `move_overdue_to_today` set
   `series_exception: true` when they move an occurrence to another day
   (S59, S65). A move within the same day doesn't count as a change.
   **Moving an occurrence onto Future** makes it a one-off (Decision 4):
   - `series_id` and `series_date` are cleared, and `series_exception` is
     false;
   - the old `series_date` goes on `skipped_dates`.
6. **Leaving the Brewery:** wherever D38's `unassign_if_ineligible`
   unassigns open tasks, also clear `assignee_id` on series assigned to
   that person, in the same transaction.
7. **History actions:** reuse D38's event shape. The new actions are
   `edited` with a `scope` in `detail`, `deleted` with `scope` and counts,
   and `stopped_repeating`. Check that `BreweryTasks.list_events` /
   `event_names` still render them; the UI wording comes in step 5.

**Tests** (in `series_test.exs`, or a second file):
- S59: a move becomes an exception, with no second copy after `top_up`;
- S60;
- S61: the S60 exception and an S59-moved one keep their own values;
- S62: the split dates, the count carry-over, and finished and earlier
  occurrences untouched;
- `changed: :keep` and `changed: :remove`, for split, stop and delete
  "following";
- S63: the counts from `preview`, then stop;
- delete "following";
- the Future move becomes a one-off and isn't regenerated;
- S65: Move all to today on three missed occurrences;
- leaving the Brewery clears the series assignee, and `top_up` then
  creates unassigned occurrences;
- `scope_required`;
- History: one event per action.

**Done when** these and the full `MIX_ENV=test mix test` are green, with the
D32 and D38 tests unchanged.

Commit as `feat: D39 recurring task edits, stop repeating and moves` (more
than one commit is fine).

**Reply with:**
- the counts;
- the SHA(s);
- which way you handled "this occurrence" in the split;
- any `LEAD:` question.

Then stop.

## Task 4: plan step 4, controller, routes, errors, scanner and seed

Task 3 was reviewed and accepted (`61ae1cc`).

**Answers:**
1. **A day-only edit with no `scope`** going through as "this": yes, keep
   it.
2. **Repeat Never with "following"** refused with "to end the repeats, use
   Stop repeating": yes. In step 5 the dialog won't offer Never on an
   occurrence, as D32's dialog disables "Does not repeat" in a series.
3. **Repeat params with "this"** ignored: yes, as D32 does.
4. **Duplicates after a split with `changed: :keep`:** fix it. The new
   series must not make an occurrence on a date where a kept occurrence
   from the old series is (its current `due_on`). Put those dates on the
   new series' `skipped_dates` when it's created, so `top_up` never fills
   them either.
   - Add a test: weekly Wed, edit one future Wed "just this one" (title),
     then split from an earlier date to weekly Wed + Fri with keep. That
     Wed has one task, the kept one, and the Fridays are new.
   - The same for a kept occurrence that was moved onto a day the new rule
     produces.
   - The lead decided this; it'll be reported to Matt.

Then build plan "Order of work" step 4 ("Changes → API" → Controller, the
board JSON, Errors, Scanner, Seed):

1. **Controller and router** (`BreweryTaskController`, the people-only
   `/api/brewery` scope):
   - `POST /tasks` passes the `repeat*` params through;
   - `PATCH /tasks/:id` and `DELETE /tasks/:id` take `scope` and `changed`
     (`keep` | `remove`) as query or body params;
   - `GET /tasks/:id/series` returns the rule (the spec's fields, as the
     dialog needs them), `later_open` and `later_changed`;
   - `POST /tasks/:id/stop_repeating` takes `changed`.

   Every new route goes in the route matrix test (`device_route_matrix_test`:
   people only) and gets the same `Authz` checks as the D38 task routes.
2. **The board JSON:** each card has `series_id`. The task JSON the dialog
   uses (from the board or `GET`) has `series_id`, `series_date` and
   `series_exception`.
3. **Errors** (`brewery_errors.ex`), in D38's style:
   - `repeat_needs_day` → 422 "Pick a day to repeat";
   - `scope_required` → 422;
   - a changeset `repeat` error → 422 with its message;
   - `not_in_series` for `/series` and `/stop_repeating` on a one-off task
     → 422.
4. **Scanner:** `Reminders.Scheduler`'s tick also calls
   `BreweryTasks.Series.top_up(BreweryTasks.today())`, in its own
   `try/rescue` so a failure doesn't stop the reminders, or the reverse.
   Keep the scheduler disabled in `:test` as it is. Test `top_up` through
   the function, not the GenServer.
5. **Seed** (`seeds/synthetic.ex`, through the context, not raw inserts):
   - `[SEED] Keg Wash`: weekly on Wednesday, starting the first Wednesday
     on or after 14 days ago, so some are in the past (a couple open past
     ones show on Unfinished);
   - `[SEED] Glycol check`: monthly, last Friday;
   - `[SEED] Calibrate pH meter`: quarterly, day 15.

   `reset` deletes `[SEED]` series and their tasks. `cleanup_temp`
   deletes `[TEST-TEMP]` series and their tasks. Extend the seed's tests,
   and keep the Sunday 7 pm MDT pinned case green.
6. **Controller tests:**
   - the new params and routes, as `brewer1`, `breweryMgr` and `owner`;
   - `bartender1` and a device get 403;
   - `scope_required`, `repeat_needs_day` and `not_in_series`;
   - `/series` counts;
   - stop with `changed=remove`;
   - the board JSON has `series_id`.

**Done when** the full `MIX_ENV=test mix test` is green.

Then check by hand against the local server:
- run `mix rockcut.synthetic.setup` (it doesn't touch the running server);
- `curl` the board for a 31-day range with a minted `brewer1` token
  (`mix rockcut.synthetic.token brewer1`);
- confirm the three `[SEED]` series show with `series_id`;
- report the response time.

If the API isn't running, ask the lead.

Commit as `feat: D39 recurring task API, scanner top-up and seed`.

**Reply with:**
- the counts;
- the SHA;
- the curl check;
- any `LEAD:` question.

Then stop.

## Task 5: plan step 5, the recurring-task UI and its Playwright spec

Task 4 was reviewed and accepted (`0b24eb1`).

**Answers:**
1. **Protecting the day of every remaining old-series occurrence,
   finished ones included:** yes, right.
2. **An unknown `changed` value treated as `keep`:** OK.

Build plan "Order of work" step 5 ("Changes → UI"). Follow spec §3.10
"Creating one" and "Changing one", Matt's Decision 2 wording, and the D32
event dialog (`src/pages/schedule/EventFormDialog.tsx`) as the pattern.
**D32's dialog and its specs must keep working unchanged.**

1. **Repeat helpers:** extend `src/lib/events.ts`'s `RepeatRule`,
   `repeatSummary` and `repeatParams`, or add `src/lib/repeat.ts` that the
   events code keeps using. Cover monthly by day ("on the 31st (or the last
   day)"), quarterly ("every 3 months on the 15th", "every 3 months on the
   last Friday") and annually ("every year on Mar 1"). Write Vitest tests
   for the summaries and the defaults from a day.
2. **`TaskDialog`:**
   - **The Repeat field:** Never / Weekly / Monthly / Quarterly /
     Annually.
     - Its defaults come from the Day: "Weekly on Wed", "Monthly on the
       14th" (with a day / nth-weekday choice), and so on.
     - It has the rule options, Ends (Never / On date / After N times) and
       a summary line.
     - When Day is No day (Future), Repeat is disabled and reads "Pick a
       day to repeat" (S67).
   - **Editing an occurrence:**
     - the dialog loads the rule from `GET /tasks/:id/series`;
     - it shows the summary with a ↻;
     - Never isn't offered.
   - **Save on an occurrence** asks "Just this one" or "This and all
     following" (S69), as D32's dialog does.
     - A changed rule always goes as "following".
     - A day-only change doesn't ask: it's that occurrence only.
     - Keep G1: send only the fields that changed.
   - **A rule change that would remove later occurrences** shows the
     Decision 2 confirm before saving: two buttons when `later_changed >
     0`, a plain confirm otherwise. A rule change that removes nothing
     needs no confirm.
3. **`TaskCard`:** a small ↻ icon when `series_id` is set, with an
   accessible label "Repeats".
4. **`TaskMenu`** (desktop menu and phone sheet), for an occurrence:
   - **Edit series…**: the dialog, with "This and all following" already
     chosen;
   - **Stop repeating**: the Decision 2 confirm, using `GET …/series`'s
     `later_open` and `later_changed`;
   - **Delete**: asks "Just this one" or "This and all following". For
     "following", the Decision 2 confirm.

   **Decision 2 wording:**
   - `later_changed > 0`: "Removes {later_open} later occurrences.
     {later_changed} were changed on their own." with buttons **"Remove
     {later_open}, keep the {later_changed} changed on their own"** and
     **"Remove all {later_open + later_changed}"**, plus Cancel;
   - otherwise: "Removes {later_open} later occurrences." with **Remove**
     and Cancel.
   - Use singular forms for 1.
5. **History wording** (`HistoryDialog`):
   - "created recurring task (Repeats every week on Wed)";
   - "edited (this and following)";
   - "deleted this and following (removed 40, kept 2)";
   - "stopped repeating (removed 40)";
   - "moved … to Future (no longer repeats)".
6. **Drive it in a browser first** as `brewer1` and `breweryMgr` against
   the local servers (token injection, per the workflow), covering S52–S65,
   S67 and S69. Then write `tests/regression/brewery/task-board-recurring.spec.ts`
   from what you saw:
   - dates relative to today;
   - persist-verify every write;
   - `[TEST-TEMP]` titles, with the series deleted in `afterEach` (a
     DELETE with `scope=following&changed=remove` on the first occurrence,
     or a test-support route if one exists);
   - long ranges through the date range selector, 31 days at a time;
   - put the spec in the `brewery-board` project.

**Done when:**
- `tsc --noEmit -p tsconfig.app.json`, `vite build` and `pnpm test:unit`
  pass;
- lint shows no new errors in your files;
- the new spec passes twice in a row;
- `tests/regression/brewery` (`chromium` + `brewery-board`) and the D32
  event specs pass.

Commit as `feat: D39 recurring tasks UI` and `test: D39 recurring task
Playwright spec` (more commits are fine).

**Reply with:**
- the counts;
- the SHAs;
- anything you saw in the browser that the spec doesn't cover;
- any `LEAD:` question.

Then stop.

## Task 6: plan step 6, the D38 follow-ups (API and UI)

Task 5 was reviewed and accepted (`eff9d01`, `460c229`, `c2b7202`).

**Answers:**
1. **"Later" by `series_date`:** yes, that's the right reading.
2. **Making a one-off repeat:** the lead is asking Matt. Leave it as it is
   for now; it may come back as a small task.

Build plan "Order of work" step 6: the plan's "D38 follow-ups" section,
spec §5, Decision 1 and S75–S77.

1. **Un-retire (S75):**
   - `POST /api/brewery/daily_items/:id/restore` (Brewery managers and
     owners, as the other item routes) puts a retired item back at the
     bottom of the active list. Its past ticks are untouched.
   - It's refused with D38's messages at 12 active items, or when an active
     item has the same name, ignoring case. It logs `restored`, which
     History renders as "Restored Daily item Temps".
   - Add the route to the route matrix.
   - In the UI, the Edit Daily items dialog gets a collapsed **Retired**
     section listing retired items, each with a **Restore** button.
2. **GAP-1 / GAP-2:** every `PATCH /daily_items/:id` on a retired item (a
   rename, `active: false`, `position`) answers 422 `retired`, with no
   change made. G3's `active: true` case already does.
3. **Decision 1 (O-3):** `DELETE /daily_checks/:on_date/:id` on a retired
   item → 422 `retired`, and the tick stays. The UI: a retired item's row
   on a past or today card has a disabled checkbox, with a tooltip "Temps
   is retired; its ticks are kept".
4. **O-1 (S77):** `PATCH`, `DELETE`, `move`, `complete` and `uncomplete`
   on a task id that doesn't exist, but has a `deleted` event in History,
   → **410** `deleted` "This task was deleted". An id that never existed
   stays 404. In the UI, the task dialog, menu actions and drag show
   "This task was deleted" and refresh the board.
5. **O-2:** the Edit Daily items dialog reads its list from the board's
   query (or refetches when the board does), so the 60-second refresh and
   focus refetch update it while it's open. Edits in progress in a rename
   field aren't overwritten while that field has focus.

**Tests:**
- ExUnit for 1–4: restore limit, name clash, position, log, the matrix;
  each retired `PATCH`; the untick refusal; 410 against 404.
- Playwright:
  - S75 in `task-board-daily-items`;
  - S77 in `task-board-tasks` (two contexts, as G1's test does);
  - O-2: open the dialog, rename an item from a second context, and let
    the board refetch (trigger it with focus, not a 60-second wait);
  - the disabled checkbox for a retired item.

Run the revert check for the three behavior fixes (GAP-1/2, O-1, O-3):
each new test must fail with the fix reverted and pass with it restored.
Record the results in your reply.

**Done when:**
- full ExUnit is green;
- `tsc`, the build and the unit tests pass, with no new lint errors;
- the brewery folder passes twice.

Commits: one per item, or grouped sensibly. Use `fix:` for GAP-1/2, O-1
and O-3, and `feat:` for restore.

**Reply with:**
- the counts;
- the SHAs;
- the revert results;
- any `LEAD:` question.

Then stop.

## Task 7: plan step 7, phone: vertical view and dragging between days

Task 6 was reviewed and accepted (`53141b4`, `a701c82`, `018c1bb`,
`10b9a60`).

**Answers:**
1. **What a restore does to past days:** keep the simple version for now.
   The lead is asking Matt, and it may come back as a follow-up.
2. **410 for removed occurrences:** no API change. In the UI, a 404 on a
   task route shows the same "This task was deleted" and refreshes the
   board, since a stale card's id is gone either way. Do that small change
   in this task, as its own `fix:` commit.

Then build plan "Order of work" step 7: the plan's "Phone: vertical view
and drag between days", spec §3.8 "Phone width" (as amended 2026-10-12),
S70–S74.

1. **`SortableLists`:** replace `sameListOnly: boolean` with
   `canMoveTo?: (fromList: string, toList: string) => boolean`, defaulting
   to any. Keep `staysLast` working. There's still no Brewery code in
   `components/dnd/`, and the ESLint rule stays green. Update
   `moveModel.test.ts` or add Vitest tests for the rule.
2. **The vertical view at phone width:**
   - the desktop containers stacked in one column: Unfinished (when
     present), each day of the range (title, header, Daily card, tasks,
     "+ Add a task"), then Future;
   - a long press drags between any of them, with window auto-scroll near
     the top and bottom edges (`@dnd-kit` `autoScroll`; check that it
     scrolls the window, not just a container);
   - a normal vertical swipe that starts on a card still scrolls;
   - no sideways swipe-to-change-day in this view.
3. **The toggle:** a one-day / vertical switch in the phone toolbar.
   - It's remembered in `localStorage` (try/catch, as 1 week / 2 weeks
     is).
   - With no saved choice, a phone starts in the vertical view (S70).
   - Desktop ignores it.
4. **The one-day view:** keep its swipe and day strip. Its `canMoveTo`
   allows the same list, or Unfinished → the selected day, when the
   selected day is today (S73).
5. **Drive at 360×800 with touch emulated** before writing tests. Then add
   to `task-board-phone.spec.ts`:
   - S70: the first visit is vertical, and the choice survives a reload;
   - S71: drag down to day 3 with auto-scroll, persist-verified, plus the
     History wording;
   - S72: Unfinished → tomorrow;
   - S73: one-day, Unfinished → between today's first and second tasks;
   - S74: onto Future.

   Use the existing touch helpers and the `mouseDrag` hardening pattern:
   wait for the drop spot before releasing.
6. **Check that D38's phone tests still pass:**
   - the one-day reorder;
   - the bottom slot (fix A);
   - back closes the sheet (fix B).

   They need the one-day view set explicitly now that phones start
   vertical.

**Done when:**
- `tsc`, the build and the unit tests pass, with no new lint errors;
- the brewery folder passes twice.

Commits: `feat: D39 phone vertical view and drag between days`, the test
commit, and the 404 `fix:`.

**Reply with:**
- the counts;
- the SHAs;
- what auto-scroll did in the emulator (so the lead can tell Matt what to
  check on the Pixel);
- any `LEAD:` question.

Then stop.
