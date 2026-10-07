# D36: Backlog Sweep + Time-Off Conflict Fix — Specification

**Status:** Complete — on prod in `v2026.10.05` (2026-10-05). Approved (2026-10-04, Q1–Q3 answered)
**Created:** 2026-10-04
**Author:** Matt + CC
**Process:** `docs/process/three_environment_workflow.md`. One branch, one local gate, one DEV gate with an independent pass, one release.
**Backlog:** PortableMind project 254, tasks 3941, 3942, 3997, 4001, 4002, 4003, 4050, 4051, 4052, 4053, 4057, plus Matt's scheduler bug report (2026-10-04, no task yet)
**Branch:** `d36-backlog-sweep`, cut from `develop`

---

## 1. Problem Statement

Matt wants the backlog cleared. Eleven small, independent fixes are bundled
so that they share a single gate and release. Matt also reported a
scheduler bug, which is item L.

Each item is self-contained: its own requirement, its own test (failing first
where possible), and its own commit.

## 2. Items

### L. Time-off conflict warnings only when the times overlap (Matt, 2026-10-04)

**Bug:** the Scheduler flags a shift with "Assignee has approved time off
that day" whenever the person has approved time off *anywhere* on that day.
For example, time off 9:00–12:00 flags a 17:00–22:00 shift. The check
(`conflicts.ts`, D24) works on whole Denver days.

**Requirement:**
- **Timed time off** conflicts with a shift only when their time ranges
  overlap. Back-to-back doesn't count, the same rule as the shift-overlap
  check: a shift ending at 9:00 doesn't conflict with time off starting at
  9:00.
- **All-day time off** still conflicts with any shift that touches any of its
  Denver days, as today. It's stored as 00:00–23:59 Denver; treat it as the
  whole day through midnight.
- **Multi-day timed time off** (for example 9/23 15:30 → 9/26 12:00)
  conflicts with any shift overlapping that span.
- **Pending time off** still doesn't conflict (unchanged).
- The grid's off-markers (the chips) are unchanged; only the warning logic
  changes.
- The message becomes "Assignee has approved time off then" for timed time
  off. All-day time off keeps "…that day".
- It applies everywhere the warning appears: grid chips, the week banner, and
  the live warning in the shift dialog.

### A. 3997 — Remove the `/live` socket from prod

- Mount `socket "/live", Phoenix.LiveView.Socket` only when the dev
  dashboard routes are enabled (dev), or remove it if the dashboard doesn't
  need it.
- Make `phoenix_live_view` dev-only if `phoenix_live_dashboard` allows it.
  Otherwise keep the dependency and just don't mount the socket.
- **Test:** in the test environment (configured like prod), `/live/websocket`
  and `/live/longpoll` return 404.
- *Note:* Rick originally asked for this as its own deliverable (msg 83066).
  It's bundled here at Matt's request (Q3).

### B. 4001 — Tablet: an unknown or blocked channel URL says so

- **On a shared device:** a channel URL the device can't read, such as
  `/messages/managers`, shows the device-only "Not available on a shared
  device" page instead of silently redirecting to All-staff.
- **For people:** an unknown channel key shows "Channel not found" with a
  link to Messages, instead of the silent redirect.

### C. 4002 — Tablet header at phone width

- **At narrow widths (< 600 px)** in a device session, the "Sign in as me"
  button stays on one line: an icon plus "Sign in" with an
  aria-label "Sign in as me".
- **The "Shared device" pill** drops the department name, so it never
  overlaps the logo.
- Tablet sizes (1280×800 and 800×1280) are unchanged.

### D. 4003 — `manifest.webmanifest` content type

- nginx serves it as `application/manifest+json`, keeping its `no-cache`.
- **Check on DEV:** `curl -I`.

### E. 3942 — Extending a hidden draft series answers 404

- `POST /api/schedule_event_series/:id/extend` answers **404** unless the
  actor can read at least one event in the series. Department managers and
  owners can always read them.
- It answers 403 to someone who can read the series but not extend it.
- **ExUnit:**
  - `bartender1` on an all-draft series gets 404;
  - `bartender1` on a series with a published date gets 403.

### F. 3941 — DEV reseed cleans all `[TEST-TEMP]` data

`seed_synthetic()` / `cleanup_temp` also deletes:
- `[TEST-TEMP]` users on `@rockcut-test.com` that aren't personas,
  including the `a-d35-…` ones (their sessions and memberships cascade;
  their audit entries are handled);
- `[TEST-TEMP]` brands and other brewing rows;
- schedule events, series and their dates whose title starts with
  `[TEST-TEMP]` or `TEST-TEMP`;
- `[TEST-TEMP]` shared devices, with their tokens and pairing codes.

It stays fail-closed behind the Guard. **ExUnit coverage.**

### G. 4050 — One idle timer across tabs on a tablet

- During "Sign in as me", activity in **any** tab keeps the session
  alive.
- Before deciding the tablet is idle, `useIdleReturn` re-reads the shared
  last-activity time on every tick, on focus, and on a visibility change,
  and listens for `storage` events.
- **Playwright:** two tabs, with activity only in tab A. Tab B doesn't
  end the session early.

### H. 4051 — Logout while offline still ends the session on the server (Q1)

- **Option 1 (recommended):** if the Logout request fails or can't be
  sent, keep the old token in a "pending sign-out" slot. Send it the next
  time the app starts or comes online, then forget it. Also send Logout with
  `keepalive`, so closing the tab right away still delivers it.
- **Option 2:** use `keepalive` only. That covers closing the page but not
  being offline.

The same applies to the tablet's idle-return revoke during an outage.

### I. 4052 — An abandoned "Sign in as me" form returns to the shared screen (Q2)

- After **5 minutes** with no activity on the personal sign-in form, it
  returns to the shared screen. That restores the tablet's token and clears
  the typed email, the same as Cancel. The 5 minutes matches the idle
  return.
- It doesn't return mid-typing; any key or tap restarts the 5 minutes.

### J. 4053 — No blank page on a malformed reply

- The nav queries (`/api/channels`, `/api/departments`) treat `null` or
  missing `data` as an empty list.
- **A top-level error boundary** catches any render crash and shows "Something
  went wrong" with a **Reload** button, instead of a blank page.

### K. 4057 — Stabilize the flaky "Try now" spec

- Find the cause with a DEV trace. The likely cause: the loading screen
  remounts when the store sets the same `unreachable: true` again.
- If the screen remounts, fix it in the UI (`set` only on change). Otherwise
  make the test robust.
- **Done when** the spec passes 10 runs in a row on DEV.

## 3. Out of Scope

- 3856 (telemetry) gets its own design.
- 3994 is a check, done separately.
- Features 4054, 4055 and 4056.
- 4058 (from 2026-11-04).

## 4. Persona scenarios (DEV)

| # | Who | Path | Expected |
|---|---|---|---|
| L1 | `barMgr` | a `[TEST-TEMP]` bartender has approved time off **09:00–12:00** Tuesday; schedule them **17:00–22:00** Tuesday | no time-off warning (chip, banner or dialog) |
| L2 | `barMgr` | same, schedule **11:00–15:00** | warning "approved time off then" |
| L3 | `barMgr` | **all-day** time off Tuesday; schedule 17:00–22:00 | warning "approved time off that day" |
| L4 | `barMgr` | time off ends 12:00; a shift starts 12:00 | no warning (back-to-back) |
| L5 | `barMgr` | multi-day timed time off Mon 15:30 → Wed 12:00; a shift Tue 10:00–14:00 | warning |
| L6 | `barMgr` | **pending** timed time off overlapping a shift | no warning (unchanged) |
| A1 | anyone | `GET https://rockcut-api-dev.fly.dev/live/websocket` | 404 |
| B1 | `taproomDevice` | `/messages/managers` | "Not available on a shared device" |
| B2 | `bartender1` | `/messages/nope` | "Channel not found", with a link to Messages |
| C1 | `taproomDevice` | 412×915 | header on one line, no overlap |
| D1 | — | `curl -I …/manifest.webmanifest` | `application/manifest+json` |
| E1 | `bartender1` | extend an all-draft series | 404 |
| G1 | tablet, 2 tabs | "Sign in as me", activity only in tab A for 6 minutes | still signed in |
| H1 | spare session | Logout offline, then come online and reopen the app | the old token gets 401 |
| I1 | tablet | open "Sign in as me", type an email, walk away for 5:30 | shared screen; the email is gone |
| J1 | anyone | `/api/channels` answers `{"data":null}` (page.route) | the app still renders; any crash shows Reload |

## 5. Decisions (Matt, 2026-10-04)

| # | Decision |
|---|---|
| Q1 | **4051: retry later, plus `keepalive`** (Option 1). |
| Q2 | **4052: 5 minutes**, matching the idle return. Any key or tap restarts it, and returning clears the typed email. |
| Q3 | **3997 is bundled into D36.** Call it out in the PR and to Rick in conv 80. |
