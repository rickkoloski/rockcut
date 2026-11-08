# D53 Part 1: lead decisions 6 (fix cycle 2)

2026-11-07 · lead → builder, from the QA recheck on `1be89fb`
(`docs/current_work/stepwise_results/d53_part1_dev_qa_recheck_report.md`). The fix-cycle-1 fixes
all passed. Read gaps 12, 13 and 14 there; each has a repro. **This is the workflow's second and last
fix cycle, so keep it tight.**

The rules in `d53_part1_builder_brief.md` still apply. Local servers run from `~/src/rockcut-d53`.
DEV stays idle: never set `E2E_TARGET=dev`. Run `npx playwright test --project setup` first.

## Gap 12 (must-fix): one meaning for "changed on its own"

The flag (`series_exception`) is the only meaning. **A notes-only change doesn't make an occurrence
"changed on its own"** (D42 decided that on purpose). So:
- The rule-change confirm **doesn't count** a notes-only occurrence among those "changed on its own".
- On "keep", it isn't kept back in the old series. It's remade with the new pattern like its
  neighbours: its date survives, so it keeps its own people, title **and notes** (the gap 1 rule).
- After that, "following" edits reach it like any neighbour, from either side of the split.

First say whether `develop` (`b3670d0`) counts notes-only occurrences in the confirm the same way.
Fix it here either way. Add a test from the report's repro that fails with the fix reverted.

## Gaps 13 and 14 (minor)

For each, first find out whether `develop` (`b3670d0`) does the same.
- **Already on `develop`:** don't fix. Write it up for Part 2 (the lead adds it to spec §4.8).
- **Caused by Part 1 or fix cycle 1:** fix it here, if the fix is small and stays inside
  `series.ex`'s split. If it isn't small, stop and tell me.

## Gate and stop

`mix test` twice, `tsc`, `vite build`, vitest, lint, then `task-board-multi-assignee`,
`--project brewery-board --no-deps` and `--project production --no-deps`, one at a time. Commit, append
"Fix cycle 2" to the status file, and commit with a message containing `fix cycle 2 done`, then stop.
