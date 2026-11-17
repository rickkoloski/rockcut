# D56: Pre-brew steps, test results and retests, and follow-ups — Complete

**Spec:** `specs/d56_production_timing_spec.md` (decisions 1–30; 14–30 came from the build and DEV QA)
**Plan and briefs:** `planning/d56_production_timing_plan.md`, `prompts/d56_builder_brief.md`
(Stages 1–5, fix cycles 1–6), `prompts/d56_lead_decisions_1.md`, `prompts/d56_pr_notes.md`
**Tasks:** 5207, 5208 (was D57), 5210, 5211, 4950, 5791
**Completed:** 2026-11-16 (on prod as `v2026.11.16`, release PR #74, squash `49b22a2`; D56 PR #73,
merge `722cbdc`). Matt's prod check passed 2026-11-16, and the six tasks are closed.

---

## Summary

D57 (test results) was folded into D56 and multi-day steps were dropped (backlog 5792). Templates
can hold pre-brew steps before brew day. Step types can record Pass / Fail, and a Fail can add a
retest that the following steps wait on. The Gantt's expanded view, "Label by" and "Your selection"
are saved on the account and refresh when the app returns to the screen. Four backlog fixes ride
along.

## What Was Built

- **Pre-brew steps (§3.1; decisions 1, 2, 7, 10–13, 21, 22):** template steps at day −1…−30,
  plain or custom only, first tank, no phase. `production_steps.pre_brew` marks them by origin
  (decision 22), not by date. Dots before the bar, no tank time, move with brew day; never on or
  after brew day; a brew day can't move before a finished one; Change template keeps a finished one.
- **Test results and retests (§3.2; decisions 3–5, 8, 14–17, 20, 25):** `has_result` step types;
  Pass / Fail at every check-off; Fail → "Retest in N days" (a retest step; the followers wait on it
  and move through one move question) or "Continue as planned". ✓ / ✗ on the Gantt, dialogs and the
  board; Change result; "N failed <test>s" flag. Undo, Mark not done and Fail → Pass put the
  followers back relative to the test. A retest is never pre-brew.
- **Brew day order (decisions 23, 24, 26, 27, 28):** steps after brew day can't be checked off
  before the first Brew day ("1 of 2" on a two-day brew); brew day can't be un-checked while they're
  done, or moved past a finished one. The bar drag moves the whole plan; on a brewed batch it leaves
  done brew days and pre-brew steps put and obeys the move rules.
- **Gantt view on the account (§3.3, §3.4; decisions 18, 19):** expanded tanks, "Label by" and
  "Your selection" in `board_settings.production`, with a one-time carry-over; `/api/me` re-read on
  return to the screen (once a minute).
- **Fixes:** 5210 (template step Save all-or-nothing), 5211 (a step off the task list reachable),
  4950 (Undo snackbar: Ctrl/Cmd+Z, stays over dialogs, bottom, dialogs make room), 5791 (Boards due
  date typed by hand).

## Migrations

`20261112120001_add_test_results`, `20261114120001_add_pre_brew_to_production_steps` (additive).
On prod: Diacetyl test and Gravity check have `has_result` on; no steps marked pre-brew.

## Testing

- **Local gate:** green (`mix test` 2493 at the last cycle; Vitest 348; Playwright production +
  brewery-board 435).
- **DEV gate:** seven full Playwright runs; the last at `3885cf6`: 746 + 47 passed, one flaky
  (S123) passed on rerun. Independent QA: pass 1 + six rechecks
  (`stepwise_results/d56_dev_qa_*report.md`); the last passed with one minor gap.
- **Accepted for the backlog:** gap 21 (task 5910); flaky DEV specs D58 S16 and S123 (task 5911).
- **Not testable by QA:** brewhouse device check-offs need a staff code (Playwright covers them).

## Release

API v39 (`registry.fly.io/rockcut-api:deployment-01M7JSN9A2159A6TAFM96YJJ37`), UI v35
(`registry.fly.io/rockcut-ui:deployment-01M7JSPKT3JYD5GQMS9NP18HWY`), build id `v2026.11.16`.
Pre-release snapshot `vs_3278xNvpqVDOSP2BwRZqeZzJ`. Rollback: API v38 / UI v34, image only.

## Lessons

- The rules for pre-brew steps, retests, late check-offs and moves interact; each DEV QA hunt found
  new combinations (gaps 7–21 over six cycles). Next time a scheduling rule is added, write the
  invariants first (what may never be before brew day, what a move or Undo may never leave behind)
  and test every write path against them in one table.
