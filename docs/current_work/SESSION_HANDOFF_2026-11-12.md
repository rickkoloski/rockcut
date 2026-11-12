# Session Handoff: 2026-11-12

Supersedes `SESSION_HANDOFF_2026-11-11.md`.

## Where things stand

- **Prod: `v2026.11.12` (D58)**, live since about 13:30 MST.
  - Release PR #69 (squash `0813452`), tag `v2026.11.12`.
  - API v38 (`deployment-01M78M4324RZMTH0SB29NT5DGF`), UI v34 (`deployment-01M78M5NY0V6A8ZRY0TG25EH7C`).
  - Pre-release snapshot `vs_XvQBgGOL0JjlhPm3Y83l6q9`. Rollback: API v37 / UI v33, image only (both
    migrations only add columns).
  - Matt's prod check passed, and all 16 D58 tasks are closed (4994, 4991, 4992, 4984, 5202, 4261,
    5204, 4118, 5206, 5205, 4061, 5769, 4115, 4116, 4319, 5193).
- **DEV:** free (conv 80 msg 105055). It runs `develop` at `fb09ab4`, with the same app code as
  `develop` now (later commits are docs only), and it's reseeded.
- **Git:** `develop` at `9be1c37`. `main` is an ancestor of `develop` (close-out PR #70), so the next
  release PR will have no conflicts. The D58 branch is merged and deleted locally.
- **Posts in conv 80:** DEV free (105055), PROD live (105057).
- **Local:** API on :4002 and UI on :5174 are running; the local DB is seeded with the synthetic
  personas. `tests/.playwright-auth` holds DEV tokens from the last DEV run. Re-mint them before a
  local Playwright run: `npx playwright test --project=setup`.
- **Herdr:** the `builder` agent (tab "build", pane `w1:p4`) is idle and still holds D58's context.
  Start a fresh builder for the next deliverable. The QA, DEV and prod run tabs are closed.
  `~/src/rockcut-d58-qa` keeps the briefs and reports; its DEV tokens are deleted.

## D58 in brief

The record is `stepwise_results/d58_board_settings_and_managers_COMPLETE.md`. The spec has decisions
1–15; 10–15 came from DEV QA on 2026-11-12.

- **Local gate:** green. Full Playwright 764 passed, 1 skipped (D52's conditional).
- **DEV gate:**
  - Run 1 at `be7f764`: one real bug. The Users & Roles Save went out before `/api/departments`
    loaded; fixed in `ea3b895`.
  - Run 2 at `58c961c`: 759 passed.
  - QA pass 1: fail (`stepwise_results/d58_dev_qa_report.md`). Matt's decisions are in
    `prompts/d58_lead_decisions_1.md`.
  - Fix cycle 2 at `b59278e`: 759 passed. The 2 failures were test-only and passed on rerun.
  - QA recheck: pass with gaps (`stepwise_results/d58_dev_qa_recheck_report.md`). Matt accepted R-1.
- **Matt's decisions from QA:**
  - **Account changes:** details, password reset, staff code and Active need a manager of every
    department the person is in. Never an owner.
  - **Owners:** hidden from managers everywhere. This reverses spec decision 7.
  - **Deactivate:** first asks, then opens the person's future shifts and sends the open-shift
    notification.
  - **Carry-over:** fills only the keys the server lacks.
  - **Accepted as built:** gap 11 (a list lock stops only its own move); gap 8 on task series (the
    dialog shows the first part's rule); R-1 (a manager can work out an Owners membership from
    "View only").
- **The lead reverted gap 2** (the gear tooltip on touch, `a9d8388`). Its test passed without the
  fix, and the tooltip appears only after Escape, which is correct.
- **DEV note:** S16 clicks "Next week" 47 times quickly. That burst briefly gets 500s from DEV's small
  API machine on every list. If the S16 failure comes back, slow the clicks or open the target week
  directly.

## Open items

- **Task 5789 (backlog):** a manager who is also in a department they don't manage can't edit their
  own name or email. It waits for Matt's decision.
- **D56 (task 5207)** now also includes:
  - **the Gantt's "Label by" picker.** D46 specified it and the mockup has it working, but D47
    deferred it and nobody filed it.
  - **refreshing board settings when the app returns to the screen.** Matt found this in his prod
    check: a change reaches a second device only after that app restarts, because `/api/me` is read
    only at start-up.

## Next

1. **D56: production timing** (task 5207): pre-brew days, multi-day steps, plus the two additions
   above. Start with the spec, using the questions in the task.
2. **D57: test results and automatic retests** (task 5208), after D56.
3. Next new ID: **D60**.
