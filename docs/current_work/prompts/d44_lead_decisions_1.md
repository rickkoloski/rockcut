# D44 lead decisions 1 — local QA fix cycle 1

2026-11-16 · lead. From the local QA pass (`~/src/rockcut-d44-qa/results/d44_qa_report.md`, trial
gate step 2): 2 must-fix, 2 minor. Plus the gate's order-dependent theme spec.

1. **Review state rule (gaps 1, 3, must-fix).** `TimeOff.review/4` checks the request's status, not
   only who reviews:
   - `approved` only from `pending`;
   - `denied` from `pending` (Deny) or `approved` (Remove);
   - anything else (approve an approved/denied/cancelled request, deny a denied/cancelled one) →
     409 `"This request has already been <status>."`.
   - **Stale views:** the review body carries `expected_status`, the status the reviewer saw. If it
     doesn't match the stored status → 409 `"This request has changed since you opened it."`, nothing
     stored, no notification. Optional in the API (absent = no check, so old clients still work),
     always sent by the UI.
   - Checks run after the permission check (403 first) and the past check (422), as now.
   - The UI shows the 409 message in the dialog and refetches the request and the time off
     queries, so the dialog shows the current state and buttons.
2. **Midnight end (gap 2, minor).** `ends_at` is exclusive at a day boundary: time off ending at
   00:00 Colorado doesn't appear on that day, in the agenda helper or the Scheduler's off markers
   (`buildOffMarkers`/`buildOffWindows` in `lib/`, existing code: fix it there). All-day requests
   are unaffected (they end 23:59).
3. **Phone note box (gap 4, minor):** the label must not overlap typed text at 390 px.
4. **Seed (QA note c, minor):** `[SEED] Long weekend` is stored at UTC midnight and shows on two
   days. Store seeded time off at Colorado times like the app does.
5. **Theme spec G1 (gate, minor):** `tests/regression/ui/theme.spec.ts` G1 assumes the owner already
   has notifications; make it create its own (e.g. a `[TEST-TEMP]` time off request by a bar
   employee via the API, cancelled by id afterwards) so it doesn't depend on run order.
6. Not changing: 422-before-403 for malformed review bodies (QA note b); `newhire` 403 on
   notifications (the required-reset gate, by design).
