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
