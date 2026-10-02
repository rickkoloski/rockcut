# D32: Schedule Events + Taproom Rename — Completion Record

**Status:** COMPLETE. On prod since 2026-10-02 in release `v2026.10.02`
(`5fd6b93`, PR #8; API v21, UI v17).
**Spec:** `specs/d32_schedule_events_spec.md` (approved 2026-09-29, including the
recurring-events amendment R1–R5) · **Plan:** `planning/d32_schedule_events_plan.md`
**Concept:** 07_scheduling
**Branch:** `d32-schedule-events` (off `d31-rbac-consolidation`), PR #4, merged
2026-09-30. DEV gate SHA **`d4b3ef1`**.
**Backlog:** PortableMind project 254, task 3937 (folds in 3940). Closed at release.

---

## Summary

Managers can put **events** on the schedule: one-off or recurring items with
no assignee or position, which can't be claimed and never notify anyone. They
are drafts until Publish week, and then everyone sees them in the Scheduler
grid and View Schedule. The Bar department is now shown as **Taproom**.

---

## What shipped

- **Schedule events** (`schedule_events`): permissions in `Authz` mirror shifts.
  Published events are readable by everyone; drafts and all writes belong to
  the department's managers and owners. An unreadable event answers 404; a
  readable but unchangeable one answers 403.
- **Recurring events** (`schedule_event_series`):
  - weekly (chosen days, every 1 or 2 weeks) or monthly by weekday (1st–4th or last);
  - capped 12 months ahead, with Extend;
  - occurrences are drafts, published by Publish week;
  - "this event only" / "this and all following" edits and deletes; a rule
    change splits the series;
  - Colorado wall-clock time across DST (new dependency `tz ~> 0.28`).
- **UI:** an Events row in the Scheduler grid, the event dialog, an Add event
  button, Publish week includes events, View Schedule lists events first each
  day, and events hide under the My shifts, Open only and position filters.
- **Bar → Taproom:** display name only; the key stays `bar`. The nav label
  comes from `/api/departments`. The migration skips a name an owner changed.
- **3940:** Add shift and Add event default to the week on screen.
- **Sunday-evening shifts (spec A3):** week queries use Colorado midnights, so a
  Sunday shift after 6 pm MDT / 5 pm MST no longer drops out of the grid.
- **SQLite contention (DEV G1):** one DB connection by default (`POOL_SIZE`
  overrides), sequential preloads, `BEGIN IMMEDIATE` for series writes,
  busy_timeout 10 s.

50 files changed, +5176 / −53 (`git diff --stat 2e28039 d4b3ef1`).
**Migrations (3, reversible):** `create_schedule_events`,
`create_schedule_event_series`, `rename_bar_department_to_taproom`.

---

## Testing

### Local gate (2026-09-29)
- [x] `MIX_ENV=test mix test`: **685 passing** (605 before D32). Parity suite
      unchanged since `f0ecc07`; boundary test passes.
- [x] `vite build` green. Playwright local: 53 passed, 1 skipped.
- [x] Revert-and-rerun for 3940 and for the Sunday-shift fix (S19).
- [x] S11 rename migration checked by hand on a copy of the local DB
      (owner-changed name kept; migrate, rollback, migrate).
- [x] `tsc` (3) and lint (27): unchanged from the counts waived in D31; none in D32 files.

### DEV gate (2026-09-30)
- [x] API `6a15f39` (v9), UI `1725b70` (v5); code identical to `d4b3ef1`.
- [x] `E2E_TARGET=dev npx playwright test`: **54 passed, 0 failed**.
- [x] Independent pass: all 18 in-scope scenarios PASS (S11 is local-only).
- [x] 2 fix cycles: week-button aria-labels; then G1–G5, the Extend message,
      422 for an unknown repeat type, split counts. Verdict: PR #4 comment
      5911292658.

### Prod (2026-10-02, release `v2026.10.02`)
- [x] Migrations ran at boot; department `bar` = "Taproom"; 4 positions moved
      to the "Taproom" group; 111 shifts intact; pool size 1.
- [x] Matt's own login check: Scheduler events row, View Schedule, Messages.
- [x] Logs clean (no `database is locked`, `dropped from queue`,
      `ConnectionError` or 5xx) in the first hour.

---

## Deviations from Spec

- Overnight events (DEV G5) follow spec amendment A4 from Matt: an event ending
  by 3 AM shows on its start day only; longer ones show on each day with
  continuation labels.
- The Sunday-evening shift fix (A3) predates D32 and was folded in by Matt.

---

## Follow-Up Items

- [ ] **3942:** extending a hidden draft series answers 403, not 404.
- [ ] **3855:** SQLite → Postgres watch; G1's single-writer limit is noted there.
      If prod logs `dropped from queue`, raise `queue_target`/`queue_interval`
      (Rick, conv 80 msg 83616).
- [ ] **Deferred by Matt (2026-09-29), to raise when planning:** events in the
      D17 calendar feeds (spec Q3); company-wide events not tied to one
      department (spec Q7).

---

## Notes

- The rename only matched because prod's department was named exactly "Bar";
  this was checked before the release.
