# D25: Employee Availability + Availability Conflicts — Specification

**Status:** Complete (2026-09-23) — see `stepwise_results/d25_availability_COMPLETE.md`
**Created:** 2026-09-23
**Author:** Matt + CC
**Depends On:** D10 (roles), D11–D15 (scheduling), D16 (time off), D24 (conflicts)

---

## 1. Problem Statement

Employees can declare **recurring weekly availability** — the hours each weekday
they are **Unavailable** (or **Preferred**). The Scheduler then flags a shift
that lands on an employee's unavailable time as a **conflict**, alongside the
D24 time-off and double-booking warnings. Availability recurs every week (no
re-entry), matching When-I-Work's model.

---

## 2. Requirements

### Functional

- [ ] **Recurring weekly model.** A slot = (user, weekday 0–6 Sun–Sat, kind,
      all-day | time window, note). `kind` ∈ {`unavailable`, `preferred`}.
- [ ] **Employee self-service editor** (`/availability`, under Schedule nav):
      the signed-in user views/adds/deletes their own weekly slots.
- [ ] **Availability conflict** (new `availability` kind in `conflicts.ts`): an
      **assigned** shift conflicts when it overlaps an **`unavailable`** slot on
      that Denver weekday (all-day, or overlapping the slot's time window).
      `preferred` never conflicts (informational only, this D).
- [ ] Warnings surface exactly like D24: marked chips + tooltip + week banner in
      the grid, live warning in the shift dialog. **Non-blocking.**

### Non-Functional

- [ ] Backend mirrors the D16 time-off shape: `availability_slots` table +
      `RockcutApi.Availability` context + `AvailabilityController` + JSON helper +
      routes. Visibility mirrors time-off (owner: all; manager: managed depts'
      members + self; employee: self).
- [ ] Times stored as `:time` (Denver wall clock), like `shift_templates`.
- [ ] Availability detection lives in the existing `conflicts.ts` (a new
      `buildUnavailability` + an availability branch in `conflictsFor`).
- [ ] New API tests for the context/controller; existing 159 stay green.

## 3. Scope / Non-Goals

- **Out (this D):** `preferred` producing a soft warning; owner/manager editing
  *other* people's availability (self-only editor for now); approval workflow
  (availability is self-declared, no review); max-hours / labor rules.
- **In:** self-declared recurring weekly availability + `unavailable` conflict
  detection wired into the Scheduler.

## 4. Design Notes

- `weekday`: 0=Sunday … 6=Saturday (JS `getDay`/`getUTCDay`; Denver calendar day).
- Overnight shifts are split into per-weekday segments for the check.
- `conflicts.ts`: `buildUnavailability(slots)` → `Map<userId, UnavailableWindow[]>`
  (only `unavailable` slots); `conflictsFor(candidate, allShifts, offDays,
  unavailability?)` gains an availability branch. `conflictMap`/`shiftConflicts`
  take the same optional 4th arg.
