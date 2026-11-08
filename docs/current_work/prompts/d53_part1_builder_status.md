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

---

# Stop point 3

2026-11-07 · builder → lead, answering `d53_part1_lead_decisions_2.md`. First run in a
browser done. Everything you asked me to run passes, after three layout fixes. The full
suite is still yours. Not pushed. `E2E_TARGET=dev` was never set.

## Results

Run one at a time, with `caffeinate -ims`, against this worktree's servers.

| Run | Result |
|---|---|
| `--project setup` | 1 passed |
| New spec `task-board-multi-assignee` | **19 passed**, on its first run |
| Changed specs (`recurring`, `tasks`, `history`, `phone`, `departments`) | **78 passed** |
| `--project brewery-board --no-deps` | **222 passed** (16.9 min) |
| `--project production --no-deps` | **157 passed** (12.3 min) |
| `mix test` | 1893 passed |
| `vitest` | 187 passed |
| `tsc` (app), `vite build` | clean |
| `tsc` (e2e) | the same 2 errors already on `develop` |
| `pnpm lint` | 26 errors, 1 warning (limit is 26 errors) |

No test failed in these runs, so no existing test needed changing. Afterwards: no
`[TEST-TEMP]` tasks in the dev DB, and every task's `assignee_id` matches its first person.

## What I fixed

The screenshots found all three. The specs I wrote at stop point 2 had no check that would
have caught them. All are in `7bc4b4f`.

1. **Card, title crushed (real bug).** In a day column about 115 px wide, the avatars sat
   beside the title and squeezed it to one letter per line, and "+2" ran off the card. Now
   one person stays beside the title, as before, and two or more get their own row under it.
2. **Card, initials clipped (real bug).** My 4 px overlap cut second letters, so "MM" read as
   "MV". I removed the overlap.
3. **Phone Dashboard, chips (real bug).** Five chips squeezed the title to 8 lines, then, on
   my first fix, split around it. They now move below the title as one group.

**Tests added:** a layout check in the "+N" test, and a new test for the Dashboard card,
which had no multi-person coverage. With the old layout restored, both failed; with the fix,
both passed.

## Screenshots

In `/tmp/claude-501/pwlogs/d53shots/`, all taken after the fixes, as `brewer1` with
`[TEST-TEMP]` tasks that were deleted afterwards. The script is `shots.cjs` in the same folder.

| What | Files |
|---|---|
| Dialog, list open | `dialog-desktop-list-open.png`, `dialog-phone-list-open.png` |
| Dialog, chips | `dialog-desktop-chips.png`, `dialog-phone-chips.png` |
| Cards with 2, 3 and 5 people | `board-desktop-1600.png`, `board-desktop-1280.png`, `board-phone.png`, and `board-desktop-*-card-{0,1,2}.png` (0 is five people) |
| Task menu | `menu-desktop.png`, `menu-phone.png` |
| Brewery Dashboard card | `dashboard-card.png`, `dashboard-phone-card.png` |

## Worth a look

- **"+2" wraps at the narrowest board.** At 1600 px with Unfinished and Future showing, a card
  with four or more people puts "+N" on a second row (the row has 77 px and needs 83). It's
  readable, so I left it.
- **Console errors on the board:** `<h6>` nested inside `<h1>`, on every board page I opened.
  `src/components` and `App.tsx` are unchanged on this branch, so it's probably older than
  D53, but I didn't check it on `develop` or trace it. No other console errors or sideways
  scrolling showed up.
- **Only one color mode was looked at.** I didn't check Hop Field Night.

## Handoff note and coverage

Both are updated. In the handoff note, the SHA and the full-suite result are still blank.

## LEAD: questions

None. Over to you for the full suite.

---

# Fix cycle 1

2026-11-07 · builder → lead, answering `d53_part1_lead_decisions_3.md`. Gaps 1, 2, 3, 7 and
10 are fixed, P61 and P83–P84 are changed, and the gate passes. Gaps 4, 5, 6, 8, 9 and 11
weren't touched. Not pushed. DEV wasn't touched and `E2E_TARGET=dev` was never set.

## Is it new?

**No: gaps 1 and 2 are both on `develop` before Part 1.** I read the code and ran a throwaway
test at `b3670d0`, using the hotfix's `mix.lock` so the deps matched. The worktree is removed.

| Repro | `assignee_id` | `title` | `notes` |
|---|---|---|---|
| Gap 1: 11/20 after a rule-only split at 11/18 | **Bug:** Morgan's id → Jordan's | **Bug:** T1 → T2 | Not in this repro: 11/20 counts as changed and is kept |
| Gap 2: 11/13 after this-only, split, following | **Bug:** flag cleared, overwritten | **Bug:** flag cleared, overwritten | Not in this repro: notes alone never set the flag, and own notes are skipped |

For the PR: Part 1 didn't introduce these, but it does raise the cost, because several people
can now be replaced at once.

**`title` and `notes`:** they share the same lines, so I fixed them with people. `notes` did
have a gap 1 case, which the table's repro doesn't reach: a part's notes were lost when the rule
changed from an earlier part.

## Results

Run one at a time, with `caffeinate -ims`, against this worktree's servers.

| Check | Result |
|---|---|
| `mix test`, twice (seeds 573102, 921585) | **1922 passed**, 0 failed |
| `mix format --check-formatted`, changed files | clean |
| `tsc -p tsconfig.app.json` | clean |
| `tsc -p tsconfig.e2e.json` | the same 2 errors already on `develop` |
| `vitest` | 190 passed |
| `vite build` | builds |
| `pnpm lint` | 26 errors, 1 warning (limit is 26 errors) |
| `--project setup` | 1 passed |
| `task-board-multi-assignee` | 21 passed |
| `flags-cips`, `d48-batch-changes` | 12 passed |
| P61 and P83–P84, `--repeat-each 5` | 10 passed |
| `--project brewery-board --no-deps` | **224 passed** (17.1 min) |
| `--project production --no-deps` | **157 passed** (12.4 min) |

Afterwards, in the dev DB: 0 `[TEST-TEMP]` tasks, and 0 tasks whose `assignee_id` differs from
their first person. The gap 10 test leaves its temp person deactivated, as the other specs do.

## Fixes

### Gap 1 (`1332c1f`, `50d2e89`)
- **Files:** `tasks/series.ex`, `lib/repeat.ts`, `lib/tasks.ts`, `SeriesDialogs.tsx`,
  `TaskDialog.tsx`.
- **Dates:** before the split removes anything, `held_from/4` records what each occurrence
  holds. `carry_over/4` then gives each date in the new rule:
  - its own people, title and notes, if the date survives;
  - otherwise the people of the last occurrence before it, including one the rule drops;
  - after everything already generated, the series' own values, as a top-up does.
- **Series' own list:** it comes from the chain's current part (`latest_part/1`), not the
  acted-on one, so a later part's people aren't lost.
- **What counts as a change:** compared with the occurrence the person had open, not the
  series. Naming the people 11/18 already has isn't a people change. A real change reaches
  every remade occurrence; ones kept as changed on their own keep theirs.
- **Confirm:** "Removes N later occurrences." stays, with a line under it:
  - "The new pattern remakes them: dates that stay keep their people, and a new date takes the
    people of the one before it."
  - With a people change: "The new pattern remakes them with the people you picked."
- **History:** a rule-only change reads as before. A people, title or notes change in the same
  save is now stored and shown; it used to go unrecorded.

### Gap 2 (`1e3dddb`)
- The reused anchor keeps its flag: `series_exception: task.series_exception or task.due_on != date`.
- **I found no reason to clear it.** The old line only looked at the day. `following_content`
  already keeps the flag on an exception it's edited from (S61), so a split now matches.
- A flagged anchor that also takes a people change in the same save takes it and stays flagged.
- A flagged anchor whose date the rule drops is still removed, as before.

### Gap 3 (`e237053`)
- **Over 100 distinct ids:** one 422, "A task can have at most 100 people", before any person
  lookup. Copies of one id count once.
- **100 or fewer:** the first five refusals name the person, then "95 more can't be assigned".
- **Found while testing:** a rule split silently ignored a list it couldn't read and went on to
  succeed. `Assignees.refused?/1` now refuses it there too.
- **Also changed:** several refusals now come back in the order given. They were reversed.

### Gap 7 (`932a67e`)
- `one_assignee` checks the person through `Assignees.validate/3`, so the refusal reads
  `{"errors":{"assignee_ids":["Sam Pour must be a Brewery member"]}}`. The single picker's lone
  `assignee_id` gets the same answer. The step's own route is unchanged.

### Gap 10 (`798fae8`)
- Long names wrap, so the whole name stays readable. I checked this in a 360 px screenshot, in
  light mode only.

### P61 and P83–P84 (`d9c7671`)
- **P61:** polls for the date, as you specified.
- **P83–P84 (`d48-batch-changes.spec.ts`, the brand step at line 199):** the same shape, with a
  different trigger. Picking a brand starts the save, and the next line read the batch with
  nothing waiting on the write. It now polls for `brand_id`.
- **That cause is inferred from the code.** I had no DEV failure log, and neither test failed
  locally before the change, so the five clean repeats don't prove it. Watch these on the next
  DEV run.
- **Other reads in those two files:** the rest come after a snackbar that only shows once the
  save is done, or use retrying assertions. I changed nothing else.

## Tests fail with the fix reverted

| Fix reverted | Tests run | With the fix | Reverted |
|---|---|---|---|
| Gap 3 and gap 7 together | `task_board_multi_assignee_test`, `assignees_test` | 43 passed | **4 failed:** gap 3 ×3, gap 7 ×1 |
| Gap 1 and gap 2 together (`series.ex`) | `multi_assignees_test`, `task_board_multi_assignee_test` | 90 passed | **16 failed** |
| Gap 2's line only | same | 90 passed | **4 failed:** the repro, the API repro, the title version, the flagged anchor |
| Gap 10's styling only | the Playwright case | passed | **failed:** 802 px wide in a 328 px item |

- **Gap 1 wasn't reverted on its own:** the split was gap 1 and gap 2 together, then gap 2 alone.
  The gap 1 repros are among the 16 failures, and they pass with gap 2's line in place.
- **Not every new test can fail this way:** the 100-people and "up to five" cases, for example,
  pass either way. They hold the limits in place.
- **The Playwright gap 1 case** was run with the fix only. The ExUnit repros are the proof.

**Combination tests added (ExUnit):** exception, split, following; people changed over time,
split; a split from before and from after the latest change, and across a later part with its
own people; Remove all; a dropped date as the one before; title and notes.

## LEAD: questions

1. **Should an exception pass its people to the next new date?** I followed your rule as
   written: "the last occurrence before it", so Sam on a just-this-one 11/23 also lands on the
   new Tuesday 11/24, unflagged. Finished occurrences count too. It's pinned by a test ("may be
   one changed on its own"). Title and notes do skip occurrences changed on their own, because a
   one-off note on the next date looked plainly wrong, and your rule doesn't cover them. If people
   should skip them as well, it's a small change in `carry_over/4`.
2. **Is "Removes N" good enough?** Surviving dates are still deleted and remade, so N counts
   those too: adding a Tuesday can say "Removes 151" when no date goes away. The new line explains
   it, but an exact "removes X, adds Y" means `change_preview` working out the dates, and the
   dialog asking it for every rule change. I left that out.
3. **Remade occurrences still get new ids.** As on `develop`, a surviving date keeps its people,
   title and notes, but its History stays under the old id and it goes to the bottom of its day.
   Moving those occurrences into the new series would fix that, but it's a redesign of the split,
   so I didn't do it.

## Corners left as they are

- "The chain" here is the acted-on series and what continues it, as everywhere else in
  `series.ex`. A kept occurrence left in an older part isn't seen as "the one before".
- If an occurrence changed on its own was moved to another day and kept, a new occurrence on its
  old date takes its people, because lookups go by `series_date`.

## Also on the branch

`98d3bee` (docs: Part 1 QA follow-ups go in Part 2) landed on this branch during the cycle. It
isn't from this work, and it only changes the spec.

---

# Lead decisions 4

2026-11-07 · builder → lead, answering `d53_part1_lead_decisions_4.md`. Decision 1 is done
(`423fe00`). Decisions 2 and 3 needed no work: no `change_preview` change, and remade occurrences
still get new ids. Not pushed. DEV wasn't touched. The wider suites weren't run, as you said.

## What changed

A new date now takes the people of the last occurrence before it that wasn't changed on its own.
A finished occurrence still counts, unless it's also an exception. If there's none, it takes the
series' own values. Surviving dates are unchanged: each keeps what it held, exception or not.

## Where I went beyond or away from the decision

1. **People go by the exception flag, not `changed?/2`, so they don't quite "match title and
   notes".** `changed?/2` also counts an occurrence whose notes differ from its series part's, and
   that includes every earlier occurrence once a "following" edit changes the notes. Using it for
   people brings gap 1 back: Sam from 11/16, then Kate with new notes from 11/23, and a new 11/17
   skips Sam's dates and gets Kate. A test pins this, and break B below shows it.
2. **Title now goes by the flag too.** It had the same problem, and it's the same lookup. Notes
   still use `changed?/2`, so one person's note isn't copied. This has a limit: a new date among
   occurrences with older notes takes the series' current notes.
3. **The search looks back past the split's date.** If the anchor is the exception, nothing from
   the split on qualifies, and the series' own values would be the latest people, not those of that
   time. So it also checks the last unflagged occurrence before the split, through the earlier parts
   of the main line. "Only exceptions before it" therefore means none in the whole line.
4. **The confirm's wording was now wrong, so I changed it:** "dates that stay keep their people, and
   a new date takes the people of the last one before it not changed on its own." It's longer than
   I'd like, so reword it if you prefer. Vitest and Playwright assert the exact text.

## Tests

The pinned test is now "an exception doesn't pass its people to a new date", with the opposite
assertion. That's the one change of meaning, as the decision asks. No test was deleted or weakened.
Added: going back past an exception, a flagged anchor, only exceptions before it, finished, finished
exception, older notes, an exception's title.

Broken on purpose, then restored, running `multi_assignees_test` and
`task_board_multi_assignee_test` (97 pass with the code as it is):

| Break | Tests failing |
|---|---|
| A: people from the last occurrence, exception or not (the old rule) | **5:** exception, going back, only exceptions, finished exception, flagged anchor |
| B: skip by `changed?/2` instead of the flag | **1:** older notes |
| C: no look back before the split | **1:** flagged anchor |
| D: finished occurrences don't count | **1:** finished |

## Gate

| Check | Result |
|---|---|
| `mix test`, twice (seeds 23752, 535837) | **1929 passed**, 0 failed |
| `mix format --check-formatted`, changed files | clean |
| `tsc -p tsconfig.app.json` | clean |
| `tsc -p tsconfig.e2e.json` | the same 2 errors already on `develop` |
| `vitest` | 190 passed |
| `vite build` | builds |
| `pnpm lint` | 26 errors, 1 warning (limit is 26 errors) |
| `task-board-multi-assignee` | **21 passed** |

Afterwards, in the dev DB: 0 `[TEST-TEMP]` tasks, and 0 tasks whose `assignee_id` differs from their
first person.

## LEAD: questions

None. Please check item 1, since it departs from your wording.

---

# Lead decisions 5

2026-11-07 · builder → lead, answering `d53_part1_lead_decisions_5.md`. Fix `1bf7b25`, wording
`b77bbbe`. Not pushed. DEV wasn't touched.

## S139: the cause

**The cause is in the app, but not in Part 1 or the board.** It's the settings menu (D52's
`SettingsGear`), and the same code is on `develop`. When the menu closes, MUI's focus trap gives
focus back to the gear with a plain `focus()`, with no `preventScroll`. The gear is at the top of
the page, so the browser scrolls back up to it. Picking Monday re-renders the range while the menu
is still open, and `PhoneVerticalView`'s one-time `scrollIntoView` moves today to the top. If that
happens before the menu closes, closing it undoes the scroll. It's visible to users: someone who
picks Monday and then closes the menu lands back at the top, not on today.

Measured with a throwaway probe (6 runs of S139's steps, deleted afterwards). Each frame it logged
`scrollY`, today's top, the page height and the focused element, and it wrapped `scrollIntoView`,
`focus()` and `fetch`. A failing run:

```
2449 scrollIntoView day-2026-11-07
2486 scrollY=2340 todayTop=0    h=5845 focus=board-first-day
2509 focus() board-settings preventScroll=undefined        ← the menu closes
2513 scrollY=0    todayTop=2340 h=5845 focus=board-settings
```

That happened in 5 of 6 runs. In the one that passed, the menu closed before the range
re-rendered, so the scroll came last. Whatever the order, the board's height stayed the same
(5800 → 5845 at the re-render, then steady), so nothing above today grew.

Ruled out:
- **The scroll before the data, or a refetch.** A cold load with Monday already saved (4 runs):
  the grid renders only once its data has loaded, the scroll lands today at the top, and nothing
  moves in the next 3 s. The second `scrollIntoView` in each run is StrictMode in dev.
- **Part 1's extra height** (the seed row, the people row). The height doesn't change after the
  scroll, and the scroll does put today at the top. Only the focus restore moves the page.
- Why this branch failed more often than `develop`: the menu code is the same on both, so it's
  timing (which comes first, the re-render or the close). I didn't measure `develop`.

## The fix

`SettingsGear` (`components/SettingsMenu.tsx`) turns off MUI's restore (`disableRestoreFocus`).
When the menu closes, it focuses the gear itself with `{ preventScroll: true }`, but only when
focus is still in the menu (or on the body). An item that closes the menu and opens a dialog
leaves the dialog's focus alone. The keyboard behaves as before (Escape returns to the gear). No
re-scroll was added, so nothing fights someone who has started to scroll. This covers all seven
pages that use the gear.

| S139, `--repeat-each 20 --workers 1` (Saturday 2026-11-07, Monday first) | Result |
|---|---|
| Before (fix reverted with `git apply -R`; this is the revert check) | **7 of 20 failed**, all `viewport ratio 0` |
| After | **20 of 20 passed** |

The lead's earlier numbers were 4 of 8 on this branch and 1 of 12 on `develop`. No new test: S139
catches it once the menu's timing loses the race, which happened 7 times in 20.

## The confirm's wording

`ruleChangeNote(false)` now reads: "The new pattern remakes them. Dates that stay keep their
people. New dates take them from the last regular occurrence." I kept the opening "The new pattern
remakes them" and put your sentence where my item 4 text was. The Vitest
(`repeat.test.ts`) and Playwright (`task-board-multi-assignee.spec.ts:262`) assertions are updated.

## Tests

None deleted or weakened. Two assertions changed text (the wording above).

## Gate

| Check | Result |
|---|---|
| `mix test` | **1929 passed**, 0 failed |
| `tsc -p tsconfig.app.json` | clean |
| `tsc -p tsconfig.e2e.json` | the same 2 errors already on `develop` |
| `vitest` | 190 passed |
| `vite build` (`pnpm build`) | builds |
| `pnpm lint` | 26 errors, 1 warning (unchanged; the changed files are clean) |
| `task-board-multi-assignee` + `task-board-phone` + `task-board-follow-ups` (`brewery-board`, one worker) | **59 passed** |

The persona tokens had expired (minted at 11:49), so I re-ran the `setup` project before the
Playwright runs. Afterwards, in the dev DB: 0 `[TEST-TEMP]` tasks, and 0 tasks whose `assignee_id`
differs from their first person.

## LEAD: questions

None. The fix is in shared D52 code (the gear on all seven pages), not in the board. Tell me if
you'd rather it went to `develop` separately.
