# D35: Cut Off Calendar Feeds When Someone Leaves — Plan

**Spec:** `specs/d35_calendar_feed_rotation_spec.md` (approved 2026-10-04)
**Branch:** `d35-calendar-feed-rotation`

## Approach

The rule is: **when a person's set of shared feeds shrinks, those feeds
rotate.** Deactivation (D1) is the case where the set shrinks to nothing.

1. Before the change, compute what the person can see as `shared_feeds(user)`:
   the department ids they manage (everything, for an owner), plus `:all`
   for an owner. This reuses
   `Authz.scope(user, :calendar_feeds, :manage)`, the same rule `feeds_for/1`
   uses, so the two can't drift apart.
2. Apply the change: deactivation, memberships, or the owner flag.
3. After the change, compute the set again. A deactivated person's "after"
   set is empty.
4. **Lost = before − after.** Rotate every lost feed that exists. On
   deactivation, also rotate their own `user` feed.
5. Work out the recipients. For each rotated shared feed, take the people
   who **still** get it now: active owners, plus that department's active
   managers. Group the feeds by recipient so each person gets one
   notification.

Steps 1–4 run inside the existing `Repo.transaction` of `update_user` and
`set_memberships`, so a rollback (for example the last-owner guard, S8)
rotates nothing. The notifications are sent **after commit**, which means
the functions return the rotation result and the caller notifies.

## Changes

### API (`rockcut_api`)
- **`CalendarFeeds`:**
  - `shared_feeds(user)` returns a list of `{"department", id}` and
    `{"all", nil}`;
  - `rotate_lost(user, before, after, reason)` rotates the existing feeds
    without an `Authz` check, because the system does it. It writes the
    audit entry and returns `[%{feed, label}]`;
  - `recipients_for(rotated)` returns `%{user => [labels]}`, active people only,
    never devices;
  - `notify_rotated(recipients, reason)`.
- **`Accounts.do_update_user`:**
  - take `before` at the start of the transaction;
  - after the update, take `after` (empty if inactive) and rotate;
  - rotate the person's own feed on deactivation;
  - stash the rotation result, and notify after `Repo.transaction` returns
    `{:ok, _}`.
- **`Accounts.do_set_memberships`:** the same, with `reason: :lost_access`.
- **`Notifications`:**
  - `@event_defaults` gets
    `"calendar_feed_rotated" => %{in_app: true, email: false, push: true}`;
  - payload: the title, the body from the spec, and
    `data: %{"url" => "/schedule?calendar_sync=1"}`.
- **No migration.**

### UI (`rockcut-ui`)
- **`NotificationPreferencesDialog`:** add `calendar_feed_rotated`, labelled
  "Calendar link changed", and add `EVENT_DEFAULTS.calendar_feed_rotated =
  { email: false, push: true }`, matching the backend.
- **`Schedule.tsx`:** `?calendar_sync=1` opens `CalendarSyncDialog`, then
  removes the parameter.
- **`NotificationBell`:** clicking an item that has `data.url` marks it read
  and navigates there, as a push click already does. This affects only
  notifications that carry a URL: `message_posted` and this new event.

### Tests
- **ExUnit,** `calendar_feed_rotation_test.exs`:
  - S1–S9 and S11–S15 at the API level;
  - the tokens change, and the old token gives 404 on `/calendar/:token`;
  - recipients and grouping;
  - no rotation on gaining access, on rollback, or for feeds that were never
    created;
  - the audit entry has no token;
  - the notification `enabled?` defaults.
- **Playwright** (`regression/schedule/calendar_feed_rotation.spec.ts`):
  - an owner deactivates a `[TEST-TEMP]` Taproom manager;
  - `barMgr` sees the bell item, clicks it, and lands in Calendar sync with a
    new Taproom URL;
  - the old URL gives 404;
  - preferences show "Calendar link changed" with email off and push on.
- **Test isolation:**
  - rotating the shared Taproom and whole-schedule feeds on DEV changes
    tokens that other specs may read. Specs read the token fresh from the
    API, never cache it;
  - the persona `barMgr` gets notifications from this spec. Mark them read,
    or assert only on our own item.
- **Revert-and-rerun** for each new test.

## Risks
- **Persona feeds rotate on DEV whenever a QA pass deactivates a
  `[TEST-TEMP]` manager.** That's intended, and harmless for DEV.
- **Owners deactivating several people** produces several notifications
  (Q4, accepted).
