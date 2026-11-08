# D53: Boards + multiple assignees on tasks — Complete

**Spec:** `specs/d53_idea_boards_spec.md` · **Plans:** `planning/d53_part1_multi_assignees_plan.md`,
`planning/d53_part2_idea_boards_plan.md` · **Task:** 5063
**Completed:** 2026-11-08, on prod as `v2026.11.08`. **Matt's prod sign-in and tablet checks: task 5164,
moved to 2026-11-09 morning** (covers D54 too).

## Summary

Part 1 lets a task (and a repeat series) have several people. Part 2 adds Boards: Trello-style boards
per department plus Company for ideas and longer projects, separate from the dated task boards. They
shipped as one release after separate DEV gates.

## What was built

- **Part 1 (PR #53):** `task_assignees` / `task_series_assignees` (backfilled; `assignee_id` kept as the
  first person); `Tasks.Assignees` the only writer; multi-select, card initials, View filter, leaving a
  department, repeats, linked tasks keep one person, shift-end push, tablet staff-code writes, History.
  Its gate also fixed three repeat-task bugs already on prod (rule changes silently changing people,
  titles or notes; the "changed on its own" flag after a split; notes-only occurrences).
- **Part 2 (PR #54):** `RockcutApi.IdeaBoards` (lists, cards, labels, checklist, notes, people, watches,
  Send, log), `Plugs.IdeaBoard`, Authz area `{:idea_board, board}` with lock checks, `/boards` UI
  (desktop columns, phone tabs, card dialog, Send, Archived with search, History, tablet view only),
  Watch notifications batched through the `Reminders.Scheduler` tick (10–15 min), Send to task list
  (one task or one per item, repeat, "From the … board" link and chips), `RockcutApi.Ids` for
  out-of-range ids on Boards and task boards, and the §4.8 task-board follow-ups from Part 1's QA.

## Gates

| | Part 1 | Part 2 |
|---|---|---|
| Local Playwright | 601 passed | 643 passed, 1 skipped |
| DEV Playwright | full suite green after fixes | 648 passed |
| Independent QA | 3 passes (fix cycles 1–2) | fail → fix cycle 1 → recheck pass |
| Reports | `stepwise_results/d53_part1_dev_qa*.md` | `stepwise_results/d53_part2_dev_qa*.md` |

## Release

- PR #53 and #54 → `develop` (`d90b973`); release PR #55 squash `4e469ef`; tag `v2026.11.08`.
- Prod API v34 `registry.fly.io/rockcut-api:deployment-01M6Y81NMM9ZFQK4SJD23PX8PV`, UI v30
  `registry.fly.io/rockcut-ui:deployment-01M6Y83YB817HF2XQKRCA42YYD`.
- Rollback: API v33 `…deployment-01M6V4689ZVSMY6843SV58HNRX`, UI v29
  `…deployment-01M6N75MXVFFZ13DYSTQ124GB4`; snapshot `vs_Byb8e0vN5JnMhenvv030ekG9`.
- Smoke: three migrations at boot; backfill 65/65 tasks and 1/1 series, 0 mismatches; 4 starter lists
  on each of 5 boards; 254 tasks before and after; 3 tablet pairings intact; `mix hex.audit` clean.

## Follow-ups

- **5164:** Matt's checks (2026-11-09).
- **D55** (in progress): §2.11 out-of-range ids across the rest of the app, and recheck gap 10.
- 5193 (drag lists), 5202 (repeat twin).
