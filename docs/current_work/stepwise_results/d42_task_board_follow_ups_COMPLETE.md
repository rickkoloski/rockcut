# D42: Task Board Follow-ups + Required Password Reset — Completion Record

**Status:** COMPLETE and **on prod** in `v2026.10.14` (2026-10-14, PR #24).
Merged to `develop` 2026-10-14 (PR #21, merge `9a784e7`).
**Spec:** `specs/d42_task_board_follow_ups_spec.md` (scenarios S121–S142)
**Concept:** 10_brewery_tasks
**Branch:** `d42-task-board-follow-ups`, cut from `develop` (`9966d4d`), 21
commits. DEV gate SHAs: `cb59d3b` (API v36 / UI v34), fix cycle 1
`eb5b2ce` (API v37).
**Backlog:** 4260 (D42), 4117 (password reset).
**QA report:** `stepwise_results/d42_dev_qa_report.md`
**PR description / full detail:** `prompts/d42_handoff_note.md`

---

## Summary

Ten follow-ups to the task boards, decided by Matt on 2026-10-13/14, plus
the 4117 security fix: while someone still has to set a new password, the
API refuses everything but the reset flow.

## What shipped

| # | Item |
|---|---|
| 1 | **4117:** `PasswordResetGate` after `AuthPlug`: 403 `password_reset_required` everywhere except `/api/me`, `GET`/`DELETE /api/session`, `POST /api/session/password`; the UI goes to "Set a new password". |
| 2 | A move's `before_id` from another board → 404. |
| 3 | `no_brewers` → `no_one_scheduled`. |
| 4 | Delete a retired Daily item that was **never ticked** (a check now or a `daily_ticked` History entry); 422 `not_retired` / `has_ticks`. |
| 5 | A notes-only "Just this one" edit isn't "changed on its own"; "following" notes changes skip occurrences with their own notes; those are offered for keeping by splits, Delete following, Stop repeating and Ends-only changes. |
| 6 | An Ends-only change moves the chain's end without touching any rule; "Extends the series." / "Removes N later occurrences." |
| 7 | Add / Restore greyed out at 12 Daily items. |
| 8 | 1 week / 2 weeks, Hide completed, phone view and first day remembered per board, per browser (`rockcut.tasks.<setting>.<board>`), starting from the D41 shared value. |
| 9 | **First day:** Today / Sunday / Monday; days before today dimmed (all modes), still usable. |
| 10 | **R2:** "After N times" stays a count across a split; every part shows the chain's total. |

No migrations, secrets or dependencies.

## Testing

- **Local gate:** ExUnit 1,414/0; Vitest 95; full Playwright 331 passed /
  1 skipped (one test fixed: S31's hint locator).
- **DEV (`cb59d3b`):** full Playwright 331/331 (2 skipped, login-form).
  QA: **PASS with gaps**; S121–S142 pass; the reset gate held across ~60
  routes. Gap 1 (ticked-then-unticked item deletable) fixed in `44022b6`;
  gap 2 (a missing `before_id` → 200) by design (D38 rule).
- **DEV recheck (`eb5b2ce`):** Daily-items + follow-up specs 27/27.
- **Matt's Pixel checks:** Daily item delete / tick-untick-retire 5/5; first
  day 7/7.

## Follow-ups

None new. Backlog as before: 4238, 4231, 4232, 4261.
