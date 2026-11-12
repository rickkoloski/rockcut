# D58: Board settings on the server, managers and everyone, and a backlog sweep — Spec

**Status:** DRAFT, for Matt's review (2026-11-11)
**Backlog:** PortableMind project 254, tasks 4994, 4991, 4992, 4984, 5202, 4261, 5204, 4118 (item 1),
5206, 5205, 4061, 5769
**Order:** after D59 (on prod as `v2026.11.11`). It builds on D59 spec §4.3 and decision 9.

## 1. Why

Three themes, all from QA backlogs:
- **Board settings follow the person.** They're split between the server and each browser, so a new
  device or tablet loses most of them.
- **Managers and everyone else.**
  - A manager can't see, or fix, someone outside their departments: for example a person created
    with no department.
  - Deactivation and positions aren't limited to the departments a manager manages.
- **Small fixes:** repeat-task twins, the event-series split, shifts on a deactivated person, staff-code
  Remove, card links, a blank start-up page, and the tablet header.

## 2. Decisions (Matt)

2026-11-09, on the tasks:
1. **Board settings per person on the server; each shared tablet keeps its own** (4994, 4991).
2. **A board URL range over 31 days is clamped to 31,** the board says so, and the URL is corrected (4992).
3. **Every manager sees every employee in Users & Roles** (4984).
   - Outside their departments, a person is read-only except **Add department**: a pull-down of the
     departments that manager manages that the person isn't in.
   - **Deactivate** is allowed only when the manager manages **every** department the person is in.
     Owners are unchanged.
   - Staff codes stay with a manager of one of the person's departments.
   - Creating a person with no department stays allowed.
4. **Repeat rule change:** skip a date whose occurrence was moved away (5202).

2026-11-11:

5. **Any manager can deactivate a person with no department** (4984).
6. **5769 joins D58:** a manager's position changes stop at their own departments (D29's decided
   rule).
7. **Owners stays hidden on read-only rows.** A manager sees a person's Owners membership only
   where D59 already showed it: on people they manage (a shared department). On anyone else, Owners
   isn't shown (D59 decision 9).
8. **The phone layout is a server setting too** (all days stacked / one day at a time).

## 3. Requirements

### 3.1 Board settings on the server (4994, 4991; decisions 1, 8)

- **The settings, per board** (a department key, or `all` for All departments):
  - Days shown (1 week / 2 weeks);
  - Hide completed;
  - Hide shifts;
  - First day (Today / Sunday / Monday);
  - **View** (All / My tasks / Unassigned; All departments has All / Unassigned only);
  - phone layout (stacked / one day).
- **Show planned batches** (D49 per person, D50 per device) stays where it is. It's already on
  the server.
- **Stored per account:** a person's and a device's settings are their own, so a tablet keeps its
  own.
  - One JSON column, e.g. `users.board_settings`: `%{board_key => %{setting => value}}`,
    validated against a closed set of keys and values.
  - Unknown keys and values get a 422. Nothing else on the user changes.
- **API:**
  - `GET /api/me` includes `board_settings`.
  - `PUT /api/me/board_settings/:board` takes the setting(s) to change and answers with the
    board's settings.
  - A device may call it for **its home board only**, with no staff code: it's the tablet's own view,
    not a write anyone is recorded for.
  - Other boards get 403. A person may save settings for any board they can read.
- **UI:**
  - The settings read from `/api/me` and save on change; the toggle feels instant.
  - If a save fails, the change stays for this page and a quiet "Not saved" toast shows.
- **Carry-over, once per browser:**
  - When a board has no server settings for this account but this browser has D41/D42/D45 local
    values for it, those values are saved to the server, and the local keys are then cleared.
  - Without local values, the defaults apply (2 weeks, nothing hidden, Today, All, stacked).
- **The last board opened** (`rockcut.tasks.board`) stays per browser: it's navigation, not a setting.

### 3.2 31-day URL clamp (4992; decision 2)

`/tasks/<board>?from=&to=` covering more than 31 days shows `from` plus 30 days. A notice on the
board says "Showing 31 days (the most a board shows)". The URL is replaced (not pushed) with the
clamped `to`. An invalid range (to before from, a bad date) keeps today's behavior: the default
range, and the URL is corrected the same way. The same applies to All departments.

### 3.3 Managers and everyone (4984; decisions 3, 5, 7)

- **List:** `GET /api/users` for any manager returns every person (devices excluded, as now). Each
  row says what the actor may do with that person (e.g. `can_edit`, `can_deactivate`,
  `addable_departments`), so the UI doesn't work it out itself.
- **A person the manager manages** (they share a managed department): as today. That covers name,
  email, roles in the manager's departments, reset password, staff code and the Owners chip (D59).
- **A person the manager doesn't manage:**
  - **Read-only:** name, email, active state and their departments.
  - **Owners is left out** of their departments (decision 7). Every department, including the
    owners-only ones, goes through `Authz.can?(:see, …)` in the user payload too, except on rows the
    actor manages.
  - **Add department:** a pull-down of the departments this manager manages that the person isn't
    in. It adds an employee membership.
  - No other edits, no password reset, no staff code, no deactivate. The API refuses each with 403.
- **Deactivate:**
  - A manager may deactivate (or reactivate) a person only when they manage **every** department
    the person belongs to. That includes Owners, which no manager manages.
  - A person with **no** department can be deactivated by any manager.
  - Owners can deactivate anyone (the last-owner guard stays).
  - The API refuses anything else with 403 and a plain message; the UI greys out Deactivate with a
    tooltip.
- **Create:** unchanged. A manager may create a person with no department, or in departments they
  manage.
- **Staff codes:** unchanged, a manager of one of the person's departments.
- **Calendar feeds, notifications:** unchanged. Adding a department is an ordinary membership
  change, audited.

### 3.4 Positions stop at a manager's departments (5769; decision 6)

Creating, renaming, recoloring, retiring, reordering or deleting a **position** needs the manager to
manage its department. Moving a position to another department needs both departments managed.
Owners can do all of it anywhere. Anything else gets 403, as schedule events already do. The
Positions dialog shows only the manager's departments' positions as editable. Shift templates and
day/week templates check their positions the same way. The builder checks whether they have the
same gap.

### 3.5 Repeat tasks: no twin after a rule change (5202; decision 4)

When a rule change remakes a series' dates, a date whose occurrence was **moved away** ("Just
this one" to another day) isn't recreated: the moved occurrence keeps standing in for it. The
rule-change confirm text says moved ones are kept on their new days. Test from the D53 Part 1 QA
repro (gap 14).

### 3.6 Schedule event series: D39's split gaps (4261)

Check D32 event series for the two gaps D39 fixed on tasks:
- **G1:** "following" actions from before a split stop at it.
- **R1:** a rule change from before a split keeps the split's internal end.

If either exists, apply D39's chain approach (`continues_series_id`, `internal_end`) to
`schedule_event_series`, with tests. If neither exists, a test proves it, and the task closes with
that note.

### 3.7 Shifts: not on a deactivated person (5204)

Creating or updating a shift (including a drag that reassigns it) with a deactivated assignee gets a
422 on `assignee_id`: "is not active". Existing shifts on someone later deactivated are unchanged.

### 3.8 Staff code Remove waits for Save (4118 item 1)

In Users & Roles → Staff code, **Remove** marks the code for removal ("Removed when you press
Save"), and **Cancel** keeps it. Only Save sends the `DELETE`, together with the rest of the dialog's
changes.

### 3.9 Card links that name no card (5206)

`/boards/<board>/cards/<id>` naming a card that doesn't exist on this board, or a bad id, shows the
board with "That card wasn't found (it may have been deleted)". The URL is replaced with the board's.
This applies to people and tablets.

### 3.10 Start-up isn't blank (5205)

While `GET /api/me` is pending at start-up, the loading screen shows at once. After **4 seconds**
it adds "Still connecting…" with a Retry button. The existing "Can't reach the server, retrying…"
behavior after a failure or timeout is unchanged.

### 3.11 Tablet header at phone width (4061)

At 320–384 px, the shared device's header stays on one line:
- **Sign out** becomes an icon button (with a label for screen readers);
- the device pill shrinks to the device name, with an ellipsis;
- the logo keeps its gap.

Nothing changes at 412 px and above.

## 4. Not in D58

- D56 production timing (5207), D57 test results (5208).
- RBAC phases 3849–3853; positions are the only D29 §6 C change taken here.
- Other Buy-a-Beer follow-ups: 4118 items 2–7, 4115, 4116.

## 5. Persona scenarios

| # | Persona | Entry | Scenario | Expect |
|---|---|---|---|---|
| S1 | `brewer1` | Tasks → Brewery → gear | Sets 1 week, Hide completed, Monday, My tasks; opens the board in another browser | Same settings there |
| S2 | `brewer1` | a browser with D45 local settings | First load after D58 | Old choices carried over once, local keys cleared |
| S3 | `taproomDevice` | its board → gear | Changes View and Hide shifts | Kept after reload; `bartender1`'s own settings unchanged |
| S4 | `taproomDevice` | API | Settings for the Brewery board | 403 |
| S5 | `owner` | All departments | Sets Unassigned and 1 week | Kept; the Brewery board's own settings unchanged |
| S6 | `breweryMgr` | `/tasks/brewery?from=…&to=…` (40 days) | Opens it | 31 days, the notice, URL corrected |
| S7 | `breweryMgr` | Users & Roles | Sees everyone; on `bartender1` the row is read-only with Add department (Brewery) | Adds Brewery; `bartender1` is now in Taproom and Brewery |
| S8 | `breweryMgr` | Users & Roles → `floater` (Taproom + Brewery) | Deactivate | Greyed out; API 403 |
| S9 | `dualMgr` | Users & Roles → `[TEST-TEMP]` person in Taproom + Office | Deactivate, then reactivate | Works |
| S10 | `barMgr` | Users & Roles → `noDept` | Deactivate and reactivate | Works |
| S11 | `dualMgr` | Users & Roles → `ownersAsst` (Office + Owners) | Edits the Office details; tries Deactivate | Office edits work, Owners chip shows (managed row); Deactivate greyed out (Owners not managed) |
| S12 | `breweryMgr` | Users & Roles → `ownersAsst` (not managed) | Views the row; checks the network | Office only; no Owners anywhere |
| S13 | `breweryMgr` | API | Edit name / reset password / staff code on `bartender1` | 403 each |
| S14 | `breweryMgr` | Positions / API | Create, rename, delete an Office position | 403; Brewery positions still work |
| S15 | `brewer1` | a repeat task | Moves one occurrence ("Just this one"), then changes the rule | No twin on the old date |
| S16 | `breweryMgr` | Scheduler, event series | Splits a weekly event, then edits "following" from before the split | Matches D39's behavior (or the check shows no gap) |
| S17 | `barMgr` | Scheduler / API | Assigns a shift to `inactive` | 422 "is not active" |
| S18 | `owner` | Users & Roles → staff code | Remove, then Cancel; Remove, then Save | Code kept; then removed |
| S19 | `bartender1`, `taproomDevice` | `/boards/bar/cards/99999999` | Opens it | Board + "That card wasn't found", URL corrected |
| S20 | `brewer1` | start-up with `/api/me` delayed | Loads | Loading at once; "Still connecting…" + Retry at 4 s |
| S21 | `taproomDevice` | 320 / 360 / 384 px | Header | One line, no overlap |

## 6. Rollout

- **Migration:** one additive migration (`users.board_settings`, default `{}`). An older API image
  ignores it.
- **No new secrets.**
- **People's board choices** come across from each browser the first time they open a board after
  the release. On a browser they never use again, those choices stay behind, and the defaults apply
  elsewhere.
