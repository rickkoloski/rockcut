# D53 Part 1: multiple assignees on tasks — Plan

2026-11-06 · lead. **Spec:** `specs/d53_idea_boards_spec.md` §3, S216–S222
(approved). **Task:** 5063. **Branch:** `d53-part1-multi-assignees` in
`~/src/rockcut-d53` (from `develop` @ `b3670d0`).

Part 1 gets its own PR and DEV gate and merges to `develop`. Part 2 branches
from that. **`develop` isn't released until Part 2 passes** (one release, Matt's
decision), unless Matt says otherwise.

## Design

- **One writer.** `Tasks.Assignees` (new) is the only code that writes
  assignees: it replaces the join rows and sets `assignee_id` to the first, in
  the caller's transaction. Same for a series. Nothing else casts `assignee_id`.
- **Order matters:** the join tables have a `position`; "first" is position 0.
  Order is the order given, so `assignee_id` and the card's initials are stable.
- **Source of truth:** the join table. `assignee_id` / `assignee_name` are a
  compatibility copy for one release (rollback and old open tabs). No new code
  reads them, except where the plan says so.
- **Params:** `assignee_ids` wins; else a lone `assignee_id` means `[id]` (null =
  `[]`); neither = no change. Duplicates are dropped.
- **Validation:** every id through the existing `Authz.can_take_task?` rule; a
  422 under `assignee_ids` names the person ("Riley Wort must be a Taproom member").
  Validate only ids being **added**, so someone who has since left doesn't block
  an unrelated edit (as `get_change` does today).

## Steps (each its own commit)

1. **Migration.** `task_assignees` and `task_series_assignees` (`task_id` /
   `series_id`, `user_id`, `position`, `inserted_at`; unique pair; cascade on
   both foreign keys). Backfill from `assignee_id` at position 0. Reversible
   (drop the tables). Check up, down and up on a copy of a DEV-shaped DB.
2. **`Tasks.Assignees` and schemas.** `has_many` / preload order by position.
3. **`Tasks` context** (`tasks.ex`, 37 mentions):
   - create and update (`assignees` compared as lists; only a real change logs);
   - `open_work`: mine = in the list; unassigned = empty; preload through the join;
   - `remove_from_department` path (~line 678): remove only that person from open
     tasks and series on that board, recompute `assignee_id`, log per task;
   - the board queries' preloads (no N+1; check the All departments view).
4. **`Tasks.Series`** (`series.ex`, 15 mentions): `@content_fields` swaps
   `assignee_id` for the list. Creating, "this", "following", splits
   (`continues_series_id`), one-off → repeat and top-up (~lines 252, 1189) all carry
   it. An occurrence changed on its own (`series_exception`) keeps its list. **This
   is the riskiest step:** every D39 scenario must still pass.
5. **`TaskLink`** (D49): writes `[step.assignee_id]` through `Assignees`.
   `TaskBoardController` ~line 311: a linked task with more than one id → 422; one
   id → the step, as today. Tablet refusal unchanged.
6. **JSON** (`json_helpers.ex` 210, 259): add `assignees: [{id, name}]` beside the
   old fields, for tasks and series. Controller params per Design. Staff-code writes
   take `assignee_ids` the same way (S222).
7. **History.** New events carry `from`/`to` as id lists, including inside `edited`
   maps (`assignee_ids`). `detail_user_ids` flattens old and new shapes; `tasks.ts`
   (~307–346) renders both ("Assigned Riley, Jordan" / "Removed Jake"). Old events
   must read exactly as before: add a test with stored old-shape rows.
8. **UI.**
   - `types.ts`: `assignees` on tasks and series.
   - `TaskDialog`: multi-select with chips; keep the `task-assignee-*` testids; keep
     a member who has left visible (lines ~120–121) until removed. Empty = unassigned.
   - `TaskCard`: up to three initials, then "+N"; tooltip lists everyone.
   - `tasks.ts` filter: `mine` = in the list, `unassigned` = empty. Check `AllBoard`.
   - `TaskMenu` line 70, `TodaysTasksCard`: show all assignees.
   - `LinkedTaskDialog`, `TaskListPanel`: **unchanged**, on the single fields.
   - Refusal text (`tasks.ts` ~255): show the API's message naming the person.
   - Phone width: the dialog stays usable, Android back closes the select first.
9. **Seed.** One `[SEED]` Brewery task and one Taproom task with two assignees.
10. **Tests.**
    - ExUnit: `Assignees`, the backfill, each context path above, series paths,
      leaving a department, old and new event shapes, the route matrix (device, other
      department), `assignee_id` staying equal to the first.
    - Playwright: new `regression/brewery/task-board-multi-assignee.spec.ts` for
      S216–S222; update `taskBoardHelpers.ts` and existing specs for the multi-select
      (shape only, not meaning).

## Gate

Workflow §3: `mix test` twice, `tsc`, `vite build`, vitest, lint no worse than 26
errors, full local Playwright (the lead runs it). No bug-fix revert check is
required, but the migration test and `assignee_id` sync test must fail if broken.

## LIMITATIONS to carry to DEV

- A real backfill: DEV-shaped data and series with exceptions.
- An old UI tab against the new API (`assignee_id` writes). Add a test by raw API
  locally; on DEV, QA checks it.
- Rollback: the old API on a DB with extra assignees shows only the first. Not run.
