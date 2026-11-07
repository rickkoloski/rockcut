# D53 Part 1 handoff note (PR description, draft)

**Status: draft at stop point 3.** The builder has run the new spec, the changed specs,
`brewery-board` and `production`. The full Playwright suite is still the lead's. Fill in
the SHA and the full-suite result before this goes in the PR.

**Deliverable:** D53 Part 1, multiple assignees on tasks (PortableMind task 5063).
**Spec:** `docs/current_work/specs/d53_idea_boards_spec.md` §3, S216–S222.
**Plan:** `docs/current_work/planning/d53_part1_multi_assignees_plan.md`, changed by
`docs/current_work/prompts/d53_part1_lead_decisions_1.md`.
**Branch:** `d53-part1-multi-assignees`, from `develop` @ `b3670d0`.
**SHA for DEV:** _to fill in after the local gate._
**Release:** merges to `develop` after its DEV gate. Not released until Part 2 passes.

## What changed

Scenario → test is in `rockcut-ui/tests/COVERAGE.md` (D53 Part 1).

| Area | Change | Scenarios |
|---|---|---|
| Data | `task_assignees` and `task_series_assignees`, with `position`. Backfilled from `assignee_id`, which stays, kept equal to the first person | §3.1 |
| One writer | `Tasks.Assignees` is the only code that writes assignees | §3.1 |
| Task dialog | "Assigned to" is a multi-select with chips. People who stay keep their order, new ones go last. Someone who left stays visible until removed | S216 |
| Card, menu, Today's tasks | One person stays beside the title; two or more get their own row under it. Up to three initials then "+N", with a tooltip. The menu and Today's tasks show everyone | S216 |
| View filter, `open_work` | Mine = I'm on the list; Unassigned = nobody | S217 |
| Leaving a department | Removes only that person from open tasks and series on that board; the next person becomes first | S218 |
| Repeats | The series carries the list; this, following, splits, Ends-only, one-off → repeat and top-up all follow it | S219 |
| Linked tasks | Keep the step's one person and single picker. More than one through the API is 422 `linked_task_assignees` | S220 |
| Shift-end push | Each person hears once; a task they're on reads as theirs | S221 |
| Tablet | Sets several people with a staff code; History names the acting person | S222 |
| History | New events store id lists: "Assigned Riley Wort, Jordan Float to …", "Removed …". Full names, as History does today | S216 |
| API | `assignees: [{id, name}]` beside `assignee_id` and `assignee_name` (one release). Writes take `assignee_ids`; a lone `assignee_id` means `[id]`. A 422 under `assignee_ids` names the person | §3.3 |
| Seed | One Brewery and one Taproom `[SEED]` task with two people | |

**Reorder isn't a change (lead decision 3):** the same people in another order means no
write, event, scope question or exception, and `assignee_id` stays put.

**One old History row reads differently, on purpose (lead decision 1):** an old
`made_repeating` event with an assignee change used to read "someone no longer here",
because its names were never loaded. It now shows the real name. Other old events read
exactly as before.

## Migrations

**Yes, reversible:** `20261106120001_create_task_assignees` creates the two tables and
backfills them. Down drops the tables and keeps `assignee_id`. No new routes, secrets or
config. The new error code is `linked_task_assignees`.

## Tests at stop point 3

- ExUnit: 1893 passed, three runs (baseline 1817).
- Vitest: 187 passed. `tsc` and `vite build` clean. Lint: 26 errors, no worse.
- `tsc -p tsconfig.e2e.json`: 2 errors, both already on `develop` and in lines this
  branch doesn't touch (`task-board-phone.spec.ts:443`, `beer-board-import.spec.ts:40`).
- `mix compile --warnings-as-errors` fails on `reminders.ex:12` (unused `require
  Logger`), which is also already on `develop`.
- Playwright, local, one project at a time: new spec
  `task-board-multi-assignee` 19/19, changed specs 78/78, `brewery-board` 222/222,
  `production` 157/157.
- **Full Playwright suite: not run by the builder.** _The lead fills this in._

Tests were confirmed able to fail by breaking the code on purpose (13 breaks; see the
status file).

## ⚠ LIMITATIONS: what local could NOT tell us

**Not exercised anywhere yet:**
- **The other themes and real devices:** the layout was checked in screenshots as
  `brewer1` at 1600, 1280 and 360 px, in one color mode, in headless Chromium. Hop Field
  Night and a real tablet or phone weren't looked at.
- **Android back on a real phone:** the spec uses `page.goBack()`.
- **S221's push on a device:** ExUnit only, through an injected clock.

**The plan's three:**
- **A real backfill:** the up/down/up check ran on a synthetic DB with no assigned series
  or exceptions. ExUnit covers those shapes; DEV-shaped data hasn't been tried.
- **An old UI tab against the new API:** tested by raw API only; QA checks it on DEV.
- **Rollback:** the old API on a DB with extra assignees shows only the first. Not run.

**Old UI tab:**
- **Reassigning:** the old dialog sends `assignee_id` only when the person changes the
  picker (`TaskDialog.tsx`), so a title edit is safe. Changing the picker on a two-person
  task leaves one person, as §3.3 specifies.
- **History:** new id-list events read "someone no longer here" there. Cosmetic. This is
  from reading the old code, not from running it.

**Rollback, then forward again (the lead is also raising this in the release PR):** while
an old API image runs it writes only `assignee_id`. Going forward again, the join rows
win: assignee changes made during the rollback are lost, and tasks created then show
nobody until edited.

**New UI on a rolled-back API:** the board reads one person from the old fields
(`cardPeople`, Vitest only), so it doesn't crash. But the dialog's `assignee_ids` writes
would be ignored by an old API. Roll back the UI with the API.

**Existing quirk, kept:** a "following" edit reaches later occurrences only if this
occurrence's own value changes. If this one already has the new people (an exception, say),
the series takes them but the later occurrences don't. The title behaves the same way today.

## Personas and scenarios for DEV

`brewer1`, `brewer2`, `floater`, `breweryMgr`, `owner`, `breweryDevice`, `barMgr`,
`bartender1`: S216–S222, plus Taproom's seeded shared task. S221 needs a by-hand check on
a device.
