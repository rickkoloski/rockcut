# D23: Team Messaging (Channels) — Specification

**Status:** Complete (2026-09-23) — see `stepwise_results/d23_messaging_COMPLETE.md`
**Created:** 2026-09-23
**Author:** Matt + CC
**Depends On:** D10 (roles), D18 (notifications), D20 (Messages nav), D21 (push)

---

## 1. Problem Statement

An in-app messaging system with **pre-defined channels**: one per department, a
**Managers** channel, and an **All-staff** channel. Access is **derived from
department membership / manager status**, so a user added to a department (or made
a manager) immediately sees that channel's **full history** — no join step. New
messages notify channel members via **push + email** (D21/D18) and show as
**unread** in the app.

---

## 2. Requirements

### Functional

- [ ] **Channels** (pre-defined, derived — no user-created channels):
  - `all` — **All-staff**: every active user.
  - `managers` — **Managers**: managers (a manager membership in any dept) + owners.
  - `dept:<key>` — one per **assignable** department (Brewery, Bar, Office, Sales;
    "Other" excluded): department members (+ owner may view).
- [ ] **Full history**: a member sees all messages in the channel, including those
      posted before they joined.
- [ ] **Post**: any channel member may post a message (owner may post anywhere).
- [ ] **Unread**: per-channel unread count + a total (for the Messages nav badge),
      via per-user last-read tracking. Your own messages don't count as unread.
- [ ] **New-message notifications**: posting notifies the channel's members (except
      the author) with a `message_posted` event → **email + push** by default
      (in-app bell **off** by default so it isn't noisy; unread badges cover in-app).
- [ ] Clicking a push opens that channel.

### Non-Functional

- [ ] Access derived (no membership table for channels): `all` = any active user;
      `managers` = owner or manages any dept; `dept:x` = owner or member of x.
      Notification recipients: `all`=all active; `managers`=managers+owners;
      `dept:x`=that dept's members.
- [ ] Reuses D18 dispatch + D21 push; `message_posted` gets **per-event defaults**
      (in_app off, email on, push off) so messages don't spam the bell.
- [ ] Polling (no websockets) — consistent with the app; the open channel and
      unread counts refresh on an interval.
- [ ] ExUnit covers access, posting, history visibility (incl. pre-join), unread,
      and notification recipients. `vite build`/lint/type clean.

---

## 3. Design

### Data model

```
messages
  id
  channel_key :string    # "all" | "managers" | "dept:<deptkey>"
  user_id     -> users (author, required)
  body        :text, required
  timestamps
  index(channel_key, id)

channel_reads             # per-user last-read marker
  id
  user_id     -> users, required
  channel_key :string, required
  last_read_message_id :integer
  timestamps
  unique_index(user_id, channel_key)
```

### Context `RockcutApi.Messaging`

- `channels_for(user)` → list of `%{key, name, kind}` the user may see: always
  `all`; `managers` if owner/manager; `dept:<k>` for each department they're in
  (owner → all assignable departments). Names derived (dept name / "Managers" /
  "All-staff").
- `can_view?(user, key)` / `can_post?(user, key)` — as in §2.
- `list_messages(user, key, opts)` → authorize, then recent messages (default 100,
  `before:` id for older history), oldest→newest, author preloaded.
- `post_message(user, key, body)` → authorize; insert; fire notifications; return it.
- `recipients(key)` → users to notify (excludes author at send time).
- Unread: `unread_counts(user)` → `%{key => n}` for visible channels;
  `total_unread(user)`; `mark_read(user, key)` → set last_read to the channel's max id.

### Notifications

- New event **`message_posted`**. On post, for each recipient ≠ author:
  `notify(recipient, :message_posted, %{title: <channel name>, body: "<author>:
  <text…>", data: %{channel_key, message_id, url: "/messages/<key>"}})`.
- `enabled?/3` gains **per-event defaults**: `message_posted` → in_app **false**,
  email **true**, push **false**; all other events keep in_app+email on, push off.

### API (authenticated)

```
GET  /api/channels                       # visible channels + unread counts
GET  /api/channels/:key/messages         # history (?before=<id>)
POST /api/channels/:key/messages         # { body } -> post
POST /api/channels/:key/read             # mark read
GET  /api/messages/unread_count          # total (nav badge)
```
(`:key` allows `dept:brewery` etc.; route accepts the encoded key.)

### Frontend

- **/messages** page: left = channel list (name + unread badge); right = selected
  channel thread (history + composer). Mobile: single pane (list ↔ thread). Polls
  the open channel + unread counts on an interval; marks read on open.
- **Nav**: Messages section → **Channels** (`/messages`, total-unread badge) +
  **Alerts** (owner → `/activity`, unchanged).
- **Prefs**: add a **"New message"** row (`message_posted`) to the notification
  preferences (email/push toggles meaningful; in-app off by default).

---

## 4. Success Criteria

- [ ] A user sees All-staff, their department channel(s), and (if manager/owner)
      Managers — with full history including pre-join messages.
- [ ] Posting delivers email + push to the other members and increments their
      unread; opening a channel clears its unread; the nav shows total unread.
- [ ] A non-member cannot read or post to a channel (403).
- [ ] `message_posted` respects prefs; no bell spam by default.
- [ ] ExUnit green; `vite build`/lint/type clean; existing suite unaffected.

---

## 5. Out of Scope (later)

- User-created / private / DM channels; threads, reactions, edits/deletes,
  attachments, @mentions, typing indicators, real-time websockets.
- Per-channel mute settings (beyond the global `message_posted` pref).
- Read receipts beyond a personal unread marker.

---

## 6. Resolved Decisions

1. Channels **derived** from a stable key (no channels table); access from
   department membership / manager status.
2. Channels: **All-staff + Managers + per-department**; "Other" excluded.
3. New messages notify via **email + push** (`message_posted`), bell off by
   default; unread badges cover in-app.
4. Polling, not websockets.

## 7. Open Questions

- [ ] None blocking. (Message length cap + basic rate limiting can come later.)
