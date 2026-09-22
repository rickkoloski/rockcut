# D18: Notifications — Core + In-App + Email — Complete

**Spec:** `d18_notifications_spec.md`
**Completed:** 2026-09-21

---

## Summary

A notifications core (events → per-user preferences → pluggable channel
dispatcher) shipping two channels: **in-app** (a notification bell/center) and
**email** (Swoosh). Events: `shift_published`, `shift_assigned`, `open_shift`.
SMS, web push, and time-based reminders are scoped as follow-ons; the dispatcher
is built so they drop in without touching event logic.

---

## Implementation Details

### What Was Built

- **`notifications` table + `users.notification_prefs`**; `RockcutApi.Notifications`
  context: `notify/3` dispatches to each enabled channel (in-app inserts a row;
  email sends async via Swoosh), `enabled?/3` reads per-user prefs (in-app +
  email default on). Inbox (list / unread_count / mark_read / mark_all_read) and
  prefs (get / update). Dispatch is best-effort — a channel failure never breaks
  the request.
- **Triggers** in `Scheduling`: `publish_shift` → `shift_published` (assignee) or
  `open_shift` (department members); reassigning a published shift →
  `shift_assigned`.
- **Endpoints**: `/api/notifications` (+ `unread_count`, `:id/read`, `read_all`)
  and `/api/notification_preferences` (show / update).
- **Frontend**: a 🔔 bell in the app bar (unread badge, recent list, mark read /
  all, polls 60s) + a preferences dialog (events × channels; SMS/push disabled
  "coming soon").
- Email links to the app rather than embedding local times (no server tz);
  dev uses the Swoosh local mailbox (`/dev/mailbox`).

### Key Files

| File | Purpose |
|------|---------|
| `migrations/…create_notifications.exs`, `notifications/notification.ex` | Schema + prefs |
| `notifications.ex`, `notifications/email.ex` | Dispatcher + email builder |
| `scheduling.ex` | publish/assign triggers |
| `controllers/{notification,notification_preference}_controller.ex` | Endpoints |
| `rockcut-ui/src/components/{NotificationBell,NotificationPreferencesDialog}.tsx` | UI |

---

## Testing

- [x] ExUnit: dispatch honoring prefs, publish/assign/open triggers, inbox +
      prefs endpoints. **141 tests, 0 failures**.
- [x] `vite build` + lint/type clean; endpoints live; email lands in the dev
      mailbox.

---

## Deviations from Spec

- Email delivery is not asserted in ExUnit (it's async via Task); verified via
  the dev mailbox instead. Otherwise as specified.

---

## Follow-Up Items

- [ ] **SMS** (Twilio + A2P 10DLC + phone/consent fields) — see the SMS write-up
      in the D18 discussion.
- [ ] **Web push** (VAPID + service worker + subscriptions).
- [ ] **Reminders** (`shift.reminder`) — needs a scheduler (Oban).
- [ ] Production email provider configuration (Mailgun/SendGrid/SMTP).

---

## Notes

Commits: `40b2d95` (phase 1), `5b41ce7` (phase 2). `notification_prefs` is an
override map on the user; effective defaults are in-app + email on.
