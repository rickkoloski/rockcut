# Session Handoff: 2026-10-22 (b)

Supersedes `SESSION_HANDOFF_2026-10-22.md`. D48 fix cycle 2 is done and its local gate is green. **Waiting on Matt** for the push and the DEV deploy. Prod got a DST hotfix overnight.

## Where things are

| | State |
|---|---|
| **Prod** | **`v2026.10.22`**: a DST hotfix on top of `v2026.10.16`. UI v24 / API v27. Matt verified it. Rollback is UI v23 (`deployment-01M52QNWFYNPE7R305T8H928M3`). |
| **DEV** | Claimed for D48. It runs `a207cb1` (API v52 / UI v55), reseeded before run 3. It doesn't have fix cycle 2 or the DST fix yet. |
| **develop** | `34454da`: the hotfix merged in normally on top of `bce3015`. |
| **D48 branch** | `d48-batch-changes`, PR #34. Pushed up to `63d7ecb`. **Local only, not pushed:** `967d927` (fix cycle 2), `9e27051` (addendum) and this handoff. |
| **Local** | API and UI running in the lead tab. The builder is idle in the build tab (`w1:p5`). |

## Overnight (2026-10-22, about 00:15–04:30)

1. **The reseed failed after the reboot:** `cleanup_temp` deleted a temp brand's batches while their split parts still existed (`split_parent_id` is RESTRICT, which SQLite checks row by row). Fixed, with a test, in `a207cb1`.
2. **P120:** the "Weeks on screen" tooltip from fix cycle 1 caught clicks on Add process. Fixed with `disableInteractive` (`a207cb1`).
3. **DST bug, on prod since D11:** `localInputToUtc` read the offset at the wrong instant, so on Nov 1, times typed from 3:00 to 7:59 AM saved an hour early (and on Mar 14, an hour late). Hotfix PR #35 was merge-committed into `main` (`f5cb9c5`), tagged `v2026.10.22` and released UI only. It's merged normally into `develop` and the D48 branch.
4. **The test cleanup leaked split batches:** since M2 refuses deleting a split parent, `Made.cleanup` failed without anyone noticing, and leftover `[TEST-TEMP]` tanks broke position-based tests (P7, P22, minor 3, P2). Cleanup now undoes splits first and fails on any refused delete (`04a757d`).
5. **DEV run 3 at `04a757d`:** 518 passed, 3 failed (two DST tests and one task-board flake). The production project passed in full.
6. **Matt on the Pixel:** touch auto-scroll down **works**.
7. **QA recheck** (fresh agent `qa48r`, `stepwise_results/d48_qa_recheck_report.md`): **all 12 fixed**. New: N1 must-fix (a transfer into the tank the beer goes to next) and N2–N6 minor.
8. **Fix cycle 2** (`prompts/d48_lead_decisions_3.md` and its addendum; status in `prompts/d48_fix_cycle_2_status.md`):
   - every change to a batch's vessels refuses two vessels in a row in the same tank, including the direct pickers, drag and Plan batch;
   - parts: their number and volume, and a `before_split` refusal;
   - Add step, Add a ramp and Change ramp refuse days after the tank's exit;
   - the split dialog clears its refusal when something changes;
   - revert check done (the new tests fail on `63d7ecb`).
9. **Local gate at `9e27051`:** ExUnit **1666/0**, full Playwright **523 passed / 0 failed / 1 skipped**.

## Next steps (in order)

1. **Ask Matt** (the reminder is in memory): may I post a note about the `v2026.10.22` hotfix in discussion 80 for Rick?
2. **Matt's go on the DEV step:** push `d48-batch-changes`, deploy `9e27051` to DEV from a clean worktree, reseed it, then run the full DEV suite (stop the local servers first).
3. **QA recheck 2** with a fresh agent: write `RECHECK2.md` in `~/src/rockcut-d48-qa` covering N1–N6 and the addendum, and copy fresh DEV auth files there. Its `--disallowedTools` list is this session's (it includes `rockcut-d48-deploy`).
4. **Close out:** post the verdict on PR #34, merge `--no-ff` into `develop`, redeploy `develop` to DEV and reseed, post "DEV: free", write the D48 completion record and update CLAUDE.md. Then D49.

## For Matt to look at

- **Lead decisions made overnight, without Matt:**
  - N1 became one general rule (no two consecutive vessels in one tank, on every change).
  - The direct pickers and drags are refused too.
  - Swapping two vessels' tanks takes three saves through Unassigned. There's no multi-vessel save; say if you want one.
- **Backlog to file:** the task-board-ui "✓ name readable (dark)" test flakes under load (it failed in DEV runs 2 and 3 and passes on its own).

## Gotchas

- **A builder or QA agent showing "done" may still be waiting on its own background run or Monitor.** Watch for the commit or report file, not just its state.
- **`herdr pane wait-output` matches old scrollback:** after `clear`, confirm with a fresh read or with `ss`.
- **Vitest with `--root /` scans the whole disk and runs out of memory.** For one-off checks, bundle with `node_modules/.bin/esbuild` and run with node (Node 20 has no strip-types).
- **The DEV reseed is `RockcutApi.Release.seed_synthetic()`.** It worked, with 0 temp brands or tanks left.
