# D41: Department Task Boards — Plan

**Spec:** `specs/d41_department_task_boards_spec.md` (approved by Matt
2026-10-13; amends `specs/d38_brewery_task_board_spec.md`). Scenarios
S101–S120.
**Release:** D41 merges to `develop` after its DEV gate and waits. D38–D42
and D40 ship in one prod release after D40.
**Branch:** `d41-department-task-boards`, cut from `develop` (`e3548f3`).
**Task:** PortableMind 4237

## Approach

Two halves, in this order, and never mixed in one commit:

1. **A pure rename** (steps 1–2). `brewery_*` tables, `BreweryTasks`
   modules, `/api/brewery` routes and the UI's `pages/brewery/tasks` get
   their generic names, still for the Brewery only. **No behavior
   changes.** Proof: the whole D38/D39 ExUnit suite and the brewery
   Playwright folder pass with only names and paths edited, no changed
   assertions. This is the gate for the second half.
2. **Per-department behavior** (steps 3–6): the department comes from
   the route, `Authz` is keyed on it, the nav and switcher, the hidden Daily
   card, the All departments view, the seed.

Why: the rename touches about 65 files. If it lands alone and the old tests
pass unchanged, any later failure is from the new behavior, not the rename.

### The department on every call

- `RockcutApi.Tasks` functions take a `%Department{}` first
  (`Tasks.board(dept, from, to)`, `Tasks.create(dept, attrs, actor)`, …).
  The 9 calls of the hard-coded `department!/0` go away.
- The controllers resolve `:dept` from the path once (a plug,
  `RockcutApiWeb.Plugs.TaskBoard`): an assignable department by key, else
  404 (`other`, unknown keys). It assigns `conn.assigns.board`.
- **Every by-id lookup is scoped:** `Tasks.get(dept, id)` matches
  `department_id` too, so an id from another board is 404 (S115). Same for
  series, Daily items and checks.
- `Placement`, `Recurrence` and the drag layer don't change.

### `Authz`

- Areas `:tasks` and `:daily_items` with a department:
  `can?(user, :read | :write, {:tasks, dept})` → member of `dept` (any role)
  or owner; `can?(user, :history, {:tasks, dept})` and
  `can?(user, :manage, {:daily_items, dept})` → manager of `dept` or owner.
  `can?(user, :read, {:tasks, :all})` → owner.
- **Out of the `brewing` module:** the task areas stop depending on the
  Brewery module, so a Taproom-only person can use their board. The UI's
  `hasBrewery` gate no longer covers Tasks.
- `can_take_brewery_task?/1` → `can_take_task?(user, dept)`.
- D31's parity suite gets the new rows; the boundary test stays green.
- Devices: `DeviceGate` keeps refusing every `/api/boards/...` route
  (D40 opens it).

### Leaving a department

D38's `unassign_if_ineligible` runs per department: when someone's
membership in a department ends (memberships edit or deactivation), only
their open tasks **on that board** are unassigned, logged on that board.

## Changes

### API (`rockcut_api`)

- **Migrations** (new; D38/D39's are not edited, since local and DEV ran
  them):
  1. `…_rename_brewery_task_tables`: `rename table(:brewery_tasks), to:
     table(:tasks)`, and the same for `task_series`, `task_events`,
     `daily_items`, `daily_checks`. Recreate each table's indexes under
     the new names (drop the old-named ones), so names match the tables.
     SQLite updates the foreign keys that point at a renamed table.
  2. `…_add_department_id_to_task_events`: `department_id` (FK, nullable
     first), backfilled from the event's task where it still exists, else
     the Brewery (every event so far is the Brewery's), then an index on
     `(department_id, inserted_at)`.

  Both reversible. Up and down are checked on a copy of a DEV-shaped DB.
- **Modules:** `BreweryTasks` → `Tasks`; `BreweryTasks.{Task, TaskSeries,
  Series, Placement, DailyItem, DailyCheck, Event}` → `Tasks.*`. Schemas
  point at the new tables. Controllers `BreweryTaskController`,
  `BreweryDailyController`, `BreweryErrors` → `TaskBoardController`,
  `DailyController`, `TaskErrors`.
- **Router:** `/api/boards/:dept/...` for every current route, in the
  people-only scope with the `TaskBoard` plug. `GET
  /api/boards/all/tasks` (owners). `/api/brewery/...` removed. The route
  matrix lists every route.
- **Board query:** the header reads the board's department's published
  shifts and events (the code already filters on the Brewery's id; it takes
  the department instead). `board/4` for `all` merges the four
  departments' cards, each tagged with `department`, plus their Daily
  counts (no header).
- **History:** `list_events(dept, …)` filters on `task_events.department_id`.
- **`/api/me`:** `task_boards`: `[%{key, name, color, manage}]` in nav
  order for the boards the person can open, plus `%{key: "all", name:
  "All departments"}` for owners. `brewery_tasks_manage` removed.
- **Scheduler:** `Series.top_up/1` already walks every open series; check
  it doesn't filter on the Brewery.
- **Seed:** `[SEED]` Taproom tasks (relative to today: two for
  `bartender1`, one unassigned, one open 2 days ago, one on Future), one
  Office task. No Daily items for Taproom, Office or Sales. `reset` and
  `cleanup_temp` across every board.

### UI (`rockcut-ui`)

- **Move:** `pages/brewery/tasks/` → `pages/tasks/`, `lib/breweryTasks.ts`
  → `lib/tasks.ts` (and its test). API paths go through one
  `boardPath(dept, …)` helper.
- **Routes:** `/tasks/:dept` and `/tasks` (opens the remembered board, else
  the first of `task_boards`); `/brewery/tasks` → `/tasks/brewery`. A
  board the person can't open → their first board, or Home.
- **Nav:** top-level **Tasks** after Schedule when `task_boards` isn't
  empty; Brewery → Tasks removed.
- **Switcher:** the title becomes a picker with two or more boards
  (department colors; "All departments" last for owners), remembered in
  `rockcut.tasks.board`. In the phone toolbar beside the calendar button.
- **Storage keys:** `rockcut.breweryTasks.*` → `rockcut.tasks.*`, reading
  the old key once if the new one is missing.
- **Daily card hidden** with no items; "Set up Daily checks" for managers
  until the first item.
- **Copy:** "No one scheduled", "Only members of the Taproom can be
  assigned", the board title "<Department> tasks".
- **All departments view:** `AllBoard` reuses the board's day columns and
  phone views with read-only cards (no drag, no checkbox, no menu); a card
  links to `/tasks/<dept>?day=<date>`, which scrolls to that day. Department
  sections per day, Unfinished and Future grouped the same way.

## Tests

- **ExUnit:**
  - steps 1–2: the existing suites, renamed only;
  - `Authz` rows for each area × {member, other department's member,
    manager, other manager, owner, device};
  - each new behavior: cross-board id → 404 (S115), assignee limited to
    the board's department (S105), leaving one department unassigns only
    that board (S112), per-board History (S108), per-board top-up (S116),
    `all` (owners only, the merged shape), the events backfill;
  - the migration up/down on a copy of a DEV-shaped DB (in the PR note).
- **Vitest:** the storage-key fallback, `boardPath`, the switcher's list.
- **Playwright:** the brewery folder moves to `/tasks/brewery` (paths
  only, S117); new `task-board-departments` for S101–S114 and
  S118–S120, in the `brewery-board` project (one worker; the boards are
  shared).

## Order of work

1. **API rename** (migration 1, modules, controllers, routes under
   `/api/boards/brewery` only, the plug resolving just `brewery` for now).
   ExUnit green with names changed only. Migration up/down checked.
2. **UI rename** (files, `boardPath`, `/tasks/brewery`, the redirect, the
   storage-key fallback). Brewery Playwright folder green with paths
   changed only. **Checkpoint: the lead reviews the rename before step 3.**
3. **Per-department API:** the plug for every assignable department,
   `Authz` by department, scoped lookups, the assignee rule, leaving a
   department, migration 2 and per-board History, the header, `/api/me`'s
   `task_boards`. ExUnit for each.
4. **Per-department UI:** nav, `/tasks` routing, the switcher, the hidden
   Daily card and "Set up Daily checks", the copy. Drive S101–S114 as the
   personas, then write `task-board-departments`.
5. **All departments view** (API `all` + `AllBoard`), S118–S120.
6. **Seed**, COVERAGE.md, the local gate, the PR with the handoff note.

## Handoff-note LIMITATIONS to carry to DEV

- **The rename migrations on DEV's volume,** which holds real D38/D39 data
  (tasks, series, History): run at boot; check the row counts before and
  after, and that History still reads.
- **The installed PWA** on the Pixel: an old `/brewery/tasks` link (home
  screen, history) redirects; the remembered choices survive the key
  rename (the storage keys only exist in real browsers that used D38).
- **The switcher and the header against DEV's seeded schedule** for the
  Taproom (real shifts and events per department).
- **Personas in two departments** (`floater`, `splitRole`, `dualMgr`) and
  owners, across boards, with real latency.
- **The Taproom tablet** still gets 403 (D40 changes that).

## Risks

- **The rename is big.** Mitigated by the order above: rename alone, old
  tests unchanged, a lead checkpoint before behavior changes.
- **A leak between boards.** Every lookup goes through a
  department-scoped function, and the route matrix covers every route for
  members of other departments. A grep check in review: no `Repo.get(Task`
  without a department.
- **SQLite renames and index names.** Recreating indexes under the new
  names makes the migration longer, but the tables are small (DEV: hundreds
  of rows). Checked up and down on a copy.
- **History backfill:** events whose task was deleted have no task to read
  the department from; every event before D41 is the Brewery's, so they're
  backfilled to the Brewery.
