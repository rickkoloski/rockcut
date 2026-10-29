# D51 part 2: lead decisions 1

2026-10-28 · lead → builder, after `d51_builder_status.md` (items 1–4 at `5fabdc8`). Good work; the revert checks and the 4060 seed repro are exactly what was needed.

## Answers to LEAD

1. **CLAUDE.md "Running the Project":** yes, add the build args to the two deploy lines.
2. **`StaffCodes.RateLimiter`:** yes, the same central reset in `DataCase.setup_sandbox/1` (sync tests only), and remove the per-module resets. Show the suite green twice.
3. **Docker builds:** noted; it goes under LIMITATIONS in the PR (the lead writes it).
4. **Scenario 2 spec:** yes. A Playwright spec: a stale pre-D34-style token in `localStorage` → the app lands on the sign-in page and `rockcut_token` is cleared. Make the token in the spec without the server's secret: any non-`ses_`/`dev_` bearer string must get the same treatment, so use a realistic-looking `SFMyNTY…` string.

## New

5. **Don't drop the column in this release.** A rollback to the previous image (`fly deploy --image <prev>`) would run code whose `User` schema still selects `legacy_tokens_revoked_at`, and every user query would fail. So:
   - Delete migration `20261028120001_remove_legacy_tokens_revoked_at_from_users.exs` (amend in a new commit, don't rewrite history).
   - Keep the schema field removed (Ecto ignores an unmapped column).
   - Spec Part 2: change the **Migration** section to "None. The column stays, unused; a follow-up task drops it after part 2 is stable on prod." The lead files that task.
   - **Check:** the test DB still has the column after `mix ecto.reset` (it should, since the original migration that adds it stays) and the suite is green.
6. **S13 on DEV** (`tests/regression/brewery/task-board-drag.spec.ts:78`). On DEV it fails 3/3 today with "mouseDrag: the target list ends near or past the bottom of the screen": DEV's Unfinished card (6 old tasks, including past `[SEED] Keg Wash` repeats that the reseed doesn't clear) pushes day 9 below the 2600 px viewport. At 3400 px it passes 3/3. Don't hard-code a bigger number: after `openBoard`, size the viewport to the page (`document.documentElement.scrollHeight` + a margin, at least 2600) and re-measure. Check the other `setViewportSize` calls in the task-board specs for the same assumption and treat them alike only if they share it.
7. **Then the flakes, with the servers.** The lead's API and UI now run from **your worktree** (`~/src/rockcut-d51`, :4002 / :5174, DB set up and seeded today). You may run Playwright locally now (DEV is busy with the part 1 QA agent, but it uses its own login files). Prefix long runs with `caffeinate -i`; the Mac sleeps.
   - **4064** (`personal_signin.spec.ts` S13 "activity keeps the personal session", fails in parallel): reproduce with `--repeat-each 10 --workers 4`, find the cause, fix it (app or test). Show before/after counts.
   - **4057** (`personal_signin_revoke.spec.ts` G1 "Try now recovers…", DEV only, not reproduced since Oct 5): run it `--repeat-each 20` locally; if it never fails, add `--trace retain-on-failure` guidance to the task and recommend closing it. Don't change the test blind.
8. **Local gate** when 1–7 are done: the full `mix test` (twice), `tsc`/`vite build`/vitest/lint, and the **full local Playwright suite** (`caffeinate -i npx playwright test --reporter=line 2>&1 | tee /tmp/claude-501/pwlogs/d51p2_local.log`). Reseed first (`mix rockcut.synthetic.setup`); several specs assume today's seed.

Update `d51_builder_status.md` (a new section, keep the first) and stop.
