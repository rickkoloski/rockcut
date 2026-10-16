# Session Handoff — 2026-10-14 (b)

Supersedes `SESSION_HANDOFF_2026-10-14.md`. **D42 and D40 were built,
gated and released the same day; prod is `v2026.10.14`.** Nothing is in
flight.

## Where things are

| | State |
|---|---|
| **Prod** | **`v2026.10.14`** (PR #24 squash `264e4a1`), ~21:52 UTC: **API v26** `…01M4Y6D14CF0G0B8Y2MAK1CD39` / **UI v21** `…01M4Y6ESCJ5TRX8PZ1WHFEN12K`. 9 migrations up. Rollback: API v25 `…01M4BXXJ944WKQEQY4FBB25CX0`, UI v20 `…01M4BYQ7FGJ2RY5QQBKXKW66ER`; snapshot `vs_3278xNvpqVDOS9JlkgpeX`. Agent smoke and Matt's checks (incl. the Taproom tablet with a staff code) pass. All staff have staff codes (Matt). |
| **Prod volume** | **`vol_vden5mz7qg3d2864`** (Fly moved it on 2026-10-09; `vol_rkgemljzzkozz3w4` is gone). Runbook and release plan updated. |
| **DEV** | **Free** (conv 80, msg 89430). Runs D40 `9dae539` (API v39 / UI v37) = `develop`'s app code; reseeded. |
| **develop** | D40 merged (`960bec1`), sync PR #23 (`ad7dfa4`, `-s ours`), then this close-out. `main` is an ancestor of `develop` again; the release squash `264e4a1` needs the usual `-s ours` sync before the next release PR. |
| **Backlog** | Closed: 4211, 4212, 4237, 4260, 4117, 4213. |

## Done today

- D41 close-out (morning).
- **D42** (PR #21): spec → builder Tasks 1–3 → local gate → DEV (331/331) →
  QA PASS with gaps (gap 1 fixed, gap 2 by design) → Matt's Pixel checks →
  merged. Record: `stepwise_results/d42_task_board_follow_ups_COMPLETE.md`.
- **D40** (PR #22): plan → builder Tasks 1–5 → local gate → DEV (343/343) →
  QA PASS with gaps (gaps 1, 3, 5, 6 fixed in two cycles; 2, 4 accepted) →
  Matt's tablet + push checks → merged. Record:
  `stepwise_results/d40_tablets_reminder_dashboard_COMPLETE.md`.
- **Release** per `planning/release_d38_d42_plan.md` (RELEASED).

## Open

- **Matt:** create the brewhouse tablet on prod (Admin → Shared devices,
  home Brewery) and pair it when convenient.
- **Audits at the release** (none introduced by it): `decimal` (2 advisories)
  and `bandit` 1.12.5 (HTTP/2 only; not reachable, Fly speaks HTTP/1.1 to
  the app); proposed to fold the bandit upgrade into task 3994 (due
  2026-10-30) — Matt hasn't confirmed. `source-map-js` is build-time only.
- Next deliverable: none queued (D43 free); Matt's queue is in CLAUDE.md.
- `~/src/rockcut-d42-qa/` and `~/src/rockcut-d40-qa/` (QA folders, not in
  git) can be deleted; their reports are in `stepwise_results/`.

## Gotchas (new)

- **Fly can move a volume** (host migration): look up the prod volume with
  `fly volumes list -a rockcut-api` before snapshotting; don't trust a
  recorded id.
- **A Pixel check can change shared DEV data** (Gravities was retired by
  accident): check DEV's Brewery Daily items before a DEV Playwright rerun;
  `seed_synthetic()` doesn't restore a retired default item (restore it with
  `Tasks.restore_item/3` + `order_items/3`).
- **`herdr agent wait` returns at once** when the agent is already "done"
  with a background shell running; wait for `state_change_seq` to change
  first.
- **`git commit -am`** on a branch the builder shares is fine for docs, but
  check `git status` first.
