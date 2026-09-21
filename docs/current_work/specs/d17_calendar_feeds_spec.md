# D17: Calendar Feeds (ICS / Google Calendar sync) — Specification

**Status:** Approved (2026-09-21)
**Created:** 2026-09-21
**Author:** Matt + CC
**Depends On:** D11–D16 (Scheduling, Time off)

---

## 1. Problem Statement

Let people subscribe to the schedule from Google Calendar (and Apple/Outlook)
via **iCalendar (ICS) feed URLs** — read-only, one-way, no OAuth. Three scopes:
a person's own shifts, a **department**'s schedule, and the **whole** schedule.
Feeds include **published shifts** and **approved time-off**.

Chosen approach **A** (feed subscription) over the Google Calendar API (OAuth):
no Google Cloud project/credentials, works with any calendar app; trade-off is
Google's own refresh cadence (not instant) and one-way read-only.

---

## 2. Requirements

### Functional

- [ ] `calendar_feeds`: a secret `token`, a `subject_type` (`user` | `department`
      | `all`) and `subject_id` (user/department id; null for `all`).
- [ ] **Public** endpoint `GET /api/calendar/:token(.ics)` returns `text/calendar`
      — no login (calendar apps fetch anonymously; the token is the credential).
- [ ] Feed contents by scope (published shifts only; drafts never leak):
  - `user` → that user's assigned shifts + that user's approved time-off.
  - `department` → that department's shifts + approved time-off of its members.
  - `all` → all published shifts + all approved time-off.
- [ ] **Feed management** (authenticated): a user always gets their **own** feed;
      a manager gets a feed per department they manage; an owner gets every
      department feed + the **whole-schedule** feed. Feeds are created lazily so
      URLs are stable.
- [ ] **Rotate** a feed's token (revokes the old URL). Authorized to the feed's
      owner (self / department manager / owner).
- [ ] A **Calendar sync** UI listing the caller's feed URLs with copy + rotate,
      and short "how to add in Google Calendar" guidance.

### Non-Functional

- [ ] Times emitted as **UTC** VEVENTs (`…Z`) — correct in the subscriber's local
      (Denver) calendar; server needs no timezone library.
- [ ] Tokens are unguessable (`:crypto.strong_rand_bytes` url-safe); rotating
      invalidates the old URL. Feed URLs are bearer secrets (documented).
- [ ] Valid ICS: CRLF lines, text escaping, stable UIDs.
- [ ] ExUnit covers feed listing/authz, the public ICS output, and rotate.

---

## 3. Design

### Data model

```
calendar_feeds
  id
  token         :string (unique, unguessable)
  subject_type  :string (user | department | all)
  subject_id    :integer (nullable for "all")
  created_by_id -> users (nullable)
  timestamps
  unique(token); unique(subject_type, subject_id)
```

### Context `RockcutApi.Calendar`

- `feeds_for(user)` → ensures + returns the caller's entitled feeds (own user +
  managed departments + all-if-owner), each with `{subject_type, label, token}`.
- `get_feed_by_token(token)`.
- `rotate(subject_type, subject_id, actor)` → authorize, set a new token.
- `ics(feed)` → build the VCALENDAR string from:
  - shifts: `status == "published"`, scoped (all / department_id / assignee_id).
  - time-off: `status == "approved"`, scoped (all / user_id / dept members).
- Authorization: user feed → self or owner or manager of a dept the user belongs
  to; department feed → owner or that dept's manager; all → owner.

### API

```
GET  /api/calendar/:token            # PUBLIC — text/calendar (token = credential)
GET  /api/calendar_feeds             # authenticated — the caller's feed URLs
POST /api/calendar_feeds/rotate      # authenticated — {subject_type, subject_id}
```

### ICS shape

```
BEGIN:VCALENDAR / VERSION:2.0 / PRODID:-//Rockcut Brewing//Schedule//EN
X-WR-CALNAME:<label>
VEVENT per shift:    UID shift-<id>@rockcut, DTSTART/DTEND (UTC Z),
                     SUMMARY "<position> — <assignee|Open>", LOCATION <department>,
                     DESCRIPTION <notes>, STATUS CONFIRMED
VEVENT per time-off: UID timeoff-<id>@rockcut, DTSTART/DTEND (UTC Z),
                     SUMMARY "Time off (<type>) — <name>"
END:VCALENDAR
```

### Frontend

- A **Calendar sync** section (its own page or under Schedule): lists the
  caller's feeds (My shifts / each department / Whole schedule) with the full
  URL, a **Copy** button, a **Rotate** action, and Google Calendar "add from URL"
  instructions.

---

## 4. Success Criteria

- [ ] Subscribing to a feed URL in Google Calendar shows the right shifts +
      approved time-off; drafts never appear.
- [ ] User/department/all scoping and authorization correct; a non-manager can't
      get a department/all feed.
- [ ] Rotating a token invalidates the old URL (404) and yields a new one.
- [ ] Valid ICS (parses in Google/Apple Calendar); UTC times land on the right
      local days.
- [ ] ExUnit + `vite build`/lint/type clean; existing tests pass.

---

## 5. Out of Scope

- Google Calendar **API/OAuth** (two-way, push updates) — approach B, later.
- Writing back from calendar to schedule.
- Per-shift calendar attendee invites / RSVPs.

---

## 6. Resolved Decisions

1. **Approach A (ICS feed subscription)**, not the Google API.
2. Feeds include **approved time-off** as well as published shifts.
3. Times emitted **UTC** (no server tz lib); calendar apps localize.
4. Scopes: **user**, **department**, **all**; tokenized public URLs, rotatable.

## 7. Open Questions

- [ ] None blocking.
