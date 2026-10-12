# D38–D40: Brewery Task Board — Specification

**Status:** Approved (Matt, 2026-10-11). Q19–Q20 answered; checked against the three-environment workflow (§3.9).
**Created:** 2026-10-11
**Author:** Matt + CC
**Depends On:**
- D11/D12: shifts and positions.
- D32: schedule events and Colorado day bounds.
- D18/D21/D22: notifications, web push and the shift-reminder scanner.
- D33/D37: shared devices and staff codes.
- D31: every authorization decision goes through `Authz`.
- D30: synthetic personas and DEV.

**Process:** `docs/process/three_environment_workflow.md` (spec with persona scenarios → local gate → DEV gate → release)
**Split (Matt, 2026-10-11):** three deliverables, one spec. See "Delivery split" below.
**Backlog:** PortableMind project 254: D38 = task 4211, D39 = task 4212, D40 = task 4213
**Branches:** one per deliverable, each cut from `develop` after the previous one merges: `d38-brewery-task-board`, `d39-brewery-recurring-tasks`, `d40-brewhouse-tablet-reminders`
**Reference:** the brewers' current Trello board, `specs/d38_ref/trello-board.png` (local only, gitignored)

---

## Delivery split (Matt, 2026-10-11)

The board is too large for one PR, so it ships as three deliverables. Each
one runs the whole three-environment workflow (local gate → DEV gate →
release) on its own branch. This spec covers all three. Where it says
"D38", read it as the whole board unless a section is listed below.

| | **D38: Brewery Task Board** | **D39: Recurring tasks** | **D40: Brewhouse tablet, reminder, dashboard** |
|---|---|---|---|
| **What** | The shared drag layer (§3.7); the board: range, day header, tasks, task menu, Unfinished card, Future list, Hide completed, filter (§3.8); the Daily card and Daily items; the change log; `Authz` (§3.3). | Recurring tasks (§3.10): the `Recurrence` rules, series edits, the daily top-up. Un-retiring a Daily item, plus the D38 DEV QA pass 2 follow-ups (§5, Matt 2026-10-12). | The brewhouse tablet and staff codes for Brewery members (§3.4); the shift-end reminder and its opt-out (§3.5); the Brewery Dashboard card (§3.8). |
| **Data** | `brewery_tasks` without the `series_*` columns, `brewery_daily_items`, `brewery_daily_checks` | `brewery_task_series`; adds `series_id`, `series_date`, `series_exception` to `brewery_tasks` | `brewery_task_reminders` |
| **API** | Every §3.6 route, without `repeat` or `scope` | `repeat` on create/edit, `scope` on edit/delete | `staff_code` on every write from a device |
| **Scenarios** | S1–S9f, S10–S31, S38–S41, S49 (except the staff code), S51 | S52–S67, S69 | S9g, S32–S37a, S42–S48, S49 (the staff code), S50, S68 |
| **New dependency** | `@dnd-kit` | — | — |
| **DEV seed** | Sample tasks, Daily cards, shifts and an event (§3.9) | A few `[SEED]` recurring tasks | The `breweryDevice` persona, `brewer1`'s staff code |

- **Order:** D38, then D39, then D40. Each branch is cut from `develop`
  after the previous one merges.
- **One prod release for all three** (Matt, 2026-10-11). D38 and D39 each
  pass their DEV gate and merge to `develop`, then wait. The board goes to
  prod in the first release after D40 merges, so the brewhouse tablet is
  there from day one. Each deliverable still gets its own PR and gates.
- **D38 keeps the §7 rules** (cards keyed by task + day, one server
  function for what shows on a day, a generic drag layer), so D39 and D40
  add to it without restructuring.
- The reminder (D40) lists recurring occurrences like any open task; with
  D39 already shipped, that needs nothing extra.
- **Boards for every department** (Matt, 2026-10-12): one board per
  department, with a switcher for people in more than one. Each task
  belongs to exactly one department and is never shared. D38 ships as
  built (Brewery only). The generalization is its own deliverable
  (proposed D41, spec amendment to come), built **after D39 and before
  D40**, so D40's tablet, reminder and dashboard card target the final
  model. It covers:
  - the `brewery_*` → generic rename (tables, modules, routes, UI);
  - `Authz` keyed on the task's department instead of the Brewery;
  - `department_id` on the change log;
  - the day header from the board's department's schedule;
  - the department switcher and a top-level Tasks nav.

  It still ships in the one prod release after D40, so no prod data moves.

## 1. Problem Statement

The brewers plan their work on a Trello board with one list per weekday.
Each list starts with a "who's in" card ("10/12 - K8 (out by 3) & MH brew",
"10/19 - No Brewers"). Under it are that day's tasks: "Package FV5",
"CIP + Sani FV5", "Crash FV6", "Keg Wash", "Inventory". A divider splits this
week from next week in the same list. Tasks get dragged to another day when
plans change. A "Daily" card holds the readings taken every day.

The "who's in" cards are typed by hand and repeat what the Scheduler already
knows. The board is also a separate app with separate logins, and it can't
remind anyone that work is still open.

D38 moves the board into Rockcut as a calendar-based task list for the
Brewery. Each day's header comes from the schedule: who is working, their
shift and its hours, and that day's Brewery events. Under the header are a
Daily checklist and that day's tasks, which work like Trello cards. An hour
before a brewer's shift ends, they get a push notification if that day's work
is still open.

D38 also adds a **shared drag-and-drop layer** that works with mouse, touch
and keyboard. The task board is its first user, and other screens can adopt
it later.

## 2. Decisions (Matt, 2026-10-11)

**The board**
- **A brewers' tool.** It lives under Brewery, with a **Today's tasks**
  card on the Brewery Dashboard.
- **Any brewer can add, complete and delete tasks.** The change log is for
  **Brewery managers and owners**.
- **Tasks can be assigned to a person, but don't have to be.**
- **Each day's header** lists:
  - the brewers scheduled that day, with what they're scheduled for and the
    hours of each shift;
  - any Brewery department events that day.

  **Published shifts only**: no drafts, no shift notes and no time off.
- **Tasks are draggable** up and down a day's list, and to any other day,
  future or past.
- **Drag and drop is a shared, app-wide building block**, not something
  built only for this page.
- **The board starts with today.** A **1 week / 2 weeks** toggle next to
  the **date range selector** sets the span, and it becomes the default
  for next time.
- **A Future list at the end of the calendar** holds tasks that aren't on
  any day yet. Tasks move on and off it, to and from scheduled days.

**The Daily card**
- It is on **every day**, including days with no brewers scheduled.
- It starts with four checks: **Backups, Gravities, Temps, Pressures**.
  **Brewery managers and owners can change the list** in the app.
- Future days can't be ticked.
- Unticked checks don't go on the Unfinished card.

**Recurring tasks** (Matt)
- **A task can repeat weekly, monthly, quarterly or annually.** Each
  repeat is an ordinary task on its own day, which can be finished, moved
  or edited on its own.
- **Missed occurrences each stay on the Unfinished card** (Q19). The
  repeat options in §3.10 are enough for now (Q20).

**Unfinished tasks**
- **They stay on their day.** If any task from an earlier day is still
  open, an **Unfinished card at the start of the calendar** lists them. It
  has a **Move all to today** button.
- **Finishing a task on a different day asks where it should show:** on its
  original day, on the day it was finished, or both.

**Notifications**
- **There's no notification when you're assigned a task.**
- **An hour before each of a brewer's shifts ends**, they get a push
  notification listing that day's unchecked tasks, **everyone's** included.

**Brewhouse tablet**
- **There will be a shared tablet in the brewhouse**, and it shows the
  board.
- **Writes need a staff code.** One code covers **5 minutes** of activity.

**Future (not D38)**
- **Multi-day tasks with dependencies** are planned for later. D38 doesn't
  build them, but it avoids choices that would block them (§7).

Every question in §6 is answered.

## 3. Requirements

### 3.1 Data

**`brewery_tasks`** (new)

| Column | Notes |
|---|---|
| `id` | |
| `department_id` | The Brewery. Stored so another department could get its own board later; D38 only builds the Brewery's. |
| `title` | Required, 1–200 characters. ("Filter FV2 > FV3") |
| `notes` | Optional free text, up to 2,000 characters. |
| `due_on` | A **date** (Colorado), not a time. The day the task is planned for. **Empty = on the Future list.** Finishing a task never changes this. |
| `position` | Order within the day, or within the Future list. Lower is higher. |
| `assignee_id` | Optional. Must be an active Brewery member. |
| `completed_at`, `completed_by_id` | Both set when checked off, both cleared when unchecked. |
| `completed_on` | The Colorado date it was checked off. Cleared when unchecked. |
| `completed_display` | Where a finished task shows: `planned_day` (the default), `completed_day` or `both` (§3.8, "Finishing a task on another day"). Cleared when unchecked. |
| `series_id` | Set when the task is one occurrence of a recurring task (below). |
| `series_date` | The date the rule produced it. It doesn't change when the occurrence is moved. `series_id` + `series_date` is unique. |
| `series_exception` | True once this occurrence has been changed on its own (moved, or edited with "Just this one"). Series edits then leave it alone, as in D32. |
| `created_by_id`, timestamps | |

**`brewery_task_series`** (new): the rule behind a recurring task. It
follows D32's `schedule_event_series`.

| Column | Notes |
|---|---|
| `id`, `department_id` | |
| `title`, `notes`, `assignee_id` | Copied onto each new occurrence. |
| `frequency` | `weekly`, `monthly`, `quarterly` or `annually`. |
| `interval` | Weekly only: every 1–4 weeks (default 1). |
| `weekdays` | Weekly: one or more days (Mon & Thu). |
| `month_rule` | Monthly and quarterly: `day` (day N of the month) or `weekday` (the 1st–4th or last Tuesday, as D32). |
| `day_of_month` | 1–31. In a shorter month, the last day of the month. |
| `week_of_month`, `weekday` | For `weekday` rules (D32). |
| `start_date` | The first occurrence's date. It also anchors quarterly (every 3 months from the start month) and annually (the same month and day; Feb 29 → Feb 28 in other years). |
| `until_date` / `count` | Optional end: on a date, or after N occurrences. Neither = repeats until stopped. |
| `generated_through` | How far occurrences exist. |
| `skipped_dates` | Occurrences deleted one at a time, so they're not made again (D32). |
| `created_by_id`, timestamps | |

**`brewery_daily_items`** (new): the Daily card's list.

| Column | Notes |
|---|---|
| `id` | |
| `department_id` | The Brewery. |
| `name` | Required, 1–40 characters, unique among active items. |
| `position` | Order on the card. |
| `active` | Retiring an item sets this to false. |
| timestamps | |

- The migration seeds Backups, Gravities, Temps and Pressures, in that
  order.
- At most 12 active items.

**`brewery_daily_checks`** (new): one row per check that was ticked.

| Column | Notes |
|---|---|
| `id` | |
| `department_id` | The Brewery. |
| `on_date` | Colorado date. |
| `daily_item_id` | |
| `completed_by_id`, `completed_at` | |

- The pair (`on_date`, `daily_item_id`) is unique. Unticking a check deletes
  its row.

**`brewery_task_reminders`** (new): a send ledger like D22's
`shift_reminders`.

| Column | Notes |
|---|---|
| `shift_id` | Unique. |
| `sent_at` | |
| `open_count` | How many items the notification listed. Kept for troubleshooting. |

**General**
- **Deleting a task really deletes it.** The change log keeps the record,
  as D37 does.
- **Change log:** an entry in its own `brewery_task_events` table (as
  D37's `beer_board_events`; Matt, 2026-10-11), with who and when, for each of:
  - task added, edited or deleted;
  - task moved (old day/position → new), including each task moved by
    "Move all to today";
  - task assigned, completed (with where it shows) or uncompleted;
  - recurring task created, edited (with the scope), or stopped;
  - Daily check ticked or unticked;
  - Daily item added, renamed, reordered or retired.

  The task's detail view shows "Added by …" and "Completed by … on …".
- On the shared tablet, the log reads "\<name\> on Shared Device", as D37
  does.
- **Removing someone from the Brewery** clears them as assignee on open
  tasks. Completed tasks and ticked checks keep the name. Their staff code
  is cleared (§3.4).

### 3.2 The day header (read from the schedule, never typed)

For each day on the board:

- **Brewers scheduled:** every **published** Brewery shift that starts that
  Colorado day (D32 day bounds), one line per person:
  `Kate Brewer · Brewer · 7:00a–3:00p · 8h`. Someone with two shifts gets
  both on one line, plus their total hours. Ordering follows the Scheduler's
  roster order.
- **Open (unassigned) Brewery shifts** that day: `Open · Brewer · 7:00a–3:00p`.
- **No published Brewery shifts:** "No brewers scheduled", like the Trello
  "No Brewers" card.
- **Brewery events:** every published Brewery `schedule_event` that day
  (D32), with its time or "All day". Recurring events show on each day they
  occur.
- **Not shown:** draft shifts (for anyone, managers included), shift notes
  and time off.
- The header updates whenever the schedule changes. Nothing is copied into
  the board.

### 3.3 Who can do what (`Authz`)

| Action | Who |
|---|---|
| View the board | Brewery members (any role), owners, the brewhouse tablet |
| Add, edit, complete/uncomplete, move, assign, delete a task; Move all to today | Brewery members and owners; the brewhouse tablet with a staff code (§3.4) |
| Tick/untick Daily checks | the same as above |
| Change the Daily items (add, rename, reorder, retire) | Brewery managers and owners |
| View the change log | Brewery managers and owners |

- New `brewery_tasks` and `brewery_daily_items` areas in `Authz.can?/3`,
  under the existing `brewing` module. Nothing checks owner or role
  directly; D31's boundary test enforces that.
- People outside the Brewery get no nav entry, and the API returns 403. A
  typed URL goes to Home, as other Brewery pages do (D31).
- Other shared devices (the Taproom tablet) get 403.

### 3.4 Brewhouse tablet (shared device)

- It's a D33 device account with **Brewery** as its home department. Pairing
  it is unchanged (Admin → Shared devices).
- It opens to **Brewery → Tasks** after it's paired. Its nav also has the
  schedule, as D33 already provides.
- **Writes need a staff code** (Matt, following D37). A write is a task
  change or a Daily tick.
  - **D37's staff codes extend to Brewery members.** Brewery managers and
    owners set them in Users & Roles, the same way Taproom managers do.
  - A code identifies the person, and the change log reads "\<name\> on
    Shared Device".
  - D37's lockout also applies: 5 wrong codes in 10 minutes lock code entry
    on that tablet for 10 minutes.
- **Code entry is remembered for a short time** (Matt: 5 minutes).
  After a correct code, the tablet keeps acting as that person for **5
  minutes** of activity, so ticking four Daily checks doesn't need four
  codes. A banner shows "Acting as Kate · Done". Done, or 5 idle minutes,
  ends it.
- "Sign in as me" (D33) still works and needs no code.
- The tablet doesn't see the change log, and it can't edit the Daily items.
- A staff code is only accepted for someone who is a member of the
  tablet's home department.

### 3.5 Shift-end reminder (push)

- **When:** **60 minutes before the end** of each **published** Brewery
  shift with an assignee. The D22 scanner already runs every 5 minutes; a
  second job in it sends these. So the reminder arrives 55–60 minutes before
  the shift ends.
- **Every shift gets its own reminder.** A brewer with two shifts in a day
  gets one before each ends (Matt). Each lists whatever is open at that
  time.
- **What it lists:** all of that day's open work, for the day the shift is
  on (the Colorado date of the shift's start):
  - **every** open task dated that day, whoever it's assigned to. The
    brewer's own tasks come first, then unassigned tasks, then other
    people's tasks (with their initials);
  - that day's unticked **Daily** checks.
- **Text:**
  - title: "Still open today: 3 tasks, Daily 2/4"
  - body: up to three task titles, then "+N more"
  - Tapping it opens Brewery → Tasks with today in view.
- **Nothing open → no notification.**
- **Sent once per shift.** The `brewery_task_reminders` ledger prevents a
  resend, even if the shift's end time is edited later.
- **No reminder** for a shift that's shorter than an hour, unpublished,
  deleted or unassigned when the scan runs.
- **Channel:**
  - web push (D21), and the same entry in the in-app bell (D18);
  - no email;
  - a new notification type, **"Unfinished tasks before shift end"**, on
    by default, which each person can turn off in their notification
    settings.
- **People with no push subscription** still get the in-app entry.
- Brewery shifts only. Other departments get nothing new.

### 3.6 API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/brewery/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD` | For each day in the range: its tasks, its header (shifts, events) and its Daily card. Whatever the range, it also returns **every open task dated before today** (the Unfinished card) and **the Future list**. The range is at most 31 days. |
| `POST` | `/api/brewery/tasks` | `{ title, notes?, due_on?, assignee_id?, repeat? }`. With `repeat` (§3.10) it creates the series and its occurrences. Added at the **bottom** of the day, or of the Future list when `due_on` is empty. |
| `PATCH` | `/api/brewery/tasks/:id` | Title, notes, assignee, and the repeat rule (§3.10). For an occurrence, `scope` is `this` (the default) or `following`. |
| `POST` | `/api/brewery/tasks/:id/move` | `{ due_on, before_id? }`. Puts the task on that day ahead of `before_id`, or last when `before_id` is omitted. `due_on: null` moves it to the Future list. The server renumbers the affected days and lists in one transaction. |
| `POST` | `/api/brewery/tasks/move_overdue_to_today` | Moves every open task dated before today to the **bottom of today**, oldest day first, keeping each day's order. One transaction. Returns how many tasks were moved. |
| `POST` | `/api/brewery/tasks/:id/complete` | `{ display? }`: `planned_day`, `completed_day` or `both`. Required when today isn't the task's `due_on` (422 `display_required` without it); ignored otherwise. Sets `completed_on` to today. |
| `POST` | `/api/brewery/tasks/:id/uncomplete` | Clears the completion and its display choice. The task is open on its `due_on` again. |
| `DELETE` | `/api/brewery/tasks/:id?scope=this\|following` | For an occurrence: `this` deletes just it (its date is skipped); `following` stops the series from this occurrence on. |
| `PUT` / `DELETE` | `/api/brewery/daily_checks/:on_date/:daily_item_id` | Tick / untick. Only **today and earlier** can be ticked; a future date returns 422. |
| `GET` / `POST` | `/api/brewery/daily_items` | List / add (managers). |
| `PATCH` | `/api/brewery/daily_items/:id` | Rename, `active: false` to retire (managers). |
| `PUT` | `/api/brewery/daily_items/order` | `{ ids: [...] }` (managers). |

- Flat params (house style).
- From the brewhouse tablet, each write also takes `staff_code`, as D37's
  board does. A missing code returns 422 `staff_code_required`.
- "Today" is always the Colorado date, computed on the server.
- A move whose `before_id` is no longer on that day (someone else moved it)
  puts the task last on that day instead of failing.
- Moving a task to a past day is allowed (Matt).

**Which Daily items each day shows**
- Future days: the active items.
- Today and past days: the active items that existed that Colorado day, plus
  any item (active or retired) that was ticked that day. The count is out of
  the rows shown.
- A rename shows everywhere, past days included.
- A new item doesn't appear on days before it was added, and ticking it on
  one is refused (422 `not_yet_added`). An item added today shows and can be
  ticked today. (DEV pass 1, G4, Matt 2026-10-12.)
- Retiring is one-way: `{ active: true }` on a retired item is refused (422
  `retired`). (DEV pass 1, G3.)

### 3.7 Shared drag and drop (app-wide)

A reusable layer in `rockcut-ui/src/components/dnd/`, built on
**`@dnd-kit`** (new dependency, touch-capable). The task board (and the
Daily items dialog) are the only users in D38.

- **`SortableLists`** handles a set of ordered lists (containers) with
  items that can be dragged between them. The caller supplies containers,
  items and a render function. It receives one callback:
  `onMove({ itemId, fromContainer, toContainer, beforeId })`. The task board
  uses it with one container per day plus the Unfinished card. The Daily
  items dialog uses it with a single list.
- **`DropTarget`** is a plain drop zone (for example, a "move here"
  area). It gets the dropped item's id.
- **Input:**
  - mouse starts a drag after a few pixels of movement, so clicks still open
    a card;
  - touch starts a drag on a **long press** (~250 ms), so swiping and
    scrolling still work;
  - keyboard: Space picks an item up, the arrow keys move it, Space drops
    it and Escape cancels. Screen readers hear each step announced.
- **Feedback:**
  - a lifted copy of the item follows the pointer, and a gap shows where it
    will land;
  - the page and the columns scroll automatically near their edges;
  - a drop that the caller rejects snaps back.
- **Optimistic updates:** callers update the list at once, and the layer
  helps put the old order back with an error toast if the server rejects
  the move.
- **Not in D38:** moving the Scheduler grid (D13) onto this layer. That's a
  follow-up task (see §5).

### 3.8 UI

**Nav:** Brewery → **Tasks** (`/brewery/tasks`).

**Range:**
- The board opens on **today**, showing the default span.
- **1 week / 2 weeks toggle** (Matt), next to the date range selector:
  - picking one shows 7 or 14 days from the current From date;
  - it also **becomes the default**: the board opens with that span next
    time. The default is remembered per browser, so a phone can default to
    1 week and the office computer to 2;
  - the default starts at **2 weeks** until someone picks;
  - when a custom range from the selector is showing, neither side is
    highlighted. Picking one goes back to 7 or 14 days.
- A **date range selector** (From and To dates, up to 31 days apart) can
  show any other span, including past days. It doesn't change the default.
- Previous and Next move the range back or forward by its own length.
- **Today** returns to today with the default span.
- The range is in the URL (`?from=&to=`), so a link or reload keeps it.

**Layout, desktop and tablet landscape:**
- Days run in rows of seven columns, and each row starts on the next day in
  sequence. 2 weeks gives **two rows** (today–day 6, day 7–day 13), like the
  Trello board's this-week/next-week split but starting from today.
  1 week gives one row.
- The **Unfinished card** is a column at the **start** of the calendar, and
  the **Future list** is a column at the **end**. Both run the full height
  of the day rows. On a screen too narrow for nine columns, Unfinished
  moves above the days and Future below them.
- Each day's column has, top to bottom:
  - a day title ("Mon 10/12") with a count of open tasks;
  - the header from §3.2, set apart visually;
  - the **Daily card**;
  - the tasks, in order;
  - "+ Add a task".
- Today's column is highlighted.

**Unfinished card (start of the calendar):**
- It appears only when an open task is dated before today. It is the
  first card on the page, ahead of today's column in the first row.
- It lists those tasks, oldest day first. Each one shows its date
  ("Fri 10/9"), title and assignee.
- Each task can be checked off, tapped for its task menu, or dragged out of
  it onto any day.
- **Move all to today** asks "Move N unfinished tasks to today?", then
  appends them to the bottom of today in their original order.
- The tasks still appear on their own past day too, when that day is in
  the range. There they have an amber edge.
- The card shows open tasks from every earlier day, not just those in the
  range.
- Unticked Daily checks never appear here.

**Future list (end of the calendar)** (Matt):
- It holds tasks that **aren't on any day** yet ("Gas order and Tanks Out",
  "Line clean?").
- It's **always shown**, even when empty ("Nothing here. Drag a task here or
  add one."), so there's always somewhere to drop. Its title shows a count
  of open tasks, and it doesn't depend on the range.
- It has its own **+ Add a task**, and its own order, which can be changed
  by dragging.
- **On and off:**
  - drag a task from any day (or from the Unfinished card) onto the Future
    list, or from the Future list onto any day;
  - in the task menu, **Change day…** has a **Move to Future** button, and
    a task on the Future list gets a date picker the same way;
  - the add/edit dialog's Day field has a **No day (Future)** choice.
- A task moved to a day goes where it's dropped, or to the bottom of that
  day when moved from the menu or dialog. A task moved to the Future list
  goes where it's dropped, or to the bottom of the list.
- **Finishing a Future task:**
  - it asks nothing, because there's no planned day to choose between;
  - it shows on the day it was finished, after that day's own tasks, with
    a "from Future" tag;
  - Mark not done puts it back at the bottom of the Future list.
- Future tasks are never on the Unfinished card. They're not in Move all
  to today or the shift-end reminder, and they're not overdue.
- The filter (All / My tasks / Unassigned) and Hide completed apply here
  too.

**Daily card:**
- It sits at the top of **every** day's column, whether or not anyone is
  scheduled, and can't be dragged.
- It shows "Daily 2/4". Expanding it shows the active items in order. Each
  ticked one shows who ticked it, for example "✓ Temps — Kate, 8:12a".
- On today it's expanded by default. On other days it's collapsed.
- Future days' checks are shown but can't be ticked.
- On a past day with checks left unticked, the count is shown in amber
  ("Daily 3/4").
- **Edit Daily items** (managers and owners) is in the board's ⋮ menu and
  on the Daily card's own menu. It opens a dialog where they can:
  - add an item;
  - rename an item;
  - drag items to reorder them (shared layer);
  - retire an item, after a confirm: "Retire Temps? Past ticks are kept."

**Phone width:**
- One day at a time: the Unfinished card (on today only), then the header,
  the Daily card and the tasks.
- Arrows (and swiping) move between days, and a strip of the range's days
  shows open-task counts. The strip ends with a **Future** stop that shows
  the Future list.
- Dragging across days isn't practical on a phone. **Change day…** and
  **Move to Future** in the task menu do the job.
- The 1 week / 2 weeks toggle and the date range selector sit behind a
  calendar button.
- **Back closes the task sheet** (Matt, 2026-10-12, Pixel check). With the
  bottom sheet open, Android's back gesture closes it and nothing else.
  With no sheet open, back goes to the previous page; it never changes day.
- **No edge-drag to another day** (Matt, 2026-10-12): holding a dragged
  card at the screen edge doesn't switch days.
- **Vertical view** (Matt, 2026-10-12; which deliverable: TBD): a toggle
  shows every day of the range stacked vertically, scrolling up and down
  through the days, with drag between days as on desktop. Phones **start
  in the vertical view**; the choice is remembered per browser, like
  1 week / 2 weeks.

**Task card:**
- a checkbox to complete it;
- the title;
- the assignee's initials, if any;
- a notes icon, if it has notes.

A completed task is struck through and dimmed, with "✓ Kate".

**Hide completed** (Matt):
- A toggle in the board's toolbar hides finished tasks on every day,
  including a finished task shown on the day it was done.
- Each day's title still counts open tasks only.
- The setting is remembered per browser, and it's off until someone turns
  it on.

**Tap or click a task → task menu** (Matt):
- Tapping or clicking anywhere on a card except its checkbox opens the task
  menu. On phones it's a sheet from the bottom of the screen; on larger
  screens it's a menu next to the card. Its header shows the title, planned
  day and assignee, and it offers:

  | Action | What it does |
  |---|---|
  | **Edit** | Opens the edit dialog (title, assignee, notes, day). |
  | **Add notes** / **Edit notes** | Opens the same dialog with the cursor in Notes. The label depends on whether the task has notes. |
  | **Mark completed** / **Mark not done** | The same as the checkbox, including the "where should it show" dialog ("Finishing a task on another day", below) when the task isn't on today. |
  | **Change day…** | A date picker, defaulting to the task's day. The task goes to the bottom of the chosen day, and any date can be picked, in or out of the range. |
  | **Move up** / **Move down** | One place within its day. For people who can't or don't want to drag. |
  | **Delete** | After a confirm: "Delete 'Package FV6'?" |

- The checkbox on the card still completes a task in one tap.
- A tap opens the menu, but a **long press starts a drag** on touch, and
  a mouse drag starts after a few pixels of movement. The two never get
  mixed up (§3.7).
- For a finished task shown on the day it was done ("Finishing a task on another day", below):
  - Change day, Move up and Move down are greyed out, and the menu says
    "Mark not done first to move it";
  - Edit, notes, Mark not done and Delete still work.
- On the brewhouse tablet, every action asks for a staff code unless one is
  still active (§3.4). Opening the menu doesn't need one.
- The keyboard works too: Enter on a focused card opens the menu.

**Finishing a task on another day:**
- Checking off a task whose day isn't today opens a dialog first. This
  covers a past-day task, including one on the Unfinished card, and a
  future-day task finished early (Matt). The dialog reads:

  > **Where should "Package FV6" show as done?**
  > Planned for Mon 10/12, finished today (Wed 10/14).
  > ○ **On Mon 10/12** (its planned day)
  > ○ **On today**
  > ○ **On both days**
  > [Cancel] [Mark done]

  Nothing is preselected. Cancel leaves the task open.
- The task's planned day (`due_on`) never changes. The choice only decides
  where the finished card shows:
  - **Planned day:** it stays in its place on the planned day.
  - **Today:** it shows on today instead, after today's own tasks, ordered by
    when they were finished. It has a "planned Mon 10/12" tag.
  - **Both:** it shows in its place on the planned day with "done Wed
    10/14", and on today with "planned Mon 10/12".
- A finished task showing on the day it was finished can't be dragged.
  Unchecking it (from either day, after a confirm) reopens it on its
  planned day, and it rejoins the Unfinished card if that day is past.
- Checking off a task on its own day asks nothing. Neither does checking
  off a Future-list task (see "Future list" above).
- The dashboard card and the brewhouse tablet use the same dialog.
- One server function decides "which cards show on day D" (`due_on`,
  `completed_on`, `completed_display`). Each card's key is task + day,
  because one task can show on two days (§7).

**Add/edit dialog:**
- Title;
- Notes;
- Assign to (Brewery members, or "Anyone");
- Day, or **No day (Future)**. A task added from the Future list starts
  with No day.

The dialog is reached from "+ Add a task" or from the task menu. It also
has Delete (with a confirm).

**Moving tasks:**
- Drag with the shared layer (§3.7): within a day, to another day in the
  range, out of the Unfinished card, or on and off the Future list.
- From the task menu: **Change day…**, which reaches any day in or out of
  the range or the Future list, plus **Move up** and **Move down**.

**Filter:** All / **My tasks** / Unassigned. The filter applies to the
Unfinished card and the Future list too. The brewhouse tablet shows All
only.

**Change log:**
- Brewery managers and owners can open History from the board's ⋮ menu.
- It's a newest-first list of the §3.1 log entries, with who, when, what,
  and old → new.
- It can be filtered to one task, from that task's dialog.

**Freshness:** the board refetches when the window regains focus and every
60 seconds while it's open. After a move or edit, the change shows at once
and is undone with an error toast if the server rejects it.

**Brewery Dashboard (`/brewery`): Today's tasks card**
- "Daily 2/4", with the unticked items named.
- Today's open tasks, first five, assignee initials, "+N more".
- "N unfinished from earlier days" when there are any.
- Check boxes work here too, and the title links to the board.

**Notification settings:** the new "Unfinished tasks before shift end"
toggle appears on Profile → Notifications, for Brewery members only.

### 3.9 Test support

- DEV reseed adds sample data so every part of the board has content:
  - two weeks of sample tasks (vessel-style titles, some assigned, some
    completed, two open on past days);
  - partly ticked Daily cards;
  - Brewery shifts and an event;
  - a staff code for `brewer1`;
  - a `breweryDevice` persona (a Brewery shared device).
- **Unit tests for the shared drag layer:**
  - keyboard moves within and between lists;
  - `onMove` gets the right `beforeId`;
  - the old order comes back when a move is rejected.
- **Unit tests for the new recurrence rules:**
  - day 31 in short months;
  - Feb 29 annual;
  - quarterly anchored to the start month;
  - every-other-week;
  - ends on a date and after N times;
  - the daily top-up being idempotent;
  - D32's existing recurrence tests still pass.
- **API tests for the reminder:**
  - timing (before, at, and after the 60-minute point);
  - what's listed;
  - nothing is sent when nothing is open;
  - one per shift, even if the scan reruns or the shift is edited;
  - a shift under an hour gets nothing;
  - the user's opt-out is respected.
- **Playwright:**
  - add, complete and assign a task;
  - reorder within a day and move across days (mouse and keyboard);
  - every task-menu action (edit, notes, complete, change day, move
    up/down, delete) and the Hide completed toggle;
  - Move all to today;
  - recurring tasks: create each frequency, edit "just this one" and "this
    and following", move one occurrence, Stop repeating;
  - Daily ticks and edits to the Daily items;
  - change the range;
  - the dashboard card;
  - the brewhouse tablet with a staff code.
- **Playwright conventions** (`three_environment_workflow.md` §6):
  - specs go in `tests/regression/brewery/`, one file per scenario group
    in §4;
  - each declares its persona with `storageState`. `breweryDevice` is
    added to `tests/config/test-env.ts` and `auth.setup.ts` the same way
    as `taproomDevice`;
  - **negative specs** as well as positive ones: S11, S30, S39, S41, S45,
    S47 (no History or Edit Daily items for `brewer1`, `bartender1`
    redirected home, 403s);
  - `data-testid` on the board, columns, cards, task menu, dialogs and
    Daily checks, added in the same PR;
  - tasks a spec creates are titled `[TEST-TEMP] …` and cleaned up;
    every write is checked after a reload;
  - `tests/COVERAGE.md` gets a D38 section mapping each scenario to its
    layer. S9e, S15 (touch drag) and S32–S37a (real push timing) are
    manual-only, with the scanner logic covered by ExUnit.
- **Known LIMITATIONS for the DEV handoff** (local can't show these):
  - touch drag on real Android hardware;
  - push delivery and the scanner timing on a Fly machine;
  - the new `@dnd-kit` dependency in the release build. Run `pnpm audit
    --prod` and `check-bundle-versions.mjs` after the DEV deploy;
  - the new migrations at boot on the DEV volume. They're forward-only.
- **By hand during the DEV pass:**
  - touch drag on the Pixel (and a Samsung tablet if available);
  - a real push reminder on the Pixel.

### 3.10 Recurring tasks (Matt)

**Rules**

| Repeat | Options | Example |
|---|---|---|
| **Weekly** | one or more weekdays; every 1–4 weeks | "Keg Wash, every Wed"; "CIP brite tanks, every other Mon & Thu" |
| **Monthly** | day N of the month, or the 1st–4th/last weekday | "Inventory, on the 1st"; "Glycol check, last Friday" |
| **Quarterly** | the same choices, every 3 months from the start month | "Calibrate pH meter, 15th of Jan/Apr/Jul/Oct" |
| **Annually** | the start date's month and day each year | "TTB permit renewal, every Mar 1" |

- Every rule can end **never**, **on a date** or **after N times**.
- The date rules extend D32's `Recurrence` module (`monthly` by day,
  quarterly as monthly × 3, annually). The existing weekly and nth-weekday
  rules are reused, not rewritten. D32's events keep working unchanged.

**Occurrences**
- Each occurrence is an **ordinary task** on its day. It shows on the board
  with a ↻ icon and can be:
  - finished (with the "where should it show" dialog when it's not on
    today);
  - dragged, or moved with Change day… or to the Future list;
  - assigned or deleted on its own.
- **Occurrences always exist 12 months ahead.** Unlike D32's Extend button,
  the D22 scanner tops up each open-ended series once a day, so a
  recurring task never runs out. Annual tasks have next year's occurrence
  as soon as this year's is created.
- **Missed occurrences stay where they are** and go on the Unfinished card,
  like any task (Matt, Q19). So "Keg Wash" missed three Wednesdays
  in a row shows three times.
- Occurrences are included in the shift-end reminder, the dashboard card
  and the open-task counts, the same as one-off tasks.

**Creating one**
- The add/edit dialog has a **Repeat** field: Never (the default), Weekly,
  Monthly, Quarterly, Annually.
- Choosing one shows that rule's options, with defaults taken from the
  task's day. A task on a Wednesday defaults to "Weekly on Wed", "Monthly
  on the 14th", and so on.
- **Ends:** Never / On \<date\> / After N times.
- A summary line reads back the rule: "Repeats every other week on Mon and
  Thu, until Mar 31".
- **No day (Future)** and Repeat can't be combined. A recurring task needs
  a start day, so Repeat is disabled until a day is picked.

**Changing one**
- Editing an occurrence's title, notes, assignee or rule asks **"Just this
  one"** or **"This and all following"**, as D32 events do.
  - **Just this one** changes only that occurrence, and marks it as an
    exception.
  - **This and all following** splits the series at this occurrence, so
    earlier ones are untouched, and applies the change to every later
    occurrence that's still open and hasn't been changed on its own.
    Changing the rule (say weekly → monthly) removes those later open
    occurrences and makes the new ones.
  - Finished occurrences never change.
- Dragging or moving one occurrence never asks. It moves only that one,
  which becomes an exception. Its original date stays skipped, so the rule
  doesn't put a second copy there.
- **Task menu** for an occurrence adds:
  - **Edit series…**: the edit dialog, already set to "This and all
    following";
  - **Stop repeating**: ends the series after this occurrence. Later open
    occurrences are removed, after a confirm that says how many.
- **Delete** on an occurrence asks "Just this one" or "This and all
  following".

**Who:** any Brewery member or owner, the same as other tasks. On the
brewhouse tablet, a staff code is needed.

### Non-functional

- One request loads the range (tasks, headers, Daily cards, Unfinished,
  Future list). The
  page is usable on a phone at 360px wide.
- The shared drag layer has no Brewery-specific code in it.
- The reminder job adds one query per scan when no shift is due.
- Every write is checked by `Authz`; the parity and boundary tests stay
  green.
- Dates are Colorado dates throughout (no off-by-one across UTC midnight).

## 4. Persona scenarios

**Board and header**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S1 | `brewer1` | Brewery → Tasks | `brewer1` has a published 7a–3p Brewer shift today | 14 days from today in two rows. Today's header: "\<brewer1\> · Brewer · 7:00a–3:00p · 8h". No notes or time off shown. |
| S2 | `brewer1` | Tasks | a day in range has no published Brewery shifts | That day's header: "No brewers scheduled". Its Daily card is still there. |
| S3 | `breweryMgr` | Scheduler → add a **draft** Brewery shift for `brewer2` tomorrow, then Tasks | | Tomorrow's header doesn't show it, for the manager too. After Publish week it does. |
| S4 | `brewer1` | Tasks | a published all-day Brewery event "GABF Awards" and a Taproom event on the same day | That day's header shows "GABF Awards · All day". The Taproom event isn't shown. |
| S5 | `brewer1` | Tasks | `brewer2` has approved time off tomorrow | Nothing about it in tomorrow's header. |

**Tasks**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S6 | `brewer1` | today → + Add a task "Package FV6", no assignee | | Added at the bottom of today. After a reload it's still there, unassigned. |
| S7 | `brewer2` | Edit "Package FV6" → Assign to `brewer1` | | Card shows `brewer1`'s initials. "My tasks" for `brewer1` shows it; for `brewer2` it doesn't. `brewer1` gets **no** notification. |
| S8 | `brewer2` | check "Package FV6" | it's on today | No dialog. Struck through with "✓ \<brewer2\>". Unchecking clears it. |
| S8a | `brewer1` | Unfinished card → check "Carb FV3" (planned Mon 10/12, today Wed 10/14) | | The dialog asks where it should show. **On today** → it leaves the Unfinished card and shows on today, after today's own tasks, with "planned Mon 10/12". Mon 10/12 no longer shows it. History: "completed (shown on Wed 10/14)". |
| S8b | `brewer1` | same, choose **On both days** | | Mon 10/12 shows it in place with "done Wed 10/14", and today shows it with "planned Mon 10/12". Neither copy can be dragged. |
| S8c | `brewer1` | same, choose **On Mon 10/12** | | It shows only on Mon 10/12, done. Today doesn't show it. |
| S8d | `brewer1` | uncheck the S8b task from today's column → confirm | | It disappears from today, is open again on Mon 10/12 with the amber edge, and is back on the Unfinished card. |
| S8e | `brewer1` | Cancel in the dialog | | The task stays open. Nothing logged. |
| S8g | `brewer1` | check "Package Pils FV3" (planned Fri 10/16) on Wed 10/14 | | The same dialog: "Planned for Fri 10/16, finished today (Wed 10/14)". **On today** → it shows on today with "planned Fri 10/16", and Friday no longer shows it. |
| S8f | `brewer1` | `POST …/complete` with no `display` on a past-day task | | 422 `display_required`. |
| S9 | `brewer2` | tap a task → Delete → confirm | | Gone after a reload. |
| S9a | `brewer1` | tap "Keg Wash" (no notes) | phone width | A sheet opens with Edit, **Add notes**, Mark completed, Change day…, Move up, Move down, Delete. Add notes → the dialog opens with the cursor in Notes. After saving, the card shows the notes icon, and the menu now says **Edit notes**. |
| S9b | `brewer1` | tap a task → Change day… → a date 6 weeks out | | It's gone from the range. Setting the range to that day shows it at the bottom of that day. |
| S9c | `brewer1` | tap a task → Mark completed | it's on yesterday | The "where should it show" dialog appears, as with the checkbox. |
| S9d | `brewer1` | tap a finished task shown on the day it was done | | Change day, Move up and Move down are greyed out with "Mark not done first to move it". |
| S9e | `brewer1` | long-press a task on the Pixel | | It starts a drag. The menu doesn't open. A short tap opens the menu. |
| S9f | `brewer1` | turn on **Hide completed**, reload | | Finished tasks are hidden on every day, and the toggle is still on after the reload. Turning it off shows them again. |
| S9g | `breweryDevice` | tap a task → Mark completed | no active code | The menu opens without a code. Mark completed asks for one. |
| S10 | `breweryMgr` | ⋮ → History | after S6–S9 | Added, assigned, completed, uncompleted and deleted entries, with who and when. |
| S11 | `brewer1` | ⋮ menu | | No History entry. `GET` on the change-log API returns 403. |
| S12 | `brewer1` | drag today's 3rd task to the top of today | mouse | Order persists after a reload, for `brewer2` too. |
| S13 | `brewer1` | drag a task from today to day 9 (second row) between two tasks | mouse | It lands there. Both days' counts update. |
| S14 | `brewer1` | keyboard: focus a task, Space, arrows to another day, Space | | Same result as a mouse drag. Escape mid-move puts it back. |
| S15 | `brewer1` | Pixel, phone width | | One day at a time. Long-press drag reorders; a normal swipe scrolls instead of dragging. Swipe/arrows change day. |
| S16 | `brewer1` + `brewer2` | both move the same task at once | | Both succeed; the last move wins, and both screens agree within a minute. |
| S17 | `brewer1` | Add with an empty title, or 201 characters | | Inline error. Nothing saved. |

**Unfinished card and range**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S18 | `brewer1` | Tasks | two open tasks from 3 days ago, one completed task from yesterday, yesterday's Daily 3/4 | The Unfinished card is first and lists the two open tasks with their dates. The completed task and the Daily checks aren't listed. |
| S19 | `brewer1` | Unfinished card → drag one task onto day 2 | | It leaves the card and lands on day 2. |
| S20 | `brewer1` | Unfinished → **Move all to today** | 3 open past tasks, today has 2 tasks | Confirm "Move 3 unfinished tasks to today?". Today now has 5 tasks: its own 2 first, then the 3 oldest-first. The Unfinished card disappears. Change log: 3 moves. |
| S21 | `brewer1` | Tasks | no open tasks before today | No Unfinished card. |
| S22 | `brewer1` | range selector → From 10/1, To 10/10 (all past) | open tasks on 10/3 | The 10/3 column shows them with an amber edge. The Unfinished card still lists them. Previous/Next move by 10 days. Today returns to 14 days from today. |
| S23 | `brewer1` | range selector → 40 days apart | | "Up to 31 days". Not applied. |
| S23a | `brewer1` | toggle **1 week**, reload; then Today | default was 2 weeks | 7 days from today in one row. After a reload, and after Today, it's still 1 week. Another browser still opens on 2 weeks. |
| S23b | `brewer1` | 1 week default → range selector 10/1–10/20 | | 20 days shown, neither toggle side highlighted. Today goes back to 7 days from today. Picking 2 weeks shows 14 days from 10/1 and makes 2 weeks the default. |

**Future list**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S23c | `brewer1` | Future list → + Add a task "Gas order and Tanks Out" | | Added to the Future list, at the bottom, with no date. It's still there after a reload and after changing the range. |
| S23d | `brewer1` | drag "Gas order" from the Future list onto Thursday between two tasks | | It's on Thursday there, and gone from the Future list. |
| S23e | `brewer1` | drag a Tuesday task onto the Future list, between two tasks | | It's on the Future list there, and gone from Tuesday. History: "moved Tue 10/13 → Future". |
| S23f | `brewer1` | tap a Future task → Change day… → pick a date 5 weeks out; tap a dated task → Change day… → **Move to Future** | | The first goes to the bottom of that day, the second to the bottom of the Future list. |
| S23g | `brewer1` | check a Future task | | No dialog. It shows done on today with "from Future", and it's gone from the Future list. Mark not done puts it back at the bottom of the Future list. |
| S23h | `brewer1` | Tasks | 3 open Future tasks, no open past tasks | No Unfinished card. The Future list shows 3. Move all to today isn't offered. The shift-end reminder doesn't list them. |
| S23i | `brewer1` | Tasks | Future list empty | The Future list still shows, with "Nothing here. Drag a task here or add one." |
| S23j | `brewer1` | phone width → day strip → **Future** | | The Future list, with its + Add a task. |

**Daily card**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S24 | `brewer1` | today's Daily card → tick Temps, Pressures | | "Daily 2/4", with "✓ Temps — Jake, time" (first name, as on task cards; DEV QA G2). `brewer2` sees the same after a reload. Unticking Temps → "Daily 1/4". |
| S25 | `brewer1` | tomorrow's Daily card | | The checks are shown but disabled. `PUT …/daily_checks/<tomorrow>/<id>` returns 422. |
| S26 | `brewer1` | yesterday's Daily card | 3 of 4 ticked | "Daily 3/4" in amber. Ticking the 4th is still allowed. |
| S27 | `brewer1` | try to drag a Daily card | | It doesn't move. |
| S28 | `breweryMgr` | ⋮ → Edit Daily items → add "DO", drag it first, rename "Temps" → "Temperatures" | | Today shows "Daily 0/5" with DO first. Past days show "Temperatures" and keep their counts out of 4. |
| S29 | `breweryMgr` | Edit Daily items → retire "Backups" | Backups ticked yesterday | Today shows 3 items. Yesterday still shows "✓ Backups". |
| S30 | `brewer1` | board ⋮ menu; the Daily items API | | No Edit Daily items. `POST /api/brewery/daily_items` returns 403. |
| S31 | `breweryMgr` | add a 13th active item; add a duplicate name | | "Up to 12 items"; "Already on the list". |

**Shift-end reminder**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S32 | `brewer1` | shift 7a–3p today | at 2:00p: 2 open tasks assigned to `brewer1`, 1 open unassigned, 1 open assigned to `brewer2`, Daily 2/4 | Between 2:00 and 2:05 one push: "Still open today: 4 tasks, Daily 2/4". It lists `brewer1`'s two first, then the unassigned one, then `brewer2`'s (with initials). The bell has the same entry. Tapping it opens Tasks on today. |
| S33 | `brewer1` | same | everything done by 2:00p | No notification. |
| S34 | `brewer1` | same | after S32, the manager extends the shift to 4p | No second reminder. |
| S35 | `brewer1` | Profile → Notifications → turn off "Unfinished tasks before shift end" | | No reminder at the next shift end. |
| S36 | `brewer2` | a 45-minute shift | open tasks | No reminder. |
| S37 | `bartender1` | Taproom shift ending | | Nothing new. The toggle isn't in their settings. |
| S37a | `brewer2` | two shifts today, 6a–10a and 2p–6p | open tasks at 9:00a and at 5:00p | One reminder around 9:00a and another around 5:00p, each listing what's open at the time. |

**Access and the brewhouse tablet**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S38 | `floater` | Tasks | Brewery + Taproom member | Same access as `brewer1`. |
| S39 | `bartender1` / `office1` | typed `/brewery/tasks`, and the API | not Brewery | No nav entry. The URL goes to Home. Every D38 API returns 403. |
| S40 | `owner` | Tasks, History, Edit Daily items | no memberships | Full access. |
| S41 | `taproomDevice` | `GET /api/brewery/tasks` | | 403. |
| S42 | `breweryDevice` | opens after pairing | | Brewery → Tasks. No History, no Edit Daily items, no "My tasks". |
| S43 | `breweryDevice` | tick Temps today → `brewer1`'s code | | Ticked. "Acting as \<brewer1\>" banner. A second tick within 5 minutes needs no code. `breweryMgr`'s History: "\<brewer1\> on Shared Device · ticked Temps". |
| S44 | `breweryDevice` | add a task, wait 5 idle minutes, add another | | The second add asks for a code again. |
| S45 | `breweryDevice` | `bartender1`'s code | `bartender1` has a Taproom code, isn't Brewery | Treated as a wrong code. |
| S46 | `breweryDevice` | wrong code ×5 | | Locked for 10 minutes, as D37 S9. |
| S47 | `breweryDevice` | `POST /api/brewery/tasks` with no `staff_code` | | 422 `staff_code_required`. |
| S48 | `breweryMgr` | Users & Roles → edit `brewer2` → Staff code | | Can set and reveal it, as D37 S1. |
| S49 | `breweryMgr` | Users & Roles → remove `brewer2` from the Brewery | `brewer2` assigned to an open task and a completed one, ticked a Daily check, has a code | The open task becomes unassigned. The completed one and the Daily check still show \<brewer2\>. The code is cleared. |

**Dashboard and time zone**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S50 | `brewer1` | Brewery Dashboard | 7 open tasks today, Daily 2/4, 1 unfinished | Today's tasks card: "Daily 2/4" with the two unticked names, the first 5 tasks, "+2 more", "1 unfinished from earlier days". Ticking one there updates the board. |
| S51 | `brewer1` | Tasks at 11:30 pm Colorado time | | Today is the Colorado day: the range starts on it, new tasks default to it, and its Daily card is the tickable "today". |

**Recurring tasks**

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S52 | `brewer1` | Wed → + Add a task "Keg Wash", Repeat **Weekly** (Wed preselected), Ends Never | | "Repeats every week on Wed". Every Wednesday in the range shows "Keg Wash ↻". Setting the range 11 months out still shows it. |
| S53 | `brewer1` | Add "CIP brite tanks", Weekly, Mon + Thu, every **2** weeks | | It shows on Mon and Thu of every other week, starting this week. |
| S54 | `brewer1` | Add "Inventory" on Oct 31, **Monthly** on day 31 | | Nov 30, Dec 31, Feb 28 (29 in a leap year), and so on. |
| S55 | `brewer1` | Add "Glycol check", Monthly, **last Friday** | | The last Friday of each month. |
| S56 | `breweryMgr` | Add "Calibrate pH meter" on Oct 15, **Quarterly**, day 15 | | Oct 15, Jan 15, Apr 15, Jul 15. |
| S57 | `breweryMgr` | Add "TTB permit renewal" on Mar 1, **Annually**, After 3 times | | Mar 1 for three years, then nothing. |
| S58 | `brewer1` | check this week's "Keg Wash" | | Only this week's is done. Next week's is still open. |
| S59 | `brewer1` | drag this week's "Keg Wash" from Wed to Thu | | It's on Thursday. Wednesday has no second copy. Next week's is still on Wednesday. |
| S60 | `brewer1` | edit next week's "Keg Wash" → title "Keg Wash + sanitize" → **Just this one** | | Only that week changes. |
| S61 | `brewer1` | edit a "Keg Wash" occurrence 3 weeks out → assign `brewer2` → **This and all following** | the S60 change and the S59 move exist | Earlier occurrences are unchanged. From that week on, open ones are assigned to `brewer2`. The S60 one-off keeps its own title. |
| S62 | `brewer1` | edit a "Keg Wash" occurrence → Repeat Weekly on Wed → Monthly, first Wed → This and all following | | Later open weekly occurrences are gone. First-Wednesday occurrences replace them. Earlier ones and finished ones are untouched. |
| S63 | `brewer1` | a "Keg Wash" occurrence → **Stop repeating** | 40 later open occurrences | The confirm says "Removes 40 later occurrences". After it, there are none past this one. |
| S64 | `brewer1` | Delete one occurrence → **Just this one** | | Gone. The rule doesn't put it back the next day. |
| S65 | `brewer1` | Tasks | "Keg Wash" not done for the last 3 Wednesdays | The Unfinished card lists 3 "Keg Wash" occurrences with their dates. Move all to today moves all 3. |
| S66 | — | daily scan | an open-ended weekly series generated 12 months ahead, a day later | One more week is generated. Running the scan twice makes no duplicates. |
| S67 | `brewer1` | Add with Day = No day (Future) | | Repeat is disabled, with "Pick a day to repeat". |
| S68 | `breweryDevice` | create a recurring task | no active code | Asks for a staff code. History: "\<name\> on Shared Device · created recurring task". |
| S69 | `brewer1` | Edit an occurrence → change only the notes | | Asked "Just this one" or "This and all following", like D32 events. |

## 5. Out of Scope

- **Moving the Scheduler grid's drag (D13) onto the shared layer.** File it
  as a follow-up task once D38 ships.
- **Other checklists, comments, attachments, labels** on tasks. D38 has a
  notes field only.
- **Daily or custom repeat rules** (every N days, or "weekdays only"). The
  Daily card covers everyday checks. Recurring tasks are weekly, monthly,
  quarterly or annually.
- **Rolling up missed occurrences** (only keeping the latest). Matt, Q19: each one stays.
- **More repeat rules** ("every 2 months", "the 2nd Saturday of June"). Matt, Q20: not needed for now.
- **Multi-day tasks and dependencies** (Matt's planned future workflow).
  §7 notes what D38 does now so they fit later.
- **Links to tanks/batches.** Rockcut has no vessel (FV) table yet, so
  "FV3" stays plain text in the title. Daily checks are ticks, not
  recorded readings.
- **Other notifications:** assignment (Matt: no), overdue tasks, or email
  for the shift-end reminder.
- **Importing the Trello board.** The brewers retype the current weeks; the
  board is short-lived.
- Task boards for other departments (the `department_id` column allows it
  later). Decided 2026-10-12: one board per department, built after D39
  and before D40 (see "Delivery split").
- **Bringing back a retired Daily item** in D38. Re-adding the name makes
  a new item; the old one's past ticks stay with it, and a day where the
  old one was ticked shows both rows (DEV QA G3). In D38 the API refuses
  `active: true` on a retired item. **Moved to D39** (Matt, 2026-10-12):
  managers can un-retire an item from Edit Daily items (a "Retired" section
  with Restore), it returns at the bottom of the list with its past ticks,
  and it counts against the 12-item limit and name uniqueness.
  Also moved to D39 from the D38 DEV QA pass 2 (Matt, 2026-10-12,
  `stepwise_results/d38_dev_qa2_report.md`):
  - any `PATCH` on a retired item (name, `active: false`, `position`)
    answers 422 `retired`, not 404 "Not found" (GAP-1) or a silent 200
    (GAP-2);
  - saving a stale Edit dialog for a task someone deleted says the task was
    deleted, not "Not found" (O-1);
  - the Edit Daily items dialog refreshes its own list with the board
    (O-2);
  - unticking a retired item ticked today can be undone that day, or is
    refused (decide when planning D39) (O-3).

## 6. Questions

- [x] **Q1: layout** → two weeks, starting today, with a date range selector.
- [x] **Q2: header detail** → name · position · time · hours. No shift notes.
- [x] **Q2b: time off** → not shown.
- [x] **Q3: draft shifts** → hidden, for everyone.
- [x] **Q4: Daily card** → every day: Backups, Gravities, Temps, Pressures.
  (Recurring tasks were added later; see Q19 and §3.10.)
- [x] **Q5: unfinished tasks** → they stay on their day. An Unfinished card at
  the start of the calendar lists them, with Move all to today.
- [x] **Q6: assignment notifications** → no. (A shift-end reminder was added
  instead; see §3.5.)
- [x] **Q7: drag** → a shared, app-wide drag layer (`@dnd-kit`).
- [x] **Q8: brewery tablet** → yes, it shows the board.
- [x] **Q9: delete and history** → any brewer can delete; the change log is for
  managers and owners.
- [x] **Q10: Brewery Dashboard** → yes, a Today's tasks card.
- [x] **Q11: Daily items** → managers (and owners) can change them in the app.
- [x] **Q12: missed Daily checks** → not on the Unfinished card.
- [x] **Q13: Daily on days off** → shown every day.
- [x] **Q14: future Daily ticks** → blocked.
- [x] **Q15: tablet writes** → staff codes as in D37; one code covers 5
  minutes of activity.
- [x] **Q16: what the reminder lists** → every open task that day, whoever
  it's assigned to, plus unticked Daily checks.
- [x] **Q17: two shifts in a day** → a reminder before each shift ends.
- [x] **Q18: finishing early** → yes, the dialog appears for early finishes
  too.
- [x] **Q19: missed recurring tasks** → each missed occurrence stays on the
  Unfinished card (Matt, 2026-10-11). The original question:
  If "Keg Wash" is missed three weeks
  running, should all three stay on the Unfinished card (proposed: it's
  honest and Move all handles it)? Or should a missed occurrence be cleared
  automatically when the next one arrives, so only the latest shows?
- [x] **Q20: rule options** → enough for now (Matt, 2026-10-11). The
  original question:
  Are these enough: weekly every 1–4 weeks on
  chosen days; monthly by date or nth weekday; quarterly; annually by
  date? Or is something like "every 2 months" or "annually on the 2nd
  Saturday of June" needed?

## 7. Future: multi-day tasks with dependencies (not built in D38)

Matt plans a later workflow with **multi-day tasks** ("Ferment FV3,
10/12–10/26") that **depend on other tasks** ("Crash" can't start until
"D test" is done). D38 doesn't build any of it. It also doesn't need a
different structure for it, because the later work is additive:

- **Recurring tasks** (§3.10) don't change this. An occurrence is an
  ordinary task, so it can later have a span or dependencies like any
  other. A dependency between two recurring series ("Crash after D test,
  each week") would be a later rule on the series.
- **Dependencies** would be a new join table (`task_id`,
  `depends_on_task_id`). No D38 table changes.
- **Multi-day spans** would add an end date to a task (`due_on` becomes its
  start). Per-day ordering would move to a small "placement" table (task,
  day, position). That's a straightforward data migration from D38's
  `due_on` + `position`.

D38 follows three rules so that later work slots in:

1. **A task can be on no day, one day, or show on two.** The Future list
   and the "Both days" choice in §3.8 already need this. Cards are keyed by
   task + day (or task + Future), never by task alone. Later, a multi-day
   task is one more case of the same thing, and a Future task is simply a
   task with no placement.
2. **One server function decides what shows on a day.** The API and UI
   never filter on `due_on` directly. Multi-day spans later change that one
   function.
3. **The drag layer stays generic** (§3.7). Stretching a span or drawing a
   dependency arrow can be added to it without touching the board's own
   code.

The places that will need new rules then are the Unfinished card (a task
past its end date), Move all to today, and the shift-end reminder. None of
them change shape now.
