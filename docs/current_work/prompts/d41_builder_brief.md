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

## Task 3: plan step 3, per-department API

Tasks 1–2 accepted (`e3086df`, `b10058a`, `383f357`): the rename
checkpoint is passed. **Flaky ExUnit:** don't hunt now; from here on, keep
the full output of every ExUnit run (no `tail`), and if a test fails then
passes alone, put its name and seed in your reply.

Now behavior changes. Spec §3.1–§3.4; plan "The department on every call",
"`Authz`", "Leaving a department", API changes. The UI still only uses
`brewery` (step 4 adds the rest).

1. **The plug** accepts every **assignable** department key (`brewery`,
   `bar`, `office`, `sales`); `other` and unknown keys → 404. Add the 404
   tests now (Task 1's question).
2. **Context takes the department:** every `Tasks` function takes the
   board's `%Department{}` first; `department!/0` goes away. Controllers
   pass `conn.assigns.board`.
3. **Scoped lookups:** every by-id read or write matches the department
   (`Tasks.get(dept, id)`, series, Daily items, checks). An id from
   another board → 404, and nothing changes (S115). In review I'll grep
   for an unscoped `Repo.get(Task` / `Repo.get(TaskSeries` /
   `Repo.get(DailyItem`; explain any that stay (e.g. inside a function
   that already scoped the parent).
4. **`Authz`:** areas `{:tasks, dept}` and `{:daily_items, dept}` (plan
   "`Authz`") replace `:brewery_tasks` / `:brewery_daily_items`;
   `can_take_task?(user, dept)` replaces `can_take_brewery_task?/1`. The
   task areas leave the `brewing` module, and the router's `:brewery`
   pipeline comes off the board scope. D31's parity suite and boundary
   test: add the rows, keep them green. Devices: still 403 on every board
   route (route matrix).
5. **Assignee rule:** an active member of the board's department, or an
   owner (S105: assigning `brewer1` on the Taproom board → 422, same error
   as today's ineligible assignee).
6. **Leaving a department:** `unassign_if_ineligible` per department:
   only open tasks on the department the person left (S112), logged on that
   board. Series assignees likewise.
7. **Migration 2** `…_add_department_id_to_task_events`: nullable FK, backfill
   from the task where it exists, else the Brewery; index
   `(department_id, inserted_at)`. Every new event writes it. History
   (`list_events`) filters by the board (S108). Up/down checked on a copy.
8. **Header:** the board's department's published shifts and events
   (today the code filters on the Brewery). The "No brewers scheduled"
   text lives in the UI, so nothing to do in the API there.
9. **`/api/me`:** `task_boards` (spec §3.4: `key`, `name`, `color`,
   `manage`, in nav order; owners get all four). Keep
   `brewery_tasks_manage` too **for now**, computed from the Brewery
   board, so the UI keeps working until step 4 removes it. Don't add `all`
   yet (step 5).
10. **Top-up:** confirm `Series.top_up/1` covers every department's series
    (S116 ExUnit: a Taproom series and a Brewery series both top up, each
    on its own board).
11. **Seed:** not yet (step 6).

**ExUnit** for each behavior: S105, S108, S112, S115, S116, the plug 404s,
the `Authz` matrix (each area × member / other department's member /
manager / other department's manager / owner / device), `task_boards`
for `floater`, `splitRole`, `dualMgr`, `owner`, `noDept`, the events
backfill. Revert-check S115 and S112.

**Done when:** ExUnit green (full output kept), `--warnings-as-errors`
clean, migration up/down checked, and the brewery Playwright folder still
passes (the UI is unchanged; this proves the Brewery behaves the same).
`feat:` commits. **Reply with:** counts, SHAs, the scoped-lookup grep
result, the `Authz` rows added, the migration check, any flaky names, and
any `LEAD:`. Then stop.

## Task 3 answers (lead, before Task 4)

1. Keep `4e843b7`'s order (authorize, then find). The spec's S115 now uses
   `floater` (404) and notes `brewer1` gets 403; §3.4 says access is
   checked first. Update the S115 tests' wording to match if needed.
2. `task_boards` order: the departments' natural order, **Brewery,
   Taproom, Office, Sales** (by department id, which is the seed order),
   not alphabetical. Fix in Task 4.
3. `left_<key>` is fine; step 4's UI words it with the department name.

The lead is running the brewery Playwright folder on `4e843b7`.

## Task 4: plan step 4, per-department UI

**You're a fresh session.** Read the brief from the top ("Read first", your
limits), then Tasks 1–3 and "Task 3 answers" for what's done. Step 3
accepted (`31fe3ce`, `4e843b7`): the lead ran the brewery folder on it,
136/136. **Memory is tight on this machine:** run Playwright with
`--workers=1`, and don't run ExUnit and Playwright at the same time.

First, from "Task 3 answers": `task_boards` in department order
(Brewery, Taproom, Office, Sales, by id). ExUnit for it.

Spec §3.5; plan "UI" and step 4. Not the All departments view (step 5).

1. **Nav:** a top-level **Tasks** entry after Schedule, shown when
   `/api/me`'s `task_boards` isn't empty; Brewery → Tasks removed. The
   Tasks routes leave the Brewery-only route group.
2. **Routes:** `/tasks/:dept` for each board in `task_boards`; `/tasks`
   opens the remembered board (`rockcut.tasks.board`), else the first. A
   board the person can't open → their first board, or Home with none
   (S102, S109, S114). `/brewery/tasks` still redirects to
   `/tasks/brewery`, and from there to the person's own board if they
   can't open the Brewery's.
3. **The board takes its department** from the route: `boardPath(dept,
   …)` everywhere, query keys include the department (so switching boards
   never shows another board's cached data), and the optimistic writes
   target the right board.
4. **Switcher:** with two or more boards, the title is a picker
   ("<Department> tasks ▾", department colors); choosing one changes the URL
   and is remembered. Phone width: in the toolbar beside the calendar
   button. One board: plain title "<Department> tasks".
5. **Manager tools per board:** History and Edit Daily items from
   `task_boards[].manage`, not `breweryTasksManage`. Then remove
   `brewery_tasks_manage` from `/api/me` and `useAuth`.
6. **Daily card hidden** when the board has no Daily items; managers see
   **Set up Daily checks** in the ⋮ menu (it opens the Edit Daily items
   dialog) until the first item exists (S107).
7. **Copy:** "No one scheduled" (header), the assignee error with the
   department's name, History's "left the <Department>" for
   `left_<key>`, and any other "Brewery"/"brewer" wording on the board.
   The assignee list shows only the board's people (it comes from the
   API; check).
8. **Playwright:** a new `tests/regression/tasks/task-board-departments.spec.ts`
   in the `brewery-board` project (one worker; boards are shared):
   S101–S114 (S112 through Users & Roles as `owner` with a `[TEST-TEMP]`
   person, like D38's S49), and S115 for `floater` over HTTP. Drive them
   in a browser first (token injection, per the workflow), then write the
   spec. The brewery folder must still pass.

**Done when:** `tsc`, build, Vitest, lint (no new problems), ExUnit (once),
the new spec and the brewery folder (`--workers=1`) pass. `feat:` commits.
**Reply with:** counts, SHAs, a screenshot path for the switcher (desktop
and 412px), anything you couldn't drive, and any `LEAD:`. Then stop.

## Task 4 answers (lead)

Task 4 accepted (`592fdeb`, `1473777`, `1cf0dde`).
1. Owners stay out of the assignee list, as on D38's board (the API still
   accepts one). Spec S105 reworded.
2. A board whose items are all retired showing "Set up Daily checks" again
   is fine.

**Paused here** for a machine restart (Matt, 2026-10-13). Next is Task 5
(plan step 5, the All departments view); the lead writes it after the
restart.

## Task 5: plan step 5, the All departments view

**You're a fresh session** (the machine restarted). Read the brief from the
top ("Read first", your limits), then Tasks 1–4 and their answers for
what's done. Steps 1–4 are accepted; HEAD is `b3c3365`. The servers are
up (the lead's, as before). **Memory is tight:** Playwright with
`--workers=1`, and never ExUnit and Playwright at the same time. Before
your first browser pass, run `cd rockcut_api && mix rockcut.synthetic.setup`
(it clears `[TEST-TEMP] … Trivia` events left by the old spec leak).

Spec §3.6 and S118–S120; plan "Board query", "`/api/me`", "All
departments view". Nothing from step 6 (seed, COVERAGE.md, full gate).

**API**
1. `GET /api/boards/all/tasks?from=&to=`: owners only
   (`can?(user, :read, {:tasks, :all})`, a new `Authz` row; 403 for
   everyone else, devices included). Same 31-day limit and errors as a
   board. Route it so the `TaskBoard` plug still 404s `all` on **every
   other** board route (`/api/boards/all/tasks/history`, `POST
   /api/boards/all/tasks`, `daily_checks`, …): no write route under `all`.
2. **Shape:** a board's shape, built from the four boards in department
   order (Brewery, Taproom, Office, Sales):
   - each card carries `department` (the key);
   - each day carries the cards (ordered by department, then as each board
     orders them) and, instead of `header`/`daily`, a per-department Daily
     count for the departments that have Daily items
     (e.g. `daily: [%{department: "brewery", done: 3, total: 4}]`; pick a
     clear name and say it in your reply);
   - `unfinished` and `future` merged the same way, each card with its
     `department`.
   - No `header`. Reuse `board/4` per department rather than a second query
     path, unless that's clearly wasteful; say which.
3. **`/api/me`:** `task_boards` gets `%{key: "all", name: "All departments"}`
   **last**, owners only (no `color`; `manage: false`).
4. **ExUnit:** owner gets every department's cards, tagged, in order, with
   Daily counts only where a board has items; `breweryMgr`, `floater`,
   `noDept`, `taproomDevice` → 403; `all` 404 on every other route (the
   route matrix); the 31-day limit; `task_boards` with and without `all`.
   Revert-check the owner-only check.

**UI**
5. **Routes:** `/tasks/all` renders `AllBoard` for owners. A non-owner on
   `/tasks/all` goes to their first real board (or Home). "All
   departments" is the switcher's last entry, remembered in
   `rockcut.tasks.board` like a board. Everywhere else that walks
   `task_boards` (the nav, `/tasks`'s "first board", the redirect for
   boards you can't open) must treat `all` as not a board: the "first
   board" is never `all`.
6. **`AllBoard`:** reuses the board's day columns, range controls,
   1 week / 2 weeks, date range, Hide completed and the phone views
   (vertical and one day). Filter: All / Unassigned only; a remembered
   "My tasks" reads as All here (don't overwrite the stored value).
   - Each day: a section per department with something that day (its
     color and name, then its Daily count "Daily 3/4" if it has items, then
     its cards); a department with nothing that day is left out. No
     schedule header.
   - Unfinished and Future: one card each, grouped by department the same
     way.
   - **Read-only:** no checkbox, drag, + Add a task, Move all to today,
     task menu, or ⋮ manager tools. The cards still show what a board card
     shows (title, assignee, repeat mark, done state).
7. **Tapping a card** opens `/tasks/<dept>?day=<YYYY-MM-DD>` (the board's
   own URL). Add `?day=` to the board: the range moves to include that day
   (keep the 1 week / 2 weeks length; start it the way picking that date in
   the date range would), the day is scrolled into view (phone one-day:
   that day selected), and the `day` param is then dropped from the URL
   (replace). A card from Unfinished opens its board at today; one from
   Future opens the board with Future in view if that's easy, else today;
   say which.
8. **Vitest:** the switcher list with `all` (last, owners only) and the
   "first board" rule ignoring `all`; the grouping helper.
9. **Playwright:** S118–S120 in `tests/regression/tasks/task-board-departments.spec.ts`
   (same project, one worker). S118 needs Brewery + Taproom tasks today
   and an Office task tomorrow: create them as `[TEST-TEMP]` through the
   API in the test, and clean up. Assert Sales never appears, and that
   nothing on `/tasks/all` is draggable or tickable (S119). Drive it in a
   browser first, as in Task 4.

**Done when:** `tsc`, build, Vitest, lint (no new problems), ExUnit (once,
full output kept), the new tests and the `brewery-board` project
(`--workers=1`) pass. `feat:` commits. **Reply with:** counts, SHAs, the
`all` response shape (one trimmed example), screenshot paths for
`/tasks/all` at desktop and 412px, anything you couldn't drive, flaky
names, and any `LEAD:`. Then stop.

## Task 5 answers (lead)

Task 5 accepted (`e31e4f9`, `15b0711`). `daily_counts`, the `?day=future`
link and the shared `board_parts/3` are fine.

1. **Daily-only sections: yes** (Matt). A department with Daily items gets
   a section every day, even with no tasks that day, showing just its
   Daily count; one with neither is left out. Spec §3.6 and S118 updated
   (tomorrow shows Office **and** a Brewery section with only its Daily
   count). Change the `departmentSections` filter, its Vitest, and S118's
   Playwright assertions. Check the API already sends `daily_counts` for
   days with no cards (say if it doesn't, and fix it there).
2. **The `git stash list` slip:** noted, thanks for saying so.
3. **Housekeeping:** close your Playwright MCP browser when you're done
   driving (two `playwright-mcp` processes and a Chrome have been up 30+
   minutes; memory is tight).

**Done when:** Vitest, `tsc`, lint (no new problems), the
`task-board-departments` spec (`--workers=1`), and ExUnit if you touched
the API. One `feat:` or `fix:` commit. **Reply with:** counts, the SHA, a
fresh `/tasks/all` desktop screenshot showing a Daily-only section. Then
stop.

## Task 6: plan step 6, seed, coverage, local gate, handoff note

Task 5 and its answers accepted (`a553808`). Memory: 3.8 GB available now;
still one Playwright worker, and never ExUnit and Playwright at once.

Spec §3.7, plan "Seed", "Tests", "Handoff-note LIMITATIONS"; workflow §3
(the local gate).

1. **Seed** (`Seeds.Synthetic`, relative to today, like D38's Brewery seed):
   - **Taproom** (`bar`): `[SEED]` tasks, two assigned to `bartender1`, one
     unassigned, one open 2 days ago (shows in Unfinished), one on Future.
     Titles a taproom would use (e.g. "Clean lines", "Restock glassware").
   - **Office:** one `[SEED]` task. **Sales:** none.
   - **No Daily items** for Taproom, Office or Sales (DEV shows the
     hidden-card case). The Brewery's seed is unchanged.
   - `reset` and `cleanup_temp` cover every board: tasks, series, Daily
     items/checks and events of every department (`[SEED]` rebuilt,
     `[TEST-TEMP]` removed), not just the Brewery.
   - ExUnit for the seed: the counts per board, idempotent on a second run,
     `cleanup_temp` removing a `[TEST-TEMP]` Taproom task and series.
   - Run `mix rockcut.synthetic.setup` locally afterwards and check
     `/tasks/bar` and `/tasks/office` in a browser (as `bartender1` and
     `owner`); say what you saw.
   - Check no existing Playwright spec assumes the Taproom/Office boards are
     empty (S101's "no Daily card" still holds; S118 builds its own data).
2. **COVERAGE.md** (`rockcut-ui/tests/COVERAGE.md`): a D41 section mapping
   S101–S120 to tests (Playwright spec + test name, ExUnit file, or
   "manual on DEV"), the same style as D39's.
3. **Gate, everything but the full Playwright run:** ExUnit (full output
   kept), `mix compile --warnings-as-errors`, `tsc`, `vite build`, Vitest,
   lint (no new problems). Commit, then **stop and reply "LEAD: ready for
   the full Playwright run"** with the counts. The lead runs the full
   suite (all projects, `--workers=1`) in its own herdr tab, so it isn't
   reaped with your shells, and sends you any failures.
4. **Handoff note** `docs/current_work/prompts/d41_handoff_note.md` (the PR
   description), in D39's format (`d39_handoff_note.md`): deliverable,
   spec, plan, branch (cut from `develop` `e3548f3`), "SHA for DEV: filled
   in at push"; **What changed** (area / change / scenarios); **Migrations**
   (both, with the rollback checks from Tasks 1 and 3); **Tests** (counts;
   leave the full Playwright line as "_lead fills in_"); **LIMITATIONS to
   carry to DEV** (the plan's list, plus anything you found); decisions
   (Matt's and the lead's answers in this brief). Write it while the lead's
   run goes.

**Done when:** steps 1–4 committed (`feat:` for the seed, `docs:` for the
rest). **Reply with:** counts, SHAs, what you saw on the seeded boards, and
any `LEAD:`. Then stop.
