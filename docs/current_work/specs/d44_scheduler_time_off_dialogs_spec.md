# D44: Time off from the Scheduler — Spec

**Status:** DRAFT, scope only (Matt, 2026-10-14)
**Backlog:** none yet
**Concept:** 07_scheduling
**Split from:** D43 (UI tweaks): new behavior, so outside D43's scope rule

---

## 1. What changes

| # | Item | Source | Where |
|---|---|---|---|
| 1 | Clicking **approved** time off in the Scheduler's week grid opens a dialog with its details | Matt, 2026-10-14 | UI |
| 2 | Clicking **pending** time off opens a dialog with the request and its notes, and **Approve** / **Deny** | Matt, 2026-10-14 | UI |
| 0 | **Do this first: split `Schedule.tsx`** (625 lines; both routes render it with `forceView`) into `ViewSchedule.tsx` (`/schedule`) and `Scheduler.tsx` (`/scheduler`). The shared loading (shifts, events, time off, availability, conflicts) moves into one hook, and the shift and event dialogs stay shared. It's a refactor with no behavior change: the existing Scheduler and View Schedule Playwright specs must pass unchanged. It also replaces task 4707's interim `key` fix. | Matt, 2026-10-22 (from task 4707) | UI |

No new API. The dialogs use D25's endpoints: `GET /api/time_off` (the
Scheduler already loads the week's requests, every status),
`POST /api/time_off/:id/review` with `status: approved | denied`, and
`POST /api/time_off/:id/cancel`. No migration, secrets or dependencies.

## 2. Behavior (first pass; to settle before planning)

### 2.1 Approved time off (item 1)

Shows: the person, type (PTO / Sick / Unpaid / Personal), dates and times
(or "All day"), their note, "Approved by …" and when. Read-only by default.

### 2.2 Pending time off (item 2)

Shows: the person, type, dates and times, their note, when it was
requested. **Approve** and **Deny** for anyone who may review it; others see
it read-only. On success the grid's chip updates (pending amber → approved,
or gone when denied) and conflict warnings refresh.

### 2.3 Rules carried over from D25 (the Time off page)

- Who may review: the same `Authz` decision the Time off page uses
  (managers of the person's departments, owners); the API is the authority,
  so the dialog only hides buttons the API would refuse.
- A manager may approve their own request (D25).
- Removing **approved** time off goes through the existing confirm step
  ("Remove approved time off?").
- Notifications: whatever review sends today, unchanged.

## 3. Open questions (deferred: Matt, 2026-10-14, "skip questions on d44 for now")

- **Q1.** Should the approved dialog also offer **Remove** (deny an approved
  request, with the confirm step), or stay read-only and link to the Time off
  page?
- **Q2.** A reviewer note: `time_off_requests.reviewer_note` exists but the
  review call doesn't send one today. Add a note field to Deny (and Approve)?
  That would be an API change (accept and store the note), and the employee
  would need to see it.
- **Q3.** View Schedule's week view and the agenda: same dialog there, or
  Scheduler only?
- **Q4.** Shared tablets: time off is hidden from devices today; keep it so.

## 4. Persona scenarios (to write)

Brewery manager approves a brewer's pending PTO from the grid; bartender
(no review rights) opens a teammate's approved time off and sees no buttons;
owner denies a pending request; manager approves their own request; manager
of another department can't review; the chip and conflict banner update
without a reload.
