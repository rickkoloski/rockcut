# D63 builder brief — Stop 0 (carry-ins)

2026-11-24 · lead → builder.

## Read first

- **Spec (approved):** `docs/current_work/specs/d63_foundations_spec.md`: §3, and §12 "Stop 0".
- **Plan:** `docs/current_work/planning/d63_foundations_plan.md`: "Where things are" (the first three
  items) and Stops.
- **Reports behind the items:** `docs/current_work/stepwise_results/d64_dev_qa_report.md`, gaps 1–3.

This brief covers **Stop 0 only**. Stop after it and report. Stop 1 (catalog) comes as its own brief.

## Where and how

- Work in `~/src/rockcut` on branch **`d63-foundations`**. It's checked out. Don't switch branches.
- **Commits:** small (`fix: D63 …` / `test: D63 …`), paths staged by name. Don't push, merge, rebase
  or stash. End each message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Servers:** the lead owns them (API :4002 in w1:p2, UI :5174). Ask if you need a restart. Stop 0 has
  **no migrations**.
- **Formatting:** no repo-wide `mix format`; format only files you touch.
- **Data:** tests never edit or delete seeded reference rows. Revoke or delete only your own
  `[TEST-TEMP]` rows, by exact id.
- Never print a synthetic token. When reading Playwright failures, filter `Authorization` and `Bearer`.

## Do

Every fix gets a test that fails with the fix reverted. Actually revert and rerun, and say which you
proved.

1. **6260: phone Back closes confirmations.** `ConfirmDialog` uses `useBackCloses`, as `FormDialog`
   does on phones.
   - Back closes only the top dialog: from Brink History → Remove (and Delete count), it closes the
     confirm and History stays.
   - While the confirm is in flight (the gate is busy), Back doesn't close it.
   - With `onCancel` (a second answer), Back only closes, as Escape does. It never runs the answer.
   - **A confirm that then navigates must still land** (5911's `history.back()` race: the entry's
     removal a tick later aborts a following navigation). List every `ConfirmDialog` whose confirm
     navigates away, and check each one at 360 px in a browser.
   - Desktop behavior doesn't change.
   - Playwright at 360 px: Dump brink, Mark clean, Remove pitch, the nested History case, and one
     that deletes and navigates.
2. **6261:** Brink History doesn't list **voided** records that have no entries. A voided record with
   entries still shows. ExUnit for both, and the dialog.
3. **6262:** the order page's footer uses the same per-unit words as New order ("20 bricks, 12
   pitchables"; tablets too). One shared helper, with vitest; a Playwright assertion.
4. **S16** (`rockcut-ui/tests/regression/d58/sweep.spec.ts`): reach the target week without 47 quick
   clicks on Next week. Use a URL or stored week if the Scheduler already has one; otherwise step with a
   wait for each week's load. **Test code only:** tell me if it would need an app change. Other callers
   of the same helper must still pass.
5. Start a **D63 section in `rockcut-ui/tests/COVERAGE.md`** mapping each item to its test.

## Done when

- `mix test` passes twice (note the seed of each run), and
  `MIX_ENV=test mix compile --warnings-as-errors --force` is clean.
- vitest, `tsc -p tsconfig.app.json` and `vite build` are clean. `pnpm lint` shows the same 8 errors.
- The specs you touched pass locally. **I run the full suite** in its own tab.
- **Reply with:** your commits; test counts before and after; item → test, saying which you proved by
  revert; the list of confirms that navigate and what you checked; and `LEAD:` notes for anything open
  or anything that didn't fit.
