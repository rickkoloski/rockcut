# D53 Part 2: Idea Boards — Plan

2026-11-08 · lead. **Spec:** `specs/d53_idea_boards_spec.md` §2, §4 (4.1–4.8), §5 S223–S243 and
S255–S261 (approved). **Task:** 5063. **Branch:** `d53-part2-idea-boards` in `~/src/rockcut-d53p2`
(from `develop` @ `8e434ce`, which has Part 1).

Part 2 has its own PR and DEV gate. Then D53 (Parts 1 and 2) is released as one.

## Shape

- **API:** a new context `RockcutApi.IdeaBoards` (lists, cards, labels, checklist, notes, locks,
  watches, send to tasks, events) plus small modules under `lib/rockcut_api/idea_boards/`.
  Controllers under `/api/idea_boards/:board/...`.
- **Board keys:** the four assignable departments' keys (`brewery`, `bar`, `office`, `sales`) and
  `company`. A new plug `Plugs.IdeaBoard`, modelled on `Plugs.TaskBoard`, resolves `:board` to
  `{:department, dept}` or `:company`, and anything else to 404.
- **Authz:** a new area `{:idea_board, board}` with actions `:read`, `:write`, `:manage`
  (lock/unlock, change locked things, rename/delete labels, delete archived) and `:history`. It goes
  in `Authz.can?/3`, with devices in `Authz.Device` (read only, home board + `company`). D31's
  boundary test and parity suite get the rows. **Lock checks are `Authz`'s too:** "may this person
  change this list/card" = `:write` and (not locked, or `:manage`).
- **Routes:** reads under `device_allowed` (tablets can read). Writes under `authenticated`, so a
  device gets 403 from `DeviceGate` before any of our code runs.
- **UI:** `src/pages/ideas/` (board page, list column, card, card dialog, send dialog, archived,
  history), `src/lib/ideas.ts`, nav entry "Idea Boards" after Tasks, a switcher like
  `BoardSwitcher`. Drag reuses `components/dnd/` (`SortableLists`, `useOptimisticLists`, `moveModel`).
- **Notifications:** event `idea_card_changed`, a pending-changes ledger (`idea_watch_pending`) and a
  flush on the existing `Reminders.Scheduler` tick. **The scanner runs every 5 minutes, so with the
  spec's 10-minute window a notification arrives 10–15 minutes after the first change.** Defaults:
  in-app on, push on, email off (match `EVENT_DEFAULTS` in `NotificationPreferencesDialog.tsx`).

## Stages (each its own commits; builder stop points marked ■)

1. **Data.** Migrations for every table in §4.1, plus `idea_watches` and `idea_watch_pending`.
   - A **data migration creates Ideas / Planned / Doing / Done** for all five boards.
   - Positions as on the task board.
   - `idea_card_tasks` keeps `task_id` with `on_delete: :nilify_all`, plus `task_title`,
     `department_id`, `task_series_id`, `removed_at`.
   - Reversible. Check up, down and up.
2. **Authz + plug + read API.** `/api/idea_boards` (my boards, with `manage`/`history` flags; owners:
   all five; `noDept`: Company only), board read (lists + cards with labels, assignee ids, checklist
   counts, note counts, lock state, watched-by-me, sent-task chips), card read (full), archived,
   history. `/api/me` gains `idea_boards`.
   - Route matrix test: every route × {member, other department's member, manager, other manager,
     owner, `noDept`, Taproom device, Brewery device}.
   - ■ **Stop 1.**
3. **Write API.**
   - Lists: CRUD, reorder, archive, restore, delete for good.
   - Cards: CRUD, move, reorder, archive, restore, delete.
   - Labels, checklist items, notes (author edit/delete, managers delete), lock/unlock, watch.
   - Every rule in §4.5: a non-manager can't archive an unlocked list holding a locked card; lists
     reorder around a locked one; notes stay open on locked things.
   - Assignees through `Authz` (department members or owners; Company: any active person). The
     100-person cap, as tasks.
   - People leaving a department / deactivation: hook into the same code paths Part 1 uses for
     tasks (§4.1). Watches drop with access.
   - History events.
   - ■ **Stop 2.**
4. **Watch notifications.** The ledger; a write by A to a card B watches adds pending rows for B
   (never A); flush groups a card's pending rows once its first row is 10 minutes old; one
   notification per watcher per card ("Casey changed *Taproom remodel*: moved to Doing, 2 notes").
   Tapping opens `/ideas/<board>/cards/<id>`. Preferences row.
5. **Send to task list.** `POST …/cards/:id/send_to_tasks` with §4.7's fields. It goes through Part 1's
   `Tasks` create and `Tasks.Assignees` (no second writer), in one transaction, with the card's
   "Then" move/archive.
   - Checklist into notes as `☐`/`☑` lines with the 2,000-character rule, or one task per open item.
   - Repeat only in one-task mode. A past due date → Today. Company cards pick a department.
   - Chips: on the list, Done (task completed), Removed (task deleted), and the series for a repeat.
   - The task dialog's **"From idea: …"** link (a field on task JSON; no link if the viewer can't
     open that board).
   - ■ **Stop 3.**
6. **UI.** The board (lists side by side, sideways scroll, phone: one list at a time with tabs and
   long-press drag), card faces, card dialog (description, people, due date, labels, checklist,
   notes timeline newest first, Watch eye, Lock, Archive, Send), list menus, Archived, History
   (managers), filter (All / My cards / Watching / label), tablet view only, card URLs, Android back.
   Refetch on focus like the task boards.
   - Screenshots before trusting specs, in both themes, at 1280 and 390 px.
   - ■ **Stop 4.**
7. **§4.8 task-board follow-ups.** Gaps 4, 5, 6, 9, 11, 13 and 14 and the two recheck observations,
   each with a test from its repro (reports in `stepwise_results/d53_part1_dev_qa*`). Gaps 13 and 14
   are in `series.ex`'s split; keep fix cycle 2's single meaning of "changed on its own".
8. **Seed and tests.** `[SEED]` lists and cards on Brewery, Taproom and Company (with labels, a
   checklist, notes, a locked card, a sent card). Playwright `regression/ideas/` for S223–S243 and
   S255–S261. `tests/COVERAGE.md`.
   - ■ **Stop 5** (the non-Playwright gate passing, then the lead hands over servers).

## Gate

Workflow §3: `mix test` twice, `tsc`, `vite build`, vitest, lint no worse than 26 errors, full local
Playwright (the lead runs it). Revert checks for the §4.8 bug fixes.

## Risks and LIMITATIONS to carry

- **Size.** This is the biggest deliverable since D46–D49. If it runs long, the spec allows notes and
  Send to task list to move to a follow-up without changing the data model. The lead decides that with
  Matt at a stop point, not the builder.
- **Authz with locks** is where a leak would hide. That's the reason for the route matrix and
  lock-matrix tests.
- **Notification timing** (10–15 minutes) and push only show up on DEV with a real device.
- **Concurrent edits:** last write wins, as on the task boards.
