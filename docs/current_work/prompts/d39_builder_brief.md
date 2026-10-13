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
