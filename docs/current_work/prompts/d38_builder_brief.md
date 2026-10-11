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
