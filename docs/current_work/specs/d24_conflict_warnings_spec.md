# D24: Scheduling Conflict Warnings — Specification

**Status:** Complete (2026-09-23) — see `stepwise_results/d24_conflict_warnings_COMPLETE.md`
**Created:** 2026-09-23
**Author:** Matt + CC
**Depends On:** D11–D15 (scheduling grid), D16 (time-off requests)

---

## 1. Problem Statement

When a manager schedules staff in the Scheduler grid, nothing flags when a shift
**overlaps an approved time-off request** or **double-books** an employee (two
shifts at overlapping times). This D adds **non-blocking conflict warnings** so
managers see problems while they schedule, without preventing them from
overriding (the owner stays in control).

Availability (employees marking when they can work) is a **separate future D**;
this D detects conflicts only against data that already exists: **approved
time-off** and **other shifts for the same employee**.

---

## 2. Requirements

### Functional

- [ ] Detect two conflict kinds for an **assigned** shift (open shifts never
      conflict — no assignee):
  - **`time_off`** — the shift touches a Denver day on which the assignee has an
    **approved** time-off request.
  - **`overlap`** — the shift's time range overlaps **another shift** with the
    **same assignee** (half-open intervals; back-to-back shifts do not conflict).
- [ ] Applies to **both draft and published** shifts (catch it while drafting).
- [ ] **Warnings are non-blocking** — managers can still save/publish over a
      conflict. No API rejection, no migration.
- [ ] **Week grid (Scheduler):** a conflicting shift chip is visibly marked
      (error-colored border + ⚠ icon) with a **tooltip** naming the conflict(s);
      a small **summary banner** above the grid counts conflicts in the week.
- [ ] **Add/Edit shift dialog:** a live, non-blocking **warning alert** appears
      when the current assignee + times conflict (excludes the shift being
      edited), updating as the form changes.

### Non-Functional

- [ ] **Client-side only** — all needed data (visible week's shifts + approved
      time-off `offDays`) is already loaded; no new endpoints, schema, or Elixir
      changes.
- [ ] Detection lives in one **pure, reusable module** (`src/lib/conflicts.ts`)
      shared by the grid and the dialog.
- [ ] No behavior change to saving/publishing; existing 159 API tests stay green.

## 3. Scope / Non-Goals

- **Out:** availability (employee-declared), server-side enforcement/hard block,
  cross-week overlap detection beyond the loaded range, position/skill mismatch,
  max-hours or labor-rule warnings. These are future Ds.
- **In:** time-off + double-booking warnings, surfaced in the grid and dialog.

## 4. Design Notes

- `conflicts.ts` exports `rangesOverlap`, `conflictsFor(candidate, allShifts,
  offDays)`, `shiftConflicts(shift, …)`, and `conflictMap(shifts, offDays)`.
- The dialog reuses `conflictsFor` with a *candidate* (assignee + start/end +
  `excludeId`) so the same logic drives both surfaces.
- `offDays` (userId → Denver day keys with approved time off) already exists in
  `Schedule.tsx`; the grid's time-off "Off" chip uses the same source.
