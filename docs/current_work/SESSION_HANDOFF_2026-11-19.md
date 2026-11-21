# Session handoff — 2026-11-19

## Where things stand

- **Prod:** `v2026.11.19` = D61 purchasing, malt contracts, reorder and totals (release PR #84, squash
  `ef2dee8`; D61 PR #83, merge `412c51f`). API v42 / UI v38. Pre-release snapshot
  `vs_4bq8yLP0wkx9UQ0weDZ5q5Y`; all 6 migrations are additive, so rollback = API v41 / UI v37 (image
  only). No seed. Smoke green; **Matt's prod check passed**. Prod has no orders, contracts or lots
  yet: Matt starts using Purchasing once everything is in place.
- **DEV:** free (conv 80 msg 108393), running develop's app code (API `2237ed1`, UI `4360e03` = the
  D61 merge). DEV snapshots taken before each D61 API deploy on `vol_vz8l9elx6oe0dzqv`.
- **Close-out:** this PR (`closeout-v2026.11.19`: `-s ours` sync of main + D61 docs), so the next
  release PR is conflict-free.

## D61 in one paragraph

Orders with a running total toward the supplier's sack target; receiving into the previous lot, a
new lot # or a split, with the cost on each receipt; yearly malt contracts (owners and Brewery
managers) whose figures follow orders and receipts by weight; lot value at the most recent price
paid, "as of" any date; minimum on hand and To order; Inventory and Orders totals with Copy.
Details: `stepwise_results/d61_purchasing_contracts_COMPLETE.md`.

## Gate (third run of local QA before DEV)

Local QA: 17 gaps (1 must-fix) closed in one cycle plus a follow-up; two rechecks. DEV found what
local couldn't: a Save dropped while a dialog's lists load (exposed by PO7 on the release build) and
two must-fixes where two people editing one order or contract silently lost a change (now a 409 via
`lock_version`). One DEV fix cycle, three DEV rechecks, all closed. Matt decided 2a, 17a (local) and
4a (a past-year contract writes no price). Suggest adding "two people, one record" to every local
QA brief.

## Next

- **D62: hops, yeast and other ingredients.** Scope with Matt before writing the spec.
- Then D63 (recipes on maltster products, brew-day drawdown, planned-inventory short warning,
  °Plato 4987, batch-log time 4986, the rest of 4989/5203, the last 8 lint errors from 4084).
- Next new ID: **D64**.
- Matt still checks the grain reference data (list in `d60_grain_catalog_COMPLETE.md`) before use.

## Open items

- Backlog: **6107** (Scheduler: confirm before deleting a shift or event, new), 5911 (flaky specs;
  D61 additions: T9, S123, S185, d58 S16 on DEV; O9 and the P4 phone-dialog/goto pattern locally),
  5910, 5789, 5203, 4084. 5792 cancelled (Matt, 2026-11-18).
- D44 gate-trial follow-up (workflow §4 edit) still waits on Rick.
- Remote branch `d50-brewhouse-device` still exists; delete only with Matt's OK.
- Release worktree `~/src/rockcut-release-20261119` can be removed. D61 QA folders archived to
  `~/src/rockcut-qa-briefs/` and deleted.
- Matt's queue: 4055, 4056.
