# D16: Time-Off Requests — Specification

**Status:** Approved (2026-09-21)
**Created:** 2026-09-21
**Author:** Matt + CC
**Depends On:** D10 (Authorization), D11–D15 (Scheduling)

---

## 1. Problem Statement

Staff need to request time off and managers need to approve it, so the schedule
reflects who's unavailable. D16 adds time-off requests with a **type** (PTO
options), a partial- or full-day range, an **approve/deny** workflow, and an
**"off" marker** on the week grid. No balance/accrual tracking.

---

## 2. Requirements

### Functional

- [ ] A user submits a **time-off request** for themselves: a **type**
      (`pto` = Vacation, `sick`, `unpaid`, `personal`), a range, and an optional
      note. Range is **all-day** (start date → end date) or **partial-day** (one
      day + start/end times).
- [ ] Status lifecycle: `pending → approved | denied`, plus `cancelled` (by the
      requester while pending).
- [ ] **Visibility:** users see their own requests; **managers** see requests
      from people in departments they manage; **owners** see all.
- [ ] **Approve/deny:** owners (any), or a **manager of a department the
      requester belongs to** — but a manager cannot review their **own** request
      (owners may). A reviewer note is optional.
- [ ] **Cancel:** the requester may cancel their own **pending** request.
- [ ] **Grid indicator:** approved time-off shows as an "Off" marker on the
      affected employee/day cells in the week grid.

### Non-Functional

- [ ] Times stored UTC; the frontend does Denver↔UTC (no server tz lib).
- [ ] Server enforces every authorization decision; reuses D10 authz.
- [ ] ExUnit covers create/list-visibility/review-authz/cancel.

---

## 3. Design

### Data model

```
time_off_requests
  id
  user_id        -> users (the requester, required)
  type           :string  (pto | sick | unpaid | personal)
  starts_at      :utc_datetime (required)
  ends_at        :utc_datetime (required, > starts_at)
  all_day        :boolean (default true)
  note           :text (nullable)         # requester's reason
  status         :string  (pending | approved | denied | cancelled, default pending)
  reviewed_by_id -> users (nullable)
  reviewer_note  :text (nullable)
  reviewed_at    :utc_datetime (nullable)
  timestamps
  index(user_id), index(status), index(starts_at)
```

New context `RockcutApi.TimeOff` with `RockcutApi.TimeOff.Request`.

### Authorization (`TimeOff` helpers)

- `can_view?(user, req)` → owner, or `req.user_id == user.id`, or user is a
  **manager** of a department the requester belongs to.
- `can_review?(user, req)` → owner; else the requester's-department manager **and**
  `user.id != req.user_id`.
- Create sets `user_id = current_user` (you request for yourself).
- Cancel: `req.user_id == user.id and status == "pending"`.
- `list_for(user)`: owner → all; else own requests + requests of users in the
  user's managed departments. Filters: `status`, `from`, `to` (range overlap).

### API

```
GET    /api/time_off                 # visible to caller; filters status/from/to
POST   /api/time_off                 # {type, all_day, starts_at, ends_at, note} (self)
POST   /api/time_off/:id/review      # {status: approved|denied, reviewer_note?}
POST   /api/time_off/:id/cancel      # requester, pending only
```

The frontend converts all-day (start/end dates → day bounds) and partial-day
(one day + times) into UTC `starts_at`/`ends_at`.

### Frontend

- **Time off** nav item for all users.
- **Request form:** type select, all-day toggle; all-day → start/end date;
  partial → day + start/end time (15-min steps); note.
- **My requests:** list with status; cancel a pending one.
- **Approvals** (managers/owners): pending requests from their people, with
  Approve / Deny (+ optional note).
- **Grid marker:** `WeekGrid` shows an "Off" chip on cells where the employee has
  approved time-off covering that Denver day (from `GET /api/time_off?status=
  approved&from&to`).

---

## 4. Success Criteria

- [ ] A user can submit all-day and partial-day requests; sees their own list;
      cancels a pending one.
- [ ] A department manager sees and approves/denies their reports' requests but
      not their own; owners can review anything.
- [ ] Approved time-off appears as an "Off" marker on the affected grid days.
- [ ] `ends_at > starts_at` and valid `type`/`status` enforced.
- [ ] ExUnit covers visibility, review authz (incl. no self-approve for
      managers), and cancel; existing tests pass; `vite build` + lint/type clean.

---

## 5. Out of Scope

- **Balance/accrual tracking** (days remaining) — explicitly excluded.
- Auto-blocking scheduling on approved time-off (v1 shows a marker; hard
  conflict-prevention is later).
- Recurring time-off; half-day presets; carryover policies.

---

## 6. Resolved Decisions

1. Types: **Vacation (pto) / Sick / Unpaid / Personal** (fixed set for v1).
2. **No balance tracking.**
3. **Partial-day allowed** (all_day flag; partial = one day + times).
4. Review by **owners** or the requester's **department managers** (no manager
   self-approval; owners may self-approve).

## 7. Open Questions

- [ ] None blocking.
