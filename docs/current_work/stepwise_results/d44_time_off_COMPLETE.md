# D44: Time off: Scheduler dialogs, Archive, notifications, badges — Complete

**Spec:** `specs/d44_scheduler_time_off_dialogs_spec.md` (Q1–Q8 and the past-request rule answered
2026-11-16; three DEV-QA decisions 2026-11-17)
**Plan and briefs:** `planning/d44_time_off_plan.md` (with the gate trial order),
`prompts/d44_builder_brief.md` (Stages 1–3, local QA fix cycle 1, DEV fix cycles 1–2),
`prompts/d44_lead_decisions_1.md`, `prompts/d44_pr_notes.md`
**Completed:** 2026-11-17 (on prod as `v2026.11.17`, release PR #78, squash `6189890`; D44 PR #77,
merge `3f694e0`). Matt's prod check passed 2026-11-17.

---

## Summary

Time off opens in one dialog from the Scheduler, View Schedule's agenda and the Time off page, where
managers and owners approve, deny or remove it with a note to the employee. The Time off page shows
current and future requests, with an Archive for past ones. Everyone who could approve a request is
notified, the employee hears the decision, and a badge counts pending time off.

## What Was Built

- **Dialog (§2.1–§2.3):** `components/timeoff/TimeOffDialog.tsx`; Approve / Deny (pending), Remove
  (approved, confirm), read-only for everyone else and for past time off ("Not reviewed" on a past
  pending one). Reviewers: the person's department managers and owners; a manager may approve their
  own.
- **Where it opens:** Scheduler off chips; View Schedule's agenda gained time off rows (own / team /
  everyone by role, filters respected); Time off page rows and Review.
- **Time off page:** current and future (`GET /api/time_off?when=current|past`), Archive newest
  first, the reviewer's note shown to the employee.
- **Rules:** one Colorado "last day" (the day before when a timed request ends exactly 00:00) for
  past, Archive, badge, agenda and grid. Past requests can't be reviewed or cancelled; one's own past
  requests can't be made (managers may enter past ones for someone, approved at once). No overlap
  with the same person's pending or approved time off; at most 365 days ahead; notes ≤ 2,000
  characters (fields count from 1,800 and say when a paste was cut).
- **Review state:** approve only from pending, deny from pending or approved; 409 "already been
  <status>"; a stale view (`expected_status`) gets 409 "This request has changed since you opened
  it." with the stored request, nothing saved, no notification.
- **Notifications:** `time_off_requested` (to everyone who may review; not on-behalf, not devices),
  `time_off_reviewed` (to the employee; not a self-approval). Both in Notification preferences.
- **Badges:** `capabilities.pending_time_off` on the Schedule icon and the Time off item, re-read
  after time off actions and on in-app navigation (at most every 30 s); a dot on the phone's ☰.
  Never on shared tablets.
- **Also:** the year on dates outside this year (rows, dialog, agenda headers, Scheduler week label,
  Publish week question); seeded time off at Colorado times plus a past `[SEED] Day off`; the nav
  collapse button named.

## Migrations

None.

## Testing

- **Local gate:** `mix test` 2557 (twice), Vitest 373, tsc/lint/build as `develop`; full local
  Playwright green apart from non-D44 parallel collisions (task 5911). New `timeoff` Playwright
  project (27 specs, one worker); scenario map in `rockcut-ui/tests/COVERAGE.md`.
- **Gate trial (first run of local QA before DEV):**
  - Local independent QA (`d44_local_qa_report.md`, recheck `d44_local_qa_recheck1.md`): 2 must-fix
    (stale reviewer overwrote a decision; a cancelled request could be approved), 2 minor; one local
    fix cycle.
  - DEV Playwright: every D44 spec green; failures were pre-existing races (S58 fixed test-only in
    `ee263c6`; S16, S123, T9 passed on re-run).
  - DEV QA (`d44_dev_qa_report.md`, rechecks 1–2): 0 must-fix, 2 should-fix (badge stale across
    in-app navigation; long unbroken note scrolled the page), 6 minor, 3 decisions for Matt (phone ☰
    dot, refuse overlap, a year ahead at most). DEV fix cycles: 2 (the second UI-only, with a
    targeted DEV re-run).
- **Not tested:** real push delivery to a device; a pending request crossing midnight (ExUnit only).

## Release

API v40 (`registry.fly.io/rockcut-api:deployment-01M7NCV1V7VPW8K4KRTE1N04XV`), UI v36
(`registry.fly.io/rockcut-ui:deployment-01M7NCWCFT96E0361RBZ90ZCVS`), build id `v2026.11.17`.
Pre-release snapshot `vs_ejxnb1OgLNz2hQ1Y5RBOwZQ0`. Rollback: API v39 / UI v35, image only.

## Lessons

- The local QA pass paid for itself: both must-fix gaps were found and fixed before DEV, and DEV's
  cycles were about the real network and layout. Add a 360 px no-sideways-scroll check and a
  slow-network pass to the local QA brief; they would likely have caught both DEV should-fixes.
- A test that clicks and then reloads at once races the save on DEV; wait for the write's response
  first (S58).
