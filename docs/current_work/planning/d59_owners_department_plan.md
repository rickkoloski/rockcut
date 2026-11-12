# D59: Owners department — Plan

2026-11-11 · lead. **Spec:** `specs/d59_owners_department_spec.md` (approved 2026-11-11). **Task:**
5764. **Branch:** `d59-owners-department` in `~/src/rockcut`, from `develop` @ `5c7fce6`.

Most of D59 comes free, because a new assignable department already gets a task board, an Idea
Board and a channel. The work is the two flags, the refusals they drive, the ordering, and
tests that prove the boards stay private.

## Stages (each its own commits; stops marked ■)

1. **Data** (spec §4.1).
   - Migration `2026111110000x_add_owners_department.exs`: `departments.scheduling` (default `true`)
     and `departments.owners_only` (default `false`), both `null: false`. Insert Owners (`owners`,
     `#37474F`, `assignable: true`, `scheduling: false`, `owners_only: true`) unless the key exists.
     `down` deletes the row only when nothing references it (memberships, tasks, task series, Daily
     items, idea lists/cards/labels, messages, channel reads), otherwise raises. Then it drops the
     columns. Check up, down, up on a DB with and without Owners rows.
   - `Department` schema + changeset cast the flags. `JSONHelpers.department/1` sends them.
   - `seeds.exs`: add Owners to the department list (same values; heal the flags like `assignable`).
   - **One ordering rule:** `Accounts.department_sort_key/1` (`{owners_only, …}`) used by
     `list_departments/0` (name order, Owners last), `Tasks` boards and `IdeaBoards.all_boards/0`
     (id order, Owners last, Company still after it), and `Messaging.assignable_departments/0`.
   - Synthetic: persona `ownersAsst` ("Ellis Assist", `owners.asst`, Office employee + Owners
     employee); `[SEED]` Owners task (Olivia's) and one Owners idea card, rebuilt with the rest.
2. **API rules** (§4.2, §4.3). Each rule gets an ExUnit test, including both a refusal and an allowed case.
   - **Membership:**
     - `resolve_entry/2`: `role == "manager"` in an `owners_only` department → `{:invalid_membership,
       "Owners has no managers"}` (422), owners included.
     - Same guard in `Membership.changeset` so no other path (synthetic, console) makes one.
     - Managers touching Owners: `can?(:assign, {:memberships, id})` already needs `role_in ==
       :manager`, which no one has in Owners, so the existing `unauthorized_department` 403 covers it.
       Test it, including a request that also changes a department the manager does manage
       (nothing applied).
   - **Device home:** `User.assignable_home/2` also refuses `owners_only` (422).
   - **Not scheduled:** `RockcutApi.Changeset.validate_scheduled_department/2` (422 on
     `department_id`, "Owners isn't on the schedule") in `Position`, `Shift`, `ScheduleEvent`,
     `ScheduleEventSeries`. Template items and shift templates carry a position: confirm they can't
     reach Owners another way. Copy previous week / apply template only see positions, so nothing
     new is needed there; a test proves it.
   - **Calendar feeds:** `entitlements/1` skips `scheduling: false`; rotate and serve for an Owners
     department feed → 404.
   - **Board header:** the Owners board's schedule header payload is `nil` (no shift query). Update
     `JSONHelpers` around `no_one_scheduled` to match.
   - Privacy regression: `dualMgr` gets 403/404 on the Owners task board, Idea Board and channel
     (read and write); `ownersAsst` reads and writes but is refused History, Daily items and Idea
     manage. Owners pass.
   - ■ **Stop 1:** API done, `mix test` green. Report to Matt.
3. **UI** (§4.2–§4.4).
   - `Department` type gains `scheduling`, `owners_only`.
   - `useScheduleData`: filter `scheduling !== false` at the source (`departments`), so the grid,
     filters and the shift/event/positions dialogs all lose Owners. Check `ViewSchedule` and
     `EventFormDialog` don't fetch `/api/departments` separately.
   - `UserFormDialog`: owners see Owners with no role choice (always employee). A manager sees an
     existing Owners membership as a read-only chip, and the save **never sends** Owners (or the API
     403s). Check how unmanaged departments are sent today and follow that. `UserManagement`
     columns follow the API order.
   - `SharedDevices`: home picker filters `owners_only`.
   - `TaskBoard`: no schedule header when the payload's header is `nil`.
   - Check no UI list re-sorts departments by name (board switcher, `/tasks`, `/boards`, Messages)
     and undoes "Owners last". `DEPT_META` has no `owners`, so no nav heading (as the spec says);
     leave a comment saying that's deliberate.
   - vitest for any helper that filters or sorts.
4. **Playwright + coverage.**
   - Specs for O1–O13, one file per persona group (`owners/*.spec.ts`). Negative personas
     (`dualMgr`, `office1`, `taproomDevice`) assert the visible refusal, not just a missing link.
   - `tests/COVERAGE.md` rows for D59.
   - ■ **Stop 2:** the full local gate passing.

## Gate

Workflow §3: `mix test` twice, `mix compile --warnings-as-errors`, `tsc`, `vite build`, vitest, lint
no worse than the current count, full local Playwright. Then DEV: claim DEV (discussion 80),
`seed_synthetic()`, O1–O13 plus a regression sweep of Scheduler, Users & Roles, Messages and the
other boards.

## Risks

- **Privacy is the point.** A leak through any list (All departments, board switcher, channels,
  notifications, calendar feeds, search) defeats it. Tests check every list as `dualMgr`.
- **Manager saves on a person in Owners:** if the UI sends the Owners membership back, the whole
  save 403s. O6 covers it.
- **Rollback:** the old image shows Owners in the Scheduler and lets a manager of it exist (spec §6).
  Note it in the PR.
- **D58 overlap:** D58 rewrites user visibility and deactivate rules in the same files
  (`accounts.ex`, `authz.ex`, `UserFormDialog`). Whichever lands second merges carefully. D58's
  spec should cite §4.3 here.
