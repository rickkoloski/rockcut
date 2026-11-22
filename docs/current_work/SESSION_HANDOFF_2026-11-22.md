# Session handoff — 2026-11-22

## Where things stand

- **Prod: `v2026.11.22` (D65, fruit, spices, sugars and other consumables).** Matt's prod check
  passed 2026-11-22.
  - D65 PR #90 merged to `develop` as `bd09cda`. Release PR #91 was squashed as `483842b` and
    tagged `v2026.11.22`.
  - API v44 `registry.fly.io/rockcut-api:deployment-01M81W70VBG24WT4MBQBT6M8CE` and UI v40
    `registry.fly.io/rockcut-ui:deployment-01M81W960CD50ZHNM3VP5R2FDN`.
  - **Rollback:** restore snapshot `vs_mJqPbgoN2AjQSyYpYayVOMLp` (taken before the API deploy),
    then API v43 / UI v39. The products table was rebuilt with a nullable manufacturer, so the
    images alone won't work.
  - **Seed:** the D65 reference data is on prod (8 companies, 36 ingredients, 29 products,
    30 offers, 26 prices, no lots). A second run added nothing. Prod now has 100 products,
    101 offers and 28 hop lots (409.6 lb), and `foreign_key_check` is clean.
- **DEV is free** (conv 80 msg 109265). It runs `cec1228`, which has `develop`'s app code.
- **Close-out PR:** a `-s ours` sync of `main` into `develop`, plus `CLAUDE.md` and this handoff.
  After it merges, the next release PR is conflict-free.

## The D65 gate, in short

The full record is in `stepwise_results/d65_fruit_spices_sugars_consumables_COMPLETE.md`, with
the QA reports beside it.

| Pass | Result |
|---|---|
| Local QA | fail, then fixed in decisions 1 and 2 |
| DEV Playwright | 961/961 at `cec1228` |
| DEV QA | fail on a false positive (gap 2), then decisions 3 and 4, then pass with gaps |

- **Gap 9 moved to D64 (Matt):** an order line with no offer reads "Sacks" / "$ / sack". The brief
  is `prompts/d65_lead_decisions_5.md` (deferred, not built).
- **Matt's decisions:** the reference values stand, "Whirlfloc T · None" is the product label, and
  the form stays locked once a product has a lot.
- **Flaky tests:** the ExUnit first-run failures and the D65 run flakes were added to backlog 5911.

## Next

1. Merge the close-out PR.
2. **D64 (yeast):** scope it with Matt from the saved scoping decisions (the yeast lab role,
   bricks and pitchables, harvests with generation, vessel and lb, recounts). Carry in gap 9.
   Write the spec only when Matt says scoping is done.
3. Then D63 (recipes on products, brew-day drawdown, °Plato, batch-log time, lint 4084).

## Notes

- **QA folders:** the D62 and D65 folders are archived (briefs and reports only) in
  `~/src/rockcut-qa-briefs/`, and the working folders are deleted.
- The release worktree `~/src/rockcut-release-20261122` can be removed after the close-out.
- **herdr summary panes:** `qawatch.sh` and `pwwatch.sh` are portable `#!/bin/sh`. Launch them by
  path, never with `bash x.sh`, and read the pane once to confirm the summary line.
- **The `rpc` gotcha:** a `fn … end` closure inside `rpc` fails. Use one
  `IO.inspect(Repo.query!(~s|…|).rows)` per query.
- The builder (w1:p4) is idle, with nothing pending.
