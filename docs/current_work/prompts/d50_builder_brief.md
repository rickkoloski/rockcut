# D50: builder brief

2026-11-08 · lead → builder.

**Read first:**
- the spec `docs/current_work/specs/d50_brewhouse_device_spec.md` (all of it);
- the plan `docs/current_work/planning/d50_brewhouse_device_plan.md` (your work order, including
  the "What's there today" section and the lead decisions);
- `docs/process/three_environment_workflow.md` §3.

## Where you work

- **Worktree:** `~/src/rockcut-d50`, branch `d50-brewhouse-device`. Work only here. Don't touch
  `~/src/rockcut` or any other worktree.
- The dev DB is set up (`mix ecto.setup` + `mix rockcut.synthetic.setup` done), `pnpm install`
  done, and the env files are copied in.
- **Servers:** don't start or stop the local servers on :4002/:5174; the lead owns them. Until the
  lead tells you they run from `~/src/rockcut-d50`, write Playwright specs but don't run them.
  ExUnit, `mix compile`, `tsc`, `vite build`, lint and vitest are fine any time. **Don't run
  `mix compile --force` while a Playwright run is going** (it rebuilds the dev server mid-run).
- Commit after each stage or meaningful step (`feat:`/`fix:`/`test:`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Don't push. Format only files you
  change; never run a repo-wide `mix format`.
- `git stash` is blocked; use a temporary commit or `git diff > /tmp/… && git apply -R`.

## Rules

- **Authorization only through `Authz` / `Authz.Device`.** D31's boundary test fails the build
  otherwise.
- **Every route you move into the device pipeline** gets its row in `device_route_matrix_test.exs`.
  A Taproom device must still get 403 on every production route, and a Brewery device must still
  get 403 on every setup write.
- Existing tests may change shape, not meaning. List anything you delete or weaken, with why (D49's
  `linked_task_device` tests become device-with-code tests; say so).
- **Persist-verify every write** in tests (act, reload, check).
- Each fix gets a test that fails with the fix reverted; say which in the status.
- **Specs that compare against a shared list** compare only with rows that existed before the test
  (parallel specs race).
- If the spec or plan is wrong once you're in the code, stop and ask rather than redesign.

## Stop points

The plan marks three (■).
- At each one, write or append `docs/current_work/prompts/d50_builder_status.md`. Per stage, say:
  - what changed;
  - the files;
  - the tests added or changed;
  - any `LEAD:` questions.
- Commit it with a message containing `stop <n>` (for example `stop 1`), then stop.
