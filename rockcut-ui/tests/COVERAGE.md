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
S52–S69 are D39. ExUnit files are under `rockcut_api/test/` (`brewery_tasks_test` = the context,
`placement_test` = `brewery_tasks/placement_test`, controller = `brewery_task_controller_test`);
Playwright under `tests/regression/brewery/`, all `task-board-*` in the one-worker `brewery-board`
project (see `RUNNING.md`).

| # | Scenario | Layer |
|---|---|---|
| S1 | Two rows of 7 days; brewer1's header "name · position · times · hours" | Playwright `task-board-header` (S1 ×3: shift line, two shifts with total hours, an open shift); ExUnit `brewery_task_board_test` (published Brewery only, roster order, Colorado day) |
| S2 | No published Brewery shifts → "No brewers scheduled"; Daily card stays | Playwright `task-board-header` (S2); ExUnit `brewery_task_board_test` |
| S3 | A draft shift stays off the header, for the manager too, until published | Playwright `task-board-header` (S3, breweryMgr); ExUnit `brewery_task_board_test` (published only) |
| S4 | A published all-day Brewery event shows; a Taproom event doesn't | Playwright `task-board-header` (S4); ExUnit `brewery_task_board_test` (events) |
| S5 | Approved time off isn't shown | Playwright `task-board-header` (S5) |
| S6 | + Add a task on today: bottom, unassigned, persists | Playwright `task-board-tasks` (S6); ExUnit `brewery_tasks_test` (create) |
| S7 | Assign to brewer1: initials, no notification, My tasks filter | Playwright `task-board-tasks` (S7: brewer1's `/api/notifications` checked); ExUnit `brewery_tasks_test` (assigned event, eligible assignee), `authz_test` (who can be assigned) |
| S8 | Check on today: no dialog, struck through with ✓ name; uncheck clears | Playwright `task-board-tasks` (S8); ExUnit `brewery_tasks_test` (own day, uncomplete) |
| S8a | Unfinished → On today: leaves the card, on today after its own tasks, "planned …" | Playwright `task-board-finish-elsewhere` (S8a); ExUnit `brewery_tasks_test` (each display), `placement_test` (finished-elsewhere order) |
| S8b | On both days: in place "done …" and on today "planned …"; neither drags | Playwright `task-board-finish-elsewhere` (S8b), `task-board-drag` (finished elsewhere can't be dragged); ExUnit `placement_test` (both, both locked) |
| S8c | On its planned day: done only there | Playwright `task-board-finish-elsewhere` (S8c); ExUnit `brewery_tasks_test` |
| S8d | Uncheck the "both" copy on today → confirm → open on its day, amber, on Unfinished | Playwright `task-board-finish-elsewhere` (S8d); ExUnit `brewery_tasks_test` (uncomplete clears all four fields) |
| S8e | Cancel: still open, nothing logged | Playwright `task-board-finish-elsewhere` (S8e) |
| S8f | `complete` with no `display` off its own day → 422 `display_required` | Playwright `task-board-finish-elsewhere` (S8f, API); ExUnit `brewery_tasks_test` (S8f), controller (needs a display) |
| S8g | A future-day task finished early asks too; On today moves it | Playwright `task-board-finish-elsewhere` (S8g); ExUnit `brewery_tasks_test` (past and future day) |
| S9 | Delete after a confirm; gone after a reload | Playwright `task-board-tasks` (S9); ExUnit `brewery_tasks_test` (delete keeps history) |
| S9a | Menu: Add notes → Notes focused → notes icon, "Edit notes"; bottom sheet at phone width | Playwright `task-board-tasks` (S9a, menu), `task-board-phone` (S9a ×2: sheet, locked moves greyed; back closes the sheet, ×2) |
| S9b | Change day… 6 weeks out: out of the range, bottom of that day | Playwright `task-board-tasks` (S9b); ExUnit `brewery_tasks_test` (day change → bottom) |
| S9c | Mark completed on yesterday's task → the same dialog | Playwright `task-board-finish-elsewhere` (S9c) |
| S9d | A finished-elsewhere card: Change day / Move up / Move down greyed, "Mark not done first to move it" | Playwright `task-board-tasks` (S9d), `task-board-phone` (S9a locked); ExUnit `brewery_tasks_test` (locked can't move or change day) |
| S9e | Long-press on the Pixel starts a drag, not the menu; a short tap opens the menu | **Manual** (DEV, Pixel, brewer1; plan LIMITATIONS checklist 1). Playwright `task-board-phone` (S15) drives the long press with emulated touch only |
| S9f | Hide completed on every day, remembered after a reload | Playwright `task-board-tasks` (S9f) |
| S10 | History: added, assigned, completed, uncompleted, moved, deleted, with who and when | Playwright `task-board-history` (S10 ×2, plus Load more and one task's history); ExUnit `brewery_tasks_test` (list_events), controller (history) |
| S11 | brewer1: no History; API 403 | Playwright `task-board-history` (S11); ExUnit controller (permissions), `authz_test` |
| S12 | Drag the 3rd task to the top; persists, for brewer2 too | Playwright `task-board-drag` (S12, mouse); ExUnit `brewery_tasks_test` (S12) |
| S13 | Drag from today to day 9 between two tasks; both counts update | Playwright `task-board-drag` (S13); ExUnit `brewery_tasks_test` (S13) |
| S14 | Keyboard move across days; Escape puts it back | Playwright `task-board-drag` (S14 ×2); a refused move snaps back with a toast (forced 500); Vitest `components/dnd/moveModel.test.ts` |
| S15 | Phone width: one day at a time; long-press reorders; a swipe changes day | Playwright `task-board-phone` (layout, strip and counts, arrows, swipe vs vertical, S15 long-press reorder with emulated touch, and to the very bottom of a day ending in a finished-elsewhere card). Touch on real hardware: **Manual** (DEV, Pixel; plan LIMITATIONS checklist 1–7) |
| S16 | Two people move one task at once: both succeed, last wins, boards agree | Playwright `task-board-tasks` (S16, two contexts; a reload stands in for the 60-second refresh); ExUnit `brewery_tasks_test` (concurrent moves, lists dense). The refresh with real latency: DEV |
| S17 | Empty or 201-character title: inline error, nothing saved | Playwright `task-board-tasks` (S17); ExUnit `brewery_tasks_test` (title length) |
| S18 | Unfinished card first: open past tasks with dates, not done tasks or Daily | Playwright `task-board-range` (S18); ExUnit `placement_test` (overdue list), `brewery_task_board_test` (Unfinished ignores the range) |
| S19 | Drag from the Unfinished card onto day 2 | Playwright `task-board-range` (S19) |
| S20 | Move all to today: confirm; own tasks first, then oldest-first; 3 moves logged | Playwright `task-board-range` (S20, S21); ExUnit `brewery_tasks_test` (S20 order and events), controller (count) |
| S21 | No open past tasks → no Unfinished card | Playwright `task-board-range` (S20, S21), `task-board-future` (S23h) |
| S22 | All-past range: amber edge, Unfinished still lists them, Previous/Next by its length, Today resets | Playwright `task-board-range` (S22) |
| S23 | Over 31 days: "Up to 31 days", not applied | Playwright `task-board-range` (S23); ExUnit controller (422 `range_too_long`) |
| S23a | 1 week is this browser's default (reload, Today); another browser opens on 2 weeks | Playwright `task-board-range` (S23a) |
| S23b | Custom range highlights neither side; Today uses the default; 2 weeks starts from From | Playwright `task-board-range` (S23b) |
| S23c | + Add a task on Future: bottom, no date, survives a reload and a range change | Playwright `task-board-future` (S23c); ExUnit `brewery_tasks_test` (create on Future) |
| S23d | Drag a Future task onto a day between two tasks | Playwright `task-board-future` (S23d); ExUnit `brewery_tasks_test` (S23d) |
| S23e | Drag a day's task onto Future between two; History "→ Future" | Playwright `task-board-future` (S23e); ExUnit `brewery_tasks_test` (S23e) |
| S23f | Change day… from Future 5 weeks out; Move to Future | Playwright `task-board-future` (S23f), `task-board-phone` (sheet); ExUnit `brewery_tasks_test` (No day → bottom of Future) |
| S23g | Check a Future task: no dialog, done on today "from Future"; Mark not done → bottom of Future | Playwright `task-board-future` (S23g); ExUnit `brewery_tasks_test` (S23g), `placement_test` |
| S23h | Open Future tasks only: no Unfinished card, no Move all | Playwright `task-board-future` (S23h). The reminder half is D40 (S32) |
| S23i | Empty Future list still shows its message | Playwright `task-board-future` (S23i) |
| S23j | Phone: the strip's Future stop shows the list and its + Add a task | Playwright `task-board-phone` (S23j) |
| S24 | Tick Temps, Pressures: 2/4 with who and when; brewer2 sees it; untick → 1/4 | Playwright `task-board-daily` (S24 ×2, incl. a refused tick snapping back); ExUnit `brewery_daily_test` (tick/untick, events) |
| S25 | Tomorrow's checks disabled; API 422 | Playwright `task-board-daily` (S25); ExUnit `brewery_daily_test` (S25), controller |
| S26 | Yesterday 3/4 amber; the 4th can be ticked | Playwright `task-board-daily` (S26); ExUnit `brewery_daily_test` (S26) |
| S27 | A Daily card doesn't drag | Playwright `task-board-daily` (S27) |
| S28 | Add DO, drag it first, rename Temps; past days keep their counts out of 4 | Playwright `task-board-daily-items` (S28 ×2: drag, Move up/down); ExUnit `brewery_daily_test` (S28, which items a day counts) |
| S29 | Retire Backups: today 3 items, yesterday still ✓ Backups | Playwright `task-board-daily-items` (S29); ExUnit `brewery_daily_test` (S29) |
| S30 | brewer1: no Edit Daily items; `POST /api/brewery/daily_items` 403 | Playwright `task-board-daily-items` (S30); ExUnit controller (permissions) |
| S31 | 13th item "Up to 12 items"; duplicate "Already on the list" | Playwright `task-board-daily-items` (S31); ExUnit `brewery_daily_test` (cap, duplicate), controller |
| S38 | floater: same access as brewer1 | Playwright `task-board-access` (S38); ExUnit `authz_test` |
| S39 | bartender1 / office1: no nav, URL goes Home, every D38 route 403 | Playwright `task-board-access` (S39, both personas); ExUnit controller (Taproom-only 403 on every route), `authz_test` |
| S40 | owner (no memberships): Tasks, History, Edit Daily items | Playwright `task-board-access` (S40); ExUnit controller, `authz_test` |
| S41 | taproomDevice: `GET /api/brewery/tasks` 403 | Playwright `task-board-access` (S41); ExUnit controller (a device gets 403 on every route), `device_route_matrix_test` (people-only), `authz_test` |
| S49 | Leaving the Brewery: open tasks unassigned; done task and Daily check keep the name (the code is D40) | ExUnit `accounts_test` (S49 ×3: memberships, deactivation, staying), `brewery_tasks_test` (S49). No Playwright: the Users & Roles save is D37's `auth/manager_removes_member` (breweryMgr), which doesn't look at tasks |
| S51 | 11:30 pm Colorado is still that day | ExUnit `brewery_tasks_test` (S51: MST, MDT, midnight, completion day). "Today" on DEV's UTC machine after 6 pm Colorado: DEV (LIMITATIONS) |
| — | Synthetic seed: `[SEED]` tasks, Daily checks, a Brewery event relative to today; idempotent; `[TEST-TEMP]` cleanup; reset restores the four items | ExUnit `seeds/synthetic_test` (D38) |
| — | Migrations: four default Daily items for the Brewery department; reversible | ExUnit `brewery_tasks_test` (new department gets the items); **Manual** rollback on a scratch copy of the dev DB (2026-10-11, in the handoff note) |
| — | `@dnd-kit` in the release build / PWA bundle | **Manual** on DEV (`pnpm audit --prod`, `check-bundle-versions.mjs`) |

### D38 DEV pass 1 (gaps from the DEV QA report)

| Gap | Layer |
|---|---|
| G1 a stale Edit dialog sends only the changed fields (a notes save keeps someone else's rename; nothing changed → no request); same for an unchanged Daily item rename after the list refetched | Playwright `task-board-tasks` (G1: brewer1 + brewer2 contexts, request body + persist-verify), `task-board-daily-items` (G1: owner renames via the API, a reorder refetches the list) |
| G2 the Daily tick label (spec S24 reworded) | as S24 |
| G3 `PATCH /api/brewery/daily_items/:id {active: true}` on a retired item → 422 `retired`, still retired | ExUnit controller (G3) |
| G4 a past day (and today) shows only items that existed that day plus any ticked that day; ticking a day before an item was added → 422 `not_yet_added`; an item added today shows and ticks today | ExUnit `brewery_daily_test` (G4 ×4: rows and counts, the tick refused, added today, a check from before the fix), controller (G4: 422 + the board row); Playwright `task-board-daily-items` (G4: rows, count, 422, persist-verify, the toast on a stale board) |
| S29 | Playwright `task-board-daily-items` (S29) now ticks the `[TEST-TEMP]` item **today** (a just-added item can't be ticked yesterday); a tick on an earlier day stays in ExUnit `brewery_daily_test` (S29) |

### D38 DEV pass 2 (Matt's Pixel checks)

| Gap | Layer |
|---|---|
| A a long-press drag to the very bottom of a day lands there: below the day's own tasks, above any card finished there from another day (those always sort last), and the placeholder shows that spot | Playwright `task-board-phone` (S15 very bottom: today with 4 `[TEST-TEMP]` tasks and a finished-from-yesterday card, the page auto-scrolled to its end, placeholder position, `move` body `before_id: null`, persist-verify) |
| B Android back with the task sheet open closes the sheet only; the URL stays `/brewery/tasks` and the next back leaves the board; a sheet closed by tapping outside leaves no extra back | Playwright `task-board-phone` (Back closes the sheet; tapping outside). The real back gesture on the Pixel: **Manual** (DEV) |
