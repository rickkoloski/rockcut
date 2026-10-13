# Session Handoff — 2026-10-12

Follows `SESSION_HANDOFF_2026-10-11b.md` (D38 steps 1–8).

This session finished D38 steps 9–10, opened **PR #18**, and ran the **DEV
gate** through two passes. D38 is close to passing it. Matt is travelling;
the machine may have slept, so check the servers and herdr panes first.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.07` (D37), API v25 / UI v20. |
| **DEV** | **Claimed for D38** in conv 80 (msg 88464, then 88466 "DEV: deploying `fcaba29` …"). Runs `fcaba29`: API v30 / UI v27. Rollback / `develop` targets: API v28 / UI v25. Reset with `reset_synthetic()` after QA pass 2. |
| **Repo** | Branch `d38-brewery-task-board`, local head `c6c3c76`; `origin` is at `584cb34` (docs commits after it aren't pushed). **Uncommitted:** the builder's Task 11 change to `rockcut-ui/tests/regression/brewery/taskBoardHelpers.ts`. |
| **PR** | #18 → `develop`, body = `docs/current_work/prompts/d38_handoff_note.md` (as of the first push; update it with `gh api -X PATCH repos/rickkoloski/rockcut/pulls/18 -F body=@file`, since `gh pr edit` fails on this repo). |
| **Backlog** | D38 = 4211, D39 = 4212, D40 = 4213. New: **4231** (create-user response returns the temp password), **4232** (Publish Week has no confirm), **4233** (`source-map-js` advisory via postcss). **D41 = department task boards** (proposed, not filed yet). |
| **herdr** | `lead` w1:t9, `build` w1:t3 (`builder` w1:p5), `ops` w1:t2. QA and run tabs closed. |

## Done this session

1. **Step 9 (phone width)** `57b7906`. Pixel checks (S9e, S15) moved to the
   DEV gate (Matt); the checklist is in the plan's LIMITATIONS and the
   handoff note.
2. **Step 10** (`2fdb7f2`, `3e4ccd2`): COVERAGE.md, local gate, handoff
   note. The step 7 mystery ExUnit failure was found: the D33 pairing
   limiter tests filled a 10-minute window (test-only fix `2fdb7f2`).
3. **Department boards decided** (Matt): one board per department, each task
   in exactly one department, built as its own deliverable **after D39 and
   before D40** (`6c9e317`, spec "Delivery split").
4. **PR #18** opened; DEV claimed; deployed `6c9e317` (API v29 / UI v26).
   DEV Playwright run 1: **259/259**. QA pass 1 (fresh agent,
   `~/src/rockcut-d38-qa/`): PASS with gaps, no must-fix
   (`stepwise_results/d38_dev_qa_report.md`).
5. Matt's decisions on QA pass 1: fix G1 (stale Edit dialog undid others'
   edits), G3 (un-retire silent 200), G4 (past Daily cards showed later
   items); G2 = spec wording (first name); un-retire **moved to D39**.
6. **DEV pass 1 fixes** (Task 10): `2e4b24f` G4, `8decf0c` G1, `593a088` G3,
   `fcaba29` docs. Revert check done for each. Local gate green (ExUnit
   1,122/0; brewery folder 102 ×2).
7. Redeployed `fcaba29` (API v30 / UI v27). DEV Playwright run 2: **261
   passed, 1 failed**: S23e (`task-board-future.spec.ts:78`), a drag landing
   at the end of Future. Passed 5/5 alone on DEV, so a test flake in the
   `mouseDrag` helper.
8. QA pass 2 (fresh agent, `~/src/rockcut-d38-qa2/`): G1, G3, G4 verified;
   PASS with 2 minor API gaps + 3 observations
   (`stepwise_results/d38_dev_qa2_report.md`). **Matt: all moved to D39**
   (`c6c3c76`, spec §5).
9. **Builder Task 11** (in progress at handoff): make `mouseDrag` wait for
   the drop spot before releasing. Test-only.

## Next

1. **After a sleep:** check the local API (:4002) and UI (:5174) and restart
   them in the lead tab if needed (`rockcut-local-dev-native` memory). Check
   the builder pane (`herdr agent list`).
2. **Finish Task 11:** read the builder's reply (newest jsonl in
   `~/.claude/projects/-home-matthewheiser-src-rockcut/`). If it didn't
   commit (interrupted run or lost connection), ask it to rerun the brewery
   folder twice and commit `test: D38 drag helper waits for the drop spot`.
   Review the diff.
3. **Already done:** Task 11 committed (`d0831e7`, test-only) and **pushed**.
   A DEV run 3 was started early by mistake and **stopped** after about 113
   tests (Matt wanted DEV left alone until he's back online); DEV was
   reseeded after. **Wait for Matt's "continue"**, then run **DEV Playwright
   run 3** against the deployed `fcaba29`.
   It's a test-only change, so no redeploy is needed. Reseed with
   `reset_synthetic()` before and after. Run it in its own herdr tab.
4. If green, the **DEV gate verdict** goes in the PR (SHA tested, run
   counts, QA passes, gaps → D39), and is shown to Matt. Still open for
   Matt:
   - the **Pixel checks** (7 items, plan LIMITATIONS);
   - **S51 after 6 pm Colorado** (server "today" on the UTC box, before
     the merge).
5. With Matt's OK: **merge PR #18 with `--no-ff`** to `develop`, then:
   - redeploy `develop` HEAD to DEV;
   - post "DEV: free, `develop` restored (…)" in conv 80 (msg 87172 is
     the template);
   - file the Scheduler drag follow-up task;
   - file D41 (department boards);
   - write `d38_…_COMPLETE.md`;
   - update CLAUDE.md.

   **No prod release.** D38–D40 ship together after D40.
6. Then plan **D39**: recurring tasks, plus un-retire and the QA pass 2
   follow-ups.

## Gotchas (new this session)

- **A drag spec landing "at the end"** means the helper released before
  `@dnd-kit` moved the placeholder. It's a test issue, not the app.
- **The synthetic seed backdates the default Daily items two weeks.** That's
  why yesterday can still be ticked on DEV after the G4 fix. Items added by
  hand are dated when added.
- **QA agents:** start them with `herdr agent start <name> … --disallowedTools
  "Bash(git:*)" "Bash(gh:*)" "Bash(fly:*)" "Bash(flyctl:*)"
  "Read(//home/matthewheiser/src/rockcut/**)" …`. Give them a folder outside
  the repo with `auth/` copied from `tests/.playwright-auth/` after
  `E2E_TARGET=dev npx playwright test --project=setup`.
- **A builder `rm -rf *` after `cd`** trips Claude Code's dangerous-command
  prompt, which auto-denies after 2 minutes. Let it deny.
