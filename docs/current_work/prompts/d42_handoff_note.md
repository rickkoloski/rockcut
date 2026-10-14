# D42 handoff note (PR description)

**Deliverable:** D42, task board follow-ups + the required password reset
(PortableMind tasks 4260 and 4117). Follows D41; D40 (brewhouse tablet,
4213) comes next. D38, D39, D41, D42 and D40 ship to prod in one release
tonight, after D40, so **no prod data moves** (prod has none of the board
tables).
**Spec:** `docs/current_work/specs/d42_task_board_follow_ups_spec.md`
(from Matt's decisions of 2026-10-13/14; amends the D38 and D41 specs; R2
added as item 10 on 2026-10-14); scenarios S121–S142
**Branch:** `d42-task-board-follow-ups`, cut from `develop` (`9966d4d`).
**SHA for DEV:** `0b609e7` (app code as of `fd39845`; later commits are docs and one test fix)

## What changed

Scenario → test for every row is in `rockcut-ui/tests/COVERAGE.md` (D42
section). S122, S129, S130, S141 and S142 are ExUnit only (no UI change, or
a browser can't reach the state).

| # | Area | Change | Scenarios |
|---|---|---|---|
| 1 | **Required password reset (4117)** | `PasswordResetGate`, after `AuthPlug` in both people pipelines (`:authenticated`, `:device_allowed`): while `must_reset_password`, every route answers **403 `{"error": "password_reset_required"}`** except `GET /api/me`, `GET /api/session`, `DELETE /api/session` and `POST /api/session/password`. Before D42 no route checked the flag: the UI's "Set a new password" screen was the only block. Devices never have the flag. UI: a `password_reset_required` answer shows "Set a new password" (`api.ts` → `useAuth`); the app's channels/departments queries wait until the reset is done | S121–S123 |
| 2 | **Foreign `before_id`** | A move's `before_id` naming another board's task → 404, nothing changes. A stale same-board one (or one that no longer exists) still goes last (D38) | S124 |
| 3 | **Header key** | `no_brewers` → `no_one_scheduled` (API and `DayHeader`) | S125 |
| 4 | **Delete a retired Daily item** | `DELETE /api/boards/:dept/daily_items/:id` (the board's managers and owners, `{:daily_items, dept}` `:manage`): 422 `not_retired` / `has_ticks`, 404 for another board's id; History `item_deleted` ("Deleted the Daily item 'Typo'"), earlier rows kept. The retired list marks `deletable`. Edit Daily items: Delete beside Restore for those, with the spec's confirm | S126–S128 |
| 5 | **Notes-only edits** | A "just this one" edit of only the notes no longer marks the occurrence changed on its own; a "following" notes change skips occurrences whose notes differ from their series part's (title and assignee still reach them). **Lead's Task 1 answer:** such an occurrence is offered for keeping, and kept, by a split, Delete "following", Stop repeating and an Ends-only change, as a changed one is (compares notes; no column) | S129, S130 |
| 6 | **Ends-only series changes** | A "following" edit / Edit series… that changes only Ends moves the **chain's** end: no part's rule changes; occurrences are added or removed only at the end (the end lands on the main-line part it reaches; later parts settle). Unsplit series work the same way (no split any more). An end before the edited occurrence is refused with a split's 422s. One History entry (`ends_only`, with any content change). `GET …/tasks/:id/series` with the dialog's `repeat*` params adds `change: {kind: same|ends|rule, removes_open, removes_changed}`; the dialog confirms "Extends the series." or "Removes N later occurrences." (keep/remove when some were changed on their own) | S131, S132 |
| 7 | **Daily cap in the dialog** | At 12 active items, Add and every Restore are disabled with "Up to 12 Daily items. Retire one first." The API's refusal stays | S133 |
| 8 | **Settings per board** | 1 week / 2 weeks, Hide completed, phone view and first day are stored per board, per browser (`rockcut.tasks.<setting>.<board>`, `all` for All departments). A board without its own value starts from the browser's shared D41 value (or the D41 key before it) and keeps it as its own. `rockcut.tasks.board` unchanged | S134, S135 |
| 9 | **First day** | A "First day" select (Today / Sunday / Monday) beside 1 week / 2 weeks, and in the phone's calendar dialog. Sunday/Monday: the range is the week(s) holding today; Prev/Next by the span; "Today" back to it; `?day=` moves to the week holding the day; a typed range shows as typed. Picking one shows the week holding today. Every day before today is dimmed (all modes) and works as before. Phone: the all-days view scrolls to today; one-day opens on today. Boards and All departments (`useBoardView(board)`) | S136–S140 |
| 10 | **R2: After N times across a split** | A split part keeps a count (what's left), no longer a date (`count_to_until` removed); `chain_ends` / the dialog report the chain's total ("After 10 times" on every part); rule and Ends-only changes from any part keep the total. A part stored as a date before D42 stays a date | S141, S142 |

## Migrations

**None.** No new tables, columns, dependencies, secrets or config.

## New routes

- `DELETE /api/boards/:dept/daily_items/:id` (people only; in the device
  route matrix).
- `GET /api/boards/:dept/tasks/:id/series` takes optional `repeat*` params
  (adds `change`).

## Tests

- **ExUnit (full, the lead, at `ca8c947`): 1,414 tests, 0 failures.**
  `mix compile --warnings-as-errors --force` clean.
- **Vitest: 95 passed.** `tsc -p tsconfig.app.json` and `vite build` clean.
- **Lint:** 27 problems (26 errors, 1 warning), all pre-existing in the
  brewing pages; none in D42's files.
- **Playwright (builder, `--workers=1`):** the new
  `tests/regression/tasks/task-board-follow-ups.spec.ts` 17/17; the
  `brewery-board` project 150 passed, 3 failed: S31, S75 (the dialog now
  greys out Add/Restore at 12) and S60/S61 (made its "changed on its own"
  occurrence with a notes edit). Updated; those three pass.
- **Full Playwright, every project (the lead, `--workers=1`, 2026-10-14):**
  331 passed, 1 skipped (the DEV-only banner check), 1 failed: S31's new
  hint check matched two elements when the board already had retired items
  (the hint shows under Add and in Retired). Test fixed (`.first()`); the
  file reran 11/11.
- **Revert-checked:** the reset gate (21 of 24 tests fail without the plug),
  foreign `before_id` (S124), notes-only (3 tests), the notes-only keep
  offer (2), Ends-only (9 of 12 in `series_ends_test`), R2's chain total
  (S141, S142); per-board settings (S134) and the first day (S136) in
  Playwright.
- **D31 parity and boundary suites:** green, no row changed.

## DEV must exercise

- **The reset gate with DEV's personas:** `newhire` gets "Set a new
  password" and nothing else works until it's set; a `[TEST-TEMP]` person
  after an owner's reset; every other persona unaffected (the full suite
  covers most routes).
- **Real browsers with D41 settings** (Matt's Pixel, the office desktop):
  the remembered 1 week / Hide completed / phone view carry over to every
  board, then each board keeps its own.
- **First day on the Pixel:** Monday / Sunday, the calendar dialog, the
  vertical view opening scrolled to today, one-day on today, dimmed days
  still tickable and draggable.
- **Edit series… on DEV's seeded recurring tasks:** an Ends-only change
  ("Extends" / "Removes N"), and a series split by D39 on DEV (its later
  part stored as a date) still reading and moving its end.
- **Edit Daily items** as `barMgr` / `breweryMgr`: Delete a never-ticked
  retired item, none for a ticked one, the cap's hint.

## Decisions (Matt and the lead, during the build)

- **Task 1:** the preview shape (`change` on `GET …/series`); an Ends-only
  end before the edited occurrence is refused, as a split's is; unsplit
  series move their end instead of splitting; the `changed` keep/remove
  choice applies to occurrences after the new end; an end moved into an
  earlier part removes the later part.
- **Notes-only occurrences are kept like changed ones** (Matt's rule: an
  occurrence keeps its own notes), overruling the builder's first build.
- **Task 2:** a new first day jumps to the week holding today; days before
  today are dimmed in every mode.
- **R2** (spec §3): the count stays a count across a split; old date-ended
  parts keep working as dates.

## LIMITATIONS

- **The open-tab reset redirect isn't tested in a browser.** A manager's
  reset revokes the person's sessions, so an open tab gets 401 (sign-in),
  not the 403; nothing in the suite reaches `password_reset_required` with a
  signed-in UI. The handler (`api.ts` event → `useAuth`) is small; DEV can
  only reach it the same way.
- **Old split parts stored as dates** (D39) exist only on DEV; locally
  they're covered by one ExUnit test that writes one by hand.
- **Phone gestures with the first day** were emulated at 412×915 in
  Chromium only; the Pixel checks the scroll-to-today and dimmed days.
- **Real per-browser D41 settings** exist only in browsers that used D41
  on DEV; locally they're set by the test (S135).
- **`tsc -p tsconfig.e2e.json` reports two errors**, both in specs D42
  didn't touch and identical on `develop`:
  `tests/regression/brewery/task-board-phone.spec.ts:458` (iterating a
  `NodeListOf`) and `tests/regression/taproom/beer-board-import.spec.ts:39`
  (`Page` not imported). Playwright still runs them (it doesn't type-check).
- **Full ExUnit wasn't rerun after the last API commit** (`ec8a645`, series
  only) by the builder; the lead's gate run is the check.
