# Session Handoff — 2026-10-22

Supersedes `SESSION_HANDOFF_2026-10-21b.md`. **Paused mid-gate for a machine reboot** (Matt). D48 (changing a batch) is in its DEV gate: fix cycle 1 is committed but not yet verified.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.16` (UI v23 / API v27). D46–D49 go to prod together after D49. |
| **DEV** | **Claimed for D48** in discussion 80 (msg 96772). Running `4fce188` (API v51, UI v54); QA and Matt's Pixel test have changed its data since the reseed. |
| **develop** | `e7cb13e`…`bce3015` (spec additions) plus the D47 merge `5e0a4ed`. |
| **D48 branch** | `d48-batch-changes`, pushed up to `4fce188` (PR #34, open). **Local is ahead and unpushed:** `f701a9f` (QA report + lead decisions 2), `a0fa314` (fix cycle 1), `64bf783` (fix cycle 1 status). |
| **Local servers** | Stop with the reboot. Restart the API with `cd rockcut_api && mix rockcut.synthetic.setup && mix phx.server` (reseed first: the seed is date-relative) and the UI with `cd rockcut-ui && pnpm dev --port 5174`. |
| **PortableMind** | 4629 (D46) and 4630 (D47) In Review; 4631 (D48) In Progress; 4650 Completed; 4669 and 4670 backlog. |

## D48 so far

- **Spec:** `specs/d46_production_scheduling_spec.md`. D48 covers §3.11, the D48 toolbar changes and Shift-drag in §3.6, the clean/dirty marks in §3.8, and P65–P89, P110, P113–P121.
- **Plan and decisions:**
  - `planning/d48_batch_changes_plan.md`;
  - `prompts/d48_builder_brief.md`;
  - `prompts/d48_lead_decisions_1.md` (v1 signature tag; Task 4 answers);
  - `prompts/d48_lead_decisions_2.md` (fix cycle 1).
- **Local gate at `4fce188`:**
  - ExUnit 1650/0.
  - Full Playwright 510 passed / 1 skipped / 3 failed. G4 and P32 were flakes; the P33 test helper was fixed.
  - Production project 116/116.
- **DEV run 1 at `4fce188`:** **516 passed, 0 failed.**
- **QA** (`stepwise_results/d48_qa_report.md`): 3 must-fix (a transfer before brew day, deleting a split parent loses its parts with no Undo, a transfer into the same tank) and 9 minor.
- **Matt on the Pixel:**
  - P87 long-press selection works;
  - **touch auto-scroll doesn't scroll down** (fixed in `a0fa314`; recheck it).
- **Fix cycle 1** (`a0fa314`): all items fixed with tests. See `prompts/d48_fix_cycle_1_status.md`.
  - **Targeted results:** ExUnit 209/0, Vitest 166, Playwright 65 passed, 3 failed.
  - **The 3 failures:**
    - `d48-toolbar` P120 (Add process click after Escape): not investigated yet.
    - Two in `gantt.spec.ts`: probably the seed going stale when the date rolled over. Reseed and rerun.

## Next steps (in order)

1. **After the reboot:**
   - start herdr;
   - restart the local API (reseed) and UI;
   - start the builder fresh: `/clear`, then "read `docs/current_work/prompts/d48_builder_brief.md` and `d48_fix_cycle_1_status.md`; do 'What's left' step 1".
2. **Builder:** rerun `gantt.spec.ts` after the reseed, and look into the `d48-toolbar` P120 failure. Then rerun the targeted production specs.
3. **Lead:**
   1. run the full ExUnit and the full Playwright suite in a visible tab;
   2. push the branch;
   3. deploy the new SHA to DEV from a clean worktree and reseed DEV;
   4. run the full DEV suite.
4. **QA recheck** with a **fresh** QA agent:
   - The old one was closed for memory. Its folder is `~/src/rockcut-d48-qa`, with `BRIEF.md` and `D48_QA_REPORT.md`.
   - Write `RECHECK.md` listing the fixes, and copy fresh DEV auth files from `rockcut-ui/tests/.playwright-auth/` after the DEV run's setup.
   - Start it with the same `--disallowedTools` as before, adding `rockcut-d47-qa`.
5. **Matt rechecks touch auto-scroll down on the Pixel.**
6. **Close out:** post the verdict on PR #34, merge `--no-ff` into `develop`, redeploy `develop` to DEV and reseed, post "DEV: free" in discussion 80, write the D48 completion record and update CLAUDE.md. Then D49.

## Gotchas from this session

- **Memory is the bottleneck** (about 1.1–1.4 GB free with two Claude sessions running):
  - stop the local API and UI during DEV runs;
  - run the DEV suite and the QA agent one after the other;
  - use one browser per agent.

  The Claude Code reaper killed one background watcher.
- **Watching agents:** loop on `herdr agent list` `state_change_seq` (idle/done **and** seq > the value at prompt time). Don't use `herdr agent wait`.
- **The vite dev server** at times runs outside the servers tab; find it with `ss -ltnp | grep 5174`.
- **Read DEV state** with `fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api rpc '…'"` (the live node; read-only). `eval` starts a separate node.
- **Rick (discussion 80):**
  - questions on signatures, answered (msgs 96768, 96771);
  - his Bryntum links → task 4670 and the D47/D48 items.
- **New D48 scope added by Matt during the gate:**
  - the toolbar items (P118–P121);
  - Mark clean/dirty (P114–P117);
  - the version tag (`v1|`).
