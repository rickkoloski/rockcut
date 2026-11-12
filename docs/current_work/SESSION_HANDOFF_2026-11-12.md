# Session Handoff: 2026-11-12

Supersedes `SESSION_HANDOFF_2026-11-11.md`. Prod: `v2026.11.11` (D59, done, task 5764 closed). DEV free,
runs `develop`.

## D58 in progress

Branch `d58-board-settings-and-managers` in `~/src/rockcut`, not pushed. Spec and plan are approved;
decision 9 added five UI follow-ups (4118 2–7, 4115, 4116, 4319, 5193).

- **Stages 1, 2, 3 and 3b are done** (through `0fb9b6a`; the builder's full gate passed). Stop 1 was
  reported to Matt.
- **Two migrations:** `users.board_settings` and the `schedule_event_series` chain (4261 found D39's
  gaps and ported the fix). Both are on the local dev DB.
- **Builder notes for Matt to confirm:**
  - 5193: adding or archiving a list clears any half-typed "Add a card" text;
  - §3.12: trailing empty spreadsheet columns are now listed as "(blank)";
  - 5205: the loading screen shows "Rock Cut Brewing" under the spinner.

## Stop 2 reached (local gate green)

- **Stage 4** (`7a80ea4`–`6665a8f`):
  - Playwright for S1–S28 in a one-worker `d58` project (40 specs, passed twice);
  - setup, the token mint and `seed_synthetic()` reset `board_settings`;
  - the old local-key specs moved to the server settings;
  - a `COVERAGE.md` D58 section, with no GAP rows (S27's real private window is manual).
- **Full local Playwright at `6665a8f`:** 757 passed, 1 skipped (DEV-only banner), 39.1 min. An earlier
  run's two Gantt failures were stale local seed data after midnight; they passed after a reseed.
- **Gate:** `mix test` green twice, warnings-as-errors clean, tsc, vitest, build, lint 27.

## DEV gate

- Matt chose the alternative for 4118 item 2: "(blank)" only when the column has data (`be7f764`).
- Draft PR #68. DEV claimed in conv 80 (msg 104900). Pre-deploy snapshot `vs_Z7YonnZYMlki8gpNnn4n`.
- **Run 1 at `be7f764`** (API v83 / UI v86): 707 passed, 11 failed, 40 did not run (the `d58` project waits on `brewery-board`).
  - 6 owners failures, one real bug: a manager's Users & Roles Save sent no memberships when the dialog opened before `/api/departments` loaded (removed Ellis's Office). Fixed `ea3b895` (late departments filled in; Save off until loaded), revert-and-rerun test in `d58/managers.spec.ts`.
  - 5 board-settings failures: tests reloaded before the settings PUT finished (cancelled, status -1). Helpers wait for the PUT (`58c961c`).
- **Fix cycle 1 of 2, run 2 at `58c961c`** (API v84 / UI v87, reseeded): **759 passed**, 0 failed.
- Deploy worktree: `~/src/rockcut-deploy` (detached at `58c961c`); remove after the gate.

- **QA pass 1 at `58c961c`:** fail (`stepwise_results/d58_dev_qa_report.md`). Must-fix gaps 12/13 (Add department then reset/edit) and 7 (Owners in the memberships reply). Matt's decisions in `prompts/d58_lead_decisions_1.md`; the spec's decisions 10–15.
- **Fix cycle 2 of 2 at `b59278e`** (API v85 / UI v88): builder items 1–9. The lead reverted gap 2's tooltip change (`a9d8388`): its test passed without the fix, and taps never showed the bug, only Escape did.
  - Local full run: 764 passed, 1 skipped (D52's conditional, as before).
  - DEV full run: 759 passed, 2 failed, both test-only and green on rerun. S16's 47 quick week clicks overloaded DEV's API for a few seconds (500s on every list). S160 was the roster order with a parallel `[TEST-TEMP]` person. The leftover S16 series 955/956 was deleted by id.
- **QA recheck:** pass with gaps (`stepwise_results/d58_dev_qa_recheck_report.md`). Matt accepted R-1 (a manager can work out Owners from "View only", the same leftover as gap 6). R-2 is by design. R-3 (an empty `{}` per event) is harmless. DEV reseeded after QA.
- Matt's other answers:
  - gap 8 on task series accepted;
  - the open-shift notification on deactivate kept;
  - a manager editing their own name and email goes to backlog task 5789;
  - the Gantt's "Label by" picker (deferred in D47, never filed) added to D56, task 5207.
- **Verdict: pass.** PR #68 merged into `develop`.

## After the merge

Done: DEV runs `develop` at `fb09ab4`. The DEV claim is released in conv 80 (msg 105055), and the deploy worktree is removed.

## Prod release

- **`v2026.11.12` is live:** release PR #69 (squash `0813452`), tag `v2026.11.12`.
  - API v38 (`deployment-01M78M4324RZMTH0SB29NT5DGF`), UI v34 (`deployment-01M78M5NY0V6A8ZRY0TG25EH7C`).
  - Snapshot `vs_XvQBgGOL0JjlhPm3Y83l6q9`. Rollback: API v37 / UI v33, image only.
- **Both migrations ran at boot.**
- **Smoke checks green:**
  - health and UI on `0813452`, build id `v2026.11.12`;
  - `sw.js` no-cache;
  - synthetic login 401, 0 synthetic users;
  - pnpm audit clean.
- Close-out PR (this one) syncs `main` into `develop` with `-s ours`.

## Next

1. **Done: Matt's prod check passed**, and the D58 tasks are closed. He found that settings reach a
   second device only after the app restarts; a refresh when the app returns to the screen is added to D56 (5207).
   What he checked:
   - board settings follow him across browsers;
   - Users & Roles as a manager;
   - a tablet board's settings.
   Then close the D58 tasks: 4994, 4991, 4992, 4984, 5202, 4261, 5204, 4118, 5206, 5205, 4061, 5769, 4115, 4116, 4319 and 5193.
2. **D56** (5207), which now includes the "Label by" picker.
