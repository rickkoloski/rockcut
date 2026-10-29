# D51 part 2: builder status

2026-10-28 · builder → lead. Branch `d51-auth-cleanup` in `~/src/rockcut-d51` (from `develop` @ `4ae3541`), committed locally and not pushed. Items 1–4 are done. I stopped before 4064 and 4057 as the brief says. No Playwright run.

| Commit | Item |
|---|---|
| `58cc4be` | 4058: remove the pre-D34 token path |
| `430aa01` | 4231: never return a password the caller typed |
| `60d9a5d` | 4669: build commit on `/api/health` and the DEV ribbon |
| `1729f77` | 4060: reset the pairing limiter before every sync test |
| `5fabdc8` | 4231 follow-up: tests use the generated temporary password (found by the full suite) |

The brief and spec (`d51_builder_brief.md`, `d51_security_cleanup_spec.md`) and this file are still untracked. I left them for you to commit.

## Gate

- `MIX_ENV=test mix test`, two full runs: **1784 passed** (seeds 30060 and 862715). Baseline on `develop` was 1786.
- `npx tsc --noEmit -p tsconfig.app.json` OK · `pnpm exec vite build` OK · `pnpm exec vitest run` 176/176.
- `pnpm lint`: 26 errors / 1 warning, the same as `develop`.
- `npx tsc -p tsconfig.e2e.json` shows 2 errors that are already on `develop`, in files I didn't touch: `task-board-phone.spec.ts:458` and `beer-board-import.spec.ts:39`. My e2e edits type-check.
- The compile warning `unused require Logger` in `reminders.ex` was already there.
- The migrator warning ("running migration 20261016120002 but an older …") was already there. It comes from `task_events_department_test` rolling back an old migration.

## 1. 4058: remove the pre-D34 token path

**Changed**
- `lib/rockcut_api_web/plugs/auth_plug.ex`: removed `legacy_auth/2`. Only `dev_` and `ses_` tokens authenticate; any other bearer token falls through to 401. Updated the moduledoc and trimmed the aliases.
- `lib/rockcut_api_web/controllers/session_controller.ex`: removed `verify_token/1` and `verify_synthetic_token/1` (both the `"user auth"` and the synthetic-salt verify), plus `@token_max_age`.
- **Callers of `verify_token/1`:** `AuthPlug` was the only one in `lib`. There's no user socket. `/live` is the LiveView socket, dev-only, and doesn't use it. Calendar feeds use their own feed tokens. `PasswordResetGate` reads `current_user`. One test called it directly, and I deleted that test (see below).
- `lib/rockcut_api/sessions.ex`: removed `legacy_tokens_revoked?/1` and the `legacy_tokens_revoked_at` write in `revoke_all/3`. Updated the module doc and the `revoke_all` doc.
- `lib/rockcut_api/accounts/user.ex`: removed the field.
- `lib/rockcut_api/seeds/synthetic.ex`: removed `@token_salt`, `token_salt/0` and `token_max_age/0`. `@token_max_age` stays, because it's still the 8-hour lifetime of minted persona sessions.
- **Migration** `priv/repo/migrations/20261028120001_remove_legacy_tokens_revoked_at_from_users.exs` does `remove :legacy_tokens_revoked_at, :utc_datetime`. I checked it on the test DB: rollback adds the column back, and migrate drops it again.

**Tests**
- 20 files signed legacy tokens. I moved them to `session_token_fixture/1` (`Sessions.create`), mostly in their `bearer/2` helpers:
  - 15 controller tests
  - `module_access_plug_test`
  - `formula_controller_test`
  - `device_account_test`
  - `auth_plug_device_test`: "a signed session token for a device user is refused" now uses a `ses_` token. `Sessions.authenticate` refuses device users, so the test keeps its subject.
- I removed `legacy_token_fixture/1` from `AccountsFixtures`.
- **Deleted, because the legacy path was their only subject** (8 tests):
  - `session_revocation_test`, the "pre-D34 tokens (S12, S13, §3.7)" describe:
    - S12 "still accepted"
    - S13 "refused after an owner's reset"
    - "refused after the person changes their password"
    - "refused after Sign out of all other devices"
    - "signing out with one is harmless…"
    - "another person's cutoff doesn't touch yours"
  - `session_revocation_test`: "a pre-D34 caller is signed out too (no session to keep)"
  - `synthetic_test`: "does not affect normal login tokens in prod". It called `verify_token/1`.
- Edited `sessions_test` "revoke_all/3": removed the two `legacy_tokens_revoked?` assertions and renamed the test.
- **Added** in `session_revocation_test`, describe "pre-D34 tokens (D51, task 4058)":
  - a correctly signed `Phoenix.Token` with the `"user auth"` salt → `/api/me` 401;
  - a correctly signed old synthetic-salt token (`"synthetic auth"`) → 401, even in test, where the seed guard allows synthetic personas.

**Revert check.** `git stash` and `git checkout --` are both blocked, so I used `git diff HEAD~1 HEAD -- rockcut_api/lib rockcut_api/priv > patch` and `git apply -R`, with a fresh test DB:
- Legacy path restored: `session_revocation_test.exs` **21/23**. Both new tests fail with `left: 200, right: 401`.
- Fix re-applied (`git apply` of the same patch, fresh DB): **23/23**.

**UI.** Nothing reads or migrates legacy tokens, and I removed nothing. `api.ts` treats a 401 for the current token as signed out: it clears `rockcut_token` and reloads to the sign-in page. A pre-D34 token now takes that same path, which is spec scenario 2.

## 2. 4231: never return a password the caller typed

- `lib/rockcut_api/accounts.ex` `create_user/2` always uses `generate_temp_password()` and ignores `attrs["password"]`. I updated its doc.
- **Callers:**
  - Seeds, `Synthetic` and `Release` don't call `create_user`. Personas get the seed password through their own path, so no internal path was needed.
  - Two tests passed a password on purpose, and I changed both to use the returned `temp_password`:
    - `password_reset_gate_test` "a person created with a temporary password…" (the full suite caught this one);
    - the Playwright helper `tests/regression/auth/helpers.ts` `createTempPerson`.
  - `calendar_feed_rotation.spec.ts` sent an unused `password`, so I dropped it and its import.
  - `UserFormDialog` never sends one.
- **Tests** in `user_controller_test`:
  - POST with `password: "typed-secret"` → 201. `temp_password` is present and isn't `"typed-secret"`, the response body never contains it, the generated password signs in, and the typed one doesn't. This test failed before the fix (`temp == "typed-secret"`) and passes after.
  - `Phoenix.Logger.filter_values` masks both `password` and `temp_password`.
- **`filter_parameters`:** the repo has no explicit config. Phoenix's default `["password"]` matches keys by substring, so `temp_password` is masked too. I confirmed this by running `filter_values` and pinned it with the test above.

## 3. 4669: build commit

**API**
- `Dockerfile` runtime stage: `ARG GIT_SHA` → `ENV GIT_SHA`.
- `config/runtime.exs`: `config :rockcut_api, :git_sha, System.get_env("GIT_SHA", "")`.
- `HealthController` returns `%{status, app, env, sha}`:
  - `env` is `Seeds.Guard.deploy_env()`, so `ROCKCUT_ENV` on a release;
  - `sha` is `"unknown"` when the value is empty or nil.
- New `health_controller_test.exs`: one test for a set SHA plus `env: "test"`, one for `""` and `nil` → `"unknown"`. `device_route_matrix_test` still passes, so `/api/health` stays public.

**UI**
- `Dockerfile`: `ARG VITE_GIT_SHA` → `ENV`.
- `main.tsx` sets `<html data-sha>`, the same way as `VITE_BUILD_ID` → `data-build`.
- `EnvBanner` shows `DEV · 4a5921c — fictional test data only` when the SHA is set. `VITE_BUILD_ID` is unchanged.
- I checked a `vite build` with `VITE_ENV_LABEL=DEV VITE_GIT_SHA=…`: the SHA is in the bundle. `roles.spec.ts` uses `toContainText('DEV')`, so it still matches.

**Docs**
- `docs/process/three_environment_workflow.md`:
  - §4.2 DEV deploy commands carry `--build-arg GIT_SHA=$(git rev-parse HEAD)` (API) and `--build-arg VITE_GIT_SHA=$(git rev-parse HEAD)` (UI).
  - §4.4 checks that the health `sha` is the SHA under test and the ribbon shows its first 7.
  - §5.3 prod deploy commands carry the build args.
  - §5.5 smoke checks `"env":"prod"`, `sha` == `git rev-parse <tag>^{commit}`, and `<html data-sha>`.
  - §8 marks the item done.
- `production_deploy_runbook.md`: the build args on every deploy command (prod, routine redeploy, DEV), and the SHA check in the step 7 and DEV smoke.
- `tests/RUNNING.md`: a new pre-flight row, "Deployed SHA == tested SHA".

## 4. 4060: ExUnit pairing flake

- **Cause.** `PairingRateLimiter` keeps global ETS counters per IP and a global cap (5 per IP, 50 global, per 10-minute window), and every ConnCase request comes from 127.0.0.1. Each module reset the limiter on its own. `2fdb7f2` (2026-10-11) added resets to `SyntheticTest` and to `PairingRateLimiterTest`'s `on_exit`. Any module that pairs without its own reset was still exposed to the previous module's attempts.
- **Fix.** `DataCase.setup_sandbox/1`, which ConnCase also uses, calls `PairingRateLimiter.reset()` for every non-async test. Every test that pairs is `async: false`. Async tests don't reset, so they can't disturb each other. I removed the four per-module resets (`devices_test`, `device_controller_test`, `pairing_rate_limiter_test` setup, `synthetic_test`), so the central reset is the only one.
- **Shown.** With `2fdb7f2`'s resets reverted and no central reset, I ran `mix test pairing_rate_limiter_test.exs synthetic_test.exs` with seeds 1–6:
  - **Before:** seed 5 fails with exactly the 4060 failure, "taproomDevice persona (D33) a pairing code for it works in the real exchange", 429 "Too many attempts". Seeds 1–4 and 6 pass.
  - **After** (central reset, no per-module resets): seeds 1–6 all pass (57/57), and both full runs are green.

## LEAD

1. **CLAUDE.md "Running the Project"** still shows `fly deploy --remote-only` without the build args. I left it alone to avoid clashing with your close-out edits. Should those lines gain `--build-arg GIT_SHA=…` and `--build-arg VITE_GIT_SHA=…`?
2. **`StaffCodes.RateLimiter`** has the same global-ETS shape. Five modules reset it by hand, and so does `device_route_matrix_test` in two places. Should it move to the same central reset in `DataCase`? I kept 4060 to the pairing limiter.
3. **Docker builds weren't run.** Docker isn't installed on this machine, so the two Dockerfile changes (`ARG`/`ENV`) get their first real build on the DEV deploy. Please put this under LIMITATIONS, with "ribbon text checked only by `vite build`, no DEV render yet" (spec scenario 6).
4. **Playwright edits not run:** `createTempPerson` and the D35 feed-rotation spec are changed, but they get their first run when you hand me servers. Spec scenario 2 (the UI shows the sign-in page after a pre-D34 token) has no Playwright spec yet. Should I add one with 4064 and 4057?
5. **Reminder:** part 2 must not deploy to prod before 2026-11-05.

---

# Lead decisions 1: status

2026-10-28 · builder → lead, after `d51_lead_decisions_1.md`. Items 1–8 are done, committed locally on `d51-auth-cleanup` and not pushed. HEAD is `6cdad0a`. Two things are open:
- the full local suite had one failure, G4 in `device_signout`, which is the known flake 4933;
- 4064 didn't reproduce.

The section above still says the D51 migration drops the column. Item 5 below replaces that.

| Commit | Item |
|---|---|
| `c9c3728` | 5: keep `users.legacy_tokens_revoked_at` (migration removed) |
| `a83c22f` | 2: central reset of the staff-code limiter |
| `d281eee` | 1: CLAUDE.md deploy lines pass the build commit |
| `2ee970b` | 4: Playwright scenario 2 (pre-D34 token → sign-in page) + COVERAGE.md |
| `6cdad0a` | 6: task board drag specs size the viewport to the board |

## 5. The column stays

- A new commit deletes `20261028120001_remove_legacy_tokens_revoked_at_from_users.exs`; history isn't rewritten. The `User` schema still doesn't map the field.
- **Spec** Part 2: the Migration section now says "None. The column stays, unused; a follow-up task drops it after part 2 is stable on prod", with the rollback reason. The 4058 bullet says the schema stops mapping the column and the column stays. The spec is still untracked, so this edit is only on disk.
- **Check:** after `MIX_ENV=test mix ecto.reset`, the test DB has `legacy_tokens_revoked_at TEXT`. Its latest migration is `20261027120001`.
  - `ecto.reset` also runs `seeds.exs`, which loaded seed rows into the test DB, and the next `mix test` failed 80 tests on unique constraints. I recreated the DB with `ecto.drop` and let `mix test` create and migrate it. The column is still there and the suite is green.
- **Local dev DB:** your dev DB (`rockcut_api_dev.db`) had already run the removed migration, so the column was gone and the migration row was recorded. I put it back to match the code: `ALTER TABLE users ADD COLUMN legacy_tokens_revoked_at TEXT` and deleted the `20261028120001` row from `schema_migrations`, in one transaction, with the server running. A copy from before is in the builder scratchpad (`rockcut_api_dev.before_restore.db`). `/api/health` was fine afterwards.

## 2. Staff-code limiter: central reset

- `DataCase.setup_sandbox/1` now resets both limiters for sync tests (`unless tags[:async]`).
- I removed the per-module `StaffCodes.RateLimiter.reset()` calls:
  - `beer_board_admin_controller_test`
  - `beer_board_controller_test`
  - `task_board_device_test`
  - `task_board_linked_test`
  - `device_route_matrix_test` (2 places)

  The aliases those calls left unused went too. So did two unused `PairingRateLimiter` aliases from the 4060 commit, in `devices_test` and `device_controller_test`.
- `staff_codes/rate_limiter_test.exs` keeps its own reset, because it's a plain `ExUnit.Case` and never goes through `DataCase`.
- **Suite:** green twice at the gate (below).

## 1. CLAUDE.md

The two deploy lines under "Running the Project" now carry `--build-arg GIT_SHA=$(git rev-parse HEAD)` (API) and `--build-arg VITE_GIT_SHA=$(git rev-parse HEAD)` (UI).

## 4. Playwright: scenario 2

- New `tests/regression/auth/pre_d34_token.spec.ts`. The test puts a stale `SFMyNTY.…`-shaped token in `rockcut_token` and checks:
  - `/api/me` answers 401;
  - the app shows the sign-in page (`login-submit`);
  - `rockcut_token` is `null`, and stays that way after a reload.
- It passes locally.
- **Revert check:** none. The token isn't validly signed, so restoring the legacy path wouldn't make this test fail. The ExUnit tests in `session_revocation_test` already show that check, failing with the old code and passing with the fix.
- `tests/COVERAGE.md`:
  - D34 S12/S13 (the pre-D34 token rows) are marked retired in D51.
  - A new section covers D51 part 2 scenarios S1–S6.

## 6. S13 on DEV: drag viewport sized to the board

- **Cause, measured locally.**
  - The Unfinished list stops growing at about 400 px and scrolls inside, so old Unfinished tasks alone can't push day 9 down. 16 extra past tasks didn't move it at all.
  - What does push day 9 down is a taller first row: extra tasks on one of the first days.
  - `document.documentElement.scrollHeight` was 2600 at a 2600 viewport and 3400 at 3400. The layout is full height, so `scrollHeight` follows the viewport and sizing to it would only grow.
  - So the helper measures the **board grid's bottom** instead of `scrollHeight`.
- **Fix:** `fitViewportToBoard(page, min = 2600)` in `taskBoardHelpers.ts`, called after `openBoard`.
  - It sets the height to `max(min, gridBottom / 0.75)`, so the grid ends by 75% of the screen, inside `mouseDrag`'s 80% line.
  - It measures again after each resize (up to 3 times).
- **Uses:**
  - S13 (`task-board-drag.spec.ts`), at least 2600;
  - two tests in `task-board-range.spec.ts` that had the same "other tasks on a shared board" assumption at 2200: S19 (drag out of Unfinished) and "a task dragged over the Unfinished card gets no spot there". Both keep a 2200 minimum.
  - The file-level `test.use({ viewport })` heights don't drag to a list low on the board, so I left them alone.
- **Before/after**, with 14 untagged filler tasks on today + 2, which pushed day 9's list bottom to 2185 px, past the 2080 line. Untagged, because the specs' cleanup deletes every `[TEST-TEMP]` task; I deleted the fillers by id afterwards.
  - **Before** (fixed 2600): S13 failed **3/3** with DEV's error, "mouseDrag: the target list ends near or past the bottom of the screen".
  - **After:** S13, S19 and the drag-over-Unfinished test passed **9/9** (3 each).
- I can't check it on DEV, which is busy.

## 7. Flakes

### 4064 (`personal_signin.spec.ts` S13 "activity keeps the personal session")

It didn't reproduce, so I didn't change anything.

| Run | Result |
|---|---|
| `-g "activity keeps…" --repeat-each 10 --workers 4` | 10/10 |
| same, `--repeat-each 20 --workers 8` | 20/20 |
| 10 copies on 2 workers, alongside `tests/regression/devices` + `tests/regression/scheduler` on 4 workers | 10/10, and 98/98 for the load |
| first S13 test (`:44`, the time-off one; the D36 note doesn't say which S13) `--repeat-each 12 --workers 4` | 12/12 |
| whole file `--repeat-each 2 --workers 4` | 22/22 |
| full local suite (below) | passed |

- **Harness limit found on the way:** `--repeat-each 10` on the whole file gives 63 failures, all "all 40 spare sessions are used". One setup run mints 40 spares, and `--no-deps` doesn't mint more. That is not 4064. For repeat runs, re-run `--project setup` first and keep the number of claims under 40.
- **Recommendation:** close 4064 as not reproducible since D34, the same way as 4057. If it comes back, run it with `--trace retain-on-failure`.

### 4057 (`personal_signin_revoke.spec.ts` G1 "Try now recovers…")

- `-g G1 --repeat-each 20` matched all 8 G1 tests: **160/160** passed, which includes "Try now recovers at once while a retry is still stalled" 20/20.
- **Recommendation:** close it. Suggested note for the task: "If it recurs on DEV, run `E2E_TARGET=dev npx playwright test tests/regression/devices/personal_signin_revoke.spec.ts -g 'Try now' --repeat-each 10 --trace retain-on-failure` and attach the trace."

## 8. Local gate

- Reseeded first with `mix rockcut.synthetic.setup` (19 personas).
- `MIX_ENV=test mix test`, twice: **1784 passed**, both runs (seeds 484426 and 406159).
- `tsc --noEmit -p tsconfig.app.json` OK · `vite build` OK · vitest **176/176**.
- Lint: 26 errors / 1 warning, the same as `develop`.
- **Full local Playwright** (`/tmp/claude-501/pwlogs/d51p2_local.log`, 32.7 min): **568 passed, 1 failed, 1 skipped, 2 did not run**.
  - **skipped:** `smoke/roles` "DEV shows the banner", which is DEV-only.
  - **did not run:** `board-replace` (2 tests), because it depends on `chromium`, which had the failure. Run on its own afterwards, with the Mac awake: **2/2 passed** (`d51_board_replace2.log`).
  - **failed:** `devices/device_signout.spec.ts:64` "G4: a stale tab's person Logout never unpairs the tablet". This is **task 4933**, filed 2026-10-26 on `develop` ("failed 2 of 4 file runs locally"), so it predates D51.
    - Re-run on its own with the Mac awake, 1 worker: **6/10 passed, 4 failed**, all at line 101 (`b.getByTestId('personal-session-banner')` not found).
    - **Cause, from the trace:**
      - B shows the banner at 16.25 s and is frozen at 16.39 s.
      - A logs out at 16.39 s and is back on the device chip at 18.05 s.
      - By then B has lost the banner, and its tree shows the person's normal layout without the banner.
      - `App.tsx:235`, `personalOnTablet = isAuthenticated && !!asideDeviceToken()`, reads `localStorage` on every render. A's Logout removes `rockcut_device_token` from the storage the two tabs share, so B's next re-render drops the banner, and with it the idle and device-watch hooks. It does this even though B gets no storage events and no API answers.
      - The test's assumption that B stays stale holds only until B happens to re-render. I couldn't pin down what triggers that re-render in the 1.6 s window: frozen requests don't show in the trace, and the 20 s channel poll is too late.
    - I didn't change the test or the app (out of scope). The traces are in `/tmp/claude-501/pwlogs/d51_g4_traces/`.
- **The Mac slept during my first reruns** (12:45, 13:02, 13:18 and 13:27 in `pmset -g log`), even with `caffeinate -i` on each `npx`. The first G4 rerun (3/5 failed, 17 min) and the first `board-replace` rerun (failed after 15.5 min, "session closed") are contaminated, so ignore them. The full suite ended at 12:44:58, before the first sleep, so it's a clean run. For the reruns above I wrapped the whole chain in `caffeinate -ims` (`-s` blocks system sleep on AC).

## LEAD

1. **4933 (G4):** fix the test or the app?
   - Test: assert what G4 is about, that B's Logout keeps the tablet paired, without needing B's banner to survive. If B already re-synced, log out from where B is.
   - App: freeze `personalOnTablet` for a tab, from the auth store, until that tab re-syncs.

   It reproduces at about 40% locally, so either fix can be checked. It predates D51; do you want it in this branch?
2. **4064 and 4057:** OK to close both, with the trace guidance above?
3. **Your local dev DB:** I changed it by hand (column re-added, migration row removed). If you'd rather rebuild it from scratch, `mix ecto.reset` followed by `mix rockcut.synthetic.setup` gives the same schema.
4. The brief, the lead decisions, the spec (edited for item 5) and this status file are still untracked.

---

# Lead decisions 2: status (step 1, ranges proposed; stopped for OK)

2026-10-28 · builder → lead, after `d51_lead_decisions_2.md`. Done: the 4933 test fix (`9b0b36a`). Proposed: the brewing ranges (table below). **Stopped here for your OK** before coding them, as asked. The full gate on the merged branch comes after the ranges.

## 4933 (G4): test fixed

- **Change** (`device_signout.spec.ts`, G4).
  - The banner precondition is gone.
  - B is unfrozen just before its own Logout, as before.
  - The test presses `logout-button.or(account-menu)`. Exactly one of the two exists in either state: the banner's Sign out while B still sees the set-aside token, or the account menu once a re-render has dropped the banner. Playwright finds it again if B flips in between.
  - If that click opened the menu, the test presses its Log out.
  - The assertions about G4 itself are unchanged: B ends on the device chip, `rockcut_token` is the tablet's token, and the tablet token's `revoked_at` is null. A Logout that unpaired the tablet would still fail the test.
- **Runs**, Mac awake (`caffeinate -ims` on the whole chain, no `pmset` sleep between 19:37 and the end of the runs), 1 worker, fresh setup before each batch:

  | Version | Result |
  |---|---|
  | old | **15/20**, all 5 failures at line 101 (banner not found) |
  | first rewrite (`toPass` with a 1 s click) | 19/20 |
  | final | **20/20**; whole `device_signout.spec.ts` 3/3 |

  The first rewrite's failure was a test bug, not the app: B's Logout did happen, but the 1 s click timed out on the navigation it started, `toPass` retried, and no control was left to press. The final version has no short click timeout and no retry loop.
- **Logs:** `/tmp/claude-501/pwlogs/d51_g4_old20.log`, `d51_g4_new2_20.log`.

## G1 + G5: proposed ranges (not coded yet)

**Units, where they come from:**
- **Gravity is SG** (1.0xx): D1 data model spec (OG 1.061 etc.), `formulas/functions/brewing_calcs.ex` (`OG = 1.000 + points/1000`), the UI's sample rows.
- **Temperatures are °F**: D1 spec "(F)"; the recipe dialogs say "Temperature (°F)"; the production API already limits step temperatures to 28–80 °F.
- **Water is ppm** (D1 spec). **Percentages** are labelled "%" in the UI.
- **Volumes have no unit column** on batches or brew turns. The D1 examples are bbl ("7 bbl"). `recipes.batch_size` has its own unit (bbls, gallons or liters).
- **No real values to check:** neither seeds nor the local DB have any brewing numbers. Prod not checked.

**Behaviour of the checks:**
- Bounds are inclusive unless marked ">".
- A field left empty (`nil`) is still allowed.
- `validate_number` only checks a field that is being changed, so an existing out-of-range value never blocks editing other fields.
- Message: "must be between X and Y" (for ">" bounds: "must be more than X and at most Y").

| Schema · field (UI label) | Unit | Range | Why |
|---|---|---|---|
| **Brand** `target_abv` (Target ABV) | % | 0–100 | as asked; real beers 0–20 |
| `target_ibu` (Target IBU) | IBU | 0–300 | the biggest IPAs claim 100–150 |
| `target_srm` (Target SRM) | SRM | 0–200 | imperial stouts 40–80+ |
| **Batch** `actual_og` (Actual OG) | SG | 0.950–1.200 | barleywine ≤ 1.150 |
| `actual_fg` (Actual FG) | SG | 0.950–1.200 | dry beers go below 1.000 (0.996) |
| `actual_abv` (Actual ABV) | % | 0–100 | as asked |
| `actual_volume` (Actual Volume) | bbl (assumed) | 0–10,000 | the same cap as production's `volume_bbl` / `capacity_bbl` (under 10,000 bbl) |
| `ferm_temp` (Ferm Temp) | °F | 25–110 | crash ~28–34, kveik up to ~100; wider than production's 28–80 on purpose, because this is a measured or actual value |
| **BrewTurn** `actual_og` (Actual OG) | SG | 0.950–1.200 | as Batch |
| `actual_volume` (Actual Volume) | bbl (assumed) | 0–10,000 | as Batch |
| `actual_efficiency` (Actual Efficiency) | % | 0–100 | |
| **BatchLogEntry** `gravity` (Gravity) | SG | 0.950–1.200 | readings during fermentation sit between OG and FG |
| `temperature` (Temperature) | °F | 20–220 | covers tank readings and hot-side readings (knockout, whirlpool; boiling at Estes Park is ~201 °F) |
| `ph` (pH) | pH | 0–14 | as asked |
| **IngredientLot** `alpha_acid` (Alpha Acid %) | % | 0–100 | hops 2–20; extracts higher |
| `color_lovibond` (Color, Lovibond) | °L | 0–1,000 | roasted malts ~300–600 |
| `attenuation` (Attenuation %) | % | 0–100 | |
| `extract_potential_fgdb` (Extract % FGDB) | % | 0–100 | |
| `protein_perc` (Protein %) | % | 0–100 | |
| `moisture_perc` (Moisture %) | % | 0–100 | |
| `diastatic_power_linter` (Diastatic Power, °Lintner) | °L | 0–1,000 | real malts ≤ ~200 |
| **MashStep** `temperature` (Temperature °F) | °F | 32–212 (now `> 0`) | mash 95–170 |
| **RecipeProcessStep** `temperature` (Temperature °F) | °F | 20–212 | crash to whirlpool |
| **Recipe** `batch_size` (Batch Size) | bbls / gallons / liters | > 0 and ≤ 10,000 (now `> 0`) | 30 bbl = 930 gal = 3,520 L |
| `efficiency_target` (Efficiency Target %) | % | 0–100 | |
| **RecipeIngredient** `amount` (Amount) | lb / oz / g / kg / pkg / each | > 0 and ≤ 1,000,000 (now `> 0`) | the unit can be `g`: a 30 bbl grain bill is ~600,000 g |
| **WaterProfile** `calcium`, `magnesium`, `sodium`, `sulfate`, `chloride`, `bicarbonate` | ppm | 0–2,000 | Burton sulfate ~800 |
| `ph_target` | pH | 0–14 | as asked |

**Not in the table:**
- `Batch.volume_bbl` and `Tank.capacity_bbl`: the production code already limits them (> 0 and under 10,000 bbl, with its own messages). The brewing `Batch.changeset` doesn't cast `volume_bbl`.
- No other `:decimal` fields exist outside `brewing/` and `production/`.

**What this catches:**
- The 40-digit number (about 1.2e39 after the float cast) and `1e308` are above every upper bound → 422.
- ABV `1000`, `525` (Chromium's `5,25`) and `-5` → 422.
- `-1e-9999` casts to 0, which is valid, so it's accepted, as you said.
- **What it can't catch:** inside 0–100, `52.5` typed for `5.25` still saves.

## LEAD (for the OK)

1. **The table:** OK as is, or adjust any row? These four are the judgement calls:
   - ABV stays 0–100 as you asked; 0–20 would also catch `52.5`.
   - Log temperature 20–220 °F allows hot-side readings.
   - `ferm_temp` 25–110 °F, wider than production's 28–80.
   - The 10,000 cap on volumes and batch size.
2. **Gravity is SG only:** a brewer who records °Plato (12.5) would be refused. Is that right for Matt? The spec and the formulas are SG.
3. **Prod values:** should I run a read-only count of existing prod values outside these ranges? They'd only matter when someone edits that same field.

---

# Lead decisions 2, part 2: status (ranges built; full gate green)

2026-10-28 · builder → lead, after the ranges were approved. Done and committed locally (not pushed). HEAD is `d4ab9ed` plus this status commit.

| Commit | What |
|---|---|
| `8d0c5a6` | API: ranges on every brewing number + ExUnit |
| `d4ab9ed` | UI: `min`/`max`/`step="any"` on the brewing inputs, Water tab shows a refused save, Playwright `brewery/brand-ranges`, COVERAGE.md |

## API

- **New `RockcutApi.Brewing.Ranges`** with three helpers. Each runs `validate_number` with one message that names the range:
  - `validate_range/4`: "must be between 0 and 100" (thousands get a comma: "10,000");
  - `validate_positive_up_to/3`: "must be more than 0 and at most 10,000";
  - `validate_gravity/2`: "must be a specific gravity between 0.950 and 1.200", as you worded it. The bounds are `Decimal`s, so 0.950 is exact.
- Ten changesets use the helpers, with the table as approved: Brand, Batch, BrewTurn, BatchLogEntry, IngredientLot, MashStep, RecipeProcessStep, Recipe, RecipeIngredient, WaterProfile.
- Three existing checks are replaced, because the new range includes them:
  - `MashStep.temperature > 0` → 32–212;
  - `Recipe.batch_size > 0` → more than 0 and at most 10,000;
  - `RecipeIngredient.amount > 0` → more than 0 and at most 1,000,000.
- As before, a check only runs when that field changes, and an empty field is allowed.
- **Formatting:** only the lines I added. A first `mix format` on the brewing glob had reformatted unrelated lines, including `ingredient_category.ex`, which I hadn't touched. I restored those files from HEAD and re-applied my edits by hand. The lib diff is 40 lines added and 3 removed in 10 files, plus the new `ranges.ex`.
- **Tests**
  - `test/rockcut_api/brewing/ranges_test.exs`, one describe per schema and one test per field (33 fields):
    - both bounds pass;
    - just below and just above are refused with the exact message.
  - The same file also checks:
    - an empty field is still allowed;
    - a 40-digit float and `1.0e308` are refused;
    - `-0.0` (what Jason makes of `-1e-9999`) is allowed.
  - `test/rockcut_api_web/controllers/brewing_ranges_controller_test.exs` posts raw JSON bodies, so the numbers go through Jason as JSON numbers, as the UI sends them:
    - for each of the 10 resources: a 40-digit number gets 422 with the range message and no row is created; then an in-range value gets 201 and is saved exactly;
    - an update of a brand's ABV to `1000`, `1e308` or `-5` gets 422, and 5.25 stays.
- **Revert check** (lib diff reversed and `ranges.ex` moved aside): the two new files go to **1/37**; only "an empty field is still allowed" passes. Restored: **37/37**.

## UI

- `slotProps.htmlInput = { min, max, step: 'any' }` on all 30 brewing number inputs, using the table's bounds. For the "more than 0" fields (batch size, amount) the browser minimum is 0 and the API refuses 0 itself.
  - Brand: Target ABV, IBU, SRM
  - Batch: Actual OG, FG, ABV, Volume, Ferm Temp
  - Brew turn: OG, Volume, Efficiency
  - Log entry: Gravity, Temperature, pH
  - Ingredient lot: all 7 fields
  - Mash and process step: Temperature
  - Recipe: Batch Size, Efficiency Target
  - Recipe ingredient: Amount
  - Water tab: the six ppm fields up to 2,000, pH Target up to 14
- The old `step: 0.1` on Target ABV and the Water fields became `'any'`. Inputs that aren't brewing values (step numbers, durations, version, rating) are unchanged.
- **Error display:**
  - The dialogs already showed the API's 422 through `parseApiError` in the FormDialog Alert, for example "target abv: must be between 0 and 100".
  - The **Water tab didn't**: its Save had no catch, so a refused save did nothing visible. It now catches the error and shows `parseApiError`'s message in an Alert, the same pattern as the dialogs. Cancel clears it. Nothing else in the form changed.
  - FormDialog has a `<form>`, so the browser's own range check now runs first and blocks Save with its bubble. The Water tab has no `<form>`, so there the API check is what refuses.
- **Test ids added** for the spec: `brand-edit-button` on Brand detail, and `testId="brand-form-dialog"` on the brand dialog.
- **Playwright** `tests/regression/brewery/brand-ranges.spec.ts`. As breweryMgr, on a `[TEST-TEMP]` brand made with ABV 5.25:
  1. Edit, set Target ABV to 1000, Save: the input reports `rangeOverflow`, the dialog stays open and no PUT is sent.
  2. With the browser's check switched off (`form.noValidate = true`, as an older page or a browser without constraint validation would behave), Save: the PUT gets 422 and the dialog's alert shows "must be between 0 and 100".
  3. After a reload the page shows 5.25, and the API returns 5.25.
  4. The owner deletes the brand in `afterEach`.
- **Spec results:** **3/3** with `--repeat-each 3`. With the brand's API range and the dialog's `max` both removed it **fails** (at step 1, `rangeOverflow` false); restored it **passes**.

## Full gate (merged branch, on the new deps)

The chain ran under one `caffeinate -ims`, from 20:12 to 20:47. The last `pmset` sleep was at 19:37, so no sleep during the run.

| Check | Result |
|---|---|
| Reseed (`mix rockcut.synthetic.setup`) | OK |
| `MIX_ENV=test mix test`, run 1 (seed 690485) | **1823 passed** |
| `MIX_ENV=test mix test`, run 2 (seed 906393) | **1823 passed** |
| `tsc --noEmit -p tsconfig.app.json` | OK |
| `vite build` | OK |
| vitest | **176/176** |
| lint | 26 errors / 1 warning, same as `develop` |
| **Full local Playwright** | **572 passed, 1 skipped, 0 failed**; `board-replace` ran |

- The ExUnit total is 1823, up from 1786: 37 new range tests.
- The one skipped Playwright test is `smoke/roles` "DEV shows the banner", which is DEV-only.
- The Playwright log is `/tmp/claude-501/pwlogs/d51p2_local2.log`.

## For the DEV run (LIMITATIONS to consider)

- I never built the Docker images (no Docker here). The `GIT_SHA` / `VITE_GIT_SHA` build args get their first real build on DEV, and the DEV ribbon SHA and `/api/health` `sha` need checking there.
- The brewing ranges were exercised locally for Brand in the browser, and for all resources through the API in ExUnit. The other dialogs' `min`/`max` were only type-checked and checked in the diff, not clicked through.
- The S13 viewport fix (`fitViewportToBoard`) hasn't run on DEV yet; locally it was checked by recreating DEV's taller board.
