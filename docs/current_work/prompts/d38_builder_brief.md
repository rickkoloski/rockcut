# D38 builder brief

**From:** the lead (the Claude in the Herdr `lead` tab), for Matt.
**Branch:** `d38-brewery-task-board`, in `~/src/rockcut`. The spec and plan
are committed; no code yet. The branch isn't pushed.

## Read first

1. `CLAUDE.md` (repo root).
2. `docs/process/three_environment_workflow.md` §3 (the local gate) and §6
   (Playwright rules).
3. `docs/current_work/specs/d38_brewery_task_board_spec.md`: approved. It
   covers D38–D40; the **"Delivery split"** section says what's D38. Build
   nothing from D39 (recurring tasks, `series_*` columns) or D40 (tablet,
   staff codes, reminder, dashboard card).
4. `docs/current_work/planning/d38_brewery_task_board_plan.md`: all of it.
   Its "Decisions" section is Matt's (2026-10-11).
5. `docs/current_work/SESSION_HANDOFF_2026-10-11.md`: **Gotchas**.

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
start, stop or kill them. If you need them running or restarted, say
"LEAD: please start/restart the API" in your reply and wait. Step 1 needs
only `MIX_ENV=test mix test`.

**When a decision isn't in the spec or plan,** don't guess. Stop and write
the question in your reply, starting with `LEAD:`. The lead answers or asks
Matt.

## Task 1: plan step 1, data model, placement and `Authz`

Build plan "Order of work" step 1, as "Changes → API" describes:

**Migrations (3, additive),** exactly as the plan lists them:
1. `brewery_tasks` (no `series_*` columns) with its three indexes.
2. `brewery_daily_items` + `brewery_daily_checks`, and the insert of the
   four default items (Backups, Gravities, Temps, Pressures, in that order)
   for the department with key `brewery`. If that department doesn't exist,
   insert nothing. Make sure test setup still gets the four items (factory
   or seeds; say which).
3. `brewery_task_events` (`task_id` with **no** FK, a `title` copy,
   `detail` map, `device_id` nullable).

Each needs a working `down`. Check it by rolling back and migrating forward
on a **scratch copy** of the dev DB, never the real one.

**Schemas** under `lib/rockcut_api/brewery_tasks/`: `Task`, `DailyItem`,
`DailyCheck`, `Event`, with changesets for the spec's limits:
- title 1–200 characters, trimmed;
- notes up to 2,000;
- `completed_display` in `planned_day` / `completed_day` / `both`;
- item names 1–40 characters.

The 12-item cap and unique-name rules belong to the context (step 2). Leave
them out here.

**`RockcutApi.BreweryTasks.Placement`** (pure, no Repo):
- `cards(tasks, days, today)` returns cards keyed `{task_id, day}` or
  `{task_id, :future}`, following the plan's placement table. Each card
  carries its tags (`planned_on`, `done_on`, `from_future`) and `locked`.
- Ordering: a day's own tasks by `position`, then the tasks finished there
  from other days (and from Future) by `completed_at`.
- `unfinished(tasks, today)`: open tasks with `due_on < today`, oldest day
  first, then `position`.
- Tests: `test/rockcut_api/brewery_tasks/placement_test.exs`, covering every
  row of the plan's table, "both" giving two cards with only the
  finished-day one locked, the ordering rule, Future tasks never in
  `unfinished`, and a done task never in it.

**`BreweryTasks.today/0`**: the Colorado date (plan "Approach"). Put it in
`lib/rockcut_api/brewery_tasks.ex` as the start of the context module.
Test it at 11:30 pm Colorado time in winter and summer (UTC already the
next day), using a helper that takes a `DateTime` so the test doesn't need
the clock.

**`Authz`** (plan "Changes → Authz"):
- `:brewery_tasks` with `:read` / `:write` for Brewery members;
- `:history` on `:brewery_tasks` and `:manage` on `:brewery_daily_items`
  for Brewery managers;
- owners through the existing owner clause; devices denied (nothing added
  to `Authz.Device`).
- Place the clauses beside D37's `:beer_board` ones, with a short comment
  in the same style.
- Tests in `authz_test.exs`: `brewer1`-like employee, Brewery manager,
  `floater`-like (Brewery + Taproom), a Taproom-only person, owner, a
  device. `authz_boundary_test` and the parity suite must stay green.

**Done means:**
- `cd rockcut_api && MIX_ENV=test mix test` passes in full;
- the migration rollback check passed on a scratch copy;
- commit as `feat: D38 step 1 — data model, placement, Authz`, then
  **stop**.

**Reply with:**
1. what you built (files);
2. the test counts;
3. the rollback check result;
4. any deviation from the plan, and why;
5. open `LEAD:` questions.

Don't start step 2.

---

## Task 2: plan step 2, the `BreweryTasks` context

**Lead answers to your step 1 questions:**
1. **Daily check and Daily item changes go in `brewery_task_events`** with
   `task_id` null and `title` = the item's name. Use actions such as
   `daily_ticked`, `daily_unticked`, `item_added`, `item_renamed`,
   `item_reordered`, `item_retired`, and put `on_date` / `daily_item_id` /
   old → new values in `detail`. History lists them with the task events.
2. **No "done" tag on a `planned_day` card.** It shows done in place, as in
   S8c. The detail view's "Completed by … on …" carries the date.

**Step 1 accepted,** including your deviations 1–8, with one fix (the
lead's brief was wrong):
- **A "both" task: both cards are `locked`** (spec S8b: "Neither copy can
  be dragged"). Fix `Placement` and its tests. The plan's table is updated.

**Then build plan step 2,** as "Changes → API → `RockcutApi.BreweryTasks`"
describes, without `board/3` and the header (that's step 3):
- tasks: `create`, `update` (a day change is a move to the bottom of that
  day), `move`, `move_overdue_to_today`, `complete`, `uncomplete`,
  `delete`;
- Daily: `tick`, `untick`, `list_items`, `create_item`, `rename_item`,
  `retire_item`, `order_items` (12-item cap, unique active names ignoring
  case);
- `list_events(task_id \\ nil, page)`;
- `unassign_if_ineligible(user_id, actor)`, wired into
  `Accounts.update_user` and `Accounts.set_memberships` beside
  `StaffCodes.clear_if_ineligible`.

**Rules to keep:**
- Every write runs in one `Repo.transaction` with its event row(s). Lists
  stay dense after every write (create, move, delete, uncomplete of a
  Future task, `move_overdue_to_today`).
- Authorization isn't in the context. The controllers (step 3) call
  `Authz`. The context validates data only (assignee an active Brewery
  person, the `display` rules, future-day ticks).
- Every function that needs today takes it as an optional last argument.
- The assignee check uses `Authz.member_of?/2`, not a role or owner test,
  so `authz_boundary_test` stays green.

**ExUnit,** as the plan's "Tests" lists for `brewery_tasks_test.exs`,
`brewery_daily_test.exs` and the `accounts_test.exs` case (S49), including
the concurrent-move test with two `Task`s.

**Done means:** `MIX_ENV=test mix test` passes in full. Commit as
`feat: D38 step 2 — BreweryTasks context`, then **stop** and reply as in
Task 1. Don't start step 3.

---

## Task 3: plan steps 3 and 4, the board read model, routes and seed

**Lead answers to your step 2 questions** (step 2 accepted, including
deviations 1–6):
1. **A done task can't go to Future:** keep `{:error, :locked}`. The UI
   will grey out Move to Future for done tasks.
2. **Ticks on retired items refused, unticks allowed:** keep.
3. **Ticked today, then retired the same day:** today keeps showing it,
   ticked. Use the past-day rule for **today** as well (active items plus
   retired items ticked that day). Future days show active items only. Fix
   `daily_cards/2` and add a test.

### Step 3: `board/3`, the header, controllers and routes

As the plan's "Changes → API" describes ("The header", "Controllers and
router", the `/api/me` flag):
- `BreweryTasks.board(from, to, today \\ today())`: days with cards
  (through `Placement`), header and Daily card; the Unfinished list; the
  Future list; names preloaded once. One query per kind for the whole
  range, no query per day.
- **The header:** published Brewery shifts by Colorado day, grouped per
  person (both shifts on one line, total hours), in roster order
  (`schedule_order`, then name); open shifts last; published Brewery
  events overlapping the day. Reuse `Scheduling`'s Colorado midnight
  helper by making it public or moving it to `Recurrence`; don't copy it.
- **`BreweryTaskController`** and **`BreweryDailyController`** in a new
  `[:api, :authenticated, :brewery]` scope. Every action calls `Authz.can?`
  (`:read` / `:write` / `:history` on `:brewery_tasks`, `:manage` on
  `:brewery_daily_items`). The routes are in spec §3.6, plus `GET
  /api/brewery/tasks/history?task_id=&page=`.
- **Errors** as 422 with a code, as D37 does: `display_required`,
  `future_day`, `retired`, `locked`, `too_many_items`, `range_too_long`
  (more than 31 days, or `from` after `to`). 404 for a missing task or
  item.
- **JSON:** dates as `YYYY-MM-DD`, card keys as `"<task_id>:<day>"` or
  `"<task_id>:future"`, names (not just ids) for assignee, completer and
  event actors. Keep it flat, in house style.
- **`device_route_matrix_test.exs`:** add every new route as denied to
  devices.
- **`/api/me`:** a top-level `brewery_tasks_manage` flag.
- **ExUnit:** `brewery_task_board_test.exs` (header and board, as the
  plan's "Tests" lists) and controller tests for every route as an
  employee, a manager, an owner, a Taproom-only person (403) and a device
  (403).

### Step 4: synthetic seed

As the plan's "Changes → API → Synthetic seed" describes: `[SEED]` tasks
relative to today, Daily checks, one published all-day Brewery event this
week, `cleanup_temp/0` and `reset/0` additions. Extend the synthetic seed
tests: the rows exist, `setup/0` twice gives the same result, and
`cleanup_temp` removes `[TEST-TEMP]` tasks and items.

Then run `mix rockcut.synthetic.setup` against the **local dev DB** (that's
what it's for; it's guarded to synthetic data) and check the board as
`brewer1` with `curl localhost:4002/api/brewery/tasks?...`. You'll need
the API running: say "LEAD: please start the API" and wait. Mint the token
with `mix rockcut.synthetic.token brewer1` in a shell variable; never print
it.

**Done means:** `MIX_ENV=test mix test` passes in full, and the curl check
shows headers, cards, Unfinished, Future and Daily cards for this week.
Commit step 3 and step 4 separately (`feat: D38 step 3 — board read model
and routes`, `feat: D38 step 4 — synthetic seed`), then **stop** and reply
as in Task 1. Don't start step 5.

---

## Task 4: plan step 5, the shared drag layer (+ a seed fix)

**Lead answers to your step 3/4 questions** (steps 3–4 accepted, including
deviations 1–8):
1. **Switch the synthetic seed's week to the Colorado date**
   (`BreweryTasks.today()` or a shared helper). It's a real bug on DEV,
   which runs in UTC. Commit it on its own as `fix: synthetic seed uses the
   Colorado date for its week`. Add a test that pins a Sunday 7 pm Colorado
   time and checks the seeded shifts land in that week. Check that no
   existing Playwright spec depends on the UTC behavior. Run the
   `scheduler` folder to be sure; the UI server is up (below).
2. **Daily 0/0 before deploy day on prod:** fine, no change.

**Servers:** the lead runs the API (:4002) and the UI dev server (:5174).
Don't start or stop them.

### Step 5: `@dnd-kit`, `src/components/dnd/` and Vitest

As the plan's "Changes → UI → The shared drag layer" describes:
- **Dependencies,** exact versions (`pnpm add -E`), lockfile committed:
  `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. Dev only:
  `vitest`. Use current stable releases at least two weeks old. Say which
  versions in your reply. Add a `test:unit` script (`vitest run`).
  Check that `pnpm install --frozen-lockfile` still works (the UI Docker
  build uses it) and that `pnpm exec vite build` passes.
- **`SortableLists.tsx`, `DropTarget.tsx`, `moveModel.ts`**, as the plan
  describes: the `onMove({ itemId, fromContainer, toContainer, beforeId })`
  callback, `isLocked(itemId)`, the three sensors (mouse 8px, touch 250ms
  delay with 5px tolerance, keyboard), `DragOverlay`, auto-scroll, and
  plain-words screen-reader announcements. Item ids are strings (the board
  uses card keys such as `"12:2026-10-14"` and `"12:unfinished"`).
- **Rejected moves:** callers make the optimistic update with
  `applyMove`, and roll back by restoring the previous containers.
  Provide a small hook for this (`useOptimisticLists` or similar) so the
  board and the Daily items dialog don't each write it.
- **No Brewery code in `components/dnd/`.** Add the `no-restricted-imports`
  lint rule scoped to that folder.
- **Vitest:** `moveModel.test.ts` covers moving within a list, across
  lists, to the end, onto an empty list, with a locked item, a no-op move,
  and `beforeIdAt` at each edge.
- **Trial page:** to settle sensors and auto-scroll, mount a temporary
  page with about 10 lists of 8 items in a horizontally and vertically
  scrolling grid (the board's real shape), at `/dev/dnd-trial` behind
  `import.meta.env.DEV`. Check mouse drag, keyboard moves, Escape, a
  rejected move snapping back (fail every third move on purpose), and
  auto-scroll at the grid's edges, with Playwright MCP or a throwaway
  script. **Delete the trial page in the same commit**, or in a separate
  commit before you stop, and say which.

**Done means:**
- `pnpm test:unit`, `npx tsc --noEmit -p tsconfig.app.json`,
  `pnpm exec vite build` pass;
- `pnpm lint` adds no new errors (count the existing ones first);
- `MIX_ENV=test mix test` still passes (for the seed fix);
- commits: the seed fix, then `feat: D38 step 5 — shared drag layer
  (@dnd-kit) + Vitest`. Then **stop** and reply as in Task 1, plus the
  trial findings (anything about touch or auto-scroll the board should
  know).

Don't start step 6.
