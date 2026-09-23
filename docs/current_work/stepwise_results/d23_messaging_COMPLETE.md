# D23: Team Messaging (Channels) — Complete

**Spec:** `d23_messaging_spec.md`
**Completed:** 2026-09-23
**Concept:** 08_notifications

---

## Summary

In-app messaging over **pre-defined, derived channels**: All-staff, Managers, and
one per assignable department. Access is computed from department membership /
manager status, so a user added to a department immediately sees that channel's
**full history**. New messages notify members via **email + push**, and show as
**unread** in the app. Built in two phases (backend, then UI).

---

## Implementation Details

### Backend (phase 1 — `daee9c2`)

- **No channels table** — channels are identified by a stable key: `all`,
  `managers`, `dept:<deptkey>`. `messages` + `channel_reads` tables only.
- **`RockcutApi.Messaging`**: `channels_for/1` (derived list + names),
  `can_view?/can_post?`, `list_messages/3` (full history, `before:` paging),
  `post_message/3`, `unread_counts/1` + `total_unread/1` (exclude own posts),
  `mark_read/2`, and `recipients/1` (all active / managers+owners / dept members).
- **`message_posted`** notification to members except author (email + push);
  added **per-event notification defaults** so it skips the in-app bell by default
  (unread badges cover in-app).
- **API**: `GET /channels`, `GET|POST /channels/:key/messages`,
  `POST /channels/:key/read`, `GET /messages/unread_count`.

### Frontend (phase 2 — this commit)

- **`/messages`** page (`Messages.tsx`): channel list + thread + composer;
  two-pane on desktop, single-pane (list ↔ thread) on mobile; polls the open
  channel (8s) and channel list (15s); marks read on open; Enter to send.
- **Nav**: Messages section now has **Channels** (`/messages`, total-unread badge,
  polled 20s) + **Alerts** (owner → `/activity`). Routes `/messages` and
  `/messages/:key` (push deep-links open a channel).
- **Prefs**: added a **"New message"** row (`message_posted`) with the matching
  per-event default (in-app off).

### Key Files

| File | Purpose |
|------|---------|
| `lib/rockcut_api/messaging.ex` (+ `messaging/{message,channel_read}.ex`) | context + schemas |
| `lib/rockcut_api_web/controllers/message_controller.ex` | endpoints |
| `lib/rockcut_api/notifications.ex` | `message_posted` per-event defaults |
| `migrations/…create_messages.exs` | messages + channel_reads |
| `rockcut-ui/src/pages/messages/Messages.tsx` | messaging UI |
| `rockcut-ui/src/App.tsx` | nav + routes + unread badge |
| `rockcut-ui/src/components/NotificationPreferencesDialog.tsx` | New-message row |

---

## Testing

- [x] ExUnit: channels by membership/role; full history incl. pre-join; access
      (403 for non-members); unread excludes own + clears on read; recipients per
      channel. **159 tests, 0 failures** (was 155).
- [x] `tsc`/`vite build`/lint clean.
- [x] Live: owner sees All-staff + Managers + all 4 departments; post → 201.

### Testing notes

Message notifications exclude the author, so seeing an email/push for a new message
needs a **second user**. In single-user dev you can post and see messages/history,
but unread/notify won't trigger for your own posts.

---

## Deviations from Spec

- None. Channels derived (no table); email+push on new messages; All-staff added.

---

## Follow-Up Items

- [ ] DMs / private or user-created channels; threads, reactions, edits/deletes,
      attachments, @mentions; real-time via Phoenix Channels (currently polling).
- [ ] Per-channel mute (beyond the global `message_posted` pref).
- [ ] Message length cap surfaced in UI (backend caps at 4000).

---

## Notes

Commits: `daee9c2` (backend), `<this>` (frontend). Channel keys carry a colon
(`dept:brewery`) — path-safe, so routes and API calls pass them directly.
