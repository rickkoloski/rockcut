# D22: Shift Reminders — Complete

**Spec:** `d22_shift_reminders_spec.md`
**Completed:** 2026-09-23
**Concept:** 08_notifications

---

## Summary

Assigned staff now get a one-time **shift reminder ~1 hour before** a published
shift starts, through their enabled channels (in-app, email, push). A lightweight
supervised scanner finds due shifts on an interval; a dedup ledger keeps it to one
reminder per shift.

---

## Implementation Details

- **`shift_reminders`** table (dedup ledger): `shift_id`, `offset_minutes`,
  `sent_at`, unique on `(shift_id, offset_minutes)`, FK cascade on shift delete.
- **`RockcutApi.Reminders`**: `run(now \\ utc_now)` loads published, assigned
  shifts with `now < starts_at <= now + offset` (offset = 60 min, configurable via
  `:reminder_offset_minutes`), skips any already in the ledger, then **inserts the
  ledger row first** (unique constraint = race-safe dedup) and notifies. Returns
  the count sent.
- **`RockcutApi.Reminders.Scheduler`**: a `GenServer` in the app supervision tree
  that ticks every `:interval_ms` (default 5 min) calling `Reminders.run/0`;
  errors are caught + logged. `init` returns `:ignore` when disabled
  (`config :rockcut_api, RockcutApi.Reminders.Scheduler, enabled: false` in
  `:test`), so tests drive `Reminders.run/1` directly with a fixed `now`.
- **`Notifications.shift_reminder/1`**: notifies the assignee with the new
  `:shift_reminder` event ("Shift reminder"), honoring per-user channel prefs
  (in-app + email default on, push off).
- **Frontend**: added a **"Shift reminder"** row to the notification preferences.
- No Oban — the idempotent-scan + DB-dedup design fits our single-node SQLite app
  (see spec §6); swappable for an Oban cron worker later.

### Key Files

| File | Purpose |
|------|---------|
| `migrations/…create_shift_reminders.exs`, `reminders/shift_reminder.ex` | ledger |
| `lib/rockcut_api/reminders.ex` | scan + send logic |
| `lib/rockcut_api/reminders/scheduler.ex` | periodic GenServer |
| `lib/rockcut_api/application.ex` | supervision child |
| `lib/rockcut_api/notifications.ex` | `shift_reminder/1` + `:shift_reminder` event |
| `rockcut-ui/src/components/NotificationPreferencesDialog.tsx` | prefs row |

---

## Testing

- [x] ExUnit: reminded once + not re-sent on re-scan; skips draft / unassigned /
      past / too-far-out; prefs honored. **155 tests, 0 failures** (was 152).
- [x] `tsc`/`vite build`/lint clean.

### To verify by hand

Set `:reminder_offset_minutes` high (e.g. 6000) or create a shift starting soon,
then in `iex -S mix`: `RockcutApi.Reminders.run()` → the assignee gets a
"Shift reminder" (in-app + push if enabled). The scheduler also runs it every 5 min.

---

## Deviations from Spec

- None. Ships a single 60-min reminder; offset is configurable for future windows.

---

## Follow-Up Items

- [ ] Multiple windows (24h + 1h); reminders for open shifts.
- [ ] Suppress reminders when the assignee has approved time-off covering the shift.
- [ ] Swap the scanner for Oban if scheduled jobs grow (retries/observability).

---

## Notes

The scanner is single-node (Fly). On restart it simply resumes ticking; the scan
is idempotent, so no reminders are lost or duplicated. Times are UTC throughout.
