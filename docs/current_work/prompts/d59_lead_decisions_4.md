# D59 lead decisions 4: DEV fix cycle 2

2026-11-11 · lead → builder. Recheck at `f6c904f`: full DEV Playwright 714/714; QA recheck
**fail** on one narrow must-fix (`docs/current_work/stepwise_results/d59_dev_qa_recheck_report.md`).

1. **Gap 9 (must-fix):** in the membership path (`resolve_entry` / `apply_memberships`, user create
   and update), check **permission before role**. A non-owner whose request names an
   `owners_only` department (any role) gets the neutral 403 "You can't assign roles in that
   department", and nothing is applied. Owners asking for `manager` there still get 422 "Owners has
   no managers". Keep `Membership.changeset`'s guard. Tests: `breweryMgr` and `dualMgr` asking for
   Owners as manager (alone, mixed, and on create) → 403 with the neutral text, nothing changed;
   `owner` → 422. Revert-and-rerun check, as before.
2. **Gap 8:** no change (403 vs 404 is the same for every department's board).
3. **Gap 10:** no change in D59. The lead files it as a backlog task (it predates D59).

Gate: `mix test` twice, warnings-as-errors, the `owners` Playwright project once, one commit, short
report. Only `mix format` the files you change.
