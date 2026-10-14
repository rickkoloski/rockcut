# Session Handoff — 2026-10-14

Follows `SESSION_HANDOFF_2026-10-13b.md`, which this supersedes. **D41 is
complete and merged; D42 is next.**

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.07` (D37), API v25 / UI v20. |
| **DEV** | **Free** (conv 80, msg 89362). Runs D41: API v35 (`1d61ba8`) / UI v33 (`e61869d`), the same app code as `develop`, so it wasn't redeployed. Reseeded after QA; no `[TEST-TEMP]` rows left. Tasks per board: Brewery 90, Taproom 5, Office 1; Daily items only on the Brewery (4). |
| **develop** | D41 merged (`cd76b55`, PR #20, `--no-ff`) + this close-out, pushed. |
| **Backlog** | 4237 (D41) closed. Next: D42 = 4260, then D40 = 4213. 4261 (D32 split-gap check). |
| **Worktrees** | `rockcut-d41-deploy` removed. The QA folder `~/src/rockcut-d41-qa/` is still there (not in git); delete it when no longer needed. |
| **herdr** | `lead`, `ops`, `build` (builder, w1:p5, idle), `servers` (local API :4002 / UI :5174 running). |

## D41 result

Completion record: `stepwise_results/d41_department_task_boards_COMPLETE.md`.
DEV gate: migrations at boot kept every row; DEV Playwright 317/317 after
fix cycle 1 (S111 menu race); QA PASS with gaps, no must-fix. The Pixel
hardware checks were **not run** (phone width emulated only); worth doing
during D42's DEV gate.

## Next

1. **D42 (4260): remind Matt he wants other changes in it, and ask what
   they are before planning.** Already in it: G1 (1 week / Hide completed /
   phone view remembered per board), G2 (reject another board's task as a
   move's `before_id`), N3 (`no_brewers` key), 4117 (API accepts writes
   before a required password reset), plus D39's items (deleting retired
   Daily items, Add/Restore at 12, the notes-only rule, R2, O1).
2. Then D40 (4213). Then one release of D38–D42 + D40.

## Gotchas (new)

- In `rpc` strings, don't put double quotes inside SQL (`like "%x%"`); pass
  values as params (`?1`) with `~s|...|`.
