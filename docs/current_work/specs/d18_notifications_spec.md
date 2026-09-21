# D18: Notifications — Core + In-App + Email — Specification

**Status:** Approved (2026-09-21)
**Created:** 2026-09-21
**Author:** Matt + CC
**Depends On:** D10 (Authorization), D11–D17 (Scheduling)

---

## 1. Problem Statement

Notify staff about schedule changes. D18 builds the **notifications core** (events
→ per-user preferences → a pluggable channel dispatcher) and ships two channels:
**in-app** (a notification center) and **email** (Swoosh). SMS, web push, and
time-based **reminders** are deliberate follow-on deliverables (SMS needs Twilio
+ 10DLC; reminders need a job scheduler such as Oban) — the dispatcher is built
so they drop in without touching event logic.

---

## 2. Requirements

### Functional

- [ ] **Events** (D18 set): `shift_published` (to the assignee when their shift is
      published), `shift_assigned` (to the new assignee when assigned to an
      already-published shift), `open_shift` (to a department's members when an
      open shift is published).
- [ ] **Channels:** `in_app` (always available) and `email` (Swoosh). The
      dispatcher is channel-pluggable; SMS/push register later.
- [ ] **Per-user preferences:** each user can toggle each event × channel.
      Defaults: in-app **on**, email **on** (SMS/push off until built).
- [ ] **In-app center:** list recent notifications, unread count, mark one/all
      read.
- [ ] Delivery is **best-effort** and **non-blocking** — a channel failure never
      breaks the triggering request; email sends async.

### Non-Functional

- [ ] Email uses the existing `RockcutApi.Mailer` (Swoosh); dev uses the local
      mailbox (`/dev/mailbox`); prod needs a provider config (out of scope here).
- [ ] Reuses D10 authz for recipient scoping; times in emails shown Denver-local.
- [ ] ExUnit covers dispatch honoring preferences, in-app creation, and the
      inbox/preferences endpoints. (Email asserted at the Swoosh test adapter.)

---

## 3. Design

### Data model

```
notifications                     # in-app inbox
  id
  user_id  -> users (recipient, required)
  event    :string                # shift_published | shift_assigned | open_shift
  title    :string
  body     :string
  data     :map                   # e.g. %{"shift_id" => 12}
  read_at  :utc_datetime (nullable)
  timestamps
  index(user_id), index(user_id, read_at)

users.notification_prefs :map (default %{})   # overrides: %{event => %{channel => bool}}
```

### Context `RockcutApi.Notifications`

- `notify(recipient, event, %{title, body, data})` → for each channel where
  `enabled?(recipient, event, channel)`: in_app inserts a row; email spawns a
  Task that builds + delivers a Swoosh email. Failures rescued/logged.
- `enabled?(user, event, channel)` → `get_in(prefs, [event, channel])` with
  defaults (`in_app`/`email` → true, others → false).
- Inbox: `list(user)`, `unread_count(user)`, `mark_read(user, id)`,
  `mark_all_read(user)`.
- Preferences: `get_prefs(user)`, `update_prefs(user, map)`.
- **Event helpers** (called from Scheduling):
  - `shift_published(shift)` → if assigned, notify assignee (`shift_published`);
    if open, notify department members (`open_shift`).
  - `shift_assigned(shift, new_assignee)` → notify assignee (`shift_assigned`),
    only when the shift is published.

### Triggers (in `RockcutApi.Scheduling`)

- `publish_shift/1` → `Notifications.shift_published(shift)`.
- `update_shift/2` → when status is `published` and `assignee_id` changed to a new
  non-nil user, `Notifications.shift_assigned(shift, assignee)`.
- (Publish-week / claim reuse these paths.)

### API

```
GET   /api/notifications                # recent for caller (+ unread flag)
GET   /api/notifications/unread_count
POST  /api/notifications/:id/read
POST  /api/notifications/read_all
GET   /api/notification_preferences     # caller's prefs (effective map)
PUT   /api/notification_preferences     # { prefs: { event: { channel: bool } } }
```

### Frontend

- **Bell** in the AppBar (all users) with an unread badge → a menu of recent
  notifications (title/body/time), "Mark all read", click marks read.
- **Notification preferences** — a small screen/dialog (from the bell menu or a
  profile area): a grid of events × channels (in-app, email) with toggles; SMS/
  push shown disabled with "coming soon".

---

## 4. Success Criteria

- [ ] Publishing an assigned shift creates an in-app notification + email for the
      assignee; publishing an open shift notifies department members; reassigning
      a published shift notifies the new assignee.
- [ ] Preferences suppress the disabled channels; disabling in-app + email
      silences that event.
- [ ] Bell shows unread count; mark one/all read works; email lands in the dev
      mailbox.
- [ ] A channel error doesn't fail the publish/assign request.
- [ ] ExUnit + `vite build`/lint/type clean; existing tests pass.

---

## 5. Out of Scope (follow-on deliverables)

- **SMS** (Twilio + A2P 10DLC + phone/consent fields).
- **Web push** (VAPID + service worker + subscriptions).
- **Reminders** (needs a scheduler, e.g. Oban) — `shift.reminder` event.
- Production email provider configuration.

---

## 6. Resolved Decisions

1. Ship **core + in-app + email** now; SMS/push/reminders are separate.
2. Events: `shift_published`, `shift_assigned`, `open_shift`.
3. Preferences default in-app + email **on**; stored as an override map on the user.
4. Delivery is best-effort/non-blocking; email async via Task + Swoosh.

## 7. Open Questions

- [ ] None blocking.
