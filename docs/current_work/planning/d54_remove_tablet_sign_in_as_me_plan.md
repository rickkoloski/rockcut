# D54: Remove "Sign in as me" from shared tablets — Plan

2026-11-02 · lead. **Spec:** `specs/d54_remove_tablet_sign_in_as_me_spec.md`
(approved). **Task:** 5064. **Branch:** `d54-remove-tablet-sign-in` in the
worktree `~/src/rockcut-d54` (from `develop` @ `2f48dd0`).

## How it works today (what we're removing)

- A paired tablet's `dev_` token lives in `localStorage.rockcut_token`.
- **Sign in as me** (`useAuth.startPersonalSignIn`) moves it to
  `rockcut_device_token` (`setDeviceTokenAside`) and shows the login form.
  The login sends the aside token as `X-Rockcut-Device`, and
  `SessionController.signing_in_on/1` marks the new session with
  `device_token_id` (15-minute idle max-age in `Sessions`).
- While signed in personally: `App.tsx` runs `useIdleReturn(…5 min…)` and
  `useDeviceTokenWatch` (unpaired while personal), shows the
  personal-session banner and hides `/profile`; `api.ts` falls back to the
  tablet on a 401; `updatePrompt` won't reload; `colorMode` uses the tablet's
  theme; `endPersonalSession` revokes the personal token and restores the
  device token (`restoreDeviceToken`).
- Revoking a tablet (`Devices.revoke_token/3`) also revokes its personal
  sessions.

## Steps (each its own commit)

1. **API refusal** (`SessionController.create/2`): if `X-Rockcut-Device`
   holds a **live** device token (`Devices.live_token/1`), 403 with the spec's
   message before the password check. Stale/revoked → ignored. ExUnit: live
   → 403 for right and wrong passwords and no `user_sessions` row; revoked
   → 200; no header → 200. Revert check on the live case.
2. **API cleanup:** `Sessions.create/2` drops `:device_token`,
   `@tablet_max_age_seconds`, `tablet_ok?`, tablet `touch`;
   `revoke_for_device_tokens` and its call in `Devices.revoke_token/3`; the
   `on_tablet?`/`tablet_refused` profile guards. `UserSession` keeps the
   `device_token_id` field in the DB but the schema may drop it (it's
   nullable; a rolled-back image still reads it). Remove or rewrite the
   tests whose subject was tablet sessions; say which.
3. **Migration** `revoke_tablet_personal_sessions`: `UPDATE user_sessions
   SET revoked_at = <now> WHERE device_token_id IS NOT NULL AND revoked_at
   IS NULL`; `down` is a no-op. ExUnit for it (insert rows, run, check).
4. **UI cleanup:**
   - `App.tsx`: remove the Sign in as me button (`personal-signin`), the
     personal banner, `personalOnTablet`, its `useIdleReturn` and
     `useDeviceTokenWatch` use; `/profile` is never shown to a device anyway
     (check).
   - `useAuth`: remove `startPersonalSignIn`, `endPersonalSession`, the
     `X-Rockcut-Device` aside logic in `login`. **Keep** sending
     `X-Rockcut-Device` when the current `rockcut_token` is a `dev_` token
     (so the API refusal works if the login form is ever submitted on a
     tablet).
   - `lib/device.ts`: remove `setDeviceTokenAside`, `restoreDeviceToken`
     (see step 5), `PERSONAL_*`, `revokePersonalToken`,
     `REVOKE_TIMEOUT_MS`; keep sign-out retry (`signOutOnServer`,
     `flushSignOuts`), `isDeviceToken`, `markUnpaired`, `UNPAIRED_KEY`.
   - `useDeviceTokenWatch`, `useAuthStorageSync`, `api.ts`,
     `updatePrompt.ts` (`personalSession` goes from `TabletState`),
     `colorMode.ts`, `Login.tsx` (`onSharedTablet`, back-to-shared button,
     its idle return): remove the personal paths. Delete files that end up
     empty.
   - **Login on a paired tablet:** if `rockcut_token` is a `dev_` token and
     the person reaches `/login`, show the refusal text (testid
     `shared-device-login-refused`) and no form. Map the API's 403 to the
     same text.
5. **Leftover state from before the release** (client side, one-time, at
   start-up): if `rockcut_device_token` is present —
   - a tablet mid personal session at deploy: revoke the personal token
     (best effort, `signOutOnServer`), put the device token back in
     `rockcut_token`, drop `rockcut_device_token` and
     `rockcut_personal_last_activity`, reload → tablet view (S249);
   - if that device token is then refused (401), the existing
     `markUnpaired` path shows "This tablet was unpaired" straight away
     (task 4988, S251).
   Keep this shim small and commented "remove after D54 + one release".
6. **Docs:** `taproom_tablet_setup.md` (remove the section, add the
   refusal), `tests/COVERAGE.md`.
7. **Tests:** delete `personal_signin.spec.ts`,
   `personal_signin_revoke.spec.ts`; trim `tablet_idle`, `device_header`,
   `device_signout`, `pwa-update/update_prompt`, `ui/theme`,
   `regression/auth/helpers.ts`; vitest for `updatePrompt`. New Playwright
   `regression/devices/shared_device_no_personal_login.spec.ts` for S244,
   S245, S246 (API), S248, S251, plus a seeded leftover-state test for S249
   (`rockcut_device_token` + a personal token in storage on load).

## Gate

Workflow §3 local gate: `mix test` (twice), `tsc`, `vite build`, vitest,
lint no worse than `develop` (26 errors), full local Playwright including
`regression/devices` and `regression/auth`. Revert check for step 1.

## Handoff LIMITATIONS to carry to DEV

- The leftover-state shim (step 5) can only be faked locally; on DEV, pair
  the `taproomDevice` and start a personal session **on `develop` before
  deploying the branch**, then deploy and watch the tablet.
- The migration runs against DEV's real `user_sessions`.
