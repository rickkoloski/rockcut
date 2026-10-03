# D34: Revocable Sign-in Sessions and Profile Page — Specification

**Status:** Draft, Q1–Q5 answered (2026-10-02); awaiting Matt's review of the whole spec
**Created:** 2026-10-02
**Author:** Matt + CC
**Depends On:** D33 (shared tablets, "Sign in as me", `device_tokens`), D30 (synthetic personas, DEV), D10 (sign-in)
**Process:** `docs/process/three_environment_workflow.md` (spec with persona scenarios → local gate → DEV gate → release)
**Backlog:** PortableMind project 254, task 3991
**Branch:** `d34-session-revocation`, cut from `develop`

---

## 1. Problem Statement

A person's sign-in token is a stateless `Phoenix.Token` that is good for 30
days. The server keeps no record of it, so it can't be taken back:

- **Sign-out does nothing on the server.** `DELETE /api/session` returns
  `{ok: true}` for a person's token. The app forgets it, but a copy keeps
  working until it expires.
- **On a shared tablet it isn't even sent.** When someone taps "Sign out"
  after "Sign in as me", or the tablet goes back to its own session after 5
  idle minutes, the UI just puts the tablet's token back
  (`endPersonalSession` → `restoreDeviceToken`). It never calls the server.
- **A password change doesn't sign anyone out.** Changing your own password,
  or an owner resetting it, leaves every existing token working.

The risk that matters is the taproom tablet. A staff member signs in as
themself on a bar-facing screen. Their token sits in that browser's storage
and could be copied, by DevTools or by a later visitor before the idle return.
It then works from anywhere for 30 days, with that person's access.

**Not affected:** deactivating a user. `AuthPlug` reloads the user on every
request and refuses `active: false`, so a departed employee is locked out at
once.

D34 makes a person's sign-in a **server-side session** that can be revoked,
the same way D33 made a tablet's pairing revocable.

---

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| A1 | **A `user_sessions` table**, built like D33's `device_tokens`: opaque random tokens, only an HMAC hash stored, `revoked_at`, `expires_at`, `last_seen_at`. Not a per-user "tokens valid after" timestamp: that would sign a person out of their phone whenever they signed out on the tablet. | CC, proposed |
| A2 | **Sign-out revokes the session** it was sent with, and only that one. | Task 3991 |
| A3 | **The tablet revokes a personal session when it ends it**, on Sign out and on the idle return, before putting its own token back. | CC, proposed |
| A4 | **A sign-in made on a paired tablet is marked as one** and gets a short server-side lifetime (Q2), so a session the tablet couldn't revoke (it was offline, asleep, or its storage was cleared) still dies soon. | Task 3991 |
| A5 | **Revoking or signing out a tablet also revokes** every personal session started on that tablet. | CC, proposed |
| A6 | **A password change revokes the person's other sessions;** an owner's password reset revokes all of them. | Task 3991 |
| Q1 | **Tokens issued before D34 are honored until they expire** (at most 30 days), so the deploy signs nobody out. A per-user cutoff lets an owner kill one person's old tokens (§3.7). | Matt, 2026-10-02 |
| Q2 | **A tablet sign-in expires 15 minutes after its last request, and never lasts more than 12 hours.** | Matt, 2026-10-02 |
| Q3 | **People get one "Sign out of all other devices" control**, on the profile page (§3.5). | Matt, 2026-10-02 |
| Q4 | **A profile page** with "Change password" and "Sign out of all other devices". | Matt, 2026-10-02 |
| Q5 | **Every typed password gets a show/hide toggle**, hidden by default. | Matt, 2026-10-02 |

---

## 3. Requirements

### 3.1 Sessions

- New table `user_sessions`: `user_id`, `token_hash` (unique), `device_token_id`
  (nullable: the tablet it was started on), `expires_at`, `last_seen_at`,
  `revoked_at`, timestamps.
- `POST /api/session` (email + password) inserts a row and returns a token of
  the form `ses_<32 random bytes, base64url>`. The plain token is never
  stored. The response shape is unchanged (`{token, user}`).
- A normal sign-in lasts **30 days** from sign-in, as today.
- `AuthPlug`:
  - `dev_…` → a tablet, unchanged;
  - `ses_…` → look up the hash; refuse it if it's unknown, revoked or
    expired, or its user is inactive or a device; touch `last_seen_at` at
    most once a minute (as `device_tokens` does);
  - anything else → a pre-D34 token, accepted per §3.7.
- The HMAC helper `Devices.hash/1` moves somewhere both contexts can use it
  (for example `RockcutApi.Tokens`), with no change in behavior.
- Synthetic persona tokens (D30, DEV and local only) are unchanged. They are
  already short-lived (8 hours) and never accepted on prod.

### 3.2 Signing out

- `DELETE /api/session` with a `ses_` token sets `revoked_at` on that row and
  returns `{ok: true}`. Later requests with that token get **401**.
- Signing out twice, or with an already-revoked token, is harmless (the second
  call is a 401, which the UI already ignores on Logout).
- With a `dev_` token: unchanged (D33 revokes the tablet), **plus** A5.
- Audit: `session.signed_out` is **not** written (sign-out is routine and would
  flood the change log). Revocations caused by a password change or reset are
  covered by the existing password audit entries.

### 3.3 The shared tablet

- **Marking a tablet sign-in.** While "Sign in as me" is open, the UI sends
  the tablet's set-aside token as `X-Rockcut-Device: dev_…` with
  `POST /api/session`. If it's a valid, unrevoked tablet token, the new
  session gets `device_token_id` and the tablet lifetime (Q2): it's refused
  once 15 minutes pass with no request (`last_seen_at`; touched at most once a
  minute, so the real window is 15–16 minutes), or 12 hours after sign-in,
  whichever comes first. An invalid or
  revoked header is ignored for marking, and the sign-in is treated as a
  normal one. (It is never a reason to refuse a sign-in: a stale header
  shouldn't lock someone out.)
- **Ending a personal session** (Sign out, idle return, and the
  `useDeviceTokenWatch` path when the tablet itself was revoked):
  1. send `DELETE /api/session` with the **personal** token, with a short
     timeout (about 3 seconds);
  2. whatever the result (offline, 401, timeout), put the tablet's token back
     and reload, as today.

  A failed revoke is covered by the short server-side lifetime (A4).
- **A5:** when a tablet token is revoked (by a manager or by the tablet's own
  sign-out), revoke every unrevoked `user_sessions` row with that
  `device_token_id` in the same transaction.

### 3.4 Passwords

- `change_password` (your own, `POST /api/session/password`): revoke every
  other unrevoked session of yours; the one you're using stays signed in.
  It's called by the forced reset after a temporary password and by the new
  profile page's Change password (§3.5). The response adds
  `revoked: <count>` so the page can say how many sessions ended.
- `reset_password` (an owner, for someone else): revoke **all** of that
  person's sessions. They sign in with the temporary password next time.
- Deactivation: unchanged (already immediate).
- **"Sign out of all other devices" (Q3):**
  - API: `DELETE /api/sessions/others` revokes every unrevoked session of the
    caller except the current one, and sets `legacy_tokens_revoked_at` (§3.7).
    Returns `{revoked: <count>}`. A device token gets 403 (DeviceGate).
  - UI: on the profile page (§3.5).
  - Audit: `user.signed_out_everywhere`, so an owner can see it happened.

### 3.5 Profile page (Q4)

- New route **`/profile`**, for every person. Reached by clicking your name or
  email in the top bar (it becomes a link; on phone width, where the email is
  hidden today, an account icon button). Logout stays where it is.
- **Not available to a device, or during a personal sign-in on a tablet.**
  Changing a password on a bar-facing screen invites shoulder-surfing, and
  D33 already keeps personal settings (calendar feeds) off the tablet. The
  link isn't shown there, and `/profile` falls under the existing device rules
  (the "Not available on a shared device" page for the device; Home for a
  personal tablet session).
- **Sections:**
  1. **Your details, read-only:** name, email, and your departments with
     your role in each. Editing them stays with owners and managers in Users
     & Roles.
  2. **Change password:** current password, new password, confirm new
     password; the same rules and messages as the forced reset (at least 8
     characters, must match, "Current password is incorrect"). On success:
     "Password changed. Your other devices were signed out" (or "Password
     changed" when there were none), and the form clears. You stay signed in
     here (§3.4).
  3. **Sign out of all other devices:** one button with a confirm step ("This
     signs you out everywhere except this browser"), then "Signed out of N
     other sessions". Calls `DELETE /api/sessions/others` (§3.4).
- There's no "forgot password" email flow (prod mail is a no-op, D28). A
  forgotten password is still an owner's Reset password in Users & Roles.

### 3.6 Show/hide on password fields (Q5)

- One shared component, `PasswordField`: an MUI `TextField` with an eye icon
  button at the end. The field starts **hidden**; the button toggles it, and
  its accessible name says what it does ("Show password" / "Hide password").
  Each field toggles on its own. Pressing the button never submits the form,
  and focus stays in the field.
- Used for every typed password:
  - the sign-in form (`Login.tsx`), which "Sign in as me" also uses;
  - the forced "Set a new password" screen (`ForcePasswordReset.tsx`): all
    three fields;
  - the profile page's Change password (§3.5): all three fields.
- Not for the temporary password an owner sees after creating a user or
  resetting a password: it's shown as text to be shared, not typed.
- `autoComplete` values stay as they are, so password managers keep working.

### 3.7 Tokens issued before D34 (Q1)

- A pre-D34 token (a signed `Phoenix.Token`, no prefix) is still accepted
  until its 30 days run out, as today, **unless** its user has
  `legacy_tokens_revoked_at` set.
- New column `users.legacy_tokens_revoked_at` (nullable). It's set by:
  - an owner's password reset (§3.4);
  - the person's own password change (§3.4);
  - "Sign out of all other devices" (Q3), if adopted.

  Every pre-D34 token was issued before the deploy, so once it's set, all of
  that person's pre-D34 tokens are refused. No per-token record is needed.
- **A departing employee needs nothing new:** deactivation already refuses
  every token on the next request.
- **To cut off a current employee's old token** (for example one left on a
  tablet or a lost phone before D34): an owner resets their password. They
  sign in again with the temporary password.
- **Follow-up:** about 30 days after the D34 release, a small change removes
  the pre-D34 path and the column (backlog task, dated).

### 3.8 Housekeeping

- On each sign-in, delete that user's rows that expired or were revoked more
  than 7 days ago. No scheduled job.

### 3.9 Non-functional

- **SQLite, one connection:** each request with a `ses_` token adds one
  indexed read, plus at most one small write per session per minute. That's
  the same load D33 added for tablets.
- **Rotating `SECRET_KEY_BASE`** still signs everyone out (now because the
  hashes no longer match).
- **Rollback:** the old code can't read `ses_` tokens, so rolling back after
  D34 signs everyone out once; they sign in again. The migration only adds a
  table, so it's safe to leave in place.

---

## 4. Persona scenarios

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S1 | `bartender1` | login form | signed out | Signs in. The token starts `ses_`. Every page works as before. |
| S2 | `bartender1` | Logout | signed in on a phone | Is signed out. A request with the old token (saved before Logout) gets **401**. |
| S3 | `bartender1` | two browsers | signed in on both | Logs out in browser A. Browser B is still signed in after a reload. |
| S4 | `bartender1` | tablet → "Sign in as me" | tablet paired | Signs in; the session is marked as a tablet sign-in. Taps Sign out: the tablet returns to its own session, and the personal token (saved before) gets **401**. |
| S5 | `bartender1` | tablet → "Sign in as me" | idle 5 minutes | The tablet returns to its own session, and the personal token gets **401**. |
| S6 | `bartender1` | tablet → "Sign in as me" | network drops before the idle return | The tablet still returns to its own session. The personal token stops working once the tablet lifetime (Q2) passes. |
| S7 | `barMgr` | Admin → Shared devices → Revoke | `bartender1` signed in on that tablet | The tablet goes back to setup, and `bartender1`'s tablet session gets **401**. `bartender1`'s phone session still works. |
| S8 | `bartender1` | API `POST /api/session/password` (ExUnit) | two sessions | The session that changed the password keeps working; the other gets 401. |
| S9 | `owner` | Users & Roles → Reset password | `bartender1` signed in | All of `bartender1`'s sessions get 401; they sign in with the temporary password and are asked to set a new one. |
| S10 | `owner` | Users & Roles → deactivate | `bartender1` signed in | Unchanged: the next request is 401. |
| S11 | anyone | API | made-up `ses_` token, or a revoked tablet header on sign-in | Made-up token → 401. Revoked `X-Rockcut-Device` header → a normal 30-day sign-in, not an error. |
| S12 | `bartender1` | phone | holds a token issued before D34 | Still signed in after the deploy; nothing changes for them. |
| S13 | `owner` | Users & Roles → Reset password | `bartender1` holds a pre-D34 token | That token gets **401** from then on. `bartender1` signs in with the temporary password. |
| S14 | `bartender1` | Profile → Sign out of all other devices | signed in on a phone, a laptop and a tablet | Confirms; sees "Signed out of 2 other sessions". The phone stays signed in after a reload; the laptop and the tablet session get 401. |
| S15 | `bartender1` | tablet → "Sign in as me" | personal session active | No profile link. Typing `/profile` goes to Home. |
| S16 | `taproomDevice` | API `DELETE /api/sessions/others` | paired | 403. |
| S17 | `bartender1` | top bar → name → Profile | signed in on a phone and a laptop | Sees their name, email and departments with roles, read-only. |
| S18 | `bartender1` | Profile → Change password | signed in on a phone and a laptop | Wrong current password → "Current password is incorrect", nothing changes. Correct → "Password changed. Your other devices were signed out". The laptop gets 401; after a reload the phone is still signed in, and the new password works on the laptop. |
| S19 | `bartender1` | Profile → Change password | new and confirm differ, or under 8 characters | Refused with the same message as the forced reset; the old password still works. |
| S20 | `taproomDevice` | typed URL `/profile` | paired | "Not available on a shared device". No profile link. |
| S21 | anyone | sign-in form; forced reset; Profile → Change password | typing a password | Each field starts hidden. The eye button shows and hides that field only, without submitting; a keyboard user can reach it and hear "Show password". |
| S22 | `barMgr`, `owner` | Profile | signed in | Same page as everyone: their own details only, no other person's. |

---

## 5. Out of Scope

- A list of your signed-in devices with per-device revoke (Q3 is one button).
- Editing your own name or email on the profile page (read-only in D34).
- A "forgot password" email flow (prod mail is a no-op).
- Changing the 30-day lifetime of normal sign-ins, or making it sliding.
- Calendar feed URLs after deactivation (backlog 3992, separate).
- Server-side enforcement of the 5-minute idle on the tablet beyond Q2.

---

## 6. Open Questions

- [x] **Q1: tokens issued before D34** → honored until they expire, with a
  per-user cutoff for a current employee (Matt, 2026-10-02). See §3.7.
- [x] **Q2: tablet sign-in lifetime** → 15 minutes without a request, 12 hours
  at most (Matt, 2026-10-02). See §3.3.
- [x] **Q3: "Sign out of all other devices"** → yes, one button on the
  profile page (Matt, 2026-10-02). See §3.4 and §3.5.
- [x] **Q4: a profile page** with Change password and Sign out of all other
  devices (Matt, 2026-10-02). See §3.5.
- [x] **Q5: show/hide toggle** on every typed password, hidden by default
  (Matt, 2026-10-02). See §3.6.
