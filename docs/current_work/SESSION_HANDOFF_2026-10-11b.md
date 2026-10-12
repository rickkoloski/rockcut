# Session Handoff — 2026-10-11b

Follows `SESSION_HANDOFF_2026-10-11.md` (D38 specced and split into
D38–D40).

This session **planned D38 and built steps 1–8 of 10**, in herdr lead mode:
the lead pane wrote the briefs and reviewed the work, and the builder pane
wrote the code. Everything is committed on `d38-brewery-task-board`.
**Nothing is pushed.** The builder is stopped and idle, on Matt's request.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.07` (D37), API v25 / UI v20. |
| **DEV** | Unchanged and free. |
| **Repo** | Branch `d38-brewery-task-board`, 20 commits ahead of `develop`, head `4265075`. Clean. Not pushed. |
| **Backlog** | D38 = 4211, D39 = 4212, D40 = 4213 (PortableMind, project 254). D41 is the next free ID. |
| **Local servers** | API :4002 (herdr w1:p2), UI :5174 (w1:p3). Board at http://localhost:5174/brewery/tasks. |

## Key docs

- **Spec:** `docs/current_work/specs/d38_brewery_task_board_spec.md`. Approved,
  covers D38–D40; see its "Delivery split" section.
- **Plan:** `docs/current_work/planning/d38_brewery_task_board_plan.md`. Steps
  1–10 are in "Order of work".
- **Builder brief:** `docs/current_work/prompts/d38_builder_brief.md` has
  Tasks 1–7, each with the lead's answers to the previous step.

## Decisions (Matt)

- **Q19:** each missed recurring occurrence stays on the Unfinished card.
  **Q20:** the rule options are enough.
- **Split:**
  - D38 is the drag layer and the core board;
  - D39 is recurring tasks;
  - D40 is the brewhouse tablet, the shift-end reminder and the dashboard
    card.
- **One prod release** for D38–D40, after D40 merges. D38 and D39 merge to
  `develop` and wait.
- **Change log** in its own `brewery_task_events` table, not `audit_log`.
- **Vitest** (4.1.11, dev-only) for unit tests. Vitest 5 needs Node ≥ 22.12,
  and local and Docker are on Node 20.

## Lead decisions (accepted by Matt, or minor)

- A done task can't go to Future.
- A retired Daily item can't be ticked, but can be unticked. Today shows
  retired items that were ticked that day.
- Daily check and item events go in `brewery_task_events` with a null
  `task_id`.
- There's no done tag on a card shown on its planned day.
- Daily shows 0/0 for days before deploy day.
- For a task shown on "both" days, **both** cards are locked (S8b).
- **Mark not done** asks for a confirm only when the card shows on a day
  other than its planned day.
- Each day's **open count follows the filter**.
- **No un-retire** for Daily items. It's logged in spec §5.

## What's built (steps 1–8)

| Step | Commit(s) | What |
|---|---|---|
| 1 | `834721c` | The migrations (tasks, daily items and checks, events), schemas, pure `Placement`, and the `Authz` clauses |
| 2 | `9869f25` | The `BreweryTasks` context (moves, completion, ticks, items, events) |
| 3 | `a146b0b` | `board/3` and the schedule headers; 15 routes under `/api/brewery`; the `/api/me` `brewery_tasks_manage` flag |
| 4 | `04833e0`, `58d591a` | The synthetic seed. The fix makes the seed use the Colorado date for its week, an older bug. |
| 5 | `292ea59` | The shared drag layer in `rockcut-ui/src/components/dnd/` (`@dnd-kit`), plus Vitest |
| 6 | `8f608b7`, `13224af` | The board page `src/pages/brewery/tasks/`, with six Playwright specs |
| 7 | `577e852` | Daily card ticking and the Daily items dialog |
| 8 | `5a7d9e6`, `4265075` | A spec flake fix; History (the board ⋮ menu, or one task from its dialog) and the access specs |

**Last results (step 8):**
- 1,118 ExUnit tests pass, with 0 failures.
- 19 Vitest tests pass.
- `tsc` and `vite build` pass.
- Lint is at 26 errors, all pre-existing (task 4084).
- `tests/regression/brewery` passed 88/88 twice in a row.

**Brewery board specs** run in their own Playwright project,
`brewery-board`, with one worker, because "Move all to today" touches the
shared board. It's listed in `tests/RUNNING.md`.

## Open item: one unexplained ExUnit failure

During step 7, one full `mix test` run reported "1117 tests, 1 failure". The
output was cut to its last three lines, so the test name and seed are lost.
It didn't come back in 15 full runs or in 40 runs of the D38 test files, and
the builder found nothing clock-dependent. **Watch for it in the step 10
local gate.** If it shows, capture the full output and the seed.

## Next

1. **Step 9: phone width (360px).** Spec §3.8 "Phone width":
   - one day at a time;
   - the day strip with its Future stop;
   - swiping between days;
   - the task menu as a bottom sheet.

   Drive S9a's phone sheet, S15 and S23j. Check on the Pixel, including
   touch drag (S9e) by hand.
2. **Step 10:**
   - COVERAGE.md;
   - the full local gate;
   - a PR to `develop` with the handoff note.

   Pushing and the PR need Matt's go.
3. **DEV gate:** claim DEV (conv 80) with Matt's OK, then merge.
4. **When D38 merges,** file the follow-up task to move the Scheduler's D13
   HTML5 drag onto the shared layer.
5. **Plan D39** (recurring tasks), then **D40**. D40 adds the
   `breweryDevice` persona and the Brewery staff codes.

**Resuming the builder:**
1. Append "Task 8: plan step 9" to the brief and commit it.
2. In herdr, send `/clear` to `builder` (w1:p5), then the prompt.
3. Start a background `herdr agent wait builder --until working --timeout
   60000; herdr agent wait builder`.

`/clear` starts a new session jsonl, so read the builder's reply from the
newest file in `~/.claude/projects/-home-matthewheiser-src-rockcut/`.

## Gotchas (new this session)

- **Never `git commit -a` while the builder is working.** It would pick up
  the builder's half-done files. Stage the paths by name.
- **`useOptimisticLists` needs a stable source.** A `= []` default makes a
  new array on every render and loops forever. Use a shared empty constant.
- **Board check boxes update one tick after a click,** because TanStack
  batches. Specs use the `setBoardCheck()` helper, not `locator.check()`.
- **Drag specs:** use a 2,200px-tall viewport. Use the `mouseDrag` helper,
  which drags to the list's bottom first, then up onto the target.
- **`authz_boundary_test`** forbids `member_of?(` outside `Authz`. Use
  `Authz.can_take_brewery_task?/1`.
- **`ComponentShowcase.tsx` has no route.** Drag is tested on the board
  itself.
- **The `d38_ref/` Trello screenshot** stays local and gitignored, because it
  shows real staff names.

## Still open from before

Matt's earlier queue: 4054, 4055/4056, 4057, 4060–4064, 4084, 4115–4119
(**4117** is medium), 3856; **3994 due 2026-10-30**; **4058 due 2026-11-04**.
Humans still need to set Taproom staff codes and pair the prod tablets if
that isn't done.
