# D41 builder brief

**From:** the lead (the Claude in the Herdr `lead` tab), for Matt.
**Branch:** `d41-department-task-boards`, in `~/src/rockcut`, cut from
`develop` after D39 merged. The spec and plan are committed; there's no
code yet. The branch isn't pushed.

## Read first

1. `CLAUDE.md` (repo root).
2. `docs/process/three_environment_workflow.md` §3 (the local gate) and §6
   (the Playwright rules).
3. `docs/current_work/specs/d41_department_task_boards_spec.md`: all of it
   (approved by Matt, 2026-10-13). It amends
   `specs/d38_brewery_task_board_spec.md`; read that one's §3.1, §3.3 and
   §3.6 for what's being renamed.
4. `docs/current_work/planning/d41_department_task_boards_plan.md`: all of
   it, especially "Approach" and "Order of work".
5. `docs/current_work/SESSION_HANDOFF_2026-10-13.md`: **Gotchas**.

Build nothing from D40 (tablet, staff codes, reminder, dashboard card) or
D42 (4260).

## Your limits

**You may:**
- edit code, docs and tests on this branch;
- run `mix` (including `mix deps.get`), `pnpm`, `npx playwright` and
  `curl localhost`;
- run `mix ecto.migrate` on the local dev DB when your migration needs it
  (the local API answers 503 until then);
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

## Task 1: plan step 1, the API rename (no behavior change)

The rule for this task: **names change, behavior doesn't.** Every
existing ExUnit test must pass with only module names, table names and
route paths edited, and **no changed assertions** (expected values,
counts, error codes, ordering). If a test seems to need a different
assertion, stop and say so (`LEAD:`); that means behavior moved.

1. **Migration** `…_rename_brewery_task_tables` (a new file; don't edit
   D38/D39's migrations):
   - `brewery_tasks` → `tasks`, `brewery_task_series` → `task_series`,
     `brewery_task_events` → `task_events`, `brewery_daily_items` →
     `daily_items`, `brewery_daily_checks` → `daily_checks`;
   - recreate each table's indexes (including the unique ones, e.g.
     `(series_id, series_date)`, `(on_date, daily_item_id)`) under names
     that match the new tables, dropping the old-named ones;
   - confirm SQLite updated the foreign keys pointing at renamed tables
     (`PRAGMA foreign_key_list`), e.g. `tasks.series_id` →
     `task_series`, `task_series.continues_series_id`;
   - reversible: `down` restores the old names and index names.
   - **Rollback check:** on a scratch copy of the local dev DB (a
     read-only `VACUUM INTO` copy via Exqlite; the real DB untouched), run
     up, down, up; report row counts per table before and after, and the
     index list. Say how you pointed the Repo at the copy.
   - Don't add `task_events.department_id` yet; that's migration 2, in
     step 3.
2. **Modules:** `RockcutApi.BreweryTasks` → `RockcutApi.Tasks`;
   `BreweryTasks.{Task, TaskSeries, Series, Placement, DailyItem,
   DailyCheck, Event}` → `Tasks.*`; schemas use the new table names. Move
   the files to `lib/rockcut_api/tasks/` (and `tasks.ex`), and the tests
   to match. Callers outside the feature too: `Reminders.Scheduler`'s
   top-up, `Seeds.Synthetic`, `Accounts` (leaving the Brewery), `Authz`
   helpers, `json_helpers`, `me_controller`.
3. **Controllers:** `BreweryTaskController` → `TaskBoardController`,
   `BreweryDailyController` → `DailyController`, `BreweryErrors` →
   `TaskErrors`.
4. **Routes:** every `/api/brewery/...` route moves to
   `/api/boards/:dept/...` (same verbs, same suffixes). A new plug
   `RockcutApiWeb.Plugs.TaskBoard` resolves `:dept`; **for now it accepts
   only `brewery`** (anything else → 404) and assigns
   `conn.assigns.board`. The context still uses the Brewery as it does
   today (`department!/0` stays until step 3). `/api/brewery/...` is
   removed. Update the route matrix (`device_route_matrix_test`) to the new
   paths, still people-only.
5. **Keep for now** (step 3 changes them): `Authz` areas
   `:brewery_tasks` / `:brewery_daily_items` and their `brewing` module
   placement, `can_take_brewery_task?/1`, `/api/me`'s
   `brewery_tasks_manage`. Renaming them is behavior-adjacent; leave them.
6. **Docs:** moduledocs and comments that name the old modules/tables.

**The UI isn't touched in this task** (step 2). The local UI will 404 on
the board until then; that's expected.

**Done when:**
- `MIX_ENV=test mix test`: all green, same count as before (1,270), with
  `git diff` on `test/` showing only renames, paths and module names.
  Report how you checked that (e.g. a `git diff --word-diff` scan for
  changed literals).
- `mix compile --warnings-as-errors` clean.
- `grep -rn "brewery_task\|BreweryTask\|api/brewery" lib test priv` shows
  only: the D38/D39 migration files, the step-5 kept names, and History
  action strings if any; list what's left and why.
- Migration up/down/up checked on the copy.

Commit as `refactor:` (one or a few commits). **Reply with:** the counts,
the SHAs, the migration name and index list, the rollback-check numbers,
the grep leftovers, and any `LEAD:` question. Then stop.

## Task 2: plan step 2, the UI rename (no behavior change)

Task 1 accepted (`e3086df`). **Answer:** the plug's 404 test comes in step
3, when the plug opens to every assignable department.

Same rule: **names and paths change, behavior doesn't.** The board still
shows only the Brewery, and the nav still has Brewery → Tasks (the
top-level Tasks entry is step 4).

1. **Files:** `src/pages/brewery/tasks/` → `src/pages/tasks/`;
   `src/lib/breweryTasks.ts` (+ test) → `src/lib/tasks.ts`; other
   `breweryTasks` names in `src/` (hooks, types) to generic ones. Keep
   `useAuth`'s `breweryTasksManage` (it follows `/api/me`, step 3).
2. **API paths:** one helper `boardPath(dept, ...segments)` →
   `/api/boards/<dept>/...`; every board call uses it with `'brewery'`
   for now.
3. **Routes:** the board at `/tasks/brewery`; `/brewery/tasks` redirects
   there (replace, keeping the query string, e.g. `?from=&to=`). Brewery →
   Tasks in the nav points at `/tasks/brewery` and still lights up there.
4. **Storage keys:** `rockcut.breweryTasks.*` → `rockcut.tasks.*`. A
   reader falls back to the old key when the new one is missing (and
   writes the new key), wrapped in try/catch as now. Vitest for the
   fallback.
5. **Playwright:** `tests/regression/brewery/` keeps its folder for now;
   update paths only (`/brewery/tasks` → `/tasks/brewery`, API paths, any
   storage-key names the specs set or read). Add one small check: an old
   `/brewery/tasks?from=…&to=…` URL lands on `/tasks/brewery` with the
   same range. Same verification as Task 1: show that spec diffs are
   paths and names only.

**Also (time-boxed, 30 min):** name the occasional ExUnit failures from
Task 1. Run the full suite 5 times with `--seed` printed, writing each
run's full output to a file in your scratch dir (no `tail`), and list
each failing test with its seed and the UTC time. Don't fix anything;
report.

**Done when:** `tsc`, `vite build`, Vitest and lint (no new problems)
pass; the brewery Playwright folder passes; ExUnit still 1,270/0 at least
once. `refactor:` commits (and `test:` for the new check). **Reply with:**
counts, SHAs, the spec-diff check, the ExUnit failure list, any `LEAD:`.
Then stop.
