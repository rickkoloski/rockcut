# D59 builder brief — Stage 1 (Data)

2026-11-11 · lead → builder.

**Read first:** `docs/current_work/specs/d59_owners_department_spec.md` (approved) and
`docs/current_work/planning/d59_owners_department_plan.md`. This brief covers **plan Stage 1 only**.
Stop after it and report. Stage 2 comes as a separate brief.

**Where:** `~/src/rockcut`, branch `d59-owners-department` (already checked out; don't switch).
Commit your work on it in small commits (`feat: D59 …`), staging paths by name. No push, merge or
rebase. The lead owns the servers; Stage 1 needs only `mix test` / `mix ecto.*`.

## Do

1. **Migration** `rockcut_api/priv/repo/migrations/20261111100001_add_owners_department.exs`:
   - add `departments.scheduling` (`:boolean`, `default: true, null: false`) and
     `departments.owners_only` (`:boolean`, `default: false, null: false`);
   - insert Owners (`name "Owners"`, `key "owners"`, `color "#37474F"`, `assignable true`,
     `scheduling false`, `owners_only true`, timestamps) **unless** key `owners` exists;
   - `down`: if the Owners row is referenced by anything (grep every table with a
     `department_id`/department FK: memberships, tasks, task series, Daily items, idea board
     tables, messages/channel reads by `channel_key "dept:owners"`, devices' `home_department_id`,
     positions/shifts/events), **raise** with a clear message; otherwise delete it. Then drop
     the columns.
   - Verify up → down → up on a fresh test DB, and that `down` raises once an Owners membership
     exists.
2. **Schema/JSON:** `Accounts.Department` fields + changeset cast; `JSONHelpers.department/1` sends
   `scheduling` and `owners_only`.
3. **Seeds:** `priv/repo/seeds.exs` department list gains Owners. Heal `scheduling`/`owners_only`
   the same way `assignable` is healed. Existing departments get `scheduling: true,
   owners_only: false`.
4. **Ordering — Owners last** (spec §4.4). Add one helper in `Accounts` (e.g.
   `sort_departments(depts, :name | :id)`, sorting by `{owners_only, name|id}`) and use it in:
   - `Accounts.list_departments/0` (name order, Owners last);
   - `Tasks` board list (`tasks.ex` ~line 69, id order);
   - `IdeaBoards.all_boards/0` (id order; Company stays after Owners);
   - `Messaging.assignable_departments/0` (name order).
   Tests for each list's order.
5. **Synthetic** (`lib/rockcut_api/seeds/synthetic.ex`):
   - persona `{"ownersAsst", "owners.asst", "Ellis Assist", [{"office", "employee"}, {"owners",
     "employee"}], %{}}`;
   - a `[SEED]` Owners task (created by `owner`) and one `[SEED]` Owners Idea Board card, built and
     cleaned with the other `[SEED]` scenario data;
   - make sure `mix rockcut.synthetic.setup` runs clean twice in a row (idempotent), and update any
     test that counts personas or departments.
   - Add the persona to the UI test config too if personas are listed there
     (`rockcut-ui/tests/config/…`), so `auth.setup.ts` mints a storageState for it.

## Don't

- Don't add the membership/scheduling/device refusals yet (Stage 2).
- No UI changes beyond the test-persona config.
- Don't touch `CLAUDE.md`, the spec, the plan or `SESSION_HANDOFF_*`.
- No repo-wide `mix format`: format only the files you change (`mix format path/to/file.ex`).

## Done when

- `mix test` green (run it twice), `mix compile --warnings-as-errors` clean.
- Commits on the branch.
- Reply with: commits (sha + subject), files touched, test counts, anything you weren't sure
  about prefixed `LEAD:`.

---

# Stage 2 (API rules)

2026-11-11 · lead → builder. Stage 1 is in (`c036c0c`..`a99a107`). Do **plan Stage 2**
(spec §4.2, §4.3), then stop and report. Same rules as Stage 1 (branch, commits, no UI, format
only your files, no `CLAUDE.md`/spec/plan/handoff edits).

Every rule gets ExUnit tests showing **both a refusal and an allowed case**.

1. **Membership** (`accounts.ex`, `accounts/membership.ex`):
   - `resolve_entry/2`: `role == "manager"` in an `owners_only` department →
     `{:invalid_membership, "Owners has no managers"}` (422 through the existing path),
     **owners included**. Use the department's name in the message, not a hard-coded "Owners".
   - The same guard in `Membership.changeset` (an error on `:role`), so no other path makes one.
   - Managers and Owners: `can?(:assign, {:memberships, id})` already needs `role_in == :manager`.
     Test that a manager's create/update naming Owners is 403 `unauthorized_department`, and that a
     request which **also** changes a department they do manage applies **nothing**.
   - Test that a manager's update of a person who is **in** Owners, whose `memberships` leave Owners
     out, keeps the Owners membership (the existing "only remove within the actor's authority" rule).
     O6 depends on it.
   - Owners add/remove Owners memberships (employee) fine, audited like the rest.
2. **Device home** (`accounts/user.ex` `assignable_home/2`): `owners_only` → 422 on
   `home_department_id`. Device create and update both.
3. **Not scheduled:** `RockcutApi.Changeset.validate_scheduled_department/2`: a 422 on
   `department_id`, "<name> isn't on the schedule", when the department has `scheduling: false`.
   Wire it into the `Position`, `Shift`, `ScheduleEvent` and `ScheduleEventSeries` changesets
   (create and any update that changes `department_id`). Then check every other way a
   shift/position/event can get a department: shift and day/week templates, Copy previous week,
   series extend/split. Test any that could reach Owners; if a path can't, note why in your report.
4. **Calendar feeds** (`calendar_feeds.ex`): `entitlements/1` skips `scheduling: false` departments.
   Rotating, or fetching a department feed for one, → 404, owners included. Remove the Stage 1
   "Stage 2 removes it" expectation in the calendar-feed parity test.
5. **Board schedule header:** on a `scheduling: false` board, the header payload is `nil` and no
   shift query runs (`JSONHelpers` around `no_one_scheduled`, and wherever the header is built).
   Test both the Owners board (`nil`) and a normal board (unchanged).
6. **Privacy regression** (one test module, e.g. `test/rockcut_api_web/owners_privacy_test.exs`):
   - `dualMgr` (or a manager fixture of two other departments) is refused, read **and** write, on
     the Owners task board, the Idea Board (build on your route matrix) and the `dept:owners`
     channel. They get no Owners entry in: the board list/switcher payload, `/api/channels`,
     calendar-feed entitlements, `capabilities.modules`, task search/All departments, or
     notifications for Owners messages.
   - `ownersAsst` reads and writes the board, Idea Board and channel, but gets 403 on task-board
     History, Daily items management, and Idea Board manage/history.
   - `owner` passes everything, and sees Owners last in each list.
   - A device (`taproomDevice`) is refused on the Owners board and Idea Board.

## Done when

`mix test` green twice, `mix compile --warnings-as-errors` clean, commits on the branch. Reply
with: commits, files, test counts, the paths from item 3 you checked and how, and `LEAD:` notes.

---

# Stage 3 (UI)

2026-11-11 · lead → builder. Stages 1–2 are in (through `a12e93a`; see `d59_lead_decisions_1.md`).
Do **plan Stage 3** (spec §4.2–§4.4), then stop and report. Same rules as before. The lead runs
the servers from `~/src/rockcut`: API :4002, UI :5174. The local dev DB is migrated and has the
synthetic personas incl. `ownersAsst`. Ask the lead (`LEAD:` in your reply) if they need a restart.

1. **Types:** `Department` gains `scheduling: boolean` and `owners_only: boolean` (`lib/types.ts`).
2. **Scheduling surfaces:** in `pages/schedule/useScheduleData.tsx`, filter `scheduling !== false` at
   the source, so the grid, filters and the shift/event/positions dialogs lose Owners. Grep every
   other `/api/departments` consumer under `pages/schedule/` and the calendar-sync UI. Owners must
   be absent from all of them, and the owner's `manages_departments` (which includes `owners`; the
   API keeps it, decision 2) must not bring it back anywhere.
3. **Users & Roles** (`pages/users/UserFormDialog.tsx`, `UserManagement.tsx`):
   - An owner sees Owners in the department list, with **no role choice**: it's always employee.
   - A manager never gets Owners as something they can change. If the person is in Owners, show a
     read-only chip. The save **must not send** Owners (the API would 403 the whole save). Follow how
     unmanaged departments are handled today. Add a vitest for the payload builder if the logic
     lives in a function, and extract one if that's simple.
   - Department columns/lists follow the API order (Owners last).
4. **Shared devices** (`pages/devices/SharedDevices.tsx`): the home picker leaves out `owners_only`.
5. **Task board** (`pages/tasks/TaskBoard.tsx`): no schedule header when the day's `header` is `null`.
   Nothing else on the board changes.
6. **Ordering:** check that no UI list re-sorts departments or boards by name (the board switcher,
   `/tasks`, `/boards`, Messages channel list, Users & Roles) and so undoes "Owners last". Fix any
   that does.
7. **Nav:** `App.tsx` `DEPT_META` has no `owners`, so there's no nav heading. Keep it that way and add a
   one-line comment saying it's deliberate (D59 §4.4).
8. **Look at it** in a browser as `owner`, `ownersAsst` and `dualMgr`, logged in by token
   injection per `rockcut-ui/tests/RUNNING.md` (never type passwords). Check spec scenarios O1–O6,
   O9 and O11 by hand, and note anything off.

## Done when

`pnpm tsc --noEmit` (or the project's tsc script), `pnpm vitest run`, `pnpm lint` (no worse than
on `develop`), `pnpm build` all pass. Commits on the branch. Reply with: commits, files, what
you checked in the browser per persona, and `LEAD:` notes. Playwright specs are Stage 4, so don't
write them yet.

---

# Stage 4 (Playwright + coverage)

2026-11-11 · lead → builder. Stages 1–3 and both lead decision files are in (through `7f209bb`). Do
**plan Stage 4**, then stop and report. Same rules as before; servers are the lead's (API :4002,
UI :5174).

1. **Specs for O1–O13** (spec §5, plus decision 8: owners appear in the Owners pickers only), under
   `rockcut-ui/tests/regression/owners/`, one file per persona group (`owner`, `ownersAsst`,
   negatives: `dualMgr`, `office1`, `taproomDevice`). Follow `tests/RUNNING.md` and the existing
   regression specs:
   - every spec declares its persona with `test.use({ storageState: authFile('<key>') })`, and
     no UI login;
   - anything you create is `[TEST-TEMP]` and deleted by id in the spec's cleanup. Destructive
     actions **only by exact id on your own `[TEST-TEMP]` rows**. Never touch `[SEED]` rows or
     other personas' data. O2 adds then removes `office1`'s Owners membership; restore it in
     `afterAll` even when the test fails;
   - negative personas assert the **visible** refusal or absence (switcher, channel list, typed URL
     result), and the API status where a UI path doesn't exist (O7, O8, O9's API half, O11's API
     half);
   - O10: assert via the API/in-app records, not push.
2. **`tests/COVERAGE.md`:** a D59 section, scenario → layer (ExUnit file / Playwright file /
   manual-only / GAP).
3. **Run only the new specs** locally (`npx playwright test tests/regression/owners
   --reporter=line`), twice, to show they're stable. Don't run the full suite: the lead runs it
   in its own tab at the gate.

## Done when

The new specs pass twice, `tsc -p tsconfig.e2e.json` has no new errors (2 existing ones), and
`pnpm lint` is no worse. Commits on the branch. Reply with: commits, files, the run results, any
scenario left manual-only or GAP and why, and `LEAD:` notes.
