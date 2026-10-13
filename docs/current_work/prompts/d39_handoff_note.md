# D39 handoff note

## S26

`task-board-daily` S26 ("yesterday's 3/4 is amber, and the 4th can still be
ticked") failed once in some full local D38 runs: the click on the last
Daily box never showed it checked. Investigated in D39 Task 8 (2026-10-12/13,
branch `d39-brewery-recurring-tasks` at `fb93e45`, local servers).

**What ran:**
- S26 alone, `--repeat-each 20`, traces on failure: **20/20 passed**.
- The full brewery folder (`chromium` + `brewery-board`), 3 times, with
  `--trace retain-on-failure`: **132/132, 132/132, 132/132**. The third run
  crossed local midnight.
- With the six D39 runs of the folder before these (Tasks 6 and 7, 123–128
  tests each), S26 has now passed 9 full runs and 20 lone runs in a row.

**Result:** it didn't fail, so there's no trace to read and no proven cause.
No fix was made.

**Candidates, from reading the code (unproven):**
- **A board refetch landing between the click and the `PUT`.** The board's
  write path (`run` in `TaskBoard.tsx`) cancels a fetch in flight at the
  click, but the 60-second `refetchInterval` (or a focus refetch, which is
  `'always'` since D39 Task 6) can start a new fetch while the `PUT` is still
  out. If that fetch answers first, it brings the unticked state back over the
  optimistic tick until the follow-up refresh. `setBoardCheck` then sees the
  box unchecked. A headless run gets no focus events, so the interval is the
  likelier trigger.
- **Shared Daily data.** S26 ticks every active item but the last on
  yesterday's card through the API. Another spec changing yesterday's checks
  or items at the same moment could shift which box is "last". The
  `brewery-board` project runs one worker, so this would need a spec from
  another project touching the Daily card; none does now.

**If it fails again:** keep the trace. Check the network panel for a
`GET /api/brewery/tasks` that started after the click and finished after the
`PUT`, and the box's `checked` state in the snapshots around it.
