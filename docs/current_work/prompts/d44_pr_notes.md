# D44 handoff note and LIMITATIONS (PR description, draft)

**Deliverable:** D44, time off: Scheduler and agenda dialogs, Archive, notifications, badges.
**Spec:** `docs/current_work/specs/d44_scheduler_time_off_dialogs_spec.md` (Q1–Q8 answered
2026-11-16, plus the past-request rule).
**Plan:** `docs/current_work/planning/d44_time_off_plan.md`; brief
`docs/current_work/prompts/d44_builder_brief.md` (Stages 1–3, local QA fix cycle 1); decisions
`d44_lead_decisions_1.md`.
**Branch:** `d44-time-off`, from `develop` @ `184819c`.
**SHA on DEV:** `490f913` (UI) / `debb528` (API; cycle 2 changed the UI only)
**Local gate:** green on `a090bbe`, then on `debb528` after DEV fix cycle 1 (below).
**DEV gate:** green (below).

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
| DEV Playwright (`3ca49a1`) | D44 specs all pass; 2 non-D44 races: S58 (check-off saved after the reload; test fixed `ee263c6`), d58 S16 (flaky, passed in the full run) | — |
| DEV QA (short, 7 checks) | pass: 0 must-fix, 2 should-fix (badge didn't catch up on in-app navigation; long unbroken note scrolled the page sideways), 6 minor | DEV cycle 1 (Matt decided 3: phone ☰ dot, refuse overlap, a year ahead at most) |
| Local full suite (`debb528`) | 814 passed; 2 non-D44 (d52 4232 parallel Publish week, d58 S19 browser crash), both pass on re-run | — |
| DEV Playwright (`debb528`) | all D44 specs pass; T9 and S123 (DEV timing) pass on re-run; Brewery board 229/229, d58 47/47 | — |
| DEV QA recheck 1 | G1–G8 closed (cancel badge 103 ms); 2 new minor (silent note cut; year on headers) | DEV cycle 2 (UI only) |
| DEV Playwright (`490f913`, affected) | timeoff 27/27; View Schedule, Scheduler, d52 67/67 | — |
| DEV QA recheck 2 | N1, N2 closed; no new gaps | — |

**Trial summary:** the local QA pass caught both must-fix gaps before DEV, so DEV saw none; DEV QA
still found real-network and release-build issues (badge staleness, layout with long notes) plus
three product decisions. DEV fix cycles: 2 (budget 2).

## DEV fix cycles (rules added after DEV QA)

- **Overlap:** a request overlapping the same person's pending or approved request → 422 "You already
  have time off then." / "This person already has time off then." (on-behalf); touching is allowed.
- **A year ahead:** a request starting more than 365 days out → 422 "Time off can be requested up to
  a year ahead."; dates outside this year show the year (rows, dialog, agenda headers, Scheduler
  week label, Publish week question).
- **Notes:** at most 2,000 characters (API 422; the fields count from 1,800 and say when a paste was
  cut); long notes wrap everywhere.
- **Badge:** re-read on in-app navigation (at most every 30 s); the Time off page refetches when
  opened; a dot on the phone's ☰ while time off is pending.
- **Seed:** a past approved `[SEED] Day off` (brewer1) for the Archive. Nav collapse button named.
- **Test-only, not D44:** S58 waits for the check-off save before reloading (`ee263c6`).

## ⚠ LIMITATIONS: what local couldn't tell us (checked on DEV)

- **Email and push delivery** of the two new events: on DEV, request and review succeed with push
  unsubscribed and the bell shows both; real push delivery to a device wasn't tested (headless).
- **The service worker:** checked on DEV (controlled reloads show the new build; no stale screens).
- **Real network latency:** checked on DEV (409 message ~150–210 ms; badge ~100–315 ms).
- **The seed times:** checked on DEV (`[SEED]` rows on their intended days; past `[SEED] Day off` in
  the Archive).
- **A pending request crossing midnight** (badge drop and move to the Archive the next day): ExUnit
  only; nobody could create a past pending request through the API.
