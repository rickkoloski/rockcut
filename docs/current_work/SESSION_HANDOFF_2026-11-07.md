# Session Handoff: 2026-11-07

Supersedes `SESSION_HANDOFF_2026-11-06.md`. **D53 Part 1's DEV gate is PAUSED (Matt went offline). Do nothing on DEV, and no pushes or conv 80 posts, until Matt says continue.**

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.11.07` (hotfix, API v33) on `v2026.11.04` (D54, UI v29). Rollback API v32. |
| **DEV** | **Claimed for D53 Part 1 and paused** (conv 80). Runs `6d7811c` (API v70 / UI v73). Pre-deploy snapshot `vs_ob5KyyV5RO7SDYpePYZ`. A stopped test run may have left `[TEST-TEMP]` data; reseed before resuming. |
| **PR** | #53, `d53-part1-multi-assignees` → `develop`, open. DEV verdict not posted. |
| **Worktree** | `~/src/rockcut-d53`. This handoff is a local commit on the branch, after `6d7811c`; docs only. |
| **Local servers** | Running from `~/src/rockcut-d53`, not `~/src/rockcut`. |
| **Tabs** | `d53 build` (builder, idle), `d53 playwright`, `d53 dev deploy`. Deploy checkout `~/src/rockcut-d53-deploy` at `6d7811c`. |

## Gate progress

- [x] Local gate at `83097ca`: Playwright 599 passed, 1 skipped; ExUnit 1893.
- [x] Deployed `6d7811c`. Backfill on DEV: 16 of 16 tasks, 0 mismatches, no assigned series.
- [ ] Full suite on DEV. First run: 377 passed, 1 failed, 222 did not run (all of `brewery-board`, which depends on `production`). So `setup`, `chromium` and the rest of `production` have run; the rest hasn't. The rerun of `production`, `brewery-board`, `board-replace` was stopped on purpose.
- [ ] Independent QA: brief ready at `~/src/rockcut-d53p1-qa/BRIEF.md`. `auth/` is empty.

## The one failure: P61

`production/flags-cips.spec.ts:103`. 6/6 when repeated alone on DEV. `MovePrompt` closes on Apply, **before** the save (`flows.tsx:310–312`), and the test reads the batch right after the prompt hides, so it can read the old date under load. Fix the test to poll for the date (`expect.poll`). P83–P84 (`d48-batch-changes:180`) has now failed twice on DEV (once on D54's `ca5d9be`, once in the stopped rerun at `6d7811c`, test 40 of 157 at most), so it isn't a one-off. It reads the batch right after picking a brand, which looks like the same family; confirm and fix the same way. It failed on D54 too, so Part 1 didn't cause it. Part 1 changed `TaskLink`, but nothing points at it here.

## To resume, when Matt says continue

1. Check the Mac is plugged in and awake.
2. Reseed DEV (`seed_synthetic()`). Run `E2E_TARGET=dev npx playwright test --project setup` from `rockcut-ui`.
3. Run `production`, `brewery-board`, `board-replace` with `--no-deps`, **one at a time, never in one command**. Don't overlap them with QA.
4. Copy `tests/.playwright-auth/*.json` to the QA folder's `auth/` (mode 600); start the `qa` agent as in D54; wait for `results/d53p1_qa_report.md`, not for "done".
5. Fix cycle if needed (include the P61 test fix). Verdict on PR #53. Matt decides on the merge. Then Part 2's plan.

## Open for Matt

- **REMIND at the end of D53: task 5164.** Prod sign-in and the three tablet checks. This covers D54 and the hotfix.
- 4055 / 4056 when planning a features deliverable. Tank abbreviations; D50 (4934); 5165 (`reminders.ex` warning).

## Habits

- A reseed deletes `[TEST-TEMP]` devices and people.
- `--no-deps` with several projects runs them in parallel; run them one at a time.
- `herdr agent` "done" can mean waiting on its own shells, or cut off by the Mac sleeping. Check the output.
