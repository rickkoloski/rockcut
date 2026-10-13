# Session Handoff — 2026-10-13

Follows `SESSION_HANDOFF_2026-10-12b.md` (D38 close-out), which this
supersedes.

**D39 is done:** it passed the DEV gate and is merged to `develop`. The next
deliverable is **D41 (department task boards)**, then **D42**, then D40.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.07` (D37), API v25 / UI v20. D38 and D39 are **not** on prod. D38, D39, D41, D42 and D40 ship in one release after D40. |
| **DEV** | **Free** (conv 80, msg 89298). Runs `08dd32e`, API v34 / UI v31: the same app code as `develop`, so not redeployed after the merge. Reseeded. (v33 is a failed release record: Fly answered "unauthorized" mid-rollout; v34 is the same image.) |
| **Repo** | `develop` at the D39 merge `ddaaa68` plus the close-out commit. PR #19 merged; branch `d39-brewery-recurring-tasks` can be deleted. |
| **Backlog** | D41 = 4237, **D42 = 4260** (new), D40 = 4213. New: **4261** (check D32 events for D39's split gap). 4212 (D39) and 4211 (D38) stay open until the prod release. |
| **herdr** | `builder` (w1:p5) idle; `qa3` (QA agent) stopped. |

## Done this session

1. D39 built (Tasks 1–13), local gate green (`6f73e31`).
2. DEV gate: pass 1 `914aa21` 293/293 → QA G1 (must-fix) + G2 → fixed;
   pass 2 `ef48d87` 290/294 (tests assumed DEV held only test data;
   hardened in `f363754`) → QA recheck 1 found R1 (must-fix) → fixed;
   pass 3 `08dd32e` **295/295**, QA recheck 2 PASS. Matt's Pixel 7/7.
3. Gate verdict on PR #19, merged `--no-ff` (`ddaaa68`), "DEV: free".
4. Close-out: `stepwise_results/d39_brewery_recurring_tasks_COMPLETE.md`,
   CLAUDE.md, spec "Delivery split" (D42), tasks 4260 and 4261.

## Next: D41

Read `docs/process/three_environment_workflow.md`, then write the D41 spec
amendment (task 4237 lists the open questions: which departments, nav,
access, Daily cards/recurring for all, D40 device access) with Matt before
planning.

**When D42 starts, remind Matt he asked for other changes to be included
in it, and ask what they are.**

## Gotchas (new)

- **Fly "unauthorized" mid-deploy** can leave a failed release record
  while the machine has already taken the new image. Check `fly machines
  list` (image) and `schema_migrations`, `fly agent restart`, then
  `fly deploy --image <the built ref>` for a clean record.
- **Shared DEV data breaks fragile tests.** Matt's own test tasks (not
  `[SEED]`/`[TEST-TEMP]`) survive a reseed. The brewery specs now tolerate
  foreign cards; ask before deleting anything that isn't tagged.
- **Each D39-style migration on the branch** needs `mix ecto.migrate` on
  the local dev DB, or the local API answers 503.
