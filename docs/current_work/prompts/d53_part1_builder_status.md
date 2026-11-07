# D53 Part 1: builder status

2026-11-06 · builder → lead. **Stop point 1 reached:** plan steps 1–7 done, API
complete. Branch `d53-part1-multi-assignees`, not pushed. Steps 8–10 not started,
apart from the ExUnit half of step 10 and one seed fix (below).

## Results

| Check | Result |
|---|---|
| `mix test` (three full runs, three seeds) | **1886 passed**, 0 failed (baseline before this work: 1817) |
| `tsc -p tsconfig.app.json` | clean |
| `vitest` | 182 passed |
| `vite build` | builds |
| `pnpm lint` | 26 errors, 1 warning (limit is 26 errors) |
| Playwright, servers | **not run**, per the brief |

**Only the last commit is verified green.** Steps 3–6 can't pass on their own (the
tests changed with them), and I ran the full suite only after step 7. Each commit
compiles in sequence as far as I know, but I didn't check out and test each one.

**The tests can fail.** I broke the code on purpose and confirmed each break was
caught, then restored it:

| Deliberate break | Tests failing |
|---|---|
| `assignee_id` set to the last person, not the first | 11 |
| Backfill skips assigned tasks | 1 of 1 |
| Backfill writes position 1 | 1 of 1 |
| Occurrences don't copy the series' list | 11 |
| "Following" overwrites exceptions | 1 |
| Leaving a department removes everybody | 2 |
| A linked task accepts several people | 1 |
| Shift-end push treats only the first person as "mine" | 1 |

## Per step

### 1. Migration (`d282b48`)
- **Files:** `priv/repo/migrations/20261106120001_create_task_assignees.exs`
- **Tests added:** `test/rockcut_api/migrations/create_task_assignees_test.exs`
- Up, down, up on this worktree's seeded dev DB: 16 of 16 assigned tasks backfilled,
  0 mismatches with `assignee_id` on either up, no foreign-key problems, and down
  keeps the column.
- **That DB is synthetic, not a copy of DEV**, and it has no assigned series or
  exceptions (`series_assigned=0`, `exceptions=0`). The ExUnit test covers both. The
  plan's real-backfill LIMITATION still stands for DEV.

### 2. `Tasks.Assignees` and schemas (`4f1a808`)
- **Files:** `lib/rockcut_api/tasks/assignees.ex`, `task_assignee.ex`,
  `task_series_assignee.ex`, `task.ex`, `task_series.ex`
- **Tests added:** `test/rockcut_api/tasks/assignees_test.exs`
- The join schemas declare `(task_id, user_id)` as a composite primary key, because
  Ecto's through-preload requires one. There's no table change: the tables have no
  `id` column and keep the unique index.

### 3. `Tasks` context (`c94941d`)
- **Files:** `tasks.ex`, `task.ex` and `task_series.ex` (no longer cast `assignee_id`),
  `notifications.ex`, `seeds/synthetic.ex`
- **Tests changed:** `tasks_test.exs`, `accounts_test.exs`, `task_boards_test.exs`
- Create, update, `open_work`, leaving a department, and board preloads. A test
  confirms the All departments query count doesn't grow with the number of tasks.
- **Two changes the plan didn't list, both needed:**
  - The shift-end body compared against `assignee_id`, so a second assignee would
    have seen their own task marked as someone else's. It now reads the list.
  - The seed's one-off tasks inserted `assignee_id` directly, which would have left
    them with no join rows. They now go through `Assignees`. The two-assignee
    `[SEED]` rows are still step 9. After a reseed: 16 join rows, 0 mismatches.

### 4. `Tasks.Series` (`20d6a2b`)
- **Files:** `tasks/series.ex`
- **Tests added:** `test/rockcut_api/tasks/multi_assignees_test.exs`
- **Tests changed:** `series_test.exs`, `series_edits_test.exs`
- Create, this, following, splits, Ends-only, one-off → repeat and top-up carry the
  list. Exceptions and finished occurrences keep theirs. All existing D39 tests pass
  with only the event shape changed.
- A date that already exists when `insert_occurrences` runs keeps its own list: rows
  are written only for the ids the insert returned.

### 5. `TaskLink` (`34bd7ad`)
- **Files:** `production/task_link.ex`, `task_board_controller.ex`, `task_errors.ex`
- More than one person on a linked task is 422 `linked_task_assignees`. One id goes
  to the step, `[]` clears it. The tablet refusal is unchanged.
- Sync adds one query for the whole set, not one per task. The perf test printed
  19 ms for `sync!` over 630 linked tasks, against 10 ms at baseline; that's one
  noisy run each, not a benchmark.

### 6. JSON and params (`26cd002`)
- **Files:** `json_helpers.ex`
- **Tests added:** `test/rockcut_api_web/controllers/task_board_multi_assignee_test.exs`
  covers the JSON, old-tab raw API writes, S220, S221, S222 and the route matrix.
- **Tests changed:** `task_boards_controller_test.exs`, `task_board_controller_test.exs`
- No controller param code was needed for ordinary tasks or staff-code writes: params
  already pass through to the context, which reads both shapes.

### 7. History (`58b5784`)
- **Files:** `tasks.ex`, `rockcut-ui/src/lib/tasks.ts`, `src/lib/tasks.test.ts`
- **Tests added:** stored old-shape rows, in both ExUnit (names) and vitest (wording).
  The vitest cases assert the old wording exactly.

`9b4d46d` only formats two new test assertions.

## Tests deleted or weakened

**None deleted or weakened.** Nine existing assertions changed shape, in the seven
files named under steps 3, 4 and 6:

- The error key is now `assignee_ids`, and the message names the person (6).
- Events now store id lists (3): `accounts_test`, `tasks_test`, `series_edits_test`.

## Not done yet

- **Steps 8–10:** UI, the two-assignee seed rows, Playwright.
- **`taskSaveError` is out of step until step 8.** It still looks for
  `errors.assignee_id`, so a refused assignee shows the generic error rather than
  "Only members of…". Step 8 already covers this line.

## LEAD: questions

1. **Does one old History detail need to stay wrong?** Old `made_repeating` events
   with an assignee change used to read "assigned to someone no longer here", because
   `made_repeating` wasn't in `@user_detail_actions`, so its names were never loaded.
   I needed it for the new shape, and it also fixes the old rows. The plan says old
   events must read exactly as before; this is the one exception. I kept the fix.
   Tell me if you'd rather have it split out.

2. **History wording: full names OK?** S216 says "Assigned Riley, Jordan". The code
   writes "Assigned Riley Wort, Jordan Float to Keg Wash", matching how History names
   people today. The Playwright spec has to match whichever you pick. I'll assume full
   names unless you say otherwise.

3. **A pure reorder logs an event.** The plan compares assignees as lists, so
   `[A, B]` → `[B, A]` is a real change: it reads "Changed the order of people on …",
   and on an occurrence edit it asks for a scope and can make an exception. If the
   multi-select can reorder without meaning to, step 8 could keep the existing order
   for people who stay. Is that what you want?

4. **New series check everyone, not only the added.** Creating a series, a split and
   one-off → repeat validate the whole list, as today's code does. This is a narrow
   reading of "validate only ids being added", since everyone is being added to the
   new series. Effect: someone who left and is still on a series blocks a split with a
   422 naming them. Leaving a department already clears them, so this should be rare.

## Carry to the DEV handoff

- **Old UI tab, reassigning:** the old dialog sends `assignee_id` only when the person
  changes the picker (`TaskDialog.tsx:200`). A title edit is safe, but changing the
  picker on a two-person task leaves one person. This is what §3.3 specifies.
- **Old UI tab, History:** new id-list events read "someone no longer here" there.
  Cosmetic, and it doesn't crash; I read the old code's handling rather than running
  it.
- **Roll back, then forward again (not in the plan's list):** while an old API image
  runs, it writes only `assignee_id`. After going forward, the join rows win, so
  assignee changes made during the rollback are lost, and tasks created then show
  nobody until edited. Worth a line in the release PR, or a re-backfill step if a
  rollback ever happens.
- **Existing quirk, kept:** a "following" edit only reaches later occurrences if this
  occurrence's own value changes. If this one already has the new list (an exception,
  say), the series takes it but the later occurrences don't. `assignee_id` and the
  title behave the same way today.
- The plan's three LIMITATIONS still apply. The old-tab raw API test is done locally
  (`task_board_multi_assignee_test.exs`); QA still checks it on DEV.

## Environment

The worktree's dev DB has been migrated and reseeded. It's this worktree's own file,
and nothing outside the worktree was touched. No servers or Playwright were started.

---

# Stop point 2

2026-11-06 · builder → lead, answering `d53_part1_lead_decisions_1.md`. The decision 3
change and plan steps 8–10 are done, and the non-Playwright gate passes. **Playwright
specs are written but have never run, and no browser has opened this UI.** No servers
were started. Not pushed.

## Results

| Check | Result |
|---|---|
| `mix test`, twice (different seeds) | **1893 passed**, 0 failed |
| `tsc -p tsconfig.app.json` | clean |
| `tsc -p tsconfig.e2e.json` | 2 errors, both already on `develop`, in lines I didn't touch (`task-board-phone.spec.ts:443`, `beer-board-import.spec.ts:40`) |
| `vitest` | 187 passed |
| `vite build` | builds |
| `pnpm lint` | 26 errors, 1 warning (limit is 26 errors) |
| `mix format --check-formatted` on every changed file | clean |
| `mix compile --warnings-as-errors` | **fails** on `reminders.ex:12` (unused `require Logger`), a file this branch doesn't touch |
| Playwright | **not run**, per the brief |

## Per step

### Decision 3: a reorder isn't a change (`5ab2fa7`)
- **Files:** `tasks/assignees.ex`, `tasks/series.ex`, `src/lib/tasks.ts`, plus tests.
- `Assignees.changed/2` compares as sets. "Changed the order of people on …" is gone.
- **Beyond the decision:** a split or one-off → repeat given the same people in another
  order now keeps the source's order (`people_attrs`). Otherwise the new series would
  disagree with the task it came from.
- **Tests added:** context, series and API levels.
- **Test whose meaning changed, as the decision requires:** "the same list logs nothing;
  a new order is a change" is split in two, and a new order is no longer a change.
- **Broken on purpose:** comparing as lists again fails 5 tests, at all three levels. The
  `people_attrs` break fails 1.

### 8. UI (`c627b84`)
- **Files:** `types.ts`, `lib/tasks.ts`, `TaskDialog.tsx`, `TaskCard.tsx`, `TaskMenu.tsx`,
  `TodaysTasksCard.tsx`, `tasks.test.ts`.
- **Dialog:** "Assigned to" is a multi-select with chips and a checkbox per person. MUI
  keeps the order of people who stay and adds new ones last. "Anyone" clears the list and
  closes it. Save sends `assignee_ids` only when the people differ. Phone back closes the
  list first (`usePhoneBackCloses`).
- **Card:** the first avatar keeps `task-assignee-<key>`; others are `-1`, `-2`, plus
  `task-assignee-more-<key>` and `task-assignees-<key>` on the wrapper. The avatars
  overlap by 4 px to leave the title room.
- `LinkedTaskDialog` and `TaskListPanel` are unchanged. `AllBoard` needed nothing: it uses
  `TaskCard` and `cardShown`.
- **Added, not in the plan:** `cardPeople` falls back to the old fields when `assignees` is
  absent, so new UI on a rolled-back API doesn't crash the board. `assignees` is therefore
  optional in the type.
- **Broken on purpose:** My tasks reading only the first person, `samePeople` comparing
  order, and the refusal not naming the person each fail 1 Vitest test.

### 9. Seed (`9f5ac15`)
- `[SEED] Scrub the cold room floor` (`brewer1`, `brewer2`) and `[SEED] Deep clean the back
  bar` (`bartender1`, `bartender2`).
- **Tests changed:** seed counts in `synthetic_test.exs` went up with the rows (Brewery
  17 → 18, Taproom 5 → 6, 6 → 7 with a kept real task, bartender1 2 → 3). New test: the two
  shared rows, and `assignee_id` agreeing on every seeded task.
- Reseeded this worktree's DB: 20 join rows, 0 mismatches.

### 10. Tests (`fa73f54`)
- **ExUnit:** the plan's list is covered (most of it since stop point 1).
- **New spec, never run:** `tests/regression/brewery/task-board-multi-assignee.spec.ts`
  covers S216–S220, S222, decision 3, +N, the old-tab and refusal API cases, someone who
  left, and phone back. S221 stays ExUnit only, because its clock is injected.
- **Existing specs, shape only:** `taskBoardHelpers.ts` (`toggleAssignees`, `assignees` on
  `ApiTask`), `task-board-recurring` (2 flows, 2 request bodies), `task-board-tasks`,
  `task-board-history` (the new wording), `task-board-departments` (error shape),
  `task-board-phone`.
- `tests/COVERAGE.md` has a D53 Part 1 section.

**Tests deleted or weakened:** none. The only change of meaning is the one decision 3 asks for.

## Handoff note

Drafted at `docs/current_work/prompts/d53_part1_handoff_note.md`, with your decision 1 note
and my carry list. The SHA and Playwright results are blanks to fill in.

## What to expect from the first Playwright run

Nothing below has been confirmed in a browser. These are where I'd look first:

- **The multi-select:** `toggleAssignees` assumes Escape closes only the list, and "Anyone"
  assumes MUI hands the `''` value to `changeAssignees`. Both come from reading the code.
- **Card layout:** three avatars plus "+N" may crowd a narrow day column. `ml: -4px` was my
  guess, with no visual check.
- **The two new seed rows:** a spec that assumes exact counts on the Brewery or Taproom
  board could fail. I found none by grep, but I didn't read every spec.
- **`task-board-history`:** `Assigned ${title} to Jake Brewer` became `Assigned Jake Brewer
  to ${title}`. I updated the one place grep found.
- **S220:** it uses `Made` and `stepOf` from the production helpers, and typechecks, but it's
  the most moving parts in the file.

## LEAD: questions

1. **Reorder plus a change through the API.** If a raw request both reorders and changes the
   people, the order given wins, so the first person can change even though they stayed.
   The dialog can't send this. The plan says "order is the order given", so I left it. Should
   the API keep the existing order for people who stay, or is the dialog's guarantee enough?
2. **`--warnings-as-errors` fails on `reminders.ex:12`.** D42's handoff recorded this check as
   clean, so it broke since then. It isn't D53's change, and I left it alone. Fix it here, or
   file a task?
