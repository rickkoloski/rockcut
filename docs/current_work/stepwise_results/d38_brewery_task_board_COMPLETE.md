# D38: Brewery Task Board — Completion Record

**Status:** COMPLETE on `develop`. Passed the DEV gate and merged on
2026-10-12 (PR #18, merge `bdc30ac`). **Not on prod:** D38, D39 and D40 ship
in one release after D40 merges (Matt, 2026-10-11).
**Spec:** `specs/d38_brewery_task_board_spec.md` (approved 2026-10-11; D38's
part is in its "Delivery split". Amended during the gate: S24 wording, the
department-boards decision, and the D39 follow-ups in §5)
**Plan:** `planning/d38_brewery_task_board_plan.md`
**Concept:** 10_brewery_tasks (new)
**Branch:** `d38-brewery-task-board`, cut from `develop` (`2ec1f9a`), 52
commits. The DEV gate SHAs:
- pass 1: **`6c9e317`**;
- pass 2: **`fcaba29`**, after the G1, G3 and G4 fixes;
- pass 3: **`fd93e5f`**, after the Pixel fixes A and B.

**Backlog:** PortableMind project 254. D38 = 4211, D39 = 4212, D40 = 4213.
Filed during the gate:
- 4231: create-user returns the temp password;
- 4232: Publish Week has no confirm;
- 4233: the `source-map-js` advisory;
- **4237: D41, department task boards**;
- 4238: move the Scheduler's D13 drag onto `components/dnd/`.

**QA reports:** `stepwise_results/d38_dev_qa_report.md` (pass 1),
`d38_dev_qa2_report.md` (pass 2)
**PR description / full detail:** `prompts/d38_handoff_note.md`

---

## Summary

The brewers' Trello board moved into the app. Brewery → **Tasks**
(`/brewery/tasks`) shows two weeks of day columns. Each day has:
- the published Brewery schedule as its header;
- a Daily checks card (Backups, Gravities, Temps, Pressures);
- tasks that can be dragged within a day, to another day, or to a Future
  list.

Open tasks from past days collect on an Unfinished card, with "Move all to
today". A task finished on another day asks where it should show. Managers edit
the Daily items and see a History of every change. On a phone, the board shows
one day at a time.

## What shipped

| Area | Change |
|---|---|
| **Data model** | `brewery_tasks`, `brewery_daily_items` and `brewery_daily_checks`, and `brewery_task_events` (History, kept after a delete). The pure `BreweryTasks.Placement.cards/3` alone decides what shows on a day. `Authz` covers `:brewery_tasks` and `:brewery_daily_items`. |
| **API** | 15 routes under `/api/brewery`, for people only (devices are refused until D40). "Today" is the Colorado date. Dense positions, with a move renumbering the list in one transaction. A range is at most 31 days. Leaving the Brewery unassigns that person's open tasks. |
| **Shared drag layer** | `src/components/dnd/` on `@dnd-kit`: mouse, touch long press, keyboard, auto-scroll and screen-reader announcements. A card finished on a day other than its planned day stays below that day's own tasks (`staysLast`). |
| **Board** | Range in the URL; 1 or 2 weeks, or a custom range; filter All / Mine / Unassigned; Hide completed. A task menu, an add/edit dialog that sends only changed fields, the "where should it show" dialog, Change day… and Move to Future. Optimistic writes with rollback, and a 60-second refresh. |
| **Daily** | Ticks with who and when. A past day shows only the items that existed then. Managers can add, rename, retire and reorder items, up to 12 active. |
| **Phone** | One day at a time with a day strip, swipe and arrows. The task menu opens as a bottom sheet, and Android back closes it (`useBackCloses`). Long press reorders within a day. |
| **Seed** | `[SEED]` tasks relative to today, Daily checks and a Brewery event. Fixed: an evening setup on DEV (a UTC host) seeded next week. |

**Migrations (3, all additive and reversible):** tasks, Daily items and checks,
and task events. A rollback loses every task and History entry. **No new
secrets.** **New UI dependencies:** `@dnd-kit/core`, `@dnd-kit/sortable`,
`@dnd-kit/utilities`, and `vitest` (dev only).

## Testing

- **Local gate (`2fdb7f2`):** ExUnit 1,118/0, Vitest 19/19, `tsc` and the
  build pass. Lint shows 26 errors and 1 warning, all pre-existing. Full
  Playwright passes. The step 7 mystery failure was the D33 pairing limiter
  leaking between tests (test-only fix `2fdb7f2`).
- **DEV pass 1 (`6c9e317`):** full suite 259/259. Independent QA: PASS with
  gaps, no must-fix.
- **Fixes after pass 1:**
  - G1 (`8decf0c`): a stale Edit dialog undid other people's edits.
  - G3 (`593a088`): un-retiring an item was a silent 200; now a 422.
  - G4 (`2e4b24f`): past Daily cards showed items added later.
  - G2 became a spec wording change.

  Each new test was revert-checked. Local ExUnit: 1,122/0.
- **DEV pass 2 (`fcaba29`):**
  - Run 2: 261/262. S23e failed, a race in the test's drag helper, fixed in
    `d0831e7`.
  - Run 3: 262/262.
  - QA pass 2 verified G1, G3 and G4. Its gaps and observations moved to D39.
- **Matt's Pixel checks (hardware, DEV):** 6 of 8 passed the first time.
  Two issues were found and fixed:
  - A (`9a8196c`): a drop at the bottom of a day landed one place higher.
  - B (`4a8d79e`): back left the board instead of closing the sheet.

  Both rechecked by Matt: pass. He also confirmed that a card finished on a
  day other than its planned day stays pinned at the bottom of that day.
- **DEV pass 3 (`fd93e5f`, API v30 / UI v28):** full suite **265/265**.
- **S51 on DEV:** at 20:09 MDT (02:09 UTC the next day), the API's today was
  2026-10-12. Pass.

## Follow-ups

- **D39 (4212), recurring tasks.** Also moved there:
  - un-retiring Daily items;
  - the QA pass 2 gaps (GAP-1, GAP-2, O-1 through O-3);
  - the vertical all-days view (phones start in it, and the choice is
    remembered per browser);
  - back-closes for the other phone dialogs;
  - the occasional local S26 failure.
- **D41 (4237), department task boards**, built after D39 and before D40. A
  spec amendment comes first.
- **D40 (4213):** the brewhouse tablet, Brewery staff codes, the shift-end
  reminder and the dashboard card.
- 4238: move the Scheduler's drag onto the shared layer. Also 4231, 4232
  and 4233.
- Skipped (Matt): edge-drag to another day on a phone.
