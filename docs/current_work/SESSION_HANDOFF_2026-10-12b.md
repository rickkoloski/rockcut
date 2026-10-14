# Session Handoff — 2026-10-12 (b)

Follows `SESSION_HANDOFF_2026-10-12.md`. That one covered the DEV gate through
pass 2 and is superseded by this one.

**D38 is done:** it passed the DEV gate and is merged to `develop`. The next
deliverable is **D39 (recurring tasks)**.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.07` (D37), API v25 / UI v20. D38 is **not** on prod. D38, D39, D41 and D40 ship in one release after D40. |
| **DEV** | **Free** (conv 80, msg 88767). Runs `fd93e5f`, API v30 / UI v28. That has the same app code as `develop`, so it wasn't redeployed. Reseeded after the last run. |
| **Repo** | `develop` at the D38 merge `bdc30ac` plus the close-out commit. PR #18 is merged, and the branch `d38-brewery-task-board` can be deleted. |
| **Backlog** | D39 = 4212, **D41 = 4237** (department boards, filed), D40 = 4213. New this session: 4231, 4232, 4233, and **4238** (move the Scheduler's drag onto `components/dnd/`). |
| **herdr** | `lead` w1:t9, `build` w1:t3 (`builder` w1:p5, idle), `ops` w1:t2. |

## Done this session (after the previous handoff)

1. DEV Playwright runs 3 (262/262) and 4 (**265/265** at `fd93e5f`).
2. Matt's Pixel checks found two issues, A and B, both fixed:
   - A (`9a8196c`): a drop at the bottom of a day landed one place higher;
   - B (`4a8d79e`): back left the board instead of closing the sheet (new
     hook `useBackCloses`).

   Matt rechecked both: pass. A card finished on a day other than its planned
   day **stays pinned** at the bottom of that day (Matt; the spec already says
   so).
3. S51 on DEV at 20:09 MDT: the API's today is the Colorado date. Pass.
4. Gate verdict on PR #18. Merged `--no-ff` to `develop`. "DEV: free"
   posted. D41 (4237) and 4238 filed.
5. Close-out: `stepwise_results/d38_brewery_task_board_COMPLETE.md` and
   CLAUDE.md.

## Next: plan D39

D39 comes from the same spec. Its scope:
- recurring tasks (§3.10, S52–S67, S69);
- the items moved into it in §5:
  - un-retiring Daily items;
  - the QA pass 2 gaps (GAP-1, GAP-2, O-1 through O-3; O-3 needs a decision);
  - the **vertical all-days view** (phones start in it, and the choice is
    remembered per browser; spec "Phone width");
  - back-closes for the other phone dialogs;
  - the occasional local S26 failure.

Read `docs/process/three_environment_workflow.md` first, then cut
`d39-…` from `develop` and write the plan.

## Gotchas (new since the last handoff)

- **DEV auth files expire** (8-hour tokens). Rerun
  `E2E_TARGET=dev npx playwright test --project=setup` before any DEV API
  check.
- **`fly agent restart`** fixes both "tunnel unavailable" (ssh) and
  "Not authorized to access this organization" (deploy).
- **Use a unique end marker** for each `herdr pane run` in a reused pane. A
  stale marker wakes the watcher early.
