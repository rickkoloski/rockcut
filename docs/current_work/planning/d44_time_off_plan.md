# D44: Time off — Scheduler dialogs, archive, notifications — Plan

2026-11-16 · lead. **Spec:** `specs/d44_scheduler_time_off_dialogs_spec.md` (Q1–Q8 answered
2026-11-16). **Task:** none yet. **Branch:** `d44-time-off` in `~/src/rockcut`, from `develop` @
`184819c`.

The review API already takes, stores and returns `reviewer_note`; nothing sends or shows it. Nothing
in `RockcutApi.TimeOff` calls `Notifications`. View Schedule shows no time off; only the Scheduler's
`WeekGrid` does (off-marker chips from `useScheduleData`). Devices load no time off and
`GET /api/time_off` is refused for them; that stays.

## One rule for "past" (spec §2.4)

A request is **past** when the Colorado day of its `ends_at` is before today (Colorado). Put it in
one place in `RockcutApi.TimeOff` (e.g. `past?/1` and a query helper for "ends on or after the start
of today, Colorado", using the same Colorado-midnight helper as `Scheduling`), and use it for the
list filter, the review/cancel guards and the badge count. Don't change the existing `from`/`to`
filters (they still use UTC days; the Scheduler relies on them as they are).

## Stages (each its own commits; stops marked ■)

1. **API** (spec §2.2, §2.4, §2.5, §2.6, §2.7). Every rule gets an ExUnit test with a refusal and an
   allowed case.
   - **List filter:** `GET /api/time_off?when=current|past`. `current` = not past, `past` = past,
     newest first for `past`. No `when` = today's behavior. Unknown value → 422.
   - **Past is read-only:** `review` and `cancel` of a past request → 422 ("This time off has already
     passed"). That covers never-reviewed pending (Q5) and Remove of old approved time off.
   - **`time_off_requested`** (§2.5) after a pending create (own request), to everyone who could
     review it except the requester: active, non-device owners plus active managers of any of the
     requester's departments. One per person. Not for on-behalf creates (created approved).
     Payload `%{title, body, data: %{url: "/time_off"}}`, body: who, type, dates/"All day", note.
   - **`time_off_reviewed`** (§2.7) to the requester after approve or deny (including deny of an
     approved request = Remove), unless the reviewer is the requester. Body: approved/denied, type,
     dates, who decided, the reviewer's note if any.
   - Both events in `Notifications.@events` (normal defaults: bell + email, push opt-in). Delivery
     stays best-effort: a notification failure never fails the request.
   - **Badge count** (§2.6): `capabilities.pending_time_off` in `Accounts` capabilities = pending,
     not past, and visible to the user under `TimeOff.list_for` visibility (own + people they
     manage; owners all). A person's own request counts once. `Authz.Device.capabilities` → 0.
     Test: employee with/without a pending request, manager of the department, manager of another
     department (0), owner, a past pending request (not counted), devices (0).
   - ■ **Stop 1:** `mix test` green twice, `--warnings-as-errors` clean. Report.
2. **UI** (spec §2.1, §2.2, §2.4, §2.6, §2.8).
   - **One time off dialog** component (e.g. `components/timeoff/TimeOffDialog.tsx`): approved view
     with Remove (confirm step) for reviewers; pending view with Approve/Deny and an optional note;
     "Not reviewed" read-only for past pending; read-only for everyone else. Who sees buttons: the
     same rule the Time off page uses today (the API decides; the UI only hides what it would
     refuse).
   - **Scheduler:** clicking an off-marker chip in `WeekGrid` opens the dialog. Afterwards invalidate
     the `time_off` queries and `/api/me` (badge), so chips and conflict warnings refresh.
   - **View Schedule agenda** (§2.8): approved + pending time off rows per day (multi-day on each
     day), after the day's events and before its shifts; department filter applies by membership,
     a position filter hides them; click opens the dialog. Devices unchanged.
   - **Time off page:** main view loads `?when=current`; an Archive control loads `?when=past` on
     open (plain list, newest first, read-only, "Not reviewed" label); the reviewer note box on the
     page's own Approve/Deny; the employee sees the reviewer note on their requests (main view and
     Archive).
   - **Badges:** `pending_time_off` on the Schedule section icon (expanded and collapsed rail) and on
     the Time off item, like the Messages / User change log badges. Refresh `/api/me` after any
     create, review, cancel or Remove.
   - **Notification preferences:** both events in `EVENTS` with labels ("Time off requests to
     review", "Your time off request was decided"), defaults matching the API.
   - vitest for any helper (past/current split, agenda rows per day, badge rules if client-side).
   - Look at it in a browser as `bartender1`, `barMgr`, `breweryMgr`, `owner` and `taproomDevice`.
3. **Playwright + coverage.**
   - `rockcut-ui/tests/regression/timeoff/` specs from spec §4, one file per persona group.
     `[TEST-TEMP]` requests, cleaned up by id; never touch `[SEED]` rows. Past requests are made
     through the API with past dates (the create endpoint allows them; check). Notifications are
     asserted through the in-app records (`/api/notifications`), not email or push.
   - `tests/COVERAGE.md` D44 section.
   - ■ **Stop 2:** the full local gate.

## Gate

Workflow §3: `mix test` twice, `mix compile --warnings-as-errors`, `tsc`, `vite build`, vitest, lint
no worse than `develop`, full local Playwright. Then DEV: claim DEV (conv 80), `seed_synthetic()`,
the §4 scenarios plus a regression sweep of the Scheduler, View Schedule, Time off, Availability and
Notification preferences, and the independent QA pass.

## Risks

- **Who counts as a reviewer** must match `Authz.can?(_, :review, req)` exactly, or a manager gets a
  notification for something they can't approve (or misses one they can). Test the recipient list
  against `can?` for every synthetic persona.
- **Colorado day boundaries:** time off ending late evening Colorado time is already the next UTC
  day. Test a request ending 23:59 Colorado today (current) and yesterday (past).
- **Email volume:** every owner gets an email per request by default. Fine at Rockcut's size; people
  can turn it off in preferences.
- **Rollback:** no migration. The old image ignores `when`, so the old UI shows everything as before.
