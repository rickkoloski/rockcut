# D34 QA report: revocable sign-in sessions + profile page (DEV)

- **Tester:** independent QA agent (Claude), synthetic personas only
- **Time:** 2026-10-03, 05:20–05:53 UTC
- **Target:** UI https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev (build D34, API `6c5fb25` per brief). Prod was not touched.
- **Method:** Node + Playwright (Chromium) scripts in this folder (`sA.mjs`, `sA17.mjs`, `sB.mjs`, `sC.mjs`, `sD.mjs`, `sE.mjs`, `cleanup.mjs`; logs in `run*.log`; screenshots in `shots/`). Phone width = Playwright "Pixel 7" profile. Idle time was simulated with `page.clock`, and network loss with `context.setOffline(true)`. The S6 server lifetime was checked by waiting 16 real minutes. All API checks ran from inside a page. No token was printed, logged or screenshotted (the logs were grepped to confirm).
- **Substitutions:** the persona files hold no passwords, and the seed password is off-limits. So every step that needs `bartender1` to type a password (sign-in form, "Sign in as me", Change password, owner reset, deactivate) used a throwaway `[TEST-TEMP] QA …` Taproom employee created as `owner` through `POST /api/users`. Logout and sign-out steps used spare `bartender2` sessions from `spares.json` (4 used). `bartender1`'s own persona session was used only for read-only checks (S1 pages, S17).

## Result: **FAIL**

One must-fix gap (G1). A tablet that loses its network before the 5-minute idle return wipes its own pairing and drops to the normal sign-in screen. Everything else in S1–S22 that could be run behaved as specified.

## Gaps

### G1 (must-fix): idle return while offline unpairs the tablet (S6)
- **Path:** paired tablet → "Sign in as me" (Taproom employee) → network drops → 5 idle minutes pass.
- **Expected:** the tablet returns to its own shared session (shared Taproom screen with "Sign in as me"). The personal session dies on the server after 15 minutes without use.
- **Observed:** the tablet clears **all** of its `localStorage`, including `rockcut_device_token`, and shows the normal "Sign in to continue" form. It stays there after the network comes back and after a reload. The tablet is effectively unpaired and needs a manager to give it a new pairing code. Admin → Shared devices still lists it as paired, so its server-side pairing is orphaned. The server half works: the personal token kept working (200) until it went unused for 15 minutes, then got 401 (checked at 16 min). Reproduced 3 times (S6, S6b, S6c). Control: offline *without* the idle return (person still active, navigating) does not lose the tablet (S6d). Online idle return works (S5). So the defect is in the idle-return path when its revoke request fails on the network.
- **Repro:** `sB.mjs` (S6 block) or `sD.mjs` (S6c): pair a `[TEST-TEMP]` tablet, sign in as me, `context.setOffline(true)`, `page.clock.fastForward('05:30')`, then inspect `localStorage` and the screen. Screenshots: `shots/S6-offline-return.png`, `shots/S6c-offline-return.png`, `shots/S6c-online-reload.png`.
- **Impact:** a brief Wi-Fi drop behind the bar takes the tablet out of service until a manager re-pairs it.

### G2 (minor): a tablet "Sign in as me" session can still use the profile actions through the API
- **Path:** tablet → "Sign in as me" → (API, from the tablet page with the personal session) `DELETE /api/sessions/others` and `POST /api/session/password`.
- **Expected (by the spec's intent):** Profile actions are "not available during a 'Sign in as me' session". The UI does hide them: no link, and `/profile` goes to Home (S15 PASS).
- **Observed:** both calls succeed. `DELETE /api/sessions/others` → 200 `{"revoked":1}`, which signed the person's phone out. `POST /api/session/password` → 200, which changed the password and signed the phone out. Only the device token itself gets 403 (S16). This is reachable only by a crafted request with the person's own session, so it is minor. Product should confirm whether the server should refuse these for tablet-marked sessions.
- **Repro:** `sC.mjs` S14x block and `sD.mjs` S14y block.

### G3 (minor / product question): "Change password" accepts the current password as the new one
- **Path:** Profile → Change password with new = confirm = current password.
- **Observed:** "Password changed. Your other devices were signed out." The other sessions get 401. The password is effectively unchanged, but every other device is signed out. Harmless, but probably unintended. `sC.mjs` (S19x).

### G4 (minor, copy): the owner's Profile tells them to "ask a manager or the owner"
- **Path:** `owner` → Profile. The read-only details say "To change your name, email or departments, ask a manager or the owner." That is odd wording for the owner. `shots/S17-owner-desk.png`.

### Observations (not D34 gaps)
- Users & Roles → Reset password resets immediately on click, with no confirmation step. It shows the temporary password with a Done button.
- `/time-off` (the path I guessed) redirects to Home. The app's own nav links work, and no page broke.

## Scenarios

| # | Result | Evidence |
|---|---|---|
| S1 | PASS | Form sign-in (temp user, after the forced reset) leaves a token starting `ses_`. `bartender1` (`ses_` persona): Home, Schedule, Availability, Messages and Profile load with no API 4xx/5xx and no page errors. |
| S2 | PASS | Spare session at phone width → LOGOUT sends `DELETE /api/session` and lands on the login form. The saved old token gets `/api/me` 401. Putting the old token back into `localStorage` and reloading lands on login, and the app clears it. |
| S3 | PASS | Two separate spare sessions: Logout in A, and B is still signed in after reload (`/api/me` 200). A second tab of A goes to login on its next navigation. |
| S4 | PASS | Temp user "Sign in as me" sends `POST /api/session` with an `X-Rockcut-Device` header. The UI banner says "Signed in as … on a shared tablet". `GET /api/session` exposes no tablet flag, but S7/S14 show the server treats the session as tablet-bound. Sign out sends `DELETE /api/session` and the tablet goes back to the shared screen (`dev_` token). The personal token gets 401, and the person's phone still gets 200. |
| S5 | PASS | Idle 5:30 (fake clock) → back to the shared screen, and the personal token gets 401. 4 min idle, then activity, then 4 more min idle → still signed in, so activity resets the timer. A reload mid-idle still returns on time. |
| S6 | **FAIL** | Server part OK: the token stayed valid offline and got 401 after 16 min unused. But the tablet did **not** return to its own session: its device token was wiped and it showed the login form (G1). |
| S7 | PASS | `barMgr` → Shared devices → Revoke (confirm dialog) on a `[TEST-TEMP]` tablet with the temp user signed in. The tablet shows "This tablet was unpaired" on the setup screen. The tablet personal token gets 401, the person's phone gets 200, and the revoked device token gets 401. |
| S8 | PASS | `POST /api/session/password {current_password,new_password}` → 200. The calling session gets 200 and the other session gets 401. Tested over HTTP, not ExUnit. |
| S9 | PASS | `owner` → Users & Roles → Reset password with the temp user on phone, laptop and tablet. Phone and laptop get 401 and land on login. The tablet falls back to its shared screen. The temporary password leads to "Set a new password", and the old password gets "Invalid credentials". |
| S10 | PASS | `owner` → Users & Roles → untick Active → Save. The phone gets 401 and lands on login. The tablet falls back to the shared screen. |
| S11 | PASS | Made-up `ses_…`, bare `ses_` and made-up `dev_…` tokens all get 401, and the UI with the fake token shows login. Sign-in with a revoked `X-Rockcut-Device` header → 200 with a normal session, not an error. |
| S12 | NOT RUN | No pre-D34 token was available (every persona file holds `ses_`/`dev_` tokens). |
| S13 | NOT RUN | Same reason: no pre-D34 token. The equivalent behaviour for D34 tokens passed in S9. |
| S14 | PASS | Temp user on phone, laptop and tablet. Profile → Sign out of all other devices → confirm dialog → "Signed out of 2 other sessions." Phone 200 after reload; laptop 401 (login screen); tablet personal token 401, and the tablet falls back to the shared screen. Running it again gives "Signed out of 0 other sessions." See also G2. |
| S15 | PASS | During "Sign in as me": no `/profile` link, and typing `/profile` goes to `/` (Home) with the personal session intact. |
| S16 | PASS | `DELETE /api/sessions/others` → 403, first with a `[TEST-TEMP]` tablet's device token and then with `taproomDevice`. |
| S17 | PASS | `bartender1` at desktop (email link) and phone width (account icon, `aria-label="Profile"`): name, email and "Taproom · Employee" as plain text with no editable detail fields, and no horizontal scroll. Also checked `dualMgr` (two departments) and `noDept` ("No departments yet."). |
| S18 | PASS | Wrong current password → "Current password is incorrect", and the laptop stays at 200. Correct → "Password changed. Your other devices were signed out." and the fields clear. Laptop 401; phone 200 after reload; the new password signs in on the laptop and the old one gets "Invalid credentials". |
| S19 | PASS | Mismatch → "New passwords do not match"; 7 characters → "New password must be at least 8 characters". Both are identical to the forced-reset screen's messages, and the other session and the password were unchanged. See G3. |
| S20 | PASS | `taproomDevice` at `/profile` (desktop and phone width): "Not available on a shared device … Use 'Sign in as me'", with no profile link. |
| S21 | PASS | Sign-in form (1 field), forced reset (3), Profile at phone width (3) and the tablet "Sign in as me" dialog (1): each field starts `type=password`. Tab from the field reaches the eye button, labelled "Show password". Enter shows only that field and the label becomes "Hide password"; Space hides it again; clicking also toggles. No POST was sent and the URL did not change. |
| S22 | PASS | `barMgr` and `owner` Profile show only their own details. The page makes only `GET /api/me` (plus the shell's channels, departments and notifications calls), with no user-list or other-person calls. |

**Totals:** 19 PASS, 1 FAIL (S6), 2 NOT RUN (S12, S13).

## LIMITATIONS items: what I found

1. **Tablet marking across real hosts (S7):** works. A typed "Sign in as me" on a real paired DEV tablet, then a revoke by `barMgr`, ended the tablet session (401) and left the same person's phone session working (200). Owner reset, deactivate and "Sign out of all other devices" also leave the tablet on its own shared session rather than logging it out.
2. **Network drop at idle return (S6):** this is where it breaks. See **G1**. With a real `setOffline` (all requests fail, not one blocked request), the idle return wipes the device token. The server-side 15-minute expiry itself works. Coming back online does not retry the revoke (the token stayed 200 until the 15-minute expiry), which is acceptable per spec.
3. **Profile and toggles at phone width, keyboard only:** fine. The account icon is a link labelled "Profile". There is no horizontal overflow on the profile page or the forced-reset page. The eye buttons are keyboard-reachable, labelled "Show password"/"Hide password", and toggle with Enter/Space without submitting.
4. **Two tabs on one tablet:** consistent. Tab B opened during a personal session shares it. Sign out in tab B revokes the session (401). Tab A shows the shared screen without any action, and stays on the shared session after navigating. Signing in as me in one tab is picked up by the other on reload.
5. **Forced "Set a new password" with toggles, then normal use:** fine. The toggles behave as in S21. The validation messages match Profile's. After the update, Schedule, Availability, Messages and Profile all work, and the temporary password is rejected afterwards.
6. **Password change while another browser is mid-use:** handled cleanly. The laptop had a half-filled Change-password form and a Messages tab open. Submitting the stale form sends it to the login screen (no error page or stuck state), and the Messages tab goes to login on its next navigation.

## Cleanup

- Deactivated all throwaway users (ids 327–340, `[TEST-TEMP] QA …`). One earlier create attempt returned 422 and created nothing.
- Deactivated the shared device `[TEST-TEMP] QA D34 tablets`, which signed out every tablet paired to it, including the orphaned ones from G1.
- Used 4 spare `bartender2` sessions (indices recorded in `.spares_used.json`). No persona token was signed out, revoked or password-changed. "Sign out of all other devices" was used only as throwaway users.
- `shots/recon-pair-dialog.png` shows a one-time pairing code for the now-deactivated test device. It expired after 10 minutes and is not a session token.
- No credential outside the brief was requested.
