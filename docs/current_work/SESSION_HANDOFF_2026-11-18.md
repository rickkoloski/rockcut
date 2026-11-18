# Session handoff — 2026-11-18

## Where things stand

- **Prod:** `v2026.11.18` = D60 grain catalog and inventory (release PR #81, squash `f9d2964`; D60
  PR #80). API v41 / UI v37. Pre-release snapshot `vs_mJqPbgoN2AjQS9qy3x8qwegL`; rollback =
  restore it, then API v40 / UI v36 (the migration drops the old lot spec columns). `Release.seed()`
  ran: 38 grains, 44 maltster products, 8 companies. Smoke green; **Matt's prod check passed**.
- **DEV:** free (conv 80 msg 107972), running develop's app code (`7fb208a`), reseeded. Pre-D60 DEV
  snapshot taken on `vol_vz8l9elx6oe0dzqv` before the deploy.
- **Close-out:** this PR (`closeout-v2026.11.18`: `-s ours` sync of main + D60 docs), so the next
  release PR is conflict-free.

## D60 in one paragraph

Grains on Silverston's UDM patterns: categories with children, maltster products with feature-row
specs and conversions, companies with roles, offers and price history, lots with movements (oldest
first, counts, Expired), sacks/lb per person. Details: `stepwise_results/d60_grain_catalog_COMPLETE.md`.

## Gate (second run of local QA before DEV)

Local QA caught all 3 must-fix gaps (2 local fix cycles, 2 rechecks); DEV QA found 0 must-fix,
2 should-fix, 1 minor. Matt chose to ship `7fb208a` as tested and carry the rest to D61. Every
Playwright and QA run, including reruns and rechecks, now shows live in its own herdr tab with
pwwatch / qawatch (Matt's standard, in `~/.config/herdr/rockcut-workflow.md`).

## Next

- **D61: purchasing and malt contracts** (Matt's scope from 2026-11-17: annual Jan–Dec contracts with
  a supplier, several maltsters and products; ordered → received with the actual quantity counting
  toward the contract; off-contract orders; contracts by owners and brewery managers, the rest by any
  brewery employee). Start with the carry-over list in `d60_grain_catalog_COMPLETE.md` and
  cherry-pick `0299732` from local branch `d61-carry`. Scope with Matt before writing the spec.
- Then D62 (hops, yeast, other ingredients), D63 (recipes on maltster products, brew-day drawdown,
  planned-inventory short warning, °Plato 4987, batch-log time 4986, the rest of 4989/5203).
- Next new ID: **D64**.
- Matt checks the grain reference data before the brewery uses it (list in the COMPLETE doc).

## Open items

- Backlog: 5911 (flaky Playwright specs: add d58 managers 12/13, P79–P82 schedule 500 under load on
  DEV), 5910, 5792, 5789, 5203, 4084.
- D44 gate-trial follow-up (workflow §4 edit) still waits on Rick.
- Remote branch `d50-brewhouse-device` still exists (local deleted); delete only with Matt's OK.
- QA folders `~/src/rockcut-d60-qa`, `rockcut-d60-devqa`, `rockcut-d44-qa`, `rockcut-d44-devqa` can go
  (briefs archived in `~/src/rockcut-qa-briefs/` first). Release worktree
  `~/src/rockcut-release-20261118` can be removed.
- Matt's queue: 4055, 4056.
