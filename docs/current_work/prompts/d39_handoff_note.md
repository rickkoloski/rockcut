# D39 handoff note (PR description)

**Deliverable:** D39, recurring Brewery tasks and the D38 follow-ups
(PortableMind task 4212). The second of the D38 spec's deliverables; D41
(department boards, 4237) and D40 (brewhouse tablet, 4213) follow. D38, D39,
D41 and D40 ship to prod in one release after D40.
**Spec:** `docs/current_work/specs/d38_brewery_task_board_spec.md`: §3.10,
"Phone width", §5's D39 items; scenarios S52–S67, S69–S78 (S68 is D40)
**Plan:** `docs/current_work/planning/d39_brewery_recurring_tasks_plan.md`
(Decisions 1–6: Matt, 2026-10-12 and 2026-10-13)
**Branch:** `d39-brewery-recurring-tasks`, cut from `develop` (`2d9624d`).
**SHA for DEV:** pass 1 `914aa21`; pass 2 _the push after the DEV QA fixes_

## What changed

Scenario → test for every row is in `rockcut-ui/tests/COVERAGE.md` (D39
section). S66 (the daily top-up) is ExUnit only; S70–S74 and S76 are also
**Pixel (manual)** on DEV.

| Area | Change | Scenarios |
|---|---|---|
| **Recurring tasks** | A task can repeat weekly (every 1–4 weeks, on chosen weekdays), monthly (by day, or nth/last weekday), quarterly, or annually, ending on a date, after N times, or never. Each occurrence is an ordinary `brewery_tasks` row, so everything D38 does to a task works unchanged. `(series_id, series_date)` is unique, so a moved occurrence never comes back on its old date. Occurrences are kept a year ahead: the D22 scheduler tick calls `Series.top_up/1` daily (rescued on its own). `Scheduling.Recurrence` is shared with D32, generalized to take rule fields; D32's tests pass untouched | S52–S58, S66 |
| **Series edits** | Editing an occurrence asks "Just this one" / "This and all following" (a split, as D32). A day change is always just this one (`series_exception`). Moving an occurrence to Future makes it a one-off (Decision 4). Delete asks for the scope; **Stop repeating** and **Edit series…** in the task menu. Removing later repeats when some were changed on their own offers "Remove N, keep the M changed on their own" or "Remove all" (Decision 2; also on a rule change saved with "following"). Finished occurrences are never removed. One History entry per series action, none from the top-up (Decision 3) | S59–S65, S69 |
| **One-off → repeat** | Editing a one-off can make it repeat: it becomes the first occurrence of a new series from its day (a rule starting later moves it to the rule's first day). A Future task needs a day; a finished one can't (`repeat_finished`, and Repeat is hidden). One `made_repeating` History entry (Decision 6) | S67, S78 |
| **Phone: vertical view** | Phones start in an all-days vertical view (Unfinished at top, days, Future at bottom); the toggle to the one-day view is remembered per browser (`rockcut.breweryTasks.phoneView`). Long press drags a task to any day, between days with edge auto-scroll, off Unfinished onto a day, or onto Future. The one-day view allows Unfinished → today. No drop onto Unfinished at any width (`canMoveTo` / pure `canLand` in `components/dnd/`) | S70–S74 |
| **Back closes dialogs** | Android back closes every phone dialog (task, "where should it show", Change day…, History, Edit Daily items, the series dialogs, the board confirms). A dialog opened from the sheet takes over the sheet's history entry, so one back closes it and the next leaves the board; no dead back press after Cancel | S76 |
| **Daily items** | Restore a retired item (Edit Daily items → Retired): at the bottom, old ticks kept, counts against the 12 cap. The days it was retired stay without it (spans from its History, Decision 5). Unticking a retired item, or on a retired day, is refused (Decision 1, O-3). Any PATCH on a retired item is 422 `retired` (GAP-1, GAP-2) | S75 |
| **Smaller fixes** | A task route that 404s or 410s reads "This task was deleted" (S77). The board refetches on focus `'always'`. The Daily items dialog reads the board query (O-2) | S77 |
| **Seed** | `[SEED]` Keg Wash (weekly Wed, from ~14 days ago), Glycol check (monthly, last Fri), Calibrate pH meter (quarterly, 15th). `reset` and `cleanup_temp` cover series | — |

## Migrations

| Migration | Change | Reversible |
|---|---|---|
| `20261012120001_create_brewery_task_series` | `brewery_task_series` (the rule, `generated_through`, `skipped_dates`) + indexes on `department_id`, `generated_through`; adds `series_id` (FK, nilify), `series_date`, `series_exception` (default false) to `brewery_tasks`; unique `(series_id, series_date)` | Yes (`change`) |

| `20261014120001_add_continues_series_id_to_brewery_task_series` | DEV QA G1: `brewery_task_series.continues_series_id` (FK to itself, nilify) + index; a split records what it continues | Yes (`change`) |
| `20261015120001_add_internal_end_to_brewery_task_series` | DEV QA R1: `internal_end` (boolean, default false) marks the `until_date`s that only stop the top-up (a split's old part), so Ends shows the chain's real end | Yes (`change`) |

Additive. **Rollback checked** 2026-10-13 on a scratch copy of the local dev
DB (read-only `VACUUM INTO`, the real DB untouched): `down` dropped the
series table, its two indexes, the unique index and the three task columns,
and kept every task (88), user (27), History entry and Daily item; `up`
restored the identical schema. A rollback turns every occurrence into a
one-off and loses the rules.

## New routes, dependencies and secrets

- **Routes** (people only, in the route matrix): `GET /api/brewery/tasks/:id/series`,
  `POST /api/brewery/tasks/:id/stop_repeating`, `POST /api/brewery/daily_items/:id/restore`.
  `POST /tasks` and `PATCH /tasks/:id` take flat `repeat*` params;
  `PATCH` / `DELETE` take `scope=this|following` and `changed=keep|remove`;
  `GET /daily_items?include_retired=true`.
- **New errors:** `repeat_needs_day`, `repeat_finished`, `scope_required`,
  `not_in_series`, 410 `deleted`, `retired` on every retired-item write.
- **No new dependencies, secrets or config.**

## DEV must exercise

- **The top-up on a real clock:** after the deploy, the scanner has run
  (`generated_through` = today + 12 months for the seed's series); again the
  next day if the gate runs that long.
- **The migration at boot** on the DEV volume.
- **Volume:** a 31-day range `GET` stays quick with the seed's series.
- **On the Pixel as `brewer1`** (the checklist below).
- S51-style: create a repeating task after 6 pm Colorado; its first
  occurrence is on the Colorado day.

### Pixel checklist

1. First visit at phone width opens the vertical view; switch to one day,
   reload, still one day (S70).
2. Long-press a task and drag it down two days; the page auto-scrolls; it
   lands where dropped (S71). Is the scroll speed comfortable?
3. Long-press a task on Unfinished and drop it on tomorrow (S72); in the
   one-day view on today, drop one from Unfinished between today's first and
   second (S73).
4. Drag a task onto Future (S74).
5. A normal flick that starts on a card only scrolls.
6. Back closes each dialog: the task dialog, "where should it show",
   Change day…; open one from the sheet, back closes it, back again leaves
   the board (S76).
7. Create a weekly repeat, edit one occurrence "just this one", then Stop
   repeating with the two-button confirm.

## DEV gate

- **Pass 1 (`914aa21`, API v31 / UI v29, 2026-10-13):** the migration ran at
  boot; the top-up on DEV's clock took the seed series to 2027-10-13 with no
  duplicate dates. Full Playwright on DEV: **293/293**, no retries.
- **Independent QA** (`stepwise_results/d39_dev_qa_report.md`): PASS with
  gaps. All 26 D39 scenarios and the D38 sweep passed (phone ones emulated).
  - **G1 (must-fix), fixed in `85c33c8`:** after a rule change split a
    series, "following" actions from an earlier occurrence stopped at the
    split. A split now records what it continues (`continues_series_id`),
    and every "following" action and the confirm counts walk the chain.
    Splits made before the fix have no link (DEV test data only; no
    backfill).
  - **G2 (minor), fixed in `fc422e1`:** the last occurrence of a stopped
    series no longer offers Stop repeating.
  - Observations moved to D42 (Matt, 2026-10-13): deleting a retired Daily
    item; Add/Restore enabled at 12 items; the notes-only exemption rule.
- **Matt's Pixel checks (hardware, DEV, `914aa21`): 7/7 pass:** the
  vertical view and remembered toggle; drag down two days with auto-scroll
  (speed good); Unfinished → tomorrow and → between today's first and
  second; drop on Future; a flick on a card only scrolls; back closes each
  dialog; a weekly repeat, "Just this one", Stop repeating with two buttons.
- After the fixes, local: ExUnit, Vitest, `tsc`, build pass; brewery folder
  134/134.

## Local gate

2026-10-13, at `6f73e31` (the code is final; later commits are docs only):

- **ExUnit (full): 1,257 tests, 0 failures.**
- **Vitest: 62 passed.** `tsc` and `vite build` clean.
- **Lint:** 27 problems (26 errors, 1 warning), all pre-existing; none new.
- **Full Playwright, every project** (`setup`, `chromium`, `brewery-board`,
  `board-replace`): **292 passed, 1 skipped** (the DEV-only ribbon check),
  0 failed, no retries (19.6 min).
- During the build, the brewery folder passed 132/132 three times (Task 8)
  and 133/133 (Task 9); S26 never failed in D39 (see below).

## S26

`task-board-daily` S26 ("yesterday's 3/4 is amber, and the 4th can still be
ticked") failed once in some full local D38 runs: the click on the last
Daily box never showed it checked. Investigated in D39 Task 8 (2026-10-12/13,
branch `d39-brewery-recurring-tasks` at `fb93e45`, local servers).

**What ran:**
- S26 alone, `--repeat-each 20`, traces on failure: **20/20 passed**.
- The full brewery folder (`chromium` + `brewery-board`), 3 times, with
  `--trace retain-on-failure`: **132/132, 132/132, 132/132**. The second run
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

## LIMITATIONS

- A Daily-items spec (S29, S75, Decision 1) retires and restores an item in one test; a run that crosses Colorado midnight between the two leaves a one-day retired span on the shared DB (Decision 5), so yesterday shows one item fewer and S26 could miss its box.
