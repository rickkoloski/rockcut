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
