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

Known gaps:
- **GAP:** the taproom device's view of events (D33).
