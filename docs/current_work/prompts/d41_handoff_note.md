# D41 handoff note (PR description)

**Deliverable:** D41, department task boards (PortableMind task 4237). The
D38 board, generalized: one board per assignable department, plus a
read-only All departments view for owners. Follows D39; D42 (4260) and D40
(brewhouse tablet, 4213) come next. D38, D39, D41, D42 and D40 ship to prod
in one release after D40, so **no prod data moves** (prod has none of these
tables).
**Spec:** `docs/current_work/specs/d41_department_task_boards_spec.md`
(approved by Matt 2026-10-13; amends `specs/d38_brewery_task_board_spec.md`);
scenarios S101–S120
**Plan:** `docs/current_work/planning/d41_department_task_boards_plan.md`
**Branch:** `d41-department-task-boards`, cut from `develop` (`e3548f3`).
**SHA for DEV:** _filled in at push_

## What changed

Scenario → test for every row is in `rockcut-ui/tests/COVERAGE.md` (D41
section). S116 (the top-up per board) is ExUnit only.

| Area | Change | Scenarios |
|---|---|---|
| **Rename (no behavior change)** | Tables `brewery_tasks`, `brewery_task_series`, `brewery_task_events`, `brewery_daily_items`, `brewery_daily_checks` → `tasks`, `task_series`, `task_events`, `daily_items`, `daily_checks` (indexes recreated under the new names). `RockcutApi.BreweryTasks(.*)` → `RockcutApi.Tasks(.*)`; controllers `TaskBoardController`, `DailyController`, `TaskErrors`. UI `pages/brewery/tasks/` → `pages/tasks/`, `lib/breweryTasks.ts` → `lib/tasks.ts`. Landed first, alone, with the D38/D39 ExUnit suite and brewery Playwright folder passing on names and paths only | S117 |
| **Routes** | `/api/brewery/...` → `/api/boards/:dept/...` (same verbs, params and errors) for `brewery`, `bar`, `office`, `sales`; `other` and unknown keys 404 (`Plugs.TaskBoard`). The old routes are removed, not aliased. The board scope no longer goes through the Brewery module pipeline | S102, S114 |
| **One board per department** | Every `Tasks` function takes the board's `%Department{}` (`department!/0` is gone). Lookups by id match the department: someone who can open both boards gets 404 for another board's id, and nothing changes. Access is checked first, so someone outside a department gets 403 on every route of its board, whatever the id | S106, S115 |
| **`Authz`** | `{:tasks, dept}` (`:read`/`:write` for members, `:history` for managers) and `{:daily_items, dept}` (`:manage`) replace `:brewery_tasks` / `:brewery_daily_items`; `can_take_task?(user, dept)` replaces `can_take_brewery_task?/1`. `{:tasks, :all}`: owners only. D31 parity rows for every persona × board and the All view; the boundary test stays green. Devices: still 403 on every board route (D40 opens the tablet) | S102, S104, S109, S110, S114, S120 |
| **Assignees and leaving** | The assignee must be an active member of the board's department or an owner (owners aren't listed in the picker, as on D38's board, but the API accepts one). Leaving a department unassigns open tasks and series **on that board only**, logged there (`left_<key>`; History reads "left the Taproom") | S105, S112 |
| **History** | `task_events.department_id` (migration 2); every event writes it; History is per board | S108 |
| **Header** | The board's department's published shifts and events; "No one scheduled" | S101 |
| **`/api/me`** | `task_boards`: `key`, `name`, `color`, `manage`, in department order (Brewery, Taproom, Office, Sales); owners get all four plus `{key: "all", name: "All departments", manage: false}` last. `brewery_tasks_manage` removed | S103, S104, S111 |
| **Nav and switcher** | Top-level **Tasks** after Schedule when the person has a board; Brewery → Tasks removed. `/tasks/:dept`; `/tasks` opens the remembered board (`rockcut.tasks.board`), else the first; a board the person can't open → their first, or Home with none. `/brewery/tasks` redirects to `/tasks/brewery` with its range. With two or more boards the title is a picker ("Taproom tasks ▾", department colors), beside the calendar button at phone width | S101–S103, S109, S113, S114 |
| **Per-board tools** | History and Edit Daily items from `task_boards[].manage`. The Daily card is hidden while the board has no Daily items; a manager's ⋮ menu then says **Set up Daily checks** (again if every item is retired). The assignee error names the department ("Only members of the Taproom can be assigned") | S107, S110 |
| **Storage keys** | `rockcut.breweryTasks.*` → `rockcut.tasks.*`; a reader falls back to the old key once and writes the new one, so 1 week / Hide completed / phone view survive | S113 |
| **All departments view** | `GET /api/boards/all/tasks?from=&to=` (owners; 403 otherwise, devices included; 31-day limit; every other route under `all` is 404, so no writes): a board's shape built from each board's own parts (`board_parts/3`, no header), cards tagged with `department` in department order, `daily_counts` per day in place of `daily`. `/tasks/all` (`AllBoard`): the board's range, 1 week / 2 weeks, date range, filter (All / Unassigned), Hide completed and phone views; each day a section per department (color, name, "Daily 3/4", cards). A department with Daily items has a section every day, even with no tasks; one with neither is left out. Unfinished and Future grouped the same way. Read-only: no checkbox, drag, Add, Move all to today, task menu or manager tools. A card opens its board at `/tasks/<dept>?day=<date>` (Unfinished → today, Future → `?day=future`), which moves the range to hold the day, scrolls to it (phone one-day: selects it) and drops the param. The board and `AllBoard` share `useBoardView` and `BoardLayout` | S118–S120 |
| **Top-up** | `Series.top_up/1` covers every department's series, each on its own board | S116 |
| **Seed** | `[SEED]` Taproom tasks (two for `bartender1`, one unassigned, one open 2 days ago, one on Future) and one Office task; Sales empty; Daily items only on the Brewery (DEV shows the hidden-card case). Tagged tasks, series and Daily items go from every board; `reset` also deletes the other boards' Daily items. Task History rows stay, as D38/D39 | — |

## Migrations

| Migration | Change | Reversible |
|---|---|---|
| `20261016120001_rename_brewery_task_tables` | Renames the five `brewery_*` tables; drops and recreates their 10 indexes under the new tables' names (unique: `tasks (series_id, series_date)`, `daily_checks (on_date, daily_item_id)`). SQLite moves the foreign keys pointing at renamed tables (`tasks.series_id`, `task_series.continues_series_id`, `daily_checks.daily_item_id`) | Yes (`up`/`down`) |
| `20261016120002_add_department_id_to_task_events` | `task_events.department_id` (FK, nilify, nullable), backfilled from the event's task where it still exists, else the Brewery (every event before D41 is the Brewery's); index `(department_id, inserted_at)` | Yes (`up`/`down`) |

**Rollback checked** on scratch copies of the local dev DB (read-only
`VACUUM INTO` through Exqlite; the real DB untouched):

- Migration 1 (Task 1): up, down, up; row counts per table equal before and
  after, and the index list matched. _Lead: numbers and index list from the
  Task 1 reply._
- Migration 2 (Task 3): up, down; the column and index come and go, every
  event backfilled. _Lead: numbers from the Task 3 reply._

## New routes, dependencies and secrets

- **Routes:** every `/api/brewery/...` route moved to
  `/api/boards/:dept/...` (18 routes, people only, in the route matrix).
  New: `GET /api/boards/all/tasks` (owners).
- **`/api/me`:** `task_boards` added, `brewery_tasks_manage` removed.
- **No new dependencies, secrets or config.**

## Tests

- **ExUnit (full): 1,366 tests, 0 failures** (2026-10-13, Task 6, at
  `175aa20`). `mix compile --warnings-as-errors` clean.
- **Vitest: 85 passed.** `tsc` and `vite build` clean.
- **Lint:** 27 problems (26 errors, 1 warning), all pre-existing; none new.
- **Full Playwright, every project (`--workers=1`):** _lead fills in_
- During the build: `brewery-board` project 136/136 (Task 5, with S118–S120);
  `task-board-departments` 21/21 after the Daily-only change.
- Revert-checked: S112 and S115 (Task 3), and the All view's owner-only
  check (11 tests fail with it replaced by `:ok`, 0 with it restored).

## DEV must exercise

- **The rename migrations at boot on DEV's volume,** which holds real
  D38/D39 data (tasks, series, History): row counts before and after, and
  that the Brewery board and its History still read the same.
- **The installed PWA** on the Pixel: an old `/brewery/tasks` link (home
  screen, history) redirects; the remembered 1 week / Hide completed / phone
  view survive the key rename (those keys exist only in real browsers that
  used D38).
- **The switcher and header against DEV's seeded schedule** for the
  Taproom (real shifts and events per department).
- **Personas in two departments** (`floater`, `splitRole`, `dualMgr`) and
  owners, across boards, with real latency.
- **The All departments view** as `owner` on DEV's data: sections per day,
  Daily counts, a card opening its board at the day; at phone width on the
  Pixel (vertical and one-day).
- **The Taproom tablet** still gets 403 (D40 changes that).

## Decisions (Matt and the lead, during the build)

- **Access before the id** (Task 3, D38 S39): someone who can't open a
  board gets 403 on every route; 404 for another board's id applies to
  someone who can open both. S115 reworded.
- **`task_boards` in department order** (Brewery, Taproom, Office, Sales,
  by id), not alphabetical.
- **`left_<key>`** in History; the UI words it with the department's name.
- **Owners aren't listed as assignees** (as D38's board); the API accepts
  one. S105 reworded.
- **A board whose Daily items are all retired** shows "Set up Daily checks"
  again.
- **All departments:** `daily_counts`; `?day=future` for a Future card; one
  query path (`board_parts/3`).
- **Daily-only sections** (Matt): a department with Daily items has a
  section every day, even with no tasks; one with neither is left out.
  Spec §3.6 and S118 updated.
- **The plug's 404 tests** came in step 3, when it opened to every
  department.
- **Seed cleanup:** "events" in `reset` / `cleanup_temp` means schedule
  events; task History rows stay, as D38/D39.

## LIMITATIONS

- **Migrations only checked on local copies,** not on a DEV-shaped volume:
  DEV's run at boot is the real check.
- **No Daily items on the other boards in the seed,** so DEV shows the
  hidden-card case; a board with items is only seen through a test's
  `[TEST-TEMP]` item (S107) or by adding one.
- **The All view's 9-column wide layout** wasn't driven in a browser (the
  builder's window showed the stacked layout); it is the shared
  `BoardLayout` the brewery specs cover.
- **The board's filter isn't remembered** (it never was), so "My tasks" on
  a board doesn't carry into the All view; nothing to keep there.
- **Phone gestures on the All view** (scrolling, the one-day strip) were
  emulated at 412 px only; the Pixel checks them on DEV.
