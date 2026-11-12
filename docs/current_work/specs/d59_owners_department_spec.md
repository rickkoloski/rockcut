# D59: Owners department — Spec

**Status:** COMPLETE, on prod in `v2026.11.11` (release PR #65; D59 PR #64); approved by Matt 2026-11-11
**Backlog:** PortableMind project 254, task 5764
**Order:** independent of D56–D58. If D58 ships first, its manager rules
(§4.3) already cover the Owners department; if D59 ships first, D58's spec
picks it up.

## 1. Why

Owners have tasks and ideas that aren't any one department's: things for
the owners themselves, sometimes shared with a trusted employee. Today they
end up on the Office board or nowhere. An **Owners** department gives them
their own **task list** (`/tasks/owners`) and **Idea Board**
(`/boards/owners`), private to owners and the people they add.

## 2. Decisions (Matt, 2026-11-11)

1. Called **Owners** (key `owners`).
2. **Other employees can be members.** The purpose is owner tasks, and an
   owner may share them with someone, e.g. an office person.
3. **Only owners add or remove members.** Nobody is a *manager* of Owners;
   every member has the employee role. No manager can add themselves, so the
   boards stay private to owners and the people owners chose.
4. **Tasks only, not scheduling:** no positions, shifts, events, Scheduler
   rows or department calendar feed.
5. **It gets a Messages channel** (Owners), like the other departments.
6. **Color slate `#37474F`.**
7. **Owners is last** in every department list (§4.4).
8. **Owners are offered as assignees on the Owners boards only** (task dialog and Idea Board
   card people); other boards keep members only (Matt, 2026-11-11, at Stage 3).
9. **Non-members can't tell Owners exists** (Matt, 2026-11-11, DEV QA gap 5): the department list
   and every person's department list leave Owners out for anyone who isn't an owner or member.
   Managers keep the read-only membership chip (§4.3). A locked Owners card names who locked it
   ("Locked by Olivia Owner"), like other boards; the API's 423 says "Locked by an owner".

## 3. What it gets for free

A new assignable department already gets these with no new code:

- **Task board** `/tasks/owners`: members and owners read and write; tasks,
  repeats, Daily card, multiple assignees (owners and members are
  assignable). History and Edit Daily items are manager-only, so with no
  managers that means **owners only**. It shows in the owners' **All
  departments** view and in the board switcher of anyone who can open it.
- **Idea Board** `/boards/owners`: members and owners read and write;
  lock/unlock, locked changes, archive deletes and History are **owners
  only**, for the same reason.
- **Channel** `dept:owners`: members and owners view and post;
  `message_posted` email/push per each person's preferences.

People who aren't members (managers included) can't see any of it: the API
returns 404/403 like any department's board they aren't in.

## 4. Requirements

### 4.1 Data

- **Migration** (not the seed, so the deploy creates it on prod):
  - `departments.scheduling` boolean, default `true`, not null.
  - `departments.owners_only` boolean, default `false`, not null.
  - Insert **Owners**: key `owners`, `assignable: true`, `scheduling:
    false`, `owners_only: true`, color `#37474F` (slate). Skip the insert if a row with key `owners` exists.
  - `down`: drop the two columns; delete the Owners row **only** if nothing
    references it (no memberships, tasks, series, Daily items, idea lists,
    messages). Otherwise raise, and the rollback is the image only (§6).
- `seeds.exs` lists Owners too (idempotent, same values), so a fresh local
  DB matches.
- `GET /api/departments` returns `scheduling` and `owners_only`.
- The flags are columns, not checks on the key, so the rules read as "a
  department that isn't scheduled" and "a department only owners staff".

### 4.2 Not scheduled (`scheduling: false`)

API refuses (422 on `department_id`, "That department isn't on the schedule", without the name; DEV QA gap 6):

- creating or moving a **position**, **shift**, **schedule event / event
  series**, or **schedule template item** into the department;
- a **department calendar feed** for it (rotate/subscribe) — 404, like a
  department that doesn't exist.

Lists skip it: the Scheduler and View Schedule (rows, department filters
and pickers in the shift, event and positions dialogs), the "whole schedule"
feed's department list, Positions, Copy previous week and templates.

The Owners **task board's schedule header** (who's working that day) is
hidden: there are no shifts to show. Nothing else on the board changes.

Time off and availability are per person, not per department: unchanged.

### 4.3 Owners-only membership (`owners_only: true`)

- **Adding or removing** a membership in Owners: **owners only**. A
  manager's request that touches Owners is refused (403) even if they also
  manage another department in the same request. The rest of that request
  isn't applied (all or nothing, as today).
- **Role:** always `employee`. Asking for `manager` in Owners is a 422
  ("Owners has no managers"), owners included.
- **Users & Roles UI:** an owner sees Owners in the person dialog's
  department list (employee only, no role choice). A manager never sees
  Owners there as something they can change. A person's existing Owners
  membership shows as a read-only chip to a manager who can see that person.
- **Effect on manager rules** (current and D58):
  - Today, "manages the person" means *shares a managed department*.
    Owners membership never counts toward that, because nobody manages
    Owners.
  - Under D58 ("deactivate only if they manage **every** department the
    person is in"), a person in Owners can only be deactivated by an owner.
    That's intended: removing someone with access to the owners' boards is
    an owner's call. D58's **Add department** pull-down never offers Owners.
- **Shared devices:** Owners can't be a device's home (422, like "Other").
  No device ever sees its board or channel.

### 4.4 UI

- **Owners is last** wherever departments are listed: task boards (switcher,
  `/tasks`, All departments), Idea Boards (before Company, which stays at the
  very end), Messages channels (today sorted by name, which would put Owners
  between Office and Sales), Users & Roles. One shared ordering rule
  (`owners_only` departments after the rest) rather than relying on ids.
- **Left nav:** no Owners department heading. Its board and channel are
  reached through the top-level Tasks, Boards and Messages, which already
  list them. (The per-department headings exist for department pages such
  as Brewery's; Owners has none.)
- **Home / Brewery Dashboard:** unchanged.

## 5. Persona scenarios

New synthetic persona **`ownersAsst`** ("Ellis Assist", `owners.asst`):
Office employee + Owners member. Synthetic setup gives Olivia a
`[SEED]` Owners task and idea card.

| # | Persona | Entry | Scenario | Expect |
|---|---|---|---|---|
| O1 | `owner` | Tasks → board switcher | Opens Owners, adds a task assigned to `owner2` and `ownersAsst` | Saved, both shown as assignees; no schedule header on the board |
| O2 | `owner` | Users & Roles → `office1` | Adds Owners (employee); no manager option shown | `office1` now sees Owners in Tasks, Boards and Messages |
| O3 | `ownersAsst` | Tasks → Owners | Ticks a task, moves one to tomorrow | Works; **no** History or Edit Daily items |
| O4 | `ownersAsst` | Boards → Owners | Adds a card; tries to change a card `owner` locked | Card added; locked change refused with the usual message |
| O5 | `dualMgr` | Tasks / Boards / Messages; `/tasks/owners` typed in | Not a member | Owners in none of the lists; typed URL refused as for any board they aren't in |
| O6 | `dualMgr` | Users & Roles → `ownersAsst` | Edits `ownersAsst`'s Office details (manages Office) | Office edits save; Owners chip read-only; no way to remove it |
| O7 | `dualMgr` | API | `memberships` adding self to `owners` | 403, nothing changed |
| O8 | `owner` | API | `memberships` with `owners` as `manager` | 422 "Owners has no managers" |
| O9 | `owner` | Scheduler, View Schedule, shift/event/positions dialogs, Calendar sync | Looks for Owners | Absent everywhere; API shift/position/event with Owners → 422 |
| O10 | `ownersAsst` | Messages | Posts in Owners | `owner`/`owner2` see it (in-app/push per prefs); `office1` doesn't (until O2) |
| O11 | `owner` | Admin → Shared devices | Home department picker | Owners not offered; API → 422 |
| O12 | `taproomDevice` | `/tasks/owners`, `/boards/owners` | Typed URL | Same refusal as any non-home board |
| O13 | `owner` | Tasks → All departments | Read-only overview | Owners' tasks appear with the others |

## 6. Rollout and rollback

- One release. The migration adds columns and one row; no data changes.
- **Rollback (image only):** the old API ignores the new columns and treats
  Owners as an ordinary department. Owners would show up in the Scheduler and
  managers could add members until the fix is redeployed. If that matters,
  remove the Owners row while it's still empty. Once it has tasks, roll
  back the image and live with it briefly. A snapshot isn't needed.

## 7. Not in D59

- A department-management UI (add/rename departments): still done by
  migration.
- Owner-only *pages* beyond tasks/boards/channel.
- Changing the color from the app: Owners isn't in the Scheduler, where
  department colors are edited today.
