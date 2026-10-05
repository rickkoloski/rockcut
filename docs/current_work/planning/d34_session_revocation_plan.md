# D34: Revocable Sign-in Sessions and Profile Page — Plan

**Spec:** `docs/current_work/specs/d34_session_revocation_spec.md` (approved 2026-10-02)
**Branch:** `d34-session-revocation`, from `develop` (`8b4ca06`)
**Backlog:** task 3991
**Mode:** simple (Matt + one builder; a fresh qa agent for the DEV pass)

---

## 1. Shape of the change

```
POST /api/session ──▶ Sessions.create(user, device_token?) ──▶ user_sessions row ──▶ "ses_…"
AuthPlug: "dev_…" → Devices (unchanged)
          "ses_…" → Sessions.authenticate  (hash lookup, revoked/expired/idle, tablet still paired)
          other   → legacy Phoenix.Token   (until it expires, unless users.legacy_tokens_revoked_at)
```

Revocation points: `DELETE /api/session`, `DELETE /api/sessions/others`,
`change_password`, `reset_password`, and the tablet (its token revoked,
its device deactivated or deleted).

## 2. API (`rockcut_api`)

### 2.1 Migrations (two, additive, reversible)

1. `create_user_sessions`:
   - `user_id` → users, `on_delete: :delete_all`, not null;
   - `token_hash` binary, unique index;
   - `device_token_id` → device_tokens, `on_delete: :delete_all`, nullable,
     indexed: a session started on a tablet dies with the tablet row;
   - `expires_at`, `last_seen_at`, `revoked_at` (utc_datetime); timestamps;
   - index on `[user_id, revoked_at]`.
2. `add_legacy_tokens_revoked_at_to_users`: `users.legacy_tokens_revoked_at`
   utc_datetime, nullable.

### 2.2 `RockcutApi.Tokens` (new, small)

- `hash/1` moved from `Devices` (same HMAC-SHA256 keyed by
  `secret_key_base`); `Devices.hash/1` delegates, so nothing else changes.
- `random/1`: `prefix <> 32 random bytes, base64url`. `Devices.issue_token`
  uses it.

### 2.3 `RockcutApi.Sessions` (new context) + `Sessions.UserSession` schema

| Function | Does |
|---|---|
| `create(user, opts)` | Inserts a row; `opts[:device_token]` (a live `DeviceToken`) marks it and sets the tablet lifetime. Normal: `expires_at = now + 30 d`. Tablet: `expires_at = now + 12 h`. Prunes the user's rows expired/revoked > 7 days ago. Returns `{token, row}`. |
| `authenticate(token, now)` | `ses_` only. Row by hash; refuses revoked, `expires_at <= now`, tablet row idle (`last_seen_at || inserted_at` older than 15 min), tablet row whose `device_tokens.revoked_at` is set; user active and not a device. Touches `last_seen_at` at most once a minute (same pattern as `Devices.touch/2`). Returns `{:ok, user, row}` or `:error`. |
| `revoke(row)` | Sets `revoked_at` (idempotent). |
| `revoke_all(user, except: row_or_nil)` | `update_all` on the user's unrevoked rows; sets `users.legacy_tokens_revoked_at = now`. Returns the count. |

Constants: `@max_age 30 d`, `@tablet_max_age 12 h`, `@tablet_idle 15 min`,
`@seen_every 60 s`, `@prune_after 7 d`.

**A5 by lookup, not by fan-out:** a tablet session is refused as soon as its
tablet token is revoked (by a manager, by the tablet's sign-out, or by
`end_pairings` on deactivation), and deleted with it on device deletion. That
covers all three D33 revocation paths without touching them. `Devices`
revoke paths also stamp the sessions' `revoked_at` in the same transaction,
so the row's state is honest when someone looks at the table.

### 2.4 Auth plumbing

- `AuthPlug`: add the `ses_` clause before the legacy clause; assign
  `:current_session` (the row) for `ses_`.
- `SessionController.verify_token/1` (legacy): after a valid
  `Phoenix.Token`, refuse when the user's `legacy_tokens_revoked_at` is set.
  The check lives in `AuthPlug.session_auth` (it already loads the user).
  Synthetic tokens (DEV/local) go through the same check.
- `SessionController.create`: read `x-rockcut-device`; if
  `Devices.authenticate_token/1` accepts it, pass the row to
  `Sessions.create`. Anything else → a normal session (never an error).
  Use a read that doesn't touch `last_seen_at`
  (`Devices.lookup_live_token/1`, new, no side effects).
- `SessionController.delete`: `:current_session` → `Sessions.revoke`;
  device path unchanged.
- `SessionController.password`: on success `revoke_all(user, except:
  current_session)`; response gains `revoked`.
- `SessionController.delete_others` (new) at `DELETE /api/sessions/others`
  in the `:authenticated` scope: `revoke_all(user, except: current_session)`;
  audit `user.signed_out_everywhere` with `%{"revoked" => n}`; returns
  `{revoked: n}`. A legacy-token caller has no current session: all `ses_`
  rows go, and so does their own legacy token (they're told to sign in again;
  UI handles the 401). Acceptable for a ≤30-day window.
- `Accounts.do_reset_password`: `Sessions.revoke_all(user, except: nil)`
  inside the update.
- CORS: allow the `x-rockcut-device` request header (check `cors_plug`
  config).
- `OwnerActivity` label for `user.signed_out_everywhere` (UI).

### 2.5 Synthetic tokens (D30)

`Synthetic.mint_person_token/1` issues a **real `ses_` session** (8-hour
`expires_at`) instead of a synthetic-salt `Phoenix.Token`, so Playwright
exercises the real path and revocation is testable end to end. Still behind
`Guard.guard!()`; prod has no synthetic users (smoke check) and can't mint.
`verify_synthetic_token/1` stays until the legacy follow-up, so tokens
minted before the deploy keep working for their 8 hours.

`setup` also deletes `[TEST-TEMP]` users (synthetic email domain, name
prefix) with their sessions, for the profile spec's throwaway account (§4).

### 2.6 Route matrix and boundary

- `device_route_matrix_test.exs`: classify `DELETE /api/sessions/others` as
  denied for devices.
- `authz_boundary_test`: no owner/role checks added outside `Authz`
  (nothing in D34 needs one).

## 3. UI (`rockcut-ui`)

| File | Change |
|---|---|
| `src/components/PasswordField.tsx` (new) | `TextField` + end `InputAdornment` `IconButton` (`Visibility`/`VisibilityOff`), `type` toggles, `aria-label` "Show password"/"Hide password", `onMouseDown` preventDefault (focus stays), `type="button"`. Passes other props through; `data-testid` on the toggle = `${testid}-toggle`. |
| `src/pages/Login.tsx` | Use `PasswordField`. |
| `src/pages/auth/ForcePasswordReset.tsx` | Three `PasswordField`s. Extract the form body into `ChangePasswordForm` (shared with Profile): validation, messages, submit. |
| `src/components/ChangePasswordForm.tsx` (new) | Props: `mode: 'forced' \| 'profile'`, `onDone(revoked)`. |
| `src/pages/profile/Profile.tsx` (new) | Details (from `useAuth().user`: name, email, memberships with department name + role), Change password, Sign out of all other devices (confirm dialog → `DELETE /api/sessions/others` → snackbar/Alert "Signed out of N other sessions"). |
| `src/App.tsx` | Route `/profile` in the person branch only when `!personalOnTablet`. The top-bar name/email becomes a `Link` to `/profile` (`data-testid="profile-link"`); at `xs` an `AccountCircle` icon button. Hidden for devices and `personalOnTablet`. |
| `src/hooks/useAuth.ts` | `login`: when `asideDeviceToken()` is set, send `X-Rockcut-Device`. `endPersonalSession` becomes async: `DELETE /api/session` with the **personal** token via plain axios, `timeout: 3000`, errors ignored; then `restoreDeviceToken()` + reload. |
| `src/hooks/useDeviceTokenWatch.ts` | Before `markUnpaired()`, best-effort revoke of the personal token (same helper). |
| `src/lib/device.ts` | `revokePersonalToken(token)` helper (plain axios, 3 s). |
| `src/pages/activity/OwnerActivity.tsx` | Label `user.signed_out_everywhere`. |
| `src/lib/types.ts` | Response types for password (`revoked`) and sessions/others. |

The idle return (`useIdleReturn` → `endPersonalSession`) and the tablet's
Sign out both go through `endPersonalSession`, so one change covers both.

## 4. Tests

### ExUnit
- `test/rockcut_api/sessions_test.exs`: create (normal/tablet lifetimes),
  authenticate (ok, unknown, revoked, expired, tablet idle at 15 min with
  the minute touch, tablet max 12 h, tablet token revoked, device deleted
  → row gone, inactive user, device user refused), revoke idempotent,
  revoke_all except current, prune.
- `session_controller_test.exs`: create returns `ses_`; sign-out → old token
  401 (S2); other session survives (S3); header marking: live, revoked,
  garbage, absent (S11); password change revokes others and returns
  `revoked` (S8); `DELETE /sessions/others` (S14, S16 → 403 for a device,
  legacy caller).
- Legacy: pre-D34 token accepted (S12); refused after reset (S13), after
  own password change, after sign-out-others.
- `user_controller_test.exs`: reset revokes all (S9).
- `devices_test.exs` / `device_session_api_test.exs`: tablet revoke,
  tablet sign-out, deactivation, deletion each kill a tablet session; the
  same person's phone session survives (S7).
- Synthetic: minted person token is `ses_`, 8 h, refused on a guarded-off env.
- Fixtures: `persona_fixtures.ex` switches to real sessions, so most suites
  exercise `ses_`. The 22 files that sign legacy tokens inline keep working
  (legacy path); they move when the follow-up removes it.

### Playwright (`rockcut-ui/tests/regression/`)
- `auth/session_revocation.spec.ts`: S2, S3 (two contexts), S14.
- `devices/personal_signin.spec.ts` (extend): Sign out and idle return send
  `DELETE /api/session` with the personal token, and that token then gets
  401 (S4, S5); offline at idle return still restores the tablet (S6,
  `context.setOffline`); `/profile` → Home and no profile link (S15).
- `profile/profile.spec.ts`: details (S17, S22); change password with a
  `[TEST-TEMP]` user the spec creates through the owner API with a password
  the spec generates (never the seed password), wrong current, mismatch,
  short, success + other context 401 (S18, S19).
- `devices/device_permissions.spec.ts` (extend): `/profile` → not available (S20).
- `auth/password_toggle.spec.ts`: login, forced reset (`newhire`), profile;
  hidden by default, toggle per field, no submit, keyboard reachable (S21).
- `tests/COVERAGE.md`: add S1–S22.

Revert-and-rerun (workflow §3): the core bug test (sign-out → old token 401)
is run with `Sessions.revoke` stubbed out to confirm it fails, then restored.

## 5. Order of work

1. `Tokens` + migrations + `Sessions` + unit tests.
2. AuthPlug / SessionController / reset / devices wiring + controller tests;
   route matrix.
3. Synthetic mint → `ses_`; `[TEST-TEMP]` user cleanup.
4. UI: `PasswordField`, `ChangePasswordForm`, Login, ForcePasswordReset.
5. UI: tablet revoke-on-end, `X-Rockcut-Device`.
6. UI: Profile page, top-bar link, routes, activity label.
7. Browser-drive as personas (token injection), then the Playwright specs.
8. Local gate; PR to `develop` with SHA + LIMITATIONS.

## 6. Risks and LIMITATIONS to carry to DEV

- **CORS** for the new header only shows up between the two `*.fly.dev`
  hosts, not locally (same origin via the vite proxy).
- **SQLite single connection:** the `last_seen_at` touch is a write on the
  request path; measure nothing locally, watch DEV logs for
  `database is locked`.
- **Real tablet sleep** before the idle return (S6) is emulated only.
- **Rollback signs everyone out** (old code can't read `ses_`). Release PR
  must say so.
- **Synthetic mint change** touches the DEV pre-flight (`fly ssh … mint`):
  verify on DEV first thing.

## 7. Follow-up (file at release)

- Backlog task, due ~30 days after the D34 release: remove the legacy
  `Phoenix.Token` path, `users.legacy_tokens_revoked_at`, synthetic-salt
  verification, and move the 22 test files to `ses_` sessions.
