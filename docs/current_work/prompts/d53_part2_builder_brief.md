# D53 Part 2: builder brief

2026-11-08 · lead → builder.

**Read first:**
- The spec, `docs/current_work/specs/d53_idea_boards_spec.md`: all of §2 and §4, and §5 S223–S243 and
  S255–S261. Part 1 (§3) is already merged.
- The plan, `docs/current_work/planning/d53_part2_idea_boards_plan.md`. Its stages are your work order.
- `docs/process/three_environment_workflow.md` §3.
- For the §4.8 stage, the QA reports `docs/current_work/stepwise_results/d53_part1_dev_qa*.md`.

## Where you work

- **Worktree:** `~/src/rockcut-d53p2`, branch `d53-part2-idea-boards`. Work only here. The Part 1
  worktree `~/src/rockcut-d53` is finished; don't touch it.
- First: `cd rockcut_api && mix deps.get && mix ecto.setup && mix rockcut.synthetic.setup`, and
  `cd ../rockcut-ui && pnpm install --frozen-lockfile`. The env files are copied in.
- **Servers and Playwright:** ask the lead (`LEAD:` in your status file, then stop). ExUnit, `tsc`,
  `vite build`, lint and vitest are fine any time.
- Commit after each stage or meaningful step (`feat:`/`fix:`/`test:`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Don't push. Format only files you
  change; never repo-wide `mix format`.
- `git stash` is blocked; use a temporary commit or `git diff > /tmp/… && git apply -R`.

## Rules

- **Authorization only through `Authz`.** D31's boundary test fails the build otherwise. That
  includes lock checks.
- **Task writes from Send only through `Tasks` / `Tasks.Assignees`,** never a second writer.
- Existing tests may change shape, not meaning. List anything you delete or weaken, with why.
- **Persist-verify every write** in tests (act, reload, check).
- If the plan or spec is wrong once you're in the code, stop and ask rather than redesign. The spec's
  §4 is Matt's decisions.

## Stop points

The plan marks five (■). At each one: write or append
`docs/current_work/prompts/d53_part2_builder_status.md` with, per stage, what changed, files, tests
added or changed, and `LEAD:` questions. Commit it with a message containing `stop <n>` (for example
`stop 1`), then stop.
