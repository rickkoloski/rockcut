# D59: Owners department — Complete

**Spec:** `specs/d59_owners_department_spec.md` (decisions 1–9)
**Plan:** `planning/d59_owners_department_plan.md`
**Task:** 5764
**Completed:** 2026-11-11 (on prod as `v2026.11.11`, release PR #65; D59 PR #64). Matt's prod check
passed 2026-11-11; task 5764 closed.

---

## Summary

An **Owners** department for the owners' own work. It gets its own task board (`/tasks/owners`),
Idea Board (`/boards/owners`) and Messages channel, private to owners and the members they add.
Non-members can't tell it exists. It isn't on the schedule, and it comes last in every department
list.

## What Was Built

- **Data:**
  - Migration `20261111100001_add_owners_department` adds `departments.scheduling` (default true)
    and `owners_only` (default false), and creates Owners (`owners`, `#37474F`) with its four
    starter Idea lists.
  - Its `down` removes Owners only while nothing references it.
  - The seeds list Owners too, and heal its flags.
- **Order:** `Accounts.sort_departments/2` puts owners-only departments last, in the department
  list, task boards, Idea Boards (Company still at the end) and channels.
- **Membership:**
  - Nobody manages Owners: the role check is in `resolve_entry` and `Membership.changeset`.
  - Only owners add or remove Owners members (`can?(:assign, …)`), and a manager's save keeps
    that membership.
  - Permission is checked before role, so a non-owner gets a neutral 403 (DEV gap 9).
- **Not scheduled:**
  - `Changeset.validate_scheduled_department/2` guards `Position`, `Shift`, `ScheduleEvent` and
    `ScheduleEventSeries` ("That department isn't on the schedule").
  - Owners has no department calendar feed (404) and no board schedule header, and "Hide shifts" is
    gone from its board settings.
  - Owners can't be a device's home.
- **Hidden from non-members** (decision 9, DEV gap 5): `Authz.can?(user, :see, {:department, d})`.
  `/api/departments` and every person's departments in `/api/roster` and the other people lists leave
  Owners out for anyone who isn't an owner or member, devices included. Memberships carry
  `owners_only`, so the managers' read-only chip still works.
- **Notifications:** `Messaging.recipients("dept:owners")` adds every active owner
  (`Authz.owners_audience_query/0`).
- **Assignees** (decision 8): the Owners boards' pickers offer members plus every owner
  (`Tasks.Assignees.pickable_owners/1`). Other boards are unchanged.
- **Wording:**
  - The lock messages on Owners say "an owner".
  - The Users & Roles grid says "Owners: member".
  - The assignee refusal reads "an Owners member or an owner", with a/an chosen by name on every board.
- **UI:**
  - Owners is filtered out of the Scheduler and its dialogs, Calendar sync and the device home picker.
  - Users & Roles: owners get member only, managers get a read-only chip, and Owners is never sent
    in a manager's save.
  - There's no nav heading, on purpose.
- **Synthetic:** persona `ownersAsst` (Ellis Assist, Office + Owners), plus a `[SEED]` Owners task and
  card.

## Gate

- **Local:** `mix test` 2284 green twice, tsc, vitest 261, build, lint 27 (unchanged). Full local
  Playwright: 712 passed, 1 skipped (the DEV-only banner).
- **DEV:**
  - **Run 1 at `b660fd0`:** Playwright 712/713 (S239 flake). QA: fail, with must-fix gaps 5 and 6
    (Owners leaked through the API and error texts).
  - **Fix cycle 1 at `f6c904f`:** Playwright 714/714. QA recheck: fail on gap 9.
  - **Fix cycle 2 at `dc54a18`:** Playwright 714/714. Targeted QA: pass.
  - Reports: `stepwise_results/d59_dev_qa_report.md`, `…_recheck_report.md`, `…_gap9_report.md`.
- **Accepted:** gap 1 (owners assignable through the API on any board, since D41), gap 4 (a locked
  card names who locked it), gap 8 (403 vs 404 on a guessed board key). **Backlog:** task 5769 (gap
  10, managers can manage positions in other departments; predates D59).

## Release

`v2026.11.11` (`a0fc6b3`):
- **Versions:** API v37 `registry.fly.io/rockcut-api:deployment-01M771CWBJM27QP78XFCQMXVKV`, UI v33
  `registry.fly.io/rockcut-ui:deployment-01M771EYYB08TRH65J0EE8AQH2`.
- **Rollback:** API v36 `…deployment-01M70MGHPWTT121KN69NTP6DQS`, UI v32
  `…deployment-01M70MJ7J1HK31XMZJHMFPX037`. Image only; the old API ignores the new columns, but it
  would show Owners as an ordinary department.
- **Pre-release snapshot:** `vs_yeYvbA38gjQXh10oPopPLy8k`.
- **Migration:** ran at boot; Owners is present, and the existing departments are unchanged.
- **Smoke:**
  - health 200 on the tag's SHA, UI 200 with the tag's SHA in the bundle, `sw.js` `no-cache`;
  - the bundle versions match the lockfile;
  - `pnpm audit --prod` and `mix hex.audit` are clean;
  - a synthetic login gets 401, and prod has 0 synthetic users.

## Open

Nothing. Matt's prod check passed 2026-11-11, and task 5764 is closed.
