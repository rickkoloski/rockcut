# Session Handoff: 2026-11-17

Supersedes `SESSION_HANDOFF_2026-11-16.md`.

## Where things stand

- **Prod: `v2026.11.17` (D44)**, live 2026-11-17.
  - Release PR #78 (squash `6189890`), tag `v2026.11.17`. D44 PR #77 (merge `3f694e0`).
  - API v40 (`deployment-01M7NCV1V7VPW8K4KRTE1N04XV`), UI v36 (`deployment-01M7NCWCFT96E0361RBZ90ZCVS`).
  - Pre-release snapshot `vs_ejxnb1OgLNz2hQ1Y5RBOwZQ0`. Rollback: API v39 / UI v35, image only (no
    migration). Smoke passed (health and bundle SHA == tag, build id, `sw.js` no-cache, bundle
    versions, synthetic login 401, 0 synthetic users). Matt's prod check passed.
- **DEV:** free (conv 80 msg 107437), running `develop` `3f694e0` (API v97 / UI v101), reseeded.
- **Git:** close-out PR (`-s ours` sync of `main` into `develop` + D44 docs) merged, so the next
  release PR is conflict-free.
- **Herdr:** `builder` (w1:p4), `qa44` (local QA) and `devqa44` (DEV QA, tab "D44 DEV QA") are idle
  with D44 context; start fresh ones for the next deliverable. `~/src/rockcut-d44-qa` and
  `~/src/rockcut-d44-devqa` keep the briefs, scripts and reports (copied to `stepwise_results/`);
  their login files are expired. `~/src/rockcut-d56-deploy` is the deploy worktree (detached at
  the tag) and can be removed.

## D44 in brief

Record: `stepwise_results/d44_time_off_COMPLETE.md`. Time off dialog from the Scheduler, the agenda
and the Time off page; current list + Archive; notifications to reviewers and to the employee;
pending badges. Matt's DEV-QA decisions: a dot on the phone's ☰, refuse overlapping requests, at
most a year ahead.

## The gate trial (local QA before DEV)

First run on D44 (plan: `planning/d44_time_off_plan.md` "Trial gate order"; Rick agreed in conv 80,
msgs 107086–107088). Local independent QA caught both must-fix gaps, so DEV saw none; DEV QA still
found 2 should-fix (network / layout) and 3 decisions. 2 DEV fix cycles. Summary posted to Rick in
conv 80 (msg 107437). **Open:** propose the `three_environment_workflow.md` §4 edit (local QA pass
before DEV) once Rick replies; add a 360 px no-sideways-scroll check and a slow-network pass to the
local QA brief template.

## Open items

- **Backlog:** 5911 updated with this run's flaky specs (S16, S123, S19, d52 4232, T9, S160; the
  click-then-reload race pattern). Still open: 5910, 5792, 5789, 5203, 4084.
- Matt's queue: 4055 (events in calendar feeds), 4056 (company-wide events).

## Next

- Next new ID: **D60**.
- QA agent runs get two panes (agent + `qawatch.sh` status) and use the qawatch log format.
