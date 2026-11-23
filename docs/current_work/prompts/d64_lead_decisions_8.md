# D64 lead decisions 8: local QA pass 3 (2026-11-23)

Report: `stepwise_results/d64_local_qa_recheck2_report.md`. Gaps 15–21 are confirmed fixed.

- **23 (must-fix).** Counts get a `lock_version`, as products have. Edit and Delete send it; a stale one is
  409, nothing written, and the dialog shows the app's usual conflict message and the current values as the product
  dialog does. An API edit or delete without it is refused the same way. Migration
  `20261122120014`, additive (default as the other tables'). It's approved.
- **24.** Adding, editing and deleting a count all settle the same way, from one function: the Count task
  and Recount due follow from the counts and the record's harvests, including both of QA's directions
  and an edit that changes nothing about the date. A Count task ticked by hand stays ticked unless a
  count edit or delete undoes the count that ticked it. An empty brink still has no task.
- **22.** The batch page's delete question uses the batch's label ("#44.1", or the planned label), never null.
  Check the page's other sentences for the same.
- **16, small:** the closing adjustment's date also takes the record's latest count into account.

**Order:** write the migration and the API with ExUnit first, commit, then stop and reply "migration ready". I run it on
the local database and tell you to go on with the screens and Playwright.

Tests proved by revert (two UI sessions for 23), COVERAGE rows. Final gate as decisions 7. No checkout,
restore, stash. Commit by path.
