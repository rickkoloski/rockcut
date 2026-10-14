# Session Handoff — 2026-10-11

Follows `SESSION_HANDOFF_2026-10-07b.md` (D37 in prod, nothing in progress).

This session **specced D38: the Brewery Task Board.** Matt and CC worked
through six rounds of review. The spec is a draft with two open questions.
**Nothing is committed**, and no code was written.

## Update (later the same session)

- **Q19** → each missed occurrence stays on the Unfinished card. **Q20** →
  the rule options are enough for now. The spec is **Approved**, and it was
  checked against the three-environment workflow (test conventions and
  known LIMITATIONS added to §3.9).
- **Split into three deliverables** (Matt), one spec. See its "Delivery
  split" section:
  - D38 board (task 4211);
  - D39 recurring tasks (4212);
  - D40 brewhouse tablet + reminder + dashboard (4213).
- Branch `d38-brewery-task-board` cut from `develop`. The spec, the
  `.gitignore` line and this handoff are committed there.
- **Next:** write the D38 planning doc (`docs/current_work/planning/`).

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.07` (D37), API v25 / UI v20. |
| **DEV** | Unchanged and free. |
| **Repo** | On `develop` at `2ec1f9a`. Uncommitted: the new spec `docs/current_work/specs/d38_brewery_task_board_spec.md` and a `.gitignore` line for `docs/current_work/specs/d38_ref/`. There's no D38 branch yet. |
| **Reference** | `docs/current_work/specs/d38_ref/trello-board.png` is the brewers' current Trello board. It's **gitignored and stays local**, because it shows real staff names. |
| **Backlog** | No PortableMind task has been filed for D38 yet. |

## D38 in brief

The spec is the source of truth. It's a calendar-based task list for the
Brewery that replaces the brewers' Trello board. The main parts are:

- **Day columns:**
  - the board starts today and shows 1 week or 2 weeks (a toggle that
    also sets the default, remembered per browser);
  - a date range selector (up to 31 days).
- **Day header from the schedule:**
  - each published Brewery shift (name · position · time · hours), plus
    open shifts;
  - Brewery events;
  - no drafts, shift notes or time off.
- **Daily card on every day:**
  - Backups / Gravities / Temps / Pressures;
  - managers edit the list;
  - future days can't be ticked;
  - missed checks only show amber.
- **Tasks:**
  - optional assignee;
  - drag within and across days, past days included;
  - the tap/click task menu has Edit, Add notes, Mark completed, Change
    day, Move up/down and Delete;
  - Hide completed toggle.
- **Unfinished card (start of the calendar):**
  - lists open tasks from earlier days;
  - has **Move all to today**.
- **Future list (end of the calendar):** tasks with no day.
- **Finishing a task on a different day** (late or early) asks where it
  shows: its planned day, today, or both.
- **Recurring tasks** (weekly / monthly / quarterly / annually):
  - they extend D32's `Recurrence` module;
  - each occurrence is an ordinary task;
  - repeats are kept topped up 12 months ahead every day;
  - edits apply to "Just this one" or "This and all following".
- **Shift-end push reminder:**
  - 60 minutes before **each** Brewery shift ends;
  - lists **all** of that day's open tasks plus unticked Daily checks;
  - nothing is sent if nothing is open;
  - a per-user opt-out.
- **Brewhouse tablet** (a D33 device with home department Brewery):
  - D37 staff codes are extended to Brewery members;
  - one code covers 5 minutes of activity.
- **Change log** for managers and owners. Any brewer can delete.
- **Brewery Dashboard:** a "Today's tasks" card.
- **Shared app-wide drag-and-drop layer** (`@dnd-kit`, new dependency):
  - mouse, touch (long press) and keyboard;
  - the Scheduler's HTML5 drag (D13) doesn't work on touch, and migrating
    it is a later follow-up.
- **§7:** Matt plans **multi-day tasks with dependencies** later (not
  D38). The spec records three rules so they fit without a restructure:
  - cards are keyed by task + day;
  - one server function decides what shows on a day;
  - the drag layer stays generic.

## Open questions (spec §6)

- **Q19:** missed recurring occurrences. Keep each one on the Unfinished
  card (proposed), or only the latest?
- **Q20:** are the repeat rule options enough? For example, is "every 2
  months" or "the 2nd Saturday of June" needed?

## Next

1. **Read `docs/process/three_environment_workflow.md`** and check the
   spec against it before going further. This wasn't done this session.
2. Get Matt's answers to Q19 and Q20, then mark the spec **Approved**.
3. File the D38 task in PortableMind (project 254).
4. Cut `d38-brewery-task-board` from `develop`. Commit the spec, the
   `.gitignore` change and this handoff, but not `d38_ref/`.
5. Write the planning doc. The build order needs care, because D38 is
   large:
   - the shared drag layer;
   - the data and recurrence rules;
   - the board UI;
   - Daily items;
   - the tablet and staff codes;
   - the reminder;
   - the dashboard.

   Ask Matt whether to split it into smaller deliverables.

## Still open from before

Matt's earlier queue: 4054 (reload prompt), 4055/4056, 4057, 4060–4064, 4084,
4115–4119 (**4117** is medium), 3856; **3994 due 2026-10-30**; **4058 due
2026-11-04**. Humans still need to set Taproom staff codes and pair the prod
tablets if that isn't done.

## Gotchas (new this session)

- **Handoffs live in `docs/current_work/`.** Find the newest with
  `ls -t docs/current_work/SESSION_HANDOFF_*.md | head -1`.
- **Brewery personas** for the scenarios: `brewer1`, `brewer2`, `breweryMgr`,
  `floater`, `owner`. The spec adds a new `breweryDevice` persona (a
  Brewery shared device) to the DEV seed.
- **The D32 recurrence engine** (`lib/rockcut_api/scheduling/recurrence.ex`)
  only supports `weekly` and `monthly_weekday`, and it extends by hand
  (12 months). D38 adds monthly-by-date, quarterly and annual rules, plus a
  daily top-up. D32's tests must keep passing.
