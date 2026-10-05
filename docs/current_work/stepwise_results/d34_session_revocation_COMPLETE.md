# D34: Revocable Sign-in Sessions and Profile Page — Completion Record

**Status:** COMPLETE. On prod since 2026-10-05 (~00:30 UTC) in release
`v2026.10.04` (`e35fd3f`, PR #11; API v22, UI v18). Matt's prod check
passed: he signed out and back in, and the Profile page works.
**Spec:** `specs/d34_session_revocation_spec.md` (approved 2026-10-02, Q1–Q5) ·
**Plan:** `planning/d34_session_revocation_plan.md`
**Concept:** 04_auth
**Branch:** `d34-session-revocation`, PR #9, merged 2026-10-04 as `d0acf1e`.
DEV gate SHA **`a0846b3`**.
**Backlog:** PortableMind project 254, task 3991 (closed).
**QA reports:** `stepwise_results/d34_dev_pass_1_qa_report.md`,
`d34_dev_pass_2_qa_report.md`, `d34_dev_pass_3_qa_report.md`

---

## Summary

Signing out now really ends a session on the server. Each sign-in is a
revocable `user_sessions` row, and only an HMAC hash of the `ses_` token is
stored. People get a **Profile** page with Change password and Sign out of
all other devices. On the shared taproom tablets, a "Sign in as me" session
is marked as a tablet sign-in. It ends on the server at sign-out or the
5-minute idle return, and lapses after 15 idle minutes (12 hours at most) if
the tablet can't reach the server.

## What shipped

- **Sessions:**
  - the `user_sessions` table, holding the token hash, expiry, `last_seen_at`
    (written only for tablet sessions, for the idle limit), `revoked_at`, and
    `device_token_id` when the session was signed in on a tablet;
  - sign-out revokes the session it was sent with;
  - an owner's password reset, a password change, and deactivation sign the
    person out everywhere.
- **Tokens from before D34 (Q1)** are honored until they expire (at most 30
  days), so the deploy signed nobody out. A per-user cutoff,
  `users.legacy_tokens_revoked_at`, kills one person's old tokens.
- **Profile page (Q3, Q4):**
  - read-only details;
  - Change password (it refuses the current password as the new one);
  - Sign out of all other devices;
  - the owner is pointed to Users & Roles for changes;
  - neither action is available during "Sign in as me": the UI hides them
    and the server answers 403, except to finish a forced reset.
- **Show/hide eye button (Q5)** on every typed password field.
- **Can't reach the server.** At start-up, only a 401 ends a session. If the
  device is offline, a proxy answers with an error status, the request
  hangs (15 s timeout) or a captive Wi-Fi page answers, the app keeps the
  token and shows "Can't reach the server, retrying…" with a "Try now"
  button. It retries every 10 s and when the device comes back online.
  - This fixes a prod bug from D33: a Wi-Fi drop could wipe a tablet's
    pairing.
- **Service worker:** the navigation denylist matches whole path segments.
  The old `/dev` prefix also caught `/devices`, which then failed to load
  offline on prod.

52 files changed, +3306 / −198 (merge `d0acf1e`).
**Migrations (2, additive):** `create_user_sessions`,
`add_legacy_tokens_revoked_at_to_users`. There's no new secret: the hashes
are keyed by `SECRET_KEY_BASE`.

## Testing

- **Local:**
  - `mix test`: 851 tests at merge (847 before the DEV fixes);
  - Playwright: 120 passed, 1 skipped;
  - revert-and-rerun recorded for every fix.
- **DEV:**
  - 4 fix cycles plus 2 more after the QA passes, all authorized by Matt;
  - final full suite: **121/121** (run 16 at `a0846b3`).
- **Three independent passes:**
  - pass 1 FAIL: the offline idle return unpaired the tablet;
  - pass 2 PASS with gaps: a 404/408/429 at start-up did the same, and a
    hung check showed only a spinner;
  - pass 3 PASS with gaps: "Try now" did nothing while a check was stalled,
    and the service worker skipped `/devices`;
  - every must-fix was fixed with a test that fails without it.
- **Prod smoke (v2026.10.04):** green. Matt's own sign-in and Profile check
  passed.

## Follow-Up

- **Task 4058, due 2026-11-04:** remove the pre-D34 token path,
  `legacy_tokens_revoked_at`, synthetic-salt verification, and the 22 test
  files that sign legacy tokens.
- **Backlog accepted by Matt:**
  - 4050: each tablet tab keeps its own idle timer;
  - 4051: a Logout while offline isn't retried;
  - 4052: "Sign in as me" left open never returns to the shared screen;
  - 4053: a blank page on a null `data` reply;
  - 4057: the flaky "Try now" spec on DEV.
- **Pair the prod tablets.** It's still open, and safe now that D34 is live.
