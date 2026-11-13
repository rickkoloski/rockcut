# D56 handoff note and LIMITATIONS (PR description, draft)

**Deliverable:** D56, production timing: pre-brew steps, test results and retests (was D57,
task 5208), and the small items (5207 "Label by" and the settings refresh, 5210, 5211, 4950).
5791 (Boards due date) ships with it.
**Spec:** `docs/current_work/specs/d56_production_timing_spec.md`, decisions 1–18, S1–S21.
**Plan:** `docs/current_work/planning/d56_production_timing_plan.md`; brief
`docs/current_work/prompts/d56_builder_brief.md` (Stages 1–5).
**Branch:** `d56-production-timing`, from `develop`.
**SHA for DEV:** __SHA__
**Local gate:** green on `3e1ddd9` (see "Local gate" below).

## What changed

Scenario → test is in `rockcut-ui/tests/COVERAGE.md` (D56).

| Area | Change | Scenarios |
|---|---|---|
| Pre-brew steps | A template step may sit at day −1 to −30: plain steps only (a Transfer, Split, Package, CIP, brew day or phase marker is refused with why), in the first tank, no phase. On the Gantt the dot is left of brew day; it moves with brew day (either answer) and never onto or past it; ticking it doesn't brew the batch | S1–S6, decisions 1, 2, 7, 10–13 |
| Test results | A step type can have a result ("Has a result", any type, built-in too). Check-off asks Pass / Fail; a Fail asks Retest in N days (1–30, from the template step's "Retest after") or Continue as planned. A retest is added after the test and the following steps are offered to move with it. Where a retest can't go (decision 15) only Continue is offered, with why | S7–S10, S12–S15, decisions 3–9, 14, 15 |
| Showing results | ✓ / ✗ on the dot, "· passed / · failed" in the expanded rows and tooltips, the step and batch dialogs, "Retest of …", "Change to Pass / Fail", the Brewery board's "✓ Pass", "✗ Fail · retest Wed Dec 16", "✗ Fail · continued as planned" | S8, S9, S12, decisions 14, 17 |
| Repeated fails | Three Fails in a row raise "<batch> · 3 failed Diacetyl tests"; a sign-off holds until another Fail | S11, decision 16 |
| Mark not done | On a failed test whose retest is open: asks first, and the retest goes. A done retest refuses ("Mark the retest not done first.") | decision 8 |
| Move prompt after a retest | "<test> failed · retest <day>", "<batch> · retest <day>", "Move them with the retest, N days later" / "Keep the following steps' dates". Ordinary moves read as before | S8 (Stage 5 A2) |
| Label by (5207) | An expanded tank with two or more batches in range gets a picker on its first step row: that batch's rows by name only, the others "step · batch" | S16 |
| Gantt view on the account | The expanded tanks and Label by are saved in D58's board settings under `production` (`PUT /api/me/board_settings/production`, `expanded`, `label_by`), for anyone who reads the schedule and the brewhouse device. A browser's old local values carry over once (only what the server lacks), then local storage isn't used for them. Range, zoom, names-only and the Tanks "Your selection" mix stay per browser | S16, decision 18 |
| Settings refresh (5207) | Back on the screen, `/api/me` is re-read at most once a minute: board settings, theme, Show planned batches, the Gantt view. A setting being saved here keeps this page's value; a failure is silent | S17 |
| Template Save (5210) | A template step and its new links save in one PATCH, each link in a savepoint; a refused link saves nothing and names itself ("Leads to Carb: …") | S18 |
| Batch dialog (5211) | A step's name opens its step dialog, so a step taken off the task list is reachable and can be put back | S19 |
| Undo snackbar (4950) | Ctrl/Cmd+Z runs the live Undo (outside text fields), with a "⌘Z / Ctrl+Z" hint on a mouse; over a dialog it stays until its Undo runs out; always at the bottom, and a dialog under it gets that much bottom room, so its title and buttons stay clear and clickable (lead decision, D49 QA 4) | S20, D49 QA 4 |
| Boards due date (5791) | Saved on leaving the field, not per keystroke | S21 |

**API, additive:** step types `has_result`; template steps and schedule steps `retest_days`;
schedule steps `result`, `retest_of_id`; previews `needs_result`, `retest_days`,
`retest_allowed`, `retest_on`; `PATCH /api/production/steps/:id/result`; the board task's
`production` gains `result`, `retest_on`, `retest_done`; flag kind `failed_tests`;
`board_settings.production`. New errors: `result_required`, `retest_not_here`,
`not_before_brew`, `before_brew_day`, `link_invalid`, and the template link refusals with
`link`.

**Migration:** `20261112120001_add_test_results` (additive). It switches on Diacetyl test and
Gravity check by name; a type renamed on prod stays off (see LIMITATIONS). Rollback to the
previous image leaves the columns, which it ignores.

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

No other spec expected the snackbar at the top or hiding over a dialog.

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
- **The Tanks "Your selection" mix, range, zoom and names-only stay per browser.** Decision 18
  moved only the expanded tanks and Label by.
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
- **`beer-board-import` S22 can time out loading the board under a full local run** (flaky,
  above); not D56's area.
