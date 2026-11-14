# D56 builder brief — Stage 1 (Pre-brew steps, API)

2026-11-12 · lead → builder.

**Read first:** `docs/current_work/specs/d56_production_timing_spec.md` (approved, decisions
1–10) and `docs/current_work/planning/d56_production_timing_plan.md`. This brief covers **plan
Stage 1 only** (spec §3.1, server side). Stop after it and report.

**Context you need:** D56 absorbed D57 (test results, Stages 3–4) and dropped multi-day steps;
ignore anything about multi-day in the git history. The branch already holds an unrelated
Boards fix (`d627538`, 5791). Leave it alone.

**Where:** `~/src/rockcut`, branch `d56-production-timing` (checked out; don't switch). Small
commits (`feat: D56 …`), staging paths by name. No push, merge or rebase. The lead runs the
servers (API :4002, UI :5174). Ask with `LEAD:` if you need a restart or a migration on the dev
DB. **Only `mix format` the files you change** (a repo-wide format reflows the legacy tree).

## Do

1. **Validation** (spec §3.1; decisions 7, 10):
   - `TemplateStep.changeset`: `day_offset` −30…365.
   - Negative offset only for a plain step type or a custom step, with no phase and vessel 0.
     Otherwise 422 `not_before_brew`, "A <type name> can't be before brew day." The type is set
     outside the changeset (in `Production`), so put the check where the type is known. That
     includes changing the type or the day of an existing template step.
   - Confirm the template's first Brew day must still be at day 0. If nothing enforces that
     today, say so in `LEAD:`. Don't add it on your own.
2. **Copying:** `Batches.copy_steps!/4` should already work. Prove it with a test. Confirm that
   `add_package_cips!` and the two-day brew's "2 of 2" don't pick up a pre-brew step.
3. **Moves with brew day** (decision 2):
   - Add a helper for the batch's **unfinished** steps due before its first Brew day (dates as
     they are before the write).
   - In `Steps.move/3`: when the first Brew day is among the moved steps, its batch's pre-brew
     steps move by the same days. They don't count as "following" steps for the prompt, and they
     move whatever the answer is (including `move_only`).
   - The same goes for a Brew day check-off on another day (`Steps.complete/4`'s off-plan move)
     and the batch dialog's date box, whichever function that is. Reuse the move plan/changes;
     don't write a second move engine.
   - The whole-batch drag (`BatchChanges`) should already move every unfinished step. Confirm it
     with a test.
   - Split parts: a pre-brew step belongs to the root batch. Confirm that a split part's moves
     don't touch it, and that moving the root's brew day does.
4. **Refusals:**
   - Moving a pre-brew step itself to the first Brew day or later is 422 `before_brew_day`, "A
     pre-brew step stays before brew day."
   - `preview: true` returns the same refusal, so the Gantt drag hint can show it in Stage 2.
     Check what shape the drag hint reads today and match it.
   - The same for any write path that sets a step's date: the date box, and Undo restoring rows.
     (Undo restores the previous valid state, so it
     should be fine. Confirm it.) A pre-brew step checked off on or after brew day is the open
     question below.
5. **Check-off** (spec §3.1, as corrected): a pre-brew step on a **planned** batch can be checked
   off, with no batch-number prompt and no fill. Confirm that `check_off_order!` doesn't block it.
   A pencilled batch still gets `schedule_first`.
6. **No tank time:** tests showing that a pre-brew step doesn't change `Parts.part/2`'s
   `start`/`end`, doesn't create an overlap flag with a batch that leaves the tank the day before
   brew day, and doesn't change `TankStatus`.
7. **Task wording:** `TaskLink` gives a pre-brew step a task worded with vessel 0's tank (or
   "Unassigned"), with the Planned batch marking. Test it.
8. **Undo:** a brew-day move that carried pre-brew steps is undone in full (both come back).

## LEAD: questions to raise, not decide

- A pre-brew step **checked off late, on or after brew day**: should the check-off be refused,
  or allowed with the step left on its planned day (done_on recorded)? Leave today's behavior in
  place for that one case, report what it is, and carry on with the rest. The lead asks Matt.

## Don't

- No UI (Stage 2), no test results (Stage 3), no small items (Stage 4), no Playwright yet.
- Don't touch `CLAUDE.md`, the spec, the plan or the handoffs.

## Done when

`MIX_ENV=test mix test` green twice, `mix compile --warnings-as-errors` clean. Commits on the
branch. Reply with: commits, files, test counts, the answer to the check-off question, and
`LEAD:` notes.

---

# Stage 1 follow-ups, then Stage 2 (Pre-brew steps, UI)

2026-11-12 · lead → builder. Stage 1 is in (`d3f8bad`, `00ecabc`; lead re-ran `mix test`: 2398
passed). Your LEAD notes 1, 3, 4 and 5 are accepted as built ("No tank" wording is now in the
spec). Matt answered note 7 (spec decisions 12 and 13). Do **A** first, then **B**, then stop
and report.

## A. Stage 1 follow-ups (API)

1. **Decision 12, Change template keeps a finished pre-brew step.** On a planned batch, Change
   template keeps each **done** pre-brew step: still done, on its day.
   - If the new template has a pre-brew step of the same type, the kept step takes its place.
     It gets that template step's `template_step_id` and links, and no duplicate is created.
     Match each new template step at most once, earliest day first.
   - Otherwise it stays as an added step (`added: true`, no `template_step_id`, no links).
   - Unfinished pre-brew steps are rebuilt as today. Undo restores the whole change.
   - ExUnit: same type in the new template; no match; two done pre-brew steps of one type
     against one template step.
2. **Decision 13, the template rule on batches.** On a batch, a step that isn't plain or custom
   can't end up before the first Brew day. That applies to a move (drag, date box,
   multi-select), an off-plan check-off and Add step. Phase markers count as "not plain". The
   refusal is 422 `not_before_brew` with the template's message.
   - Add step: a plain or custom step before brew day is now **allowed** (it's a pre-brew step).
     D48's "A step can't come before brew day." stays for the other types, under the new code
     and message.
   - A `move_all` that carries non-plain followers before brew day is refused the same way.
   - ExUnit for each path, and the preview's refusal.

## B. Stage 2 (plan Stage 2; spec §3.1, UI)

1. **`TemplateEditor.tsx`:**
   - The day picker offers −30…−1, labelled "Day −1 (before brew day)" and so on.
   - At a negative day, hide the tank and phase pickers.
   - Types the API refuses before brew day are disabled in the type picker at a negative day,
     with a tooltip giving the API's message. Server 422s show inline as today.
2. **`TemplatePreview.tsx`:** pre-brew steps left of brew day.
3. **Gantt** (`lib/gantt.ts`, `GanttGrid.tsx`):
   - Pre-brew dots on the part's track, left of the bar, sharing day slots through
     `rowDotSlots`, so they sit beside another batch's dots and don't add a track.
     `assignTracks` keeps using `start` / `reach`.
   - Expanded rows include pre-brew steps.
   - With no first tank, they show on the Unassigned row.
4. **Drag hints** (your note 2): `dragHint` gets the before-brew-day rule and decision 13's
   rule, with the API's messages. When only "Move all" can work (your note 6), the move prompt
   offers only that answer and says why. Keep the server refusal as the backstop.
5. **Dialogs and text:** "day −1" in `BatchDialog`, `StepDialog`, `scheduleText.ts`. A late
   pre-brew check-off (decision 11) shows "Done Tue (planned Mon)" as any off-plan done step does.
   Add step in the batch dialog offers days before brew day for plain and custom steps.
6. **Vitest:** `gantt.test.ts` for the dot placement (including the day-before collision with
   another batch), the day label, and `dragHint`'s new refusals.
7. **Browser check** (token injection per `rockcut-ui/tests/RUNNING.md`), as `breweryMgr` and
   `brewer1`:
   - a template with Prepare grain at −1;
   - plan a batch on a tank whose previous batch leaves the day before;
   - drag the bar, then Undo;
   - drag the pre-brew dot onto brew day (the hint);
   - check it off late.
   Ask `LEAD:` for a server restart after the follow-ups if needed. Migrations: none in Stage
   1–2.

## Don't

- No test results (Stage 3), no small items (Stage 4), no Playwright specs yet (Stage 5).
- Don't touch `CLAUDE.md`, the spec, the plan or the handoffs.

## Done when

`mix test` green twice, `mix compile --warnings-as-errors`, then
`npx tsc --noEmit -p tsconfig.app.json`, vitest, `pnpm lint` (no worse than today; give the
count), and `pnpm exec vite build`. Commits on the branch. Reply with: commits, files, test
counts, what you checked in the browser, and `LEAD:` notes.

---

# Stage 3 (Test results and retests, API)

2026-11-12 · lead → builder (fresh context). Stages 1–2 are in (`d3f8bad`, `00ecabc`, `599db9d`,
`93f7a8f`). **Read first:** spec §2 decisions 3–5 and 8–10, spec §3.2 (all of it), and **plan
Stage 3**. This brief adds only what the plan doesn't say. Same rules as Stage 1 (branch,
commits staged by name, no push/merge/rebase, `mix format` only your files, `LEAD:` for servers
and migrations on the dev DB). **API only. Stop after this stage and report** (plan Stop 1).

## Do

1. **Migration** as in plan Stage 3, additive and reversible. `has_result` true for the types
   named "Diacetyl test" and "Gravity check" (case-insensitive), in the migration. Also make
   `mix rockcut.synthetic.setup`'s seed types match, if they're seeded separately.
2. **Schemas and JSON** per the plan. `has_result` is editable for built-in types too (it isn't
   `behavior`). The template step API accepts `retest_days`.
3. **`Steps.complete/4` with results** per spec §3.2 and the plan:
   - Retest detail: "retest", then "retest 2", "retest 3"… counted along the `retest_of_id`
     chain.
   - One move prompt, not two: shift = retest day − the failed step's planned day before the
     check-off. `answer_required` when followers exist. The preview carries `needs_result`,
     `retest_days`, and for a fail with retest the followers it would move. Reuse `Steps.move`'s
     plan/changes and Stage 1–2's refusals (`refusal/1`). Don't build a second move engine.
   - The retest is inserted inside the same `Undo.track`, so Undo removes it. Confirm the scope
     includes inserted steps and the repointed links, with a test.
   - A has-result step on a pencilled batch still gets `schedule_first`.
   - A pre-brew step can be a has-result type (plain types can have `has_result`). It works the
     same way, but its retest and followers obey the pre-brew rules. Test one case; if the rules
     collide, stop and `LEAD:`.
4. **Mark not done / change result** (decision 8) per spec §3.2 "Undo" and "Changing a recorded
   result": `retest_done` 422 with "Mark the retest not done first.". Through `Undo.track`.
5. **`failed_tests` flag** in `Flags.compute` per the plan. Flag text: "3 failed Diacetyl tests"
   (the type's name; the count is the fails in a row). Signature includes the count, so a 4th
   Fail brings it back after a sign-off. Muted on pencilled batches.
6. **Linked tasks:** a retest gets its task through `TaskLink.sync!` (it's `added: true`). The
   task JSON exposes the step's `result` so Stage 4 can show ✓ / ✗ on the board.
7. **Board check-off path:** a linked task ticked on the Brewery board goes through
   `Steps.complete`. Confirm the task-tick endpoint passes `result` / `fail_action` /
   `retest_days` through and gets `result_required` without them. The same goes for the
   `StaffCodeActing` device path: test one Fail → Retest as `breweryDevice`.
8. **History:** the change-log entry for a check-off carries the result and the action, so Stage
   4 can word it as the spec says.
9. **ExUnit** for every bullet above and spec §6 S8–S15's API side (403 for `office1`, the 422s,
   Undo, retest of a retest, Fail → Pass removing the retest, the flag and its sign-off coming
   back).

## Don't

- No UI (Stage 4), no Playwright (Stage 5). Don't touch `CLAUDE.md`, the spec, the plan or the
  handoffs.

## Done when

`MIX_ENV=test mix test` green twice, `mix compile --warnings-as-errors`. Commits on the branch.
Reply with: commits, files, test counts, the API shapes Stage 4 will use (request fields and
the preview's new keys), and `LEAD:` notes.

---

# Stage 4 (Test results UI, and the small items)

2026-11-12 · lead → builder. Stage 3 is in (`4bbf9b1`, `972561c`; lead re-ran `mix test`: 2437
passed; dev DB migrated). Matt approved the lead's calls on your LEAD notes. They're now spec
decisions 14–17. **Read first:** spec §2 decisions 14–17, §3.2 "Shown as" (updated), §3.3–§3.7,
and **plan Stage 4**. Same rules as before (branch, commits staged by name, no
push/merge/rebase, `mix format` only your files, `LEAD:` for server restarts). Do **A**, then
**B**, then **C**, then stop and report.

## A. API follow-ups from Stop 1

1. **Flag text** (decision 16): "Galactic #40 · 3 failed Diacetyl tests", with the batch label
   the other flags use. Update its ExUnit.
2. **History** (decision 14): don't add a change log. If Stage 3 left any half-built logging for
   it, take it out. The step and task JSON must carry enough for the UI to word "✗ Fail · retest
   Wed" without another call: the step's `result`, and on a failed test, its retest's id and
   `due_on` (or a way to find them in the batch's steps). Add a field only if the batch/step JSON
   doesn't already give it.
3. **Retest offered?** (decision 15): the check-off preview tells the UI whether Retest is
   allowed for this step (e.g. `retest_allowed: false`), so the prompt can offer only "Continue
   as planned". Reuse the rule behind `retest_not_here`; don't copy it into the client.

## B. Test results UI (plan Stage 4 "Results UI")

1. **`ListsPage.tsx`:** the "Has a result" switch per step type (built-in too).
2. **`TemplateEditor.tsx`:** "Retest after [2] days" (1–30) on has-result types; hidden
   otherwise.
3. **Check-off prompts** in the shared flow (`Gantt/flows.tsx`) so every entry point gets them:
   Gantt, step dialog, batch dialog, `LinkedTaskDialog` on the Brewery board, and the brewhouse
   device (staff code):
   - Pass / Fail first (from the preview's `needs_result`).
   - On Fail: "Retest in [N] days" (N editable, 1–30, from the preview) or "Continue as planned".
     With `retest_allowed: false`, only Continue, and a line saying why.
   - Then the existing move prompt when the API answers `answer_required`.
   - Cancel at any step writes nothing. Map the new 422 codes to plain messages.
4. **Display:**
   - Gantt: ✓ / ✗ on a done test's dot; "· passed" / "· failed" in the expanded rows.
   - Step dialog: "Done Mon · Fail · retest Wed" / "· continued as planned" / "Done Mon · Pass",
     with **Change** (Pass ↔ Fail through `PATCH …/result`; Pass → Fail asks the Fail question).
     A retest's dialog: "Retest of Diacetyl test (failed Mon)".
   - Batch dialog: the same wording on the step line.
   - Brewery board: the linked task shows "✓ Pass" / "✗ Fail · retest Wed" / "✗ Fail · continued
     as planned".
   - Flags: the new flag in `FlagsDialog` / `scheduleText.ts`.
   - Mark not done on a failed test: the confirm says the retest goes too; `retest_done` shows
     "Mark the retest not done first."
5. **Vitest** for the wording helpers and the prompt's decision logic (needs result → fail →
   retest allowed or not → move prompt).

## C. The small items (plan Stage 4, spec §3.3–§3.7)

Follow the plan's bullets for each. Notes:
1. **"Label by" (§3.3):** check where the expanded state is stored (D58 board settings or its own
   field) and store the choice beside it. Match the mockup
   (`docs/current_work/reference/tank_schedule_mockup.html`, `lblsel` / `ui.labelBy`).
2. **`/api/me` refresh (§3.4):** Vitest for the 60 s throttle and for not overwriting a PUT in
   flight.
3. **5210 (§3.5):** ExUnit for a refused second link (nothing saved, the error names the link).
4. **5211 (§3.6):** reproduce on the local DB first. Put what you found in the commit message.
5. **4950 (§3.7):** A, B and C. Vitest where it's logic.
6. **Revert-and-rerun** (workflow §3) for 5210, 5211, 4950 and the refresh: show the new test
   fails without the fix and passes with it. Note each in your report.

## Browser check

Token injection per `rockcut-ui/tests/RUNNING.md`. As `brewer1`: S8, S9, S10 and S11 by hand (Fail
→ Retest → Move all; Continue; Undo; three fails and the flag). As `breweryMgr`: S7 and S18. As
`brewer1`: S16, S19, and 4950 with a dialog open (Ctrl+Z, the snackbar position). Ask `LEAD:` for a
server restart after A if you need one.

## Don't

- No Playwright specs yet (Stage 5). Don't touch `CLAUDE.md`, the spec, the plan or the
  handoffs.
- Any behavior the spec doesn't cover: `LEAD:`, don't decide.

## Done when

`mix test` green twice, `mix compile --warnings-as-errors`, then
`npx tsc --noEmit -p tsconfig.app.json`, vitest, `pnpm lint` (no worse than today; give the
count), and `pnpm exec vite build`. Commits on the branch. Reply with: commits, files, test
counts, the revert-and-rerun results, what you checked in the browser, and `LEAD:` notes.

---

# Stage 5 (Stage 4 follow-ups, then Playwright and the local gate)

2026-11-13 · lead → builder. Stage 4 is in (`91e903a`…`77d446d`; lead re-ran: `mix test` 2438,
Vitest 324, tsc and build clean, lint 27 as before; pushed). Matt answered LEAD note 1 (spec
decision 18). The lead's calls on your other notes: 2, 3, 5, 6 and 7 accepted as built; 4 change
it (A2); 8 leave it. Same rules as before. Do **A**, then **B**, then stop and report (plan
■ Stop 2).

## A. Stage 4 follow-ups

1. **Expanded tanks and "Label by" on the account** (decision 18):
   - Store both in D58's board settings (`PUT /api/me/board_settings/:board`), under a Gantt board
     key. Check what `Accounts.save_board_settings` and `Authz.can?(…, :save, {:board_settings,
     _})` accept for the key and for each account kind, shared devices included; extend them only
     as far as needed, with ExUnit.
   - Reuse `useAuth`'s save path (its failed-save handling, and the Stage 4 refresh skipping keys
     being written), so a change in one browser reaches another when it returns to the screen.
   - Carry-over: the first load with the server key missing takes the browser's local value, saves
     it, then stops using local storage for it. As D58: fill only what the server lacks.
   - Vitest for the carry-over and the read path.
2. **Move prompt after a retest:** the answers say what happens to the following steps, not to the
   test, e.g. "Move them with the retest" / "Keep the following steps' dates", and the "now …" line
   names the retest's day. Ordinary moves keep today's wording. Vitest on the text.

## B. Plan Stage 5: Playwright and the local gate

1. **Specs** as the plan lists them: `tests/regression/production/pre-brew.spec.ts` (S1–S6),
   `test-results.spec.ts` (S7–S15), S16–S20 beside their areas (S16 now checks a second browser
   context). S21 is already in. Persist-verify (reload, then assert) in every new spec. Rows on
   your own `[TEST-TEMP]` data; anything destructive by exact id.
2. **Existing specs** that expected the snackbar at the top or hiding while a dialog is open:
   update them to the 4950 behavior, and list each in the report.
3. **`tests/COVERAGE.md`:** new rows, and the "Label by" limitation line removed.
4. **Revert-and-rerun** with the Playwright specs for 5211, 4950 and the refresh (5210 is already
   proven by ExUnit). Report each.
5. **Local gate:** before the full run, ask `LEAD:` to reseed the local DB (your Stage 2 and 4
   leftovers go with it), and mint tokens with `npx playwright test --project=setup`. Then:
   `MIX_ENV=test mix test`, `npx tsc --noEmit -p tsconfig.app.json && pnpm exec vite build &&
   pnpm lint`, and the full `npx playwright test`. Any failure: fix it, or show it's flaky with
   two passing reruns, and say which.

## Don't

- No PR, no push. Don't touch `CLAUDE.md`, the spec, the plan or the handoffs.

## Done when

The local gate is green. Reply with: commits, files, every count (ExUnit, Vitest, lint, the full
Playwright pass/skip/fail), the revert-and-rerun results, the existing specs you changed, and
`LEAD:` notes. Also draft the PR's handoff notes and LIMITATIONS (plan's list plus anything you
found) in `docs/current_work/prompts/d56_pr_notes.md`.

---

# Stage 5 follow-up: "Your selection" on the account (decision 19)

2026-11-13 · lead → builder. Local gate accepted (`d51b86c`). Matt: the Tanks screen's "Your
selection" goes on the account too.

1. Store it beside `expanded` / `label_by` in `board_settings.production` (or the key the Tanks
   pick already uses, whichever fits D58's per-board shape), through the same `useAuth` save path,
   refresh skip and one-time carry-over (fill only what the server lacks). Range, zoom and
   names-only stay per browser.
2. ExUnit if the API's accepted keys change; Vitest for the carry-over and read path; extend S16
   or S17 (Playwright) so a second browser context sees the selection.
3. Update `d56_pr_notes.md` (the "Gantt view on the account" row, and decision 19).
4. Gate: `mix test` twice if the API changed, tsc, Vitest, lint, build, and Playwright for the
   `production` project plus any spec that uses `pickSetting` (not the full run; DEV runs it).
   Report counts and commits, then stop.

---

# DEV fix cycle 1 (QA pass 1)

2026-11-13 · lead → builder. DEV gate at `fb2f5c3`: full Playwright 738 passed + reruns green (two
flakes; S23h fixed test-only in `b2d13bd`, lead). Independent QA: **fail**, one must-fix. Report:
`docs/current_work/stepwise_results/d56_dev_qa_report.md` (read the gaps; QA had no source).
Same rules as before. Each fix gets a test that fails without it (revert-and-rerun; note each).

## Do now (no behavior choice)

1. **Gap 6 (S18):** the template step Save's refused link must name the link, as the spec and your
   5210 commit intended ("Leads to CIP & Sanitize: …"). QA's race: the "leads to" target moved
   earlier via the API while the dialog was open; the error came back generic ("A step can't come
   before the step it follows."). Find which path loses the link name. Also refresh the dialog's
   step list after a refusal so it doesn't show the stale day.
2. **Gap 1:** the Undo snackbar covers the last option of an open MUI Menu/Select (batch dialog →
   Add step → Step menu). Give menus/popovers the same room as dialogs (e.g. limit the popover
   paper's max height / position above the snackbar) while the snackbar shows.
3. **Gap 2:** a multi-select drag that would put a pre-brew step on or after brew day (or a
   non-plain step before it) shows the reason in the drag hint, as a single-dot drag does.
4. **Gap 5:** a template step at a negative day with a phase or a tank other than the first gets
   its own message, e.g. "A step before brew day has no phase." / "… is in the first tank." (same
   422 code is fine, or a new one; tell me which).

## Wait for the lead on

- Gap 4 (must-fix) and gap 3: the lead is asking Matt how they should behave. Investigate gap 4's
  cause now (Mark not done after the retest was moved leaves the followers +3), and report it, but
  don't change the behavior until the answer comes.

## Done when

The four fixes committed; ExUnit and Vitest for each; tsc, lint, build; the Playwright specs for the
touched areas. Report commits, counts, revert-and-rerun, and gap 4's cause. Then stop.

---

# DEV fix cycle 1, part 2: gaps 4 and 3 (Matt: spec decisions 20, 21)

2026-11-13 · lead → builder. Cycle 1's four fixes are in (`2e96fde`…`9bc352d`, pushed).

1. **Gap 4 (decision 20):** Mark not done and Fail → Pass on a failed test put every following
   step the Fail moved back to its date **before the Fail** (from `checkoff_move`'s "before"
   dates), even if it was moved since. Done followers stay. Keep the D49 QA 1 behavior for ordinary
   off-plan check-offs unchanged (only the retest path changes). The confirm text then matches.
   Tests: QA's repro (Fail → retest → drag the retest +1 Move all → Mark not done → back to the
   pre-Fail dates), the same through Fail → Pass, and a done follower staying. Revert-and-rerun.
2. **Gap 3 (decision 21):** a brew-day move (any path: drag, date box, multi-select, an off-plan
   brew-day check-off) that would put the first Brew day on or before a **finished** pre-brew
   step's done day is refused: 422 `before_brew_day` (or a new code; tell me), "<step> was done
   <Thu Nov 13>; brew day can't be before it." The preview carries it so the drag hint and the move
   prompt show it. ExUnit per path, Vitest for the hint, Playwright for QA's date-box repro.
   Revert-and-rerun.
3. Same gate as cycle 1. Report commits, counts, revert-and-rerun. Then stop.

---

# DEV fix cycle 2 (QA recheck)

2026-11-13 · lead → builder. DEV at `9f5fa20`: full Playwright green (gap 4 spec's reload race
fixed test-only, `740605b`). QA recheck: gaps 1–6 fixed; **fail** on new gaps 7–9. Report:
`docs/current_work/stepwise_results/d56_dev_qa_recheck_report.md`. Spec decisions 20 and 21 now
carry the lead's clarifications. This is the last fix cycle in the budget, so test the edges hard.

1. **Gap 8 (must-fix; decision 20 clarified):** Mark not done / Fail → Pass restore the Fail's
   followers **relative to the test**: each goes to its pre-Fail date + D, where D = the test's
   planned date now − its planned date at the Fail (a whole-batch shift or a date-box Move all
   since then moves the test; dragging the retest doesn't). The test stays where it is. After the
   restore, the decision 13 / pre-brew rules must hold; if they can't, refuse with the usual 422
   and message rather than leave a non-plain step before brew day. ExUnit: QA's repro (Fail →
   retest → bar shift +10 → Mark not done, and → Change to Pass), the date-box Move all variant,
   and gap 4's repro still passing.
2. **Gap 7 (should-fix):** a follower done while the retest had shifted it: when the test's Mark
   not done / Fail → Pass restores the others, also put back that done follower's recorded
   "before" date (its `checkoff_move`, same D rule), so a later Mark not done of it goes to its
   pre-Fail date (QA: FDH → Nov 13, not Nov 16). ExUnit with QA's 5-step repro.
3. **Gap 9 (should-fix; decision 21 clarified):** brew day **on** the finished pre-brew step's done
   day is allowed; only strictly before is refused. Check every path from cycle 1 (drag, bar,
   date box, multi-select, brew-day check-off), the preview and the hints. ExUnit + Vitest for the
   same-day case, both tick orders.
4. **QA observation:** `POST /batches/:id/shift` ignores `preview: true` and writes. Make it honor
   preview (no write, same refusal shape as other previews). ExUnit.
5. Revert-and-rerun for 1–3. Gate: ExUnit twice, Vitest, tsc, lint, build, Playwright production +
   brewery-board projects. Update `d56_pr_notes.md` (fix cycles 1–2, decisions 20–21). Report
   commits, counts, revert-and-rerun. Then stop.

---

# DEV fix cycle 3 (QA recheck 2; Matt approved a third cycle)

2026-11-14 · lead → builder. DEV at `e6f17fe`: full Playwright 791/791. QA recheck 2: gaps 7–9 and
the preview fixed; **fail** on gap 11 (must-fix), gaps 10 and 12 minor. Report:
`docs/current_work/stepwise_results/d56_dev_qa_recheck2_report.md`. Spec decisions 22–24.

**Cause (lead, confirmed in code):** `Steps.pre_brew/1` picks pre-brew steps **by date** (unfinished,
due before the first Brew day). Any step left behind before brew day then moves with brew day and
gets pre-brew treatment, and decision 21's check treats a finished post-brew test as pre-brew.

1. **Decision 22, pre-brew by origin:** store it on the step (e.g. an additive
   `production_steps.pre_brew` boolean, backfilled from `template_steps.day_offset < 0` for
   template-linked steps and from "added and due before the first Brew day" for added ones on DEV/
   prod data; tell me the backfill rule you used). Set it in `copy_steps!` and Add step (before
   brew day); Change template's kept step keeps it. `Steps.pre_brew/1`, the decision 2 move, the
   decision 21 check, the "pre-brew stays before brew day" refusal, the drag hints and the Gantt
   dot placement use the flag, not the date. A non-pre-brew step dated before brew day is an
   ordinary out-of-order step (flagged). Decision 13 still applies to every step.
2. **Decision 23:** a brew-day move (every path: drag, bar, date box, multi-select, off-plan
   brew-day check-off, Mark not done restores) that would put the first Brew day on or after a
   **finished** step that follows it (not pre-brew) is refused: 422 `after_done_step` (or reuse a
   code; tell me), "<step> was done <day>; brew day can't be after it." Preview and hints show it.
   This removes gap 10's silent date-box move; check the date box asks the move question in the
   remaining cases.
3. **Decision 24 (gap 12):** Mark not done on a brew day refused because a finished pre-brew step
   holds it: "Mark <step> not done first."
4. **Tests:** QA's gap 11 path end to end (ExUnit and Playwright: Fail → retest → date box +10 is
   now refused; and a Move-only brew-day move later that leaves a plain step behind: that step does
   NOT move back with brew day and is flagged). Gap 10, gap 12, decision 23 per path, the backfill.
   Revert-and-rerun for 1–3. Existing pre-brew specs must still pass unchanged where behavior is the
   same.
5. Gate: ExUnit twice, Vitest, tsc, lint, build, Playwright production + brewery-board. Update
   `d56_pr_notes.md` (cycle 3, decisions 22–24, the migration). Report, then stop. Ask `LEAD:` for
   the dev-DB migration.

---

# DEV fix cycle 4 (QA recheck 3; Matt approved)

2026-11-14 · lead → builder. DEV at `015c65a`: full Playwright green after reruns (P46 test-only
fix `8b46290`; S123 and D58 S16 flaky, passed twice). QA recheck 3: gaps 10–12 fixed; **fail** on
gap 14 (must-fix) and gap 13 (should-fix). Report:
`docs/current_work/stepwise_results/d56_dev_qa_recheck3_report.md`. Spec decisions 25–27.

1. **Decision 25 (gap 14):** a retest is never `pre_brew`, whatever it retests. Fix creation and
   the migration's backfill (drop rule 3; it's not yet on prod, so edit the migration in place and
   make the re-run on DEV/local correct: also clear `pre_brew` on existing retests, tell me how).
   QA's repro (pre-brew test → Fail → Retest → brew day −8 Move only) leaves the retest on its day.
2. **Decision 26 (gap 13):** checking off a step that isn't pre-brew and isn't a Brew day, while the
   batch's **first** Brew day (`Parts.first_brew`, "1 of 2" on a two-day brew) isn't done, is
   refused: 422 `brew_first` (or reuse; tell me), "Brew day comes first. <step> can't be done
   before it." Every check-off path: Gantt, dialogs, board tick, device, preview. Pencilled
   batches keep `schedule_first` (check the order of refusals). Tests, including Matt's case: a
   two-day brew, "1 of 2" done, a Set temp between the two checked off before "2 of 2" (allowed),
   then "2 of 2" moved later past it (allowed); and with "1 of 2" not done the Set temp is refused.
   Check existing specs that check off post-brew steps early (D49 off-plan specs) and update them
   to check off brew day first where needed; list them.
3. **Decision 27:** no change; add a comment where the bar shift skips decision 23, and a test
   naming it.
4. Revert-and-rerun for 1–2. Gate: ExUnit twice, Vitest, tsc, lint, build, Playwright production +
   brewery-board (reseed local first: `mix rockcut.synthetic.setup` is fine for you to run).
   Update `d56_pr_notes.md`. Report, then stop. `LEAD:` if the dev DB needs the edited migration
   re-run.
