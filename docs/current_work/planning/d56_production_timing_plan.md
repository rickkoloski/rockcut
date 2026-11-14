# D56: Pre-brew steps, test results and retests, and follow-ups — Plan

2026-11-12 · lead. **Spec:** `specs/d56_production_timing_spec.md` (approved 2026-11-12, decisions
1–10). **Tasks:** 5207, 5208 (was D57), 5210, 5211, 4950, 5791. **Branch:** `d56-production-timing`
in `~/src/rockcut`, from `develop` @ `9a64f11` (holds the 5791 fix `d627538` and the spec).

Four stages, each its own commits, then Playwright. The spec sections drive the work; this plan
names the code and the order. Every schedule write keeps going through `Undo.track/4` and
`TaskLink.sync!/1` as today; nothing here bypasses them.

## Stages (stops marked ■)

1. **Pre-brew steps, API (spec §3.1; decisions 1, 2, 7, 10).**
   - **Validation:**
     - `TemplateStep.changeset`: `day_offset` −30…365.
     - A negative offset only for a plain type or a custom step, with no phase and vessel 0 (422
       `not_before_brew`, the spec's message). Check where `Production` sets the type, since the
       changeset doesn't see it.
     - The template's Brew day stays at 0: check the template-level validation still holds.
   - **Copying:** `Batches.copy_steps!/4` needs no change (`brew_on + day_offset`). Check that
     `add_package_cips!` and the two-day brew ("2 of 2" at `first.due_on + 1`) ignore pre-brew steps.
   - **Moves:**
     - A helper `Steps.pre_brew(steps)`: the batch's unfinished steps due before its first Brew
       day, using the dates before the move.
     - In `Steps.move/3`, when the first Brew day is among the moved steps, add its batch's
       pre-brew steps to the moved set. They aren't "following" steps, so the prompt doesn't count
       them, and any answer moves them.
     - `Steps.complete/4` off-plan moves and the whole-batch drag (`BatchChanges`, check which
       function) go the same way. The whole-batch drag already moves all unfinished steps, so
       just confirm it with a test.
     - A move of a pre-brew step itself, or any write that would put one on or after the first
       Brew day, is refused (422 `before_brew_day`). That covers the batch dialog's date box,
       `preview: true` answers (so the drag hint can say why) and Undo putting rows back.
   - **Check-off:** pre-brew steps aren't `first_brew?`, so there's no number prompt. Confirm that
     `check_off_order!` doesn't block them before brew day, and that `schedule_first` still
     applies to pencilled batches.
   - **Parts, flags, status:** confirm with tests that `Parts.part/2`'s `start` (fill = first
     brew) keeps pre-brew steps out of tank time and overlap flags. Confirm too that `TankStatus`
     ignores them.
   - **Task wording:** `TaskLink.describe` already uses vessel 0's tank or Unassigned. Test it.
   - **ExUnit:** each rule above, including Undo of a brew-day move putting pre-brew steps back,
     and a pre-brew step on a split parent.

2. **Pre-brew steps, UI (spec §3.1).**
   - `TemplateEditor.tsx`:
     - The day picker offers −30…−1 as "Day −1 (before brew day)".
     - Tank and phase pickers are hidden for a negative day. Brew day, Transfer and the other
       types the API refuses are disabled in the type picker with a tooltip.
   - `TemplatePreview.tsx`: pre-brew steps left of brew day.
   - **Gantt** (`lib/gantt.ts`, `GanttGrid.tsx`):
     - Pre-brew dots on the part's track left of `start`. They share day slots through
       `rowDotSlots`, so they sit beside another batch's dots on the same day instead of
       stacking the row.
     - Track assignment (`assignTracks`) keeps using `start` / `reach` (no tank time).
     - Expanded rows include them.
   - **Drag:** `useTimelineDrag` shows the `before_brew_day` hint from the preview.
   - `BatchDialog.tsx` / `StepDialog.tsx` / `scheduleText.ts`: "day −1".
   - Vitest: `gantt.test.ts` for the dot placement and the day label.

3. **Test results and retests, API (spec §3.2; decisions 3–5, 8, 10).**
   - **Migration** (additive):
     - `production_step_types.has_result` (default false). Set it true for the types named
       "Diacetyl test" and "Gravity check", ignoring case.
     - `retest_days` on `template_steps` and `production_steps` (default 2).
     - `production_steps.result` (string, null) and `retest_of_id` (references
       `production_steps`, `on_delete: :nilify_all`).
   - **Schemas:**
     - `StepType.changeset` casts `has_result`, for built-in types too.
     - `TemplateStep` / `Step` validate `retest_days` 1–30, `result` in `pass` / `fail`.
     - `copy_steps!` copies `retest_days`.
     - The step JSON and the schedule JSON (`Schedule`) add `has_result`, `result`,
       `retest_of_id` and `retest_days`.
   - **`Steps.complete/4`:**
     - New attrs: `result` (`pass` / `fail`) and, for a fail, `fail_action` (`retest` /
       `continue`) and `retest_days`.
     - A has-result step with no `result` gets 422 `result_required`. With `preview: true`, the
       preview adds `needs_result: true` and the step's `retest_days`.
     - **Retest:**
       - In the same transaction, insert the retest (spec fields; detail "retest" / "retest 2"
         counted along the `retest_of_id` chain) on `done_on + N`.
       - Repoint the failed step's **outgoing** `production_step_links` to it (same
         `default_answer`).
       - Then run the existing move logic for the followers. Shift = retest day − the failed
         step's planned day before the check-off, so a late check-off and the retest give
         **one** prompt. `answer` is required when followers exist, as for any move
         (`answer_required` preview).
       - The retest is `added: true`, so `TaskLink.sync!` makes its task.
     - **Continue:** done with `result: fail`; nothing else changes.
     - Pass: as today, plus `result`.
   - **`Steps.uncomplete/1` (Mark not done) on a failed test with a retest:**
     - Retest done → 422 `retest_done` ("Mark the retest not done first.").
     - Otherwise, delete the retest, put the links back on the test, move the followers back by
       the same shift, and clear `result`.
     - Undo of the check-off is the generic row restore; the retest and its links are in the
       batch scope, so check `Undo.track`'s scope covers them, with a test.
   - **Change result:** `PATCH` the step's `result` on a done step:
     - Pass → Fail runs the fail path (`fail_action` required).
     - Fail → Pass removes the retest first, as Mark not done does.
     - Through `Undo.track`.
   - **Flag:**
     - `Flags.compute`: a `failed_tests` flag on the batch when the latest three steps of one
       retest chain are all `fail`.
     - Its signature includes the chain's fail count, so a fourth Fail brings it back after a
       sign-off.
     - Muted on pencilled batches, like the others.
   - **Brewhouse device:** the `StaffCodeActing` path is unchanged. Test one Fail → Retest as
     `breweryDevice`.
   - **History:** the step-change log entries carry result and action, for the spec's wording.
   - **ExUnit:** every bullet, the 403 for `office1`, the 422s, Undo, and a retest of a retest.
   - ■ **Stop 1:** stages 1–3, `mix test` twice, then report to Matt. Format only the changed
     files, never repo-wide.

4. **Test results UI, and the small items (spec §3.2–§3.7).**
   - **Results UI:**
     - `ListsPage.tsx`: a "Has a result" switch per step type.
     - `TemplateEditor.tsx`: "Retest after [2] days" on has-result types.
     - **Check-off prompts** in the shared check-off flow (`Gantt/flows.tsx`, used by the Gantt,
       the dialogs, `LinkedTaskDialog` on the board and the device):
       - First Pass / Fail.
       - On Fail, "Retest in [N] days" or "Continue as planned".
       - Then the existing move prompt from the API's `answer_required`.
       - Cancel at any point writes nothing.
     - **Display:**
       - The ✓ / ✗ dot mark and "· failed" / "· passed" (`GanttGrid`, `lib/gantt.ts`).
       - "Done Mon · Fail" and "Retest of …" (`StepDialog`, `BatchDialog`), with Change result.
       - The board's linked task chip, the flag text in `FlagsDialog` / `scheduleText.ts`, and
         History.
   - **"Label by" (§3.3):**
     - In `GanttGrid`'s expanded rows, a select on the first step row when ≥ 2 batches share the
       tank in range.
     - Stored per person through D58's board settings. Check whether production settings live
       there or in their own `users` field, and use whichever the expanded state uses.
     - Copy the mockup's behavior.
   - **`/api/me` refresh (§3.4):**
     - `hooks/useAuth.ts`: `visibilitychange` → `loadMe` in refresh mode, throttled to 60 s.
     - Merge `board_settings` / `color_mode` / `show_planned_batches` into state.
     - Skip the board-settings keys a PUT is writing, and swallow errors.
     - Vitest for the throttle.
   - **5210:**
     - `POST`/`PATCH` template step accepts `link_after` / `link_before` arrays and writes the
       step and links in one `Repo.transaction`.
     - `TemplateEditor` Save uses it; the old link routes stay for the link list's own buttons.
     - ExUnit for a refused second link (nothing saved).
   - **5211:**
     - Reproduce first: take off a linked task, then look at the collapsed and expanded rows and
       the batch dialog.
     - Fix whichever hides it, likely a filter on `on_task_list` in the expanded rows or in
       `Schedule`'s step list. Write the result in the commit message.
   - **4950** (`flows.tsx` snackbar):
     - A: a `keydown` listener for Ctrl/Cmd+Z while an Undo is live, outside `input` /
       `textarea` / contenteditable. MUI dialogs don't swallow keydown on `window`, but test it.
       The "Ctrl+Z" hint shows only with `(pointer: fine)`.
     - B: no autoHide while a dialog is open; the snackbar closes when the token expires or is
       used.
     - C: anchored bottom-center while a dialog is open.
     - Vitest where it's logic, Playwright for the dialog case.

5. **Playwright and the local gate.**
   - New specs under `tests/regression/production/`: `pre-brew.spec.ts` (S1–S6),
     `test-results.spec.ts` (S7–S15), plus S16–S20 beside their areas. S21 is already in
     `boards-scenarios.spec.ts`.
   - `tests/COVERAGE.md`: new rows, and the "Label by" limitation line removed.
   - **Revert-and-rerun** for each bug fix: 5210, 5211, 4950, the `/api/me` refresh, and 5791
     (already done).
   - **Local gate (workflow §3):**
     - `MIX_ENV=test mix test`
     - `npx tsc --noEmit -p tsconfig.app.json && pnpm exec vite build && pnpm lint`
     - full `npx playwright test`
     - persist-verify in every new spec
   - ■ **Stop 2:** local gate green. PR to `develop` with the handoff note and LIMITATIONS
     (below). Then the DEV gate, run by the lead.

## LIMITATIONS to carry into the PR (what local can't tell)

- Ctrl/Cmd+Z inside an MUI dialog on a real Chrome build, and the snackbar position on the Samsung
  tablet's landscape screen.
- `visibilitychange` on an installed PWA brought back after hours. Local only fires it from a test.
- The `has_result` migration against prod's real type names (a rename leaves it off; Matt checks
  after the release).
- The pre-brew dot beside another batch's dots at the 2-week zoom on the tablet's touch row height.

## Notes for the builder

- Pre-brew moves and the retest's follower move reuse `Steps.move`'s plan and changes. Don't
  write a second move engine.
- No repo-wide `mix format`. Format only the files you changed.
- QA briefs: any destructive action is by exact id on the spec's own `[TEST-TEMP]` rows.
- Ask the lead before changing a behavior the spec doesn't cover. Small gaps found in QA get
  fixed in the fix cycle, not backlogged.
