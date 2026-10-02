# D33 builder brief

**For:** the `d33` builder agent (Claude Code, Herdr pane `w3:p1`), working in the
worktree `~/src/rockcut-d33` on branch `d33-taproom-device-access`.
**From:** the lead agent (Herdr pane `w1:p1`), which talks with Matt and Rick.
**Date:** 2026-09-30

## Your role

You build D33 and get it through the **local gate**. You don't do DEV or prod.

- **The lead owns:** talking with Matt and Rick, plan approval, pushing, PRs, the DEV
  claim and deploy, and choosing reviewers and the independent pass.
- **You own:**
  - the plan draft;
  - the code and tests;
  - the local gate evidence;
  - the PR handoff note text (as a file, not a PR).
- **Never:**
  - `git push`, `gh pr …`, `fly …`, or merging, rebasing or deleting branches;
  - touching `~/src/rockcut` (the main checkout);
  - a repo-wide `mix format` or `mix precommit`.

  Some of these are blocked at the tool level. If you think you need one, stop and say so.
- **Commits:** commit locally on this branch at sensible checkpoints.
  - Format: `feat: implement D33 …` / `test: …` / `fix: …`.
  - End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Read first

1. `CLAUDE.md`
2. `docs/process/three_environment_workflow.md` (§3 is your gate)
3. `docs/current_work/specs/d33_taproom_device_access_spec.md` (**approved**; Q1 = 5 min)
4. `docs/process/test-credentials-policy.md` and `rockcut-ui/tests/RUNNING.md`
5. The D32 plan (`docs/current_work/planning/d32_schedule_events_plan.md`), as the plan format to copy
6. `docs/current_work/SESSION_HANDOFF_2026-09-30.md`, the Gotchas section

## Phase 1: plan (do this now, then STOP)

- Write `docs/current_work/planning/d33_taproom_device_access_plan.md`:
  - phases, files touched, migrations, test list per spec requirement;
  - how each persona scenario S1–S14 is covered (ExUnit / Playwright / manual);
  - risks.
- Read the code before you plan. Things to check in particular:
  - `Authz` and its first-clause ordering, and `authz_boundary_test.exs`;
  - the D31 parity suite, which is **frozen**, so don't edit it;
  - `AuthPlug`;
  - the router pipelines;
  - `Accounts.list_roster`, `list_users_for`, `Messaging.recipients` and `active_users_query`;
  - the D30 synthetic seed (`Release`, `mix rockcut.synthetic.*`);
  - the UI auth and token storage, and the channel routes (backlog 3939).
- List any spec ambiguity as **questions for the lead**. Don't decide product
  questions yourself.
- Commit the plan, then **stop and report**: a short summary, the open questions,
  and the plan's path. Wait for the lead's go before writing any code.

## Phase 2: build (only after the lead says go)

Follow the approved plan. The local gate (workflow §3) is:

- `cd rockcut_api && MIX_ENV=test mix test`: all green. It's 685 today; report the new count.
- `cd rockcut-ui && npx tsc --noEmit -p tsconfig.app.json && pnpm exec vite build && pnpm lint`.
  - Known waived failures: `tsc` has 3 and lint has 27. **Don't add new ones.** Report before and after counts.
- `cd rockcut-ui && npx playwright test`. It was 53 passed and 1 skipped; add the D33 specs.
- **3939 is a bug fix:** revert-and-rerun, meaning the new spec fails with the fix reverted
  and passes with it restored. Record both runs.
- **Persist-verify every write:** act, reload, assert.

## Environment gotchas

- **Local servers:** the lead runs them in this worktree's `servers` tab.
  - The API runs in pane `w3:p2` (`mix phx.server`, :4002) and the UI in pane `w3:p3` (`pnpm dev`, :5174).
  - Ports are hardcoded (vite proxy, `tests/config/e2e-targets.json`), so only one local stack can run on this machine.
  - If you need them started or restarted, ask the lead. Don't start a second stack.
- **Separate database:** this worktree has its own SQLite dev DB (`rockcut_api/rockcut_api_dev.db`,
  copied from main with the D32 migrations) and its own test DB.
- **Synthetic personas locally:** use `mix rockcut.synthetic.setup`. Log in by **token**,
  never by typing a password: `mix rockcut.synthetic.token <persona>`, then
  `localStorage.setItem('rockcut_token', …)`. Don't read the `.env.synthetic` or
  `.playwright-auth/*.json` contents.
- **Formatting:** format **only the files you touched** (`mix format path/to/file.ex`).
  A repo-wide format reformats the whole legacy tree.
- **Selectors:** production builds strip MUI icon `data-testid`s. Use aria-labels and roles in specs.
- **Parallel Playwright specs:**
  - each test uses its own week (`weekMonday(n)`) and a unique `tempTag()`;
  - it cleans up only its own `[TEST-TEMP]` data.
- **Migrations** run at boot via `Ecto.Migrator` in `application.ex` (search `Migrator`, not "migrate").
- **Single DB connection:** the Repo defaults to one connection now (D32 G1). Series-style
  multi-row writes use `BEGIN IMMEDIATE`.
- **Deliverable numbering:** the spec says taproom components are "D34+". D34 may instead
  go to a security hotfix. Don't renumber anything; just write "later deliverables".
