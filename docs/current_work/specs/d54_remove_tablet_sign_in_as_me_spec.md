# D54: Remove "Sign in as me" from shared tablets — Spec

**Status:** APPROVED by Matt 2026-11-02
**Backlog:** PortableMind project 254, task 5064
**Order:** ships **before** D53 (Idea Boards), in its own release. D53's
review item 16 ("Sign in as me" on Idea Boards) goes away with it.
**Removes:** D33's "Sign in as me", D34 §3.3/§3.5/A5 (tablet sessions), the
D36 tablet-idle fixes that serve it, and D43's tablet theme handover.

## 1. Problem

A paired shared tablet (D33) lets a person tap **Sign in as me**, type their
email and password, and use the app as themselves until they sign out, the
tablet goes 5 minutes idle, or the session sits 15 idle minutes. Since D40,
staff codes cover the writes people actually make at the bar and in the
brewhouse (task boards, Buy-a-Beer), so the personal sign-in is now mostly
risk: a forgotten session on a shared screen, and a lot of special-case
session code.

## 2. Decisions (Matt, 2026-11-02)

1. **Remove it.** People use their own phone or computer for anything
   personal (their schedule, time off, availability, messages,
   notifications, profile).
2. **Sign everyone out on deploy:** every personal session started on a
   tablet is revoked by the release.
3. **Refuse personal logins on a paired tablet** with: *"This device is
   already set as a shared device. Personal logins not accepted."*
4. **Staff codes stay exactly as they are** (D37/D40: 4-digit code, the
   5-minute "Acting as" window, board and Buy-a-Beer writes).

## 3. Requirements

### 3.1 API

- **`POST /api/sessions` refuses a live tablet.** When the request carries
  `X-Rockcut-Device` with a **live** device token, answer **403** with
  `{error: "This device is already set as a shared device. Personal logins
  not accepted."}` and create nothing. This is checked **before** the
  password, so the answer never reveals whether a password was right.
- A **stale or revoked** device token in the header is ignored, as today: a
  browser that used to be a tablet can be used for a normal login (that's
  how a device is taken out of service).
- `Sessions.create/2` loses its `:device_token` option and the tablet
  max-age; `tablet_ok?`, `touch` for tablet sessions and
  `revoke_for_device_tokens` go. `Devices.revoke_token/3` no longer revokes
  personal sessions (there are none).
- The profile actions' `on_tablet?` refusal (password change, sign out of
  others) goes: no personal session can be on a tablet.
- **Column kept:** `user_sessions.device_token_id` stays (unread) for one
  release so rolling back the API image works; it's dropped later, like
  task 4963.
- **Audit:** a refused login records nothing new (there's no user to
  attach it to before the password check). Rate limiting on
  `POST /api/sessions` is unchanged.

### 3.2 Migration: sign out on deploy

A data migration sets `revoked_at = now()` on every `user_sessions` row with
a `device_token_id` and no `revoked_at`. Its `down` does nothing (a revoked
session isn't brought back). Rolling the API image back is still safe: the
old code just sees those sessions as revoked.

### 3.3 UI

- **Tablet header:** the **Sign in as me** button goes. The header keeps the
  device pill, theme and Sign out (which unpairs, as today).
- **Login page on a paired tablet** (someone types `/login`): shows the
  refusal message instead of the form, with no way to submit. If the API
  refuses anyway (e.g. a race with pairing), the same message shows.
- **Removed client code:** the personal-session path in `useAuth`,
  `useAuthStorageSync` and `useDeviceTokenWatch`; `asideDeviceToken`,
  `PERSONAL_IDLE_MS` and `useIdleReturn(personalOnTablet, …)` in `App.tsx` /
  `lib/device.ts`; the tablet-theme handover in `lib/colorMode.ts`; the
  personal-session branch of `lib/updatePrompt.ts` (tablets still reload
  themselves when idle, D45).
- **After deploy, a tablet that had someone signed in** finds the session
  revoked and goes back to the tablet view (the existing "session ended"
  path), not to a login form.
- **Fold in task 4988:** with only a stale `rockcut_device_token` the app
  checks the device first and shows "This tablet was unpaired" straight
  away, instead of a sign-in that ends there.

### 3.4 Docs

- `docs/process/taproom_tablet_setup.md`: remove the "Sign in as me"
  section; say personal use is on your own device and what the refusal
  looks like.
- D33/D34 specs are history and stay as written; the D54 completion record
  says what was removed.

### 3.5 Tests

- Delete `personal_signin.spec.ts` and `personal_signin_revoke.spec.ts`;
  remove the personal-session cases from `tablet_idle`, `device_header`,
  `device_signout`, `pwa-update/update_prompt` and `ui/theme`;
  update `tests/COVERAGE.md`.
- ExUnit: the refusal (live token → 403, before the password check; stale
  token → normal login), the migration, and that `Sessions` no longer
  accepts a device token.
- Playwright: §4's scenarios.

## 4. Scenarios

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S244 | `taproomDevice` | tablet header | paired | No **Sign in as me**. Device pill, theme and Sign out still there. |
| S245 | `taproomDevice` | typed `/login` | paired | The refusal message, no form. |
| S246 | — | `POST /api/sessions` with `bartender1`'s right password and the Taproom tablet's live `X-Rockcut-Device` | | 403 with the refusal message; no session row. Same with a **wrong** password (no hint which). |
| S247 | `bartender1` | phone/laptop login | no device header | Signs in normally. |
| S248 | — | `POST /api/sessions` with a **revoked** device token in the header | | Normal login (header ignored). |
| S249 | — | release migration | a personal session started on a tablet before deploy | Revoked; the tablet goes back to its tablet view on the next request; the person's sessions on their own devices are untouched. |
| S250 | `breweryDevice` | Brewery board → tick a task with a staff code; Buy-a-Beer on `taproomDevice` | | Unchanged: "Acting as" for 5 minutes (D40). |
| S251 | `taproomDevice` | owner revokes the tablet in Admin → Shared devices | | Tablet shows "This tablet was unpaired" straight away (4988), never a sign-in form. |
| S252 | `breweryMgr` | Profile → Change password; Sign out of all other devices | own laptop | Unchanged. |

## 5. Out of scope

- Any change to staff codes, pairing, Shared devices admin or what the
  tablet view itself can see and do.
- Dropping `user_sessions.device_token_id` (a later release).

## 6. Risks

- **Auth code removal.** The personal-session path is woven through the
  auth hooks; removing it could break the normal sign-in or tablet
  sign-out. Mitigation: the full `regression/auth` and `regression/devices`
  suites run locally and on DEV, plus an independent pass focused on
  tablets.
- **The refusal relies on the UI sending `X-Rockcut-Device`.** Someone who
  clears the tablet's site data can log in as themselves, but that also
  removes the device token, so the tablet is no longer paired. That's
  acceptable: the shared tablet and a personal login can never be live in
  the same browser.
