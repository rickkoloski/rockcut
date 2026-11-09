# D55: builder brief

2026-11-08 · lead → builder.

**Read first:** the spec `docs/current_work/specs/d55_tablets_and_tidy_spec.md` (all of it), the plan
`docs/current_work/planning/d55_tablets_and_tidy_plan.md` (your work order), and
`docs/process/three_environment_workflow.md` §3.

## Where you work

- **Worktree:** `~/src/rockcut-d55`, branch `d55-tablets-and-tidy`. Work only here. Another builder is
  on D53 in `~/src/rockcut-d53p2`; don't touch it, or `~/src/rockcut`.
- First: `cd rockcut_api && mix deps.get && mix ecto.setup && mix rockcut.synthetic.setup`, and
  `cd ../rockcut-ui && pnpm install --frozen-lockfile`. The env files are copied in.
- **No servers and no Playwright runs.** The local servers on :4002/:5174 belong to D53; don't start,
  stop or point anything at them. Write Playwright specs, but don't run them. ExUnit, `mix compile`,
  `tsc`, `vite build`, lint and vitest are fine any time.
- Commit after each stage or meaningful step (`feat:`/`fix:`/`test:`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Don't push. Format only files you
  change; never repo-wide `mix format`.
- `git stash` is blocked; use a temporary commit or `git diff > /tmp/… && git apply -R`.

## Rules

- **Authorization only through `Authz`.** D31's boundary test fails the build otherwise.
- Existing tests may change shape, not meaning. List anything you delete or weaken, with why.
- **Persist-verify every write** in tests (act, reload, check).
- Each fix gets a test that fails with the fix reverted; say which in the status.
- If the spec is wrong once you're in the code, stop and ask rather than redesign.

## Stop points

The plan marks two (■). At each one: write or append `docs/current_work/prompts/d55_builder_status.md`
with, per stage, what changed, files, tests added or changed, and `LEAD:` questions. Commit it with a
message containing `stop <n>` (for example `stop 1`), then stop.
