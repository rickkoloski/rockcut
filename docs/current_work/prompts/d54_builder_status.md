# D54: builder status

Builder → lead. Branch `d54-remove-tablet-sign-in` in `~/src/rockcut-d54`, local
commits only (not pushed). **Stop point 1 reached:** plan steps 1–6 and the
non-Playwright gate are done. Step 7 (Playwright) waits for the lead to start
the servers.

Setup ran clean: `mix deps.get && mix ecto.setup && mix rockcut.synthetic.setup`
(19 personas), `pnpm install --frozen-lockfile`. The local dev DB has the new
migration applied (`mix ecto.migrate`).

## Commits

| SHA | Step | Message |
|---|---|---|
| `7a79744` | 1 | feat: D54 refuse personal logins on a paired tablet |
| `537cf64` | 2 | feat: D54 remove tablet sessions from the API |
| `f341fe0` | 2 (follow-up) | fix: D54 staff-code lockout no longer points to Sign in as me |
| `8218ddd` | 3 | feat: D54 migration signs out personal sessions started on tablets |
| `42858ee` | 4 | feat: D54 remove Sign in as me from the UI |
| `9aba51a` | 5 | feat: D54 settle a tablet left mid Sign in as me at start-up |
| `da80fa0` | 6 | docs: D54 tablet setup guide and test coverage |

## Step 1: API refusal

- `SessionController.create/2` now checks `signing_in_on(conn)` (the existing
  `Devices.live_token/1` lookup on `X-Rockcut-Device`) **before**
  `get_user_by_email_and_password`. A live token returns 403
  `{error: "This device is already set as a shared device. Personal logins not accepted."}`.
  Stale, revoked, made-up or person tokens are ignored, as before.
- Timing: the refusal returns before bcrypt runs, so it's faster than a 401.
  It doesn't depend on the password at all, though, so timing can't tell a
  right password from a wrong one. I added nothing beyond that.
- Files: `lib/rockcut_api_web/controllers/session_controller.ex`,
  `test/rockcut_api_web/controllers/session_revocation_test.exs`.
- **Tests added** (describe "no personal logins on a paired tablet (D54 S246–S248)"):
  - S246: a live header gets 403 for the right password and for a wrong one, and no `user_sessions` row is created. The tablet's own token still works.
  - S246: an unknown email gets the same 403, which shows the check runs before any user lookup.
  - S247: no header gives a normal 30-day sign-in.
  - S248: a revoked, `dev_made-up`, person-token or garbage header still signs in.
  - Kept: "a made-up ses_ token gets 401".
- **Tests removed** (they all needed a tablet session created through `POST /api/session`, which is now refused):
  - "a live X-Rockcut-Device header marks the session": tablet sessions no longer exist.
  - "S4 Sign out on the tablet revokes the personal token": no personal token on a tablet.
  - "S7 revoking the tablet ends the session started on it": nothing is started on a tablet.
  - "S7 the tablet signing itself out ends its personal sessions too": same reason.
  - "G2 a tablet sign-in can't change the password": there are no tablet sign-ins, and the guard is gone in step 2.
  - "G2 a tablet sign-in can still finish a forced reset": same reason.
  - "G2 a tablet sign-in gets 403 and signs nothing out" (sessions/others): same reason.
  - The old S11 is rewritten as S248. It now asserts the login works, not that `device_token_id` is nil (the schema field is gone in step 2).
  - S14 (sign out of all other devices): the third session is now a plain sign-in instead of a tablet one. It still expects `revoked: 2`.
- **Revert check** (old controller from `HEAD~` restored, test file kept):
  - Reverted: 17/19 passed. Both S246 tests failed (200 instead of 403).
  - Restored: 19/19 passed.
- Full suite after step 1: 1822 passed.

## Step 2: API cleanup

- `Sessions`:
  - `create/3` drops `:device_token`. Options go through `Keyword.validate!(max_age: …)`, so a leftover `device_token:` raises `ArgumentError` instead of being silently ignored. This is the spec's "Sessions no longer accepts a device token" test.
  - Removed: `@tablet_max_age_seconds`, `@tablet_idle_seconds` and `tablet_idle_seconds/0`, `@seen_every_seconds`, `tablet_ok?`, `touch`, the `:device_token` preload, and `revoke_for_device_tokens`.
  - Moduledoc updated.
- `UserSession`: the `belongs_to :device_token` is gone from the schema. The DB column stays (nullable, unread) with a comment. A rolled-back image still reads it, and the FK `on_delete: :delete_all` is unchanged.
- `Devices`: dropped both `revoke_for_device_tokens` calls (`end_pairings/1` on deactivation, `revoke_token/3`) and the `Sessions` alias.
- `SessionController`:
  - The `on_tablet?`/`tablet_refused` guards are gone from `password` and `delete_others`.
  - `change_password` is inlined back into `password/2`, with the fallback clause last.
- **Not named in the plan, removed because they read the dropped association:**
  - `Accounts.effective_color_mode/2`: the D43 tablet theme handover on the API side.
  - `/api/me` (`MeController`) now returns `user.color_mode`.
  - Router comment updated.
- Comment and doc tidy-ups that mentioned Sign in as me: `devices.ex` (`live_token` doc), `accounts/user.ex`, `task_board_controller.ex`, `test/support/accounts_fixtures.ex`, the `task_board_linked_test` moduledoc.
- **Follow-up commit `f341fe0`:** the staff-code lockout message was
  "Too many wrong codes. Try again in N minutes, or use Sign in as me." It now
  ends at "…N minutes." (`staff_code_acting.ex`). See LEAD question 1.
- **Tests removed:**
  - `sessions_test`:
    - "a tablet session: marked, 12 hours" is replaced by "D54: a tablet's device token is no longer an option" (`assert_raise ArgumentError`).
    - The `is_nil(row.device_token_id)` assert is dropped from the normal-session test, because the field left the schema.
    - Removed: "accepts a tablet session and touches last_seen_at…", "a tablet session dies after 15 minutes…", "an unused tablet session dies 15 minutes after sign-in" and "a tablet session never outlives 12 hours". The idle limit, touch and 12-hour cap are gone.
    - Removed the whole describe "tablet revocation ends its sessions (A5)" (4 tests). Revoking a tablet no longer touches sessions, and none exist.
  - `color_mode_test`:
    - Removed "a Sign in as me session sets its person's, not the tablet's". It can't be created any more; a person setting their own theme is still covered.
    - Removed "Sign in as me on a tablet returns the tablet's (S148)". The handover is removed.
  - `task_board_linked_test`: removed the tail of "decision 8" that wrote a linked task through a tablet Sign in as me session. The tablet refusal part stays.
  - Unused aliases cleaned up.
- Full suite: 1812 passed, with no new compile warnings (the only warning is the existing unused `require Logger` in `reminders.ex`).

## Step 3: Migration

- `priv/repo/migrations/20261102120001_revoke_tablet_personal_sessions.exs`:
  - `up`: `UPDATE user_sessions SET revoked_at = now, updated_at = now WHERE device_token_id IS NOT NULL AND revoked_at IS NULL`.
  - `down`: `:ok`, a no-op.
- **Test added:** `test/rockcut_api/migrations/revoke_tablet_personal_sessions_test.exs`. It follows the existing `task_events_department_test` pattern: down/up inside the test transaction, with rows given a `device_token_id` by raw SQL.
  - S249: a live tablet session is revoked and its token gets `:error`. An earlier-revoked tablet session keeps its original `revoked_at`. The person's own session isn't touched and still authenticates. The tablet's own device token stays live.
  - Down does nothing: the revoked session stays revoked.
- **Revert check** (WHERE changed to `WHERE 0`):
  - Reverted: 1/2 passed. S249 failed.
  - Restored: 2/2 passed.
- Full suite **twice**: 1814 passed, 1814 passed.

## Step 4: UI cleanup

- `App.tsx`:
  - Removed the `personal-signin` button with `LoginIcon`, the `personal-session-banner` and `darken`, `personalOnTablet`, the `useIdleReturn` and `useDeviceTokenWatch` calls, and the personal header branch (email + Sign out). People always get the account menu.
  - `/profile` is always routed for people. Devices never had it.
  - New device route `/login` → `SharedDeviceLoginRefused`. Before this, a tablet typing `/login` got "Not available on a shared device" from the catch-all.
- New `pages/devices/SharedDeviceLoginRefused.tsx` (testid `shared-device-login-refused`, plus a Go to Home button).
- `useAuth.ts`:
  - Removed `startPersonalSignIn` and `endPersonalSession`, plus the aside branch in `logout`.
  - `login` still sends `X-Rockcut-Device` when `localStorage.rockcut_token` is a `dev_` token.
  - A 403 from login shows `SHARED_DEVICE_LOGIN_REFUSED`.
- `Login.tsx`:
  - Removed `onSharedTablet`, the 5-minute idle return and the back-to-shared button.
  - When the stored token is `dev_`, or the error is the refusal, it shows the refusal Alert (same testid) **instead of the form**, with no submit.
  - "Set up as a shared device" stays.
- `lib/device.ts`:
  - Removed `DEVICE_TOKEN_KEY`, `PERSONAL_ACTIVITY_KEY`, `PERSONAL_IDLE_MS`, `asideDeviceToken`, `setDeviceTokenAside`, `restoreDeviceToken`, `REVOKE_TIMEOUT_MS` and `revokePersonalToken`.
  - Added `SHARED_DEVICE_LOGIN_REFUSED`.
  - Kept the sign-out retry, `isDeviceToken`, `markUnpaired` (it no longer clears the old aside keys) and `UNPAIRED_KEY`.
- `lib/api.ts`: on a 401 there's no `restoreDeviceToken` fallback any more. A device token gets `markUnpaired`; anything else clears the token.
- `useAuthStorageSync.ts`: no longer watches `rockcut_device_token`.
- `lib/updatePrompt.ts`: `personalSession` removed from `TabletState` and `tabletMayReload`. `components/UpdatePrompt.tsx` no longer passes it. Tablets still reload when idle.
- `lib/updatePrompt.test.ts`: the `"Sign in as me"` case is removed. I did this vitest change now rather than in step 7, because `tsc` would fail otherwise.
- **Files deleted** (they ended up unused):
  - `hooks/useDeviceTokenWatch.ts` (personal sessions only).
  - `hooks/useIdleReturn.ts`. Its only callers were the two personal idle returns; the plan didn't name it.
- Copy and comments:
  - `DeviceNotAvailable.tsx` now says "This page needs your own account. Use your own phone or computer." It used to point to Sign in as me.
  - Comments in `colorMode.ts`, `types.ts`, `useActing.ts` and `profile/Profile.tsx`.
- `grep "Sign in as me|aside|rockcut_device_token" src` finds nothing left except the shim.

## Step 5: Leftover state (start-up shim)

- New `src/lib/leftoverTabletSession.ts`, commented "Remove after D54 + one release". It's imported **first** in `main.tsx`, so it runs before `useAuth` reads `rockcut_token` at module load. If `rockcut_device_token` is present, it:
  - signs the personal token out on the server (best effort, `signOutOnServer`, retried by `flushSignOuts`);
  - puts the device token back in `rockcut_token`;
  - drops `rockcut_device_token`, `rockcut_personal_last_activity` and `rockcut_email`.
- After that, a live tablet opens on its tablet view. A revoked one gets a 401 on the first `/api/me` and goes through the existing `markUnpaired` path to "This tablet was unpaired" (4988).
- **Deviation from the plan's wording:** there's no `reload()`. The shim runs before any session state is read or rendered, so a reload would add nothing. See LEAD question 3.
- **Test added:** `src/lib/leftoverTabletSession.test.ts`, vitest with stubbed `localStorage` and `fetch`. It covers four cases:
  - mid personal session: token restored, keys dropped, one `DELETE /api/session` with the personal token, pending sign-out recorded;
  - abandoned sign-in form (aside token only): restored, no fetch;
  - ordinary browser: untouched;
  - paired tablet: untouched.
- **Revert check** (`if (!device) return` made unconditional):
  - Reverted: 2 failed, 2 passed (the two restore cases failed).
  - Restored: 4/4 passed.

## Step 6: Docs

- `docs/process/taproom_tablet_setup.md`: the section "A staff member using their own account on the tablet" is replaced by "Personal use: on your own phone or computer". It covers staff codes, the exact refusal text, and signing a tablet out to reuse it. The "Can't" list now mentions it too.
- `rockcut-ui/tests/COVERAGE.md`:
  - Retired rows struck through, in D51 style: D33 S13 and G2; D34 S4–S7 and S15; D37 S13; D43 S148. The D49 linked-task and D51 S3 rows are amended. D33 G3 is noted (see LEAD question 2).
  - New D54 section for S244–S252. Rows covered by step 7 are marked "(step 7)".

## Gate (non-Playwright)

| Check | Result |
|---|---|
| `MIX_ENV=test mix test` ×2 (after step 3; steps 4–6 don't touch the API) | 1814 passed, 1814 passed |
| `npx tsc --noEmit -p tsconfig.app.json` | clean |
| `pnpm exec vite build` | OK (`dist/sw.js`, 19 precache entries) |
| `pnpm exec vitest run` | 180 passed (11 files) |
| `pnpm lint` | 26 errors, 1 warning: same as `develop`, none in files I touched |
| Formatting | `mix format` on changed Elixir files only |
| Revert checks | step 1 (controller), step 3 (migration), step 5 (shim): all fail reverted, pass restored (above) |

Not run: Playwright (step 7, needs servers).

## Step 7 inventory (for when servers are up)

The plan's list, plus specs it doesn't name that still reference the removed UI:

- Delete: `regression/devices/personal_signin.spec.ts`, `regression/devices/personal_signin_revoke.spec.ts`.
- Trim: `tablet_idle`, `device_header`, `device_signout`, `pwa-update/update_prompt`, `ui/theme`, `regression/auth/helpers.ts` (plan).
- **Also affected (not in the plan):**
  - `regression/devices/device_session.spec.ts:27` expects `personal-signin` to be visible. Flip it to S244's "not there".
  - `regression/taproom/beer-board-device.spec.ts`: the test "S13: Sign in as me on the tablet, then Redeem" (line 110) must go. Its mocked 429 lockout message (lines 74 and 82) still has the old "…or use Sign in as me." text. The mock passes either way, but I'll update it to match the API.
  - `regression/tasks/task-board-tablets.spec.ts:212`: the same mocked message text.
- New: `regression/devices/shared_device_no_personal_login.spec.ts` (S244, S245, S246 via API, S248, S251) plus the seeded leftover-state test for S249.

## LEAD:

1. **Staff-code lockout text.** The spec says staff codes stay exactly as they
   are, but the 429 message told people to "use Sign in as me". I cut that
   clause (`f341fe0`, text only; the code, window and limits are unchanged). OK,
   or would you rather keep it and handle it separately?
2. **Lost coverage: two-tab re-sync (D33 G3).** The only Playwright test of
   "another tab signs in/out → this tab reloads" was in `personal_signin`.
   `useAuthStorageSync` stays for normal sessions. Should I add a small
   two-tab case to the new spec in step 7, or leave it uncovered?
3. **Shim without a reload.** The plan says "reload → tablet view". The shim
   runs at import time before the auth store exists, so I left the reload out.
   The one thing it skips is clearing memory from the old bundle, and that
   memory doesn't exist at that point. Fine?
4. **API theme handover removed.** `Accounts.effective_color_mode/2` and its
   tests went in step 2. They were the API half of "D43's tablet theme
   handover" and read the association I dropped. Just flagging that it wasn't
   in the plan's step 2 list.
5. **Ready for step 7.** Please start the API (4002) and UI (5174) servers from
   this worktree (the dev DB is migrated and seeded) and tell me when they're up.

---

# Stop point 2: step 7 (2026-11-04)

Run against the lead's servers from `~/src/rockcut-d54` (API :4002, UI :5174),
following `d54_lead_decisions_1.md`. Commit `65dba37`
(test: D54 Playwright for no personal logins on shared tablets). Not pushed.
I didn't run the full suite; the lead runs it.

## What changed

**New spec** `tests/regression/devices/shared_device_no_personal_login.spec.ts`
(11 tests). People are `[TEST-TEMP]` and tablets are `[TEST-TEMP]` devices
paired through the API. The shared `taproomDevice` token is only read, never revoked.

| Test | Covers |
|---|---|
| S244 | `taproomDevice` header: pill + Sign out, no `personal-signin`, no "Sign in…" button, no banner |
| S245 | typed `/login`: `shared-device-login-refused` with the exact text; no email, password or submit; still paired |
| S246 | API: live `taproomDevice` header, right and wrong password → 403 `{error: REFUSAL}`. Persist-verified: signed in normally, *Sign out of all other devices* revokes 0, so no row was made. The tablet still answers 200. |
| S248 | API: the header refuses while the temp tablet is live, then it's revoked → normal 200 login, and the token works |
| S249 | seeded pre-D54 storage (person `ses_` in the slot, live device token aside, last-activity, email): opens on the tablet view; the keys are cleared; the person's token turns 401 on the server; the device token stays 200; still the tablet after a reload |
| S251 (4988) | only a revoked `rockcut_device_token` in storage → "This tablet was unpaired" setup screen, no sign-in form |
| S251 | a paired temp tablet revoked by the owner → unpaired on reload |
| refused form | the login form, with the API's 403 mocked → the refusal replaces the form |
| D33 G3 (decision 2) | a temp person in two tabs; tab A logs out → tab B reloads to the sign-in page, its token gone, the session 401 |

**Deleted:**
- `devices/personal_signin.spec.ts` and `devices/personal_signin_revoke.spec.ts` (plan).
- `devices/tablet_idle.spec.ts`. Both of its tests (D36-G: another tab's activity keeps a Sign in as me session; D36-I: an abandoned Sign in as me form returns) were personal-session only, so nothing was left to trim.

**Trimmed:**

| Spec | Change | Why |
|---|---|---|
| `devices/device_header` | measures `device-signout` instead of the Sign in as me button; asserts the button is gone | the button no longer exists |
| `devices/device_signout` | removed "G4: a stale tab's person Logout never unpairs the tablet" | it needed a personal session on the tablet |
| `devices/device_session` | S6 now expects `personal-signin` to have count 0 | S244 |
| `pwa-update/update_prompt` | removed S176 ("Sign in as me gets the prompt and no reload"); dropped the unused `claimSpare` import | `personalSession` left `tabletMayReload` |
| `ui/theme` | removed S148 and the now-unused temp-person import; header comment fixed | the theme handover is removed |
| `taproom/beer-board-device` | removed S13 (Sign in as me → Redeem); the mocked 429 text and its assertion now match the new lockout text | decisions 1 and 5 |
| `tasks/task-board-tablets` | the mocked 429 text matches the new text | decision 1 |
| `auth/helpers.ts` | `signIn` lost its `deviceToken` parameter (only S13 used it); `logOut` comment fixed | |

`tests/COVERAGE.md`: the D54 rows now point to the actual tests, D33 G3 points
to the new two-tab case, and no "(step 7)" placeholders are left.

## Runs (all with `caffeinate -ims`)

| Run | Result |
|---|---|
| `npx playwright test --project setup` | 1 passed |
| `--project=chromium --no-deps`: the new spec, `device_header`, `device_signout`, `device_session`, `ui/theme`, `taproom/beer-board-device` | **44 passed** (1.2 m) |
| `--project=brewery-board --no-deps tests/regression/tasks/task-board-tablets.spec.ts` | **10 passed** |
| `PWA_UPDATE=1 --project=pwa-update --no-deps tests/pwa-update/update_prompt.spec.ts` | **8 passed** (3.3 m) |
| `tsc -p tsconfig.e2e.json` | no errors in touched files. Two errors in untouched files (`brewery/task-board-phone.spec.ts:443`, `taproom/beer-board-import.spec.ts:40`); I didn't check whether `develop` has them too |

**Revert check (4988 / S249, the bug-fix part).** I reverted the shim
(`if (!device) return` made unconditional) against the running dev server and
ran `-g "S249|S251"`:
- Reverted: **2 failed, 1 passed**. "S251 (4988)" didn't show the unpaired notice, and "S249" didn't reach the tablet view. The owner-revoke S251 passed, which is expected because it doesn't depend on the shim.
- Restored: **3 passed**. `git diff` on the shim was empty afterwards.

## Notes for the full run / DEV

- `shared_device_no_personal_login` pairs four `[TEST-TEMP]` tablets per run
  through `POST /api/device_tokens` from 127.0.0.1. Locally the limit is raised
  (`config/dev.exs`), but on DEV it adds to the per-network pairing limiter
  (5 wrong codes / 10 min only counts *wrong* codes, so this should be fine).
- The S249 Playwright test fakes the leftover state. The real path still
  needs the DEV check in the plan's LIMITATIONS (start a personal session on
  `develop`, then deploy the branch).

## LEAD:

None. Ready for the full local suite.

---

# Fix cycle 1 (2026-11-04)

Following `d54_lead_decisions_2.md`, from the DEV QA report (build `ca5d9be`).
Run against the local servers from `~/src/rockcut-d54`, after
`mix rockcut.synthetic.setup` and `npx playwright test --project setup`. Not pushed.

| SHA | Fix | Message |
|---|---|---|
| `4536d76` | G1 | fix: D54 refuse a live tablet token in Authorization too |
| `e28d27c` | G5 | fix: D54 pairing ends on the tablet's Home |

## G1: live tablet token in `Authorization`

- `SessionController.signing_in_on/1` now checks `X-Rockcut-Device` and the
  `Authorization: Bearer` token through `Devices.live_token/1`. A live token in
  either one refuses, still before the password. Stale, revoked, made-up and
  person tokens stay ignored in both.
- **Tests added** (`session_revocation_test`, S253):
  - A live token in `Authorization` only: 403 with the refusal text for the right and a wrong password, no `user_sessions` row, and the tablet still answers 200.
  - A live token in `Authorization` with a made-up `X-Rockcut-Device`: 403. (Not in the decisions; it stops a junk header from hiding a live token.)
  - A revoked device token, `dev_made-up`, a person's `ses_` token or garbage in `Authorization`: normal login.
- **Revert check** (tests written before the fix, against the old controller):
  - Without the fix: 20/22 passed. Both 403 tests failed.
  - With the fix: 22/22 passed.

**The QA report's open question (what did the old shell send?):** I read the
code on `develop` and didn't run an old shell. "Sign in as me" removes the
device token from `rockcut_token` (`setDeviceTokenAside`), so `Authorization`
isn't sent, and `login` sends the set-aside token in `X-Rockcut-Device`. The API
already refused that request before this fix, so an old cached shell never
reaches the G1 path. G1 stays fixed as decided, but it wasn't an old-shell hole.

## G5: pairing ends on Home

- `useAuth.pairDevice` now calls `window.location.assign('/')` once the token is
  stored, replacing the in-page `set` + `loadMe`. Tablet sign-out and the
  other-tab sync reload the same way. The form stays on "Setting up..." until the
  page reloads, so the refusal never flashes. A failed pairing still shows its
  error on the form.
- Pairing from any other URL now also ends on Home. Before, it stayed on that
  URL (the spec says "from any URL").
- **Tests added** (`shared_device_no_personal_login`, S254): a blank browser
  types `/login`, or `/schedule`, then pairs with a valid code. It ends on `/`
  with the device chip and no refusal, and is the same after a reload.
- **Revert check** (spec written before the fix):
  - Without the fix: 2 failed, on the pathname staying off `/`.
  - With the fix: 2 passed.
- `tests/COVERAGE.md`: S253 and S254 rows added (committed with G5).

## Gate

| Check | Result |
|---|---|
| `MIX_ENV=test mix test` (once) | 1817 passed |
| `npx tsc --noEmit -p tsconfig.app.json` | clean |
| `pnpm exec vite build` | OK (`dist/sw.js`, 19 precache entries) |
| `pnpm exec vitest run` | 180 passed (11 files) |
| `pnpm lint` | 26 errors, 1 warning: no worse than the limit of 26 |
| `--project=chromium --no-deps tests/regression/devices tests/regression/auth` | **55 passed** (38 devices, 17 auth; 1.1 m) |

Not run: the wider Playwright suites (the lead runs them). The fixes haven't been
deployed to DEV. Nothing else was changed: G2, G3, G4, G6, G7 and the single-401
unpairing are untouched, as decided.

## LEAD:

None. Ready for the wider suites and DEV.
