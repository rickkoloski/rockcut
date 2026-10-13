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
