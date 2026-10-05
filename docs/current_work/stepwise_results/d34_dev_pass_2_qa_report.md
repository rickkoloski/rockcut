# D34 QA report, pass 2: revocable sign-in sessions + Profile (DEV)

- **Tester:** independent QA agent (Claude), acting only as the brief's personas, spare `bartender2` sessions and `[TEST-TEMP]` throwaway users and tablets
- **Time (UTC):** 2026-10-04, 17:05 to 17:39
- **Target:** https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev. The brief names D34 at `8f3f12a` (API v18 / UI v11). I didn't check the version independently. Prod was not touched.
- **Method:** Node + Playwright (Chromium, headless) scripts in this folder (`s4.mjs`, `s5.mjs`, `s6.mjs`, `s7.mjs`, `s14.mjs`, `s18.mjs`, `s21.mjs`, `spot.mjs`, `unreach.mjs`, `edge.mjs`, `l1.mjs`, `l5real.mjs`, `l5ctrl.mjs`, `more.mjs`, `cleanup.mjs`; logs in `out-*.txt`, screenshots in `shots/`).
  - Idle time: `context.clock`. Network drops: `context.setOffline`, on pages that the service worker controls where the brief asks for it. Server errors: `page.route` on `/api/me`.
  - "Gets 401" was checked from inside a page: `GET /api/me` with a copy of the session saved in that tab's `sessionStorage` before the action, plus the screen that tab lands on. No token was printed, logged or screenshotted.
  - **Persona note:** "Sign in as me", change password and owner reset all need the person's password, and the brief forbids the seed password. So every scenario that needs `bartender1` to type a password (S4–S10, S14, S18, S19) ran with a throwaway `[TEST-TEMP]` Taproom employee instead. Scenarios that only need a signed-in session used the `bartender1` persona (S1, S17 spot check) or spare `bartender2` sessions (S2, S3, start-up/offline tests).

## Result: **PASS with gaps**

All the scenarios that ran passed: 20 PASS, 0 FAIL, 2 NOT RUN. All four "changed since pass 1" items behave as described for real offline and 5xx failures. The gaps are in edge paths: other HTTP answers at start-up, two tabs, and signing out while offline.

## Gaps

### G1 (must-fix): a tablet loses its pairing when `/api/me` answers 408, 429 or 404 at start-up
- **Path:** a paired tablet (device mode) reloads or starts while the API (or a proxy in front of it) answers `/api/me` with a 4xx other than 401, such as 429 Too Many Requests, 408 Request Timeout or a 404 page.
- **Expected:** per the brief, only the server refusing the session ends it. The tablet should keep its pairing and show "Can't reach the server, retrying…", or, if it really is unpaired, the setup screen with "This tablet was unpaired".
- **Observed:** the app deletes the device token from local storage at once and shows the **personal "Sign in to continue" form**. That isn't the setup screen, and the "unpaired" notice doesn't appear (`shots/edge-tablet-429.png`). Once `/api/me` answers normally again, the tablet does not recover, even after a manual reload. On the server the tablet is still paired and not revoked, so it has to be re-paired. Worse, anyone who signs in on that form gets an ordinary 30-day session on a shared tablet, with no 5-minute idle return and no 15-minute server rule.
- **People:** a phone or laptop user is signed out the same way on 408, 429 or 404 (lands on login). This is less serious, because they can sign in again.
- **Repro:** `node edge.mjs tablet` (and `node edge.mjs person`). Pair a `[TEST-TEMP]` tablet, run `page.route('**/api/me', r => r.fulfill({status: 429}))`, reload, remove the route and wait 15 s, then reload by hand. The result is the same for 408 and 404.
- **Caveat:** the response was simulated with `page.route`. I didn't find a way to make the real DEV API or Fly return these codes. Any 4xx from a rate limiter, proxy or gateway will trigger it.

### G2 (minor): with two tabs on a tablet, the idle tab ends the person's session while they're active in the other tab
- **Path:** a tablet with two app tabs open. The person uses "Sign in as me" in tab A and keeps using tab A (a tap and a scroll every 30 s). Tab B sits in the background.
- **Expected:** activity in any tab counts. A person who is actively using the tablet is not sent back after 5 minutes.
- **Observed:**
  - In real time, the personal session ended exactly 5:00 after sign-in, 17 s after the last tap in tab A. Both tabs went back to the shared screen and the personal token got 401 (`out-l5real2.txt`).
  - A control run with the same tapping in a single tab stayed signed in past 5:30 (`out-l5ctrl.txt`).
  - With the fake clock, simply bringing the stale tab to the front (a `focus` event) after 6 minutes of activity in tab A ended the session immediately (`out-l5b.txt`).
  - Each tab tracks its own last activity in memory. The shared `rockcut_personal_last_activity` value is written but only read when a tab mounts.
- **Repro:** `node l5real.mjs` (real time, about 9 min) or `node l5b.mjs` (fake clock).
- **Fails safe** (it signs out early, never late). The network-drop part of LIMITATION 5 behaved correctly.

### G3 (minor): Logout while offline, or closing the page right after Logout, leaves the session valid on the server
- **Path:** a phone user taps LOGOUT with no signal, or taps LOGOUT and closes the tab at once.
- **Expected:** "Signing out ends that session on the server: a copy of the old session no longer works." At minimum, the server call should be retried when the network returns.
- **Observed:**
  - The UI goes straight to the login screen. The `DELETE /api/session` call is fire-and-forget and is never retried. The saved old token still got **200** 15 s and 45 s after the phone came back online (`out-s2b.txt`, `shots/S2-offline-logout.png`).
  - When the browser context was closed immediately after LOGOUT (S3, spare #12), the session was still live at clean-up time. I ended it by hand.
  - Online, with a short wait, S2 passes: 401 after 3 s.
  - The session survives for its normal 30 days. On a tablet's "Sign in as me" the 15-minute server rule covers this case; on a phone or laptop nothing does.
- **Repro:** `node s2b.mjs`.

### G4 (minor): start-up hangs on a blank spinner, with no "Can't reach the server" or "Try now", when `/api/me` never answers or returns a non-JSON 200
- **Path:** the app starts (phone or tablet) behind a captive-portal Wi-Fi (the HTML login page comes back with status 200), or on a connection where the request never completes.
- **Expected:** the "Can't reach the server, retrying…" screen with a "Try now" button, and recovery on its own.
- **Observed:**
  - Only a spinner shows (`shots/edge-tablet-200-html-captive.png`), with no message and no Try now.
  - In the captive-portal case the app never retries: 15 s after the network returned to normal it still showed the spinner. Only a manual reload recovered it.
  - In the hang case it recovered only when the hung request was released.
  - Pairing and sessions were kept in both cases.
- **Repro:** `node edge.mjs tablet` / `node edge.mjs person` (cases `200-html-captive` and `hang`).

### G5 (minor, UX): tapping "Sign in as me" and walking away leaves the tablet on the personal sign-in form
- **Path:** someone taps "Sign in as me" on the shared tablet, types their email and walks away.
- **Expected:** the tablet returns to the shared screen after a while, like the 5-minute idle return.
- **Observed:** after 10 idle minutes the tablet is still on "Sign in as yourself" with the typed email visible. It stays there after a reload too. Only "Cancel — back to the shared screen" restores the shared screen. No session was created, so nothing leaks (`shots/M4-walkaway.png`).
- **Repro:** `node more.mjs m4`.

## Scenarios S1–S22

| # | Result | Evidence |
|---|---|---|
| S1 | PASS | The `bartender1` persona session is a `ses_` token (prefix checked, value never read out). Schedule, Time off, Availability, Messages and Profile all load. Login-form sign-in (throwaway user) also gives a `ses_` token. |
| S2 | PASS | Spare session on a phone: LOGOUT goes to login, and the old token gets 401 (checked 3 s later). The offline variant fails: see G3. |
| S3 | PASS | Two spare sessions: after LOGOUT in browser A, browser B reloads into the app and `/api/me` gives 200. |
| S4 | PASS | Throwaway user on a `[TEST-TEMP]` tablet: "Sign in as me" gives a `ses_` token, with the device token parked. The session counts as a tablet sign-in: the server answers 403 "Not available on a shared tablet" to profile actions. After Sign out the tablet is back on its own session and the personal token gets 401. The laptop session stays 200. |
| S5 | PASS | With the fake clock: still signed in after 4:50 idle. At 5:05 the tablet returns to the shared screen and the personal token gets 401. Taps every 3 min keep the session alive past 9 min. |
| S6 | PASS | On a service-worker-controlled tablet, offline before the idle return: the tablet goes back to its own session (shows "Can't reach the server" while offline, then the shared screen once back online). The personal token, unused for 16 real minutes, then got **401**. The device token stays 200. |
| S7 | PASS | `barMgr` revokes in Admin → Shared devices. Within about 18 s the tablet shows setup with "This tablet was unpaired". The personal and device tokens get 401; the user's phone stays 200. |
| S8 | PASS | Run as an API call from the browser, not ExUnit. `POST /api/session/password` from session 1 returns 200 with `revoked: 1`. Session 1 gets 200, session 2 gets 401. |
| S9 | PASS | Owner, Users & Roles → Reset password (through the UI): both sessions get 401 and land on login. Signing in with the temporary password leads to "Set a new password". |
| S10 | PASS | Deactivate (`PATCH active:false`): the next request is 401 and the app lands on login. |
| S11 | PASS | Made-up `ses_` token gets 401. Sign-in with a revoked tablet's `X-Rockcut-Device` header returns 200 with a normal session (`ses_`, and `DELETE /api/sessions/others` is allowed, so it isn't a tablet session). |
| S12 | NOT RUN | Allowed to stay NOT RUN by the brief (needs a pre-D34 token). |
| S13 | NOT RUN | Allowed to stay NOT RUN by the brief. |
| S14 | PASS | Phone, laptop and a tablet "Sign in as me" session. Profile → confirm shows "Signed out of 2 other sessions." After a reload the phone is still signed in. The laptop gets 401 and lands on login. The tablet's personal token gets 401 and the tablet returns to the shared screen. Pressing again gives "Signed out of 0 other sessions." |
| S15 | PASS | During "Sign in as me" there's no Profile link, and typing `/profile` goes to Home. A hand-made `DELETE /api/sessions/others` and `POST /api/session/password` (right or wrong current password) both get 403. |
| S16 | PASS | The device token gets 403 on `DELETE /api/sessions/others` (and on `POST /api/session/password`). |
| S17 | PASS | Phone width: the account icon (aria-label "Profile") opens Profile. On a laptop, clicking the email opens it. It shows name, email and "Taproom · Employee", read-only (no editable inputs in the details card). |
| S18 | PASS | Wrong current password gives "Current password is incorrect" and the laptop stays 200. The correct password gives "Password changed. Your other devices were signed out." and the fields clear. The laptop gets 401 and lands on login. After a reload the phone is still signed in. On the laptop the old password gives "Invalid credentials" and the new one works. |
| S19 | PASS | Mismatch: "New passwords do not match". Under 8 characters: "New password must be at least 8 characters". Same as current: "The new password must be different". The forced reset gives identical messages, and the old password still works after the refusals. |
| S20 | PASS | Device `/profile` shows "Not available on a shared device", with no Profile link (`shots/S20-device-profile.png`). |
| S21 | PASS | Login (1 field), forced reset (3) and Profile (3): every field starts as `password`. Tab from a field lands on its eye button ("Show password"). Enter, Space or a click toggles only that field (aria-label becomes "Hide password"), doesn't submit and sends no API request. |
| S22 | PASS | `owner` sees their own details plus "Change these in Users & Roles." `barMgr` sees their own details plus "ask a manager or the owner". No other person's email appears. |

## Changed since pass 1

- **Can't reach the server, at start-up:** PASS for offline and for 500, 502 and 503.
  - The person stays signed in on "Can't reach the server, retrying…".
  - "Try now" works while the network is still down: it stays on that screen and keeps the token.
  - The app recovers on its own within about 10 s of the server answering (instantly on the `online` event).
  - The tablet keeps its pairing.
  - Exceptions: G1 (other 4xx codes) and G4 (hang or HTML).
- **"Sign in as me" and profile actions:** PASS.
  - Hand-made API calls get 403 for both actions.
  - A person who must set a new password can finish that on the tablet (L1). It also signs out their other temporary-password session.
  - After the reset, both actions are 403 again.
- **Change password refuses the current password:** PASS ("The new password must be different", on both Profile and the forced reset).
- **Owner Profile text:** PASS ("Change these in Users & Roles.").

## LIMITATIONS (author could not verify)

1. **Forced reset on a tablet: PASS.**
   - Temporary-password user → "Sign in as me" → "Set a new password" → reset on the tablet → uses Schedule, Time off, Availability and Messages.
   - `/profile` goes to Home, and the profile actions are 403.
   - Sign out returns the tablet to its own session; the old token gets 401. The new password works on a laptop.
   - Signing in again and then 5 idle minutes returns the tablet to its own session (401).
   - Idle on the half-filled reset screen: back to the shared screen after 5 min (401).
   - The "Sign out" link on the reset screen goes back to the shared screen, without losing the pairing.
2. **"Can't reach the server" for people: PASS, with exceptions G1 and G4.**
   - Phone opened offline (service worker): the retry screen.
   - "Try now" while still offline: stays on the retry screen.
   - A 60 s outage: still signed in.
   - Network flapping: recovered during a brief online window.
   - Back online: the app returns on its own in about 0 s.
   - 503, 500 and 502 on `/api/me`: the retry screen, then recovery about 9–10 s after the error stops.
3. **Offline while already using the app: PASS.**
   - Offline, the phone moved between Schedule, Time off, Availability, Profile, Messages and Home. After 45 s offline it was still signed in.
   - An offline reload shows the retry screen. Back online it returns to the app (`/api/me` 200).
   - A tablet offline in device mode or in a personal session also stays put.
4. **Tablet revoked while offline: PASS, in all three variants.** Each time the tablet ends on setup with "This tablet was unpaired" within about 1 s of coming back online, and never gets stuck on "retrying":
   - in device mode while using the app;
   - during "Sign in as me" (personal token 401);
   - reloaded offline onto the retry screen, then revoked.

   Also checked:
   - Deactivating the shared device sends both paired tablets to "unpaired", and a personal session on them gets 401.
   - Revoking while someone is typing on "Sign in as yourself" also sends the tablet to setup; the session that was just created gets 401.
5. **Two tabs on one tablet: gap G2.** The idle tab ends the session while the person is active in the other tab. The network drop across the idle return behaved correctly (S6, M1): the return happens offline, the device token is restored, and the tablet goes back to the shared screen when online.
6. **Signed out elsewhere while offline: PASS.**
   - One browser was offline inside the app; another was offline on the retry screen.
   - A third browser ran "Sign out of all other devices" (revoked 2).
   - Back online, both landed on login, not stuck retrying.

## Clean-up

- **Throwaway users:** all 25 `[TEST-TEMP] QA2 …` users were deactivated (ids 360–381 and 383–385).
- **Tablets and devices:** every QA2 tablet was revoked. Both `[TEST-TEMP] QA2 …` shared devices (359, 382) were deactivated.
- **Spare sessions:** I used `bartender2` spares #0–#14. The ones still live at the end were ended.
- **Personas:** I didn't sign out, revoke or change the password of any persona file session. The `owner` session still answers 200.
