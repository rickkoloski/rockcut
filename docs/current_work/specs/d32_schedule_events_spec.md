# D32: Schedule Events + Taproom Rename — Specification

**Status:** Approved — Matt, 2026-09-29 (Rick reviewed the approach: discussion 80, msg 82384, file #4026)
**Created:** 2026-09-29
**Author:** Matt + CC
**Depends On:** D31 (every authorization decision goes through `Authz`), D11–D15 (scheduling), D24 (conflict warnings)
**Followed by:** D33 (taproom device access), which lets the taproom tablet view published events
**Process:** `docs/process/three_environment_workflow.md` (spec with persona scenarios → local gate → DEV gate → release)
**Backlog:** PortableMind project 254, task 3937 (+ 3940, folded in)
**Branch:** `d32-schedule-events`, cut from `d31-rbac-consolidation` (no `develop` yet; workflow §2 cleanup is on hold)

---

## 1. Problem Statement

The schedule can only show shifts. Something like a private party or a
delivery either has to be entered as an unassigned shift, which is an **open
shift** that anyone can claim and that sends notifications, or it can't be shown
at all.

D32 adds **schedule events**: items on the schedule with a title and notes and
no assignee. Managers create them; everyone sees them.

It also renames the **Bar** department's display name to **Taproom**, which is
what staff actually call it.

Rick asked for the taproom tablet work to be split out (file #4026 §4): events
are useful on their own and low-risk, so they ship first, and the
security-sensitive device access follows as D33.

---

## 2. Decisions (Matt, 2026-09-29)

| # | Decision |
|---|---|
| M1 | "Taproom" and "Bar" are the same department (key `bar`). Rename the **display name** to Taproom; the key stays `bar`. |
| M3 | Only **managers** create events, for the departments they manage; owners for any. Everyone else only views them. |
| Q3 | Events are **not** in calendar feeds (D17) in D32. Deferred; revisit when D32 closes out. |
| Q4 | **Publish week** also publishes that week's draft events, for the manager's departments. Events also have their own publish toggle. |
| Q5 | Position names ("Bar-open", "Bar-mid", "Bar-close", "Event-bar") are **not** renamed. |
| Q7 | Company-wide events (no single department): **later**. Deferred; revisit when D32 closes out. |
| Q8 | An event is either **all day** or has a **start and end time**. |
| R4 | D32/D33 split accepted (Rick's proposal). |
| A1 | Draft events are visible only to managers of the event's department and owners, like draft shifts. An employee asking for a draft by id gets **404**, so a hidden draft's existence isn't revealed. |
| A2 | Backlog **3940** is folded in: Add shift (and Add event) default to the week being viewed, not today. |

---

## 3. Requirements

### 3.1 Data

- [ ] New table `schedule_events`:
  - `department_id`, required;
  - `title`, required, ≤ 100 characters;
  - `notes`, text;
  - `all_day`, boolean;
  - `starts_at`, `ends_at`;
  - `status`: `draft` | `published`;
  - `created_by_id`;
  - timestamps.
- [ ] **All day:** a start date and an end date (one or more whole days, no times shown).
- [ ] **Timed:** a start and end time, with the end after the start.
- [ ] Events never have an assignee or a position.

### 3.2 Permissions, in `Authz`

These mirror shifts:

- [ ] **Read:** anyone can read a published event. Only managers of the event's
      department and owners can read a draft.
- [ ] **Create, update, delete, publish, unpublish:** managers of the event's
      department, and owners.
- [ ] `Authz.scope` covers the list query the same way it does shifts.
- [ ] The D31 parity suite stays untouched and green. D32 adds its own
      persona × decision tests for events.
- [ ] `authz_boundary_test.exs` still passes.

### 3.3 Behavior

- [ ] Events **can't be claimed** and **send no notifications**. That covers
      creating, editing, publishing and deleting them.
- [ ] **Publish week** publishes the week's draft events along with the shifts,
      for the departments the manager manages (Q4).
- [ ] Conflict warnings (D24) ignore events.

### 3.4 API

- [ ] `GET /api/schedule_events`: the same week and department filters as `GET /api/shifts`.
- [ ] `POST /api/schedule_events`
- [ ] `PATCH /api/schedule_events/:id`
- [ ] `DELETE /api/schedule_events/:id`
- [ ] `POST /api/schedule_events/:id/publish`
- [ ] `POST /api/schedule_events/:id/unpublish`
- [ ] Params are flat, following the project convention.

### 3.5 UI

- [ ] **Scheduler grid (managers):**
  - an **Events** row at the top of each day;
  - add, edit and delete;
  - a draft/published look that matches shifts;
  - events only for the departments the manager manages.
- [ ] **Event dialog:**
  - department, title, notes;
  - an **All day** switch that hides the time fields and shows date pickers;
  - errors shown with `parseApiError`, as other form dialogs do.
- [ ] **View Schedule (everyone):**
  - published events appear in the day list, styled apart from shifts;
  - each shows an event icon, a department-colored outline, the title and the time (or "All day");
  - notes open on tap.
- [ ] **Dialog default dates (backlog 3940, found on DEV in D31):** Add shift
      and Add event default to the week on screen. That means today if today is
      in that week, otherwise the week's first day. They must not always
      default to today. It predates D31: a shift added from next week currently
      lands in this week unless you change the date. Needs a Playwright
      regression spec with the revert-and-rerun check.
- [ ] Every write is persist-verified: reload, and it's still there.

### 3.6 "Bar" → "Taproom" display rename (M1)

- [ ] Data migration, reversible:
  - `departments.name` `Bar` → `Taproom` where `key = 'bar'` **and** the name
    is still `Bar`, so an owner's own rename isn't overwritten;
  - `positions.group` `Bar` → `Taproom`.
- [ ] `seeds.exs`: the department name and the `group_to_key` entry.
- [ ] UI: the nav label comes from the department's name from the API, not the
      hardcoded `DEPT_META.bar.label`, so the next rename is only a data change.
- [ ] The channel name follows automatically, because `channel_name("dept:bar")`
      reads the department.
- [ ] Tests and Playwright specs that look for "Bar" are updated.
- [ ] Position names are **unchanged** (Q5).

---

## 4. Persona scenarios

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S1 | `barMgr` | Scheduler grid, Events row | draft week | Adds a timed event "Private party — back room", 6–10 pm, with notes. It shows as a draft. After a reload it's still there. |
| S2 | `barMgr` | Scheduler grid | draft event + draft shifts | Publish week publishes both. After a reload both are published. No notification is sent for the event. |
| S3 | `barMgr` | Event dialog | new event | Turns on All day, picks Fri–Sat ("Beer festival"). The times are hidden; both days show "All day". |
| S4 | `bartender1` | View Schedule | event published | Sees the event and its notes. Has no edit, delete or claim control. The API refuses a PATCH or DELETE with 403. |
| S5 | `bartender1` | View Schedule | event still a draft | Doesn't see it. `GET /api/schedule_events/:id` returns **404** (A1). |
| S6 | `breweryMgr` | Scheduler grid | taproom event exists | Can't edit or delete the taproom event (403). Can add a Brewery event. |
| S7 | `dualMgr` | Scheduler grid | manages Taproom + Office | Can create events in both. Publish week publishes both departments' events. |
| S8 | `owner` | Scheduler grid | any department | Can create, edit and publish an event in any department. |
| S9 | `barMgr` | Scheduler grid | shift overlaps an event | No conflict warning. |
| S10 | any persona | nav, Messages, Manage positions | after the migration | The department shows as "Taproom". Position names are unchanged. |
| S11 | `owner` | Settings → departments | renamed to something else before the migration | The migration leaves the owner's name alone. |
| S12 | `dualMgr` | Scheduler grid → next week → Add shift, then Add event | viewing a week that isn't the current one | Both dialogs default to a date in the week on screen. After saving and reloading, the shift and the event are in that week (3940). |

---

## 5. Out of Scope

- The taproom tablet (device account, pairing, allowlist) → **D33**.
- Events in calendar feeds (Q3), and company-wide events (Q7). Both are deferred; revisit them when D32 closes out.
- Recurring events.
- Notifications or reminders for events.

---

## 6. Open Questions

None. Everything is decided (§2).
