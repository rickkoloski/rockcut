# D15: Schedule Bulk Actions & Roster Controls — Specification

**Status:** Approved (2026-09-21)
**Created:** 2026-09-21
**Author:** Matt + CC
**Depends On:** D11–D14 (Scheduling)

---

## 1. Problem Statement

Five schedule quality-of-life additions:

1. **Delete all shifts in the visible week.**
2. **Delete all of an employee's shifts in the visible week.**
3. **Publish all of an employee's draft shifts in the visible week.**
4. **Hide a user from the scheduler** (e.g. an admin who manages but isn't
   scheduled) — excluded from the roster/grid/assignee picker.
5. **Custom employee order** in the grid (up/down arrows), saved and shared.

Bulk actions (1–3) are **visible-week only** and act on shifts the user can
manage. 1 & 2 are destructive → confirm first.

---

## 2. Requirements

### Functional

- [ ] **Delete week** (grid toolbar, manager/owner): delete the visible week's
      manageable shifts, behind a confirm showing the count.
- [ ] **Per-employee row menu** (manager/owner): **Publish week** (that
      employee's draft shifts in the visible week) and **Delete week** (that
      employee's shifts in the visible week, confirmed).
- [ ] **Hide from schedule:** `users.schedulable` (default true). When false, the
      user is excluded from `/api/roster` (no grid row, not an assignee option).
      Toggle in User Management (owner/manager, same authority as other user
      edits). The user can still log in and manage.
- [ ] **Employee order:** `users.schedule_order` (default 0). The grid lists
      staff by `schedule_order` then name. **Up/down arrows** on each employee
      row (manager/owner) reorder and persist via a save-order endpoint; order is
      global (all viewers see it).

### Non-Functional

- [ ] Bulk actions reuse existing endpoints (`DELETE /api/shifts/:id`,
      `POST /api/shifts/:id/publish`) via frontend loops (like publish-week).
- [ ] Server enforces authority; reorder + schedulable are manager/owner writes.
- [ ] ExUnit covers roster filter/order + the reorder endpoint.

---

## 3. Design

### Backend

- Migration: add `schedulable :boolean default true` and
  `schedule_order :integer default 0` to `users`.
- `User` schema/changeset: cast `schedulable` (profile changeset); `Accounts.update_user`
  base fields include `schedulable`.
- `Accounts.list_roster/0`: `where active and schedulable`, `order_by
  [schedule_order asc, name asc, email asc]`.
- `Accounts.reorder_roster/1` (`[user_id]` in desired order): set
  `schedule_order = index` for each (a batch update).
- `RosterController.order/2`: `POST /api/roster/order {user_ids: [...]}` guarded
  by `Authz.can_manage_any?`.
- `JSONHelpers.user/1`: add `schedulable`.

### Frontend

- **Delete week:** toolbar button → confirm → `DELETE` each visible-week
  manageable shift; invalidate `['shifts']`; toast the count.
- **Per-employee menu** (`WeekGrid` name cell, manager/owner): a kebab menu with
  Publish week / Delete week → callbacks to `Schedule` which loop over that
  employee's visible-week shifts.
- **Reorder:** up/down `IconButton`s on each employee row (manager/owner) →
  `onReorder(newUserIdOrder)` → `Schedule` `POST /api/roster/order` → invalidate
  `['roster']`.
- **Schedulable toggle:** a "Show on schedule" switch in `UserFormDialog`
  (edit mode) → `PATCH /api/users/:id { schedulable }`.
- types: `User.schedulable`.

### API

```
POST /api/roster/order    { user_ids: [id, …] }   # manager/owner; sets order
PATCH /api/users/:id      { schedulable: bool }    # existing endpoint
# bulk delete/publish reuse DELETE/POST /api/shifts…
```

---

## 4. Success Criteria

- [ ] Delete-week and per-employee delete remove exactly the visible-week
      manageable shifts (confirmed); per-employee publish publishes that
      employee's visible-week drafts.
- [ ] A non-schedulable user disappears from the grid rows and assignee picker
      but can still sign in and manage.
- [ ] Up/down arrows reorder employees; the order persists and is the same for
      all viewers.
- [ ] ExUnit covers roster filter/order + reorder authz; existing tests pass;
      `vite build` + lint/type clean.

---

## 5. Out of Scope

- All-time (cross-week) bulk delete/publish — visible week only.
- Drag-to-reorder (up/down arrows only).
- Per-department employee ordering (order is global).

---

## 6. Resolved Decisions

1. Bulk actions are **visible-week only**.
2. Reorder via **up/down arrows** (not drag); order is **global**.
3. Hide flag = `schedulable` on the user; excludes from roster only (login/manage
   unaffected); editable by owner/manager.

## 7. Open Questions

- [ ] None blocking.
