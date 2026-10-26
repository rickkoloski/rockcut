# Session Handoff: 2026-10-26

Supersedes `SESSION_HANDOFF_2026-10-22b.md`. **Paused for a reboot** (Matt). The Linux VM was out of memory (about 600 MB available, with our processes using only about 1.7 GB). D48 is waiting on **one targeted QA recheck** before close-out.

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.10.22`, the DST hotfix (UI v24 / API v27). Matt verified it. The hotfix note is posted in discussion 80 (msg 96934). |
| **DEV** | Claimed for D48. Runs **`bb38b29`** (API v56 / UI v59) with migration `20261022140001` applied. Seeded on **Oct 24**, so **reseed before use**: the seed is date-relative. |
| **develop** | `34454da` (the hotfix merged in). |
| **D48 branch** | `d48-batch-changes`, PR #34. **Pushed up to `bb38b29`**; this handoff is the only local commit on top. |
| **Local** | Servers stopped. The builder is idle in the build tab, cleared between tasks. QA agent `qa48r5` was closed (it hit the weekly usage limit on Oct 24 while reading its brief and did no testing). |

## D48 since the 22b handoff

- **Fix cycle 2 → QA recheck 2:** R1 (must-fix: Undo not stale-checked) and R2–R4.
- **Fix cycle 3** (`7139bb0`):
  - every vessel Undo is stale-checked, and its result checked against the N1 rule;
  - one shared hook clears refusals (`useRefusal`);
  - split refusals name the part;
  - **R4 is allowed and flagged** (`transfer_order`, Matt).
- **QA recheck 3:** X1/X2 must-fix (Undo of Undo split; split tank pickers).
- **Fix cycle 4** (`e30b788`, `1625302`):
  - the **tree rule** across a split's parent and parts;
  - the stored `split_stays` / `split_links` (migration `20261022140001`);
  - exact Undo split;
  - **tanks locked while split** (Matt): the parent's tanks and the staying part's first tank.
- **Final QA pass (recheck 4):** Y1/Y2 must-fix, Y3 minor.
- **Fix cycle 5** (`4caa431`, `bb38b29`; decisions in `prompts/d48_lead_decisions_6.md` with Matt's answers):
  - **Y1:** a split batch moves as one tree (Move all and moving the Split take the parts with them; a done part step blocks the move; Move only flags out-of-order parts);
  - **Y2:** no Split, Transfer/Filter or Package (full or partial) check-off before brew day, and brew day can't be un-checked while an exit is done;
  - **Y3:** Brand and Template locked while split;
  - the heading "Galactic P5 and its 2 parts · Brew day moved 7 days later".
- **Seed guard** (`757b5e9`): a production spec that changes seed data fails by name. The run 5 "culprit" was Matt editing DEV by hand during the run.
- **Gates at `bb38b29`:**
  - local ExUnit **1709/0**;
  - local Playwright **531 passed / 1 skipped**, with one board flake that passes on its own;
  - **DEV run 8: 531 passed**, production in full; 2 board flakes (S26 passes on its own; task 4706).

## Close-out rule (Matt, `d48_lead_decisions_5.md`)

The last QA pass is **targeted** (`~/src/rockcut-d48-qa/RECHECK5.md`): Y1–Y3, moving split batches and check-off order. **Only minors → D48 closes**, and the minors go to D49. A must-fix blocks the close.

## Next steps (in order)

1. **After the reboot:**
   - start herdr;
   - check the lead's permission mode (see `~/.config/herdr/rockcut-workflow.md` §1);
   - check that the builder still has its `--disallowedTools`;
   - check memory (`free -m`): aim for at least 1.5 GB available.
2. **Reseed DEV:** `fly ssh console -a rockcut-api-dev -C "/app/bin/rockcut_api eval 'RockcutApi.Release.seed_synthetic()'"`. Check for 0 `[TEST-TEMP]` brands and tanks.
3. **Fresh DEV auth files:** run `cd rockcut-ui && E2E_TARGET=dev npx playwright test --project=setup`, then copy `tests/.playwright-auth/*.json` to `~/src/rockcut-d48-qa/auth/`.
4. **Start a fresh QA agent** (`qa48r5`) in its own tab, in `~/src/rockcut-d48-qa`:
   - use the same `--disallowedTools` as before (fly, flyctl, gh, git; no Read of `~/src/rockcut/**`, `~/src/rockcut-d48-deploy/**` or `~/src/rockcut-d4[0-7]-qa/**`);
   - prompt it to read BRIEF.md, D48_QA_RECHECK4.md and RECHECK5.md and write D48_QA_RECHECK5.md;
   - the build is `bb38b29`.
   - **Watch it** with the `state_change_seq` loop, and check for the report file.
5. **If it finds only minors**, close out with Matt's OK:
   - copy the report to `stepwise_results/`;
   - post the verdict on PR #34;
   - merge `--no-ff` into `develop`, redeploy `develop` to DEV and reseed;
   - post "DEV: free" in discussion 80;
   - write `stepwise_results/d48_..._COMPLETE.md`, and update CLAUDE.md (D48 row; next deliverable D49);
   - remove `~/src/rockcut-d48-deploy`.

   Then **D49**.
6. **If there's a must-fix:** fix cycle 6, the same loop as before.

## D49 scope added this session (spec `specs/d46_production_scheduling_spec.md`)

- **§3.12a Clean not sanitized:**
  - the tank ⋯ dialog's **Mark…** is a vertical list (mockup B, https://claude.ai/artifact/V8DLwX5dfcYZ19h6iZ198V) of Clean & sanitized, Clean not sanitized and Dirty;
  - the status reads "Clean no sani N days" (amber), with a soft flag on the next fill;
  - the CIP variants are **CIP & Sanitize / CIP - no sani / Sanitize**;
  - nothing expires on its own.
  - Scenarios P122–P129.
- **§3.12b Pencilled batches:**
  - **X1, X2…** numbers, drawn faded in any row;
  - no board tasks until **Schedule this batch**;
  - muted flags; brew day needs scheduling first.
  - No dateless "ideas" stage, and no recipe link (Matt: ordering comes later).
  - Scenarios P130–P135.
- **Check during D49 planning** whether D49 needs splitting.

## Other items from this session

- **D44** scope: item 0 is splitting `Schedule.tsx` into `ViewSchedule.tsx` / `Scheduler.tsx` (Matt).
- **Task 4707:** View Schedule loses its today + 6 range after the Scheduler. Interim fix: a `key` per route.
- **Task 4706:** the dark "✓ name" flake, likely caused by specs changing owner's theme on the server in parallel.
- **Bryntum comparison** posted for Rick in discussion 80 (msg 97423). The Gantt mockup is https://claude.ai/artifact/SU9STudcjNJZKf13hGQ3z8.

## Gotchas

- **Check a deploy's exit code before starting anything that depends on it.** On Oct 24 the DEV UI deploy failed once (a one-off Fly error), and a DEV run was started against the old UI.
- **Don't `pkill -f` a pattern that appears in your own command line:** it kills that shell too.
- **Builders and QA agents can show "done" while still waiting on their own background run.** Wait for the commit or the report file.
- **Matt:** don't edit DEV seed data while a suite or QA runs. Use your own `[TEST-TEMP]` data.
- **Memory:** the Chromebook can take memory back from the Linux VM. Close Chrome tabs before long runs, and run one agent plus one browser at a time.
