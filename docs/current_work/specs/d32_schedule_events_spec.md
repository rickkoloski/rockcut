# D32: Schedule Events + Taproom Rename — Specification

**Status:** Approved — Matt, 2026-09-29, including the recurring-events amendment (§3.7, decisions R1–R5). Rick reviewed the approach: discussion 80, msg 82384, file #4026.
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
no assignee. Managers create them; everyone sees them. An event can be a
one-off (a private party) or **repeat** weekly or monthly, for example trivia
every Tuesday or bingo on the third Sunday of the month.

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
| R1 | **Recurring events are in D32.** |
| R2 | Repeat patterns: **weekly** (chosen weekdays, every week or every other week) and **monthly by weekday** (1st, 2nd, 3rd, 4th or last Mon–Sun). **No** fixed day of the month (e.g. "the 15th"). |
| R3 | A series runs until an end date or for a set number of times, capped at **12 months** ahead. It can be extended later. |
| R4 | New occurrences are created as **drafts** and published week by week with **Publish week**. There's no separate "publish series" action. |
| R5 | Edits and deletes apply to **this event only** or **this and all following**. |
| P1 | **Copy last week** and **Delete week** leave events alone; they act on shifts only. |
| P2 | In View Schedule, events are **hidden** when the "Mine", "Open" or position filter is on, and follow the department filter. |
| A3 | **Sunday-evening shifts fix folded in** (Matt, 2026-09-29; found while testing D32): shift week queries use Colorado midnights, like events (§3.8). |
| A4 | **Events that cross midnight** (Matt, 2026-09-30; from DEV finding G5): a timed event ending by **3:00 AM** the next day shows on its start day only (e.g. 6 pm – 1 am). A longer timed event shows on every day it covers; continuation days are labeled ("→ until 12:00 PM", "all day (cont.)") and never repeat the start time. All-day events show on each of their days (unchanged). Shifts are unchanged: always on the day they start. |

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
- [ ] `schedule_events.series_id`: optional, set on every occurrence of a
      repeating event (§3.7).

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
- [ ] Repeating events (§3.7): `POST /api/schedule_events` accepts a repeat
      rule. Update and delete take a `scope` of `this` (default) or
      `following`. `POST /api/schedule_event_series/:id/extend` adds
      occurrences up to 12 months ahead.

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

### 3.7 Recurring events (R1–R5)

- [ ] **A series is a set of real events.** Saving a repeating event creates
      one `schedule_events` row per date, all sharing a `series_id`. The series
      row keeps:
  - the rule;
  - the department;
  - the title, notes and time of day (or all day);
  - the end condition.

  Each occurrence is a normal event, so permissions, draft/published, Publish
  week, the 404 rule, the Events row and View Schedule work unchanged.
- [ ] **Patterns (R2):**
  - **weekly:** one or more weekdays, every 1 or 2 weeks;
  - **monthly by weekday:** the 1st, 2nd, 3rd, 4th or last of a weekday (e.g. third Sunday, last Friday).

  No fixed day of the month.
- [ ] **Ends (R3):** on a date, or after N occurrences. Nothing is generated
      more than **12 months** past the series' start. If the end is further
      out, the series stops at 12 months and can be **extended**.
- [ ] **Extend:** a manager of the department can extend a series from any of
      its events. That adds occurrences, as drafts, up to 12 months from today
      or up to the series' own end, whichever comes first.
- [ ] **Local time:** occurrences keep their **Colorado wall-clock time**
      across daylight-saving changes. Trivia at 7 pm stays 7 pm in November.
- [ ] **New occurrences are drafts** (R4). They're published by **Publish week**
      like everything else.
- [ ] **Edit (R5):**
  - **This event only:** the change applies to that date. The event stays in
    the series, marked as changed, so a later "this and following" edit
    doesn't silently overwrite it. The dialog notes that it was changed.
  - **This and all following:**
    - title, notes, department and time changes apply to this date and every
      later occurrence, including ones previously changed individually (the
      confirm step says so);
    - changing the **repeat rule** ends the old series the day before this
      date and starts a new series from this date (drafts);
    - each occurrence keeps its draft/published status.
- [ ] **Counts across a split** (DEV finding, round 2): a series' "after N
      times" is the total for the whole series. When "this and all following"
      starts a new part (a new repeat rule, or moving the date to another day),
      the new part gets whatever count is left.
- [ ] **Moving a date to another day** with *this and all following* moves the
      repeat days from that date on (G3). The API refuses a day move that comes
      without a new repeat rule (422) instead of ignoring it.
- [ ] **Delete (R5):** *this event only*, or *this and all following*. The
      latter also ends the series there. Past occurrences are never touched.
- [ ] **Permissions:** creating, editing, extending and deleting a series need
      the same rights as its events (managers of its department, and owners).
      Checked in `Authz`.
- [ ] **UI:**
  - the event dialog has a **Repeat** section: *Does not repeat* / *Weekly*
    (weekday checkboxes, every 1 or 2 weeks) / *Monthly* (1st–4th or last,
    plus a weekday), and **Ends** on a date or after N times;
  - a short summary, such as "Every Tuesday until Mar 30, 2027";
  - a repeat icon on the grid chip and the agenda card;
  - "This event only / This and all following" choices on save and delete for
    repeating events;
  - an **Extend** action with the series' last date shown.

### 3.8 Shift week bounds in Colorado time (A3)

- [ ] `GET /api/shifts` `from`/`to` are Colorado days bounded by local
      midnight, not UTC midnight. Today a Sunday shift starting after 6 pm MDT
      (5 pm MST) is dropped from its week in the Scheduler grid and shows in no
      week at all. This predates D32.
- [ ] A shift still belongs to the day it **starts** (unchanged).
- [ ] The frozen D31 parity tests don't use date ranges, so they're unaffected.
- [ ] Regression tests: ExUnit plus Playwright, with the revert-and-rerun check.

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
| S13 | `barMgr` | Add event → Repeat weekly | new series | Creates "Trivia night", every Tuesday 7–9 pm, for 8 weeks. After a reload, 8 draft events appear on Tuesdays, each with the repeat icon. Publish week publishes only that week's one. |
| S14 | `barMgr` | Add event → Repeat monthly | new series | Creates "Bingo", 3rd Sunday, until an end date more than 12 months away. It's capped at 12 months. Occurrences crossing Nov 1 (the end of daylight saving) are still at the same local time. |
| S15 | `barMgr` | a trivia occurrence → Edit | series exists | Moves one date to 8 pm with *this event only*; only that date changes. Then renames from a later date with *this and following*; earlier dates keep the old title, later ones get the new one. Both persist after reload. |
| S16 | `barMgr` | a trivia occurrence → Delete | series exists | *This event only* removes one date. *This and all following* removes the rest; earlier dates remain. |
| S17 | `barMgr` | a bingo occurrence → Extend | series capped at 12 months | New draft occurrences are added past the old last date, still on 3rd Sundays. |
| S18 | `breweryMgr`, `bartender1` | a taproom series | series exists | Can't edit, delete or extend it (403; a draft series' events are 404 for `bartender1`). `bartender1` sees published occurrences with the repeat icon, read-only. |
| S19 | `barMgr` | Scheduler grid | a Sunday Bar-close shift, 6 pm–1 am | It shows in that Sunday's column. It's not missing from its week and not shown in the next one (A3). |

---

## 5. Out of Scope

- The taproom tablet (device account, pairing, allowlist) → **D33**.
- Events in calendar feeds (Q3), and company-wide events (Q7). Both are deferred; revisit them when D32 closes out.
- Repeating on a fixed day of the month (e.g. "the 15th") (R2).
- A "publish whole series" action (R4); Publish week covers it.
- Notifications or reminders for events.

---

## 6. Open Questions

None. Everything is decided (§2).
