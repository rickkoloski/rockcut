# D14: Scheduling Templates, Standard Hours & Copy Week — Specification

**Status:** Approved (2026-09-21)
**Created:** 2026-09-21
**Author:** Matt + CC
**Depends On:** D11–D13 (Scheduling)

---

## 1. Problem Statement

Building a weekly schedule from scratch is tedious. D14 adds three reuse tools:

- **A — Position standard hours:** each position carries named time presets
  (e.g. Bar-open → "Weekday 8–4"); picking a position offers a **Standard hours**
  dropdown that fills Start/End (still editable).
- **B — Copy previous week:** one click copies the prior week's shifts into the
  visible week as drafts.
- **C — Named schedule templates:** save the current **week** (or **day**) as a
  named template and **apply** it to any week/day later.

All created shifts land as **drafts** so they're reviewed and published
deliberately. All writes are department-scoped per D10/D11.

---

## 2. Requirements

### A. Position standard hours (shift templates)

- [ ] `shift_templates` table tied to a **position**: `name`, `start_time`,
      `end_time` (wall-clock, America/Denver). End ≤ start ⇒ overnight (ends next
      day).
- [ ] Read by any authenticated user (to populate the dropdown); create/edit/
      delete by any manager/owner (same authority as positions).
- [ ] Shift dialog: after choosing a position, a **Standard hours** select lists
      that position's templates; choosing one fills Start/End on the current day
      (end next day if overnight). Manual editing still works.
- [ ] Manage a position's presets in the **Positions** dialog.

### B. Copy previous week

- [ ] A **Copy previous week** action on the week grid copies the prior week's
      shifts the actor can manage into the visible week: same position/assignee/
      times shifted **+7 days**, created as **drafts**.
- [ ] Respects the department filter when one is set; no backend change (frontend
      issues the creates, like Publish week).

### C. Named schedule templates

- [ ] `schedule_templates` (`name`, `kind` = `week` | `day`, `created_by`) with
      `schedule_template_items` (`position_id`, `assignee_id` nullable,
      `day_index` 0–6 for week / 0 for day, `start_time`, `end_time`, `notes`).
- [ ] **Save as template:** from the week grid, save the visible **week** (or a
      chosen **day**) as a named template — built from the actor's manageable
      shifts in that window (weekday/time/position/assignee captured).
- [ ] **Apply template:** choose a template and apply it to the visible week
      (week kind) or a chosen date (day kind) → creates **draft** shifts; each
      item authorized against the actor (items in departments they can't manage
      are skipped, and the skipped count is reported).
- [ ] List/delete templates (a small manager-facing templates dialog).

### Non-Functional

- [ ] Times stored as wall-clock (`:time`), interpreted in America/Denver;
      combine with a target date → UTC via existing `lib/datetime.ts`.
- [ ] Server enforces every write; reuses D10/D11 authz and D13 patterns.
- [ ] ExUnit coverage for A and C endpoints/authz.

---

## 3. Design

### Data model

```
shift_templates                       # A — per-position hour presets
  id
  position_id -> positions (required, on_delete: delete_all)
  name        :string (required)
  start_time  :time (required)
  end_time    :time (required)
  timestamps
  index(position_id)

schedule_templates                    # C — saved week/day
  id
  name        :string (required)
  kind        :string ("week" | "day", default "week")
  created_by_id -> users (nullable)
  timestamps

schedule_template_items
  id
  schedule_template_id -> schedule_templates (on_delete: delete_all)
  position_id  -> positions (required)
  assignee_id  -> users (nullable)
  day_index    :integer (0=Mon … 6=Sun for week; 0 for day)
  start_time   :time (required)
  end_time     :time (required)
  notes        :text (nullable)
```

### API

```
# A — position standard hours
GET    /api/shift_templates?position_id=   # any authenticated
POST   /api/shift_templates                # manager/owner
PATCH  /api/shift_templates/:id            # manager/owner
DELETE /api/shift_templates/:id            # manager/owner

# C — schedule templates
GET    /api/schedule_templates                     # list (with items)
POST   /api/schedule_templates                     # {name, kind, source_week_start | source_date}
POST   /api/schedule_templates/:id/apply           # {target_week_start | target_date} -> {created, skipped}
DELETE /api/schedule_templates/:id
```

- **B (copy week)** uses existing `POST /api/shifts` per shift — no new endpoint.
- **Save** builds items server-side from the actor's manageable shifts in the
  source window (so the client can't fabricate items it couldn't create).
- **Apply** creates draft shifts, authorizing each item against the actor's
  department authority; unauthorized items are skipped and counted.

### Authorization

- `shift_templates`: read = any authenticated; write = `Authz.can_manage_any?`
  (consistent with positions being manager-managed).
- `schedule_templates`: create/apply/delete = manager/owner. Save captures only
  shifts the actor can manage; apply authorizes each item's target department
  (`can?(:create, %Shift{department_id: position.department})`).

### Frontend

- **A:** `ShiftFormDialog` gains a "Standard hours" `<Select>` (from
  `/api/shift_templates?position_id=…`) that sets Start/End; `PositionsDialog`
  gains per-position preset management (name + start + end).
- **B:** a **Copy previous week** button in the week toolbar → gather prior-week
  manageable shifts → `POST /api/shifts` each (+7 days, draft) → invalidate.
- **C:** a **Templates** menu in the week toolbar: **Save week…** (prompt name),
  **Save day…** (pick a day), **Apply →** (list templates), and **Manage** (list
  + delete). Apply week → current visible week; apply day → date picker.

---

## 4. Success Criteria

- [ ] A position can have named hour presets; picking a preset in the shift
      dialog fills Start/End (overnight handled); manual edit still works.
- [ ] Copy-previous-week creates +7-day draft copies of the actor's manageable
      shifts.
- [ ] Save-week captures the visible week; apply-week recreates it as drafts in a
      chosen week; save/apply-day works for a single day.
- [ ] Apply skips items the actor can't manage and reports the count.
- [ ] Times round-trip correctly in America/Denver, including overnight.
- [ ] ExUnit covers shift-template + schedule-template endpoints/authz; existing
      tests pass. `vite build` + lint/type clean.

---

## 5. Out of Scope

- Auto-scheduling / suggestions.
- Templates that store relative dates beyond week/day (e.g. monthly rotations).
- Sharing templates across organizations.
- Conflict/overlap detection on apply (a later deliverable).

---

## 6. Resolved Decisions

1. **Scope = A + B + C** (position standard hours, copy previous week, named
   week/day templates).
2. Times stored as wall-clock `:time` (America/Denver), combined with a target
   date at apply time.
3. Templates and copies always produce **draft** shifts.
4. **Assignees are captured** in templates/copies (nullable); apply assigns them,
   and the manager can adjust or drag afterward.
5. Apply is **best-effort**: items outside the actor's authority are skipped and
   counted, not failed.

## 7. Open Questions

- [ ] None blocking.
