# D38 handoff note (PR description)

**Deliverable:** D38 — Brewery Task Board (PortableMind task 4211). The first of three from one spec; D39 (recurring tasks, 4212) and D40 (brewhouse tablet, shift-end reminder, dashboard card, 4213) follow.
**Spec:** `docs/current_work/specs/d38_brewery_task_board_spec.md` (approved 2026-10-11; D38's part is in its "Delivery split")
**Plan:** `docs/current_work/planning/d38_brewery_task_board_plan.md` (Decisions: Matt, 2026-10-11)
**Branch:** `d38-brewery-task-board`, cut from `develop` (`2ec1f9a`). One commit (or a few) per plan step.
**SHA for DEV:** `<filled by lead at push>`

## What changed

Scenario → test detail for every row is in `rockcut-ui/tests/COVERAGE.md` (D38 section). Two rows there are **Manual** (S9e; S15's touch part), both on the Pixel at the DEV gate. There are no GAP rows.

| Area | Change | Scenarios | Tests |
|---|---|---|---|
| **Data model and `Authz`** | Three tables (below). `BreweryTasks.Placement.cards/3` is pure and is the only thing that decides what shows on a day: cards keyed `{task_id, day}` or `{task_id, :future}`, with `locked` on a finished-elsewhere copy and on both copies of a "both" task. `Authz.can?/3` for `:brewery_tasks` (`:read`, `:write`: Brewery members; `:history`: Brewery managers) and `:brewery_daily_items` (`:manage`: Brewery managers); owners pass the owner clause; devices get nothing. `Authz.can_take_brewery_task?/1` (an active Brewery person or owner) for assignees. Parity suite unchanged | S8b, S38–S41 | ExUnit `brewery_tasks/placement_test`, `brewery_tasks/schemas_test`, `authz_test` (D38 block) |
| **Context and API** | `RockcutApi.BreweryTasks`: create (bottom of a day or Future), update, move (dense `position` per list, renumbered in one transaction; a stale `before_id` lands last; last move wins), Move all to today (oldest day first, one `moved` event each), complete (`display` required off its own day → `display_required`; a Future task is `completed_day`; a second complete is a no-op), uncomplete, delete (history kept), tick/untick (future day → `future_day`), Daily items (≤ 12 active, unique names ignoring case, retire keeps past ticks), History. "Today" is the Colorado date and every function takes it as an argument. `board/3` returns the range's days (cards, schedule header from **published Brewery** shifts and events in roster order, Daily card), the Unfinished list and the Future list, one query per kind. 15 routes under `/api/brewery` in a new `[:api, :authenticated, :brewery]` scope, people only (`DeviceGate` refuses every device). `GET` is limited to 31 days (`range_too_long`). `/api/me` gains top-level `brewery_tasks_manage`. Leaving the Brewery (memberships or deactivation) unassigns **open** tasks only, logged `unassigned` / `left_brewery`, in the same transaction as `StaffCodes.clear_if_ineligible`. `Scheduling`'s Colorado day bound is now `Recurrence.local_midnight/1` (shared, behavior unchanged) | S1–S5, S8f, S12–S14, S16, S20, S23, S25, S49, S51 | ExUnit `brewery_tasks_test`, `brewery_daily_test`, `brewery_task_board_test`, `accounts_test` (S49), `brewery_task_controller_test`, `device_route_matrix_test` (all 15 people-only) |
| **Shared drag layer** | `src/components/dnd/` on `@dnd-kit`: `SortableLists` (mouse 8px, touch long press 250ms / 5px, keyboard; `DragOverlay`; auto-scroll; plain-words screen-reader announcements), `DropTarget`, pure `moveModel.ts` (`applyMove`, `beforeIdAt`) and `useOptimisticLists`. Nothing Brewery-specific: an ESLint `no-restricted-imports` rule scoped to the folder keeps pages out. The Scheduler's D13 drag is unchanged (HTML5); moving it is a follow-up task | S12–S14, S27 | Vitest `moveModel.test.ts` (19); Playwright `task-board-drag` (mouse, keyboard, Escape, a refused move snapping back) |
| **The board** | Brewery → **Tasks** (`/brewery/tasks`), in the `hasBrewery` routes. Range in the URL; Previous / Today / Next; 1 week / 2 weeks (remembered per browser) and a date range (≤ 31 days); filter All / Mine / Unassigned (day counts follow it); Hide completed (remembered). Day columns with the schedule header, Daily card, cards (initials, notes icon, "planned …" / "done …" / "from Future" tags), amber edge on open past tasks; the Unfinished card (Move all to today) and the Future list as side columns, above and below the days under ~1280px. Task menu, add/edit dialog (`FormDialog` gains `secondaryAction` and `testId`), "where should it show" dialog, Change day… / Move to Future. Optimistic writes rolled back with a toast; 60-second refresh and refetch on focus | S1–S9d, S9f, S12–S23i | Playwright `task-board-header`, `task-board-tasks`, `task-board-finish-elsewhere`, `task-board-range`, `task-board-future`, `task-board-drag` |
| **Daily** | Daily card per day: "Daily n/m", expanded on today, amber on a past day with unticked checks, future days disabled, never draggable; who and when on each tick. Edit Daily items (managers, owners): add, rename, retire (confirm), reorder by drag or Move up/down. A past day counts only the items that existed then; a retired item stays where it was ticked | S24–S31 | Playwright `task-board-daily`, `task-board-daily-items`; ExUnit `brewery_daily_test` |
| **History** | The board's ⋮ → History (Brewery managers, owners), or one task's from its dialog: newest first, 50 a page with Load more, in words ("Moved … from Mon 10/12 to Future"), who and when. Daily ticks and item changes are in it too (null `task_id`) | S10, S11 | Playwright `task-board-history`; ExUnit `brewery_tasks_test` (`list_events`), controller (history) |
| **Phone width** | One day at a time; a day strip with open counts ending in a Future stop; arrows and sideways swipe change day; the task menu as a bottom sheet; the range controls behind a calendar button. No cross-day drag (Change day… does it); long press reorders within the day | S9a, S15, S23j | Playwright `task-board-phone` (360px; touch emulated); **Manual** touch on the Pixel at DEV |
| **Seed** | `[SEED]` tasks relative to today over two weeks (assigned and not, one per `completed_display`, two open past, two on Future), Daily checks (yesterday 3/4, today 1/4), one published all-day Brewery event (`[SEED]` on its notes). `cleanup_temp` deletes `[TEST-TEMP]` tasks and Daily items; `reset` deletes `[SEED]` tasks and every Daily check and restores the four default items. **Fix:** setup now uses the Colorado date for its week, so an evening setup on a UTC host (DEV) no longer seeds next week (`58d591a`, an older bug). `seeds.exs` adds the four default Daily items on a fresh DB | — | ExUnit `seeds/synthetic_test` (D38 block, Sunday 7 pm MDT pinned) |

**Test infrastructure:**
- **Vitest 4.1.11** (dev only), `pnpm test:unit`, `vitest.config.ts`; only `moveModel` for now. Vitest 5 needs Node ≥ 22.12, and local and Docker are on Node 20.
- New Playwright project **`brewery-board`** (one worker, beside `chromium`) for all `task-board-*` specs: "Move all to today" moves every open past task on the one shared board. It's in `tests/RUNNING.md`. Drag specs use a 2,200px-tall viewport and the `mouseDrag` helper; board check boxes use `setBoardCheck()`.
- `test:` `2fdb7f2`: the D33 pairing-limiter tests no longer leak into `seeds/synthetic_test` (details under Local gate).

## Migrations

| Migration | Change | Reversible |
|---|---|---|
| `20261011120001_create_brewery_tasks` | `brewery_tasks` (no `series_*` columns; D39 adds them) + indexes `(department_id, due_on, position)`, `(department_id, completed_on)`, `assignee_id` | Yes (`change`) |
| `20261011120002_create_brewery_daily` | `brewery_daily_items`, `brewery_daily_checks` (unique `(on_date, daily_item_id)`); inserts Backups, Gravities, Temps, Pressures for the department keyed `brewery`, or nothing if it doesn't exist | Yes (`up` / `down`) |
| `20261011120003_create_brewery_task_events` | `brewery_task_events` (`task_id` with no FK, `title` copied, `device_id` null until D40) + indexes on `inserted_at`, `task_id` | Yes (`change`) |

All additive. **Rollback checked** on a scratch copy of the local dev DB (2026-10-11; copied with a read-only `VACUUM INTO`, the real DB untouched): `down` 3 steps dropped the four tables and six indexes, leaving other data intact (18 users, 22 shifts, 5 departments, 5 beer-board entries, 1 schedule event); `up` restored the identical schema and indexes, and the Daily items insert found the Brewery department (4 items). A rollback **loses** every task, Daily check and History entry.

## New dependencies, routes and secrets

- **UI:** `@dnd-kit/core 6.3.1`, `@dnd-kit/sortable 10.0.0`, `@dnd-kit/utilities 3.2.2` (exact; runtime), `vitest 4.1.11` (dev only). `pnpm-lock.yaml` committed. Nothing added to the API.
- **Routes** (all `/api/brewery`, people only): `GET /tasks`, `GET /tasks/history`, `POST /tasks`, `POST /tasks/move_overdue_to_today`, `PATCH /tasks/:id`, `DELETE /tasks/:id`, `POST /tasks/:id/move`, `POST /tasks/:id/complete`, `POST /tasks/:id/uncomplete`, `PUT` / `DELETE /daily_checks/:on_date/:daily_item_id`, `GET /daily_items`, `POST /daily_items`, `PUT /daily_items/order`, `PATCH /daily_items/:id`. UI route `/brewery/tasks`.
- **No new secrets or config.**

## Personas and scenarios DEV must exercise

Spec §4, D38's rows: S1–S9f (not S9g), S10–S31, S38–S41, S49 (not the staff code), S51. Personas: `brewer1`, `brewer2`, `breweryMgr`, `floater`, `owner`, `bartender1`, `office1`, `taproomDevice`. With DEV emphasis:
- **On the Pixel as `brewer1`, phone width:** S9e and S15, the checklist in LIMITATIONS 1.
- **Two people at once with real latency:** S16 (`brewer1` + `brewer2`), and S24's "brewer2 sees it", left open without reloading to see the 60-second refresh.
- **The header against DEV's seeded schedule:** S1–S5 after `seed_synthetic()`; S3 as `breweryMgr` (draft → Publish week).
- **"Today" after 6 pm Colorado** (UTC on Fly): S51, and that a new task defaults to the Colorado day.
- **Access:** S38–S41, including the `taproomDevice` 403 and `bartender1` / `office1` typed URL.
- **S49 through Users & Roles** as `breweryMgr`: remove `brewer2` from the Brewery and check the board (local covered it in ExUnit only).

## Local gate (2026-10-11, at `2fdb7f2`)

The gate ran on the final code. The commit after it (this note and COVERAGE.md) is docs only.

- **`MIX_ENV=test mix test`: 1,118 tests, 0 failures** (seed 207453, full output kept).
  - The first run, at `dbb68e9`, had **1 failure** (seed 910837): `RockcutApi.Seeds.SyntheticTest` "taproomDevice persona (D33) a pairing code for it works in the real exchange" (`synthetic_test.exs:331`) got a 429 instead of 201. This is very likely step 7's unexplained "1117 tests, 1 failure".
  - **Cause:** `PairingRateLimiterTest`'s "global cap of 50" test left the current 10-minute window's global bucket full. When it ran last in its module and the synthetic test paired in the same window, the exchange was refused. The same seed passed on a rerun because the window had rolled over. On the two files alone it failed with `--seed 5` and `--seed 7`.
  - **It predates D38:** both tests are D33's. **Fix** `2fdb7f2` (test only): the limiter test resets on exit, and the synthetic test resets before it pairs. Seeds 5, 7 and 9–14 now pass.
- `tsc` clean; `vite build` OK; **Vitest 19/19**. These ran at `dbb68e9`; since then only two ExUnit files changed.
- `pnpm lint`: **26 errors, 1 warning**, all pre-existing (see Lint).
- **Playwright, the whole local suite, every project** (`setup`, `chromium`, `brewery-board`, `board-replace`), with `mix rockcut.synthetic.setup` before each run and after the last. No retries are configured.
  - **Run 1: 257 passed, 1 failed, 1 skipped.**
    - The failure was `brewery-board` › `task-board-daily.spec.ts:114` **"S26: yesterday's 3/4 is amber, and the 4th can still be ticked"**. After expanding yesterday's Daily card, the click on Pressures never reached the box: it stayed unchecked for 5 s and no `PUT` was sent.
    - Alone with `--repeat-each 5`, the whole spec passed **25/25 (S26 5/5)**.
    - It's a D38 spec, so it doesn't predate D38. The cause isn't proven, and the trace was overwritten by the repeat run.
    - My read: under full-suite load (about 1.3 GB of memory free), the layout moved between Playwright's hit-test and the click. Not fixed; DEV's run is the next check.
  - **Run 2: 258 passed, 0 failed, 1 skipped**, including all 78 `brewery-board` tests. The skip is `smoke/roles` "DEV shows the banner", which is DEV only.
- **Persist-verify (final pass, browser, throwaway script using the auth files, deleted).** Each step was checked after a reload.
  - As `brewer1`: add on today; Change day… to +2 days; Move to Future; back to today; to yesterday, where it's on the Unfinished card; checked there with "On today", so it's done on today with "planned …" and gone from yesterday and Unfinished; tick a Daily check (1/4 → 2/4) and untick it back; delete.
  - As `breweryMgr`: add a `[TEST-TEMP]` Daily item (on today's card and in the dialog), retire it (gone from both), and History lists the task's added, moved, completed and deleted entries and the item.
  - Setup afterwards left no `[TEST-TEMP]` tasks and the four default items.
- **Migration rollback** checked on a scratch copy (see Migrations).
- No revert check: D38 is a feature, not a bug fix. The `2fdb7f2` test fix was checked by seed: it failed before (seeds 5 and 7) and passed after.

## Lint

`pnpm lint` shows **26 errors (and 1 warning), all already on `develop`; D38 adds 0.** Same files as D37's note: `src/datagrid-extended.d.ts` (10), and 1 each in `ComponentShowcase.tsx`, `batches/BatchFormDialog`, `batches/BatchLogEntryDialog`, `batches/BrewTurnDialog`, `brands/BrandFormDialog`, `ingredients/IngredientDetail`, `ingredients/IngredientFormDialog`, `ingredients/IngredientLotDialog`, `ingredients/IngredientsList` (+ the warning), `recipes/MashStepDialog`, `recipes/ProcessStepDialog`, `recipes/RecipeFormDialog`, `recipes/RecipeIngredientDialog`, `recipes/tabs/WaterTab`, `settings/CategoryFormDialog`, `settings/FieldDefinitionDialog`. D38 touches none of them. Task **4084** fixes them on their own branch (Matt's D37 waiver, 2026-10-06).

## ⚠ LIMITATIONS: what local could NOT tell us

1. **Touch drag on real hardware** (S9e, S15). Playwright emulates touch, but long press vs scroll vs tap only shows on a real Android device. Matt moved these checks to the DEV gate (2026-10-11): as `brewer1` on the Pixel (and a Samsung tablet if one is at hand):
   1. A quick tap opens the bottom sheet; a long press (about ¼ s) lifts the card instead, and the sheet doesn't open.
   2. A long-press drag reorders within the day. Drifting sideways doesn't change the day or move the card out of it.
   3. A sideways swipe changes day, including one that starts on a card, and doesn't lift the card.
   4. Scrolling up and down a long day, starting on a card, only scrolls.
   5. A sideways swipe on the day strip scrolls the strip; tapping a stop selects it.
   6. Android's edge back gesture doesn't also change the day.
   7. Change day… and Move to Future in the sheet, and the calendar button's native date pickers.
2. **`@dnd-kit` in the release build and the PWA bundle.** Locally only `vite build` ran. After the DEV deploy, run `pnpm audit --prod` and `node rockcut-ui/scripts/check-bundle-versions.mjs https://rockcut-ui-dev.fly.dev`, and check that the board drags in the installed PWA.
3. **The three migrations at boot on the DEV volume,** including the Daily items insert finding the Brewery department (DEV's Brewery exists, so it should insert four). They're reversible, but a rollback loses the board's data.
4. **"Today" on a UTC machine.** Local runs in Colorado time; ExUnit pins 11:30 pm MST/MDT. On DEV after 6 pm Colorado (midnight UTC), check that the board still starts on the Colorado date, a new task defaults to it, and today's Daily card is the tickable one. `seed_synthetic()` on DEV in the evening should seed this week (the `58d591a` fix).
5. **The 60-second refresh and S16 with real latency.** Locally S16 used a reload in place of the refresh. Leave two screens open on DEV and confirm they agree within a minute.
6. **The header against DEV's seeded schedule,** which `seed_synthetic()` rebuilds relative to the week.
7. **Cross-origin:** the board's 15 routes go through CORS on DEV for the first time (locally Vite proxies `/api`). `PUT` / `PATCH` / `DELETE` preflights included.
8. **S49 through the UI** (Users & Roles as `breweryMgr`) wasn't driven locally; ExUnit covers the unassignment, and D37's `auth/manager_removes_member` covers the save.
9. **The shared board during a DEV Playwright run:** the `brewery-board` specs move every open past task ("Move all to today") and change Daily items, then put them back. Nobody should use the DEV board by hand while the suite runs; run `seed_synthetic()` after.

## Note for D39, D40 and the department boards

D38 merges to `develop` after its DEV gate but **doesn't go to prod alone**. The board ships in one release after D40 merges (Matt, 2026-10-11), so the brewhouse tablet is there from day one. D39 adds the `series_*` columns and recurring tasks; D40 moves the write routes to `:device_allowed`, adds the `breweryDevice` persona, Brewery staff codes, the shift-end reminder and the dashboard card. When D38 merges, file the follow-up task to move the Scheduler's D13 HTML5 drag onto `components/dnd/`.

**Department boards (Matt, 2026-10-12):** one board per department, each task in exactly one department, built as its own deliverable (proposed D41) after D39 and before D40. It renames `brewery_*` to generic names and keys `Authz` on the task's department. D38's `department_id` columns already fit it; see the spec's "Delivery split".
