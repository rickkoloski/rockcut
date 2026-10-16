# D41: Department Task Boards — Spec (amends the D38 spec)

**Status:** COMPLETE, on prod in `v2026.10.14` (PR #20 merged 2026-10-14); approved by Matt 2026-10-13
**Amends:** `specs/d38_brewery_task_board_spec.md` (D38 board, D39 recurring
tasks). Everything there still holds unless this spec changes it; where the
D38 spec says "the Brewery", read "the board's department".
**Backlog:** PortableMind project 254, task 4237
**Order:** D39 (done) → **D41** → D42 (4260) → D40 (4213). D38–D42 and D40
ship to prod in one release after D40, so **no prod data moves**: prod has
none of these tables yet.

## 1. Problem

The task board (D38/D39) works only for the Brewery. The Taproom, Office
and Sales plan their work the same way (on paper, Trello or memory), and
D40's tablet, reminder and dashboard card should be built on the final
model, not on a Brewery-only one that gets generalized afterwards.

## 2. Decisions (Matt, 2026-10-12 and 2026-10-13)

1. **One board per department, never shared.** Every task belongs to
   exactly one department's board. A task can't be on two boards, and
   there's no combined view (2026-10-12).
2. **Boards for all four real departments:** Brewery, Taproom (`bar`),
   Office and Sales. "Other" (scheduling-only, not assignable) gets none.
3. **Members only.** A department's members read and write its board; its
   managers also get History and Edit Daily items; owners see and manage
   every board. Nobody else sees a board, in the nav or the API.
4. **A top-level Tasks entry** in the nav, near Schedule. It opens your
   department's board; someone in two or more departments (or an owner)
   gets a department switcher, remembered per browser. **Brewery → Tasks
   goes away** (its URL redirects).
5. **Every board gets repeating tasks and its own Daily items.** Each
   board's managers set up their own Daily items; the Daily card is hidden
   until the board has at least one item. Only the Brewery starts with
   items (its four). Daily item lists and ticks are per board.
6. **D40, shared tablets:** a department's shared tablet shows that
   department's board, with staff codes for writes. The Taproom tablet
   (D33) gets the Taproom board; the brewhouse tablet the Brewery board.
   Built in D40, not here.
7. **D40, shift-end reminder: Brewery only,** as the D38 spec has it.
8. **An All departments view for owners** (2026-10-13). Separate boards
   stay; owners also get a read-only overview of every board together,
   grouped by department within each day (§3.6). Considered and declined:
   one shared board with a department flag per task.

## 3. Requirements

### 3.1 Data (rename, plus one column)

The `brewery_*` names become generic. Prod has none of these tables, but
local and DEV have run D38/D39's migrations, so this is done with **new
rename migrations**, not edits to the old ones. All additive or renames,
reversible.

| Before (D38/D39) | After (D41) | Change |
|---|---|---|
| `brewery_tasks` | `tasks` | rename; `department_id` already exists |
| `brewery_task_series` | `task_series` | rename; `department_id` already exists |
| `brewery_task_events` | `task_events` | rename; **add `department_id`** (backfilled to the Brewery), indexed with `inserted_at` |
| `brewery_daily_items` | `daily_items` | rename; `department_id` already exists |
| `brewery_daily_checks` | `daily_checks` | rename; `department_id` already exists |

- Indexes and foreign keys are renamed with their tables where SQLite needs
  it. `brewery_tasks.series_id` etc. keep their meaning.
- The rule that a task's assignee must be able to take it (D38
  `can_take_brewery_task?`) becomes "an active member of the **task's**
  department, or an owner".
- Leaving a department unassigns that person's open tasks **on that
  department's board** (D38 S49, generalized). Leaving the Taproom doesn't
  touch their Brewery tasks.
- `task_series` occurrences are created on the series' department's board.

### 3.2 Modules and code

- `RockcutApi.BreweryTasks` → `RockcutApi.Tasks` (and `Tasks.Series`,
  `Tasks.Placement`, …). Every function takes the board's department; the
  hard-coded `department!/0` (key `brewery`) goes away.
- `Placement`, `Recurrence`, the drag layer and the board UI don't change
  behavior.
- The D22 scheduler's top-up runs over every department's series.
- The UI's `pages/brewery/tasks/` moves to `pages/tasks/`; `lib/breweryTasks.ts`
  → `lib/tasks.ts`. The `localStorage` keys (`rockcut.breweryTasks.*`)
  become `rockcut.tasks.*`; a reader falls back to the old key once so
  nobody loses their 1 week / Hide completed / phone view choice.

### 3.3 Who can do what (`Authz`)

| Action | Who |
|---|---|
| View a board; add, edit, complete, move, assign, delete its tasks; Move all to today; tick its Daily checks | members of **that** department (any role), owners. (D40: that department's shared tablet, with a staff code.) |
| Edit that board's Daily items; view its History | **that** department's managers, owners |

- `Authz.can?/3` areas `:tasks` and `:daily_items` take the department
  (`can?(user, :write, {:tasks, dept})`), replacing `:brewery_tasks` and
  `:brewery_daily_items`. Nothing checks owner or role directly (D31's
  boundary test still enforces it). D31's parity suite gets the new rows.
- **History is per board:** a manager sees only their departments' events;
  an owner sees each board's History from that board.
- Someone outside a department gets 403 on its board's routes; a typed URL
  to a board they can't see goes to their own board, or Home if they have
  none. `noDept` sees no Tasks entry.
- Devices: still 403 everywhere in D41 (D40 opens the tablet).

### 3.4 API

Routes move from `/api/brewery/...` to **`/api/boards/:dept/...`**, where
`:dept` is the department key (`brewery`, `bar`, `office`, `sales`):
`GET /api/boards/:dept/tasks`, `POST /api/boards/:dept/tasks`,
`PATCH /api/boards/:dept/tasks/:id`, … and the same for `daily_checks`,
`daily_items`, `tasks/history`, `tasks/:id/series`, `stop_repeating`,
`restore`. Same params, same errors.

- Access is checked first: someone who can't open the board gets 403 on
  every route, whatever the id. For someone who can, a task id from
  another board → 404 (never act on another board's task through this
  one).
- `other` or an unknown key → 404.
- `/api/me` replaces `brewery_tasks_manage` with **`task_boards`**: the
  boards this person can open, in department order (Brewery, Taproom,
  Office, Sales), each with `key`, `name`,
  `color` and `manage` (Daily items + History).
- The old `/api/brewery/...` routes are **removed**, not aliased: nothing
  outside the UI uses them, and prod never had them.

### 3.5 UI

- **Nav:** a top-level **Tasks** entry after Schedule, shown when
  `task_boards` isn't empty. Brewery → Tasks is removed.
- **URL:** `/tasks/:dept` (e.g. `/tasks/bar`). `/tasks` opens the
  remembered board, else the first in `task_boards`. `/brewery/tasks`
  redirects to `/tasks/brewery` (keeps bookmarks and the installed PWA's
  history working).
- **Switcher:** when `task_boards` has two or more boards, the page title
  becomes a department picker ("Brewery tasks ▾"), with each department's
  color. Choosing one changes the URL; the choice is remembered per
  browser (`rockcut.tasks.board`). At phone width it sits in the toolbar
  next to the calendar button. With one board, the title is plain text.
- **Day header:** the board's department's **published** shifts and its
  events (D32 events carry `department_id`), exactly as the Brewery header
  does today; "No one scheduled" replaces "No brewers scheduled".
- **Daily card:** hidden when the board has no Daily items. A manager sees
  "Set up Daily checks" in the board ⋮ menu instead of "Edit Daily items"
  until the first item exists.
- **Copy:** "brewer" wording becomes neutral ("No one scheduled", "Only
  members of the Taproom can be assigned").
- Everything else (range, filter, drag, Unfinished, Future, repeats, phone
  vertical view, back gesture) is unchanged per board.

### 3.6 All departments view (owners only, read-only)

- **Where:** the switcher's last entry for owners, "All departments", at
  `/tasks/all`. It's remembered like any board. Nobody else sees it, and
  the URL sends a non-owner to their own board.
- **Range and controls:** the same range, 1 week / 2 weeks, date range,
  filter (All / Unassigned; "Mine" is left out) and Hide completed as a
  board. Phone width uses the same vertical and one-day views.
- **Each day:** a small section per department (its color and name), in
  nav order, holding that department's cards for the day and its Daily
  count ("Daily 3/4"). A department with Daily items always has a section,
  even on a day with no tasks (just its Daily count); one with neither is
  left out (Matt, 2026-10-13).
  There's **no schedule header** in this view.
- **Unfinished and Future:** one card each, with the tasks grouped by
  department the same way.
- **Read-only:** no checkboxes, drag, + Add a task, Move all to today or
  task menu. Tapping a card opens it **on its own board** (that board's
  URL, scrolled to the day), where the owner can change it.
- **API:** `GET /api/boards/all/tasks?from=&to=` returns the same shape
  as a board, with each card carrying its `department` key; owners only
  (403 otherwise). The 31-day limit applies. No write routes under `all`.
  `/api/me`'s `task_boards` adds `{key: "all", name: "All departments"}`
  for owners.

### 3.7 Seed and test support

- `[SEED]` tasks for the Taproom board (relative to today, a couple
  assigned to `bartender1`, one open past, one on Future) and one for
  Office; Sales starts empty. Brewery's seed is unchanged.
- No Daily items for the non-Brewery boards (Decision 5), so DEV shows the
  hidden-card case; tests add `[TEST-TEMP]` items when they need one.
- `cleanup_temp` and `reset` cover every board.
- Playwright: the brewery specs keep running against `/tasks/brewery`; a
  new `task-board-departments` spec covers §4 below.

## 4. Scenarios

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S101 | `bartender1` | nav → **Tasks** | Taproom member only | Opens `/tasks/bar`, titled "Taproom tasks", no switcher. The header shows Taproom's published shifts. No Daily card (no items). |
| S102 | `bartender1` | typed `/tasks/brewery`; `GET /api/boards/brewery/tasks` | not Brewery | Goes to `/tasks/bar`. The API answers 403. |
| S103 | `floater` | Tasks → switcher | Taproom + Brewery member | Lists Taproom and Brewery. Switching to Brewery shows the Brewery board; reloading `/tasks` opens Brewery again (remembered). |
| S104 | `owner` | Tasks → switcher | no memberships | Lists all four boards; full access on each, including History and Edit Daily items. |
| S105 | `bartender1` | Taproom board → + Add a task, assign | | The assignee list has only Taproom members (owners aren't listed, as on D38's board, though the API accepts one). `brewer1` isn't offered; assigning `brewer1` through the API → 422. |
| S106 | `floater` | Brewery board → add "Keg Wash" weekly; Taproom board | | The series' occurrences are only on the Brewery board. The Taproom board doesn't show them. |
| S107 | `barMgr` | Taproom ⋮ → **Set up Daily checks** → add "Lines cleaned" | Taproom has no items | The Taproom Daily card appears with "Daily 0/1". The Brewery's card still has its four. |
| S108 | `barMgr` | Taproom ⋮ → History | after S105–S107 | Taproom events only; nothing from the Brewery board. |
| S109 | `breweryMgr` | typed `/tasks/bar` | Brewery manager, not Taproom | Goes to `/tasks/brewery`; `GET /api/boards/bar/tasks/history` → 403. |
| S110 | `splitRole` | Taproom board ⋮; Brewery board ⋮ | Taproom manager, Brewery employee | Taproom: History and Edit Daily items. Brewery: neither. |
| S111 | `dualMgr` | Tasks → switcher | Taproom + Office manager | Taproom and Office; manager tools on both. |
| S112 | `owner` | Users & Roles → remove `[TEST-TEMP]` person from the Taproom | assigned an open task on Taproom and one on Brewery | The Taproom task becomes unassigned; the Brewery one keeps them. |
| S113 | `brewer1` | an old bookmark `/brewery/tasks` | | Redirects to `/tasks/brewery`. The board's 1 week / Hide completed choices survive the key rename. |
| S114 | `noDept`, `taproomDevice` | nav; `GET /api/boards/bar/tasks` | | `noDept`: no Tasks entry, the URL goes Home, 403. The Taproom tablet: 403 (until D40). |
| S115 | `floater`; `brewer1` | `PATCH /api/boards/bar/tasks/<a Brewery task id>` | `floater`: member of both; `brewer1`: Brewery only | `floater`: 404 (the id isn't on that board), and the task is unchanged. `brewer1`: 403, as on every Taproom route (access is checked before the id, so ids on boards you can't open aren't revealed). |
| S116 | — | daily scan | a weekly series on Taproom and one on Brewery | Both top up 12 months ahead, each on its own board. |
| S118 | `owner` | Tasks → switcher → **All departments** | Brewery and Taproom tasks today, Office tomorrow, Sales none | `/tasks/all`. Today shows a Brewery section then a Taproom section, each with its Daily count (Taproom only if it has items); tomorrow shows Office, plus a Brewery section with only its Daily count; Sales never appears. No schedule header. |
| S119 | `owner` | All departments → tap a Taproom task | | Opens `/tasks/bar` at that day; the task can be changed there. Nothing on the All view is draggable or tickable. |
| S120 | `breweryMgr`, `floater` | typed `/tasks/all`; `GET /api/boards/all/tasks` | not owners | No All departments in the switcher; the URL goes to their own board; the API answers 403. |
| S117 | `brewer1` | Brewery board, every D38/D39 scenario | | Unchanged behavior: the D38/D39 Playwright specs pass against `/tasks/brewery` (path and names updated only). |

## 5. Out of scope

- D40's tablet, staff codes on boards, the reminder (Brewery only) and the
  dashboard card.
- A combined view for anyone but owners, changing tasks from the All
  departments view, moving a task between boards, or sharing a task across
  boards (Decisions 1 and 8).
- Boards for "Other".
- Copying Daily items or tasks between boards.
- D42's items (4260).

## 6. Risks

- **The rename touches every file of the feature.** Mitigation: the rename
  lands first as its own commits with **no behavior change**, and D38/D39's
  full ExUnit and Playwright suites must pass unchanged in assertions
  (paths and module names only) before any per-department behavior is
  added.
- **Authz keyed on a department** is where a leak would hide. Every route ×
  {member, other department's member, manager, other manager, owner,
  device} goes in the route matrix test.
- **SQLite renames:** check the migrations up and down on a copy of the
  DEV-shaped DB, as D38 and D39 did.
