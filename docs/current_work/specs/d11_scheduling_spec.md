# D11: Staff Scheduling — Specification

**Status:** Approved (2026-09-20)
**Created:** 2026-09-20
**Author:** Matt + CC
**Depends On:** D10 (Users, Departments & Tiered Authorization)

---

## 1. Problem Statement

Rockcut needs to schedule **staff shifts** across the company — a tool in the
spirit of *When I Work*, not task tracking. Managers build their department's
schedule by placing shifts (a person working a block of time in a position),
then publish it; every employee can see the **full published schedule of all
departments** and pick up open shifts in their own department.

This is the first real consumer of D10's authorization system: cross-department
**read**, department-scoped **write**, and employee self-service (claiming open
shifts).

Scope note: *When I Work* is a large product. **D11 delivers the scheduling
core.** Availability, time-off, swaps/drops, time clock, notifications, and the
weekly-grid view are explicit follow-on deliverables (see §5).

---

## 2. Requirements

### Functional

**Positions (company-wide list)**
- [ ] `positions` table — a **company-wide** list (not department-scoped), each
      with a name, an optional cosmetic `group` (Brewery / Bar / Office / Sales /
      Other) for organizing the picker, and an `active` flag.
- [ ] Seeded starter list (see §3 Seed). **Managers and owners can create,
      rename, and deactivate positions**; employees read-only.
- [ ] Any authenticated user can read positions (needed to display/filter).
- [ ] Positions are deactivated, not hard-deleted, when referenced by shifts.

**Shifts**
- [ ] `shifts` table: department, position (any company-wide position), assignee
      (nullable = open shift), `starts_at`/`ends_at` (UTC datetime), status
      (`draft` | `published`), notes, created_by.
- [ ] **Manager+ of the department** may create/edit/delete/assign shifts and
      **publish** them (draft → published).
- [ ] **Draft visibility:** employees see only **published** shifts; managers
      additionally see **their** department's drafts; owners see all.
- [ ] **Read is global:** any authenticated user can list published shifts across
      **all** departments, filterable by department, date range, position,
      assignee, "assigned to me", and "open shifts".

**Open shifts & employee self-service**
- [ ] An unassigned **published** shift is an "open shift".
- [ ] An **active employee (any role) of the shift's department may claim** an
      open shift (sets assignee = self). This is the department-scoped write.
- [ ] Once assigned, only a manager+ may reassign/unassign (employee drop/swap is
      deferred).

**Authorization (verbs via `Authz.can?/3`)**
- [ ] Shifts: `:read` (with draft rule), `:create`, `:update`, `:assign`,
      `:delete`, `:publish` (manager+ of dept); `:claim` (employee of dept, on an
      open published shift).
- [ ] Positions: `:read` (any authenticated); `:create`/`:update`/`:delete`
      (any manager or owner — company-wide).

**Capabilities / UI**
- [ ] `"schedule"` present in every user's `capabilities.modules` (shared
      module) so the Schedule section shows for all users.
- [ ] **Schedule screen (v1 = agenda list):** published shifts grouped by day,
      all departments, with department + position + assignee + local time;
      filters (department, date range, position, my shifts, open shifts).
- [ ] Manager create/edit dialog (department → position → assignee → times →
      notes), a **Publish** action for drafts, and an unassign/reassign control.
- [ ] Employee: **Claim** button on open shifts they're eligible for; own shifts
      highlighted. Controls shown only where permitted; server always enforces.
- [ ] Manager **Positions** management (add/rename/deactivate the company list).

### Non-Functional

- [ ] Times stored as **UTC**, displayed in brewery-local time
      (**America/Denver**).
- [ ] Server-side authorization on every write; client filters UI for
      convenience only.
- [ ] Reuses D10 patterns (`Authz.can?/3`, context + `action_fallback`
      controllers, `%{data: ...}` JSON, `useApiQuery`/`useApiMutation`).
- [ ] ExUnit coverage for the verb matrix, draft visibility, and claim rules.

---

## 3. Design

### Data Model

```
positions                                   # company-wide
  id
  name    :string (required, unique)
  group   :string (nullable)                # cosmetic: Brewery|Bar|Office|Sales|Other
  active  :boolean (default true)
  timestamps
  unique(name)

shifts
  id
  department_id -> departments (required)    # the schedule it belongs to
  position_id   -> positions (required)      # any company-wide position
  assignee_id   -> users (nullable)          # null = open shift
  created_by_id -> users (nullable)
  starts_at     :utc_datetime (required)
  ends_at       :utc_datetime (required)     # must be > starts_at
  status        :string ("draft" | "published", default "draft")
  notes         :text (nullable)
  timestamps
  index(department_id), index(assignee_id), index(starts_at), index(status)
```

### Authorization

Owner → always true. For `%Shift{}`:

| Verb | Manager of dept | Employee of dept | Other dept |
|------|:--:|:--:|:--:|
| `:read` published | ✓ | ✓ | ✓ (global) |
| `:read` draft | ✓ | ✗ | ✗ |
| `:create` / `:update` / `:assign` / `:delete` / `:publish` | ✓ | ✗ | ✗ |
| `:claim` (open + published) | ✓ | ✓ | ✗ |

For `%Position{}`: `:read` any authenticated; `:create`/`:update`/`:delete` →
any user who is a manager of some department, or an owner (positions are
company-wide, so this is `Authz.can_manage_any?/1`).

Draft visibility is enforced in the **read query** (index/show filter out drafts
the viewer may not see), in addition to `can?/3` for single-item access.

### API

```
# Positions
GET    /api/positions                      # any authenticated (filter: group, active)
POST   /api/positions                      # manager or owner
PATCH  /api/positions/:id                  # manager or owner (rename / active toggle)
DELETE /api/positions/:id                  # manager or owner (soft: deactivate if referenced)

# Shifts
GET    /api/shifts                         # global read; filters: department, from, to,
                                           #   position_id, assignee, mine, open, status
GET    /api/shifts/:id
POST   /api/shifts                         # manager+ of dept (creates draft)
PATCH  /api/shifts/:id                     # manager+ of dept (edit incl. assignee, times)
DELETE /api/shifts/:id                     # manager+ of dept
POST   /api/shifts/:id/publish             # manager+ of dept (draft -> published)
POST   /api/shifts/:id/claim               # employee of dept, open published shift
```

Dedicated `publish` and `claim` sub-actions keep the verb (and its authorization
decision) unambiguous.

### Frontend (v1 = agenda list)

- **Schedule** nav item for all users (calendar icon).
- Agenda list of published shifts grouped by day; each row: department chip,
  position, assignee (or "Open"), local time range, status badge (managers see
  their drafts). Filters as above; "My shifts" and "Open shifts" toggles.
- **Create/Edit dialog** (manager+): department (managed set) → position
  (grouped picker) → assignee (users in that department, or leave open) →
  starts_at/ends_at → notes. **Publish** button on drafts.
- **Claim** button on eligible open shifts (employees). Own shifts highlighted.
- **Positions** management dialog (manager+): list grouped, add/rename/deactivate.

### Seed (starter positions)

| Position | Group |
|----------|-------|
| Brewer | Brewery |
| Bar-open | Bar |
| Bar-mid | Bar |
| Bar-close | Bar |
| Event-bar | Bar |
| Office | Office |
| Sales | Sales |
| Delivery | Sales |
| Training | Other |
| Event-offsite | Other |

Plus a few sample published shifts for dev.

---

## 4. Success Criteria

- [ ] Migrations + `Scheduling` context; starter positions seeded; sample shifts
      for dev.
- [ ] Any authenticated user (any department) sees **published** shifts from all
      departments; drafts hidden from non-managers.
- [ ] A manager can create/edit/delete/assign/publish shifts only in their
      department; attempts elsewhere are 403.
- [ ] A manager or owner can add/rename/deactivate company-wide positions;
      employees cannot.
- [ ] An employee can **claim** an open published shift in their department;
      cannot in another department; cannot create/edit/delete/publish.
- [ ] `ends_at > starts_at` enforced; times round-trip as UTC and display in
      America/Denver.
- [ ] `"schedule"` in `/api/me` capabilities for all users; UI shows the agenda,
      correct per-role controls, and positions management for managers.
- [ ] ExUnit covers the verb matrix, draft visibility, and claim rules; existing
      tests still pass.

---

## 5. Out of Scope (follow-on deliverables)

- **Weekly grid view** (staff × days) — the next deliverable (D12).
- **Availability** (employees marking when they can work).
- **Time-off requests** + approval.
- **Shift swaps / drops** with approval (v1: only managers reassign).
- **Time clock** (clock in/out) & timesheets.
- **Notifications** (email/SMS/push) for publishing, assignments, open shifts.
- **Recurring shifts / templates.**
- **Overlap/double-booking prevention** (v1 allows it; a warning/guard is later).

---

## 6. Resolved Decisions

1. **Position scoping** → **company-wide** flat list with a cosmetic `group`
   label; managers and owners manage it.
2. **Starter positions** → Brewer (Brewery); Bar-open/Bar-mid/Bar-close/Event-bar
   (Bar); Office (Office); Sales/Delivery (Sales); Training/Event-offsite (Other).
3. **Draft visibility** → employees see only published; managers see their
   department's drafts; owners see all.
4. **Timezone** → store UTC, display America/Denver.
5. **Phasing** → Phase 1 backend (positions, shifts, authz, publish/claim, seed,
   tests) → Phase 2 frontend (agenda, dialogs, positions mgmt). Single D11 id.

## 7. Open Questions

- [ ] None blocking.
