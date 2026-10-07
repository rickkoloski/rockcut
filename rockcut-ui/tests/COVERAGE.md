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
| S4 | Used, expired, wrong code refused; 6th wrong code rate-limited (IPv6 /64, global cap 50, atomic, header trusted only on Fly) | ExUnit `devices_test`, `devices/pairing_rate_limiter_test`, `device_controller_test` (429); Playwright `pairing` (wrong-code message); **DEV** header-spoof check |
| S5 | Password login as the device refused | ExUnit `device_account_test`, `synthetic_test` |
| S6 | Device nav and app bar | Playwright `devices/device_session`; ExUnit `device_session_api_test` |
| S7 | Published shifts/events only; claim 403 | Playwright `device_session`; ExUnit `authz_device_test`, `device_session_api_test`, `device_route_matrix_test` |
| S8 | All-staff + Taproom read-only; post 403; no Managers | Playwright `device_session`, `messaging/channel_urls`; ExUnit `authz_device_test`, `device_session_api_test` |
| S9 | Typed URLs → "Not available on a shared device"; API 403 | Playwright `device_session`; ExUnit `device_route_matrix_test` (every route) |
| S10 | Device not among All-staff recipients | ExUnit `device_account_test`, `authz_device_test` |
| S11 | Revoke one of two tablets | Playwright `pairing`; ExUnit `auth_plug_device_test`, `device_controller_test` |
| S12 | Deactivate → every tablet signed out | Playwright `device_permissions`; ExUnit `auth_plug_device_test` |
| S13 | Personal sign-in; 5-minute idle return without re-pairing, also across sleep (wake/tap/reload) | Playwright `devices/personal_signin` (mocked clock + `setSystemTime` sleep); **manual** on a real tablet (DEV) |
| S14 | Device never member/owner/assignee; 422; nobody (owners included) acts on behalf of a device | ExUnit `device_account_test` (incl. membership changeset), `authz_device_test` (owner → device); Playwright `shared_devices_admin` (API 422) |
| 3939 | Unknown channel URL redirects; no 403 polling; failed send shows an error (every user) | Playwright `messaging/channel_urls` (revert-and-rerun recorded) |

### D33 DEV fix cycle 1 (gaps from DEV pass 1)

| Gap | Layer |
|---|---|
| G1 deactivate revokes tablets; reactivation needs new pairings | ExUnit `devices_test`, `auth_plug_device_test` |
| G2 a personal session ends when its tablet is revoked/deactivated | Playwright `devices/personal_signin` (revoke + deactivate) |
| G3 other tabs re-sync; Availability load error | Playwright `personal_signin` (two tabs), `devices/availability_errors` |
| G4 sign-out only after a server revoke; stale tab can't unpair | Playwright `devices/device_signout` |
| G5 Deactivate confirmation | Playwright `shared_devices_admin`, `device_permissions` (S12) |
| G6 no Calendar sync; no refused requests on device pages | Playwright `device_session` |
| G7 unpaired tablet lands on setup with a notice | Playwright `pairing` (S11), `device_permissions` (S12), `device_signout` |
| G8 no email in any device-readable response | ExUnit `device_route_matrix_test` (walks every device-allowed route) |
| G9 no Pair button on a deactivated device; API 422 | Playwright `shared_devices_admin`; ExUnit `device_controller_test` |


## D34 — Revocable sign-in sessions + profile page (`specs/d34_session_revocation_spec.md`)

Specs that end, revoke or change a person's session use a throwaway `[TEST-TEMP]` person (`regression/auth/helpers.ts`), never a shared persona token.

| # | Scenario | Layer |
|---|---|---|
| S1 | Sign-in returns a working `ses_` token | ExUnit `session_revocation_test`, `sessions_test`; Playwright (every spec: minted persona tokens are sessions) |
| S2 | Logout → old token 401 | ExUnit `session_revocation_test` (revert-and-rerun recorded); Playwright `auth/session_revocation` (revert-and-rerun recorded: UI sent no token) |
| S3 | Logout in one browser; the other stays | ExUnit `session_revocation_test`; Playwright `auth/session_revocation` |
| S4 | Tablet Sign out revokes the personal token; typed sign-in sends `X-Rockcut-Device` | ExUnit `session_revocation_test`; Playwright `devices/personal_signin_revoke` |
| S5 | Idle return revokes it | Playwright `devices/personal_signin_revoke` (mocked clock) |
| S6 | Revoke unreachable → tablet still returns; 15-min idle / 12-h cap on the server | Playwright `personal_signin_revoke` (DELETE aborted); ExUnit `sessions_test` (timing); **manual**: a real tablet offline (DEV) |
| S7 | Revoking/deactivating/deleting a tablet ends sessions started on it; phone survives | ExUnit `sessions_test`, `session_revocation_test`; Playwright `personal_signin_revoke` (barMgr revoke) |
| S8 | Own password change revokes other sessions | ExUnit `session_revocation_test`; Playwright `auth/profile` (S18) |
| S9 | Owner reset revokes all | ExUnit `session_revocation_test` |
| S10 | Deactivation unchanged | ExUnit `session_revocation_test`, `sessions_test` |
| S11 | Made-up `ses_` → 401; stale/garbage device header → normal 30-day sign-in | ExUnit `session_revocation_test` |
| S12 | Pre-D34 token still accepted | ExUnit `session_revocation_test` |
| S13 | Pre-D34 token refused after reset / own change / sign-out-others | ExUnit `session_revocation_test` |
| S14 | Profile → Sign out of all other devices | ExUnit `session_revocation_test` (audit); Playwright `auth/session_revocation` |
| S15 | No profile during a personal sign-in on a tablet | Playwright `personal_signin_revoke` |
| S16 | Device → `DELETE /api/sessions/others` 403 | ExUnit `session_revocation_test`, `device_route_matrix_test` |
| S17 | Profile details, read-only; phone-width icon | Playwright `auth/profile` |
| S18 | Change password: wrong current, success, others signed out, new password works | Playwright `auth/profile` |
| S19 | Mismatch / too short refused | Playwright `auth/profile` |
| S20 | Device `/profile` → not available; no link | Playwright `auth/profile` |
| S21 | Show/hide toggle on login, forced reset, profile | Playwright `auth/password_toggle` |
| S22 | Managers/owners see only their own details | Playwright `auth/profile` (barMgr) |
| — | Synthetic sessions refused where the guard is off (prod) | ExUnit `synthetic_test` |

## D37 — Buy-a-Beer Board + staff codes (`specs/d37_buy_a_beer_board_spec.md`)

ExUnit files are under `rockcut_api/test/`; Playwright under `tests/regression/taproom/`
(`beer-board-replace` runs in its own `board-replace` project, see `RUNNING.md`).

| # | Scenario | Layer |
|---|---|---|
| S1 | barMgr sets `bartender1`'s code; masked on reopen, eye reveals; audits | Playwright `staff-codes` (S1); ExUnit `staff_codes_test` (set/reveal audits), `staff_code_controller_test` (S1) |
| S2 | Code in use refused; Suggest fills a free one | Playwright `staff-codes` (S2); ExUnit `staff_code_controller_test` (S2), `staff_codes_test` |
| S3 | Not a Taproom member: no section; PUT 422 | Playwright `staff-codes` (S3); ExUnit `staff_code_controller_test` (S3) |
| S4 | breweryMgr / bartender1: no section; GET/PUT 403 | Playwright `staff-codes` (S4); ExUnit `staff_code_controller_test` (S4) |
| S5 | bartender1 adds with no code prompt; persists; no History or file buttons | Playwright `beer-board-staff` (S5/S31: no History tab, no Export/Import); ExUnit `beer_board_controller_test` (S5), `beer_board_admin_controller_test` (staff 403 on export/import) |
| S6 | barMgr's History: "Sam Pour · created" | Playwright `beer-board-staff` (S6); ExUnit `beer_board_controller_test` (S6) |
| S7 | Tablet redeem with bartender2's code; toast; "on Shared Device" in History | Playwright `beer-board-device` (S7); ExUnit `beer_board_controller_test` (S7) |
| S8 | Tablet: last beer confirms, entry gone after reload; History 1 → 0 | Playwright `beer-board-device` (S7/S8), `beer-board-staff` (S8); ExUnit `beer_board_test`, `beer_board_controller_test` (S8/S17) |
| S9 | 5 wrong codes lock the tablet; message; nothing changes | Playwright `beer-board-device` (S9 ×2: inline error; lock message, mocked 429); ExUnit `beer_board_controller_test` (S9), `staff_codes/rate_limiter_test` |
| S10 | Tablet POST with no code → 422 `staff_code_required` | ExUnit `beer_board_controller_test` (S10), `device_route_matrix_test` (`@device_with_code`) |
| S11 | Tablet + barMgr's code: History, import, export 403; no tab or file buttons | ExUnit `beer_board_controller_test` (S11), `beer_board_admin_controller_test` (S11, all four routes), `device_route_matrix_test`; Playwright `beer-board-device` (S7: no History tab, no Export/Import) |
| S12 | bartender2 leaves the Taproom: code cleared; wrong on the tablet | Playwright `staff-codes` (S12); ExUnit `beer_board_controller_test` (S12), `staff_codes_test` (clearing) |
| S13 | Tablet "Sign in as me" → Redeem: no code prompt; History plain name | Playwright `beer-board-device` (S13: `[TEST-TEMP]` person, device-bound session, persist-verified); ExUnit `beer_board_controller_test` (S5/S6: a person's write logs no device); sign-in itself: Playwright `devices/personal_signin` (D33) |
| S14 | floater has the same access as bartender1 | Playwright `beer-board-staff` (S14); ExUnit `beer_board_controller_test` (S14/S16) |
| S15 | office1 / brewer1: no nav, URL goes Home, API 403 | Playwright `beer-board-staff` (S15); ExUnit `beer_board_controller_test` (S15) |
| S16 | owner: board, History, any Taproom member's code | Playwright `staff-codes` (S16, reveal); ExUnit `beer_board_controller_test` (S14/S16), `staff_code_controller_test` (S16) |
| S17 | Two bartenders on the last beer: one wins, the other "already removed" | Playwright `beer-board-staff` (S17); ExUnit `beer_board_test` (concurrent tasks), `beer_board_controller_test` (S8/S17) |
| S18 | Search "chr" matches either name; sort Bought by / Beers left | Playwright `beer-board-staff` (S18) |
| S19 | Edit count 2 → 5; History "edited · 2 → 5" | Playwright `beer-board-staff` (S19); ExUnit `beer_board_controller_test` (S19) |
| S20 | Export CSV: header + rows, comma name intact (and History export) | Playwright `beer-board-import` (S20 ×2); ExUnit `beer_board_csv_test` (S20), `beer_board_admin_controller_test` (S20) |
| S21 | Import Add: 1 New, 2 groups; Confirm waits | Playwright `beer-board-import` (S21); ExUnit `beer_board_import_test` (S21), `beer_board_admin_controller_test` (S21/S22) |
| S22 | Combine Pat ("Chris & Lee"), Allow Sam; reload; History (import) | Playwright `beer-board-import` (S22); ExUnit `beer_board_import_test` (S22) |
| S23 | Pick: uncheck the board entry; warning; History deleted + created | Playwright `beer-board-import` (S23); ExUnit `beer_board_import_test` (S23) |
| S24 | Combine unavailable over 99; Allow / Pick work | Playwright `beer-board-import` (S24); ExUnit `beer_board_import_test` (S24 ×2) |
| S25 | Replace: count + beers warning, group, `REPLACE`; board = file | Playwright `beer-board-replace` (S25); ExUnit `beer_board_import_test` (S25), `beer_board_admin_controller_test` (S25) |
| S26 | Row errors by row number; nothing imported | Playwright `beer-board-import` (S26); ExUnit `beer_board_csv_test` (S26), `beer_board_admin_controller_test` (S26) |
| S27 | Board changed before Confirm → 409; Re-preview shows the new member | Playwright `beer-board-import` (S27); ExUnit `beer_board_import_test` (S27 + count change, Replace signature), `beer_board_admin_controller_test` (S27) |
| S28 | Export then Replace with it: same lines and dates, imported today | Playwright `beer-board-replace` (S28); ExUnit `beer_board_import_test` (S28), `beer_board_csv_test` (S28/S29) |
| S29 | `=HYPERLINK(...)` exported with `'`, re-imports intact | Playwright `beer-board-import` (S29); ExUnit `beer_board_csv_test` (S29, S28/S29) |
| S30 | No date column → import date; filled date kept; `M/D/YYYY` accepted | Playwright `beer-board-import` (S30); ExUnit `beer_board_csv_test` (S30, Excel US dates), `beer_board_import_test` (S30) |
| S31 | Added by hand: moved off today, Imported blank | Playwright `beer-board-staff` (S5/S31); ExUnit `beer_board_test` (create) |
| — | Synthetic seed: `[SEED]` entries, persona codes from `SYNTHETIC_STAFF_CODES` (set, skipped when unset, leftovers cleared, bad list refused), `[TEST-TEMP]` cleanup, idempotent | ExUnit `seeds/synthetic_test` |
| — | Tablet numeric keypad for the staff code (Pixel / Samsung) | **Manual** on DEV (plan LIMITATIONS) |
| — | CSV download from the Android Chrome PWA (fetch + Blob) | **Manual** on DEV |
| — | A real Excel or Numbers export imports (fixture is hand-made) | **Manual** on DEV |
| — | `STAFF_CODE_KEY` missing → API refuses to boot | **Manual** on DEV (first deploy) |

### D37 DEV pass 1 (gaps from the DEV QA report)

| Gap | Layer |
|---|---|
| G1 a manager renames someone and removes them from their department in one save (no "Forbidden"; Taproom code cleared) | Playwright `auth/manager_removes_member` (barMgr / Taproom with a code; breweryMgr / Brewery); D35 owner-flag order: `scheduler/calendar_feed_rotation` |
| G2 the 5th wrong code locks (spec S9 reworded) | as S9 |
| G3 a typed code is masked in Users & Roles; the eye shows it with no fetch; hidden on reopen | Playwright `staff-codes` (DEV pass 1 G3: computed `-webkit-text-security`) |
| G4 a pasted `" 1234"`, `"12-34"`, `"12 34"`, `"123456"` keeps 4 digits | Playwright `beer-board-device` (DEV pass 1 G4: `fill` and `insertText`, no submit) |
| G5 other columns are ignored and listed; missing/repeated still errors | ExUnit `beer_board_csv_test` (G5), `beer_board_admin_controller_test` (G5: preview `ignored_columns` + apply); Playwright `beer-board-import` (DEV pass 1 G5) |
| G8 History's labels (spec wording) | as S6, S7, S19, S22, S23 |
| G9 after "Only N left" the Redeem dialog shows the fresh count, stepper and last-beer wording | Playwright `beer-board-staff` (DEV pass 1 G9: API redeem by bartender2 mid-dialog) |
