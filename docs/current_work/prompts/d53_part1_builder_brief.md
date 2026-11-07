# D53 Part 1: builder brief

2026-11-06 · lead → builder.

**Read first:** `docs/current_work/specs/d53_idea_boards_spec.md` §1, §2, §3 and
S216–S222 (Part 2 isn't your job), the plan
`docs/current_work/planning/d53_part1_multi_assignees_plan.md` (your work order),
then `docs/process/three_environment_workflow.md` §3.

## Where you work

- **Worktree:** `~/src/rockcut-d53`, branch `d53-part1-multi-assignees`. Work only here.
- First: `cd rockcut_api && mix deps.get && mix ecto.setup && mix rockcut.synthetic.setup`,
  and `cd ../rockcut-ui && pnpm install --frozen-lockfile`. The env files are copied in.
- **Don't run Playwright or start servers.** The lead is using :4002/:5174 and DEV
  for a hotfix. ExUnit, `tsc`, `vite build`, lint and vitest are fine any time.
- Commit after each plan step (`feat:`/`fix:`/`test:`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Don't push. Format only
  files you change; never repo-wide `mix format`.
- `git stash` is blocked; use a temporary commit or `git diff > /tmp/… && git apply -R`.

## Notes

- Nothing outside `Tasks.Assignees` writes assignees. Authorization goes through
  `Authz` (D31's boundary test).
- Don't touch production steps or shifts: they stay single-assignee.
- Existing tests may change shape, not meaning. List any test you delete or weaken,
  with why.
- If the plan is wrong once you're in the code, stop and ask rather than redesign.

## Stop points

1. After steps 1–7 (API complete) with `mix test` green: write the status and stop.
2. After steps 8–10 and the non-Playwright gate, with Playwright specs written but
   not run: write the status and stop. The lead gives you servers.

## Report

`docs/current_work/prompts/d53_part1_builder_status.md`: per step, what changed,
files, tests added or changed, and `LEAD:` questions. Commit it, then stop.
