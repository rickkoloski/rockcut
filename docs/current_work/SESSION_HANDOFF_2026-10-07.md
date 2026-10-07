# Session Handoff — 2026-10-07

Follows `SESSION_HANDOFF_2026-10-06.md` (D37 local gate passed, not pushed).

This session the lead pushed D37, opened **PR #15**, claimed DEV and ran the DEV gate's
first pass. QA found gaps; the builder fixed them (Task 4), and the local gate is clean
again. Matt is rebooting the machine to free memory. **Next: push the fixes, redeploy
DEV, re-run the DEV gate.** Each step is outward-facing, so ask Matt first.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.05` (D36), API v23 / UI v19. |
| **DEV** | **Claimed for D37** in discussion 80 (msg 86935, "DEV: deploying `0b91066` …"). Runs API v26 (`0b91066`) / UI v23 (`b71174b`). Reset with `reset_synthetic()` after the QA pass: 5 `[SEED]` entries (1 imported by design), codes for `bartender1`, `bartender2`, `barMgr`. Rollback targets: API v25 / UI v21 (a rollback also drops the board tables and codes). |
| **DEV secrets** | `STAFF_CODE_KEY` (new random key, never printed) and `SYNTHETIC_STAFF_CODES` (from `.env.synthetic`) set on `rockcut-api-dev`. Matt put `SYNTHETIC_STAFF_CODES` in the PortableMind secrets file. **Prod `STAFF_CODE_KEY` is still to do** before the release; keep it with the other prod secrets. |
| **Branch / PR** | `d37-buy-a-beer-board`, PR **#15** → `develop`, open. Remote at `b71174b`. Local HEAD is this handoff's commit: **11 commits not pushed** (Task 4 fixes + docs). |
| **Task** | 4083 is **In Progress**. New tasks: **4115** (History export follows search, G6), **4116** (History search matches "who", G7), **4117** (API accepts writes before a required password reset, medium; found by QA, app-wide, pre-D37). |
| **Handoff note** | `docs/current_work/prompts/d37_handoff_note.md` (the PR body). "SHA for DEV" is `<filled by lead at push>` again. It has a "DEV pass 1 fixes" section with the gate results. |
| **QA** | Report: `stepwise_results/d37_dev_qa_report.md` (PASS with gaps: 1 must-fix + 9 minor). QA folder `~/src/rockcut-d37-qa/` (brief, scripts, auth that expires on its own). |
| **Builder** | `w1:p5`, idle after Task 4. It was `/login`ed and `/clear`ed this session. **After the reboot it's gone:** start a fresh one (workflow §1 command) and re-check its limits. |
| **Local servers** | API :4002 and UI :5174 are gone after the reboot; restart them in the lead tab's right panes. Local DB was reseeded after the last run. |

## Done this session (oldest first)

1. Spec fix: two migrations, not three (`50ab6be`).
2. Pushed, filled the SHA (`0b91066`), opened PR #15, task 4083 → In Progress.
3. Claimed DEV; staged both secrets; deployed API v26 + UI v22 from a clean worktree at
   `0b91066`; migrations ran at boot; `reset_synthetic()`.
4. DEV Playwright run 1: 172 passed, 1 failed (D34 G1 "Try now"), 2 did not run.
   Cause: a race **in the test** (the request event reached the test before the route
   handler, so `serverBack` let the retry through). Fixed test-only (`b71174b`), passed
   5/5 local + DEV; UI redeployed (v23); **DEV full run 2: 175/175, no retries.**
5. Independent QA pass (fresh qa agent, new `qa` tab, limits: no git/gh/fly, no Read of
   the checkouts). All 31 scenarios pass functionally. Gaps:
   - **G1 must-fix:** a non-owner manager removing someone from their department gets
     "Forbidden" and the rest of the save is lost. **Predates D37** (D35 `112a715`, on
     prod since `v2026.10.04`).
   - G2 (lockout on the 5th code: spec wording), G3 (code typed in clear in Users &
     Roles), G4 (paste keeps 3 digits), G5 (extra column refuses import), G6/G7
     (backlogged as 4115/4116), G8 ("Added" vs "created": spec wording), G9 (stale
     Redeem dialog after "Only N left").
6. **Matt's decisions:** fix G1, G3, G4, G5 (ignore unknown columns, list them in the
   preview), G9 in D37; spec wording for G2 and G8; G6/G7 to backlog; the `newhire` API
   hole as its own task.
7. Builder brief **Task 4** (`d37_builder_brief.md`); builder committed `27c2979` …
   `63b26b4`. Lead reviewed the diffs (fine) and answered its LEAD questions (mask a
   Suggested code: yes).
8. **Local gate after Task 4:** API 1,003 tests 0 failures; `tsc` + build pass; lint 26
   + 1 (unchanged, waived); Playwright **180 passed, 0 failed, 1 skipped** with
   `--workers=2` (the builder's two default runs had memory-pressure timeouts in older
   specs, each 5/5 alone). Recorded in the handoff note (`2e15967`).

## Next (each needs Matt's OK)

1. **Push** (`git push`; upstream is set). Fill "SHA for DEV" with the pushed HEAD, commit,
   push again (say the note commit follows it).
2. **Post** in discussion 80: "DEV: deploying `<sha>` (D37 DEV pass 1 fixes, PR #15)."
3. **Redeploy both apps** to DEV from a clean worktree at that SHA
   (`git worktree add --detach <scratchpad>/d37-dev <sha>`, then
   `fly deploy -c fly.dev.toml --remote-only` in `rockcut_api`, then `rockcut-ui`). The
   API changed (G5); no migrations, no new secrets. Check `/api/health`, then
   `reset_synthetic()`.
4. **Full DEV Playwright** in a herdr pane, then `reset_synthetic()`.
5. **Focused QA pass** on G1, G3, G4, G5, G9 with a fresh qa agent: a new short brief in a
   new folder (`~/src/rockcut-d37-qa2/`), same rules as the first brief, fresh auth from
   `E2E_TARGET=dev npx playwright test --project=setup`. Then `reset_synthetic()`.
6. If clean: release DEV in discussion 80 (the D36 message 85328 is the template), merge
   PR #15 to `develop`, redeploy `develop` to DEV. Then the release PR (`develop → main`)
   with prod `STAFF_CODE_KEY` staged first.

## Gotchas (new this session)

- **Memory.** The Linux container shows ~1 GB available even though its processes use
  ~1.6 GB: ChromeOS reclaims the rest. The builder's full Playwright runs timed out under
  that pressure; `--workers=2` ran clean. A background watcher was also killed by Claude
  Code for low memory. Close Chrome tabs/Android apps before long runs.
- **Long runs go in a visible herdr pane** (Matt, 2026-10-07): `herdr pane split w1:p1
  --direction right --cwd <dir> --no-focus`, `herdr pane run <pane> "cmd; echo MARK-\$?"`,
  and a background `herdr pane wait-output … --regex "(?m)^MARK-\d+\s*$"`. This machine
  has **no `jq`** (use python3) and **no `unzip`** (python `zipfile` reads Playwright traces).
- **`fly ssh` "Not authorized to access this organization"** while `fly status` worked:
  `fly agent restart` fixed it.
- **GitHub had a major outage** mid-session (pushes returned "Internal Server Error");
  check githubstatus.com before debugging a failed push.
- **`fly ssh … eval` vs `rpc`:** `eval` starts a fresh VM without the Repo; use
  `/app/bin/rockcut_api rpc '…'` to query the running app.
- **QA brief guardrails that worked:** persona staff codes off limits (QA makes
  `[TEST-TEMP]` people with its own codes); S9's lockout only on a `[TEST-TEMP]` tablet;
  Replace allowed, with the lead resetting afterwards.
