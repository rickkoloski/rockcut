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

---

## Task 5: plan step 6, the board page (desktop and tablet layout)

**Step 5 accepted,** including deviations 1–7 and Vitest 4.1.11. Your
trial notes stand: lists get a minimum height so an empty day is a real
drop zone.

**Servers:** the lead runs the API (:4002) and UI (:5174). Run
`mix rockcut.synthetic.setup` whenever you need fresh seed data.

### What to build

Plan "Order of work" step 6 and "Changes → UI" (`src/pages/brewery/tasks/`),
for spec §3.8 **except** the Daily card's tick/edit behavior (step 7),
History (step 8) and the phone layout (step 9). In this step:
- **Nav + route:** Brewery → Tasks (`/brewery/tasks`) in the `hasBrewery`
  block.
- **`TaskBoard`** with the range in the URL, the 1 week / 2 weeks toggle
  remembered per browser, the date range selector (31-day limit with the
  spec's message), Previous / Today / Next, the filter (All / My tasks /
  Unassigned) and Hide completed (remembered per browser). `localStorage`
  reads and writes in try/catch.
- **Layout:** seven day columns per row, Unfinished as a side column at the
  start and Future at the end, spanning all rows; above and below the days
  below about 1280px. Today highlighted; amber edge on overdue cards.
- **`DayHeader`:** the shift lines, open shifts, events, "No brewers
  scheduled".
- **`DailyCard` (display only for now):** the count, expanded on today,
  amber on past days with unticked items. Ticking and Edit Daily items are
  step 7.
- **Cards, the task menu and dialogs:** `TaskCard`, `TaskMenu`,
  `TaskDialog` (add/edit, Add notes focused on Notes), `FinishElsewhereDialog`,
  `ChangeDayDialog` (with Move to Future), the delete confirm. Menu rules:
  - locked cards grey out Change day, Move up and Move down with "Mark
    not done first to move it";
  - done tasks grey out Move to Future (lead decision);
  - Move up/down disabled at the ends of a list.
- **Unfinished card and Move all to today** (with the spec's confirm),
  **Future list** (always shown, empty message, its own + Add a task).
- **Drag** through `SortableLists`: one container per day, Unfinished and
  Future; card keys as the API sends them. Optimistic moves through
  `useOptimisticLists`, with an error toast on rollback.
- **Freshness:** refetch every 60 seconds and on window focus.
- `data-testid` on every control.

### How to check it

1. Drive scenarios **S1–S23j** in a browser as the personas (Playwright MCP
   or throwaway scripts with `tests/.playwright-auth/<persona>.json`; never
   read token files). Fix what you find.
2. Then write the Playwright specs from what you saw, as the plan's table
   lists: `task-board-header`, `task-board-tasks`,
   `task-board-finish-elsewhere`, `task-board-range`, `task-board-future`
   and `task-board-drag` (S12–S14, plus the rejected move via `page.route`).
   Relative dates only, `[TEST-TEMP]` titles cleaned up in `afterEach`,
   persist-verify every write, no `waitForTimeout`.
3. S16 (two people moving one task) uses two browser contexts.

**If your context gets to about 80%,** commit what works (with its specs),
write what's left at the end of your reply, and stop. Don't leave
uncommitted work.

**Done means:**
- `tsc`, `vite build`, `pnpm test:unit`, `MIX_ENV=test mix test` pass;
- lint stays at 26 errors;
- the new Playwright specs pass, and so does the whole
  `tests/regression/brewery` folder;
- commit as `feat: D38 step 6 — task board page` (more than one commit is
  fine), then **stop** and reply as in Task 1, with the scenarios you
  drove and any you couldn't.

Don't start step 7.

## Task 6: plan step 7, the Daily card and the Daily items dialog

**Step 6 accepted,** including deviations 1–8 and the `brewery-board`
Playwright project. Answers to your LEAD questions:
1. **Mark not done confirm:** yes. Confirm only when the card shows on a
   day other than its planned day ("today" or "both"). A plain uncheck on
   its own day, or of a Future task, asks nothing.
2. **Open count:** keep it following the filter, so the count matches the
   cards you see.

**Servers:** as before (API :4002, UI :5174, both up).

### What to build

Plan step 7, spec §3.8 "Daily card" and the Daily items API from step 3:
- **`DailyCard` ticking:** tick and untick on today and past days, each
  item showing "✓ Temps — Kate, 8:12a" (Colorado time). Future days show
  the checks disabled. The count turns amber on past days with unticked
  items, and updates without a reload. Optimistic tick with a rollback
  toast, the same as task moves. Retired items still show on days they
  were ticked (and can be unticked, not ticked). The Daily card never
  drags (S27).
- **`DailyItemsDialog`** (managers and owners, from the board's ⋮ menu
  and the Daily card's own menu): add, rename, reorder by drag through
  `SortableLists` (one container, plus Move up/down for keyboard and
  touch), retire after "Retire Temps? Past ticks are kept." Inline errors
  for "Up to 12 items" and "Already on the list" (S31), from the API's 422
  codes.
- **Board ⋮ menu:** add it now with Edit Daily items, shown only when
  `/api/me` has `brewery_tasks_manage`. Step 8 adds History to it. Don't
  show an empty menu to brewers.

### How to check it

1. Drive **S24–S31** in a browser as the personas, the same way as Task 5.
   Fix what you find.
2. Write `task-board-daily.spec.ts` (S24–S27) and
   `task-board-daily-items.spec.ts` (S28–S31). Item edits change shared
   data, so put them in the `brewery-board` project and restore the four
   default items (names, order, active) in `afterEach`. Same rules as
   before: relative dates, persist-verify writes, no `waitForTimeout`.

**Context and done** are the same as Task 5. Commit as
`feat: D38 step 7 — Daily card and Daily items`, then **stop** and reply as
before. Don't start step 8.

## Task 7: plan step 8, History and access (+ the two flakes)

**Step 7 accepted,** including deviations 1–5. The board-refresh fix in
deviation 2 is a good catch. **LEAD answer:** no un-retire for D38. Re-adding
the name is fine for now; I'll log un-retire as a later idea.

### First: the two unexplained failures

Before building, find the causes of the two failures you saw in step 7.
Don't just rerun until they pass:
1. **The one ExUnit failure.** Run `MIX_ENV=test mix test` a few times
   (and with `--seed` values from failing runs) until you catch it. If it's
   in D38 code (time zone, ordering, `today/0` near midnight UTC), fix it.
   If it's an older flaky test, name it and say so; don't fix old code.
2. **`task-board-tasks` "S8: checking a task on today…"** in the full
   brewery run. Likely suspects are the step 7 refetch change, or another
   spec in the `brewery-board` project changing today's tasks. Fix the
   cause (in the code or the spec's isolation).

Commit these on their own (`fix: …`) before starting step 8.

### What to build

Plan step 8, spec §3.8 "Change log":
- **`HistoryDialog`** (or a drawer, whichever reads better at tablet width)
  from the board ⋮ menu, managers and owners only. Newest first, from
  `GET` on the events API (50 per page, with Load more). Each entry: who,
  when (Colorado time), what, and old → new in plain words (for example
  "Moved Package FV6 from Mon 10/12 to Wed 10/14", "Completed, shown on
  both days"). Daily check and item events (null `task_id`) are included
  with their item names.
- **Filtered to one task** from that task's dialog ("History" link,
  managers and owners only).
- **Devices** never see it (the API already 403s them).

### How to check it

1. Drive **S10, S11 and S38–S41** as the personas, including the
   negatives (`floater`, `bartender1`, `office1`, `owner`,
   `taproomDevice`). Check the nav, the typed URL redirect and the API
   403s.
2. Write `task-board-history.spec.ts` (S10, S11, the task filter) and
   `task-board-access.spec.ts` (S38–S41, every D38 API route for a
   non-Brewery user and the taproom device). Same rules as before.

**Context and done** are the same as Task 5, and the whole brewery folder
must pass twice in a row. Commit as `feat: D38 step 8 — History and access`,
then **stop** and reply as before. Don't start step 9.

## Task 8: plan step 9, phone width

**Step 8 accepted.** The handoff `SESSION_HANDOFF_2026-10-11b.md` has the
state; read its **Gotchas** too.

**Servers:** as before (API :4002, UI :5174, both up).

### What to build

Plan step 9, spec §3.8 "Phone width", plus the phone parts of "Tap or click
a task → task menu". At phone width (MUI `sm` and below, checked at
360×800):
- **One day at a time:** the Unfinished card (on today only), then the
  day's header, the Daily card and the tasks.
- **Day navigation:** arrows and a horizontal swipe move between days. A
  strip of the range's days shows each day's open-task count (following the
  filter, as on desktop) and ends with a **Future** stop that shows the
  Future list with its + Add a task (S23j). The selected day starts on
  today.
- **Swipe vs. scroll vs. drag:** a horizontal swipe changes day, vertical
  movement scrolls, and a long press starts a drag that reorders within
  the day (S15). They must never mix (§3.7). No cross-day drag on phones.
- **Task menu as a bottom sheet** (S9a): same actions and greying rules as
  the desktop menu. Change day… and Move to Future do the cross-day work.
- **Toolbar:** the 1 week / 2 weeks toggle and the date range selector go
  behind a calendar button. Hide completed and the ⋮ menu stay reachable.
- Desktop and tablet layouts must not change. All current brewery specs
  must still pass.

### How to check it

1. Drive **S9a, S15 (the parts a browser can do) and S23j** at 360×800 as
   `brewer1`, plus a manager pass over the ⋮ menu, Daily items and History
   dialogs at that width (no overflow, nothing cut off). Fix what you find.
2. Write `task-board-phone.spec.ts` (S9a, S23j, day strip counts, arrows,
   the calendar button, the Unfinished card only on today). Use a phone
   viewport and touch emulation where it helps. Put it in the
   `brewery-board` project if it writes shared data. Same rules as before:
   relative dates, persist-verify writes, no `waitForTimeout`.
3. Touch drag and swipe on real hardware (S9e, S15) are the lead's job on
   the Pixel. List in your reply exactly what to try there.

**Context and done** are the same as Task 5, and the whole brewery folder
must pass twice in a row. Commit as `feat: D38 step 9 — phone width`, then
**stop** and reply as before. Don't start step 10 (COVERAGE.md, the gate,
the PR).

## Task 9: plan step 10, COVERAGE.md, the local gate and the handoff note

**Step 9 accepted.** Matt moved the Pixel checks (S9e, S15) to the DEV
gate; they're in the plan's LIMITATIONS. Leave the day arrows and swipe
stopping at the strip's ends. The lead has run `mix rockcut.synthetic.reset`
locally, so the data is fresh.

**Also read:** `three_environment_workflow.md` §3 ("Local gate" and "The
handoff note"), and `d37_handoff_note.md` for the note's shape.

**1. `rockcut-ui/tests/COVERAGE.md`:** add a D38 section in the existing
format: S1–S51 (D38's rows only, per the spec's "Delivery split") → where
each is tested (ExUnit file and/or Playwright file). Mark **GAP** and
**Manual** rows honestly. S9e and S15's touch parts are Manual (DEV, Pixel).

**2. Tidy:** confirm the temporary two-list page from step 5 is gone, no
debug code is left, and `d38_ref/` is still untracked.

**3. Run the whole gate on the final branch.** Run every item, even ones
that passed before, and record the HEAD SHA:
- `cd rockcut_api && MIX_ENV=test mix test`. **Watch for the step 7
  one-off failure:** run it with full output saved to your scratchpad (not
  cut to a tail). If any test fails, report its name and seed.
- `cd rockcut-ui && npx tsc --noEmit -p tsconfig.app.json && pnpm exec vite build && pnpm lint`.
  Lint is expected at 26 errors. List them by file and confirm none are in
  D38 files.
- Vitest.
- `cd rockcut-ui && npx playwright test`: the **whole** local suite, every
  project, not just brewery. Run `mix rockcut.synthetic.setup` first and
  again afterwards.
- **Flakes:** a failure that passes on retry is still reported. Re-run that
  spec alone with `--repeat-each 5` and say whether it predates D38.
- **Persist-verify, one final pass:** throwaway scripts in your scratchpad,
  using the auth files, never reading tokens. As `brewer1`: add, move
  (another day, Future, back), complete on another day, tick a Daily item,
  delete. As `breweryMgr`: add a Daily item, retire it, check History.
  Reload after each step and check the result stuck. Delete the scripts and
  any data they made.
- No bug-fix revert check; D38 is a feature.

**4. Write the handoff note:** `docs/current_work/prompts/d38_handoff_note.md`,
in the D37 note's shape:
- deliverable (D38, task 4211), spec and branch, and the SHA for DEV as
  `<filled by lead at push>`;
- **What changed,** grouped by area (data model and `Authz`, the context
  and API, the drag layer, the board, Daily, History, phone width, seed),
  with the scenarios and tests that cover each;
- **Migrations:** list them and say whether each is reversible. If any has
  a `down`, check it by rolling back and migrating forward on a **scratch
  copy** of the dev DB, never the real one;
- **New dependencies** (`@dnd-kit/*`, Vitest dev-only) and new routes.
  No new secrets, unless you find one;
- **Personas and scenarios DEV must exercise;**
- **Local gate:** results with counts and the date;
- **Lint:** 26 errors already on `develop`, 0 from D38 (task 4084);
- **⚠ LIMITATIONS:** the plan's list (including the Pixel checklist), plus
  anything else local couldn't show;
- **Note for D39/D40:** D38 merges to `develop` but doesn't go to prod
  alone; one release after D40.

**5. Commit** as `docs: D38 coverage, handoff note + local gate results`
(and any fixes before it as their own `fix:`/`test:` commits).

**Then stop. Don't push.** The lead pushes and opens the PR once Matt says
so. Reply with: the gate results (counts, the lint file list, any flakes
or failures with names and seeds), GAP rows, and `LEAD:` questions.
