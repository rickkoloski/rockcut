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
| S13 | ~~Personal sign-in; 5-minute idle return without re-pairing, also across sleep~~ Retired in D54 (no personal sign-in on a tablet); see D54 S244–S246 | — |
| S14 | Device never member/owner/assignee; 422; nobody (owners included) acts on behalf of a device | ExUnit `device_account_test` (incl. membership changeset), `authz_device_test` (owner → device); Playwright `shared_devices_admin` (API 422) |
| 3939 | Unknown channel URL redirects; no 403 polling; failed send shows an error (every user) | Playwright `messaging/channel_urls` (revert-and-rerun recorded) |

### D33 DEV fix cycle 1 (gaps from DEV pass 1)

| Gap | Layer |
|---|---|
| G1 deactivate revokes tablets; reactivation needs new pairings | ExUnit `devices_test`, `auth_plug_device_test` |
| ~~G2 a personal session ends when its tablet is revoked/deactivated~~ Retired in D54 (no personal sign-in on a tablet) | — |
| G3 other tabs re-sync; Availability load error | Playwright `devices/shared_device_no_personal_login` (D54: a person's sign-out in tab A, tab B leaves the app), `devices/availability_errors` |
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
| S4 | ~~Tablet Sign out revokes the personal token~~ Retired in D54 (no personal sign-in on a tablet). The login form still sends `X-Rockcut-Device` on a tablet: see D54 S246 | — |
| S5 | ~~Idle return revokes it~~ Retired in D54 (no personal sign-in on a tablet) | — |
| S6 | ~~Revoke unreachable → tablet still returns; 15-min idle / 12-h cap on the server~~ Retired in D54 (no personal sign-in on a tablet) | — |
| S7 | ~~Revoking/deactivating/deleting a tablet ends sessions started on it~~ Retired in D54 (no personal sign-in on a tablet); D54 S249 revokes the ones left at release | — |
| S8 | Own password change revokes other sessions | ExUnit `session_revocation_test`; Playwright `auth/profile` (S18) |
| S9 | Owner reset revokes all | ExUnit `session_revocation_test` |
| S10 | Deactivation unchanged | ExUnit `session_revocation_test`, `sessions_test` |
| S11 | Made-up `ses_` → 401; stale/garbage device header → normal 30-day sign-in | ExUnit `session_revocation_test` (D54 S248) |
| S12 | ~~Pre-D34 token still accepted~~ Retired in D51 (4058): pre-D34 tokens are refused, see D51 S2 | — |
| S13 | ~~Pre-D34 token refused after reset / own change / sign-out-others~~ Retired in D51 (4058): refused always | — |
| S14 | Profile → Sign out of all other devices | ExUnit `session_revocation_test` (audit); Playwright `auth/session_revocation` |
| S15 | ~~No profile during a personal sign-in on a tablet~~ Retired in D54 (no personal sign-in on a tablet) | — |
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
| S13 | ~~Tablet "Sign in as me" → Redeem: no code prompt; History plain name~~ Retired in D54 (no personal sign-in on a tablet) | ExUnit `beer_board_controller_test` (S5/S6: a person's write logs no device) |
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
| S148 | ~~Sign in as me on a Dark tablet: stays dark~~ Retired in D54 (no personal sign-in on a tablet); `/api/me` gives the person's own theme | — |
| S149 | bartender1: no Shared devices page; PATCH 403 | Playwright `ui/theme` (S149); ExUnit `color_mode_test`, `authz_device_test` |
| S150 | owner (Dark): every page and the main dialogs readable | **Manual** (Task 3 sweep, screenshots kept for the PR); QA's DEV pass |
| S151 | board page, columns, today, cards: distinct in both themes | Playwright `ui/task-board-ui` (S151, light and dark) |
| S152 | nav order Home, Tasks, Schedule; phone drawer the same (D53: Home, Tasks, Boards, Schedule) | Playwright `ui/layout` (S152) |
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
| P19 | bartender1 / barMgr: Home, API 403; breweryDevice read-only | Playwright `production/access` (bartender1 and barMgr: no nav entry, every setup URL goes Home, API 403; owner and floater open every page; since D50 breweryDevice reads the setup and its setup changes are 403 "Not available on a shared device"); ExUnit `authz_parity/production_test` (12 personas), `authz_test`, `device_route_matrix_test`. The read-only pages on the device: D50 P106 |

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
| — | Brewery members and owners only (403 for others); the new routes people-only until D50 (now the brewhouse device's, with a staff code: D50) | ExUnit controller test, `device_route_matrix_test` |

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
| DEV QA Y1 | A split batch moves as one tree: Move all from any parent step on or before the Split (Brew day, FDH, the Split) moves the Split and every part's unfinished steps by the same days, listed in the prompt under each part's label, titled "P5 and its 2 parts · …" ("N batches · …" stays for separate batches); moving the Split itself (drag, dialog, API, a late check-off) or shifting the parent's bar carries the parts with either answer; a done part step refuses those moves (`part_step_done`); a part step before its Split raises "Steps out of order" for the part; Undo reverses the whole tree | ExUnit `split_moves_test` (Brew day, FDH, the Split with each answer and +20, Shift, Move only, the flag and its clearing, the done-step refusal, Undo), `splits_marks_test` (updated), controller test (preview groups, carried, the refusal's message); Playwright `d48-fix-cycle-5` (the prompt's groups, the Split's snackbar, Undo) |
| DEV QA Y2 | A Split, Transfer/Filter or Package (on a part: its parent's) can't be checked off before brew day (`before_brew_day`, "Check off brew day first."), in the preview and the write; brew day can't be un-checked while one of them is done (`exit_done`); un-checking a Split or Package without a done brew day gives planned, with no number | ExUnit `split_moves_test` (QA's sequence, a part's Package, a lager's Transfer and Package, the brewed control, an old bad state put right), `schedule_test` (updated), controller test (the message); Playwright `d48-fix-cycle-5` (the step dialog's refusal) |
| DEV QA Y3 | Brand and Template are read-only on a split parent and its parts ("Undo the split first to change it"); the API refuses the parent's brand with `split` | ExUnit `batch_changes_test` (updated), controller test (422); Playwright `d48-fix-cycle-5` |
| DEV QA Z1 | A split part can't get ahead of its parent's Split: a part's Transfer/Filter or Package (staying part too) is refused while the Split isn't done (`before_split`, "Check off Split - Transfer first."; `before_brew_day` wins), in the preview and the write; the Split can't be un-checked while a part's exit is done (`part_exit_done`, "Mark … P1.2: Package not done first."); with the Split not done every part is planned (a part with a done FDH/Carb too; a part already left fermenting is put right by the next un-check in its family) | ExUnit `split_moves_test` (both of QA's routes, the staying part, the precedence, the order back, a part's Transfer, the lager control, an old bad state put right), controller test (both messages); Playwright `d48-fix-cycle-6` (the step dialog's two refusals) |
| DEV QA Z2 | A late or early check-off of the Split names the parts it carries: "Split - Transfer done, 5 days late. … P6.1 and … P6.2 moved with it." | Playwright `d48-fix-cycle-6` (the wording, Undo) |
| DEV QA Z3 | `PATCH /api/production/steps/:id` refuses `due_on`, `done_on` and `completed_at` (`date_not_here`, 422) instead of ignoring them | Controller test `production_schedule_controller_test` |
| DEV QA AA1 | Undo obeys the order rules: an Undo that marks a step done runs the check-off rules (`before_brew_day`, `before_split`), one that marks it not done the un-check rules (`exit_done`, `part_exit_done`), against the schedule as the Undo leaves it; refused with the rule's own code and message, nothing undone, and the same Undo works once the blocker is cleared; the stale check is unchanged (a full Package is still `undo_stale`) | ExUnit `split_moves_test` (QA's paths A, B and C, brew day both ways, controls), controller test (path A over HTTP with two users, the 422); Playwright `d48-fix-cycle-7` (path A with owner and breweryMgr: the Undo's refusal, part 2 unchanged) |
| DEV QA AA2 | Brew day's `exit_done` names the part when the done exit is a part's ("Mark … #44.2: Transfer not done first."); a parent's own exit keeps "Mark Split - Transfer not done first." | ExUnit `split_moves_test` |

Not automated: P87 (touch long-press selection on the Pixel) and a touch drag's auto-scroll, by hand at the DEV gate.

## D49 — Task list linkage, Clean not sanitized, Pencilled batches (`specs/d46_production_scheduling_spec.md` §3.12–§3.12b; `planning/d49_schedule_task_list_plan.md`)

Playwright specs are in `regression/production/` (project `production`) and, for the board, `regression/tasks/task-board-linked` (project `brewery-board`, after `production`), each on its own `[TEST-TEMP]` data.

| # | Scenario | Layer |
|---|---|---|
| P90 | Plan a batch: each task-list step a task on its day ("TANK · Brand P1 · FDH"), Planned batch pill; no marker has one | Playwright `task-board-linked`; ExUnit `task_link_test`, `task_board_linked_test` |
| P91 | Show planned batches off: hidden, still off after a reload; brewer2's board unaffected | Playwright `task-board-linked`; ExUnit `task_board_linked_test` (`/api/me`, PUT) |
| P92 | Drag a linked task 2 days later: the move prompt on the board; Apply moves the step and the following ones; Cancel puts the card back | Playwright `task-board-linked`; ExUnit `task_board_linked_test` |
| P93 | Check off a step due today on the board: done on the Gantt, no "where should it show" | Playwright `task-board-linked`; ExUnit `task_board_linked_test` |
| P94 | Check off a step planned 3 days ago: moves to today with the move prompt | Playwright `task-board-linked`; ExUnit `task_board_linked_test` |
| P95 | Check off a planned batch's brew day on the board: the batch number prompt; the title then has "#N" | Playwright `task-board-linked`; ExUnit `task_board_linked_test` |
| P96 | Edit a linked task: "This task comes from the production schedule" + Open in schedule (the step dialog on the Gantt); no title or day fields | Playwright `task-board-linked` |
| P97 | Assign a linked task to brewer2: the step's assignee (the Gantt's initials come from it, D47's rendering tests) | Playwright `task-board-linked`; ExUnit `task_board_linked_test`, `task_link_test` |
| P98 | The step's notes changed on the schedule show on the board | Playwright `task-board-linked`; ExUnit `task_link_test` |
| P99 | Delete a linked task: "Take this off the task list? …"; the step stays, off the list; the schedule's Undo brings it back | Playwright `task-board-linked`; ExUnit `task_board_linked_test`, `task_link_test` |
| P100 | The step dialog's "Show on the Brewery task list" on: the task comes back on its day | Playwright `task-board-linked`; ExUnit `task_link_test` |
| P101 | Into another tank / its batch number: the titles follow | Playwright `task-board-linked` (tank), P95 (number); ExUnit `task_link_test` (renumbering, renames) |
| P102 | Gantt → Task list: Late / Today / the next days; check off, Move to [date], assign, Open; follows Show planned batches | Playwright `d49-task-list` |
| P103 | A standalone CIP: "TANK · CIP & Sanitize" on the board; checked off there, the tank is sanitized | Playwright `task-board-linked`; ExUnit `task_link_test` |
| P104–P107 | The brewhouse tablet on the schedule | **D50** (Matt, 2026-10-26): see the D50 section |
| P108 | No recurring options on a linked task; Change day… has no Future and runs the move prompt | Playwright `task-board-linked`; ExUnit `task_board_linked_test` (`linked_task`) |
| — | ~~The brewhouse tablet: linked tasks read-only (`linked_task_device`)~~ Replaced by D50 §2.5: on the tablet they work with a staff code (D50 section, D4 and "linked tasks on the device") | — |
| — | A phase marker has no task-list switch (step dialog, template row, Add phase start) (decision 6.1) | Playwright `d49-task-list` |
| — | The Dashboard's Today's tasks card: a linked brew day (batch number) opens its step on the schedule, nothing checked off; a CIP checks off in the card (decision 8.3) | Playwright `task-board-linked` |
| — | Move all to today leaves linked tasks; shift-end reminders list them | Playwright `task-board-range` (S20); ExUnit `task_board_linked_test`, `task_shift_end_reminder_test` |
| BB1 | A refused snackbar Undo keeps its button until the token runs out; the same Undo works once another user clears the blocker | Playwright `d49-undo-retry` |
| BB2 | The Split's Undo after a part's full Package, brew day's in a split family, a Split un-check's after brew day, a late Split's: refused with the rule's own code, then undone once it's cleared (the late Split's parts get their dates back); a real change since is still `undo_stale` | ExUnit `split_moves_test` |
| P122 | Sani 40 days → Mark… → Clean not sanitized: "Clean no sani 0 days" (amber), a marker, rows ≥ 56 px, the current state greyed; Undo | Playwright `d49-clean-not-sanitized`; ExUnit `clean_not_sanitized_test` |
| P123 | A fill after it: "isn't sanitized" (soft), signed off in the Flags list; a done CIP & Sanitize (or a planned one, a Sanitize, a Clean & sanitized mark) clears it | Playwright `d49-clean-not-sanitized`; ExUnit `clean_not_sanitized_test` |
| P124 | Dirty → Clean not sanitized: the dirty flags clear; History names it | Playwright `d49-clean-not-sanitized`; ExUnit `clean_not_sanitized_test` |
| P125 | Add process ▾ → CIP… → CIP - no sani, already done: Clean no sani, no dirty flags (the board title "TANK · CIP - no sani": `task-board-linked`) | Playwright `d49-clean-not-sanitized`; ExUnit `clean_not_sanitized_test` |
| P126 | Step dialog switches an exit CIP to CIP - no sani (renamed); the next fill gets "isn't sanitized", not dirty; a done CIP can't switch | Playwright `d49-clean-not-sanitized`; ExUnit `clean_not_sanitized_test` |
| P127 | Sanitize on a Clean no sani tank: Sani 0 days; a fill after it has no flags | Playwright `d49-clean-not-sanitized`; ExUnit `clean_not_sanitized_test` |
| P128 | Planned CIP - no sani, then Sanitize, then a fill: no flags; delete the Sanitize → "isn't sanitized" | Playwright `d49-clean-not-sanitized`; ExUnit `clean_not_sanitized_test` |
| P129 | Sanitize done on a dirty tank (empty-spot menu's Add CIP…): still dirty, "no CIP planned"; the step dialog says "The tank was dirty: run a CIP first." | Playwright `d49-clean-not-sanitized`; ExUnit `clean_not_sanitized_test` |
| — | A template's CIP entry takes the variant and passes it to planned batches | Playwright `d49-clean-not-sanitized`; ExUnit `clean_not_sanitized_test` |
| P130 | Plan batch → Pencil in (Unassigned): an X-number, faded, hatched, labeled Pencilled; no "No tank assigned"; no board tasks | Playwright `d49-pencilled`, `task-board-linked` (board); ExUnit `pencilled_test`, controller test |
| P131 | Dragged over a scheduled batch: its overlap flag muted (no Mark OK, not in the chip or the badge); the scheduled batch keeps its own, open; `flag_muted` | Playwright `d49-pencilled`; ExUnit `pencilled_test`, controller test; Vitest `gantt` (`flagChip`, `badgeText`) |
| P132 | Schedule this batch: a P-number by date (others renumber), drawn normally, flags open; Undo; its tasks on the board | Playwright `d49-pencilled`, `task-board-linked` (board); ExUnit `pencilled_test` |
| P133 | Pencil in a scheduled planned batch: an X-number, faded; not offered (and `step_done`) once a step is done; its tasks leave the board | Playwright `d49-pencilled`, `task-board-linked` (board); ExUnit `pencilled_test` |
| P134 | Brew day on a pencilled batch: "Schedule this batch first." (`schedule_first`); Cancel leaves it; Schedule, then the number prompt and the check-off | Playwright `d49-pencilled`; ExUnit `pencilled_test`, controller test |
| P135 | Show planned batches on: a pencilled batch's steps never show on the board | Playwright `task-board-linked`; ExUnit `task_link_test` |
| — | X-numbers by brew date, renumbered both ways; split parts follow their parent (X1.2), scheduled together | ExUnit `pencilled_test` |

## D51 part 2 — Auth cleanup, build commit (`specs/d51_security_cleanup_spec.md` Part 2)

| # | Scenario | Coverage |
|---|----------|----------|
| S1 | `owner` signs in on the web; pages load; sign out (sessions only) | Playwright full suite (every spec signs in with `ses_` sessions); ExUnit `session_revocation_test` |
| S2 | A pre-D34-style token gets 401 and the UI shows the sign-in page | ExUnit `session_revocation_test` ("pre-D34 tokens (D51, task 4058)": correctly signed `"user auth"` and `"synthetic auth"` tokens → 401); Playwright `auth/pre_d34_token` (stale token in `localStorage` → sign-in page, `rockcut_token` cleared) |
| S3 | A paired tablet keeps working (~~"Sign in as me" works~~ retired in D54) | Playwright `devices/*`; ExUnit `auth_plug_device_test`, `device_session_api_test` |
| S4 | Minted persona tokens work locally and on DEV | Playwright `auth.setup.ts` (every run); ExUnit `synthetic_test` |
| S5 | `barMgr` adds a person: the temporary password shows once; they sign in with it and must set their own | ExUnit `user_controller_test` (a typed `password` is ignored, never echoed, generated one signs in; `filter_parameters`), `password_reset_gate_test`; Playwright `auth/helpers.createTempPerson` uses the returned `temp_password` |
| S6 | `/api/health` on DEV shows the deployed SHA; the DEV ribbon shows the same short SHA | ExUnit `health_controller_test`; **manual** on DEV (pre-flight, `RUNNING.md`) |
| G1/G5 | Brewing numbers have ranges (ABV 0–100, SG 0.950–1.200, °F, ppm, …): out of range → 422 naming the range; 40-digit / `1e308` JSON numbers refused; the inputs carry `min`/`max`/`step="any"` | ExUnit `brewing/ranges_test` (every field: both bounds, just outside), `brewing_ranges_controller_test` (raw JSON per resource: in range saves, 40 digits refused; update to 1000 / 1e308 / -5 keeps the old value); Playwright `brewery/brand-ranges` (breweryMgr, `[TEST-TEMP]` brand, ABV 1000: browser refuses, then API 422 shown in the dialog, 5.25 after reload) |

## D54 — Remove "Sign in as me" from shared tablets (`specs/d54_remove_tablet_sign_in_as_me_spec.md`)

Retired with it: D33 S13, G2; D34 S4–S7, S15; D37 S13; D43 S148 (marked above). Playwright `devices/personal_signin`, `devices/personal_signin_revoke` and `devices/tablet_idle` (both its tests were D36-G/I personal-session idle) are deleted; the personal-session cases in `device_header`, `device_signout` (G4 stale tab), `device_session` (S6 now expects no button), `pwa-update/update_prompt` (S176), `ui/theme` (S148) and `taproom/beer-board-device` (S13) go with them. The mocked staff-code lockout messages in `beer-board-device` and `tasks/task-board-tablets` match the new text.

| # | Scenario | Coverage |
|---|---|---|
| S244 | Tablet header: no Sign in as me; device pill, theme, Sign out | Playwright `devices/shared_device_no_personal_login`, `devices/device_header` (both widths), `devices/device_session` (S6) |
| S245 | Paired tablet types `/login`: the refusal, no form; the login form shows the refusal in place of the form when the API refuses | Playwright `devices/shared_device_no_personal_login` |
| S246 | `POST /api/session` with a live `X-Rockcut-Device`: 403 for the right and a wrong password (and an unknown email), no session row | ExUnit `session_revocation_test` (revert-and-rerun recorded); Playwright `devices/shared_device_no_personal_login` (API; persist-verified: Sign out of all other devices revokes 0) |
| S247 | `bartender1` signs in normally without the header (30 days) | ExUnit `session_revocation_test`; Playwright `auth/*` |
| S248 | A revoked, made-up or person token in the header: normal login | ExUnit `session_revocation_test`; Playwright `devices/shared_device_no_personal_login` (revoked `[TEST-TEMP]` tablet) |
| S249 | Release migration revokes tablet sessions only; the tablet returns to its shared screen | ExUnit `migrations/revoke_tablet_personal_sessions_test` (revert-and-rerun recorded; since D55 it runs D55's column drop down first). The start-up shim, its Vitest and its Playwright case were **removed in D55** (§2.8): every tablet has started the D54 app (task 5164) |
| S250 | Staff codes unchanged: Acting as for 5 minutes, Buy-a-Beer | Existing Playwright `tasks/task-board-tablets`, `taproom/beer-board-device`; ExUnit `task_board_device_test`, `beer_board_controller_test` |
| S251 | Tablet revoked: "This tablet was unpaired" straight away (4988), never a sign-in form | Playwright `devices/shared_device_no_personal_login` (a paired tablet revoked by the owner). The stale set-aside-token case went with the shim in D55 |
| S252 | `breweryMgr` Profile → Change password; Sign out of all other devices | ExUnit `session_revocation_test` (S8, S14); Playwright `auth/profile`, `auth/session_revocation` |
| S253 | `POST /api/session` with a live tablet token in `Authorization` only (DEV QA G1): 403 for the right and a wrong password, no session; a revoked, made-up or person token there: normal login | ExUnit `session_revocation_test` (revert-and-rerun recorded) |
| S254 | Blank browser, typed `/login` (or another URL) → Set up as a shared device: ends on the tablet's Home, not the refusal (DEV QA G5) | Playwright `devices/shared_device_no_personal_login` (revert-and-rerun recorded) |
| — | `Sessions.create/3` refuses `:device_token` | ExUnit `sessions_test` |

## D53 Part 1 — Multiple assignees on tasks (`specs/d53_idea_boards_spec.md` §3; `planning/d53_part1_multi_assignees_plan.md`; `prompts/d53_part1_lead_decisions_1.md`)

ExUnit files are under `rockcut_api/test/`: `tasks/assignees_test` (the one writer), `tasks/multi_assignees_test` (the context, series, leaving, History names), controller `task_board_multi_assignee_test` (the API, linked tasks, the tablet, the route matrix, S221), `migrations/create_task_assignees_test` (the backfill), `seeds/synthetic_test`. Vitest `tasks.test`. Playwright `regression/brewery/task-board-multi-assignee.spec.ts` (19 tests; passing locally at stop point 3).

| # | Scenario | Layer |
|---|---|---|
| S216 | brewer1 adds brewer2 and floater: two sets of initials after a reload; History "Assigned Riley Wort, Jordan Float to …" (lead decision 2: full names) | Playwright `task-board-multi-assignee` (S216 ×2); ExUnit `multi_assignees_test`, `task_board_multi_assignee_test`; Vitest `tasks.test` (wording) |
| S217 | My tasks shows a shared task for each person, in either place | Playwright (S217 ×2); ExUnit `multi_assignees_test` (`open_work`); Vitest `tasks.test` (`cardShown`) |
| S218 | owner removes someone from the Brewery: off the open tasks, the other person stays, first recomputed, History "Removed …" | Playwright (S218); ExUnit `multi_assignees_test` (leaving, series, other board, done tasks keep the name) |
| S219 | A weekly series with two people; new occurrences carry both; a "following" edit changes later ones | Playwright (S219); ExUnit `multi_assignees_test` (this, following, exceptions, finished, split, chain, Ends-only, one-off → repeat, top-up) |
| S220 | Linked task: one person, the single picker, a change reaches the step; two through the API → 422 | Playwright (S220); ExUnit `task_board_multi_assignee_test` (one, none, two, schedule → task, leaving, tablet) |
| S221 | Shift-end push: each person on a shared task hears once; it's theirs | ExUnit `task_board_multi_assignee_test` (S221; the scanner's clock is injected). No browser path: **DEV only by hand** |
| S222 | Brewhouse tablet with a staff code adds two people; History names the acting person | Playwright (S222); ExUnit `task_board_multi_assignee_test` |
| — | Lead decision 3: the same people in another order isn't a change (no write, event, scope question or exception); the dialog keeps the order of who stays and adds new ones last | ExUnit `multi_assignees_test` (context, series), `task_board_multi_assignee_test` (API); Playwright (decision 3 ×3); Vitest `tasks.test` (`samePeople`) |
| — | §3.1: `assignee_id` always equals the first; backfill; rows go with the task | ExUnit `assignees_test`, `multi_assignees_test` (`assert_in_step`), `migrations/create_task_assignees_test`, `seeds/synthetic_test` |
| — | §3.3: a lone `assignee_id` from a UI tab on the old version; a refusal names the person | ExUnit `task_board_multi_assignee_test`, `assignees_test`; Playwright (old tab, refusal); Vitest `tasks.test` (`taskSaveError`) |
| — | Old single-assignee History rows read as before | ExUnit `multi_assignees_test` (stored rows); Vitest `tasks.test` (exact wording) |
| — | Up to three initials then "+N"; tooltip names everyone; the title keeps its room and nothing runs off the card; a person who left stays visible until removed; phone back closes the list, then the dialog | Playwright (one test each; the layout check was confirmed failing on the old layout) |
| — | Dashboard Today's tasks shows everyone, chips together, the title keeps its room at phone width | Playwright (at phone width; confirmed failing on the old layout) |
| — | QA gap 1 (lead decisions 3): a rule change keeps people, title and notes on dates that survive; a new date takes the people of the last occurrence before it not changed on its own (lead decisions 4; a finished one counts; none, the series' own); later top-ups go on from the latest; the confirm and History say so | ExUnit `multi_assignees_test` ("QA gaps 1 and 2"), `task_board_multi_assignee_test` (through the API), both confirmed failing with the fix reverted; Playwright (QA gap 1, through the dialog); Vitest `repeat.test`, `tasks.test` |
| — | QA gap 2: an occurrence changed on its own stays marked after a split, so a later "following" leaves it alone | ExUnit, as above, confirmed failing with the fix reverted |
| — | QA gap 3: over 100 distinct ids is one quick 422; five refusals by name and a count below it | ExUnit `task_board_multi_assignee_test` (100, 101, 30,000), confirmed failing with the fix reverted |
| — | QA gap 7: the linked-task refusal names the person under `assignee_ids` | ExUnit `task_board_multi_assignee_test`, confirmed failing with the fix reverted |
| — | QA gap 10: a long name wraps in the phone people list | Playwright (at phone width), confirmed failing with the fix reverted |
| — | Rollback API: the board reads one person when `assignees` is absent | Vitest `tasks.test` (`cardPeople`). Not run against an old API: **GAP** |

## D53 Part 2 — Boards (Idea Boards in code) and the §4.8 follow-ups (`specs/d53_idea_boards_spec.md` §4, §5; `planning/d53_part2_idea_boards_plan.md`)

ExUnit files are under `rockcut_api/test/`: `rockcut_api_web/idea_board_route_matrix_test` (every route × 5 boards × 8 actors), `authz_parity/idea_boards_test`, `authz_device_test`, `rockcut_api_web/device_route_matrix_test`, controller `idea_board_controller_test` (reads), `idea_board_write_test` (writes, the lock matrix), `idea_board_send_test` (§4.7), `idea_boards/watchers_test` (§4.6), `migrations/create_idea_boards_test`, `seeds/synthetic_test` ("Idea Boards"), `tasks/qa_followups_test` (§4.8). Vitest `ideas.test`, `tasks.test`, `repeat.test`. Playwright `regression/ideas/` in the one-worker `idea-boards` project (`idea-boards-smoke.spec.ts`, `boards-scenarios.spec.ts`), and `regression/tasks/task-board-qa-followups.spec.ts` in `brewery-board`.

| # | Scenario | Layer |
|---|---|---|
| S223 | bartender1: nav → Boards opens `/boards/bar`, Ideas / Planned / Doing / Done; switcher Taproom, Company | Playwright smoke (S223); ExUnit route matrix (`/api/idea_boards`), `migrations/create_idea_boards_test` (starter lists) |
| S224 | A list and a card with labels, checklist, due date and bartender2; kept after a reload; nobody watching | Playwright smoke (S224, through the UI) and scenarios (S224); ExUnit `idea_board_write_test` (S224), `watchers_test` (no rows) |
| S225 | One notification naming both changes; none to the person who made them | ExUnit `watchers_test` (S225, clock pinned). Playwright (S225): the Watch toggle and the card's eye. The 10–15 minute timing and push: **DEV by hand** |
| S226 | floater's switcher: Taproom, Brewery, Company (Company last) | Playwright scenarios (S226; boards in department order, as the task boards); ExUnit route matrix |
| S227 | brewer1 → `/boards/bar` goes to `/boards/brewery`; API 403 | Playwright smoke and scenarios (S227); ExUnit route matrix |
| S228 | barMgr locks a list; bartender1 can't add, edit, move or archive (423); barMgr keeps editing | Playwright smoke (S228) and scenarios (S228, crafted PATCH 423); ExUnit `idea_board_write_test` (lock matrix: 12 writes) |
| S229 | A locked card: bartender1 can't edit or drag it; its neighbours still move | Playwright scenarios (S229, mouse drag); ExUnit `idea_board_write_test` |
| S230 | splitRole: no Lock on Brewery, Lock on Taproom | Playwright scenarios (S230); ExUnit `idea_board_write_test`, parity |
| S231 | Company lock: breweryMgr 403; owner locks; then 423 for breweryMgr and brewer1 | Playwright scenarios (S231); ExUnit `idea_board_write_test` |
| S232 | office1 assigns bartender1 on a Company card | Playwright scenarios (S232); ExUnit `idea_board_write_test` |
| S233 | Send: one task with both people, ☐ notes, From link, chip with the day | Playwright smoke (S233, to the task dialog's "From the … board" link and back) and scenarios (S233); ExUnit `idea_board_send_test` |
| S234 | One task per item, then the card moves to Done | Playwright scenarios (S234); ExUnit `idea_board_send_test` |
| S235 | Ticked on the task board → "✓ Done" | Playwright scenarios (S235); ExUnit `idea_board_send_test` |
| S236 | office1's Company card sends to Office; brewer1 "not in Office, left off" | Playwright scenarios (S236); ExUnit `idea_board_send_test` |
| S237 | Archive a list, find it with Archived's search (name, card title or description, ignoring case; "Nothing archived matches"), restore it with its cards; only barMgr deletes for good | Playwright smoke (S237) and scenarios (S237 search, S237 delete); Vitest `ideas.test` (`archivedMatching`); ExUnit `idea_board_write_test` |
| S238 | noDept: only Company, full use; `/boards/bar` → `/boards/company` | Playwright scenarios (S238); ExUnit route matrix |
| S239 | Phone: tabs, a card URL, back closes it, a long press drops a card on another list's tab | Playwright smoke (S239) and scenarios (S239, touch drop on a tab) |
| S240 | barMgr: Taproom History only; bartender1 403; barMgr 403 on Company History | Playwright smoke (S240) and scenarios (S240); ExUnit route matrix |
| S241 | taproomDevice: Taproom and Company, view only; writes 403; Brewery 403 | Playwright smoke (S241) and scenarios (S241); ExUnit route matrices, `authz_device_test` |
| S242 | Two notifications for changes 15 minutes apart; none after Watch off; the Watching filter | ExUnit `watchers_test` (S242); Playwright scenarios (S242: the filter). Real timing: **DEV by hand** |
| S243 | floater removed from Taproom: no more notifications; the watch is gone | ExUnit `watchers_test` (S243), `idea_board_write_test` (S243). Not in Playwright (it changes a shared persona's memberships) |
| S255 | A note on a locked card saves; the rest stays read-only | Playwright scenarios (S255); ExUnit `idea_board_write_test` (S255), `watchers_test` (watchers hear of it) |
| S256 | bartender1 adds a label but can't rename or delete (403); barMgr's delete strips it from a locked card | Playwright scenarios (S256 ×2); ExUnit `idea_board_write_test` |
| S257 | A non-manager can't archive an unlocked list holding a locked card, and is told why | Playwright scenarios (S257); ExUnit `idea_board_write_test` |
| S258 | A past due date sends for Today; no Repeat per item; a locked card has no Send for bartender1, barMgr sends it | Playwright scenarios (S258 ×2); ExUnit `idea_board_send_test` |
| S259 | A deleted sent task → "Removed", title kept | Playwright scenarios (S235 and S259); ExUnit `idea_board_send_test` |
| S260 | Deactivating a `[TEST-TEMP]` person: off cards and watches; notes stay under their name | Playwright scenarios (S260); ExUnit `idea_board_write_test` (S260) |
| S261 | Notes newest first, author and time, "edited"; bartender2 403; barMgr deletes | Playwright scenarios (S261 ×2); ExUnit `idea_board_write_test` |
| — | Archived cards are read-only (lead decisions 2) | ExUnit `idea_board_write_test` |
| — | Seed and reseed: `[SEED]` data on Brewery, Taproom, Company; `[TEST-TEMP]` lists, cards and labels removed on every board | ExUnit `seeds/synthetic_test` ("Idea Boards") |
| §4.8 gap 4 | A following edit's History names everyone it took off later occurrences | ExUnit `qa_followups_test`, Vitest `tasks.test`, Playwright `task-board-qa-followups` (gap 4); all confirmed failing with the fix reverted |
| §4.8 gap 5 | Leaving: one History row per series, with its count | ExUnit `qa_followups_test`, Vitest `tasks.test`; confirmed failing reverted |
| §4.8 gap 6 | Mark not done doesn't put a former member back | ExUnit `qa_followups_test`; confirmed failing reverted |
| §4.8 gap 9 | Deactivation reads "(deactivated)" | ExUnit `qa_followups_test`, Vitest `tasks.test`; confirmed failing reverted |
| §4.8 gap 11 | One person, a repeat and notes: the initials go under the title | Playwright `task-board-qa-followups` (gap 11); confirmed failing reverted |
| §4.8 gap 13 | A rule change from the first occurrence with keep: kept ones join the new series | ExUnit `qa_followups_test` (×2); confirmed failing reverted |
| §4.8 gap 14 | A kept occurrence moved off its day: the confirm says its old day can be made again (`keeps_moved`) | ExUnit `qa_followups_test`, Vitest `repeat.test`; confirmed failing reverted |
| Recheck 2 obs. 1 | Removed occurrences with their own notes: the confirm and History say so | ExUnit `qa_followups_test` (×2), Vitest `repeat.test`, `tasks.test`; confirmed failing reverted |
| Recheck 2 obs. 2 | The Ends "After N times" error reads as a sentence (no `count:`) | Vitest `tasks.test` (`taskSaveError`); confirmed failing reverted |

## D55 — Tablets and tidy-up (`specs/d55_tablets_and_tidy_spec.md`; `planning/d55_tablets_and_tidy_plan.md`; `prompts/d55_lead_decisions_1.md`)

ExUnit files are under `rockcut_api/test/`; Vitest under `rockcut-ui/src/`. Playwright specs written; **not yet run** (stop 2: servers belong to D53). "Revert" = confirmed failing with the fix reverted.

| # | Scenario | Coverage |
|---|---|---|
| T1 | Tablet: a 401 on one route, `/api/me` fine → stays paired and working | Vitest `lib/api.test` (revert), `hooks/useAuth.test` (401 on `/api/me` itself, revert); Playwright `devices/stray_401` (T1) |
| T2 | Person: a 401 on one route, `/api/me` fine → stays signed in | Vitest `lib/api.test`, `hooks/useAuth.test` (revert); Playwright `devices/stray_401` (T2) |
| T3 | A revoked tablet still unpairs on its next request (and at start-up, on the first try) | Vitest `lib/api.test`, `hooks/useAuth.test` (one recheck, no "retrying"); Playwright `devices/stray_401` (T3, temp device), `devices/shared_device_no_personal_login` (S251) |
| T4 | A deactivated person is still signed out (and at start-up, on the first try) | Vitest `lib/api.test`, `hooks/useAuth.test`; Playwright `devices/stray_401` (T4, temp person) |
| — | §2.1: a burst of 401s makes one `/api/me` call; 5xx/network keeps the token; an older token or none, and a failed sign-in, make no check; D42's 403 unchanged | Vitest `lib/api.test` (revert) |
| T5 | Tablet, unknown URL → "Page not found" with Go to Home | Playwright `devices/unknown_url` (T5). No unit test (App can't load under Vitest); revert check waits for the Playwright run |
| T6 | Tablet, real personal page → "Not available on a shared device" | Playwright `devices/unknown_url` (T6), `devices/device_session` (S9) |
| — | A person's unknown URL still goes Home | Playwright `devices/unknown_url` |
| — | A tablet opens Boards (`/boards`, a board, a card), not "Page not found" | Playwright `devices/unknown_url` |
| T7 | Malformed JSON / an oversize body from the UI's origin: readable 400/413 JSON, not "Failed to fetch" and not dev's HTML debug page; a disallowed origin still gets no CORS header | ExUnit `endpoint/parser_cors_test` (revert; a `Plug.Debugger` pipeline stands in for dev's `debug_errors`, lead decisions 5); Playwright `app/parser_errors` (T7, cross-origin `fetch`) |
| T8 | Malformed `memberships` (map, string, `[null]`, `["x"]`, form-encoded) → 422 on `memberships`, nothing saved; `PUT …/memberships` the same (and `null` there) | ExUnit `controllers/user_memberships_malformed_test` (owner and manager, revert); Playwright `app/parser_errors` (T8) |
| T9 | Grain bill ingredient with Sort Order empty → saved at the end; null on update → end; left out of an update → stays | ExUnit `controllers/recipe_ingredient_sort_order_test` (revert); Playwright `brewery/recipe_sort_order` (T9, persist-verified) |
| — | `parseApiError` copes with any body (500, HTML, empty, odd shapes) | Vitest `lib/parseApiError.test` (revert) |
| T10 | Missing ingredient category (new and old URL) → "Category not found" + link back | Playwright `brewery/recipe_sort_order` (T10). No unit test; revert check waits for the Playwright run |
| T11 | Tab title, manifest name/short_name/description, Apple title say Rock Cut; the manifest an installed app reads after the update | Playwright `pwa-update/app_name` (`PWA_UPDATE=1`). Installed Android label: **manual** on the Pixel |
| T12 | Field definition with Sort Order empty → saved at the end (§2.10) | ExUnit `controllers/field_definition_sort_order_test` (the 500 confirmed first: NOT NULL); Playwright `brewery/recipe_sort_order` (T12, persist-verified) |
| T13 | An out-of-range id (`99999999999999999999`) in any route's URL → 404, never 500 (§2.11) | ExUnit `plugs/out_of_range_ids_sweep_test`: every route with an `id`/`*_id` param, from the router (178 at D55), as the owner (404) and as `taproomDevice` (404 where it can reach, 14; else DeviceGate's 403). Revert: `PathIds` off → the sweep fails with the driver's 500 (`Exqlite.Error`) |
| T14 | A write naming a parent that doesn't exist (`12345`, `0`, `-1`) → 422 "does not exist" on that field, never 500; nothing saved (§2.12) | ExUnit `missing_parent_sweep_test`: built from the schemas (every `belongs_to` a `*changeset*` casts: 45 fields in 34 changesets at D55), so a new one without `RockcutApi.Changeset.validate_parents/2` fails; `controllers/missing_parent_test`: 14 create routes through the API (brewing, positions, shift templates, shifts, devices, time off, schedule events, availability), persist-verified; a route that looks the parent up first keeps its answer (shift position: 403). Revert (helper off, in a scratch copy): the sweep lists all 45, the API test raises `Ecto.ConstraintError` |
| — | §2.11: an out-of-range id in the body or query (`*_id`, `*_ids`, `ids`, any depth) → 422 on that key (a nested one on its top-level key, e.g. `memberships`), nothing saved: shifts, time off, schedule events, devices, recipes, production batches/CIPs/steps, users; `before_id` keeps D38's rule | ExUnit `plugs/param_ids_test` (revert: `ParamIds` off → the driver's 500) |
| — | §2.11: memberships `department` past the range → 422 "unknown department" (POST and PUT) | ExUnit `controllers/user_memberships_malformed_test` (revert) |
| — | Gap 10: task-board History `task_id` / Boards History `card_id` that isn't a usable id (`1e20`, `abc`, `-1`, `0`, past the range) → 422 on that param; absent or empty → the whole History | ExUnit `controllers/history_filter_test` (revert); D53's `idea_board_fix_cycle_1_test` updated to expect 422 (lead decisions 3) |
| — | `Ids.page`: digits past the range or the cap → the last page (empty); junk → page 1 | ExUnit `ids_test` (revert), `history_filter_test` (both Histories: `page=99999999999999999999` → `data: []`) |
| — | Messages `before` that isn't a usable id → 422 (was a 500) | ExUnit `controllers/history_filter_test` (revert) |
| — | DEV QA gap 8/9 (lead decisions 6): ingredient category Sort Order null/""/left out on create → the end; null/"" on update → the end; left out → stays (was a 500 on null). `""` on grain bill and category fields → the end (saved 0) | ExUnit `controllers/ingredient_category_sort_order_test`, `field_definition_sort_order_test`, `recipe_ingredient_sort_order_test` (revert); Playwright `brewery/recipe_sort_order` (gap 8: Add Category empty, clearing on Edit; persist-verified) |
| — | Gap 11: a parent id of the wrong type (`"abc"`, `1.5`, `true`, `[]`, `{}`) → 422 "is invalid" on that field, never 500 and never ignored (shift `position_id`, time off/availability `user_id` were 500 or created for the caller) | ExUnit `wrong_type_ids_sweep_test`: every signed-in write route from the router × each shape, owner and `taproomDevice`; every schema `belongs_to` key × each shape; QA's cases with nothing saved (revert: old `ParamIds` → fails); `missing_parent_sweep_test` (every writable `belongs_to` changeset: an error, no raise) |
| — | Gap 6/7: `memberships` naming a department twice → 422 on `memberships` (create and update, nothing saved); `memberships: null` on create → 422 "must be a list" (left out = no roles) | ExUnit `controllers/user_memberships_malformed_test` (revert) |
| — | Gap 13: `POST /api/notifications/<missing or someone else's>/read` → 404 | ExUnit `controllers/notification_controller_test` (revert) |
| — | Gap 2: mid-session, a 401 whose `/api/me` recheck is offline/5xx/timeout → "Can’t reach the server, retrying…", rechecks every 10 s, `/api/me` 200 → banner gone and the view's queries reload (no navigation); still paired; a 401 still unpairs | Vitest `lib/api.test` (gap 2, revert); Playwright `devices/stray_401` (gap 2, tablet, route-mocked) |
| — | Gap 10: a brand, recipe, ingredient or batch URL that names nothing → "<thing> not found" + link back (was a spinner / blank) | Vitest `lib/notFound.test` (no 404 retry); Playwright `brewery/recipe_sort_order` (gap 10) |
| — | Gap 4: tablet, unknown channel URL → "Page not found"; a real channel it can't open → "Not available on a shared device" | Vitest `lib/channels.test`; Playwright `devices/unknown_url` (gap 4) |
| — | §2.7: `mix compile --warnings-as-errors` clean | The gate |
| — | §2.8: the two unread columns dropped; down brings them back; up again; rows and sign-ins kept | ExUnit `migrations/drop_unread_session_columns_test`; up/down/up on the dev DB by hand (stop 2 status) |

## D50 — The brewhouse device on the production schedule (`specs/d50_brewhouse_device_spec.md`; `planning/d50_brewhouse_device_plan.md`; `prompts/d50_lead_decisions_1.md`, `_2.md`)

ExUnit files are under `rockcut_api/test/`; Vitest under `rockcut-ui/src/`. Playwright specs: `regression/production/d50-*.spec.ts` (project `production`; the device spec at 1366×768 mouse, the touch spec at 1280×800 `hasTouch`), `tasks/task-board-linked` (project `brewery-board`), `devices/brewhouse_show_planned` (`chromium`). Staff codes belong to `[TEST-TEMP]` Brewery people (and one Taproom person), never the personas. "Revert" = confirmed failing with the fix reverted.

| # | Scenario | Coverage |
|---|---|---|
| P104 | breweryDevice: Brewery → Production; the Gantt reads; Check off asks for a staff code first (cancel changes nothing) | Playwright `d50-brewhouse-device` (P104); ExUnit `production_device_test` (P104), `device_route_matrix_test` (every read 2xx with no email) |
| P105 | A drag with brewer A's code: the move prompt, recorded as A on the device, "Acting as A" on the Gantt; the next write inside the window asks nothing | Playwright `d50-brewhouse-device` (mouse), `d50-brewhouse-touch` (long-press drag); ExUnit `production_device_test` (`recorded_as`, the Undo record's person and device) |
| P106 | Tanks, Templates (and the editor), Phases & steps read-only on the device ("Set up on a personal account"); the API refuses every setup change | Playwright `d50-brewhouse-device` (P106), `production/access` (P19/P106); ExUnit `device_route_matrix_test` (all 28 setup writes 403 "Not available on a shared device", with a code or without) |
| P107 | taproomDevice: a typed `/brewery/production…` is "Not available on a shared device", no Production in its nav; every production route 403 | Playwright `d50-brewhouse-device` (P107); ExUnit `device_route_matrix_test` (Taproom device × every production route, code or not), `authz_device_test` |
| D1 | Plan batch from a template with a code: P-number, linked tasks on the Brewery board, recorded as the person | Playwright `d50-brewhouse-device` (D1, through the dialog; needs `GET /api/brands` on the device, lead decisions 2.1); ExUnit `production_device_test` (D1) |
| D2 | Mark OK on a flag with a code: signed off by that person, "· on Brewhouse tablet" | Playwright `d50-brewhouse-device` (D2); ExUnit `production_device_test` (D2: `flag_signoffs.device_id`, the schedule's `device_name`) |
| D3 | A Taproom member's code: "That staff code isn't right", the dialog stays, nothing changes | Playwright `d50-brewhouse-device` (D3); ExUnit `production_device_test` (four kinds of write), `task_board_linked_test` (on a linked task) |
| D4 | Check off a linked brew day on the Brewery board with a code: the batch-number prompt; done on the Gantt by that person, on the device | Playwright `task-board-linked` (D4); ExUnit `task_board_linked_test` (D4) |
| D5 | B's code on A's Undo: "Only A can undo this."; the Undo stays and A's code undoes it; A on their own login can too | Playwright `d50-brewhouse-device` (D5); ExUnit `production_device_test` (D5), `undo_cips_test`, `production_schedule_controller_test` (`undo_not_yours` for people; expired first, lead decisions 1) |
| D6 | Multi-select three steps and drag: one block, the prompt, as the acting person — touch at 1280×800, mouse at 1366×768 | Playwright `d50-brewhouse-touch` (long-press, taps, touch drag), `d50-brewhouse-device` (Ctrl-click, mouse drag) |
| D7 | Batch changes with a code | Playwright `d50-brewhouse-device` (**Add step only**); ExUnit `production_device_test` (add step, transfer, split, Undo split) |
| D8 | Five wrong codes lock the device; the board is locked too (one counter) | ExUnit `production_device_test` (four on the Gantt + one on the board; a CIP check-off counts a wrong code once); Playwright `d50-brewhouse-device` (the lock message in the dialog, stubbed 429) |
| D9 | Owner: Shared devices → Show planned batches off for a Brewery device (no switch on a Taproom one); stays off; the tablet's `/api/me` follows; no person's setting changes | Playwright `devices/brewhouse_show_planned`; ExUnit `production_device_test` (decision 5: owner only, null 422) |
| L1 | Template editor: pick "Leads to: FDH" on PDH, Save → linked after a reload; Links above Notes; a refused Save links nothing | Playwright `d50-links` (L1, **revert**); Vitest `lib/links.test` (`pickedLinks`, `linkChoices`) |
| L2 | Step dialog: add "Comes after" with Save, Remove another; the move prompt follows the new links; Undo puts each back | Playwright `d50-links` (L2); ExUnit `production_device_test` (L2, the move preview's `following`) |
| L3 | A loop, a later-day "comes after", another batch, a duplicate: not offered; the API refuses them | Playwright `d50-links` (L3, pickers); ExUnit `production_device_test` (`link_cycle`, `link_order`, `link_other_batch`, `link_exists`, `link_pick`, 404); Vitest `lib/links.test` |
| L4 | L2 on the device with a code, recorded as the person | Playwright `d50-brewhouse-device` (L4); ExUnit `production_device_test` (L4) |
| — | A split's parts link within their tree, not to another batch | ExUnit `production_device_test`; Vitest `lib/links.test` (`splitTree`) |
| — | Linked tasks on the device: checkbox, drag, every menu action, Open in schedule; every write needs a code (422 without), as the person; a same-day reorder logs the device | Playwright `task-board-linked` (D50 describe); ExUnit `task_board_linked_test`, `task_board_multi_assignee_test`, `device_route_matrix_test` |
| — | Out-of-service periods and CIPs on the device with a code | ExUnit `production_device_test`; UI through the same `useActing` path (`OutageDialog`) |
| — | Authz: a Brewery-home device `:read`/`:write` `:production`, never `:setup`; any other device nothing | ExUnit `authz_device_test`, `authz_test` |
| — | "Done … by Jake · on Brewhouse tablet" in the step status | Vitest `lib/links.test` (`stepStatus`); ExUnit `production_device_test` (`done_on_device`) |
| — | A person's Gantt: no code dialog, no "Acting as" | Playwright `d50-brewhouse-device` ("a person") |
| — | Migration `add_production_device_ids`: up, down, up | By hand on the test DB (stop 1 status) |
| DEV QA gap 1 | A real person's code from another department: 422 `staff_code_not_allowed` "That staff code can't do this here", not counted toward the lock (a locked device still answers 429 first); production, the task boards and Buy-a-Beer; the dialog stays open with the field cleared | ExUnit `production_device_test` (D3, five not-allowed on the Gantt and board don't lock, five wrong do; revert), `task_board_device_test` (S45, the Taproom tablet; revert), `beer_board_controller_test` (S12, a Brewery person's code; revert), `task_board_linked_test` (revert); Vitest `lib/acting.test`, `hooks/useActing.test` (revert); Playwright `d50-fix1` (five tries, no lock), `d50-brewhouse-device` (D3), `task-board-tablets` (S45) |
| DEV QA gap 4 | Removing a tank's condition mark asks first (Cancel keeps it, Remove deletes it); on the device the staff code comes after the confirm | Playwright `d50-fix1` (person, revert; device), `d48-split-select` (P117 through the confirm) |

## D59 — Owners department (`specs/d59_owners_department_spec.md` §5; `planning/d59_owners_department_plan.md`; `prompts/d59_lead_decisions_1.md`, `_2.md`, `_3.md`)

ExUnit files are under `rockcut_api/test/`; Vitest under `rockcut-ui/src/`. Playwright specs: `regression/owners/owner.spec.ts`, `owners-asst.spec.ts`, `negatives.spec.ts` (project `owners`, one worker: O2 puts `office1` in Owners for a while, and the Owners boards are shared by the three files). Everything a spec makes is `[TEST-TEMP]`, deleted by id; O2 puts `office1` back to Office employee in `afterAll`; O10 turns the `message_posted` bell on for the four people it checks and restores their preferences after. `regression/tasks/task-board-departments` S104 now expects Owners in the owner's switcher.

| # | Scenario | Coverage |
|---|---|---|
| O1 | owner: Tasks → switcher → Owners; a task for owner2 and ownersAsst, both shown; no schedule header | Playwright `owner` (O1: the dialog offers owner, owner2 and ownersAsst; the POST's assignees; initials after a reload; no `day-header-*`, API headers all `null`); ExUnit `owners_privacy_test` (no header; another board keeps its own), `task_boards_test` (no shift query), `owners_pickers_test` (owners on the Owners board, assignable) |
| — | Decision 8: owners offered on the Owners boards only | Playwright `owner` (Taproom task dialog: bartender2 offered, owner2 not); ExUnit `owners_pickers_test` (task board and Idea Board `/people`: Owners lists every active owner, Brewery none); Vitest `lib/tasks.test` (`boardMembers`) |
| O2 | owner: Users & Roles → office1 → Owners as member (no Manager option); office1 then sees Owners in Tasks, Boards, Messages; removed again | Playwright `owner` (O2: options `— None —`/`Member`, the PUT body, office1's switchers, channel list and composer, removal through the dialog; restored in `afterAll`); ExUnit `owners_membership_test` (add and remove, audited); Vitest `lib/userRoles.test` |
| O3 | ownersAsst: Tasks → Owners; tick, move to tomorrow; no History or Edit Daily items | Playwright `owners-asst` (O3: check box, Change day…, after a reload and in the API; no manager items in the gear; History 403, Daily item create 403, owner's History 200); ExUnit `owners_privacy_test` (ownersAsst reads/writes; History, Daily items and All departments refused) |
| O4 | ownersAsst: Boards → Owners; adds a card; an owner-locked card is refused | Playwright `owners-asst` (O4: card added through the list, kept after a reload; "Only an owner can change it. Notes stay open."; PATCH 423 "Locked by an owner"; unlock and History 403); ExUnit `owners_pickers_test` (lock wording by the flag), `owners_privacy_test` (can't manage), `idea_board_route_matrix_test`; Vitest `lib/ideas.test` (`lockHolder`) |
| O5 | dualMgr: Owners in no list; typed `/tasks/owners` refused | Playwright `negatives` (O5: task and Idea Board switchers, sidebar channels, `/tasks/owners` → `/tasks/bar`, `/boards/owners` → another board, `/messages/dept:owners` "Channel not found"; board, Idea Board and channel API 403, `/api/channels` and `/api/me` without Owners); ExUnit `owners_privacy_test` (every list, read and write) |
| O6 | dualMgr: edits ownersAsst's Office details; Owners chip read-only; can't remove it. **D58 lead decisions 1:** no chip, and only the Office role (nobody manages Owners) | Playwright `negatives` (O6 on ownersAsst: no Owners select or text, Name disabled; O6 on a `[TEST-TEMP]` Office + Owners person: Office → Manager saves, Owners stays); ExUnit `owners_membership_test` (O6 both ways); Vitest `lib/userRoles.test` (`membershipsPayload`) |
| O7 | dualMgr: API memberships adding self to Owners → 403, nothing changed | Playwright `negatives` (O7, alone and with an Office change in the same request); ExUnit `owners_membership_test` (self, a request that also changes a managed department applies nothing, user create in Owners) |
| O8 | owner: API memberships with Owners as manager → 422 "Owners has no managers" | Playwright `owner` (O8, on a `[TEST-TEMP]` person; unchanged after); ExUnit `owners_membership_test` (update and create, the department's name in the message, `Membership.changeset`) |
| O9 | owner: Owners absent from the Scheduler, View Schedule, shift/event/positions dialogs, Calendar sync; API → 422 | Playwright `owner` (O9 UI: both Department filters, the grid, Add shift → Position, Add event → Department, Manage positions, Calendar sync; O9 API: position and event 422, no Owners feed, rotate 404); ExUnit `owners_not_scheduled_test` (positions, shifts, events, series, this/following), `calendar_feed_controller_test` (feed 404) |
| — | Copy previous week, templates, series extend/split into Owners | ExUnit `owners_not_scheduled_test` (they POST shifts/events through the same changesets; templates need a position, and none can be in Owners: lead decisions 1, item 4) |
| O10 | ownersAsst posts in Owners; owner/owner2 told (in-app/push per prefs); office1 not | Playwright `owners-asst` (O10: post through the composer; owner and owner2 get one `message_posted` record each, office1 and dualMgr none, office1's read 403), `negatives` (office1: no Owners channel, typed URL "Channel not found"); ExUnit `owners_privacy_test` (owners told, non-members not; another department's post doesn't tell a non-member owner), `messaging_test`. **Push itself: manual-only** (same dispatcher as every channel) |
| O11 | owner: Shared devices home picker leaves out Owners; API → 422 | Playwright `owner` (O11: picker, create 422, update 422 on `home_department_id`); ExUnit `device_controller_test` |
| O12 | taproomDevice: typed `/tasks/owners`, `/boards/owners` | Playwright `negatives` (O12: both land on the Taproom boards, `/messages/dept:owners` "Not available on a shared device", API 403 like the Brewery board); ExUnit `owners_privacy_test` (device), `device_route_matrix_test` |
| O13 | owner: All departments shows Owners' tasks with the others | Playwright `owner` (O13: an Owners task in the Owners section, Owners the last section); ExUnit `owners_privacy_test` |
| — | §4.4 Owners last: task boards, Idea Boards (before Company), Messages, Users & Roles | Playwright `owner` (O1 switcher, the §4.4 test: Idea Board switcher, sidebar channels, ownersAsst's roles column), `regression/tasks/task-board-departments` S104; ExUnit `accounts_test` (`sort_departments/2`, `list_departments/0`), `messaging_test`, `task_boards_controller_test`, `owners_privacy_test`; Vitest `lib/userRoles.test` (`sortMemberships`) |
| — | No Owners heading in the left nav | Manual-only (Stage 3 browser check; `DEPT_META` has no `owners`, commented in `App.tsx`) |
| — | Migration: up, down (refuses once Owners is used), up | ExUnit `migrations/add_owners_department_test` |
| — | Synthetic setup: ownersAsst, `[SEED]` Owners task and card, idempotent | ExUnit `seeds/synthetic_test` |
| — | Decision 9 (DEV gap 5): non-members (people and devices) get no Owners in `/api/departments` or in anyone's `/api/roster` departments; ownersAsst and owner do; a manager's Users & Roles has no Owners membership (D58 lead decisions 1 removed the chip) | ExUnit `owners_privacy_test` ("who knows Owners exists": office1, dualMgr, taproomDevice, ownersAsst, owner; dualMgr's `/api/users` has no Owners membership); Playwright `negatives` (O5, O10/O5, O12: both lists; O6) |
| — | DEV gap 6: refusals don't name Owners ("That department isn't on the schedule"; 403 "You can't assign roles in that department") | ExUnit `owners_not_scheduled_test`, `owners_membership_test`, `owners_privacy_test` (breweryMgr position); Playwright `owner` (O9 API), `negatives` (O7 body) |
| — | DEV gap 2: no Hide shifts on the Owners board; Brewery keeps it | Playwright `owner` (Gap 2); ExUnit `task_boards_controller_test` (`/api/me` task_boards carry `scheduling`) |
| — | DEV gap 3: Users & Roles grid reads "Owners: member" | Playwright `owner` (§4.4 roles column); Vitest `lib/userRoles.test` (`membershipLabel`) |
| — | DEV gap 7: assignee refusal "must be an Owners member or an owner"; "an Office member", "a Brewery member" | ExUnit `owners_pickers_test` (task board and Idea Board card) |

## D58 — Board settings on the server, managers and everyone, backlog sweep (`specs/d58_board_settings_and_managers_spec.md` §5; `planning/d58_board_settings_and_managers_plan.md`)

ExUnit files are under `rockcut_api/test/`; Vitest under `rockcut-ui/src/`. Playwright specs: `regression/d58/settings.spec.ts` (S1–S6), `managers.spec.ts` (S7–S14), `sweep.spec.ts` (S15–S17, S19–S21), `follow-ups.spec.ts` (S22, S24–S27), in project `d58` (one worker, after `brewery-board`: both change the same personas' board settings and the Brewery board). S18 is in `regression/taproom/staff-codes.spec.ts`, S23 in `regression/taproom/beer-board-staff.spec.ts` (S17), S28 in `regression/ideas/list-drag.spec.ts` (project `idea-boards`).

Board settings are per account on the server now, so they would leak between specs and runs. The `setup` project starts each run with none: the token mint (`Synthetic.mint_tokens/0`, local and DEV) clears every synthetic account's `board_settings`, as `Synthetic.setup/0` does; `auth.setup.ts` puts back any left on pre-minted tokens (`E2E_TOKENS_JSON`) through the API. `regression/boardSettings.ts` resets a persona's boards to the defaults before and after each test in every spec that changes them (the board specs in `brewery-board` and `d58`); the API has no "forget", so a spec about the carry-over (S2, D42 S135, D41 S113) uses a `[TEST-TEMP]` person whose board has nothing saved yet. The old specs that set the D41/D42/D45 local keys to get a view (`task-board-phone`, `task-board-multi-assignee` at phone width, `task-board-departments` S119) now save it on the server; S135, S113 and D45 S188 check the server's settings.

Everything the specs make is `[TEST-TEMP]` and removed by id (people deactivated by id; `setup` deletes them later). S7's add, S8's refusal, S9–S11 and S24 are on `[TEST-TEMP]` people; the seeded personas (bartender1, floater, ownersAsst, noDept, inactive) are only looked at.

| # | Scenario | Coverage |
|---|---|---|
| S1 | brewer1: 1 week, Hide completed, Monday, My tasks; the board in another browser | Playwright `settings` (each change's PUT, the server's map, a second context shows the four and Mon–Sun; lead decisions 1, DEV QA gap 2: at 390 px with touch, the gear's tooltip is gone after the menu closes, the same `SettingsGear` on every page; hover still shows it, `production/d48-fix-cycle-1`); ExUnit `board_settings_test` (S1, merge, `/api/me`); Vitest `lib/tasks.test` (defaults, `boardSettings`) |
| S2 | brewer1: a browser with D45 local settings, first load | Playwright `settings` (on a `[TEST-TEMP]` Brewery person: one PUT with the three values, per-board keys cleared, `rockcut.tasks.board` kept; a stale local value later isn't sent), `task-board-follow-ups` S135 (D41 shared keys), `task-board-departments` S113 (pre-D41 keys); Vitest `lib/tasks.test` (carry-over: local + no server → one save then cleared; lead decisions 1, DEV QA gap 1: an empty, partial or full server entry → only the missing keys saved, never the server's, then cleared; a failed save → keys kept); Playwright `settings` (a partial server entry: one PUT with the missing key only) |
| S3 | taproomDevice: View and Hide shifts kept; bartender1's unchanged | Playwright `settings` (S3, no staff code asked, after a reload and on the server), `brewery/task-board-hide-shifts` S188; ExUnit `board_settings_test` (S3) |
| S4 | taproomDevice: API, the Brewery board → 403 | Playwright `settings` (Brewery and All 403, breweryDevice on the Taproom's 403, unknown board 404, bad value 422, lead decisions 1 / DEV QA gap 3: `view: "mine"` 422, home board 200); ExUnit `board_settings_test` (S4, All and Owners, a staff code in the body, the brewhouse device, My tasks 422 for a device) |
| S5 | owner: All departments Unassigned + 1 week; Brewery's own unchanged | Playwright `settings` (S5; My tasks on All → 422); ExUnit `board_settings_test` (S5, "My tasks isn't a view on All departments") |
| S6 | breweryMgr: a 40-day URL → 31 days, the notice, URL corrected | Playwright `settings` (Brewery: the 31 days from `from`, `to` replaced, history not pushed, the notice goes on Next; lead decisions 1, DEV QA gaps 4, 5: To before From, garbage, Feb 30 and Nov 31 → the default two weeks, "That date range wasn't valid…" and no range in the URL; owner on All departments); Vitest `lib/tasks.test` (`boardRange`: clamp, invalid ranges incl. calendar-invalid dates, `fix`; `isDateKey`) |
| — | "Not saved" toast when a setting's save fails | Playwright `settings` (the PUT answered 500: the toast, 1 week kept on the page, the server unchanged) |
| S7 | breweryMgr: everyone listed; bartender1 read-only with Add department (Brewery); adds it | Playwright `managers` (the list without devices, bartender1's flags, read-only note, disabled Name, no Reset password or staff code, "View only" chip, Add department offers Brewery only; the add on a `[TEST-TEMP]` Taproom employee keeps Taproom); ExUnit `managers_everyone_test` (S7 on bartender1 itself, an empty PUT removes nothing, addable only managed departments) |
| S8 | breweryMgr → floater (Taproom + Brewery): Deactivate | Playwright `managers` (floater's dialog read-only but for the Brewery role, switch greyed with the tooltip; on a `[TEST-TEMP]` stand-in: deactivate, rename and reset 403, the Brewery role changes in the dialog); ExUnit `managers_everyone_test` (S8 on floater) |
| S9 | dualMgr → `[TEST-TEMP]` Taproom + Office: deactivate, reactivate | Playwright `managers` (through the dialog, both ways); ExUnit `managers_everyone_test` (S9; barMgr refused on the same person) |
| S10 | barMgr → noDept: deactivate, reactivate | Playwright `managers` (on a `[TEST-TEMP]` person with no department; noDept's own flags read); ExUnit `managers_everyone_test` (S10 on noDept, owners with no department, employees, last-owner guard) |
| S11 | dualMgr → Office + Owners: only the Office role; no Owners; details and Deactivate refused (lead decisions 1) | Playwright `managers` (on a `[TEST-TEMP]` Office + Owners person: no Owners in the dialog, Name disabled, no Reset password, Office → Manager saves, Owners kept, rename 403, PATCH active 403), owner's own pass on the same shape, `owners/negatives` O6; ExUnit `managers_everyone_test` (S11 on ownersAsst), `owners_privacy_test` |
| S12 | breweryMgr → ownersAsst: Office only, no Owners anywhere | Playwright `managers` (the `/api/users` row, the dialog, and every API response on the page: no `owners` key, `owners_only: true` or "Owners"); ExUnit `managers_everyone_test` (S12, after Add department), `owners_privacy_test`, `accounts` `user_access/2` |
| S13 | breweryMgr API on bartender1: name / reset password / staff code → 403 | Playwright `managers` (bartender1's staff code read 403; name, schedulable, reset password, staff code set/remove/read and a role on a `[TEST-TEMP]` Taproom employee, all 403, nothing changed); ExUnit `managers_everyone_test` (S13 on bartender1 itself, barMgr still can) |
| — | Lead decisions 1 (DEV QA gaps 12, 13): Add department on an owner or an Owners member doesn't open their account | Playwright `managers` (on a `[TEST-TEMP]` owner and a `[TEST-TEMP]` Office + Owners person: Add department, the reply has no Owners, the dialog stays read-only with no Reset password or staff code, reset / rename / staff code 403); ExUnit `managers_everyone_test` (both paths, and a fully managed person still works), `authz_parity/people_test` (#35 flips), `authz_test` |
| — | Lead decisions 1 (DEV QA gaps 7, 6): no Owners membership for managers on any row; neutral Active tooltip | Playwright `managers` (gaps 12, 13 reply; S12; the tooltip "You can't change Active for this person."), `owners/negatives` O6; ExUnit `owners_privacy_test` (gap 7: Add department reply and row), `managers_everyone_test` (`user_access/2`) |
| S14 | breweryMgr: Office positions 403; Brewery's work | Playwright `managers` (create/rename/move/delete an Office `[TEST-TEMP]` position 403; a Brewery one created, renamed, moved-to-Office 403, deleted; Manage positions shows Office "view only" with no buttons, the Department pick-list Brewery only); ExUnit `managers_everyone_test` (S14, shift and schedule templates), `authz_parity/schedule_setup_test` (D58 flips); Vitest `lib/positions.test` |
| S15 | brewer1: move one ("Just this one"), then change the rule | Playwright `sweep` (the confirm's note, keep: no card on the old day, the moved one on its new day, the new pattern's other days); ExUnit `tasks/qa_followups_test` (5202, from the first date and later in the series, top-up); Vitest `lib/repeat.test` (`ruleChangeNote`) |
| S16 | breweryMgr: split a weekly event; "following" from before the split | Playwright `sweep` (the split, no internal end shown, the Scheduler's "this and all following" rename reaches the Thursdays, delete following takes them); ExUnit `schedule_event_series_split_test` (G1 edit and delete, R1 both, the chain: Extend, delete the later part, count; lead decisions 1, DEV QA gap 8: an earlier part's dialog shows the chain's current rule) |
| S17 | barMgr: a shift for inactive → 422 "is not active" | Playwright `sweep` (create and reassign); ExUnit `scheduling_test` (create, edit, drag; existing shifts untouched), `shift_controller_test` |
| — | Lead decisions 1 (DEV QA gap 9): deactivating opens the person's future shifts | Playwright `sweep` (barMgr on a `[TEST-TEMP]` person: "2 future shifts will become open shifts. Deactivate?", Cancel sends nothing; Deactivate: the draft stays a draft, the published one is open, a past one keeps them); ExUnit `accounts/deactivate_shifts_test` (manager and owner, the open-shift notification, one change-log entry with the count, none when there are none, reactivating gives nothing back, a refused deactivate changes nothing, `future_shifts` count 403/404); Vitest `lib/activity.test` |
| S18 | Staff code Remove, then Cancel; Remove, then Save | Playwright `regression/taproom/staff-codes` (as barMgr, the Taproom manager; owner takes the same dialog path); Vitest `lib/staffCode.test` |
| S19 | bartender1, taproomDevice: `/boards/bar/cards/99999999` | Playwright `sweep` (bartender1, brewer1 and taproomDevice; a missing and a bad id; the notice, the URL, no card dialog); Vitest `lib/ideas.test` |
| S20 | brewer1: `/api/me` delayed at start-up | Playwright `sweep` (loading at once, "Still connecting…" at 4 s, not before, Retry loads); Vitest `lib/startup.test` (fake timers) |
| S21 | taproomDevice header at 320 / 360 / 384 px | Playwright `sweep` (one line, icon Sign out with its label, the pill before it, the logo's gap, no horizontal scroll, the board title on one line; unchanged at 412 px) |
| S22 | barMgr: import with a blank, a long and a repeated extra header | Playwright `follow-ups` (preview only: "(blank)", listed once, wraps inside the dialog); ExUnit `beer_board_csv_test` |
| S23 | bartender1: Redeem an entry another session just removed | Playwright `regression/taproom/beer-board-staff` S17 (the dialog closes, the board says why and refreshes) |
| S24 | owner → `[TEST-TEMP]` Taproom person: Taproom → "— None —" | Playwright `follow-ups` (the select shows it, "The staff code is cleared when you press Save.", Cancel leaves the role and code) |
| S25 | owner: the change log after set / reveal / remove | Playwright `follow-ups` (one row each, no raw `staff_code.*`); Vitest `lib/activity.test` |
| S26 | barMgr: History "Sam Pour", then "Shared Device"; Export CSV | Playwright `follow-ups` (a `[TEST-TEMP]` entry by bartender1 found by name, every row names Sam; Shared Device rows all from tablets; each export sends the same `q` and matches); ExUnit `beer_board_admin_controller_test`; Vitest `lib/beerBoard.test` |
| S27 | brewer1: Enable push in a private window | Playwright `follow-ups` (a refusing `pushManager.subscribe` stood in, since the dev server has no service worker: the message, the button still enabled, no page error, nothing posted); Vitest `lib/push.test`. **A real private window: manual-only** (Stage 3b browser check) |
| — | Lead decisions 1 (DEV QA gap 10): `PUT /api/notification_preferences` checks the shape | ExUnit `notification_controller_test` (null, non-map, null or non-boolean value, unknown channel or event → 422 and nothing stored; every listed event and channel, and `{}`, saved); the dialog sends only the events and channels it lists (old stored ones, e.g. `shift_published`, are dropped on the next save); Playwright `task-board-dashboard` S35 and `owners/owners-asst` re-run green |
| S28 | bartender1: drag a Taproom list right; reload | Playwright `regression/ideas/list-drag` (order kept, History, a locked list), project `idea-boards`; the task-board and Idea Board drag specs re-run green |
| — | Synthetic setup and the token mint clear board settings | ExUnit `seeds/synthetic_test` |
