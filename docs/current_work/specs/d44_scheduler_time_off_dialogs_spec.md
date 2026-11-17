# D44: Time off: Scheduler dialogs, archive, notifications — Spec

**Status:** DRAFT (Matt, 2026-10-14; scope widened and Q1–Q8 answered 2026-11-16)
**Backlog:** none yet
**Concept:** 07_scheduling
**Split from:** D43 (UI tweaks): new behavior, so outside D43's scope rule

---

## 1. What changes

| # | Item | Source | Where |
|---|---|---|---|
| 1 | Clicking **approved** time off in the Scheduler's week grid (and View Schedule's agenda, item 7) opens a dialog with its details, and **Remove** for reviewers (Q1) | Matt, 2026-10-14 / 2026-11-16 | UI |
| 2 | Clicking **pending** time off opens a dialog with the request and its notes, and **Approve** / **Deny** with an optional note to the employee (Q2) | Matt, 2026-10-14 / 2026-11-16 | UI |
| 3 | The **Time off** page shows only current and future time off; requests whose last day off has passed move to an **Archive** list | Matt, 2026-11-16 | UI + API filter (§2.4) |
| 4 | Everyone who could approve a new time off request gets a **notification** of it | Matt, 2026-11-16 | API (§2.5) |
| 5 | A **badge** on the Schedule nav icon and the Time off icon: for someone with a pending request of their own, and for anyone who could approve a pending request | Matt, 2026-11-16 | API + UI (§2.6) |
| 6 | The employee is **notified** when their request is approved or denied (Q8) | Matt, 2026-11-16 | API (§2.7) |
| 7 | **View Schedule's agenda** shows time off in each day's list (it shows none today), opening the item 1–2 dialogs (Q3) | Matt, 2026-11-16 | UI (§2.8) |
| 0 | ~~**Do this first: split `Schedule.tsx`**~~ **Done in D52** (`ViewSchedule.tsx`, `Scheduler.tsx`, `useScheduleData.tsx`). (625 lines; both routes render it with `forceView`) into `ViewSchedule.tsx` (`/schedule`) and `Scheduler.tsx` (`/scheduler`). The shared loading (shifts, events, time off, availability, conflicts) moves into one hook, and the shift and event dialogs stay shared. It's a refactor with no behavior change: the existing Scheduler and View Schedule Playwright specs must pass unchanged. It also replaces task 4707's interim `key` fix. | Matt, 2026-10-22 (from task 4707) | UI |

Items 1–2 need no new API. The dialogs use D25's endpoints: `GET /api/time_off` (the
Scheduler already loads the week's requests, every status),
`POST /api/time_off/:id/review` with `status: approved | denied` and
`reviewer_note` (already accepted, stored and returned; no screen sends or
shows it yet), and `POST /api/time_off/:id/cancel`. Item 3 adds a filter to
`GET /api/time_off` and refuses reviews of past requests (§2.4). Items 4 and
6 add notification events (§2.5, §2.7); item 5 adds a count to `/api/me`
(§2.6). Item 7 reuses the week's `GET /api/time_off` call the Scheduler
already makes (§2.8). No migration, secrets or dependencies.

## 2. Behavior (first pass; to settle before planning)

The dialogs open from time off in the Scheduler's week grid **and** from
the new time off rows in View Schedule's agenda (§2.8, Matt, Q3). Who sees
what follows today's visibility: `GET /api/time_off` returns a person's own
requests plus those of people they manage, so an employee only ever sees and
opens their own; teammates' time off isn't shown to them (unchanged).

### 2.1 Approved time off (item 1)

Shows: the person, type (PTO / Sick / Unpaid / Personal), dates and times
(or "All day"), their note, "Approved by …" and when, and the reviewer's
note if there is one.

**Remove** (Matt, Q1) for anyone who may review it: the existing confirm
step ("Remove approved time off?"), then the D25 deny-an-approved-request
call, with the optional note (§2.2). The chip goes and conflict warnings
refresh. Others see the dialog read-only. Past time off has no Remove
(§2.4).

### 2.2 Pending time off (item 2)

Shows: the person, type, dates and times, their note, when it was
requested. **Approve** and **Deny** for anyone who may review it; others see
it read-only. On success the grid's chip updates (pending amber → approved,
or gone when denied) and conflict warnings refresh.

- **Note to the employee (Matt, Q2):** an optional note box on Approve and
  on Deny (e.g. "Sorry, we're short that weekend"), sent as `reviewer_note`.
  The employee sees it on their request in My requests and in the Archive,
  and it's included in the §2.7 notification. The same box is added where
  reviews already happen on the Time off page.
- **Past and never reviewed:** a pending request whose last day has passed
  shows as "Not reviewed", read-only, with no Approve or Deny (§2.4).

### 2.3 Rules carried over from D25 (the Time off page)

- Who may review: the same `Authz` decision the Time off page uses
  (managers of the person's departments, owners); the API is the authority,
  so the dialog only hides buttons the API would refuse.
- A manager may approve their own request (D25).
- Removing **approved** time off goes through the existing confirm step
  ("Remove approved time off?").
- Notifications: today a review notifies no one; D44 adds §2.5 (reviewers
  told of a new request) and §2.7 (the employee told of the decision).

### 2.4 Time off page: current and future only, plus an Archive (item 3)

Today `/time_off` (`pages/timeoff/TimeOff.tsx`) lists every request the
person can see, back to the first one, in three sections: My requests,
Pending — other employees, Approved — other employees.

- **Current or future** = the request's last day off (the Colorado day of
  `ends_at`) is today or later. Time off that ends today still shows today
  and moves to the Archive the next day.
- All three sections show current or future requests only. Denied and
  cancelled requests stay visible in My requests (as today) until their last
  day passes, then move to the Archive (Matt, Q6).
- An **Archive** control on the page opens the past requests: a plain list,
  newest first, no filters for now (Matt, Q7), with the same visibility as
  today (own requests plus those of people the viewer manages).
- Archive rows are read-only: no cancel, approve or deny.
- **Never reviewed (Matt, Q5):** a pending request whose last day passes
  without a review moves to the Archive and stops being pending: it leaves
  the Pending list, shows in the Archive as "Not reviewed", and can't be
  approved or denied afterwards (the API refuses a review of a past request).
  Nothing past its last day is left pending anywhere.
- The Scheduler and View Schedule are unaffected; they already load time off
  by week.
- **Loading:** the page doesn't fetch years of history to hide it.
  `GET /api/time_off?when=current` (ends on or after the start of today,
  Colorado) for the main view; `?when=past` for the Archive, loaded only when
  it's opened. No parameter keeps today's behavior, so the Scheduler's calls
  don't change.

### 2.5 Notify reviewers of a new request (item 4)

Today nobody is notified of a time off request: `RockcutApi.TimeOff` never
calls `Notifications`, so a manager only finds out by opening the page.

- A new event, `time_off_requested`, goes to **every person who could
  approve the request**: the same `Authz` decision as the review itself
  (managers of the requester's departments, and owners). One notification
  per person, even if they manage several of the requester's departments.
- The requester isn't notified of their own request, even when they could
  approve it themselves (a manager's own request still reaches the other
  managers and the owners).
- Not sent for time off a manager or owner enters on someone's behalf: that
  is created approved, so there's nothing to review.
- Content: who, type, dates and times (or "All day"), and their note.
  Opening it goes to the Time off page.
- Channels: the normal defaults (bell and email on, push opt-in), and it
  appears in Notification preferences like every other event (`@events` and
  the UI's `EVENTS` list stay in sync).
- Shared devices never receive it.

### 2.6 Pending badge on Schedule and Time off (item 5)

A red count badge, like the Messages and User change log badges, on the
**Schedule** section icon in the nav (collapsed rail included) and on the
**Time off** item inside it.

- **The count** is the number of pending, current or future requests (§2.4:
  last day today or later) that are either the person's own or ones they
  could approve. A request that is both (a manager's own) counts once.
- So an employee with a pending request sees 1 until it's approved, denied
  or cancelled, or its last day passes; a manager sees every pending request
  they could act on.
- Never-reviewed requests past their last day don't count: they're archived
  and no longer pending (§2.4, Q5).
- No badge at zero, and none on shared devices (they have no Time off page).
- **Source:** a `pending_time_off` count in `/api/me`'s capabilities, worked
  out by the server with the same `Authz` rule, as `pending_owner_reviews`
  already is for the change log. The UI refreshes it after any create,
  review or cancel, and whenever `/api/me` reloads.

### 2.7 Notify the employee of the decision (item 6)

Matt, Q8: today nothing tells the employee their request was decided.

- A new event, `time_off_reviewed`, goes to the requester when their request
  is **approved** or **denied**, including an approved request later
  removed (§2.1).
- Content: approved or denied, type and dates, who decided, and the
  reviewer's note if any (§2.2). Opening it goes to the Time off page.
- Not sent when someone approves their own request (a manager's own), or
  for time off entered on their behalf (created approved, nothing decided).
- Channels: the normal defaults (bell and email on, push opt-in), listed in
  Notification preferences like §2.5's event.

### 2.8 Time off in View Schedule's agenda (item 7)

Matt, Q3 (2026-11-16): View Schedule (`/schedule`, `ViewSchedule.tsx`) is a
day-by-day list of shifts and events and shows no time off for anyone today;
time off appears only in the Scheduler grid.

- Each day in the agenda gains a row for each **approved** or **pending**
  time off covering that day (pending styled as in the Scheduler: amber,
  "Pending"). Denied and cancelled requests aren't shown.
- Who appears: the same visibility as the Time off page and the Scheduler
  (`GET /api/time_off` for the week: own requests, plus the people a
  manager manages; owners everyone). An employee sees only their own.
- The row shows the person, type and "All day" or the times; multi-day time
  off shows on each of its days. Its place in the day: before the day's
  shifts, after its events.
- Clicking a row opens the item 1 or item 2 dialog, with the same buttons
  for the same people. After a review, cancel or Remove, the agenda
  refreshes with the Scheduler's queries.
- The agenda's existing filters (department, position) apply to time off
  as to shifts: a person shows when they belong to the filtered department;
  a position filter hides time off rows. Phone width as the agenda today.
- **Shared tablets (Matt, Q4):** unchanged; devices load no time off and
  the agenda shows none. `GET /api/time_off` stays refused for devices.

## 3. Open questions

All answered (Matt, 2026-11-16). Q1 → §2.1, Q2 → §2.2, Q3 → §2.8,
Q4 → §2.8 (tablets unchanged), Q5–Q7 → §2.4, Q8 → §2.7. Q3 and Q4 were
re-asked after the lead found View Schedule shows no time off today.

## 4. Persona scenarios (to write)

Brewery manager approves a brewer's pending PTO from the grid; bartender
(no review rights) opens a teammate's approved time off and sees no buttons;
owner denies a pending request; manager approves their own request; manager
of another department can't review; the chip and conflict banner update
without a reload. Time off page: an employee sees only current and later
requests, then opens the Archive and finds last month's PTO; time off ending
today still shows until tomorrow; a denied future request stays in My
requests until its last day passes; a pending request nobody reviewed shows
in the Archive as "Not reviewed" with no buttons, and the API refuses a
review of it; a manager's Archive shows their department's past requests but
not another department's. Notifications and badge: a bartender requests PTO
and both Taproom managers and every owner get a notification while a Brewery
manager doesn't; a manager's own request reaches the other managers and
owners but not themselves; time off entered on someone's behalf notifies
no one; the bartender sees a badge of 1 on Schedule and Time off until it's
approved; the approving manager's badge drops by one without a reload; a
request nobody reviewed stops counting the day after its last day.
Decisions and notes: a manager denies with a note and the bartender gets a
notification carrying it and sees it on their request; a manager removes
approved time off from the View Schedule dialog after the confirm step and
the employee is notified; a manager approving their own request gets no
decision notification. View Schedule: a bartender sees their own pending and
approved time off in the agenda but not a teammate's; the Taproom manager
sees the bartender's PTO on each of its days and approves it from the
agenda; a position filter hides time off rows; the Taproom tablet's agenda
shows no time off and a device calling `GET /api/time_off` gets 403.
