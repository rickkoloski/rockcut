# D41: Department Task Boards — Completion Record

**Status:** COMPLETE on `develop`. Passed the DEV gate and merged on
2026-10-14 (PR #20, merge `cd76b55`). **Not on prod:** D38, D39, D41, D42
and D40 ship in one release after D40.
**Spec:** `specs/d41_department_task_boards_spec.md` (approved 2026-10-13;
amends `specs/d38_brewery_task_board_spec.md`); scenarios S101–S120
**Plan:** `planning/d41_department_task_boards_plan.md`
**Concept:** 10_brewery_tasks
**Branch:** `d41-department-task-boards`, cut from `develop` (`e3548f3`),
32 commits. DEV gate SHAs: API `1d61ba8`, UI **`e61869d`** (fix cycle 1).
**Backlog:** D41 = 4237. Filed at the gate into **4260 (D42)**: G1, G2, N3.
**QA report:** `stepwise_results/d41_dev_qa_report.md`
**PR description / full detail:** `prompts/d41_handoff_note.md`

---

## Summary

The D38/D39 Brewery board became one board per assignable department
(Brewery, Taproom, Office, Sales), each with its own tasks, repeating
tasks, Daily items, History and schedule header. Members use their
department's board; managers also get History and Edit Daily items; owners
see and manage every board. **Tasks** is a top-level nav entry, with a
board picker for people with two or more boards. Owners also get a
read-only **All departments** view, grouped by department per day, whose
cards open their own board at that day.

## What shipped

| Area | Change |
|---|---|
| **Rename** | `brewery_*` tables → `tasks`, `task_series`, `task_events`, `daily_items`, `daily_checks`; `RockcutApi.BreweryTasks` → `RockcutApi.Tasks`; UI `pages/tasks/`, `lib/tasks.ts`. Landed alone, tests changed on names and paths only. |
| **API** | `/api/brewery/...` → `/api/boards/:dept/...` (`Plugs.TaskBoard`); access checked before the id (403 for outsiders, 404 for another board's id); `Authz {:tasks, dept}`, `{:daily_items, dept}`, `{:tasks, :all}`; assignees must be members of the board's department; leaving a department unassigns on that board only. |
| **History** | `task_events.department_id`; History per board. |
| **`/api/me`** | `task_boards` (department order; owners also get `all`); `brewery_tasks_manage` removed. |
| **UI** | Top-level Tasks, `/tasks/:dept`, remembered board, switcher, per-board manager tools, Daily card hidden until a board has items ("Set up Daily checks"), `/brewery/tasks` redirect, storage keys renamed with a fallback. |
| **All departments** | `GET /api/boards/all/tasks` (owners), `/tasks/all`: sections per department per day (Daily-only sections every day, Matt's call), Unfinished/Future grouped, read-only, cards open `/tasks/<dept>?day=`. Shared `useBoardView` / `BoardLayout`. |
| **Seed** | Taproom `[SEED]` tasks (5) and Office (1); Daily items only on the Brewery; `reset` clears the other boards' Daily items. |

**Migrations (2, reversible):** `20261016120001_rename_brewery_task_tables`,
`20261016120002_add_department_id_to_task_events`. **No new secrets or
dependencies.**

## Testing

- **Local gate:** ExUnit 1,366/0, Vitest 85, `tsc` and build clean, lint 27
  pre-existing, full Playwright 315 passed / 1 skipped (DEV-only), 30.2 min.
- **Migrations at boot on DEV's volume** (API v35): row counts identical
  before and after (tasks 90, task_series 3, task_events 3,043 all
  backfilled to the Brewery, daily_items 4, daily_checks 7). Snapshot
  `vs_D4BGyy2BMJgcwKLekeZj`.
- **DEV run 1 (`1d61ba8`, API v35 / UI v32):** 315/316; S111 failed (the ⋮
  menu named the Daily entry before the board's Daily items loaded).
- **Fix cycle 1 (`e61869d`, UI v33):** the entry waits for the items; a
  held-response test fails on the old code.
- **DEV run 2:** **317/317**, 19.9 min.
- **QA (fresh agent):** **PASS with gaps**, S101–S120 all pass, no must-fix.
- **Not done:** the hardware checks on the Pixel (installed PWA, old
  `/brewery/tasks` link, the All view's phone gestures) were not run; phone
  width was emulated only.

## Follow-ups

- **D42 (4260)**, next: G1 (1 week / Hide completed / phone view per
  board), G2 (reject another board's task as `before_id`), N3
  (`no_brewers` key), 4117, and D42's earlier items. **Matt has more
  changes to add when it starts.**
- **D40 (4213)**: the brewhouse tablet (opens the Taproom tablet's 403 on
  board routes), the shift-end reminder, the dashboard card.
- 4261, 4238, 4231, 4232, 4233 as before.
