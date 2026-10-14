# D40 handoff note (PR description)

**Deliverable:** D40, shared tablets on their department's task board,
staff codes for every employee, the shift-end reminder, and the Brewery
Dashboard's Today's tasks card (PortableMind task 4213). Follows D42. D38,
D39, D41, D42 and D40 ship to prod in one release tonight, so **no prod
data moves** (prod has none of the board tables).
**Spec:** `docs/current_work/specs/d38_brewery_task_board_spec.md` §3.4,
§3.5, §3.8 (scenarios S9g, S32–S37a, S42–S50, S68), amended by
`specs/d41_department_task_boards_spec.md` items 6–7 and the plan's
decisions (`planning/d40_tablets_reminder_dashboard_plan.md`, which win
where they differ).
**Branch:** `d40-brewhouse-tablet-reminders`, cut from the D42 tip
(`cb59d3b`, PR #21).
**SHA for DEV:** `6419501` (D40 with `develop` merged after D42; API
`3b00bb5`, UI `8ecbc8e`, seed and tests `790cf13`, S44 `a868fed`, D33 S3
`9791fde`). Later commits are docs only. **DEV fix cycle 1:** the commit
"fix: D40 DEV qa gaps 1 and 3" (the lead fills in the hash).

## What changed

Scenario → test for every row is in `rockcut-ui/tests/COVERAGE.md` (D40
section). S47 is ExUnit only; the reminder's timing (S32–S37a) is ExUnit
with an injected clock, and its real push is checked on DEV.

| # | Area | Change | Scenarios |
|---|---|---|---|
| 1 | **Staff codes for every employee** (plan decision 2) | Any active person with a department can hold a code (owners still count, so their D37 codes keep working). Owners and the managers of one of the person's departments set and reveal it (`Authz` `:set_staff_code` / `:reveal_staff_code` through `can_manage_user?`); any manager may Suggest, and `/api/me` `staff_codes` is true for any manager. Cleared on deactivation or when no department is left; leaving one of two keeps it. Users & Roles: the Staff code section for those people, to those actors | S48, S49 |
| 2 | **Tablets on their board** (plan decisions 1, 3, 4) | `Authz.Device`: `:read`/`:write` on `{:tasks, home}` only; no History, no Daily items changes, no `{:tasks, :all}`, no other board (403). `/api/me` `task_boards` lists the home board (`manage: false`). The brewhouse tablet opens on `/tasks/brewery`; the Taproom tablet keeps its landing and gets **Tasks** (nav and Home card). On a tablet: no switcher, History, Edit Daily items or My tasks (All and Unassigned stay) | S42 |
| 3 | **Staff codes on the boards** | Every board write from a tablet needs `staff_code`. D37's `acting/2` is now `RockcutApiWeb.StaffCodeActing`, used by the beer board and the board controllers: 422 `staff_code_required`, 422 `staff_code_invalid`, 429 `staff_code_locked` exactly as D37. A code of someone who isn't a member of the tablet's home department is a wrong code and counts toward the lock; a tablet on another board is 403 before any code is checked. Writes record actor = the person, `task_events.device_id` = the tablet ("<name> on Shared Device" in History); responses carry `recorded_as`; a tablet's delete or untick answers 200 with it (people still get 204). UI: the code is asked before the first write and kept **in memory** (`useActing`) for 5 minutes of taps and keys ("Acting as Kate · Done"); Done, idle, a reload or a refused code ends it; Cancel undoes the on-screen change. The Taproom tablet uses the same flow on `/tasks/bar` | S9g, S43–S47, S68 |
| 4 | **Shift-end reminder** (spec §3.5, plan step 3) | A second job in `Reminders.Scheduler`'s 5-minute tick (`Reminders.run_shift_end/1`): published Brewery shifts with an assignee, ≥ 60 minutes long, ending in the next 60 minutes but not sooner than 50 (the first scan lands at 55–60; the extra 5 minutes catch a late or skipped scan), not in the `task_reminders` ledger. Lists that Colorado day's open tasks (the person's, then unassigned, then others' with initials) and unticked Daily checks; nothing open → ledger row, no notification. Event `task_shift_end`: push and in-app, never email, on by default. Title "Still open today: 4 tasks, Daily 2/4" (the Daily part only when something's unticked; "1 task"); body up to three titles then "+N more" ("Daily: Temps, Pressures" when only checks are open); tap → `/tasks/brewery?day=<date>`. Toggle "Unfinished tasks before shift end" in the bell's ⚙ Preferences, Brewery members only (In-app and Push switches, Email "—") | S32–S37a |
| 5 | **Brewery Dashboard card** (spec §3.8) | `/brewery`: "Daily 2/4" with the unticked items (tickable), today's first five open tasks with initials (tickable), "+N more", "N unfinished from earlier days"; the title opens the board. Uses the board's own query, so a tick updates the board | S50 |
| 6 | **Seed** | `breweryDevice` ("Brewhouse tablet", home Brewery, a minted `dev_` token like `taproomDevice`) in `Seeds.Synthetic`, `tests/config/test-env.ts` (so the auth setup writes its storageState); `mix rockcut.synthetic.pair_code breweryDevice` for a real pairing. `brewer1` may be listed in `SYNTHETIC_STAFF_CODES` (same secret source as D37's codes; see "Before DEV") | — |

## Migrations

One, additive and reversible:
`20261017120001_create_task_reminders` — `task_reminders` (`shift_id`
references `shifts`, delete-cascade, `null: false`; `sent_at`
`null: false`; timestamps), unique index `task_reminders_shift_id_index`.

**Rollback checked** on a scratch copy of the local dev DB (a read-only
`VACUUM INTO` through Exqlite; the real DB untouched; the `MIX_ENV=test`
build's Repo pointed at the copy with `Application.put_env` before
`Repo.start_link`): up, down, up. 43 tables before, 44 after each up, 43
after down; every other table's row count identical at every step
(`schema_migrations` 55 → 56 → 55 → 56); the index and the foreign key
(`shifts`, `CASCADE`) present after each up.

No new dependency, secret or config (`STAFF_CODE_KEY` reused).

## Routes a shared tablet can now reach

On its **home** board only (`/api/boards/<home>/…`; any other board is 403
from `Authz.Device`):

- **Reads, no code:** `GET tasks`, `GET tasks/:id/series`, `GET daily_items`
  (the board needs it to show the Daily card).
- **Writes, staff code required:** `POST tasks`,
  `POST tasks/move_overdue_to_today`, `PATCH tasks/:id`,
  `DELETE tasks/:id`, `POST tasks/:id/move`, `POST tasks/:id/complete`,
  `POST tasks/:id/uncomplete`, `POST tasks/:id/stop_repeating`,
  `PUT`/`DELETE daily_checks/:on_date/:daily_item_id`.
- **Still people-only** (the router's `DeviceGate`): `GET tasks/history`,
  the five Daily items writes, `GET /api/boards/all/tasks`. Every route is
  classified in `device_route_matrix_test`.

## Tests

- **Lead's local gate (2026-10-14, at `a868fed` + the D33 S3 fix):** full
  ExUnit **1,453 tests, 0 failures**; full Playwright every project
  (`--workers=1`) **341 passed, 1 skipped, 1 failed**: D33 S3
  (`device_permissions.spec.ts`) expected `breweryMgr` to have no Admin →
  Shared devices, but the D40 seed's brewhouse tablet makes them a manager of
  a device's home department (D33's rule), so the page is correct. The test
  now checks the Taproom tablet isn't listed for them; the file reran 3/3.
- **Lead's revert-check:** with the tablet's department check in
  `StaffCodeActing` disabled, S45 and the Taproom-tablet test fail (2 of
  15); restored, 15/15.

- **ExUnit (builder, targeted only, as the lead asked):** the suites D40
  touches and their neighbours, 1,012 tests, 0 failures, at `3b00bb5`;
  after the seed changes, `seeds`, `device_route_matrix_test`,
  `authz_device_test`, `task_board_device_test` 97, 0 failures.
  `mix compile --warnings-as-errors` clean. **The full suite is the lead's
  run.**
- **Rows changed on purpose** (D31 parity and friends):
  - `device_route_matrix_test`: 3 board reads moved to `@device_ok`, 10
    writes to `@device_with_code`; `:dept` filled with the tablet's home.
  - `authz_test`, `authz_device_test`: the Brewery tablet reads and writes
    its board; History, Daily items and other boards stay denied.
  - `task_board_controller_test`, `task_series_controller_test`: the
    Taproom tablet on the Brewery board is still 403, now "Forbidden" from
    `Authz.Device` (people-only routes still "Not available on a shared
    device").
  - `staff_codes_test`, `staff_code_controller_test`, `synthetic_test`:
    D37's "Taproom only" rows reworded to D40's rules (S3, S4, S12, S49).
  - No staff-code row exists in the `authz_parity` suite; its other rows
    are unchanged and green.
- **New ExUnit:** `task_board_device_test` (15), `task_shift_end_reminder_test`
  (11), and D40 tests in `staff_codes_test`, `staff_code_controller_test`,
  `accounts_test`, `authz_device_test`, `synthetic_test`.
- **Vitest: 115 passed** (20 new: the acting timer, `useActing` with the
  account mocked, the dashboard summary). `tsc -p tsconfig.app.json` and
  `vite build` clean.
- **Lint:** 27 problems (26 errors, 1 warning), all pre-existing; none in
  D40's files.
- **Playwright (builder, `--workers=1`, local, after the D42 merge
  `c454bc8`):** `tasks/task-board-tablets.spec.ts` 8/9 on the first run,
  S44 failing on a test bug (it rebuilt the `[TEST-TEMP]` titles, whose
  suffix is random); fixed, the file reran 9/9.
  `tasks/task-board-dashboard.spec.ts` 4/4; `taproom/staff-codes.spec.ts`
  (S48 added; S3/S4/S12 updated) plus `brewery/task-board-access.spec.ts`
  (S41 updated), 15/15 together; `tasks/task-board-departments.spec.ts`
  (S114 updated) 22/22. The two D41 specs pinned "devices 403 until D40".
  Full Playwright is the lead's run.
- **Revert checks: not done.** D40 is new behavior, not a bug fix; one
  attempt (dropping the membership check in `StaffCodeActing` to watch S45
  fail) was blocked by permissions.

## Before DEV (humans / the lead)

- **`brewer1:<code>` in `SYNTHETIC_STAFF_CODES`**: the PortableMind file,
  the `rockcut-api-dev` Fly secret and local `rockcut_api/.env.synthetic`.
  The seed takes any persona with a department now. No spec needs it; it's
  for people trying the brewhouse tablet on DEV.
- **`mix rockcut.synthetic.setup`** locally (and the DEV reseed) creates
  `breweryDevice`; the Playwright auth setup mints its token.

## DEV fix cycle 1 (D40 qa on DEV at `0f2f0a0`: PASS with gaps)

| Gap | Fix | Tests |
|---|---|---|
| **1 (security): the staff code in the URL.** A tablet's untick and task delete sent `?staff_code=…`, which proxy and access logs keep | The UI sends the code in the **JSON body** for every tablet write, DELETE included (`deleteWithCode`: `scope`/`changed` stay in the query). The API takes `staff_code` **only from `conn.body_params`** (`StaffCodeActing`); a query-string code counts as missing (422 `staff_code_required`). The beer board's deletes already used the body and now get the same check | ExUnit `task_board_device_test` (both DELETE routes: query refused, body accepted), `beer_board_controller_test` (the same for its delete); **revert-checked** (reading all params again: both fail). Vitest `acting.test` (the body, never the query). Playwright `task-board-tablets` S43 (the untick request: no `staff_code` in the URL, the code in the body) |
| **3 (UX): ticked behind the code dialog, and still ticked after a wrong code** | The board's optimistic change (ticks, Daily checks, a drag) is made only when the write is sent with a code, and undone as soon as that try fails; nothing changes while the dialog is open | Playwright `task-board-tablets` S45 (unticked behind the dialog and after a wrong code); **revert-checked** (the old order: S45 fails, "checked") |

**Not fixed** (the lead): gap 2 and gap 4, in LIMITATIONS.

## DEV must exercise

- **One real reminder:** a `[TEST-TEMP]` published Brewery shift for a
  persona with push enabled (Matt's Pixel), at least an hour long, ending
  ~65 minutes after deploy; open tasks and an unticked Daily check that day.
  The push arrives 55–60 minutes before the end, the bell has the same
  entry, the tap opens `/tasks/brewery` on that day, and a second scan
  sends nothing. Also: the toggle off → nothing.
- **The brewhouse tablet on a real tablet / the Pixel** (pair
  `breweryDevice` with `mix rockcut.synthetic.pair_code breweryDevice` or
  Admin → Shared devices): lands on the board; the code dialog's numeric
  keypad and masking; "Acting as … · Done"; 5 idle minutes (taps and keys
  count, scrolling doesn't); long-press drag asks for the code first;
  "Sign in as me" still needs none.
- **The Taproom tablet:** Tasks in the nav, its board with a Taproom code,
  the beer board unchanged.
- **Users & Roles:** `breweryMgr` sets a Brewery employee's code; `barMgr`
  sees no section for a Brewery-only person; an owner sees everyone's.
- **The Dashboard card** on DEV's seeded board (the counts against the
  board).

## Decisions (Matt and the lead, during the build)

- **Task 1:** owners keep code eligibility (owners count as members
  everywhere); the 50–60 minute window with the ledger; the reminder's
  text (Daily part only when something's unticked; "Daily: …" body when only
  checks are open; others' tasks with initials); 200 + `recorded_as` on a
  tablet's delete and untick; tablets read `daily_items`.
- **Task 2:** the toggle lives in the bell's Preferences with the other
  events, as two switches (S35 turns both off); taps and keys count as
  activity, scrolling doesn't; tablets keep All and Unassigned (plan
  decision 1 over the spec's "All only").
- A refused remembered code forgets it and asks again (brief, Task 2).

## LIMITATIONS

- **Gap 2 (not fixed, as spec §3.5 says):** the reminder's body lists up
  to three task titles, then "+N more"; the rest are on the board.
- **Gap 4 (not fixed, as D37's beer board does):** a locked tablet says
  it's locked only after a code is typed; the dialog doesn't know before a
  write is tried.
- **Playwright ran locally only, Chromium at desktop width.** The tablet
  specs don't cover phone width or touch; the Pixel/tablet checks above do.
- **The real push** (timing on a phone, the tap's deep link from a closed
  app) is only on DEV; ExUnit checks the scan, text, channels and ledger.
- **The 5-minute window across a tablet's sleep** is checked by Vitest
  (wall-clock comparison) and Playwright's clock, not on a sleeping
  device.
- **The full ExUnit suite** wasn't run by the builder (memory, as the lead
  asked); the targeted runs above are the evidence until the lead's run.
- **`tsc -p tsconfig.e2e.json`** still reports the two pre-existing errors
  D42's note lists (`task-board-phone.spec.ts:458`,
  `beer-board-import.spec.ts:39`); none in D40's specs.
