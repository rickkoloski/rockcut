# D52: Refinements — Spec

**Status:** COMPLETE (on prod as `v2026.10.30`, 2026-10-30). Record: `stepwise_results/d52_refinements_COMPLETE.md`.
**Backlog:** 4707, 4232, 4949, 4318, 4298, 4706, 4063, 4062; D44 item 0
**Concept:** 02_scaffold_ui
**Way of working:** iterated with Matt in the running local app, then written up
(Matt, 2026-10-28: "refine the app more than add things"). Icon comparisons:
`docs/current_work/reference/nav_icons_mockup.html` (local only).

---

## 1. Items

| # | Item | Source | Where |
|---|---|---|---|
| 1 | Nav icons: Brewery a conical fermenter, Taproom the outlined mug, Sales a van, Production two small fermenters, Ingredient Library a barley head, Buy-a-Beer a mug with a bow; every nav icon an outline | Matt | `components/NavIcons.tsx`, `App.tsx`, `Home.tsx` |
| 2 | Collapsed nav: a section opens its pages as icons below it (the rail stays 64 px); channels show "all", "mngr" and department icons | Matt | `App.tsx` |
| 3 | One top row on seven pages: controls left; actions, then a settings gear, right; on the page background (no white panel) | Matt | `components/SettingsMenu.tsx` (`PageToolbar`, `SettingsGear`) |
| 4 | Task boards: ‹ Today › and the gear (View; Hide shifts / completed / planned batches; First day; Days shown; Edit Daily items; History). The From / To picker is gone; a range still comes from the URL | Matt | `tasks/BoardToolbar.tsx` |
| 5 | Split `Schedule.tsx` into `ViewSchedule.tsx` and `Scheduler.tsx` with a shared `useScheduleData` (D44 item 0; fixes 4707) | D44, Matt | `pages/schedule/` |
| 6 | View Schedule: Today, From, To; gear (Department, Position, My shifts, Open shifts only, Calendar sync); no color key; a dot on the gear while a filter is on | Matt | `ViewSchedule.tsx` |
| 7 | Scheduler: This week, ‹ week ›; Add shift, Add event, Copy last week, **Publish week**; gear (Department, Position, Templates, Positions, Delete week); no color key, My shifts or Open only | Matt | `Scheduler.tsx` |
| 8 | Draft shifts keep their department/position color, striped (stripes away from the text color; light stripes on very dark colors) | Matt | `WeekGrid.tsx` |
| 9 | Gantt: Today, ‹ From – To ›; flags, Task list, **Add process ▾**; gear (Weeks on screen, Tanks, Set up); no legend; the chart runs to the window's bottom | Matt | `production/Gantt/` |
| 10 | Gantt Task list: over the chart (317 px), title bar level with the dates; rows are check, title (opens the step), notes, who has it — no Move, assign or Open | Matt | `TaskListPanel.tsx` |
| 11 | Gantt: a bar's tooltip at the height of a step's; no lines between an expanded tank's steps; lighter day lines in Light | Matt | `GanttGrid.tsx` |
| 12 | Tank **abbreviation** (optional, ≤ 4 characters) shown in the names-only column, 40 % narrower; DEV seed SV1–SV4 | Matt | API + `TankDialog`, `GanttGrid` |
| 13 | Template preview: a caret per tank opens its steps (diamonds, names, links) as on the Gantt | Matt | `TemplatePreview.tsx` |
| 14 | Notes: hovering a task's notes icon shows the notes; a click on the icon or the popup edits them | Matt | `TaskCard.tsx` |
| 15 | Extend a series: the last occurrence of a series that ends is tagged "last in series"; checking it off, or its menu, offers **Same again** / **Pick a new end…** | Matt | `ExtendSeriesDialog.tsx`, `TaskBoard.tsx`, `TaskMenu.tsx` |
| 16 | Ingredient categories (was Brewery → Settings) move under the Ingredient Library's gear (`/ingredients/categories`; old `/settings` links redirect) | Matt | `App.tsx`, `IngredientsList.tsx`, `pages/settings/` |
| 17 | Brands & Recipes and Buy-a-Beer on the top row; Buy-a-Beer's Export, Import, History in its gear (no Board / History tabs) | Matt | `BrandsList.tsx`, `BeerBoard.tsx` |
| 18 | 4232: Publish week asks first, with the counts | backlog | `Scheduler.tsx` |
| 19 | 4318: `/tasks/<board name>` opens that board (`/tasks/taproom` → `/tasks/bar`) | backlog | `TaskBoardRoutes.tsx` |
| 20 | 4298: "Acting as" bar readable in Light (dark info blue, ≥ 4.5:1) | backlog | `ActingCode.tsx` |
| 21 | 4949: same-day dots spread across a tank row's parts | backlog | `lib/gantt.ts`, `GanttGrid.tsx` |
| 22 | 4063: a list reply that isn't a list reads as empty (`useApiList`) on Scheduler, View Schedule, Time off, Messages | backlog | `hooks/useApiQuery.ts` |
| 23 | 4062: a failed channel list shows "Couldn't load the channels." with Retry | backlog | `Messages.tsx` |
| 24 | 4706: the board contrast tests use a persona no other spec changes the theme of | backlog | `tests/regression/ui/task-board-ui.spec.ts` |

### 1.1 The settings gear (items 3–7, 9, 16, 17)

`SettingsGear` holds a page's settings in one menu. Rows are:

- **choices** (`SettingsChoices`): a heading showing the current value; a click
  shows the options right below it (plain menu items, so the arrow keys
  reach them); a pick closes them and puts focus back on the heading;
- **switches** (`SettingsToggle`);
- **items** that open a dialog or another page (close the menu).

The menu stays open while choices and switches change. Keyboard: Enter on
the gear opens it on its first row; Enter opens a choice; arrows move;
Enter picks; Escape closes.

### 1.2 Extend a series (item 15)

Only a series that ends (a date or N times) has a last occurrence; one with
no end is kept 12 months ahead and never asks. **Same again** runs it as long
again: twice the count, or the end moved by the span from its start to its
end. It's D42's Ends-only change (adds dates, removes none). **Pick a new
end…** opens Edit series. Anyone who can edit the series is asked; a shared
tablet isn't. UI only: the API already marks `series_last` and extends.

### 1.3 Tank abbreviation (item 12)

`tanks.abbreviation` (string, nullable), cast with the tank; trimmed, blank
→ null, at most 4 characters ("Use up to 4 characters."). Returned with the
tank. The names-only column (74 px) shows it, else the name; hover shows the
full name. Migration `20261028120001_add_abbreviation_to_tanks` (add a
nullable column: safe to roll back).

## 2. Decisions (Matt)

| Q | Decision |
|---|---|
| Mock-ups or the live app? | The live app; mock-ups only for the icon picks |
| Fermenter | C1 wide (straight legs, sideways oval manway) |
| Van | D (outlined cargo van) |
| Delete week | In the Scheduler's gear (the row then fits 1280 px with the nav open) |
| Scheduler order | This week, week left; Add shift, Add event, Copy last week, Publish week right |
| Draft look | Striped, softened, contrast-safe |
| Extend prompt | On check-off and from the menu; Same again and Pick a new end; anyone who can edit the series |
| Gantt legend | Removed |
| Task list rows | No Move / assign / Open; the title opens the step |
| 4963 (drop `legacy_tokens_revoked_at`) | Waits a release |

## 3. Scenarios

Desktop 1440×900, phone 412×915.

| # | Persona | Path | Expected |
|---|---|---|---|
| S190 | `owner` | the seven pages | The gear in the same place on each, not inside a white panel |
| S191 | `owner` | collapse the nav; Brewery; Production | Brewery's pages open below it as icons; rail stays 64 px; hover names each; Production opens |
| S192 | `owner` | collapsed nav → Messages | "all", "mngr", department icons |
| S193 | `brewer1` | board gear → View → My tasks; First day → Monday; Days shown → 1 week | Board follows; remembered as before (S134–S140) |
| S194 | `brewer1` | `/tasks/brewery?from=…&to=…` | A custom range; Days shown reads "Custom" |
| S195 | `breweryMgr` | board gear | ends with Edit Daily items, then History; staff see neither |
| S196 | `owner`, `barMgr` | Scheduler → View Schedule (nav) | Today through today + 6 (4707) |
| S197 | `barMgr` | View Schedule: dates Nov 10–23; Today | Today through today + 13 |
| S198 | `barMgr` | Scheduler with a draft event → Publish week → Cancel | Asks with the counts; Cancel publishes nothing (4232) |
| S199 | `owner` | Scheduler with drafts | Draft chips striped in their color; published plain |
| S200 | `brewer1` | Gantt | No legend; chart ends 24 px above the window's bottom; page doesn't scroll |
| S201 | `brewer1` | Gantt gear by keyboard | Enter, Enter, ↓, ↓, Enter, Esc picks 6 weeks |
| S202 | `brewer1` | Gantt → Task list | Over the chart, 317 px, level with the dates; title opens the step; the assignee named |
| S203 | `brewer1` | a tank abbreviated SVA; names-only | Shows SVA; the full view shows the name |
| S204 | `brewer1` | template → preview caret | The tank's steps, in day order, with links |
| S205 | `brewer1` | a task with notes: hover; click icon; click popup | Notes shown; Edit with Notes focused; no task menu |
| S206 | `brewer1` | weekly series ending next week: its last card | Tagged "last in series"; menu has Extend series… |
| S207 | `brewer1` | check off that last one | "That was the last … (it ends on …)"; Same again moves the end a week on |
| S208 | `brewer1` | Extend → Not now; Extend → Pick a new end… | Unchanged; Edit series opens |
| S209 | `breweryDevice` | the last card's menu | No Extend series |
| S210 | `floater` | `/tasks/taproom?from=…&to=…` | `/tasks/bar` with the range (4318) |
| S211 | `breweryDevice` | tick with a staff code | "Acting as" text ≥ 4.5:1 (4298) |
| S212 | `owner` | list endpoints answer `{"data": null}` | Scheduler, View Schedule, Time off, Messages render (4063) |
| S213 | `owner` | `/api/channels` fails, then Retry | Error with Retry; Retry recovers (4062) |
| S214 | `owner` | `/settings`, `/settings/categories/1`; Ingredient gear | Redirect to `/ingredients/categories…`; gear opens the categories; no Settings in the nav |
| S215 | `barMgr` | Buy-a-Beer gear → History → ‹ Board | Export, Import, History in the gear; no tabs; back to the board |

## 4. Acceptance criteria

- [ ] Items 1–24 as described; Light and Dark.
- [ ] One migration (`tanks.abbreviation`); API tests for it (production
      controller) and the seed (synthetic).
- [ ] Specs updated for every moved control (shared helper
      `tests/regression/settingsMenu.ts`); new specs for S190–S215
      (`ui/d52`, `brewery/task-board-d52`, `production/d52-gantt`, plus
      checks added to existing specs); full suite green locally and on DEV.
- [ ] Checked by hand on the Pixel and a taproom tablet.

## 5. Out of scope

D44 items 1–2 (time-off dialogs in the Scheduler), 4950 (Undo snackbar),
4061, 4319, Buy-a-Beer data tasks (4115, 4116, 4118), 4084 lint, 4963.
