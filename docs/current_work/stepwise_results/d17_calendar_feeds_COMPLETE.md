# D17: Calendar Feeds (ICS / Google Calendar sync) — Complete

**Spec:** `d17_calendar_feeds_spec.md`
**Completed:** 2026-09-21

---

## Summary

iCalendar (ICS) feed subscription so people can sync the schedule into Google/
Apple/Outlook — read-only, one-way, no OAuth. Three scopes (a user's own shifts,
a department, the whole schedule); feeds include published shifts + approved
time-off. Chose approach A (feed subscription) over the Google API.

---

## Implementation Details

### What Was Built

- **`calendar_feeds`**: a secret `token` scoped to `user` / `department` / `all`.
  `RockcutApi.CalendarFeeds` context: lazy `feeds_for/1` (own user + managed
  departments + whole-schedule for owners), `rotate/3`, and `ics/1`.
- **Public** `GET /api/calendar/:token(.ics)` → `text/calendar` with no auth
  (the token is the credential); renders published shifts + approved time-off as
  UTC VEVENTs (calendar apps localize).
- **Authenticated** `GET /api/calendar_feeds` (entitled feeds) and
  `POST /api/calendar_feeds/rotate` (revoke/regenerate a token).
- **Calendar sync UI** (all users): lists feed URLs with Copy + Rotate and
  Google Calendar instructions + a privacy note.

### Key Files

| File | Purpose |
|------|---------|
| `migrations/…create_calendar_feeds.exs`, `calendar_feeds/feed.ex` | Schema |
| `calendar_feeds.ex` | Context + ICS generator |
| `controllers/{calendar,calendar_feed}_controller.ex` | Public feed + management |
| `rockcut-ui/src/pages/schedule/CalendarSyncDialog.tsx` | Sync UI |

---

## Testing

- [x] ExUnit: entitlements by role, public ICS output, rotate + old-token 404,
      employee-can't-rotate. **134 tests, 0 failures**.
- [x] `vite build` + lint/type clean; feeds list + public ICS confirmed live.

---

## Deviations from Spec

- Times emitted as **UTC** (no timezone library), which localizes correctly in
  the subscriber's calendar. Otherwise as specified.

---

## Follow-Up Items

- [ ] Google Calendar **API/OAuth** (two-way/push) — approach B, if ever needed.
- [ ] Deploy note: feed URLs only work once the API is on a public host (Google
      can't reach localhost).

---

## Notes

Commits: `1a2d0fa` (phase 1), `9f908e8` (phase 2).
