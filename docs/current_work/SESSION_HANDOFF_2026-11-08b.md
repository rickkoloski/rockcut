# Session Handoff: 2026-11-08 (b)

Supersedes `SESSION_HANDOFF_2026-11-08.md`. **D53 is on prod as `v2026.11.08` and closed out. D55 is
mid-build.** Matt is rebooting and updating Claude Code; the next session starts fresh.

## FIRST: remind Matt (morning of 2026-11-09)

**Task 5164:** his prod sign-in and the three tablet checks, now covering D54 and D53: on each
tablet, it updated (idle, prompt or reopen), still paired, tablet view, no "Sign in as me", a staff
code write works, and Boards open view only (home board + Company). It gates D55's removal of
`leftoverTabletSession.ts` (commit `35c6c7b`, kept separate so it can be dropped).

## State

| | |
|---|---|
| **Prod** | `v2026.11.08` (D53, release PR #55 squash `4e469ef`): API v34 / UI v30. Rollback API v33 / UI v29, snapshot `vs_Byb8e0vN5JnMhenvv030ekG9`. Record: `stepwise_results/d53_idea_boards_COMPLETE.md`. |
| **DEV** | **Free** (conv 80). Runs `f9a3a1e` (API v74 / UI v77) = `develop`'s app code; reseeded. |
| **develop** | `d90b973` + the close-out PR (main `-s ours` sync + these docs), so the next release PR is conflict-free. |
| **D55** | Branch `d55-tablets-and-tidy` (pushed), worktree `~/src/rockcut-d55`, from `8e434ce` (before Part 2). Spec approved; plan `planning/d55_tablets_and_tidy_plan.md`; brief `prompts/d55_builder_brief.md`; decisions 1–2; status `prompts/d55_builder_status.md` (stops 1 and 2 done). |

## D55: what's left, in order

1. **Merge `develop` into the D55 branch** (now has D53). Expected conflicts: `App.tsx` (D55 moved
   person routes into `personRoutes`; D53 added `/boards` routes: they belong in **both** the person
   and the tablet routes), `router.ex`. Then turn the `test.fixme` in
   `tests/regression/devices/unknown_url.spec.ts` (Boards on a tablet) into a real test.
2. **§2.11 + T13** (added after stop 2): out-of-range ids → 404/422 app-wide (13 routes sampled 500),
   reusing D53's `RockcutApi.Ids`; a route-table sweep test. Plus recheck gap 10: a History
   `task_id`/`card_id` that isn't a usable id must not drop the filter; a huge `page` → empty page.
3. Non-Playwright gate, then **local servers from `~/src/rockcut-d55`** (stop the D53 ones in the
   api/ui panes first) and the full local Playwright (D55's T1–T13 specs have never run).
4. DEV gate: claim conv 80, snapshot, deploy, reseed, full suite, QA (brief to write; T1–T3 on the
   Pixel if Matt has time), verdict, then release. Rollback past D55 needs the snapshot (columns dropped).

## Builder setup after the reboot

herdr agents don't survive a reboot. Start a new builder in a tab with cwd `~/src/rockcut-d55`, same
`--disallowedTools` as before (no push/merge/rebase/checkout/stash/fly/gh; while servers are D53's, also
no servers or Playwright; drop those two blocks once the lead hands D55 the servers). Write
`prompts/d55_lead_decisions_3.md` for items 1–2 above and prompt it to read the brief, the status file
and decisions 1–3. **Merging `develop` is a lead step** (the builder can't merge): do it in the
worktree yourself, resolve, commit, then hand over.

## Worktrees and folders

- `~/src/rockcut-d55`: active. `~/src/rockcut-d53p2-qa`: QA scripts and reports (D53 Part 2; keep as a
  model for D55's brief, incl. `BRIEF2.md`'s no-temporary-passwords rule).
- Can be removed: `~/src/rockcut-d53`, `~/src/rockcut-d53p2`, `~/src/rockcut-d53p2-deploy`,
  `~/src/rockcut-release-20261108`, `~/src/rockcut-d53p1-qa`.
- QA progress panel: `/tmp/claude-501/pwlogs/qawatch.sh <log>` (in `/tmp`, may not survive a reboot;
  it reads `[n/N] X# START|PASS|FAIL|PARTIAL`, `GAP k severity X# …`, `DONE …` lines).

## Backlog touched today

New: 5202 (repeat twin, D39 behaviour kept). D55 covers 5120, 5119, 4985, 4983, 4981, 4993, 5165, 4963,
the rename to "Rock Cut Brewing" and §2.10–§2.11. Still open: 5193, 4991–4994, 4984, 4982/4986/4987/4989
(brewing bundle), 4950, 4319, 4990, 4670, 4934 (D50), 4055/4056.
