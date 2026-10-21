# D47 lead decisions 1 (after Task 0, `fffa02d`)

1. **The Transfer's CIP follows its day.** When a Transfer/Filter's day changes in the template editor, the CIP & Sanitize it set up (same tank it leaves, same day before the edit) moves to the new day in the same transaction, earlier or later. A CIP the brewer moved to another day on their own stays where it is. Add an ExUnit case and include it in the Task 0 Playwright spec. Small follow-up commit on top of `fffa02d`.
2. **Task 4650** lives in PortableMind, not the repo; working from the plan and the QA recheck was right.
3. **`tests/COVERAGE.md`** waits for Task 5.
4. The two pre-existing `tsconfig.e2e.json` errors (task-board-phone, beer-board-import) are not yours. Leave them; I'll note them in the D47 record.
