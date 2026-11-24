# D64 lead decisions 9: local QA pass 4 (pass with gaps, 2026-11-23)

Report: `stepwise_results/d64_local_qa_recheck3_report.md`. Gaps 22–24 are confirmed fixed.

- **25:** Edit or Delete of a count that's gone reads "Someone else deleted this count." instead of "Not found", and
  closing the dialog refreshes History. Check the other brink dialogs for the same bare "Not found"
  on a removed entry or brink, and give each one a sentence.
- **26:** no change. It's the app's usual conflict message; History behind the dialog has the values.

Tests (Playwright, two sessions), COVERAGE row, vitest, tsc, build, lint 8, the touched spec file; ExUnit once
if the API changes. Commit by path, reply. I run the full suite next.
