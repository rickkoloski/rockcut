# D51 part 2: builder brief

2026-10-28 · lead → builder.

**Spec:** `docs/current_work/specs/d51_security_cleanup_spec.md`, **Part 2**. Read it first, then `docs/process/three_environment_workflow.md` §3 (local gate).

## Where you work

- **Worktree:** `~/src/rockcut-d51`, branch `d51-auth-cleanup` (from `develop` @ `4ae3541`). Work only here.
- **Don't touch `~/src/rockcut`:** it's on the part 1 hotfix branch, and the lead's API/UI servers run from it.
- First: `cd ~/src/rockcut-d51/rockcut_api && mix deps.get`, and `cd ../rockcut-ui && pnpm install --frozen-lockfile`. This worktree has its own test DB (`rockcut_api/rockcut_api_test.db`).
- **Don't run Playwright** until the lead says so: the lead is running the part 1 suite on DEV, and local and DEV runs share `tests/.playwright-auth/`. ExUnit, `tsc`, `vite build`, lint and vitest are fine any time.
- Commit locally on `d51-auth-cleanup` as you finish each item (`fix:` / `feat:` messages, Co-Authored-By line). Don't push. Format only the files you change (never repo-wide `mix format`).
- Part 1 (dependency bumps) merges into `develop` later; the lead will merge `develop` into this branch then. Don't bump dependencies here.

## Order

1. **4058, remove the pre-D34 token path.** Spec Part 2 §4058:
   - `AuthPlug`: drop `legacy_auth`; only `ses_` and `dev_` tokens authenticate.
   - `SessionController.verify_token/1`: drop the `Phoenix.Token` "user auth" verify **and** the synthetic-salt verify (`Synthetic.token_salt/0`; personas mint via `Sessions.create`). Remove `@token_max_age`, `token_salt/0` and anything else left unused. Check every caller of `verify_token/1` (sockets, `/live`, calendar feeds, `PasswordResetGate`) still works or no longer needs it.
   - `Sessions`: drop `legacy_tokens_revoked?/1` and the `legacy_tokens_revoked_at` writes; `User` loses the field; one migration drops the column (reversible: `add` back a nullable `:utc_datetime`).
   - Update module docs that describe the transition.
   - Tests: move the ~22 test files that sign legacy tokens (`git grep -l "Phoenix.Token.sign" rockcut_api/test`) to sessions (`PersonaFixtures`). Delete tests whose only subject was the legacy path, and say which in your summary. Add: a correctly signed old-style `Phoenix.Token` gets 401 on `/api/me`.
   - Revert check: the new 401 test must fail with the legacy path restored (`git stash` is blocked; use a temporary commit or `git diff > /tmp/…` and `git apply -R`). Record both runs.
   - The UI: `git grep` for anything that reads or handles legacy tokens (e.g. a pre-D34 migration of `localStorage`); remove it only if it's dead, and tell the lead.
2. **4231, never return a password the caller typed.** Spec Part 2 §4231. `Accounts.create_user` always generates the temp password and ignores a `password` in `attrs`. Check callers (seeds, `Synthetic`, tests) that pass a `password` on purpose: if any need a known password (personas use the secret seed password), give them a separate internal path, not the controller's. Controller test: POST with `password: "typed-secret"` → 201, `temp_password` present and ≠ `"typed-secret"`. Confirm `config :phoenix, :filter_parameters` covers `password` and `temp_password`.
3. **4669, build commit.** Spec Part 2 §4669:
   - API: `Dockerfile` `ARG GIT_SHA` → `ENV GIT_SHA` in the runtime stage; `HealthController` returns `%{status, app, env, sha}` (`env` from `ROCKCUT_ENV` or the existing env helper, `sha` `"unknown"` when unset). Controller test for both.
   - UI: `Dockerfile` `ARG VITE_GIT_SHA` → `ENV`; `EnvBanner` shows the 7-char SHA after the label (`DEV · 4a5921c`) when set. Keep `VITE_BUILD_ID` as it is.
   - Docs: the DEV deploy and prod deploy commands gain `--build-arg GIT_SHA=$(git rev-parse HEAD)` (API) and `--build-arg VITE_GIT_SHA=$(git rev-parse HEAD)` (UI); DEV pre-flight (`tests/RUNNING.md`) and prod smoke (`three_environment_workflow.md` §4.4 and §5.5, §8) check `curl …/api/health` `sha` == the tested SHA / the tag.
4. **4060, ExUnit flake** (`SyntheticTest` taproomDevice pairing). Find the pairing rate limiter's global cap; make tests unable to exhaust it for one another (reset in setup, or per-test scoping). Show it: a seed or ordering that failed before and passes after, if you can reproduce it.
5. **Stop and report** before the Playwright flakes (4064, 4057); the lead hands you servers for those.

## Gate for this stage

`cd rockcut_api && MIX_ENV=test mix test` green (run it twice); `cd rockcut-ui && npx tsc --noEmit -p tsconfig.app.json && pnpm exec vite build && pnpm exec vitest run`; lint no worse than `develop` (26 errors / 1 warning).

## Report

When done (or blocked), write `docs/current_work/prompts/d51_builder_status.md`: per item, what changed, files, tests added, the revert-check runs, anything you removed from the UI, and `LEAD:` questions. Then stop.
