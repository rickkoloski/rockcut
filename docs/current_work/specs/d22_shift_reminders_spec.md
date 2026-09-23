# D22: Shift Reminders — Specification

**Status:** Complete (2026-09-23) — see `stepwise_results/d22_shift_reminders_COMPLETE.md`
**Created:** 2026-09-23
**Author:** Matt + CC
**Depends On:** D18 (Notifications), D21 (web push)

---

## 1. Problem Statement

Remind assigned staff of an upcoming shift **~1 hour before it starts**, through
whatever channels they've enabled (in-app, email, push). Adds a new
`shift_reminder` event plus a small periodic scanner that finds due shifts.

Per the D22 decisions: **one reminder, ~1 hour before**, run by a **lightweight
built-in scheduler** (no Oban) — the scan is idempotent with DB-backed dedup,
which suits our single-node SQLite app.

---

## 2. Requirements

### Functional

- [ ] **New event `shift_reminder`** ("Shift reminder") delivered to a shift's
      **assignee** for **published** shifts that start within the lead window.
- [ ] **Lead time**: ~1 hour before start (configurable
      `:reminder_offset_minutes`, default 60). Fires once per shift.
- [ ] **Idempotent**: a shift is reminded at most once (per offset); re-scans
      never re-send. Only **future**, **published**, **assigned** shifts qualify.
- [ ] Reminders honor the recipient's notification preferences (same dispatch
      path as other events); default channels in-app + email on, push off.
- [ ] A periodic scanner runs every few minutes and sends any due reminders.

### Non-Functional

- [ ] Scanner = a supervised `GenServer` ticking on an interval (default 5 min);
      disabled in `:test` (tests drive the scan directly with a fixed `now`).
- [ ] All time math in UTC (shifts stored UTC) — no server timezone dependency.
- [ ] Best-effort/non-blocking, consistent with D18; a send failure is logged and
      never crashes the scanner.
- [ ] ExUnit covers: a due shift is reminded once; a second scan doesn't re-send;
      drafts / unassigned / past / too-far-out shifts are skipped; prefs honored.

---

## 3. Design

### Data model

```
shift_reminders                 # dedup ledger
  id
  shift_id       -> shifts (on_delete: delete_all), required
  offset_minutes :integer, required   # which reminder window (default 60)
  sent_at        :utc_datetime
  timestamps
  unique_index(shift_id, offset_minutes)
```

### Context `RockcutApi.Reminders`

- `offset_minutes/0` → `Application.get_env(:rockcut_api, :reminder_offset_minutes, 60)`.
- `run(now \\ DateTime.utc_now())`:
  1. `cutoff = DateTime.add(now, offset_minutes * 60)`.
  2. Load published, assigned shifts with `now < starts_at <= cutoff`.
  3. Drop any that already have a `shift_reminders` row for this offset.
  4. For each remaining: `Notifications.shift_reminder(shift)` + insert the dedup
     row. Single-node single scanner → no race; wrapped best-effort.
  - Returns the count sent (useful for tests/logging).

### Scanner `RockcutApi.Reminders.Scheduler` (GenServer)

- Added to the app supervision tree. On start (unless disabled via
  `config :rockcut_api, RockcutApi.Reminders.Scheduler, enabled: false`),
  schedules a tick every `:reminder_scan_ms` (default 300_000) that calls
  `Reminders.run/0`; reschedules each tick. Errors are caught + logged.
- `:test` sets `enabled: false` so the ticker never runs during tests.

### Notifications

- Add `Notifications.shift_reminder(shift)`: preload, notify the assignee with
  event `:shift_reminder`, `%{title: "Shift reminder", body: shift_body, data:
  shift_data}`. `:shift_reminder` is opt-in per channel like the others (in-app +
  email default on, push off).

### Frontend

- Add a **"Shift reminder"** row to `NotificationPreferencesDialog` `EVENTS`
  (`shift_reminder`). Existing toggles + "enable push" flow cover it.

---

## 4. Success Criteria

- [ ] A published shift assigned to a user, starting ~1h out, produces exactly one
      `shift_reminder` (in-app + email + push per prefs); a later scan sends nothing.
- [ ] Draft, unassigned, already-started, and >1h-out shifts get no reminder.
- [ ] Deleting a shift removes its dedup rows (FK cascade); prefs suppress channels.
- [ ] ExUnit green; `vite build` + lint/type clean; existing suite unaffected.

---

## 5. Out of Scope (later)

- Multiple reminder windows (e.g. 24h + 1h) — offset is configurable but ships
  as a single 60-min reminder.
- Reminders for open/unassigned shifts.
- Oban migration (swap the scheduler for an Oban cron worker if scheduled jobs
  grow).
- Suppressing reminders when the assignee has approved time-off covering the shift.

---

## 6. Resolved Decisions

1. **One reminder, ~1 hour before** (configurable offset, default 60).
2. **Lightweight GenServer scanner**, not Oban (idempotent scan + DB dedup).
3. New **`shift_reminder`** event; assignee-only; honors notification prefs.
4. Dedup via a `shift_reminders` ledger, unique per (shift, offset).

## 7. Open Questions

- [ ] None blocking. (Scan interval 5 min → reminder lands 55–60 min before; fine.)
