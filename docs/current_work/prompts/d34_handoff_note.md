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

## DEV gate

- **Automated:** 4 fix cycles (`0086bfe`, `6c5fb25`, `cb335d1`, `8f3f12a`).
  The 4th was authorized by Matt after independent pass 1.
  - Run 13 at `cb335d1`: 110/110.
  - **Run 14 at `8f3f12a`** (API v18 / UI v11): **112/112**. The API log had
    no errors and no `dropped from queue`.
- **Verified on DEV by the lead:**
  - migrations ran at boot;
  - the CORS preflight allows `X-Rockcut-Device`;
  - a pre-D34 token minted before the deploy still worked after it (S12);
  - the bundle check passes.
- **Independent pass 1** (`stepwise_results/d34_dev_pass_1_qa_report.md`):
  19 PASS, 1 FAIL (S6), 2 NOT RUN (S12/S13). Four gaps, all fixed in
  `8f3f12a`, each with a test that fails when the fix is reverted:
  - **G1 (must-fix):** a network drop at the idle return wiped the tablet's
    pairing. `loadMe` now keeps the token on a network error or 5xx, shows
    "Can't reach the server, retrying…", and retries every 10 s and on
    `online`. Only a 401 signs out.
    - Spec: `personal_signin_revoke` "G1". Revert-and-rerun recorded.
    - On DEV, the lead reran QA's repro with a real `setOffline` on the
      SW-controlled PWA: the device token was kept through the idle return
      and an offline reload, and the tablet session came back once online.
  - **G2:** a "Sign in as me" session gets 403 from
    `DELETE /api/sessions/others` and `POST /api/session/password`, except
    to finish a forced reset. Covered by ExUnit, and confirmed 403/403 on DEV.
  - **G3:** Change password refuses the current password ("The new password
    must be different"). Covered by ExUnit and `profile` S19.
  - **G4:** the owner's profile says "Change these in Users & Roles."
    Covered by `profile` "S17 the owner".
- **Independent pass 2** (`stepwise_results/d34_dev_pass_2_qa_report.md`, at
  `8f3f12a`): PASS with gaps. 20 PASS, 0 FAIL, 2 NOT RUN (S12/S13).
  - **Pass 1's four gaps are confirmed fixed**, including a real offline drop
    and 500/502/503 errors.
  - **G1 (must-fix), fixed in `e708a70`:** a 404/408/429 from `/api/me` at
    start-up still unpaired a tablet. Now only a 401 ends a session.
  - **G4, fixed in `e708a70`:** a hung `/api/me`, or a captive Wi-Fi page,
    left only a bare spinner. Now `/api/me` times out after 15 s, and a
    non-`/api/me` answer counts as unreachable.
  - Spec `personal_signin_revoke` "G1/G4" covers 404, 408, 429, 503, a
    captive page and no answer. Revert-and-rerun: 5 of 6 fail on the old rule.
  - **Minor, not fixed (backlog candidates, Matt to accept):**
    - G2: two tabs on a tablet each keep their own idle timer, so the idle
      tab ends the session early. This fails safe.
    - G3: Logout while offline is never retried, so that session lives for
      its 30 days on the server.
    - G5: "Sign in as me" left open with no sign-in never returns to the
      shared screen.
- **Run 15 at `e708a70`** (API v18 / UI v12; only the UI changed):
  - 117/118: a setup `PATCH` timed out at 20 s, the intermittent DEV
    connection hang from cycle 3. That spec file passed 6/6 on rerun.
  - The API log had no errors.
  - Local at `e708a70`: 117 passed, 1 skipped.

- **Independent pass 3** (`stepwise_results/d34_dev_pass_3_qa_report.md`, at
  `e708a70`, focused on start-up when the server can't be reached): PASS with
  minor gaps. 7 PASS, 1 FAIL (T2, minor), 0 NOT RUN.
  - Every failure kept the session or pairing and recovered on its own:
    offline, 4xx/5xx, no answer, captive page. Only a 401 ended a session.
  - **G1, fixed in `a0846b3`:** "Try now" did nothing while a retry was
    stalled. Now "Try now" and coming back online replace the stalled check.
  - **G2, fixed in `a0846b3`:** the service worker skipped `/devices` (its
    `/^\/dev/` pattern dates from D21, and prod has it too). It now matches
    whole path segments.
  - Both specs fail on the old code.
  - On DEV, the lead checked that an offline reload of `/devices` on the
    installed PWA shows the retry screen and recovers.
  - **Minor, filed as backlog:** G3, an idle-return revoke during an outage
    isn't retried (the 15-minute rule covers it); and a blank page if
    `/api/channels` or `/api/departments` return `{"data":null}`.
- **Run 16 at `a0846b3`** (API v18 / UI v13): **121/121**, no API errors.
  Local: 120 passed, 1 skipped.

- **Local gate at `8f3f12a`:**
  - `mix test`: 851 tests, 0 failures.
  - `vite build` OK; lint 27 (the baseline).
  - Playwright: 111 passed, 1 skipped (the DEV-only banner).

## Follow-up to file at release

- Remove the pre-D34 token path, `users.legacy_tokens_revoked_at` and
  synthetic-salt verification, and move the 22 test files that sign legacy
  tokens to sessions. Due about 30 days after the D34 release.
