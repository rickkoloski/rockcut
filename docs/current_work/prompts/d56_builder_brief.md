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
