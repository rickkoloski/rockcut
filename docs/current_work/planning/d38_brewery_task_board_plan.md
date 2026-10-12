# D38: Brewery Task Board — Plan

**Spec:** `specs/d38_brewery_task_board_spec.md` (approved 2026-10-11). D38 is
the first of three deliverables from that spec. Its "Delivery split" section
says what's in D38; D39 (recurring tasks) and D40 (tablet, reminder,
dashboard) get their own plans.
**Release:** D38 merges to `develop` after its DEV gate and doesn't go to
prod on its own. The board ships with D39 and D40 in one release (Matt,
2026-10-11), so the brewhouse tablet is there from the start.
**Branch:** `d38-brewery-task-board`
**Task:** PortableMind 4211

## Approach

The work comes in four layers. Each builds on the one before and lands as
its own commit (or a few):

1. **Data and rules (API):** the tables, a pure **placement** function that
   decides what shows on each day, the `BreweryTasks` context and the
   `Authz` rules.
2. **The board read model and routes:** one `GET` that returns the whole
   range, plus the write routes.
3. **The shared drag layer (UI):** `src/components/dnd/`, on `@dnd-kit`,
   with nothing Brewery-specific in it.
4. **The board page:** layout, tasks, task menu, dialogs, the Unfinished
   card, the Future list, the Daily card and History.

**One function decides what shows on a day** (spec §7, rule 2).
`BreweryTasks.Placement.cards(tasks, days, today)` is pure. It takes the
tasks and returns cards keyed `{task_id, day}` (or `{task_id, :future}`):

| Task | Cards |
|---|---|
| open, `due_on` = D | one on D |
| open, no `due_on` | one on Future |
| done, `completed_display` = `planned_day` | one on `due_on`, in place |
| done, `completed_display` = `completed_day` | one on `completed_on`, after that day's own tasks, by `completed_at` |
| done, `completed_display` = `both` | one on each day; **both** locked (S8b) |
| done from Future | one on `completed_on`, tagged "from Future" |

The board `GET`, the Unfinished card query and (in D40) the dashboard card
and reminder all go through it. Nothing else filters on `due_on`. Each card
carries `locked: true` when it can't be dragged (the copy on the finished
day, and both copies of a "both" task), and the UI uses `task_id + day` as
its React key.

**Ordering:** `position` is a dense integer per list (one day, or the Future
list).
- A move removes the task from its old list, inserts it before `before_id`
  in the new one (or last, if `before_id` is missing or no longer in that
  list) and renumbers both lists, all in one `Repo.transaction`.
- SQLite runs with a single connection (D32 G1), so the transaction is the
  serialization point. Two brewers moving the same task at once both
  succeed, and the last one wins (S16).
- Lists are short (a day has maybe 10 tasks), so renumbering costs nothing.
  No fractional ranks.

**"Today"** is the Colorado date: `BreweryTasks.today/0` =
`DateTime.now!(Recurrence.zone()) |> DateTime.to_date()`. Every context
function that needs today takes it as an optional argument, so tests can
pin it (S51, and the 11:30 pm case) without mocking the clock.

**Change log: its own table, not `audit_log`.**
- `audit_log.target_id` is a foreign key to `users`, so it can't point at a
  task, and History has to filter by task.
- So D38 follows D37: a `brewery_task_events` table, written in the same
  transaction as each change, with `actor_id` and a nullable `device_id`
  (unused until D40).
- Matt approved this (2026-10-11), and spec §3.1 now names the table.

**Routes are people-only in D38.** Everything goes in a new
`[:api, :authenticated, :brewery]` scope, so `DeviceGate` refuses every
device (S41) without any `Authz.Device` rule. D40 moves the write routes to
`:device_allowed` when it adds the tablet and staff codes.

## Changes

### API (`rockcut_api`)

**Migrations (3, additive):**
1. `brewery_tasks`:
   - `department_id` (FK, not null);
   - `title`, `notes`;
   - `due_on` (date, null = Future), `position` (integer);
   - `assignee_id` (FK users, `on_delete: :nilify_all`);
   - `completed_at`, `completed_by_id` (FK, nilify), `completed_on` (date),
     `completed_display`;
   - `created_by_id` (FK, nilify), timestamps.

   Indexes: `(department_id, due_on, position)`, `(department_id,
   completed_on)` and `assignee_id`. The `series_*` columns come in D39.
2. `brewery_daily_items` (`department_id`, `name`, `position`, `active`,
   timestamps) and `brewery_daily_checks` (`department_id`, `on_date`,
   `daily_item_id` (FK, `on_delete: :delete_all`), `completed_by_id`,
   `completed_at`; unique `(on_date, daily_item_id)`).
   - The migration inserts Backups, Gravities, Temps and Pressures for the
     Brewery department, looked up by key. If the department doesn't exist
     (a fresh test DB), the migration inserts nothing, and `seeds.exs` and
     the test factory add them.
   - `brewery_daily_items.inserted_at` is what decides whether a new item
     counts on a past day (spec §3.6).
3. `brewery_task_events`: `task_id` (integer, no FK, because deleted tasks
   keep their history), `action`, `actor_id`, `device_id` (null),
   `title` (a copy, so a deleted task's history still reads), `detail`
   (map: old → new values), `inserted_at`. Index on `inserted_at` and
   `task_id`.

**`RockcutApi.BreweryTasks`** (new) and schemas `Task`, `DailyItem`,
`DailyCheck`, `Event`:
- `board(from, to, today \\ today())`: the read model for the `GET`:
  - every day in the range with its cards (through `Placement`), header and
    Daily card;
  - the Unfinished list: open tasks with `due_on < today`, oldest first;
  - the Future list;
  - assignee and completer names, preloaded once.
- `create(attrs, actor)`: bottom of the day, or of Future.
- `update(task, attrs, actor)`: title, notes, assignee and day. Changing
  the day here is a move to the bottom of that day.
- `move(task, due_on, before_id, actor)` and `move_overdue_to_today(actor,
  today)`: the latter appends to today oldest day first, keeps each day's
  order, and writes one `moved` event per task (S20).
- `complete(task, display, actor, today)`:
  - `display` is required when `due_on` is a date other than today
    (`{:error, :display_required}`), ignored on its own day, and forced to
    `completed_day` for a Future task;
  - a task that's already done → no-op, returns it unchanged. Two people
    ticking at once mustn't log twice.
- `uncomplete(task, actor)`: clears all four completion fields. A Future
  task goes back to the bottom of the Future list.
- `delete(task, actor)`.
- `tick(on_date, item, actor, today)` / `untick(…)`: a future date →
  `{:error, :future_day}`. Ticking twice is a no-op (upsert on the unique
  pair).
- Daily items: `list_items/0`, `create_item/2`, `rename_item/3`,
  `retire_item/2`, `order_items/2`. At most 12 active; names are unique
  among active items, ignoring case.
- `list_events(task_id \\ nil, page)` for History.
- `unassign_if_ineligible(user_id, actor)`: called inside the existing
  transactions in `Accounts.update_user` and `Accounts.set_memberships`,
  next to `StaffCodes.clear_if_ineligible` (S49). It clears the assignee on
  **open** tasks only and logs `unassigned` with `detail.reason =
  "left_brewery"`.

**The header** (inside `board/3`):
- Published Brewery shifts: `Shift` joined to `Position` with the Brewery
  department, `status == "published"`, `starts_at` within the Colorado day
  bounds (reuse `Scheduling`'s `local_midnight/2`; make it public, or move
  it to `Recurrence` beside `local_to_utc/2`; it's a private `defp` in
  `scheduling.ex` today).
- Grouped per person and per day, ordered by `users.schedule_order` then
  name (the roster order, `Accounts.list_roster/0`). Open shifts last.
- Published Brewery `schedule_events` overlapping each day, through the
  existing `list_events` filters. D32 already writes recurring events as
  rows, so nothing is expanded here.
- One query per kind for the whole range, then grouped in Elixir. No query
  per day.

**`Authz`** (all decisions here; `authz_boundary_test` enforces it):
- `can?(user, action, :brewery_tasks)` for `:read`, `:write` →
  `member_of?(user, "brewery")`. Owners pass the existing owner clause.
- `can?(user, :history, :brewery_tasks)` and `can?(user, :manage,
  :brewery_daily_items)` → `role_in(user, "brewery") == :manager`.
- Assignee check: `BreweryTasks` validates that the assignee is an active
  person and `Authz.member_of?(assignee, "brewery")`.
- `authz_test.exs`: the matrix for `brewer1`, `breweryMgr`, `floater`,
  `bartender1`, `owner`. The parity suite is unchanged (new areas only).

**Controllers and router:**
- **`BreweryTaskController`**: `index` (the board), `create`, `update`,
  `move`, `move_overdue_to_today`, `complete`, `uncomplete`, `delete`,
  `history`.
- **`BreweryDailyController`**: `tick`, `untick`, `items`, `create_item`,
  `update_item`, `order_items`.
- Validation errors as house style (`FallbackController`). `display_required`
  and `future_day` are 422 with a code, like D37's errors.
- `GET` validates the range (`from ≤ to`, at most 31 days) → 422
  `range_too_long`.
- **`device_route_matrix_test.exs`:** classify every new route as
  people-only.
- **`/api/me`:** a top-level `brewery_tasks_manage` flag
  (`Authz.can?(user, :history, :brewery_tasks)`), beside D37's flags,
  outside the pinned `capabilities` keys.

**Synthetic seed (`seeds/synthetic.ex`):**
- `[SEED]` tasks relative to today across the next two weeks:
  - vessel-style titles ("Filter FV2 > FV3", "Package FV6");
  - some assigned, some done (one of each `completed_display`);
  - two open on past days, for the Unfinished card;
  - two on the Future list.
- Daily checks: yesterday 3/4 and today 1/4.
- One published all-day Brewery event this week. The scenario already has
  Brewery shifts for `brewer1`.
- `cleanup_temp/0` deletes `brewery_tasks` titled `[TEST-TEMP]%` and
  `brewery_daily_items` named `[TEST-TEMP]%`. Events are left alone, as in
  D37.
- `reset/0` deletes `[SEED]` tasks and every daily check, then restores
  the four default items.

### UI (`rockcut-ui`)

**Dependency:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`,
exact versions, committed `pnpm-lock.yaml`.

**The shared drag layer, `src/components/dnd/`:**
- `SortableLists.tsx`:
  - props: `containers: { id, itemIds }[]`, `renderItem`,
    `renderContainer`, `onMove({ itemId, fromContainer, toContainer,
    beforeId })`, `isLocked(itemId)`;
  - sensors: `PointerSensor` with an 8px distance (mouse), `TouchSensor`
    with a 250ms delay and 5px tolerance (long press), `KeyboardSensor` with
    `sortableKeyboardCoordinates`;
  - `DragOverlay` for the lifted copy; auto-scroll on;
  - announcements for screen readers, written in plain words
    ("Picked up Package FV6. Mon 10/12, position 2 of 5.").
- `DropTarget.tsx`: a plain drop zone that reports the dropped item id.
- `moveModel.ts`: pure functions. `applyMove(containers, move)` returns the
  new containers; `beforeIdAt(container, index)` gives the id the server
  needs. Both the optimistic update and the rollback use them.
- No imports from `pages/` or anything Brewery-specific. A lint rule
  (`no-restricted-imports` scoped to `components/dnd/`) keeps it that way.

**Unit tests for `moveModel.ts`:** the repo has no unit test runner. The
plan adds **Vitest** as a dev dependency (no runtime or bundle effect) with
one `pnpm test:unit` script, for the pure move logic only (Matt approved,
2026-10-11). Keyboard and
pointer behavior is covered in Playwright on the board itself
(`ComponentShowcase.tsx` has no route, and a dev-only demo route wouldn't
exist in the DEV build).

**Nav and routes:**
- `BREWERY_PAGES`: add "Tasks" → `/brewery/tasks`, after Dashboard.
- `App.tsx`: the route goes in the `hasBrewery` block. The device block is
  untouched until D40.

**`src/pages/brewery/tasks/`:**
- `TaskBoard.tsx`: the page.
  - **Range state** lives in the URL (`?from=&to=`). With no params it's
    today plus the default span.
  - **Remembered per browser:** the span and Hide completed, in
    `localStorage` under `rockcut.breweryTasks.*`, every read and write
    wrapped in try/catch, with defaults when it's unavailable.
  - **Data:** `useApiQuery(['brewery-tasks', from, to])` with
    `refetchInterval: 60_000` and `refetchOnWindowFocus`.
  - **Writes:** optimistic `setQueryData` through `moveModel`, rolled back
    with an error toast on failure. Every write invalidates the board query
    when it settles.
- `BoardToolbar.tsx`: Previous / Today / Next, the 1 week / 2 weeks toggle,
  the date range selector (MUI date fields; 31-day check), the filter, Hide
  completed, and the ⋮ menu (History, Edit Daily items for managers).
- `DayColumn.tsx`: title and open count, `DayHeader`, `DailyCard`, the
  task list, "+ Add a task". Today highlighted; past open tasks with the
  amber edge.
- `DayHeader.tsx`: shift lines, open shifts, events, "No brewers
  scheduled". Formatting through `lib/datetime.ts` (`formatTimeRange`,
  `formatHoursShort`).
- `TaskCard.tsx`: checkbox, title, initials, notes icon, tags ("planned Mon
  10/12", "done Wed 10/14", "from Future"). A click opens the menu, and so
  does Enter on a focused card.
- `TaskMenu.tsx`: a `Menu` on wider screens and a bottom `Drawer` at phone
  width, with the actions in spec §3.8. Locked cards grey out Change day and
  Move up/down.
- `TaskDialog.tsx` (add/edit, on `FormDialog`): title, notes, assignee
  (Brewery members, from the roster), Day or No day (Future), Delete.
  "Add notes" opens it focused on Notes.
- `FinishElsewhereDialog.tsx`: the three choices with nothing preselected,
  and Cancel.
- `ChangeDayDialog.tsx`: a date picker plus **Move to Future**.
- `UnfinishedCard.tsx` and `FutureList.tsx`: containers in the same
  `SortableLists` as the days, so a drag between any of them is one
  `onMove`.
- `DailyCard.tsx`: collapsed or expanded, counts, amber past days, disabled
  future days.
- `DailyItemsDialog.tsx`: add, rename, retire (confirm), reorder through
  `SortableLists` with one container.
- `TaskHistory.tsx`: a paged newest-first list, filterable to one task from
  its dialog.
- **Phone width** (`useMediaQuery`): one day at a time, a day strip with
  counts ending in a Future stop, swipe and arrows, the range controls behind
  a calendar button. No cross-day drag; Change day… does it.
- **Layout at desktop and tablet widths:** a CSS grid of seven day columns
  per row, with Unfinished and Future as side columns spanning all rows.
  Below about 1280px they move above and below the days.
- `lib/types.ts`: `BoardDay`, `TaskCardData`, `DailyCardData`,
  `DailyItem`, `TaskEvent`, and the new `/api/me` flag.
- `data-testid` on every control above, in the same commits.

## Tests

**ExUnit:**
- `brewery_tasks/placement_test.exs` (pure): every row of the placement
  table; a "both" task gives two cards with one locked; ordering of
  finished-elsewhere cards after a day's own tasks.
- `brewery_tasks_test.exs`:
  - create at the bottom of a day and of Future;
  - move within a day, across days, onto and off Future, with a stale
    `before_id` (lands last), to a past day;
  - `move_overdue_to_today` order and its events;
  - complete with each display; `display_required`; a Future completion;
    uncomplete putting things back; double complete is a no-op;
  - delete keeps the history;
  - concurrent moves of one task (two `Task`s) → both succeed, both lists
    dense;
  - `today` pinned at 11:30 pm Colorado (S51).
- `brewery_daily_test.exs`: tick and untick; future day refused; the
  12-item cap and duplicate names; retire keeps past ticks; which items a
  past day counts.
- `brewery_task_board_test.exs`: the header (published only, Brewery only,
  roster order, open shifts, two shifts on one line with total hours,
  events, "no brewers"); the Unfinished list ignoring the range; the range
  limit.
- `accounts_test.exs`: removing someone from the Brewery unassigns open
  tasks only (S49).
- Controller tests: every route as `brewer1`, `breweryMgr`, `owner`,
  `bartender1` (403) and a device (403); the route matrix; the `/api/me`
  flag.

**Vitest:** `components/dnd/moveModel.test.ts`.

**Playwright** (`tests/regression/brewery/`, one file per scenario group):

| File | Scenarios |
|---|---|
| `task-board-drag.spec.ts` | S12–S14, and the drag layer through the board: mouse and keyboard moves within and across days, Escape, and a rejected move (the move route forced to 500 with `page.route`) snapping back with a toast |
| `task-board-header.spec.ts` | S1–S5 |
| `task-board-tasks.spec.ts` | S6–S9b, S9d, S9f, S16 (two browser contexts), S17 |
| `task-board-finish-elsewhere.spec.ts` | S8a–S8g, S9c |
| `task-board-range.spec.ts` | S18–S23b |
| `task-board-future.spec.ts` | S23c–S23j |
| `task-board-daily.spec.ts` | S24–S31 |
| `task-board-access.spec.ts` | S10, S11, S38–S41 (negative personas included) |

- S15 runs the phone-width layout in Playwright with a phone viewport.
  The touch drag in S9e and S15 is **manual** on the Pixel during the DEV
  pass.
- S49 and S51 are ExUnit-only.
- Dates are relative to today, never hard-coded.
- Persist-verify every write (act, reload, assert); no `waitForTimeout`;
  tasks a spec creates are `[TEST-TEMP] …` and deleted in `afterEach`.
- `tests/COVERAGE.md`: a D38 section mapping S1–S51 (the D38 rows) to
  their layer.

## Order of work

1. Migrations, schemas, `Placement` and its tests, `Authz` rules and tests.
2. `BreweryTasks` context (tasks, then Daily) with ExUnit.
3. `board/3` with the header, controllers, router, route matrix, `/api/me`
   flag, the membership hook. Check the `GET` by hand against the seed.
4. Synthetic seed additions. It's needed before the UI can show anything
   real.
5. `@dnd-kit`, `components/dnd/` and Vitest. Try it early in a bare
   two-list page component, mounted temporarily, to settle sensors and
   auto-scroll before the board depends on it; remove it before the PR.
6. The board page in desktop layout: range, header, tasks, task menu,
   dialogs, Unfinished, Future, filter, Hide completed. Drive S1–S23j as the
   personas in a browser, then write those specs.
7. The Daily card and the Daily items dialog. Drive S24–S31, then the spec.
8. History. Drive S10–S11 and S38–S41, then the access spec.
9. Phone width. Check at 360px in a browser and on the Pixel against the
   local server if reachable.
10. COVERAGE.md, then the local gate (workflow §3) and a PR to `develop`
    with the handoff note.

## Handoff-note LIMITATIONS to carry to DEV

- **Touch drag** (long press vs. scroll vs. tap) is only checked by hand,
  and only on real Android hardware: the Pixel, and a Samsung tablet if one
  is available. Matt chose (2026-10-11) to do the phone-width checks (S9e,
  S15) at the DEV gate, as `brewer1` on the Pixel:
  1. A quick tap opens the bottom sheet; a long press (about ¼ s) lifts the
     card instead, and the sheet doesn't open.
  2. A long-press drag reorders within the day. Drifting sideways doesn't
     change the day or move the card out of it.
  3. A sideways swipe changes day, including one that starts on a card,
     and doesn't lift the card.
  4. Scrolling up and down a long day, starting on a card, only scrolls.
  5. A sideways swipe on the day strip scrolls the strip; tapping a stop
     selects it.
  6. Android's edge back gesture doesn't also change the day.
  7. Change day… and Move to Future in the sheet, and the calendar
     button's native date pickers.
- **`@dnd-kit` in the release build and the PWA bundle.** After the DEV
  deploy, run `pnpm audit --prod` and `check-bundle-versions.mjs` against
  the DEV UI.
- **The three migrations at boot** on the DEV volume, including the Daily
  items insert finding the Brewery department. They're forward-only.
- **"Today" on a UTC machine.** Fly runs in UTC; check on DEV after 6 pm
  Colorado time that the board still starts on the Colorado date.
- **The 60-second refresh** and the two-person case (S16) with real
  latency.
- **The header against DEV's seeded schedule**, which is rebuilt relative
  to the week by `seed_synthetic()`.

## Risks

- **Size.** Even split three ways, D38 is large. If the gate drags, History
  (step 8) and the Daily items editor (in step 7) can move to D39 without
  touching the rest. The default four Daily items still work without the
  editor.
- **`@dnd-kit` across many containers.** Up to 33 lists (31 days, the
  Unfinished card and Future) in one `DndContext`. That's fine for
  `@dnd-kit` at these sizes, but auto-scroll inside a scrolling grid is
  checked early, in step 5, before the board depends on it.
- **The finished-elsewhere display** is the subtlest rule. Keeping it in
  one pure function with a full test table is the mitigation.
- **The Scheduler's D13 drag stays HTML5**, so the app has two drag systems
  until the follow-up task moves it. File that task when D38 merges.

## Decisions (Matt, 2026-10-11)

1. **Change log table:** `brewery_task_events`, as D37 did, not `audit_log`.
2. **Vitest** as a dev-only unit test runner for the drag layer's move
   logic.
3. **One prod release** for D38–D40, after D40 merges.
