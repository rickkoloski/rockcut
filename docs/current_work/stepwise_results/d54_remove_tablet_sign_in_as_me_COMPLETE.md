# D54: Remove "Sign in as me" from shared tablets — Complete

**Spec:** `specs/d54_remove_tablet_sign_in_as_me_spec.md`
**Plan:** `planning/d54_remove_tablet_sign_in_as_me_plan.md`
**Completed:** 2026-11-06 (on prod as `v2026.11.04`). **Matt's sign-in and tablet checks are still open: task 5164.**

---

## Summary

A paired tablet no longer takes personal logins. People use their own phone or computer for anything personal; staff codes are unchanged. It removes D33's Sign in as me, D34's tablet sessions, the idle return and the tablet theme handover, and folds in 4988.

## What Was Built

- `SessionController.create/2`: a live device token in `X-Rockcut-Device` or `Authorization: Bearer` gets 403 "This device is already set as a shared device. Personal logins not accepted.", before any user lookup. Stale, revoked, made-up and person tokens are ignored.
- API removed: tablet sessions from `Sessions` (`create/3` raises on `:device_token`), the idle limit and 12-hour cap, `revoke_for_device_tokens`, the profile guards, `Accounts.effective_color_mode/2`.
- UI removed: the button, the personal-session banner, `useDeviceTokenWatch`, `useIdleReturn`, the set-aside token, the personal branch of the reload prompt.
- `pages/devices/SharedDeviceLoginRefused.tsx`: `/login` on a paired tablet. Pairing from any URL ends on Home (QA G5).
- `lib/leftoverTabletSession.ts`: a start-up shim for a tablet left mid personal session. **Remove after D54 + one release.**
- The staff-code lockout message no longer mentions Sign in as me.

### Migration

`20261102120001_revoke_tablet_personal_sessions` (data only; `down` is a no-op). `user_sessions.device_token_id` stays, unread, for rollback; drop it in a later release.

## Testing

- Local at `3341faf`: `mix test` 1817 passed; vitest 180; tsc / vite build clean; lint unchanged at 26 errors; Playwright 580 passed, 1 skipped.
- `pwa-update`: 8 passed before fix cycle 1, not rerun after it.
- Revert-and-rerun: the refusal, the migration, the shim, G1, G5.
- DEV at `3341faf`: 578 passed, 1 failed, 2 did not run. S48 (`staff-codes`) timed out finding a row in the Users grid; 3/3 alone. `board-replace` 2/2. P83–P84 failed once on `ca5d9be` and passed after. Causes of both one-off failures are unproven; neither is in D54's code.
- Independent QA on `ca5d9be`: `stepwise_results/d54_dev_qa_report.md`. G1 and G5 fixed; QA was not rerun on the fixes (G1 checked directly on DEV, G5 by Playwright on DEV).
- Pixel on DEV (Matt): the old cached app against the D54 API shows the refusal; back to shared returns to the tablet view.
- **Not run anywhere yet:** a paired tablet updating from the old app to the new one. The lead's reseed deleted the `[TEST-TEMP]` Pixel tablet before it could update. Matt accepted checking this on the real tablets (task 5164).

## Release

- PR #48 → `develop` (`da80205`); release PR #49 squash `d37e4b6`; tag `v2026.11.04`.
- Prod API v32 `registry.fly.io/rockcut-api:deployment-01M6N73C1ZTGKPQXYRN01Z8PAF`, UI v29 `registry.fly.io/rockcut-ui:deployment-01M6N75MXVFFZ13DYSTQ124GB4`.
- Rollback: API v31 `…deployment-01M66H3S4P6DJTH8Y4GA97CYX4`, UI v28 `…deployment-01M66H4WXJVZHS9ZVY1W5C1XRD`; snapshot `vs_JblapqvV0k91Uve2XYXak7k2`.
- Agent smoke green except `mix hex.audit` (ecto, phoenix_html; lockfiles unchanged by this release; task 5121). 0 live tablet sessions before and after; 3 pairings intact.

## Follow-ups

- **5164:** Matt's sign-in and three tablet checks.
- **5121:** ecto (HIGH) and phoenix_html (MEDIUM) advisories; hotfix or next release is Matt's call.
- 5119 (unknown URLs on a tablet), 5120 (a single 401 unpairs a tablet).
- Later: remove the shim; drop `user_sessions.device_token_id`.
