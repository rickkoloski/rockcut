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

## D38 — Brewery Task Board (`specs/d38_brewery_task_board_spec.md`)

D38's rows only (spec "Delivery split"): S9g, S32–S37a, S42–S48, S49's staff code and S50 are D40;
S52–S69 are D39. ExUnit files are under `rockcut_api/test/` (`tasks_test` = the context,
`placement_test` = `tasks/placement_test`, controller = `task_board_controller_test`);
Playwright under `tests/regression/brewery/`, all `task-board-*` in the one-worker `brewery-board`
project (see `RUNNING.md`).

| # | Scenario | Layer |
|---|---|---|
| S1 | Two rows of 7 days; brewer1's header "name · position · times · hours" | Playwright `task-board-header` (S1 ×3: shift line, two shifts with total hours, an open shift); ExUnit `task_board_test` (published Brewery only, roster order, Colorado day) |
| S2 | No published Brewery shifts → "No brewers scheduled"; Daily card stays | Playwright `task-board-header` (S2); ExUnit `task_board_test` |
| S3 | A draft shift stays off the header, for the manager too, until published | Playwright `task-board-header` (S3, breweryMgr); ExUnit `task_board_test` (published only) |
| S4 | A published all-day Brewery event shows; a Taproom event doesn't | Playwright `task-board-header` (S4); ExUnit `task_board_test` (events) |
| S5 | Approved time off isn't shown | Playwright `task-board-header` (S5) |
| S6 | + Add a task on today: bottom, unassigned, persists | Playwright `task-board-tasks` (S6); ExUnit `tasks_test` (create) |
| S7 | Assign to brewer1: initials, no notification, My tasks filter | Playwright `task-board-tasks` (S7: brewer1's `/api/notifications` checked); ExUnit `tasks_test` (assigned event, eligible assignee), `authz_test` (who can be assigned) |
| S8 | Check on today: no dialog, struck through with ✓ name; uncheck clears | Playwright `task-board-tasks` (S8); ExUnit `tasks_test` (own day, uncomplete) |
| S8a | Unfinished → On today: leaves the card, on today after its own tasks, "planned …" | Playwright `task-board-finish-elsewhere` (S8a); ExUnit `tasks_test` (each display), `placement_test` (finished-elsewhere order) |
| S8b | On both days: in place "done …" and on today "planned …"; neither drags | Playwright `task-board-finish-elsewhere` (S8b), `task-board-drag` (finished elsewhere can't be dragged); ExUnit `placement_test` (both, both locked) |
| S8c | On its planned day: done only there | Playwright `task-board-finish-elsewhere` (S8c); ExUnit `tasks_test` |
| S8d | Uncheck the "both" copy on today → confirm → open on its day, amber, on Unfinished | Playwright `task-board-finish-elsewhere` (S8d); ExUnit `tasks_test` (uncomplete clears all four fields) |
| S8e | Cancel: still open, nothing logged | Playwright `task-board-finish-elsewhere` (S8e) |
| S8f | `complete` with no `display` off its own day → 422 `display_required` | Playwright `task-board-finish-elsewhere` (S8f, API); ExUnit `tasks_test` (S8f), controller (needs a display) |
| S8g | A future-day task finished early asks too; On today moves it | Playwright `task-board-finish-elsewhere` (S8g); ExUnit `tasks_test` (past and future day) |
| S9 | Delete after a confirm; gone after a reload | Playwright `task-board-tasks` (S9); ExUnit `tasks_test` (delete keeps history) |
| S9a | Menu: Add notes → Notes focused → notes icon, "Edit notes"; bottom sheet at phone width | Playwright `task-board-tasks` (S9a, menu), `task-board-phone` (S9a ×2: sheet, locked moves greyed; back closes the sheet, ×2) |
| S9b | Change day… 6 weeks out: out of the range, bottom of that day | Playwright `task-board-tasks` (S9b); ExUnit `tasks_test` (day change → bottom) |
| S9c | Mark completed on yesterday's task → the same dialog | Playwright `task-board-finish-elsewhere` (S9c) |
| S9d | A finished-elsewhere card: Change day / Move up / Move down greyed, "Mark not done first to move it" | Playwright `task-board-tasks` (S9d), `task-board-phone` (S9a locked); ExUnit `tasks_test` (locked can't move or change day) |
| S9e | Long-press on the Pixel starts a drag, not the menu; a short tap opens the menu | **Manual** (DEV, Pixel, brewer1; plan LIMITATIONS checklist 1). Playwright `task-board-phone` (S15) drives the long press with emulated touch only |
| S9f | Hide completed on every day, remembered after a reload | Playwright `task-board-tasks` (S9f) |
| S10 | History: added, assigned, completed, uncompleted, moved, deleted, with who and when | Playwright `task-board-history` (S10 ×2, plus Load more and one task's history); ExUnit `tasks_test` (list_events), controller (history) |
| S11 | brewer1: no History; API 403 | Playwright `task-board-history` (S11); ExUnit controller (permissions), `authz_test` |
| S12 | Drag the 3rd task to the top; persists, for brewer2 too | Playwright `task-board-drag` (S12, mouse); ExUnit `tasks_test` (S12) |
| S13 | Drag from today to day 9 between two tasks; both counts update | Playwright `task-board-drag` (S13); ExUnit `tasks_test` (S13) |
| S14 | Keyboard move across days; Escape puts it back | Playwright `task-board-drag` (S14 ×2); a refused move snaps back with a toast (forced 500); Vitest `components/dnd/moveModel.test.ts` |
| S15 | Phone width: one day at a time; long-press reorders; a swipe changes day | Playwright `task-board-phone` (layout, strip and counts, arrows, swipe vs vertical, S15 long-press reorder with emulated touch, and to the very bottom of a day ending in a finished-elsewhere card). Touch on real hardware: **Manual** (DEV, Pixel; plan LIMITATIONS checklist 1–7) |
| S16 | Two people move one task at once: both succeed, last wins, boards agree | Playwright `task-board-tasks` (S16, two contexts; a reload stands in for the 60-second refresh); ExUnit `tasks_test` (concurrent moves, lists dense). The refresh with real latency: DEV |
| S17 | Empty or 201-character title: inline error, nothing saved | Playwright `task-board-tasks` (S17); ExUnit `tasks_test` (title length) |
| S18 | Unfinished card first: open past tasks with dates, not done tasks or Daily | Playwright `task-board-range` (S18); ExUnit `placement_test` (overdue list), `task_board_test` (Unfinished ignores the range) |
| S19 | Drag from the Unfinished card onto day 2 | Playwright `task-board-range` (S19) |
| S20 | Move all to today: confirm; own tasks first, then oldest-first; 3 moves logged | Playwright `task-board-range` (S20, S21); ExUnit `tasks_test` (S20 order and events), controller (count) |
| S21 | No open past tasks → no Unfinished card | Playwright `task-board-range` (S20, S21), `task-board-future` (S23h) |
| S22 | All-past range: amber edge, Unfinished still lists them, Previous/Next by its length, Today resets | Playwright `task-board-range` (S22) |
| S23 | Over 31 days: "Up to 31 days", not applied | Playwright `task-board-range` (S23); ExUnit controller (422 `range_too_long`) |
| S23a | 1 week is this browser's default (reload, Today); another browser opens on 2 weeks | Playwright `task-board-range` (S23a) |
| S23b | Custom range highlights neither side; Today uses the default; 2 weeks starts from From | Playwright `task-board-range` (S23b) |
| S23c | + Add a task on Future: bottom, no date, survives a reload and a range change | Playwright `task-board-future` (S23c); ExUnit `tasks_test` (create on Future) |
| S23d | Drag a Future task onto a day between two tasks | Playwright `task-board-future` (S23d); ExUnit `tasks_test` (S23d) |
| S23e | Drag a day's task onto Future between two; History "→ Future" | Playwright `task-board-future` (S23e); ExUnit `tasks_test` (S23e) |
| S23f | Change day… from Future 5 weeks out; Move to Future | Playwright `task-board-future` (S23f), `task-board-phone` (sheet); ExUnit `tasks_test` (No day → bottom of Future) |
| S23g | Check a Future task: no dialog, done on today "from Future"; Mark not done → bottom of Future | Playwright `task-board-future` (S23g); ExUnit `tasks_test` (S23g), `placement_test` |
| S23h | Open Future tasks only: no Unfinished card, no Move all | Playwright `task-board-future` (S23h). The reminder half is D40 (S32) |
| S23i | Empty Future list still shows its message | Playwright `task-board-future` (S23i) |
| S23j | Phone: the strip's Future stop shows the list and its + Add a task | Playwright `task-board-phone` (S23j) |
| S24 | Tick Temps, Pressures: 2/4 with who and when; brewer2 sees it; untick → 1/4 | Playwright `task-board-daily` (S24 ×2, incl. a refused tick snapping back); ExUnit `daily_test` (tick/untick, events) |
| S25 | Tomorrow's checks disabled; API 422 | Playwright `task-board-daily` (S25); ExUnit `daily_test` (S25), controller |
| S26 | Yesterday 3/4 amber; the 4th can be ticked | Playwright `task-board-daily` (S26); ExUnit `daily_test` (S26) |
| S27 | A Daily card doesn't drag | Playwright `task-board-daily` (S27) |
| S28 | Add DO, drag it first, rename Temps; past days keep their counts out of 4 | Playwright `task-board-daily-items` (S28 ×2: drag, Move up/down); ExUnit `daily_test` (S28, which items a day counts) |
| S29 | Retire Backups: today 3 items, yesterday still ✓ Backups | Playwright `task-board-daily-items` (S29); ExUnit `daily_test` (S29) |
| S30 | brewer1: no Edit Daily items; `POST /api/boards/brewery/daily_items` 403 | Playwright `task-board-daily-items` (S30); ExUnit controller (permissions) |
| S31 | 13th item "Up to 12 items"; duplicate "Already on the list" | Playwright `task-board-daily-items` (S31); ExUnit `daily_test` (cap, duplicate), controller |
| S38 | floater: same access as brewer1 | Playwright `task-board-access` (S38); ExUnit `authz_test` |
| S39 | bartender1 / office1: no nav, URL goes Home, every D38 route 403 | Playwright `task-board-access` (S39, both personas); ExUnit controller (Taproom-only 403 on every route), `authz_test` |
| S40 | owner (no memberships): Tasks, History, Edit Daily items | Playwright `task-board-access` (S40); ExUnit controller, `authz_test` |
| S41 | taproomDevice: `GET /api/boards/brewery/tasks` 403 | Playwright `task-board-access` (S41); ExUnit controller (a device gets 403 on every route), `device_route_matrix_test` (people-only), `authz_test` |
| S49 | Leaving the Brewery: open tasks unassigned; done task and Daily check keep the name (the code is D40) | ExUnit `accounts_test` (S49 ×3: memberships, deactivation, staying), `tasks_test` (S49). No Playwright: the Users & Roles save is D37's `auth/manager_removes_member` (breweryMgr), which doesn't look at tasks |
| S51 | 11:30 pm Colorado is still that day | ExUnit `tasks_test` (S51: MST, MDT, midnight, completion day). "Today" on DEV's UTC machine after 6 pm Colorado: DEV (LIMITATIONS) |
| — | Synthetic seed: `[SEED]` tasks, Daily checks, a Brewery event relative to today; idempotent; `[TEST-TEMP]` cleanup; reset restores the four items | ExUnit `seeds/synthetic_test` (D38) |
| — | Migrations: four default Daily items for the Brewery department; reversible | ExUnit `tasks_test` (new department gets the items); **Manual** rollback on a scratch copy of the dev DB (2026-10-11, in the handoff note) |
| — | `@dnd-kit` in the release build / PWA bundle | **Manual** on DEV (`pnpm audit --prod`, `check-bundle-versions.mjs`) |

### D38 DEV pass 1 (gaps from the DEV QA report)

| Gap | Layer |
|---|---|
| G1 a stale Edit dialog sends only the changed fields (a notes save keeps someone else's rename; nothing changed → no request); same for an unchanged Daily item rename after the list refetched | Playwright `task-board-tasks` (G1: brewer1 + brewer2 contexts, request body + persist-verify), `task-board-daily-items` (G1: owner renames via the API, a reorder refetches the list) |
| G2 the Daily tick label (spec S24 reworded) | as S24 |
| G3 `PATCH /api/boards/brewery/daily_items/:id {active: true}` on a retired item → 422 `retired`, still retired | ExUnit controller (G3) |
| G4 a past day (and today) shows only items that existed that day plus any ticked that day; ticking a day before an item was added → 422 `not_yet_added`; an item added today shows and ticks today | ExUnit `daily_test` (G4 ×4: rows and counts, the tick refused, added today, a check from before the fix), controller (G4: 422 + the board row); Playwright `task-board-daily-items` (G4: rows, count, 422, persist-verify, the toast on a stale board) |
| S29 | Playwright `task-board-daily-items` (S29) now ticks the `[TEST-TEMP]` item **today** (a just-added item can't be ticked yesterday); a tick on an earlier day stays in ExUnit `daily_test` (S29) |

### D38 DEV pass 2 (Matt's Pixel checks)

| Gap | Layer |
|---|---|
| A a long-press drag to the very bottom of a day lands there: below the day's own tasks, above any card finished there from another day (those always sort last), and the placeholder shows that spot | Playwright `task-board-phone` (S15 very bottom: today with 4 `[TEST-TEMP]` tasks and a finished-from-yesterday card, the page auto-scrolled to its end, placeholder position, `move` body `before_id: null`, persist-verify) |
| B Android back with the task sheet open closes the sheet only; the URL stays `/tasks/brewery` and the next back leaves the board; a sheet closed by tapping outside leaves no extra back | Playwright `task-board-phone` (Back closes the sheet; tapping outside). The real back gesture on the Pixel: **Manual** (DEV) |

## D39 — Recurring tasks + D38 follow-ups (`specs/d38_brewery_task_board_spec.md` §3.10, §5)

D39's rows only (spec "Delivery split"): S52–S67 and S69–S78; S68 (the staff code on the tablet)
is D40. ExUnit files are under `rockcut_api/test/` (`series_test` and `series_edits_test` =
`tasks/…`, `recurrence_test` = `scheduling/recurrence_test`, controllers =
`task_series_controller_test` and `task_followups_controller_test`); Vitest under
`src/lib/` (`repeat.test`, `tasks.test`); Playwright under `tests/regression/brewery/`, in the
one-worker `brewery-board` project. `task-board-phone` emulates the Pixel (412 px, touch, CDP
long-press); the real gestures on hardware are **Pixel (manual)** on DEV.

| # | Scenario | Layer |
|---|---|---|
| S52 | Weekly on Wed: "Repeats every week on Wed", ↻ on every Wednesday, 11 months out too | Playwright `task-board-recurring` (S52, S67); ExUnit `series_test` (S52: through today + 12 months), `recurrence_test` (weekly); Vitest `repeat.test` (defaultRule, taskRepeatSummary) |
| S53 | Every 2 weeks on Mon and Thu, from this week | Playwright `task-board-recurring` (S53); ExUnit `series_test` (S53), `recurrence_test` (weekly) |
| S54 | Monthly on day 31: the last day in shorter months | Playwright `task-board-recurring` (S54); ExUnit `series_test` (S54) |
| S55 | Monthly on the last Friday | Playwright `task-board-recurring` (S55); ExUnit `series_test` (S55), `recurrence_test` (monthly by weekday) |
| S56 | Quarterly on the 15th from Oct 15 | Playwright `task-board-recurring` (S56); ExUnit `series_test` (S56) |
| S57 | Annually on Mar 1, after 3 times | Playwright `task-board-recurring` (S57); ExUnit `series_test` (S57), `recurrence_test` (ends) |
| S58 | Checking this week's leaves next week's open | Playwright `task-board-recurring` (S58); ExUnit `series_test` (S58) |
| S59 | A drag to Thu moves only that one; no second copy | Playwright `task-board-recurring` (S59); ExUnit `series_edits_test` (moves: S59, Decision 4 onto Future) |
| S60 | Edit → Just this one: only that week changes | Playwright `task-board-recurring` (S60, S69, S61: request body + persist-verify); ExUnit `series_edits_test` (edit "this") |
| S61 | Edit → This and all following: later ones change, earlier and own-changed ones don't | Playwright `task-board-recurring` (S60, S69, S61); ExUnit `series_edits_test` (edit "following", content only) |
| S62 | Rule change weekly → monthly first Wed, after the confirm (Decision 2) | Playwright `task-board-recurring` (S62); ExUnit `series_edits_test` (edit "following" with a new rule); Vitest `repeat.test` (removeLaterWording) |
| S63 | Stop repeating: "Removes 40 later occurrences"; keep or remove the own-changed ones | Playwright `task-board-recurring` (S63); ExUnit `series_edits_test` (stop repeating) |
| S64 | Delete Just this one: gone, not made again | Playwright `task-board-recurring` (S64 and delete "This and all following"); ExUnit `series_test` (delete "this"), `series_edits_test` (delete "following") |
| S65 | 3 missed occurrences on Unfinished; Move all to today | Playwright `task-board-recurring` (S65: three missed occurrences); ExUnit `series_edits_test` (S65) |
| S66 | The daily scan adds one more week; a second run adds nothing | **ExUnit only** `series_test` (top_up ×7: a day later, a week later, no History, until, count, skipped dates, no duplicates): a scheduler job with no UI, and Playwright can't move the clock |
| S67 | Add with No day: Repeat disabled, "Pick a day to repeat" | Playwright `task-board-recurring` (S52, S67); ExUnit controller `task_series_controller_test` (repeat_needs_day) |
| S69 | Editing only an occurrence's notes asks Just this one / This and all following | Playwright `task-board-recurring` (S60, S69, S61: the scope dialog); ExUnit `series_edits_test` (scope: scope_required, a one-off ignores it), controller (scope_required) |
| S70 | First visit at phone width is the vertical view; one day survives a reload | Playwright `task-board-phone` (S70); **Pixel (manual)** |
| S71 | Long-press drag down to day 3, the page scrolling; lands where dropped | Playwright `task-board-phone` (S71: CDP touch, auto-scroll, persist-verify); **Pixel (manual)**: the real long-press and edge scroll |
| S72 | Long-press drag off the Unfinished card onto tomorrow | Playwright `task-board-phone` (S72); **Pixel (manual)** |
| S73 | One-day view on today: from Unfinished to between today's first and second | Playwright `task-board-phone` (S73); Vitest `tasks.test` (boardMoveRule); **Pixel (manual)** |
| S74 | Long-press drag onto the Future list | Playwright `task-board-phone` (S74); **Pixel (manual)** |
| S75 | Restore Temps: at the bottom, old ticks kept, the retired days keep their counts (Decision 5); refused at 12 | Playwright `task-board-daily-items` (S75: same-day retire/restore, the 12-item refusal); ExUnit `daily_test` (restore_item, retired spans ×5), controller `task_followups_controller_test` (restore). The retired-days rule is **ExUnit only**: Playwright can't backdate the History events |
| S76 | Back closes the Edit dialog, "where should it show" and Change day…; the board stays | Playwright `task-board-phone` (S76 ×3: each dialog, the sheet → dialog handover, Cancel leaves no dead back); **Pixel (manual)**: the real back gesture |
| S77 | Saving a dialog for a task someone deleted: "This task was deleted"; nothing recreated | Playwright `task-board-tasks` (S77: brewer1 + brewer2 contexts); ExUnit controller `task_followups_controller_test` (O-1, S77: 410 deleted vs 404); Vitest `tasks.test` (taskGone / taskError) |
| S78 | Editing a one-off can make it repeat; Future needs a day; a finished one has no Repeat; one History entry | Playwright `task-board-recurring` (S78, breweryMgr); ExUnit `series_edits_test` (making a one-off repeat ×4), controller (PATCH with repeat); Vitest `tasks.test` (made_repeating) |
| — | Decision 1 (O-3): a retired item ticked today shows a disabled box; untick refused | Playwright `task-board-daily-items` (Decision 1); ExUnit `daily_test`, controller `task_followups_controller_test` |
| — | GAP-1 / GAP-2: any PATCH on a retired item is 422 `retired` | ExUnit `daily_test` (GAP-1), controller `task_followups_controller_test` (GAP-1, GAP-2) |
| — | O-2: the Edit Daily items dialog picks up a rename on the board's refetch | Playwright `task-board-daily-items` (O-2) |
| — | Nothing is dropped onto the Unfinished card, at any width | Playwright `task-board-range` (a task dragged over the Unfinished card); Vitest `tasks.test` (boardMoveRule) |
| — | History reads the series actions | Playwright `task-board-recurring` (History reads the series actions, breweryMgr); Vitest `repeat.test` (summaryFromDetail) |

## D41 — Department task boards (`specs/d41_department_task_boards_spec.md`)

S101–S120. ExUnit files are under `rockcut_api/test/`: `task_boards_test` (the context per
board), controllers `task_boards_controller_test` (the board in the path, S115 over HTTP,
`/api/me`'s `task_boards`, the All departments route), `authz_parity/task_boards_test` (every
persona × every board, and the All departments view), `device_route_matrix_test` (devices:
403 on every board route), `seeds/synthetic_test` (the seed). Vitest under `src/lib/`
(`tasks.test`). Playwright `tests/regression/tasks/task-board-departments.spec.ts` and the
brewery folder (S117), all in the one-worker `brewery-board` project.

| # | Scenario | Layer |
|---|---|---|
| S101 | bartender1: nav → Tasks opens "Taproom tasks", no switcher, Taproom shifts, no Daily card | Playwright `task-board-departments` (S101); ExUnit `task_boards_test` (the header is the board's department's) |
| S102 | bartender1: typed `/tasks/brewery` → `/tasks/bar`; the Brewery API 403 | Playwright `task-board-departments` (S102); ExUnit controller `task_boards_controller_test` (S102, S114), `authz_parity/task_boards_test`; Vitest `tasks.test` (boardTarget) |
| S103 | floater: switcher lists Brewery and Taproom; `/tasks` reopens the remembered one | Playwright `task-board-departments` (S103); Vitest `tasks.test` (boardTarget, the remembered board) |
| S104 | owner: all four boards (then All departments), History and Daily items on each | Playwright `task-board-departments` (S104); ExUnit controller (`/api/me` task_boards), `authz_parity/task_boards_test` |
| S105 | bartender1: only Taproom members to assign; brewer1 through the API → 422 | Playwright `task-board-departments` (S105); ExUnit `task_boards_test` (S105), controller (S105); Vitest `tasks.test` (taskSaveError) |
| S106 | floater: a weekly series on the Brewery shows only there | Playwright `task-board-departments` (S106); ExUnit `task_boards_test` (an occurrence of another board's series is not found) |
| S107 | barMgr: Set up Daily checks → "Lines cleaned", Taproom card "Daily 0/1"; the Brewery's keeps its four | Playwright `task-board-departments` (S107–S108); ExUnit `task_boards_test` (Daily items only on their board) |
| S108 | barMgr: History is Taproom events only | Playwright `task-board-departments` (S107–S108); ExUnit `task_boards_test` (History is per board, events carry the department), controller (S108) |
| S109 | breweryMgr: typed `/tasks/bar` → `/tasks/brewery`; Taproom History 403 | Playwright `task-board-departments` (S109); ExUnit controller (S109, S110), `authz_parity/task_boards_test` |
| S110 | splitRole: manager tools on the Taproom board, none on the Brewery's | Playwright `task-board-departments` (S110); ExUnit controller (S109, S110), `authz_parity/task_boards_test` |
| S111 | dualMgr: Taproom and Office, manager tools on both | Playwright `task-board-departments` (S111); ExUnit controller (`/api/me` task_boards) |
| S112 | owner removes a `[TEST-TEMP]` person from the Taproom: only the Taproom task unassigned | Playwright `task-board-departments` (S112, Users & Roles); ExUnit `task_boards_test` (leaving a department clears only that board, deactivated: every board); Vitest `tasks.test` (History "left the Taproom") |
| S113 | brewer1: old `/brewery/tasks` → `/tasks/brewery`, 1 week / Hide completed kept | Playwright `task-board-departments` (S113), `brewery/task-board-range` (an old link keeps its range); Vitest `tasks.test` (the storage-key fallback) |
| S114 | noDept: no Tasks entry, URL → Home, 403; the Taproom tablet 403 | Playwright `task-board-departments` (S114 ×2); ExUnit controller (S102, S114), `device_route_matrix_test` |
| S115 | floater: a Brewery id on the Taproom board → 404, unchanged; brewer1 → 403 | Playwright `task-board-departments` (S115, over HTTP); ExUnit `task_boards_test` (each board keeps to itself), controller (S115: every task and Daily item route) |
| S116 | The daily scan tops up a Taproom and a Brewery series, each on its own board | **ExUnit only** `task_boards_test` (the top-up covers every board): a scheduler job with no UI |
| S117 | brewer1: every D38/D39 scenario on `/tasks/brewery` | Playwright the brewery folder (`tests/regression/brewery/`), paths and names updated only; ExUnit the D38/D39 suites, renamed only |
| S118 | owner: switcher → All departments; Brewery then Taproom today with Daily counts, Office and the Brewery's Daily count tomorrow, no Sales, no header | Playwright `task-board-departments` (S118); ExUnit `task_boards_test` (all_boards), controller (S118: tagged cards, Daily counts); Vitest `tasks.test` (departmentSections, switcher) |
| S119 | owner: nothing draggable or tickable; a Taproom card opens `/tasks/bar` at its day, where it can be changed | Playwright `task-board-departments` (S119; S119 at phone width, one-day view); ExUnit controller (every other route under `all` is 404); Vitest `tasks.test` (allBoardCardLink, rangeForDay) |
| S120 | breweryMgr, floater: no All departments; `/tasks/all` → their board; API 403 | Playwright `task-board-departments` (S120 ×2); ExUnit controller (S120, devices included), `authz_parity/task_boards_test` (All departments rows); Vitest `tasks.test` (boardTarget never picks `all`) |
| — | Seed: Taproom and Office `[SEED]` tasks, Sales empty, Daily items only on the Brewery; `cleanup_temp` and `reset` on every board | ExUnit `seeds/synthetic_test` (the other boards, D41 ×4) |
| — | The rename migrations on DEV's real D38/D39 data; the installed PWA's old link; the switcher and header against DEV's schedule | **Manual on DEV** (handoff note LIMITATIONS) |

## D42 — Task board follow-ups + required password reset (`specs/d42_task_board_follow_ups_spec.md`)

S121–S142. ExUnit files are under `rockcut_api/test/`: `rockcut_api_web/plugs/password_reset_gate_test`
(§2.1), controllers `task_boards_controller_test` (S124), `task_board_controller_test` (the header
key), `daily_item_delete_test` (§2.4), `task_series_controller_test` (the series preview, §2.6),
`device_route_matrix_test` (the new DELETE route), `rockcut_api/tasks/series_edits_test` ("notes
only", §2.5 and the keep offer), `rockcut_api/tasks/series_ends_test` (§2.6 and R2, §3). Vitest
under `src/lib/` (`tasks.test`, `repeat.test`). Playwright
`tests/regression/tasks/task-board-follow-ups.spec.ts`, in the one-worker `brewery-board` project.

| # | Scenario | Layer |
|---|---|---|
| S121 | newhire (reset required): board 403, beer board 403, `/api/me` 200 | Playwright `task-board-follow-ups` (S121, API); ExUnit `password_reset_gate_test` (19 routes across areas and both pipelines, the four allowed ones, devices unaffected) |
| S122 | a `[TEST-TEMP]` person after an owner resets their password: a write 403, new password, then 200 | **ExUnit only** `password_reset_gate_test` (S122; also a person created with a temporary password): the reset signs the person out everywhere, so the browser side is S123 |
| S123 | a person with a temporary password signs in: "Set a new password", then the board works | Playwright `task-board-follow-ups` (S123, a `[TEST-TEMP]` person) |
| S124 | floater: a Taproom task's id as a Brewery move's `before_id` → 404, nothing changes | Playwright `task-board-follow-ups` (S124, API); ExUnit controller `task_boards_controller_test` (S124; a same-board `before_id` still works), `tasks_test` (a stale one goes last) |
| S125 | bartender1: Taproom day with no one scheduled → "No one scheduled" from `no_one_scheduled` | Playwright `task-board-follow-ups` (S125, also the API key); ExUnit controller `task_board_controller_test` (header) |
| S126 | barMgr: add "[TEST-TEMP] Typo", retire, Delete; History "Deleted the Daily item"; no day's count changes | Playwright `task-board-follow-ups` (S126, persist-verified); ExUnit `daily_item_delete_test` (S126) |
| S127 | breweryMgr: a retired item ticked once has no Delete; API 422 `has_ticks` | Playwright `task-board-follow-ups` (S127); ExUnit `daily_item_delete_test` (S127) |
| S128 | breweryMgr: DELETE an active item → 422 `not_retired`; a Taproom item → 403 | Playwright `task-board-follow-ups` (S128, API); ExUnit `daily_item_delete_test` (S128; another board's id 404, owners may) |
| S129 | brewer1: notes on one "just this one", then "following" title + notes from earlier: that one keeps its notes | **ExUnit only** `series_edits_test` ("notes only": S129, notes reach only the ones whose notes were the series'): no UI change |
| S130 | brewer1: a title on one "just this one", then "following" title: that one keeps its title | **ExUnit only** `series_edits_test` (S130); Playwright `brewery/task-board-recurring` (S60/S61, a title-changed one keeps its values) |
| S131 | breweryMgr: split weekly → monthly, Edit series… on the earlier part, Ends → Never: monthly stays monthly, no "Removes", ~12 months | ExUnit `series_ends_test` (S131: same parts and rules, to the horizon, one History entry); the wording in Playwright `task-board-follow-ups` ("Extends the series.") |
| S132 | breweryMgr: unsplit weekly ending on a date → After 5 times: "Removes N later occurrences"; 5 remain | Playwright `task-board-follow-ups` (S131/S132 wording: "Removes 11 later occurrences.", then 5 through the API); ExUnit `series_ends_test` (S132), controller `task_series_controller_test` (the preview); Vitest `repeat.test` (endsOnlyChange) |
| S133 | breweryMgr: 12 active Daily items: Add and Restore disabled with the hint | Playwright `task-board-follow-ups` (S133), `brewery/task-board-daily-items` (S31, S75 updated: greyed out, the API still refuses) |
| S134 | floater: Brewery 2 weeks + Hide completed; Taproom keeps its own; back on Brewery they hold | Playwright `task-board-follow-ups` (S134, revert-checked); Vitest `tasks.test` (the choices per board, All departments included) |
| S135 | brewer1 with D41 settings in this browser: the same span / Hide completed / phone view after D42 | Playwright `task-board-follow-ups` (S135); Vitest `tasks.test` (S135: the shared value, then the board's own; the D41 key before it) |
| S136 | brewer1: First day → Monday on a Wednesday: Mon–Sun, Mon and Tue dimmed and usable; Next → next Mon | Playwright `task-board-follow-ups` (S136, revert-checked; remembered after a reload); Vitest `tasks.test` (weekStart, defaultRange) |
| S137 | brewer1: First day → Sunday, 2 weeks: this Sun through next Sat; "Today" returns there | Playwright `task-board-follow-ups` (S137); Vitest `tasks.test` (S136, S137) |
| S138 | owner: All departments on Monday, Brewery on Today; an All card for Tuesday opens Brewery with Tuesday in range | Playwright `task-board-follow-ups` (S138); Vitest `tasks.test` (S138: rangeForDay with a first day) |
| S139 | brewer1 at 412×915: Monday, vertical view starts Monday scrolled to today; one-day opens today | Playwright `task-board-follow-ups` (S139, emulated touch) |
| S140 | brewer1: First day → Monday, then a typed range shows as typed | Playwright `task-board-follow-ups` (S140) |
| S141 | breweryMgr: weekly Wed after 10; split to Thu at the 6th; Wed → Fri from the 3rd: every part "After 10 times", 10 in all | **ExUnit only** `series_ends_test` (S141), `series_edits_test` (count-ended split, updated for R2): the dialog shows the API's count |
| S142 | breweryMgr: the same split, Ends → After 12 from the later part: 12, the Thursday rule unchanged | **ExUnit only** `series_ends_test` (S142; a part stored as a date before D42 still a date) |
| — | A notes-only occurrence is offered for keeping (split, Stop repeating, Ends-only) | ExUnit `series_edits_test` (keep and remove, revert-checked) |
| — | A `password_reset_required` answer in an open tab shows "Set a new password" | **GAP (manual)**: a manager's reset revokes the session (401), so no test reaches the 403 in a browser; the handler is `api.ts` + `useAuth.ts` |
| — | Old split parts stored as dates (D39) and real per-browser D41 settings | **Manual on DEV** (handoff note LIMITATIONS) |

## D40 — Shared tablets on the boards, shift-end reminder, dashboard card (`specs/d38_brewery_task_board_spec.md` §3.4, §3.5, §3.8; `planning/d40_tablets_reminder_dashboard_plan.md`)

S9g, S32–S37a, S42–S50, S68. ExUnit files are under `rockcut_api/test/`: controllers
`task_board_device_test` (the tablets on the boards), `staff_code_controller_test`, `rockcut_api/staff_codes_test`,
`accounts_test` (S49), `task_shift_end_reminder_test` (the reminder, injected clock), `authz_device_test` and
`authz_test` (the device rows), `rockcut_api_web/device_route_matrix_test` (the routes a tablet reaches),
`seeds/synthetic_test` (`breweryDevice`, `brewer1`'s code). Vitest: `src/lib/acting.test`,
`src/hooks/useActing.test`, `src/lib/tasks.test` (todaysTasks). Playwright (written; first run at the local gate):
`tests/regression/tasks/task-board-tablets.spec.ts` and `task-board-dashboard.spec.ts` (the one-worker
`brewery-board` project), `taproom/staff-codes.spec.ts` (S48 and D37's rows updated).

| # | Scenario | Layer |
|---|---|---|
| S9g | breweryDevice: the task menu opens without a code; Mark completed asks for one | Playwright `task-board-tablets` (S9g, persist-verified, History); ExUnit `task_board_device_test` (S9g: reads need no code, a write 422 `staff_code_required`); Vitest `useActing.test` |
| S32 | brewer1 7a–3p: one push between 2:00 and 2:05, "Still open today: 4 tasks, Daily 2/4", own first, then unassigned, then others with initials; bell entry; opens Tasks on today | ExUnit `task_shift_end_reminder_test` (S32 ×2: text, order, initials, deep link, channels, no resend); **manual on DEV/Pixel**: the real push and its tap |
| S33 | everything done by 2:00 → nothing | ExUnit `task_shift_end_reminder_test` (S33; the shift is still settled in the ledger) |
| S34 | the shift extended after the reminder → no second | ExUnit `task_shift_end_reminder_test` (S34) |
| S35 | the toggle off → no reminder | ExUnit `task_shift_end_reminder_test` (S35); Playwright `task-board-dashboard` (S35 UI: the row, on by default, both switches off, persist-verified) |
| S36 | a 45-minute shift → none | ExUnit `task_shift_end_reminder_test` (S36; also draft and unassigned shifts) |
| S37 | bartender1's Taproom shift → nothing; no toggle | ExUnit `task_shift_end_reminder_test` (S37); Playwright `task-board-dashboard` (S37: no row) |
| S37a | two shifts → one reminder before each, each with what's open then | ExUnit `task_shift_end_reminder_test` (S37a; also a late scan inside the 10-minute window) |
| S42 | breweryDevice after pairing: Brewery → Tasks, no History, Edit Daily items or My tasks | Playwright `task-board-tablets` (S42; `/tasks/bar` and `/tasks/all` go back to its board); ExUnit `task_board_device_test` (S42 `/api/me`), `synthetic_test` (breweryDevice's `/api/me`) |
| S43 | tick Temps with brewer1's code; "Acting as" banner; a second tick needs no code; History "<name> on Shared Device" | Playwright `task-board-tablets` (S43; Done ends it, Cancel changes nothing); ExUnit `task_board_device_test` (S43: `recorded_as`, `device_id`, History); Vitest `useActing.test`, `acting.test` |
| S44 | add, 5 idle minutes, add → asks again | Playwright `task-board-tablets` (S44, with Playwright's clock); Vitest `acting.test` (the timer, a slept tablet), `useActing.test` (S44); ExUnit `task_board_device_test` (S44: the server keeps no window) |
| S45 | bartender1's code on the brewhouse tablet → wrong code | Playwright `task-board-tablets` (S45, a `[TEST-TEMP]` Taproom person); ExUnit `task_board_device_test` (S45: counts toward the lock; floater accepted on both tablets) |
| S46 | 5 wrong codes → locked 10 minutes | ExUnit `task_board_device_test` (S46: a right code waits too; another board's 403s don't count); Playwright `task-board-tablets` (the lock message, a stubbed 429) |
| S47 | `POST …/tasks` with no `staff_code` → 422 `staff_code_required` | **ExUnit only** `task_board_device_test` (S47), `device_route_matrix_test` (every tablet write route) |
| S48 | breweryMgr sets and reveals brewer2's code | Playwright `taproom/staff-codes` (S48, a `[TEST-TEMP]` Brewery person; S3/S4/S12 updated to D40's rules); ExUnit `staff_code_controller_test` (S48; barMgr refused for a Brewery-only person; `/api/me` `staff_codes` for any manager), `staff_codes_test` |
| S49 | breweryMgr removes brewer2 (Brewery only) from the Brewery: open task unassigned, history keeps the name, the code is cleared (no department left) | ExUnit `accounts_test` (S49 (D40); and leaving one of two departments keeps the code), `staff_codes_test` (S49); Playwright `auth/manager_removes_member` (G1, a Taproom-only person) |
| S50 | brewer1 Brewery Dashboard: "Daily 2/4" with the unticked names, the first 5 tasks, "+2 more", "1 unfinished…"; ticking updates the board | Playwright `task-board-dashboard` (S50, against the board's own read; the board shows the tick); Vitest `tasks.test` (todaysTasks) |
| S68 | breweryDevice creates a recurring task → asks for a code; History "<name> on Shared Device · created" | Playwright `task-board-tablets` (S68); ExUnit `task_board_device_test` (S68) |
| — | the Taproom tablet: Tasks in its nav, its board with a Taproom code; the Brewery board 403 | Playwright `task-board-tablets` (Taproom tablet), `brewery/task-board-access` (S41 updated), `tasks/task-board-departments` (S114 updated); ExUnit `task_board_device_test` |
| — | a tablet on History, Daily items changes, another board, All departments → 403 | ExUnit `task_board_device_test`, `authz_device_test`, `authz_test`, `device_route_matrix_test` |
| — | the beer board's staff-code flow, now through the shared `StaffCodeActing` | ExUnit `beer_board_controller_test` (unchanged, green); Playwright `taproom/beer-board-device` (unchanged) |
| — | the reminder's real push on a phone; a real tablet's touch and keypad | **Manual on DEV** (handoff note LIMITATIONS) |

## D43 — UI tweaks (`specs/d43_ui_tweaks_spec.md`)

| # | Scenario | Layer |
|---|---|---|
| S143 | brewer1 with no setting: Light, black logo, nothing asks | Playwright `ui/theme` (S143); ExUnit `color_mode_test` (default `light`) |
| S144 | account menu → Dark changes in place; ✓ on Dark | Playwright `ui/theme` (S144: no reload, logo, ✓; a refused save reverts with a message) |
| S145 | Dark in another browser | Playwright `ui/theme` (S145, a fresh context); ExUnit `color_mode_test` |
| S146 | Match this device follows the browser, live | Playwright `ui/theme` (S146, `emulateMedia`) |
| S147 | breweryMgr sets the Brewhouse tablet to Dark; the tablet loads dark | Playwright `ui/theme` (S147); ExUnit `color_mode_test` (manager 200, theme-only; rename by a manager 403) |
| S148 | Sign in as me on a Dark tablet: stays dark, email + Sign out, no account menu | Playwright `ui/theme` (S148, a `[TEST-TEMP]` person); ExUnit `color_mode_test` (`/api/me` gives the tablet's) |
| S149 | bartender1: no Shared devices page; PATCH 403 | Playwright `ui/theme` (S149); ExUnit `color_mode_test`, `authz_device_test` |
| S150 | owner (Dark): every page and the main dialogs readable | **Manual** (Task 3 sweep, screenshots kept for the PR); QA's DEV pass |
| S151 | board page, columns, today, cards: distinct in both themes | Playwright `ui/task-board-ui` (S151, light and dark) |
| S152 | nav order Home, Tasks, Schedule; phone drawer the same | Playwright `ui/layout` (S152) |
| S153 | title in the top bar; board switcher; "‹ Settings" back link; no breadcrumbs | Playwright `ui/layout` (S153, a temp category) |
| S154 | phone: the title replaces the logo; Home keeps it | Playwright `ui/layout` (S154) |
| S155 | account menu contents; Profile; Log out | Playwright `ui/layout` (S155; Log out with a spare session); `auth/profile`, `auth/session_revocation`, `auth/offline_logout` updated |
| S156 | brewer1 View Schedule: no header buttons; Calendar sync opens its dialog | Playwright `ui/schedule` (S156) |
| S157 | breweryMgr: setup buttons only on the Scheduler; no Calendar sync there | Playwright `ui/schedule` (S157) |
| S158 | taproomDevice: no Calendar sync | Playwright `ui/schedule` (S158) |
| S159 | week totals match the rows and follow the Department filter | Playwright `ui/schedule` (S159) |
| S160 | Move; ↑ ↑ (quick) ; Enter; order saved | Playwright `ui/schedule` (S160, restores the order) |
| S161 | Move ↓ + Finished; Move + Esc | Playwright `ui/schedule` (S161) |
| S162 | brewer1: no Scheduler, no ⋮ or arrows | Playwright `ui/schedule` (S162) |
| S163 | today's Daily all ticked: open, struck, dimmed; after reload closed | Playwright `ui/task-board-ui` (S163, restores the ticks); `brewery/task-board-daily` S24 updated |
| S164 | a 2/4 day looks normal and starts closed; unfinished today open | Playwright `ui/task-board-ui` (S164) |
| S165 | preferences: In-app and Push only | Playwright `ui/notification-prefs` (S165); `scheduler/calendar_feed_rotation` Q3 updated |
| S166 | Position menu: headings vs positions, both themes | Playwright `ui/position-menu` (S166, computed styles) |
| S167 | Taproom header: 8a, open 10a, 12p | Playwright `ui/task-board-ui` (S167) |
| S168 | Brewery header: the 7a+3p brewer first, then 11a | Playwright `ui/task-board-ui` (S168) |
| S169 | sign-in page, Match this device, dark browser: green logo | Playwright `ui/theme` (S169) |

DEV QA pass 1 fixes (`stepwise_results/d43_dev_qa_report.md`):

| Gap | What | Layer |
|---|---|---|
| G1 | bell popover in Dark: timestamps 4.5:1, ⚙ 3:1 | Playwright `ui/theme` (owner in Dark, G1; `ui/contrast.ts`) |
| G2 | icon buttons in Dark 3:1 on the board, Scheduler, Profile and the sign-in page | Playwright `ui/theme` (owner in Dark, G2) |
| G3 | shift-chip text 4.5:1 on every shade; done card "✓ name" and initials 4.5:1 in both themes | Vitest `src/lib/colors.test.ts`; Playwright `ui/task-board-ui` (a done task card) |
| G4 | a click elsewhere ends Move; arrows in an open dialog move nothing | Playwright `ui/schedule` (G4) |
| G5 | a theme save that fails offline or never answers reverts and says so (Escape and a click don't hide it) | Playwright `ui/theme` (offline; never answers; refused) |
| obs | User change log page title | Playwright `ui/layout` (S153 block) |

## D46 — Tanks, phases & step types, templates (`specs/d46_production_scheduling_spec.md` §3.1–§3.4; `planning/d46_tanks_templates_plan.md`)

Playwright specs are in `regression/production/`, project `production` (one worker: the lists are shared and a reorder names every active row). Lead decision 1: the Gantt parts of P6–P10 come with D47; out-of-service periods are tested on the Tanks page here.

| # | Scenario | Layer |
|---|---|---|
| P1 | brewer1 adds a tank: listed last, persists | Playwright `production/tanks` (P1: through the hub, fields checked through the API after a reload); ExUnit `production_test` (order), `production_controller_test`. The Gantt row → D47 |
| P2 | drag a tank above FV1: order persists, for brewer2 too | Playwright `production/tanks` (P2: arrow up once, then a drag by the handle; reload; brewer2's browser); ExUnit `production_test` (reorder takes exactly the active ids). Gantt order → D47 |
| P3 | Add "fv1": "A tank named FV1 already exists." | Playwright `production/tanks` (P3); ExUnit `production_test` (case-insensitive, retired names too), `production_controller_test` |
| P4 | Retire a tank with unfinished steps: refused, listing the batches | Playwright `production/tanks` (P4: since D47 a real planned batch in the tank; the page names it); ExUnit `undo_cips_test` (refused, a marker doesn't hold the tank), `seeds/synthetic_test` |
| P5 | Retire an empty tank; Retired list; Restore | Playwright `production/tanks` (P5: the spec's confirm text, reload, Restore puts it last); ExUnit `production_test`. "Gone from the Gantt and pickers" → D47 |
| P6 | Serving 2 out Oct 27–Nov 2 over a planned batch: preview, band, tag, flag | **D47** (Gantt, batches, flags). The period itself: P9's and the out-of-service specs |
| P7 | Until further notice from today, "Valve repair" | Playwright `production/out-of-service` (P7: Now group, "Out from <today>" chip, reload, API state `now`). Status line and band → D47 |
| P8 | Back in service today | Playwright `production/out-of-service` (P8: yesterday becomes the last day, under Past; a period that started today is deleted; only a current period offers it); ExUnit `production_test` |
| P9 | an overlapping period is refused, naming the other | Playwright `production/out-of-service` (P9: exact message, nothing saved); ExUnit `production_test`, `production_controller_test` |
| P10 | Delete a period; its flags clear; Undo | Playwright `production/out-of-service` (Delete on the Tanks page). Flags and Undo → D47 |
| P11 | Add step type "Hop stand check": in the editor's picker | Playwright `production/lists` (P11); ExUnit `production_test` (always `plain`) |
| P12 | Retire a type a template uses: hidden from pickers, the template keeps its step | Playwright `production/lists` (P12, a `[TEST-TEMP]` stand-in for Fining so the seed list stays as it is); ExUnit `production_test` (retired type refused when adding; the step stays) |
| P13 | Transfer: no Retire, rename only | Playwright `production/lists` (P13: Edit with the built-in note, rename and back; API retire 422); ExUnit `production_test`, `production_controller_test` |
| P14 | build "Lager with transfer": day order, CIP for the first tank on day 35, preview in color | Playwright `production/templates` (P14: every entry through Add step / Add phase start, notes on Diacetyl test, after a reload; preview phases by day, CIP hatched, task-list dots); ExUnit `production_test` (transfer adds the CIP), `seeds/synthetic_test` (the `[SEED]` copy) |
| P15 | ramp 58° → 32°, 10°/day, from day 18 after FDH | Playwright `production/templates` (P15: the dialog's preview line, days 18–21, chained `move_all`, the last links to Conditioning, the direct FDH link replaced, Crash on the first); ExUnit `production_test` |
| P16 | link Carb → Package "move only": "stays by default" | Playwright `production/templates` (P16: the row shows "after Carb · stays" after a reload; a loop is refused in the dialog); ExUnit `production_test` (cycle, order, exists) |
| P17 | remove the Package: allowed, the banner (lead decision 3; the wording "The first tank has no Package, Split or Transfer.") | Playwright `production/templates` (P17: banner after a reload, Incomplete badge in the list; Brew day has no Remove); ExUnit `production_test` (`issues`) |
| P18 | brewer2 duplicates "Standard ale", renames: independent copy | Playwright `production/templates` (P18, `[SEED] Standard ale`; the copy is renamed `[TEST-TEMP]` and retired); ExUnit `production_test` (deep copy, "Copy of … (2)") |
| P19 | bartender1 / barMgr: Home, API 403; breweryDevice read-only | Playwright `production/access` (bartender1 and barMgr: no nav entry, every setup URL goes Home, API 403; owner and floater open every page; breweryDevice API 403 until D49); ExUnit `authz_parity/production_test` (12 personas), `authz_test`, `device_route_matrix_test`. Read-only tablet pages → D49 |

Also covered: the hub's counts (`production/tanks`); a period's first day carries its last along, and the order check before saving (`production/out-of-service`); a new phase's palette color, recolor and duplicate name (`production/lists`); the 12 colors readable (≥ 4.5:1) in both modes and the preview model (Vitest `src/lib/production.test.ts`).

Not automated (accepted at Task 2): drag on touch (the shared layer's long-press; by hand on the Pixel/Samsung at the DEV gate). Display limits: Brew day's starting temperature shows only in its Edit dialog; the preview's CIP hatch covers that day's phase color; no "Will be flagged" preview until D47.

DEV gate fix cycle 2 (`stepwise_results/d46_qa_report.md`, `prompts/d46_lead_decisions_3.md`):

| Gap | What | Layer |
|---|---|---|
| M1 | a Transfer/Filter goes into a new tank only (422 `transfer_not_new_tank`); its CIP on the tank it leaves; "Into tank" offers only the next new tank and isn't changed by switching the type | ExUnit `production_test` (into the same tank, skipping one, before the first, a change back, two the same day), `production_controller_test` (the message); Playwright `production/qa-fixes` (M1 ×2); Vitest `production.test` (`newTankFor`, `existingTanks`). Revert-and-rerun: with the check removed, 3 ExUnit tests fail; restored, 39/39 pass |
| 1 | link pickers offer only reachable steps (day order, no loops, not already linked) | Playwright `production/qa-fixes` (Add step and the links editor), `production/templates` P16 (no loop offered); Vitest (`reachable`) |
| 2 | dialogs that save at once say Close; removing a link and deleting a period ask first | Playwright `production/qa-fixes` (minor 2), `production/out-of-service` (P10 and the tank dialog's Close) |
| 3 | a 404 on a row someone else removed: "This was removed by someone else. Reload to see the latest." + Reload | Playwright `production/qa-fixes` (a step removed by brewer2, then edited); Vitest (`prodError`) |
| 4 | a step or ramp in a tank no Transfer/Filter starts: 422 `no_such_tank` | ExUnit `production_test`, `production_controller_test` |
| 5 | ramp preview keeps to 28–80°F, whole degrees, ≥ 1°/day; inline error, nothing added | Playwright `production/qa-fixes` (minor 5); Vitest (`rampPlan`) |
| 6 | Out chips, the Now chip, the Incomplete badge ≥ 4.5:1 in both themes | Playwright `production/qa-fixes` (minor 6, light and dark, `ui/contrast.ts`; the theme set for the page only) |
| 7 | phone preview: tank labels stay in view while scrolling; fades where there's more | Playwright `production/qa-fixes` (390 px, `[SEED] Lager with transfer`) |
| 8 | capacity ≥ 10,000: "Capacity must be under 10,000 bbl."; names NFKC-normalized ("Ｆv1" = FV1) | ExUnit `production_test`; Playwright `production/qa-fixes` (the capacity message) |
| 9 | Add phase start's help text: Comes after only | Playwright `production/qa-fixes` (minor 9) |

## D47 — Batch schedule and Gantt (`specs/d46_production_scheduling_spec.md` §3.5–§3.10; `planning/d47_batch_schedule_gantt_plan.md`)

Playwright specs are in `regression/production/` (project `production`, one worker). Each test makes its own `[TEST-TEMP]` brand, tanks and batches (`schedule.ts` `Made`) and removes them; brewed batches are un-checked first. P-number assertions are relative (read before, compare after). P49–P51 read the `[SEED]` schedule; P52 changes Serving 1 and puts it back with Undo. ExUnit: `production/schedule_test` (batches, numbers, moves, check-off), `production/status_flags_test` (pure status and flags), `production/undo_cips_test` (Undo, CIPs, sign-offs, P4, performance), `production_schedule_controller_test` (HTTP, authz), `seeds/synthetic_test` (the D47 seed). Vitest: `src/lib/gantt.test.ts` (layout, ranges, stacking, prefs).

| # | Scenario | Layer |
|---|---|---|
| P1, P2 (Gantt) | a new tank is the last row before Unassigned; the rows follow the Tanks order, for brewer2 too | Playwright `production/tanks` (Set up menu, row order), `production/gantt` (P2 as brewer2) |
| P4 | Retire a tank in use: refused, naming the batch | Playwright `production/tanks` (real batch); ExUnit `undo_cips_test` |
| P6 | ⋯ → Mark out of service over a planned batch: named before saving; band, Out tag, the batch's flag badge | Playwright `production/gantt-outages`; ExUnit `status_flags_test` (`out_of_service`) |
| P7 | empty spot → Mark out of service, until further notice | Playwright `production/gantt-outages` (status "Out of service · Valve repair", "Out from …", band) |
| P8 | the band → Back in service today; under Past | Playwright `production/gantt-outages` |
| P9 | an overlapping period from the Gantt is refused | Playwright `production/gantt-outages` |
| P10 | Delete a period: the flag clears; Undo | Playwright `production/gantt-outages`; ExUnit `undo_cips_test`, `production_schedule_controller_test` (outage Undo) |
| P20 | rows, today line, 6 weeks, every status line | Playwright `production/gantt` (status lines compared with the API) |
| P21 | Plan batch: ghosted, P-number, renumbering named | Playwright `production/batches`; ExUnit `schedule_test` (planning, P-numbers) |
| P22 | empty spot → Plan a batch with an Unassigned transfer: two bars, the arrow | Playwright `production/batches` |
| P23, P24 | same brew day: the first keeps the lower P; two-day brew names | Playwright `production/batches`; ExUnit `schedule_test` |
| P25–P28 | the move prompt: default all (listed), move only (warning, flag), Carb's default only, Undo | Playwright `production/steps`; ExUnit `schedule_test` (`following`, default, out of order, previews) |
| P29 | a date in the batch dialog runs the prompt; the dialog stays | Playwright `production/steps` |
| P30, P31 | drag a bar: planned every step, brewed only unfinished; no prompt; Undo | Playwright `production/batches`; ExUnit `schedule_test` (`shift`) |
| P32, P33 | drag a part to another tank or Unassigned; No tank flag near its fill | Playwright `production/batches`; ExUnit `schedule_test`, `status_flags_test` (`no_tank`) |
| P34 | check off Set temp due today: the status line's temperature | Playwright `production/steps`; ExUnit `status_flags_test` |
| P35 | check off 2 days late: moves, then the prompt | Playwright `production/steps`; ExUnit `schedule_test` (off-plan) |
| P36–P39 | the brew-day number: suggestion, taken, non-plain note, duplicate ignoring case, un-check frees it, API 422 | Playwright `production/batches`; ExUnit `schedule_test`, `production_schedule_controller_test` |
| P40 | change a brewed batch's number; a taken one refused | Playwright `production/batches`; ExUnit `schedule_test` |
| P41–P44 | addition, temperature, assignee (initials), notes | Playwright `production/steps`; ExUnit `schedule_test` (step edits, Brewery members only) |
| P45 | + Note opens the step; closing returns, Note ✎ | Playwright `production/steps` |
| P46 | expand: step rows, diamonds, links solid/dashed; remembered; Expand/Collapse all | Playwright `production/gantt` |
| P47 | « names only, status on hover; remembered | Playwright `production/gantt`; Vitest (`readPrefs`) |
| P48 | zoom, 4 weeks back, From/To; remembered; 7–730 days | Playwright `production/gantt`; Vitest (`clampRange`, `dayWidth`) |
| P49–P51 | the seed's FV4, FV5 (red) and Serving 1 status lines and flag | Playwright `production/gantt`; ExUnit `status_flags_test` (every §3.8 row), `seeds/synthetic_test` |
| P52 | Add CIP & Sanitize already done: Sani 0 days, the flag clears | Playwright `production/flags-cips` (Undo restores the seed); ExUnit `undo_cips_test` |
| P53, P54 | overlap + dirty fill (!2); bigger than the tank | Playwright `production/batches`; ExUnit `status_flags_test` |
| P55–P57 | sign off with a note; a change reopens it; Remove sign-off | Playwright `production/flags-cips`; ExUnit `status_flags_test` (signatures), `undo_cips_test` |
| P58, P59 | a CIP while beer is in the tank; drag a standalone CIP, Undo | Playwright `production/flags-cips`; ExUnit `undo_cips_test` |
| P60 | Delete planned batch; renumbering | Playwright `production/batches`; ExUnit `schedule_test` |
| P61 | brewer1 and brewer2 move steps in one batch at once | Playwright `production/flags-cips` (two contexts, reload: both agree) |
| P62–P64 | owner and floater full access; office1 Home and 403 | Playwright `production/gantt`, `production/access`; ExUnit `production_schedule_controller_test` |
| P109 | Split - Transfer / Split - Filter in templates; planning copies the method | Playwright `production/followups-4650` (editor), `production/batches` (planned batch); ExUnit `production_test`, `production_schedule_controller_test` |
| P111 | Package - Partial in templates: not an exit, no CIP | Playwright `production/followups-4650`; ExUnit `production_test` |
| P112 | a partial Package done: the batch and the tank carry on; Partial in the step dialog renames it | Playwright `production/batches`; ExUnit `schedule_test`, `status_flags_test` |

Task 4650 (D46 recheck N1–N4, item 10) and lead decisions 1 item 1: Playwright `production/followups-4650` (N1 day order, N2 the Remove warning, N3 the ramp cap, N4a–b messages, P109, P111, the handle and keyboard reorder, a Transfer's CIP follows its day); ExUnit `production_test` ("D47 task 0"), `production_controller_test`.

Also covered: Undo (restore, stale 409, expiry, another person, a delete and a plan undone) in ExUnit `undo_cips_test` and `production_schedule_controller_test`; the old Batches page and Brewery Dashboard skip schedule batches (`undo_cips_test`); the schedule loads in ~10 ms for 12 weeks, 10 tanks and 30 batches (`undo_cips_test`, logged).

DEV gate fix cycle 1 (`stepwise_results/d47_qa_report.md`, lead decisions 4):

| # | Finding | Test |
|---|---|---|
| M1 | typing a date opens the move prompt mid-typing | Playwright `production/d47-qa-fixes` (types 12152026: no request until Enter, then one preview for Dec 15; again, committed by leaving the field). `DateField` is used for every date that moves or checks off (batch dialog, step dialog Done on / Or move to, CIP, out of service) |
| M2 | "#40" gets around the duplicate check | ExUnit `schedule_test` (check_number, the brew-day check-off and the batch dialog's edit); Playwright `production/d47-qa-fixes` (brew day and batch dialog refuse "#&lt;taken&gt;"; " #n " saved as n, the field shows it) |
| M3 | a full Package done early: bar, stranded steps, flags, overlap | ExUnit `status_flags_test` (a done step before an unfinished one it follows; `Steps.out_of_order?/2` shared with the preview; the part ends at the done exit, its CIP still to come included; stranded steps; held to the exit, a done standalone CIP ends the dirty fill, no overlap), `schedule_test` (the preview's warning and the flag agree); Vitest `gantt` (end, reach, stranded, no phase after the exit, tracks); Playwright `production/d47-qa-fixes` (red dot, flag, badge, the bar ends before Carb, the batch dialog's note) |
| 1 | "Bigger than tank" ignores dates | ExUnit `status_flags_test` (moving the batch changes the signature) |
| 2 | the Unassigned header is see-through | Playwright `production/gantt` (P20: opaque background) |
| 3 | empty spot → out of service ignores the tapped day | Playwright `production/d47-qa-fixes` |
| 4 | double-clicking Apply clicks through | Playwright `production/batches` (minor 4: nothing opens) |
| 5 | a bar dropped over the tank column still moves | Playwright `production/batches` (minor 5: a bar over the tank names, a dot below the chart: no prompt, nothing moved) |
| 6 | names only cuts long names, no tooltip | Playwright `production/gantt` (P47: the name's title; the tooltip starts with the full name) |
| 7 | the API takes 1-day and 731-day ranges | ExUnit `schedule_test`, `production_schedule_controller_test` (422 `range_invalid`) |
| 8 | the Remove-Transfer warning names no tank | Playwright `production/followups-4650` (N2: "After transfer 1 depends on it.") |
| 9 | trimmed number in the field; duplicate "planned"; check-off message | Playwright `production/d47-qa-fixes` (M2 field; "FDH done · 8 following steps moved 2 days later."). The plan dialog ignores a second submit while saving (not reproducible as a test) |
| 10 | a done standalone CIP while beer is in the tank isn't flagged | ExUnit `status_flags_test` |
| P32 | a refetch mid-drag | Playwright `production/batches` ("P32 on DEV": the minute's refetch arrives mid-drag with a new tank; the drop still lands, by tank id). The P32 spec measures the lane after scrolling |
| P5 | Restore "last" with tanks added meanwhile | Playwright `production/tanks` (P5 checks it's after every tank active before; the handle test in `followups-4650` is relative to its neighbour too) |
| Addition | live feedback while dragging (the hint that follows the pointer) | Vitest `gantt` (`dragHint`: day and ±days, → tank / Unassigned, out of service, overlap, before the step it follows, Move only past a follower, outside the chart); Playwright `production/d47-qa-fixes` (mid-drag: a sideways drag, a row change into an out-of-service tank in red, outside the chart; nothing moved). Touch places it above the finger: by hand at the DEV gate with the long-press |

DEV gate fix cycle 2 (`stepwise_results/d47_qa_recheck.md`, lead decisions 5):

| # | Finding | Test |
|---|---|---|
| N1 | the brew-day check-off preview announced renumbering that doesn't happen | ExUnit `schedule_test` ("brew-day check-off preview": the preview's `renumbered` equals the write's, with and without a change) |
| N2 | the bar's hover tooltip covers the drag hint | Playwright `production/d47-qa-fixes` (N7, N2: hidden through the drag, back only once the pointer moves) |
| N3 | the drag hint clipped at the right edge | Playwright `production/d47-qa-fixes` (N3: flipped left, inside the window) |
| N4 | a completed part's leftover CIP | ExUnit `status_flags_test` (the stay ends at the exit; `leftover_cip`; no overlap; the leftover CIP in another stay is "CIP while beer is in the tank"; on the exit day it cleans after it, "Sani 0 days"); Vitest `gantt` (bar ends at the exit, the CIP dot holds no lane, the drag hint sees no overlap past the exit) |
| N5 | after an Escape-cancelled drag the next CIP drag did nothing (its release clicked through and opened the empty-spot menu) | Playwright `production/d47-qa-fixes` (N5: Esc a dot and a CIP drag, then the CIP moves) |
| N6 | a dot's out-of-service hint | Vitest `gantt` (a fill or exit dot checks the new stay; any other dot its own day) |
| N7 | a drag back to its start opened the dialog | Playwright `production/d47-qa-fixes` (N7: nothing opens, nothing sent) |
| Remove-Transfer | Remove before the preview; every dependent tank named | Playwright `production/followups-4650` (N2: the preview held back, Remove disabled with a spinner, Cancel works; "After transfer 1 and After transfer 2 depend on it.") |
| Seed sign-off | showed as reopened on DEV | ExUnit `seeds/synthetic_test` (a fresh seed reads as signed off; still so days later and after another batch renumbers Enos) |
| Plan "Ferment in" | FV7 after picking QR1 while tanks were added | Playwright `production/d47-qa-fixes` (the menu's rows hold while it's open through a refetch that adds a tank; picked by id) |

Fix cycle 3 (lead decisions 6):

| # | Item | Test |
|---|---|---|
| 1 | flag signatures differed between nodes (`term_to_binary`) | ExUnit `status_flags_test` (a canonical pipe-joined string, pinned; 30 and 30.0, a `Date` built three ways: one signature; too-big with a 20.0 capacity), `seeds/synthetic_test` (the seeded sign-off reads as signed off) |
| 2 | a fill or exit dot's hint checks the stay as the default answer leaves it | Vitest `gantt` (an outage just after the stay, the fill +2 days: red with "move all", clear with "move only") |
| 3 | a reason that applies only to the other answer is a neutral second line | Vitest `gantt` ("If you move only this step: after Carb, which follows it"; red only when "move only" is the default) |
| 4 | Remove-Transfer while loading: `aria-label="Remove"`, `aria-busy="true"` | Playwright `production/followups-4650` (N2) |

Not automated (LIMITATIONS, lead decisions 3): touch long-press drag (450 ms) — by hand on the tablet or the Pixel at the DEV gate; the "Label by" picker when batches share a track is deferred (lines show "step · batch"); links between tanks aren't drawn in an expanded tank (the transfer arrow covers the hand-off).

## D48 — Changing a batch (`specs/d46_production_scheduling_spec.md` §3.11, §3.6 D48 toolbar, §3.8 marks; `planning/d48_batch_changes_plan.md`)

Playwright specs are in `regression/production/` (project `production`, one worker), each on its own `[TEST-TEMP]` data with relative P-number checks.

| # | Scenario | Layer |
|---|---|---|
| P65–P66 | Add step: an addition after FDH, slotted before Set temp 58°; Added; the template unchanged; Undo | Playwright `d48-batch-changes`; ExUnit `batch_changes_test`, `production_batch_changes_controller_test` |
| P67 | Something else with no name: "Give the step a name." | Playwright `d48-batch-changes`; ExUnit `batch_changes_test`, controller test |
| P68 | Add a ramp 60° → 40° at 10°/day: three chained Set temp steps | Playwright `d48-batch-changes`; ExUnit `batch_changes_test` |
| P69 | Change ramp…: only unfinished steps rebuilt, from the last finished temperature | Playwright `d48-batch-changes`; ExUnit `batch_changes_test` |
| P70–P71 | Remove a step: links pass through; Brew day has no Remove (API `brew_day`) | Playwright `d48-batch-changes`; ExUnit `batch_changes_test`, controller test |
| P72, P74 | Add a Filter into a tank (CIP for the first tank, transfer arrow); remove it from the step dialog | Playwright `d48-batch-changes`; ExUnit `batch_changes_test`, controller test (both routes, Undo) |
| P73 | A transfer before a done step: "Some steps after that date are already done. Pick a later date." | Playwright `d48-batch-changes`; ExUnit `batch_changes_test`, controller test |
| P75, P110 | Split - Transfer / Split - Filter: 12 bbl stays, 8 bbl to another tank; labels, own steps, gold arrows; the staying part shares its parent's lane (row doesn't grow) | Playwright `d48-split-select`; ExUnit `splits_marks_test`; Vitest `gantt` (split lanes) |
| P76–P78 | Volumes must add up (the spec's message); two parts can't share a tank; no part staying adds a CIP | Playwright `d48-split-select`; ExUnit `splits_marks_test`, controller test |
| P79 | Parts move on their own | Playwright `d48-split-select`; ExUnit `splits_marks_test` |
| P80–P81 | Undo split merges with part 1's schedule; refused once a part step is done | Playwright `d48-split-select`; ExUnit `splits_marks_test` |
| P82 | A planned split: parts P-numbered from the parent, then its number at brew day; the Split's check-off fills them | Playwright `d48-split-select`; ExUnit `splits_marks_test` |
| P83–P84 | Change a planned batch's template (added step kept, added transfers dropped, the message) and brand (parts follow) | Playwright `d48-batch-changes`; ExUnit `batch_changes_test`, controller test (Undo) |
| P85, P88 | Ctrl-click select and drag together (the prompt about what follows); Shift-click range in one tank | Playwright `d48-split-select` |
| P86 | Assign to… "4 steps assigned to Riley Wort." | Playwright `d48-split-select` |
| P87 | Pixel: long-press starts selection mode, taps add, drag moves all; a swipe still scrolls | **Manual** at the DEV gate |
| P89 | Undo after a split | Playwright `d48-split-select` (P75); ExUnit `splits_marks_test` (Undo of split and of Undo split) |
| P113 | Shift-drag: move only, no prompt, "(only this step)" with Undo | Playwright `d48-split-select` |
| P114–P117 | Mark dirty / Mark clean (note, marker tooltip), the flags they raise and clear; none on a tank in use (API `tank_in_use`); History → Remove; Undo | Playwright `d48-split-select`; ExUnit `splits_marks_test`, controller test |
| P118 | Today: a week back plus the zoom's weeks, always scrolls back (the D47 no-op); a new zoom keeps the start | Playwright `d48-toolbar`; Vitest `gantt` (`defaultRange`, `rangeForZoom`) |
| P119 | Collapse all \| ● \| Expand all follows the carets; the middle restores the mix; remembered | Playwright `d48-toolbar`; Vitest `gantt` (`expandMode`, the `mix` pref) |
| P120 | "6 weeks ▾" zoom menu and Add process ▾ (Plan batch…, CIP & Sanitize…), mouse and keyboard; old buttons gone | Playwright `d48-toolbar` (the other production specs open the dialogs through the menu) |
| P121 | 20 px step rows with a mouse, 28 px on touch and at phone width; phases at 16 px, steps at 28 px; diamonds and links on their rows | Playwright `d48-toolbar` (desktop, phone width, `hasTouch`); Vitest `gantt` (`layoutRows` with 20 px) |
| — | Drags auto-scroll the grid near its edges (rows below the fold, dates past the right edge); a press in an edge zone doesn't scroll until it heads that way | Playwright `d48-batch-changes` ("a short window"); the P32/P33 and drag-hint specs drag to off-screen rows |
| — | Flag signatures start with the recipe version `v1|`; a current sign-off stays signed off | ExUnit `status_flags_test`, `seeds/synthetic_test` |
| — | DEV seed: a split batch (one part stays), an added filter, a clean and a dirty mark; `[TEST-TEMP]` parts and marks cleaned up | ExUnit `seeds/synthetic_test` |
| — | Brewery members and owners only (403 for others); the new routes people-only until D49 | ExUnit controller test, `device_route_matrix_test` |

| DEV QA M1 | Transfers, filters and splits only while the beer is in that tank (`before_fill`, `after_exit`, "The split has to be after brew day."); added steps and ramps from brew day; dialogs default to the first valid day | ExUnit `batch_changes_test`, `splits_marks_test`, controller test; Playwright `d48-fix-cycle-1` |
| DEV QA M2, minors 6, 8 | A split parent can't be deleted or resized until Undo split (a note in place of Delete); a part shows "P5.2 · …" and has no Delete; Undo of a delete restores vessels, steps, links and a ramp | ExUnit `splits_marks_test`, controller test; Playwright `d48-fix-cycle-1` |
| DEV QA M3 | No transfer or part into the tank the beer is in: "The beer is already in FV2."; Into leaves that tank out | ExUnit `batch_changes_test`, `splits_marks_test`, controller test; Playwright `d48-fix-cycle-1` |
| DEV QA 7a, 7b | Template change names a dropped added transfer; kept ramps and steps (one checked off before brew day too) stay linked in | ExUnit `batch_changes_test`; Playwright `d48-fix-cycle-1` (7a) |
| DEV QA 9, 10, 11 | Zoom tooltip "Weeks on screen"; a two-batch move: "2 batches · 2 steps moved 1 day later", following steps under each batch; Ctrl/Cmd+Space selects, Escape clears | Playwright `d48-fix-cycle-1`; ExUnit controller test (preview batches) |
| Pixel | Auto-scroll down on a phone: the edge zone is the part of the grid on screen; the page scrolls once the grid is at its end | Playwright `d48-fix-cycle-1` (412×915); Matt rechecks on the Pixel |
| DEV QA N1 | No two vessels in a row in one tank (Unassigned never matches) after Add transfer / filter, a part's own transfer, Remove transfer, a template change, a split or Undo split: "The beer goes into Q1RC next, on Fri Dec 18."; Into leaves out the next tank and the preview refuses it; the old exit's CIP isn't counted as moving (it goes on with that exit) | ExUnit `batch_changes_test`, `splits_marks_test`, controller test; Playwright `d48-fix-cycle-2` |
| DEV QA N2, N3 | A brewed part reads "#44.2 · the parent's number"; a part's volume is locked like the parent's (`split`) | ExUnit `splits_marks_test`, controller test; Playwright `d48-fix-cycle-2` |
| DEV QA N4, N6 | A part's steps and ramps start on its Split (`before_split`, "A step can't come before the split."); added steps and ramps end on or before the tank's exit (`after_exit`; a ramp refused whole) | ExUnit `batch_changes_test`, `splits_marks_test`, controller test |
| DEV QA N5 | The split dialog clears its refusal when the day, the method or a part changes | Playwright `d48-fix-cycle-2` |
| DEV QA check | A brewed split's part 2 (own tank) opens on a click: not reproduced | Playwright `d48-fix-cycle-2` |
| DEV QA addendum 1 | Setting a vessel's tank (batch dialog pickers, drag onto another row) and Plan batch's tanks: the same `same_tank` refusals, on the vessels after the save; the drag hint names it in red | ExUnit `batch_changes_test`, controller test; Vitest `gantt` (drag hint); Playwright `d48-fix-cycle-2` |
| DEV QA addendum 2 | Change ramp… refused (`after_exit`) when a regenerated step would be after the tank's exit | ExUnit `batch_changes_test` |
| DEV QA R1 | An Undo of a change to a batch's vessels is stale (409 `undo_stale`) once any of that batch's vessels changed since: tank change, add / remove transfer, template change, split, Undo split, Plan batch; a move's Undo isn't affected; what an Undo puts back passes the N1 rule (`same_tank`) | ExUnit `undo_vessels_test` (the two-user sequence, one test per kind), controller test (409) |
| DEV QA R2 | Add step, Add a ramp, Change ramp, Add transfer / filter, Split and Plan batch clear a refusal when their input changes (`useRefusal`); the batch dialog's banner clears on a new change or when another dialog opens from it | Playwright `d48-fix-cycle-3` |
| DEV QA R3 | A split where nothing stays names the part ("Part 1: The beer goes into Q1RB next, on …"); part 1's picker leaves out the next tank then | ExUnit `splits_marks_test`, controller test; Playwright `d48-fix-cycle-3` |
| DEV QA R4 | A Move only that puts a batch's transfers out of date order is allowed and flagged `transfer_order` ("P7's transfers are out of order: on Thu Dec 17 the beer goes into Q1SB, which it's already in."), in place of the same batch's `dirty_fill`; it clears on a move back, Undo or Move all | ExUnit `batch_changes_test`; Playwright `d48-fix-cycle-3` |
| DEV QA X1 | Undo of an Undo split is stale (409 `undo_stale`) once any vessel of the split's tree changed since (the merged batch's included), and what it puts back passes the tree rule | ExUnit `split_tree_test` (QA's sequence, an unused tank, nothing changed, the tree rule without the stale check), controller test (409) |
| DEV QA X2 | On a split, a part's tank change, a transfer added or removed on a part, a split and every Undo follow the rule over the whole tree (`same_tank`, named on the part: "Part 2: The beer is already in FV9.", "Part 2 can't go into FV1: part 1 stays there."); the pickers leave those tanks out and a bar drag's hint names the reason | ExUnit `split_tree_test`, controller test; Vitest `gantt.test` (`treeRefusal`); Playwright `d48-fix-cycle-4` |
| Lock while split (Matt) | The parent's tanks and the staying part's first tank can't change while split (`split`, "Undo the split first."): read-only pickers with "Undo the split first to change it", Add transfer / filter off on the parent, a bar drag's hint and drop refused; no transfer added or removed on the parent | ExUnit `split_tree_test`, controller test; Vitest `gantt.test` (`splitLocked`); Playwright `d48-fix-cycle-4` |
| DEV QA X3 | Undo split puts the batch back as it was (steps, links, tanks), whether part 1 or part 2 stayed or nothing did: it merges the part that stays (else part 1) and puts back the parent's links into and out of the moved steps | ExUnit `split_tree_test` |
| DEV QA X4 | With nothing staying, part 1's picker leaves out the next tank (also while part 1 is still "(stays here)"); the split dialog shows the refusal before Split | Playwright `d48-fix-cycle-4`, `d48-fix-cycle-3` |
| DEV QA X5 | A refused Undo refetches the schedule: the chart and the batch dialog show the server's tanks at once | Playwright `d48-fix-cycle-4` |

Not automated: P87 (touch long-press selection on the Pixel) and a touch drag's auto-scroll, by hand at the DEV gate.
