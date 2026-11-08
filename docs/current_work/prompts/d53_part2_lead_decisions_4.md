# D53 Part 2: lead decisions 4

2026-11-08 · lead → builder, answering stop 4. The UI looks right in the screenshots I checked
(board, card notes, phone board, Company send).

- **LEAD-5 (dragging lists) is waiting on Matt.** Don't touch the shared drag layer yet; keep Move
  left/right. I'll tell you his answer before stage 8's specs are final.
- The checklist's ↑/↓ and the Send picker's roster source are accepted.

## Next: stage 7, then stage 8, to stop 5

Stage 7 (spec §4.8, all items: gaps 4, 5, 6, 9, 11, 13, 14 and the two recheck observations), each
with a test from its repro that fails with the fix reverted. Reports: `stepwise_results/d53_part1_dev_qa*`.

Then stage 8:
- seed and reseed cleanup, as the plan and decisions 1.6 say;
- Playwright for S223–S243 and S255–S261 (including S239's long-press drop on a tab with `touchDrag`);
- `tests/COVERAGE.md`.

Run the specs you touch and `--project brewery-board --no-deps` (stage 7 changes the task boards),
one project at a time. Stop 5: the non-Playwright gate passing and your specs passing. Commit with a
message containing `stop 5`, then stop.
