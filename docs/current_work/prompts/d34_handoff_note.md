# D34 handoff note (PR description)

**Deliverable:** D34 — Revocable sign-in sessions and profile page (task 3991)
**Spec:** `docs/current_work/specs/d34_session_revocation_spec.md` · **Plan:** `docs/current_work/planning/d34_session_revocation_plan.md`
**Branch:** `d34-session-revocation` · **SHA for DEV:** `46eb90e`

## What changed

- **API.** A sign-in is now a `user_sessions` row with a hashed `ses_` token.
  - Revocation:
    - **sign-out** revokes the session it was sent with;
    - **`DELETE /api/sessions/others`** revokes every other session of yours;
    - **a password change** revokes your other sessions;
    - **an owner's reset** revokes all of them.
  - **Tablet sign-ins.** "Sign in as me" sends `X-Rockcut-Device`, which marks
    the session as a tablet sign-in. A marked session:
    - lasts 15 idle minutes, and 12 hours at most;
    - dies when its tablet is revoked, deactivated or deleted.
  - **Pre-D34 tokens** are honored until they expire (30 days at most). After
    a reset, a password change or "sign out others", all of that person's
    pre-D34 tokens are refused (`users.legacy_tokens_revoked_at`).
  - **Synthetic persona tokens** are now real `ses_` sessions, and are refused
    wherever the seed guard is off.
  - **CORS** allows the `X-Rockcut-Device` header.
- **UI.**
  - **`/profile`:** your details (read-only), Change password, and Sign out of
    all other devices. It's reached from the email in the top bar, or the
    account icon at phone width. It isn't available to a device or during a
    personal sign-in on a tablet.
  - **Show/hide toggle:** `PasswordField` on the login form, the forced reset
    and the profile.
  - **Tablet:** Sign out and the idle return revoke the personal session
    (best effort, 3 s timeout).
- **Bug fixed on the way.** Logout's `DELETE /api/session` went out with no
  token, because the request interceptor ran after `removeItem`. It was
  harmless before D34 and would have meant no revoke after it.

## Migrations

Yes, two, both additive and reversible:
- `create_user_sessions`;
- `add_legacy_tokens_revoked_at_to_users`.

They run at boot.

**Rollback signs everyone out once:** the old code can't read `ses_` tokens.

## Local gate (at `46eb90e`)

- [x] **`mix test`:** 846 tests, 0 failures (42 new).
- [x] **UI checks:**
  - `tsc` (app and e2e): clean;
  - `vite build`: OK;
  - `pnpm lint`: 27, unchanged, none in D34 files.
- [x] **Playwright local:** 109 passed, 1 skipped (the DEV-only banner).
  - New specs: `auth/session_revocation`, `auth/profile`,
    `auth/password_toggle`, `devices/personal_signin_revoke`.
  - Updated: `devices/personal_signin` and `devices/device_signout` (now
    throwaway people), and `smoke/login` (test-id selector, since the label
    now also matches "Show password").
- [x] **Revert-and-rerun:**
  - ExUnit S2 with `Sessions.revoke` stubbed out → fails (200 ≠ 401);
    restored → passes.
  - Playwright S2 with the Logout fix reverted → fails (DELETE 401);
    restored → passes.
- [x] **Persist-verify:**
  - S14: reload, then check the other tokens' `/api/me`;
  - S18: reload, then the new password signs in and the other session gets 401.

## Scenarios DEV must exercise

All 22 (spec §4). In particular:
- S4–S7 on a paired tablet;
- S14 and S18 across two browsers;
- S20 as `taproomDevice`;
- S21 at phone width.

## ⚠ LIMITATIONS: what local could NOT tell us

1. **CORS for `X-Rockcut-Device`.** Locally the UI and API share an origin
   through the vite proxy, so the preflight never ran. On DEV, check that a
   typed "Sign in as me" succeeds and is marked: the request carries the
   header, and the session dies when the tablet is revoked (S7).
2. **SQLite single connection.** Every `ses_` request does one indexed read,
   plus a `last_seen_at` write at most once a minute per session. Watch DEV
   logs for `database is locked` during the full parallel suite.
3. **Synthetic mint on a release build.** `mint_tokens_json()` now inserts
   session rows. `fly ssh … eval` starts only the repo; `Tokens.hash` reads
   the endpoint config. `auth.setup` against DEV is the first real test of
   this.
4. **Real tablet offline or asleep at the idle return (S6).** This was
   emulated by aborting the DELETE. A real dropped network and a real
   15-minute server lapse are manual (Pixel, DEV).
5. **The pre-D34 path** is covered only by ExUnit with signed tokens. DEV has
   no real pre-D34 tokens unless one was minted before the deploy. If
   possible, mint a token before deploying and check it still works after.
6. **Rollback behavior** (everyone signed out) is reasoned, not tested.
7. **Throwaway `[TEST-TEMP]` people.** Specs create them through the owner
   API with a password the spec generates (never the seed password). `setup`
   now deletes them; on DEV, `seed_synthetic()` cleans them.

## Follow-up to file at release

- Remove the pre-D34 token path, `users.legacy_tokens_revoked_at` and
  synthetic-salt verification, and move the 22 test files that sign legacy
  tokens to sessions. Due about 30 days after the D34 release.
