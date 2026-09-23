# D24: Scheduling Conflict Warnings — Completion Record

**Status:** Complete (2026-09-23)
**Spec:** `specs/d24_conflict_warnings_spec.md`
**Concept:** 07_scheduling
**Branch:** `scheduler-pwa`

---

## What shipped

Non-blocking conflict warnings in the Scheduler, detected **client-side** from
data already loaded (visible week's shifts + approved time-off `offDays`) — no
API, schema, or Elixir changes.

Two conflict kinds for **assigned** shifts (open shifts never conflict):
- **`time_off`** — the shift touches a Denver day the assignee has **approved**
  time off.
- **`overlap`** — the shift's time range overlaps another shift with the **same**
  assignee (half-open intervals, so back-to-back shifts don't conflict).

Applies to draft **and** published shifts. Warnings never block saving/publishing.

## Surfaces

- **Week grid** (`WeekGrid.tsx`): conflicting shift chips get an **error-colored
  2px border + ⚠ icon** and a **tooltip** listing the conflict(s).
- **Summary banner** (`Schedule.tsx`, week view): `<Alert severity="warning">`
  above the grid counting conflicts in the visible week.
- **Add/Edit shift dialog** (`ShiftFormDialog.tsx`): a live warning `Alert` that
  recomputes as the assignee/times change (excludes the shift being edited).

## Files

- **New:** `rockcut-ui/src/lib/conflicts.ts` — pure detection: `rangesOverlap`,
  `dayKeysSpanned` (internal), `conflictsFor(candidate, allShifts, offDays)`,
  `shiftConflicts`, `conflictMap`.
- **Changed:** `rockcut-ui/src/pages/schedule/WeekGrid.tsx` (conflicts prop,
  chip marker + tooltip), `Schedule.tsx` (compute `conflictMap`, banner, pass
  props to grid + dialog), `ShiftFormDialog.tsx` (`allShifts`/`offDays` props,
  live warning alert).

## Verification

- `tsc --noEmit -p tsconfig.app.json` — clean (ignoring pre-broken `../../shared`).
- `eslint` on the 4 changed/added files — clean.
- `vite build` — succeeds; PWA precache regenerated (18 entries).
- API tests untouched (no backend change) — still **159 passing**.
- Runtime data check: seeded one demo overlapping shift (Kate S, id 101, Mon
  2026-09-21) → overlap detected by the same `rangesOverlap` logic the grid uses.
  **Demo shift #101 is labeled "D24 demo conflict — safe to delete"** (or run
  `mix ecto.reset`).

## Notes / follow-ups

- Detection is scoped to the **loaded range** (the visible week in the grid; the
  loaded shift set in the dialog). Cross-range overlaps aren't detected — fine for
  the normal in-week workflow; a server-side check is a future option.
- Natural next step: **availability** (employee-declared) as another conflict
  source feeding the same `conflicts.ts` (add an `availability` kind).
