# D39: Recurring Brewery Tasks + D38 Follow-ups — Completion Record

**Status:** COMPLETE on `develop`. Passed the DEV gate and merged on
2026-10-13 (PR #19, merge `ddaaa68`). **Not on prod:** D38, D39, D41, D42
and D40 ship in one release after D40.
**Spec:** `specs/d38_brewery_task_board_spec.md` (D39's part: §3.10, "Phone
width", §5's D39 items; scenarios S52–S67, S69–S78)
**Plan:** `planning/d39_brewery_recurring_tasks_plan.md` (Decisions 1–6,
Matt, 2026-10-12/13)
**Concept:** 10_brewery_tasks
**Branch:** `d39-brewery-recurring-tasks`, cut from `develop` (`2d9624d`),
47 commits. DEV gate SHAs: pass 1 `914aa21`, pass 2 `ef48d87`, **pass 3
`08dd32e`** (the gate's SHA).
**Backlog:** D39 = 4212. Filed at the gate: **4260 (D42, task board
follow-ups + 4117)**, 4261 (check D32 events for the split gap).
**QA reports:** `stepwise_results/d39_dev_qa_report.md`,
`d39_dev_qa_recheck.md`, `d39_dev_qa_recheck2.md`
**PR description / full detail:** `prompts/d39_handoff_note.md`

---

## Summary

Brewery tasks can repeat: weekly (every 1–4 weeks, on chosen weekdays),
monthly (by day, or nth/last weekday), quarterly or annually, ending on a
date, after N times or never. Each occurrence is an ordinary task, kept 12
months ahead by the daily scheduler. Edits ask "Just this one" or "This and
all following"; Stop repeating and Edit series… are in the task menu, and
removing later repeats offers to keep the ones changed on their own. A
one-off can be made to repeat. Phones start in a vertical all-days view
where a long press drags a task to any day, off Unfinished, or onto
Future, and Android back closes every dialog. Retired Daily items can be
restored.

## What shipped

| Area | Change |
|---|---|
| **Data model** | `brewery_task_series` (the rule, `generated_through`, `skipped_dates`, `continues_series_id`, `internal_end`); `series_id`, `series_date` (unique together) and `series_exception` on `brewery_tasks`. `Scheduling.Recurrence` generalized and shared with D32 (new monthly-by-day, quarterly, annually rules). |
| **Series** | `BreweryTasks.Series`: create, daily `top_up/1` (from the D22 scheduler tick), edit this/following (a rule change splits), delete this/following, stop, preview, make repeating. A split records what it continues, and every "following" action walks the whole chain (G1); the person's Ends is the chain's, not a split's internal end (R1). One History entry per series action. |
| **API** | `repeat*` params on create/edit, `scope` and `changed=keep\|remove` on edit/delete, `GET /tasks/:id/series`, `POST /tasks/:id/stop_repeating`, `POST /daily_items/:id/restore`, `include_retired`; errors `repeat_needs_day`, `repeat_finished`, `scope_required`, `not_in_series`, 410 `deleted`, `retired`. |
| **UI** | Repeat fields in the task dialog (with a summary line), ↻ on cards, the scope and remove-later confirms, Edit series… / Stop repeating, "This task was deleted". |
| **Phone** | Vertical all-days view (remembered per browser), long-press drag across days with edge auto-scroll, Unfinished → a day, onto Future; no drops onto Unfinished at any width; back closes every phone dialog (`usePhoneBackCloses`). |
| **Daily** | Restore a retired item; the days it was retired stay without it (Decision 5); retired items refuse every write. |
| **Seed** | `[SEED]` Keg Wash (weekly Wed), Glycol check (monthly, last Fri), Calibrate pH meter (quarterly, 15th). |

**Migrations (3, additive, reversible):** `20261012120001_create_brewery_task_series`,
`20261014120001_add_continues_series_id_…`, `20261015120001_add_internal_end_…`.
A rollback turns every occurrence into a one-off. **No new secrets or
dependencies.**

## Testing

- **Local gate (`6f73e31`):** ExUnit 1,257/0, Vitest 62, `tsc` and build
  clean, lint 27 pre-existing, full Playwright 292 passed / 1 skipped
  (DEV-only). After the gate fixes: ExUnit 1,270/0, Vitest 63, brewery
  folder 135/135.
- **DEV pass 1 (`914aa21`, API v31 / UI v29):** 293/293. QA: PASS with
  gaps → **G1** (must-fix: "following" stopped at an earlier split) and
  **G2** (Stop repeating offered on a stopped series), fixed.
- **Matt's Pixel checks (hardware, pass 1 build): 7/7.**
- **DEV pass 2 (`ef48d87`, API v32 / UI v30):** 290/294, all four from
  tests assuming DEV's shared board held only test data; Matt's test series
  deleted with his OK; specs hardened (`f363754`). QA recheck 1: G1 and G2
  pass; **R1** (must-fix: a rule change from before a split kept the split's
  end date, so the task silently stopped), fixed.
- **DEV pass 3 (`08dd32e`, API v34 / UI v31):** **295/295**, no retries. QA
  recheck 2: **PASS**, with R2 and O1 moved to D42.
- The DEV top-up on a real clock kept the seed series 12 months ahead with
  no duplicate dates at every check.

## Follow-ups

- **D41 (4237), department task boards**: next. Spec amendment first.
- **D42 (4260)**: deleting retired Daily items, Add/Restore at 12, the
  notes-only rule, R2, O1, and 4117. **Matt has more changes to add when it
  starts.**
- **D40 (4213)**: the brewhouse tablet, the shift-end reminder, the
  dashboard card.
- 4261: check D32 events for the split gap. 4238, 4231, 4232, 4233 as
  before.
- S26: no failure in D39; the candidate cause is in the handoff note.
