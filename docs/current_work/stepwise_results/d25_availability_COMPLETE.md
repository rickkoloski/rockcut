# D25: Employee Availability + Availability Conflicts — Completion Record

**Status:** Complete (2026-09-23)
**Spec:** `specs/d25_availability_spec.md`
**Concept:** 07_scheduling
**Branch:** `scheduler-pwa`

---

## What shipped

Recurring weekly **availability** (self-declared) + a new **`availability`**
conflict source wired into the D24 scheduler warnings.

- Employees set weekly slots per weekday: **Unavailable** or **Preferred**,
  all-day or a time window (Denver wall clock). Recurs every week.
- The Scheduler flags an **assigned** shift that overlaps an **`unavailable`**
  slot on that weekday (all-day or overlapping window). `preferred` is
  informational (no conflict this D). Non-blocking, like D24.

## Backend (Elixir) — mirrors D16 time-off

- **Migration** `20260923150001_create_availability_slots.exs` — `availability_slots`
  (user_id, weekday 0–6, kind, all_day, start_time/end_time `:time`, note).
- **Schema** `RockcutApi.Availability.Slot` — validates weekday 0–6, kind ∈
  {unavailable, preferred}, and (timed) both times with end > start; all-day nulls
  the times.
- **Context** `RockcutApi.Availability` — `list_for` (owner: all; manager: managed
  depts' members + self; employee: self), `create` (forces `user_id` to the actor,
  so it's self-declared and unspoofable), `delete` (self or owner).
- **Controller/routes** `GET/POST /api/availability`, `DELETE /api/availability/:id`;
  JSON helper `availability_slot/1`.

## Frontend

- **Types:** `AvailabilityKind`, `AvailabilitySlot`.
- **`conflicts.ts`:** new `buildUnavailability(slots)` → `Map<userId,
  UnavailableWindow[]>` (only `unavailable`); `conflictsFor/shiftConflicts/
  conflictMap` take an optional 4th `unavailability` arg; new `availability`
  `ConflictKind`. Overnight shifts split into per-weekday segments (`getUTCDay`
  on the Denver date key; local minute windows).
- **New page** `pages/availability/Availability.tsx` (`/availability`, under the
  Schedule nav) — the signed-in user adds/deletes their own weekly slots, shown
  as a Mon→Sun list.
- **Scheduler** (`Schedule.tsx`): loads `/api/availability` (managers/owner),
  builds the unavailability map, feeds `conflictMap` + the shift dialog; banner
  text updated. **`ShiftFormDialog`** takes `unavailability` for the live check.
- **Grid markers** (`WeekGrid.tsx`): each cell now shows the employee's
  availability for that weekday as a small chip — red "Unavailable …" /
  green "Prefers …" (with the window or "all day", note on hover) — next to the
  existing "Off" chip for approved time off. So managers/owners see time off
  **and** availability directly in the grid, not just via the conflict warning.
  Shared `weekdayOf(dayKey)` helper added to `datetime.ts` (reused by
  `conflicts.ts`).
- **Chips show times.** The grid time-off marker now shows partial-day times
  ("Off 1:00 PM–5:00 PM"; multi-day timed reads "Off from …" / "Off until …" on
  the boundary days) via `lib/timeoff.ts` `buildOffMarkers`, replacing the flat
  day-level "Off" chip (the day-level set is derived from it for conflicts).
  Availability chips show their window in 12-hour time (`formatWallTime`).
- **Pending time off shown too.** The grid now loads all statuses in range and
  renders **approved** (solid grey) and **pending** (amber dashed outline, label
  suffixed "(pending)") distinctly; denied/cancelled are ignored. Conflict
  detection stays on **approved** only (pending is a heads-up, not a hard
  conflict) — `offDays` is derived from non-pending markers.

## Verification

- API: **167 tests, 0 failures** (159 prior + 8 new availability controller tests);
  `mix compile --warning-as-errors` clean.
- UI: `tsc --noEmit -p tsconfig.app.json` clean, ESLint clean, `vite build` OK
  (PWA precache regenerated).
- End-to-end data check: inserted a demo slot (Kate S / user 4, **Monday**,
  all-day **unavailable**, note "D25 demo"). `GET /api/availability` returns it;
  Kate's Monday shift #22 (weekday 1) → an `availability` conflict (plus the D24
  demo overlap #101). To reset: delete slot id 1 + shift #101, or `mix ecto.reset`.

## On-behalf entry (managers/owners)

Managers and owners can enter **time off and availability for employees they
manage** (owner → anyone; manager → members of departments they manage),
enforced server-side.

- **Authz:** new `can_manage_user?(actor, target_user_id)` (owner true; else the
  target is a member of a department the actor manages — a `Repo.exists?` on
  memberships).
- **Time off:** `TimeOff.create` accepts an optional `user_id`; self → `pending`
  as before, a managed employee → created **`approved`** with the actor as
  reviewer (they hold review authority); unmanaged target → `403`.
- **Availability:** `Availability.create` accepts an optional `user_id` (managed
  or self); `can_manage?` now also lets a manager delete a managed employee's
  slot; unmanaged target → `403`.
- **UI:** both pages show a **"For"** selector to managers/owners (Myself +
  manageable roster, filtered by department keys); the time-off page notes that
  entering for an employee approves it immediately; the availability page title
  reflects whose schedule is shown and loads/saves that user's slots.
- **Tests:** +8 controller tests (manager/owner on-behalf create, forbidden for
  unmanaged, manager delete). Suite **175 passing**.

## Time-off approval workflow (managers/owners)

- **Approve own:** a manager's/owner's own request still starts **pending**, but
  they may now approve/deny it (`can_review?` self-branch → `Authz.can_manage_any?`;
  plain employees still cannot). Owners already could.
- **Undo after approval:** the requester can **cancel** their own request while
  `pending` **or** `approved` (`TimeOff.cancel` now allows `approved` →
  `cancelled`; error `:not_cancellable`); a manager/owner can **deny/remove** an
  already-approved request via the review endpoint (`approved` → `denied`).
- **Time-off page ordering (managers/owners):** (1) **My requests** first — with
  Approve (own pending, if manager/owner) and Cancel (own pending/approved);
  (2) **Pending — other employees** (Approve / Deny); (3) **Approved — other
  employees** (Remove). Plain employees see only My requests.
- **Reviewer shown:** approved rows display "Approved by {name}" from the stored
  `reviewed_by` (already persisted on review and on manager on-behalf creates).
- **Sorted + confirmed:** every list is ordered by date (`starts_at` ascending);
  **removing/cancelling an already-approved request** (manager "Remove" or the
  requester's own approved "Cancel") goes through a `ConfirmDialog` verify step
  (pending cancel/deny stay one-click).
- **Tests:** +net (manager approve-own, employee-cannot, cancel-approved,
  deny-approved). Suite **178 passing**.

## Follow-ups (deferred)

- `preferred` as a soft/info warning; owner/manager editing others' availability;
  suppress open-shift reminders against availability; server-side conflict check.
