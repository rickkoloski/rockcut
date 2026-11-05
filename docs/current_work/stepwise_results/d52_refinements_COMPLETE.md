# D52: Refinements — Complete

**Spec:** `specs/d52_refinements_spec.md`
**Completed:** 2026-10-30 (on prod as `v2026.10.30`)

---

## Summary

A refinement round built with Matt in the running local app (2026-10-28/29), then written up. The nav got custom outline icons and a collapsed rail that opens sections in place. Seven pages share one top row with a settings gear (task boards, View Schedule, Scheduler, Gantt, Brands & Recipes, Ingredient Library, Buy-a-Beer). `Schedule.tsx` split into View Schedule and the Scheduler (D44 item 0). The Gantt got a slimmer Task list over the chart, a full-height chart, tank abbreviations (one migration) and template-preview steps. The task boards got notes on hover and extending a series from its last occurrence. Eight backlog tasks closed with it.

---

## Implementation Details

### What Was Built

- Nav: `components/NavIcons.tsx` (fermenter, two fermenters, van, barley, gift mug); outline icons throughout; the collapsed rail opens a section's pages as icons; channel icons ("all", "mngr", departments)
- `components/SettingsMenu.tsx`: `PageToolbar`, `SettingsGear`, `SettingsChoices`, `SettingsToggle` (keyboard-reachable choices)
- `pages/schedule/ViewSchedule.tsx`, `Scheduler.tsx`, `useScheduleData.tsx` (replaces `Schedule.tsx`); striped draft shifts (`WeekGrid.tsx`); Publish week confirm (4232)
- Gantt: Task list over the chart (317 px, title opens the step), no legend, chart to the window's bottom, bar tooltip height, no lines between an expanded tank's steps, lighter Light day lines, same-day dots across parts (4949), template-preview steps
- `tanks.abbreviation` (API, `TankDialog`, names-only column at 74 px); DEV seed SV1–SV4
- Task boards: gear menu (From/To picker removed); notes on hover and by keyboard; `ExtendSeriesDialog.tsx` (Same again / Pick a new end); `Series.mark_last` counts the rule's dates for count-ended series; `/tasks/<board name>` (4318); Acting-as contrast (4298)
- Ingredient categories under the library (`/ingredients/categories`; `/settings…` redirect); Buy-a-Beer gear and `?view=history`
- `useApiList` for list endpoints (4063); Messages channel-list Retry (4062)

### Migration

`20261028120001_add_abbreviation_to_tanks` (nullable column; rollback-safe).

## Testing

- Local: `mix test` 1826 passed; vitest 177; tsc / vite build clean; lint no new errors; Playwright 592 passed (S73 flake, also on `develop`).
- Revert-and-rerun for 4707, 4232, 4318, 4298, 4063, 4062, 4949 and QA gaps 1, 4, 5, 7.
- DEV: full Playwright 598/599 at `3de8429`, then S59 fixed (3/3); independent QA pass `stepwise_results/d52_dev_qa_report.md` (gaps 1, 4, 5, 7 fixed; 2, 3, 6, 8 filed as 4991–4994; 9, 10 no change).
- Tests: shared helper `tests/regression/settingsMenu.ts`; 30+ specs updated; new `ui/d52`, `brewery/task-board-d52`, `production/d52-gantt`; 4706 contrast tests on a persona no other spec rethemes.

## Release

- PR #44 → `develop` (`b44dbe0`); release PR #46 squash `c19a604`; tag `v2026.10.30`.
- Prod API v31 `registry.fly.io/rockcut-api:deployment-01M66H3S4P6DJTH8Y4GA97CYX4`, UI v28 `registry.fly.io/rockcut-ui:deployment-01M66H4WXJVZHS9ZVY1W5C1XRD`.
- Rollback: API v30 `…deployment-01M62XHR3QFT2TESVHEX3MXVXP`, UI v27 `…deployment-01M62XJZDS15TCQDHYJJTAYN91`; snapshot `vs_8AV7OevqPlxLcoX73eNb9Ko6`.
- Matt signed in and checked prod.

## Follow-ups

- Matt adds tank abbreviations on prod (Set up → Tanks).
- Backlog from QA: 4991 (remember View), 4992 (range > 31 days), 4993 (missing category spinner), 4994 (board settings in two places).
- D44 items 1–2 (time-off dialogs in the Scheduler) are next in line for that spec.
