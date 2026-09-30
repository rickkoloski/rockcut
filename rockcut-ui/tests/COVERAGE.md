# Test coverage map

Scenario → where it's tested (workflow §6). **GAP** means no automated test yet.
Started with D32; earlier deliverables' scenarios are added as they're touched.

## D31 — RBAC consolidation (`specs/d31_rbac_consolidation_spec.md`)

| # | Scenario | Layer |
|---|---|---|
| S1–S3 | Brewery routes redirect non-members; members get the page | Playwright `regression/brewery/route_gating.spec.ts` |
| S4–S8 | Behavior unchanged per persona (scheduler, time off, messages, users) | ExUnit `authz_parity/` (394 tests); DEV independent pass |

## D32 — Schedule events + Taproom rename (`specs/d32_schedule_events_spec.md`)

| # | Scenario | Layer |
|---|---|---|
| S1 | Manager adds a timed event from the Events row; persists as draft | Playwright `scheduler/events_manager` |
| S2 | Publish week publishes events (+ shifts); events notify nobody | Playwright `events_manager`; ExUnit `schedule_event_controller_test` (no Notification rows) |
| S3 | All-day two-day event shows "All day" on both days | Playwright `events_manager` |
| S4 | Employee sees a published event read-only; API 403 on change | Playwright `events_visibility`; ExUnit |
| S5 | Employee can't see a draft; API 404 | Playwright `events_visibility`; ExUnit |
| S6 | Other department's manager can't change it; can add their own | Playwright `events_visibility`; ExUnit `authz_events_test` |
| S7 | Two-department manager creates and publishes in both | Playwright `events_visibility`; ExUnit |
| S8 | Owner creates, edits, publishes anywhere | Playwright `events_visibility`; ExUnit |
| S9 | Overlapping shift gets no conflict warning | Playwright `events_manager` |
| S10 | "Taproom" in nav, channels, positions; position names unchanged | Playwright `scheduler/taproom_rename`, `smoke/roles` |
| S11 | Migration leaves an owner's own rename alone | **Manual** (scratch copy of the dev DB; recorded in the PR) |
| S12 | Add shift / Add event default to the viewed week (3940) | Playwright `scheduler/add_dialog_week` (revert-and-rerun recorded) |
| S13 | Weekly series: 8 Tuesday drafts; Publish week publishes one | Playwright `events_recurring`; ExUnit `schedule_event_series_test` |
| S14 | Monthly 3rd Sunday, 12-month cap, 7 PM across DST | Playwright `events_recurring`; ExUnit `recurrence_test` (Nov 1 / Mar 14) |
| S15 | "This only" vs "this and following" edits | Playwright `events_recurring`; ExUnit |
| S16 | Delete this only / this and following | Playwright `events_recurring`; ExUnit |
| S17 | Extend adds drafts past the old last date | Playwright `events_recurring`; ExUnit (idempotent, skips deleted dates) |
| S18 | Other personas can't change or extend a series; employees read-only | Playwright `events_recurring`; ExUnit |
| S19 | A Sunday-evening shift shows in its own week (Colorado day bounds) | Playwright `scheduler/sunday_shift` (revert-and-rerun recorded); ExUnit `shift_controller_test` |
| G2 | Saving an event someone else deleted shows a message and refreshes | Playwright `scheduler/events_dev_findings` |
| G3 | Moving a repeating date to another day ("this and following") moves later dates; API refuses a day move without a rule (422); split keeps the total count | Playwright `events_dev_findings`; ExUnit `schedule_event_series_test` |
| G4 | A long event title doesn't widen its day column | Playwright `events_dev_findings` |
| G5 / A4 | Ends by 3 AM → start day only; longer → each day with continuation labels | Playwright `events_dev_findings` |
| — | Extend with nothing to add says so | Playwright `events_dev_findings` |
| — | Unknown repeat type → 422 | ExUnit `schedule_event_series_test` |
| G1 | Concurrent writes (SQLite single writer) | **Manual** burst scripts on DEV (6 series at once, 2×365-date series + shift saves): all 201 with pool size 1. No automated load test; tracked with backlog 3855 |

Known gaps:
- **GAP:** the taproom device's view of events (D33).

## D33 — Taproom device access (`specs/d33_taproom_device_access_spec.md`)

| # | Scenario | Layer |
|---|---|---|
| S1 | Owner creates a device; not in Users & Roles, roster or assignees; change log | Playwright `devices/shared_devices_admin`; ExUnit `device_controller_test`, `device_account_test` |
| S2 | barMgr pairs a tablet in a second browser; listed with last seen | Playwright `devices/pairing`; ExUnit `device_controller_test`, `devices_test` |
| S3 | breweryMgr can't pair or revoke taproom tablets (403) | Playwright `devices/device_permissions`; ExUnit `device_controller_test` |
| S4 | Used, expired, wrong code refused; 6th wrong code rate-limited | ExUnit `devices_test`, `device_controller_test` (429); Playwright `pairing` (wrong-code message) |
| S5 | Password login as the device refused | ExUnit `device_account_test`, `synthetic_test` |
| S6 | Device nav and app bar | Playwright `devices/device_session`; ExUnit `device_session_api_test` |
| S7 | Published shifts/events only; claim 403 | Playwright `device_session`; ExUnit `authz_device_test`, `device_session_api_test`, `device_route_matrix_test` |
| S8 | All-staff + Taproom read-only; post 403; no Managers | Playwright `device_session`, `messaging/channel_urls`; ExUnit `authz_device_test`, `device_session_api_test` |
| S9 | Typed URLs → "Not available on a shared device"; API 403 | Playwright `device_session`; ExUnit `device_route_matrix_test` (every route) |
| S10 | Device not among All-staff recipients | ExUnit `device_account_test`, `authz_device_test` |
| S11 | Revoke one of two tablets | Playwright `pairing`; ExUnit `auth_plug_device_test`, `device_controller_test` |
| S12 | Deactivate → every tablet signed out | Playwright `device_permissions`; ExUnit `auth_plug_device_test` |
| S13 | Personal sign-in; 5-minute idle return without re-pairing | Playwright `devices/personal_signin` (mocked clock); **manual** on a real tablet (DEV) |
| S14 | Device never member/owner/assignee; 422 | ExUnit `device_account_test`, `authz_device_test`; Playwright `shared_devices_admin` (API 422) |
| 3939 | Unknown channel URL redirects; no 403 polling; failed send shows an error (every user) | Playwright `messaging/channel_urls` (revert-and-rerun recorded) |

