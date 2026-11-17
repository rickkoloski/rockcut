# D44 handoff note and LIMITATIONS (PR description, draft)

**Deliverable:** D44, time off: Scheduler and agenda dialogs, Archive, notifications, badges.
**Spec:** `docs/current_work/specs/d44_scheduler_time_off_dialogs_spec.md` (Q1–Q8 answered
2026-11-16, plus the past-request rule).
**Plan:** `docs/current_work/planning/d44_time_off_plan.md`; brief
`docs/current_work/prompts/d44_builder_brief.md` (Stages 1–3, local QA fix cycle 1); decisions
`d44_lead_decisions_1.md`.
**Branch:** `d44-time-off`, from `develop` @ `184819c`.
**SHA for DEV:** __SHA__
**Local gate:** green on `a090bbe` (below).

## What changed

Scenario → test is in `rockcut-ui/tests/COVERAGE.md` (D44).

| Area | Change |
|---|---|
| Time off dialog | One dialog (who, type, dates, note, requested, reviewer and note). Pending: Approve / Deny with an optional note to the employee. Approved: Remove (confirm, optional note). Past: read-only; past pending shows "Not reviewed". Buttons only for those who may review. |
| Where it opens | Scheduler off chips; View Schedule's agenda (new: approved and pending time off rows per day, own / managed / everyone by role; Open shifts only and position filters hide them); the Time off page (rows and a Review button replace the inline buttons). |
| Time off page | Main view current and future only; an Archive (past, newest first, read-only); the reviewer's note shown to the employee. |
| Past rules | A request's last day is the Colorado day of `ends_at` (the day before when it ends exactly 00:00, timed). Past requests can't be reviewed or cancelled (422 "This time off has already passed"); a past request for oneself can't be made (422 "This date has passed. Ask your manager to enter it for you."); on-behalf entries may be past (created approved). |
| Review state | Approve only from pending; Deny from pending or approved (Remove); else 409 "This request has already been <status>." `expected_status` (sent by the UI) not matching → 409 "This request has changed since you opened it.", nothing stored, no notification; the 409 body carries the request as stored. |
| Notifications | `time_off_requested` to everyone who may review (not the requester, not on-behalf, not devices); `time_off_reviewed` to the employee on approve / deny / Remove (not a self-approval). Both in Notification preferences, normal defaults; the bell keeps line breaks. |
| Badges | `capabilities.pending_time_off` (pending, current, own or reviewable, each once; devices 0) on the Schedule section icon and the Time off item; refreshed after any time off action. |
| Seed | Seeded time off at Colorado times. |

**API, additive:** `GET /api/time_off?when=current|past`; `expected_status` on review; 409s on
review; 422s for past; `capabilities.pending_time_off`; events `time_off_requested`,
`time_off_reviewed`. **No migration**, no secrets or config.

**Tests touched outside D44:** fixed October dates in three time off test files moved a week ahead
(assertions unchanged); `pending_time_off` added to the two pinned capabilities key lists (frozen
D31 parity suite: one new key only); theme G1 makes its own notification (it depended on run
order).

## Local gate

- `mix test`: 2545 passed, twice; `mix compile --force --warnings-as-errors` clean
- tsc (app) clean; vitest 367; lint 27 = `develop`; `vite build` ok; e2e tsc 2 errors = `develop`
- Full local Playwright on `a090bbe`: 808 passed, 1 failed, 4 not run (dependents). The failure,
  `ui/schedule.spec.ts` S160 (Move mode), collided with theme's parallel `[TEST-TEMP]` person (in
  the row list before the reload, gone after); not D44. Re-run: `schedule.spec.ts` 10/10 and
  `board-replace` 2/2. Candidate for 5911 (flaky specs).
- Revert-and-rerun: recorded for the review state rule (ExUnit 6 cases, Playwright M10/M11), the
  midnight end (vitest 3 cases) and the last-day past rule (ExUnit)

## Gate trial (Matt, Rick conv 80 msgs 107083–107088)

A local independent QA pass ran before DEV: a fresh agent (Sonnet) with only the brief, on the local
stack, no code access.

| Pass | Result | Fix cycles |
|---|---|---|
| Local QA (16 scenarios + open hunt) | 2 must-fix (stale reviewer overwrites a decision; a cancelled request can be approved), 2 minor (midnight ghost row, phone note label) | 1 local cycle (+1 follow-up: one last-day rule) |
| Local QA recheck | all 4 closed; 9 stale-409 paths, state rules and the midnight boundary pass; no new gaps | — |
| DEV Playwright | __ | __ |
| DEV QA (short) | __ | __ |

## ⚠ LIMITATIONS: what local couldn't tell us

- **Email and push delivery** of the two new events (local mail is a no-op; no push locally).
- **The service worker / reload prompt** with the changed nav and dialogs (dev server has no SW).
- **Real network latency** on the 409 refresh and the badge refresh.
- **The new seed times** after `seed_synthetic()` on DEV's volume.
- **A pending request crossing midnight** (badge drop and move to the Archive the next day): ExUnit
  only; nobody could create a past pending request through the API.
