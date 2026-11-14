# D56 handoff note and LIMITATIONS (PR description, draft)

**Deliverable:** D56, production timing: pre-brew steps, test results and retests (was D57,
task 5208), and the small items (5207 "Label by" and the settings refresh, 5210, 5211, 4950).
5791 (Boards due date) ships with it.
**Spec:** `docs/current_work/specs/d56_production_timing_spec.md`, decisions 1–27, S1–S21.
**Plan:** `docs/current_work/planning/d56_production_timing_plan.md`; brief
`docs/current_work/prompts/d56_builder_brief.md` (Stages 1–5, DEV fix cycles 1–4).
**Branch:** `d56-production-timing`, from `develop`.
**SHA for DEV:** __SHA__
**Local gate:** green on `3e1ddd9` (see "Local gate" below).

## What changed

Scenario → test is in `rockcut-ui/tests/COVERAGE.md` (D56).

| Area | Change | Scenarios |
|---|---|---|
| Pre-brew steps | A template step may sit at day −1 to −30: plain steps only (a Transfer, Split, Package, CIP, brew day or phase marker is refused with why), in the first tank, no phase. On the Gantt the dot is left of brew day; it moves with brew day (either answer) and never onto or past it; ticking it doesn't brew the batch. Once one is done, brew day can't move before its done day (the same day is fine) by any path: "<step> was done <day>; brew day can't be before it." A step is pre-brew because it was planned so (a template's negative day, Add step before brew day, a pre-brew test's retest before it), not by its date: a step left before brew day some other way is an ordinary step, out of order and flagged. Brew day can't move on or after a finished step that follows it: "<step> was done <day>; brew day can't be after it." | S1–S6, decisions 1, 2, 7, 10–13, 21–23 |
| Test results | A step type can have a result ("Has a result", any type, built-in too). Check-off asks Pass / Fail; a Fail asks Retest in N days (1–30, from the template step's "Retest after") or Continue as planned. A retest is added after the test and the following steps are offered to move with it. Where a retest can't go (decision 15) only Continue is offered, with why | S7–S10, S12–S15, decisions 3–9, 14, 15 |
| Showing results | ✓ / ✗ on the dot, "· passed / · failed" in the expanded rows and tooltips, the step and batch dialogs, "Retest of …", "Change to Pass / Fail", the Brewery board's "✓ Pass", "✗ Fail · retest Wed Dec 16", "✗ Fail · continued as planned" | S8, S9, S12, decisions 14, 17 |
| Repeated fails | Three Fails in a row raise "<batch> · 3 failed Diacetyl tests"; a sign-off holds until another Fail | S11, decision 16 |
| Mark not done | On a failed test whose retest is open: asks first, and the retest goes. A done retest refuses ("Mark the retest not done first."). It, and Fail → Pass, put the steps the Fail moved back to their dates before the Fail, counted from where the test is now, even if moved since; a done one keeps its day and gets that as its planned day. Refused if that would leave a step before brew day that can't be there. On a brew day that a finished pre-brew step holds in place: "Mark <step> not done first." | decisions 8, 20, 24 |
| Move prompt after a retest | "<test> failed · retest <day>", "<batch> · retest <day>", "Move them with the retest, N days later" / "Keep the following steps' dates". Ordinary moves read as before | S8 (Stage 5 A2) |
| Label by (5207) | An expanded tank with two or more batches in range gets a picker on its first step row: that batch's rows by name only, the others "step · batch" | S16 |
| Gantt view on the account | The expanded tanks, Label by and the Tanks setting's "Your selection" mix are saved in D58's board settings under `production` (`PUT /api/me/board_settings/production`, `expanded`, `label_by`, `mix`), for anyone who reads the schedule and the brewhouse device. A browser's old local values carry over once (only what the server lacks), then local storage isn't used for them. Range, zoom and names-only stay per browser | S16, decisions 18, 19 |
| Settings refresh (5207) | Back on the screen, `/api/me` is re-read at most once a minute: board settings, theme, Show planned batches, the Gantt view. A setting being saved here keeps this page's value; a failure is silent | S17 |
| Template Save (5210) | A template step and its new links save in one PATCH, each link in a savepoint; a refused link saves nothing and names itself ("Leads to Carb: …") | S18 |
| Batch dialog (5211) | A step's name opens its step dialog, so a step taken off the task list is reachable and can be put back | S19 |
| Undo snackbar (4950) | Ctrl/Cmd+Z runs the live Undo (outside text fields), with a "⌘Z / Ctrl+Z" hint on a mouse; over a dialog it stays until its Undo runs out; always at the bottom, and a dialog under it gets that much bottom room, so its title and buttons stay clear and clickable (lead decision, D49 QA 4) | S20, D49 QA 4 |
| Boards due date (5791) | Saved on leaving the field, not per keystroke | S21 |

**API, additive:** step types `has_result`; template steps and schedule steps `retest_days`;
schedule steps `result`, `retest_of_id`, `pre_brew`; previews `needs_result`, `retest_days`,
`retest_allowed`, `retest_on`; `PATCH /api/production/steps/:id/result`; the board task's
`production` gains `result`, `retest_on`, `retest_done`; flag kind `failed_tests`;
`board_settings.production` (`expanded`, `label_by`, `mix`). New errors: `result_required`, `retest_not_here`,
`not_before_brew`, `before_brew_day`, `after_done_step`, `pre_brew_done`, `brew_first`, `link_invalid`, and the template link refusals with
`link`. `POST /api/production/batches/:id/shift` takes `preview: true` (nothing written,
`{ data: { preview: { moved, kept } } }`, refused as the move would be).

**Migration:** `20261112120001_add_test_results` (additive). It switches on Diacetyl test and
Gravity check by name; a type renamed on prod stays off (see LIMITATIONS). Rollback to the
previous image leaves the columns, which it ignores.
`20261114120001_add_pre_brew_to_production_steps` (additive, decisions 22, 25): `production_steps.pre_brew`,
backfilled in order: a step copied from a template step at a negative day; an added step (not a
retest), plain or custom, due before its batch's first Brew day; then every retest cleared
(decision 25). Steps left before brew day any other way stay ordinary. Edited in place in fix
cycle 4 (not yet on prod): a database that ran the earlier draft gets the right values from
`mix ecto.rollback --step 1 && mix ecto.migrate` (the column is derived, nothing else is lost).
The same rollback note applies.

**No restart notes:** nothing new in the environment or secrets.

## Local gate

- `MIX_ENV=test mix test`: 2443 passed, twice (and three times before the last UI changes)
- `mix compile --warnings-as-errors`: clean
- `npx tsc --noEmit -p tsconfig.app.json`, `pnpm exec vite build`: clean
- Vitest: 335 passed (27 files)
- `pnpm lint`: 27 problems (26 errors, 1 warning), the same as `develop`, none in D56's files
- full `npx playwright test` after the lead's reseed (tokens minted first): run 1, 508 passed,
  1 failed (D48 M3, out of date since decision 13; spec updated), 276 not run behind it; run 2,
  **782 passed, 1 skipped, 1 failed, 2 not run**. The failure is flaky: `beer-board-import` S22
  timed out loading the beer board (5 s) under the full run's load, then the file passed 11/11
  twice on its own. The 2 not run are `board-replace` (it waits for `chromium`): 2/2 passed run on
  their own. The skip is `smoke/roles` "DEV shows the banner" (DEV only).

**Revert-and-rerun** (each fix's test fails without it):

- 5210: ExUnit `production_controller_test` gets 200 instead of 422.
- 5211: Playwright S19 stops at the step dialog (the name doesn't open it).
- 4950: Playwright S20 stops at the first check: the snackbar at 24 px, over the dialog's title.
- The dialog's bottom room: Playwright D49 QA 4 fails on "Schedule this batch" under the snackbar.
- The refresh (listener off): Playwright S17's second browser keeps the Planned batch card.
- 5791: done at the time (`boards-scenarios`).

**Existing specs changed:**

- `regression/settingsMenu.ts`: `pickSetting` waits for the Gantt's Tanks save, now a server
  write.
- `production/d49-pencilled.spec.ts` QA 4: was "clear of the batch dialog's buttons" with the
  snackbar at the top; now the snackbar is at the bottom and checked clear of the title and of
  Schedule this batch, Delete and Close, all three clickable.
- `production/d48-fix-cycle-1.spec.ts` M3: a custom step a day before brew day is accepted now
  (decision 13); a Set temp there is `not_before_brew`.

- `production/d48-toolbar.spec.ts`, `gantt.spec.ts`, `steps.spec.ts` (decision 19): the open
  tanks and the mix are on brewer1's account now, so they put them back to none
  (`resetGanttView`; `d48-toolbar` before and after each test, since P119 starts with "no mix
  yet").

No other spec expected the snackbar at the top or hiding over a dialog.

**Decision 19 follow-up** (after the gate above): `mix test` 2443 passed twice; Vitest 336;
tsc, build clean; lint 27 as before. Playwright `production` project: 198 passed, 1 failed
(S20, the snackbar gone before 7 s once; then 4/4 alone and 3/3 with its file: flaky). The
`pickSetting` specs elsewhere and `task-board-d56`: brewery-board 83, d58 `settings` 13,
`ui/schedule` 9, all passed.

## DEV fix cycles

**Fix cycle 1** (QA pass 1, `d56_dev_qa_report.md`; DEV at `9bc352d`, then `9f5fa20`):

- Gap 1: a menu opened under the Undo snackbar ends above it (`89adf6d`).
- Gap 2: a multi-select drag's hint says why it would be refused (`bbe1981`, `9bc352d`).
- Gap 5: a template step before brew day with a phase or in a later tank says which (`8b806cb`).
- Gap 6: Add step names a refused link, and the dialog reloads after a refusal (`2e96fde`).
- Gap 4, decision 20: Mark not done and Fail → Pass put the steps a Fail moved back to their
  dates before the Fail, even if moved since; done ones stay; D49 QA 1 unchanged for an
  ordinary off-plan check-off (`75d6aa5`; the Playwright reload race fixed in `740605b`).
- Gap 3, decision 21: brew day can't move before a finished pre-brew step's done day: drag, date
  box, multi-select, an off-plan brew-day check-off and the bar drag (`Batches.shift`), with the
  preview, the move prompt and the drag hints (`9f5fa20`). Code `before_brew_day`.

**Fix cycle 2** (QA recheck, `d56_dev_qa_recheck_report.md`):

- Gap 8 (decision 20 clarified): the put-back counts from where the test is now: the record's
  dates move as far as the test has since the Fail (a whole-batch move of a planned batch moves
  the done test; dragging the retest doesn't). A Pass → Fail after such a move counts from there
  too. If the result would leave a step before brew day that can't be there, Mark not done /
  Change to Pass is refused (`not_before_brew`, 422) and nothing changes.
- Gap 7: a step the Fail moved that was done since gets its planned day put back the same way,
  so a later Mark not done of it lands in order; the steps put back with it leave its record.
- Gap 9 (decision 21 clarified): brew day on the finished pre-brew step's done day is allowed;
  only before it is refused. Server, bar drag, preview and hints, either tick order.
- `POST /batches/:id/shift` honors `preview: true`.

Commits: `9aea517` (gaps 8, 7; its `steps.ex` also has gap 9's one-line server change),
`a988784` (gap 9; its `batches.ex` also has the shift preview), `b8f60d4` (shift preview).

Gate: `mix test` 2462 passed, twice; `mix compile --warnings-as-errors` clean; tsc, build clean;
Vitest 342; lint 27 as before; Playwright `production` 204 passed, `brewery-board` 433 passed.

**Revert-and-rerun:**

- Gap 7 (the done follower's planned day not put back): its 2 ExUnit tests fail (Mark not done
  and Fail → Pass); the rest pass.
- Gap 8 (no rebase, no refusal): 3 ExUnit fail (bar shift → Mark not done, → Pass, and the
  refusal). The date-box Move all variant passes either way: brew day's Move all stops at the
  done test, so the test doesn't move and there is nothing to count from.
- Gap 9 (back to "on or before"): 4 ExUnit, 2 Vitest and the Playwright date-box spec fail.

**Fix cycle 3** (QA recheck 2, `d56_dev_qa_recheck2_report.md`; decisions 22–24):

- Gap 11 (decision 22): pre-brew by origin (`pre_brew`, the migration above). `Steps.pre_brew/1`,
  the brew-day move, decision 21's check, "A pre-brew step stays before brew day", the bar drag,
  Change template, the move preview and the drag hints use it, not the date. The Gantt draws
  every dot on its date as before, so a step left before brew day still shows there, flagged.
- Gaps 10, 11 (decision 23): a brew-day move (drag, date box, multi-select, an off-plan brew-day
  check-off, a Mark not done that would put brew day back) on or after a finished step that
  isn't pre-brew is refused, 422 `after_done_step`, in the preview and the hints. The bar drag
  can't reach it (a planned batch's done steps move with the bar; a brewed batch's brew day
  doesn't move). The date box asks the move question whenever unfinished steps follow brew day.
- Gap 12 (decision 24): Mark not done on a brew day that a finished pre-brew step holds is 422
  `pre_brew_done`, "Mark <step> not done first."

Commits: `0dc7aba` (decisions 22–24, migration, ExUnit and Vitest), `8de8998` (Playwright).

Gate: `mix test` 2475 passed, twice; `mix compile --warnings-as-errors` clean; tsc, build clean;
Vitest 344; lint 27 as before. Playwright `production`: 204 passed, 2 failed, both seed-dated
(P49–P51 and P46 in `gantt.spec.ts` expect the seed's FV4 Set temp 58° due today; the local DB
was seeded 2026-11-13, so it was due yesterday; they need a reseed, not a code change).
`brewery-board` (it depends on `production`, so run with `--no-deps`): 229 passed. The local dev
DB took the migration first (lead).

**Revert-and-rerun:**

- Decision 22 (pre-brew by date again): 2 ExUnit, 1 Vitest and the second gap 11 Playwright
  (a step moved before brew day stays) fail.
- Decision 23 (the check off): 7 ExUnit, 1 Vitest and the first gap 11 Playwright (date box onto
  the done test) fail.
- Decision 24 (the old message): 2 ExUnit fail.

**Existing tests changed:** cycle 2's "restore refused" ExUnit sets brew day's date directly (as
data from before decision 23), since decision 23 now refuses the move it used; it also checks
that refusal. The Vitest fixtures mark the planned pre-brew step `pre_brew`.

**Fix cycle 4** (QA recheck 3, `d56_dev_qa_recheck3_report.md`; decisions 25–27):

- Gap 14 (decision 25): a retest is never pre-brew, whatever it retests; it stays on its day when
  brew day moves, and anything out of order is flagged. The migration is edited (above).
- Gap 13 (decision 26): checking off a step that isn't pre-brew and isn't a Brew day while the
  batch's first Brew day ("1 of 2" on a two-day brew; a part's: its parent's) isn't done is
  refused, 422 `brew_first`, "Brew day comes first. <step> can't be done before it." It's in the
  check-off order rules, so the Gantt, the dialogs, the board tick, the device, the preview and
  Undo all obey it. A pencilled batch still says `schedule_first`; a Transfer/Filter, Split or
  Package still says "Check off brew day first." (`before_brew_day`, D48), both checked first.
  Standalone CIPs aren't held.
- Decision 27: no change; a comment where the bar drag skips decision 23, and a test naming it.

Commits: `0bd43cb` (decisions 25–27, the migration edit, tests and spec updates).

Gate (local reseeded first, `mix rockcut.synthetic.setup`): `mix test` 2482 passed, twice;
`mix compile --warnings-as-errors` clean; tsc, build clean; Vitest 344; lint 27 as before.
Playwright `production` + `brewery-board` together: 434 passed, 1 failed, S140
(`task-board-follow-ups`, a board-settings test, not D56's area) timed out once under the full
run, then passed twice alone: flaky. Before that, `production` alone had flagged P133 and the gap
11 date-box test (decision 26 fallout, fixed above; both then passed).

**Revert-and-rerun:**

- Decision 25 (the retest flagged again, the migration's old rule 3): 2 ExUnit fail (QA's gap 14
  path, the backfill).
- Decision 26 (the check off): 10 ExUnit fail (context, schedule, board tick, device, Undo,
  Matt's two-day case).

**Existing tests changed for decision 26** (they checked off a post-brew step before brew day):

- ExUnit: `schedule_test` P35 (brews first); `split_moves_test` Y2 (other steps now refused too);
  `pre_brew_test` decision 13 off-plan check-off (brews first; refused as `brew_first` before) and
  the decision 22 FDH step (`brew_first` now); `test_results_test` gap 8 / decision 23 setups
  (brew → Fail → brew day marked not done, `failed_then_unbrewed`); the decisions 23, 24
  controller test (the same way).
- Playwright: `d49-pencilled` P133 (a planned batch with a done step: brew day, FDH, then brew
  day marked not done) and the DEV gap 11 date-box test (the same).

## LIMITATIONS (what local can't tell)

From the plan:

- Ctrl/Cmd+Z inside an MUI dialog on a real Chrome build, and the snackbar's position on the
  Samsung tablet's landscape screen.
- `visibilitychange` on an installed PWA brought back after hours. Locally it's fired from a
  test.
- The `has_result` migration against prod's real type names: a renamed Diacetyl test or Gravity
  check stays off. Matt checks Brewery → Production → Phases & steps after the release.
- The pre-brew dot beside another batch's dots at the 2-week zoom on the tablet's touch row
  height.

Found in the build:

- **Ctrl/Cmd+Z works only while the snackbar shows its Undo:** 6 seconds with no dialog open,
  though the server keeps the Undo for 2 minutes (lead: accepted).
- **Range, zoom and names-only stay per browser.** Decisions 18 and 19 moved the expanded tanks,
  Label by and Your selection.
- **The brewhouse device's Gantt view is the device's,** shared by everyone using it.
- **The carry-over runs once per person per browser.** A second browser with older local values
  fills only what the server still lacks.
- **The pickers offer only links that can be made,** so a 5210 refusal needs a race (another
  session linking first). S18 makes one through the API.
- **S7 turns "Has a result" on for a `[TEST-TEMP]` type, not Rouse,** so the seed's types stay as
  they are for other specs and DEV.
- **The refresh is once a minute:** a change made elsewhere within a minute of the last read
  waits for the next return to the screen.
- **The snackbar's room is padding on every open dialog** while it shows over one: a tall dialog
  gets shorter (its content scrolls) for as long as the Undo lasts, up to 2 minutes.
- **Brew day short of a finished pre-brew step's done day is still refused,** even when the move
  is toward it (an overdue brew day with the pre-brew step ticked late: +1 is refused, the same
  day works). Decision 21 as written; decision 23 is the same the other way round.
- **A pre-brew test's retest waits for brew day** (decisions 25 and 26 as written): it isn't
  pre-brew, so it can't be checked off before brew day. For the lead.
- **Marking brew day not done isn't refused while a later step is done** (decision 26 covers
  check-offs only), which is how the specs above reach a planned batch with a done step.
- **The backfill can't tell an added step that was moved before brew day from one added
  there:** an added plain or custom step dated before brew day on DEV or prod counts as
  pre-brew.
- **An ordinary off-plan check-off's own date isn't counted from a later whole-batch move**
  (D49 QA 1 unchanged); only a Fail's record is. Its Mark not done is now refused, not silent,
  if it would leave a step before brew day that can't be there.
- **`beer-board-import` S22 can time out loading the board under a full local run** (flaky,
  above); not D56's area.
