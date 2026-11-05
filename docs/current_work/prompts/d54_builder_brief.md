# D54: builder brief

2026-11-02 · lead → builder.

**Read first:** the spec `docs/current_work/specs/d54_remove_tablet_sign_in_as_me_spec.md`,
the plan `docs/current_work/planning/d54_remove_tablet_sign_in_as_me_plan.md`
(steps 1–7 are your work order), then `docs/process/three_environment_workflow.md`
§3 (local gate).

## Where you work

- **Worktree:** `~/src/rockcut-d54`, branch `d54-remove-tablet-sign-in`
  (from `develop` @ `2f48dd0`). Work only here; don't touch `~/src/rockcut`.
- First: `cd rockcut_api && mix deps.get && mix ecto.setup && mix rockcut.synthetic.setup`,
  and `cd ../rockcut-ui && pnpm install --frozen-lockfile`. `.env.synthetic`
  and `.env.test.local` are already copied in.
- **Servers and Playwright:** ask the lead (`LEAD:` in your status file and
  stop). Ports 4002/5174 are shared with the main checkout. ExUnit, `tsc`,
  `vite build`, lint and vitest are fine any time.
- Commit locally after each plan step (`feat:`/`fix:`/`test:` messages,
  ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
  Don't push. Format only the files you change (never repo-wide
  `mix format`).
- `git stash` is blocked; for the revert check use a temporary commit or
  `git diff > /tmp/… && git apply -R`.

## Notes

- The refusal is checked **before** the password (spec §3.1); don't let a
  wrong-password 401 and a refusal 403 differ by timing-visible work if it's
  cheap to avoid, but don't over-engineer it.
- Keep sending `X-Rockcut-Device` from the login form when the stored token
  is a `dev_` token (plan step 4).
- Everything you delete from tests: list it in your status with one line on
  why it no longer applies.
- If something in the plan is wrong once you're in the code, stop and ask
  rather than redesign.

## Stop points

1. After steps 1–6 and the non-Playwright gate: write the status and stop.
   The lead will start servers for step 7.
2. After step 7's specs pass locally: write the status and stop.

## Report

`docs/current_work/prompts/d54_builder_status.md`: per step, what changed,
files, tests added/removed, the revert-check runs, and `LEAD:` questions.
