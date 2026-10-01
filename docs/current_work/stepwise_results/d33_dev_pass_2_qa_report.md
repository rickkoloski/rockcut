# QA acceptance report: Rockcut D33 (taproom shared-device access), DEV pass 2

| | |
|---|---|
| **Tester** | Claude (independent QA agent), run for Matt |
| **Date / time (UTC)** | 2026-10-01, 03:25–03:53 UTC |
| **Target** | UI https://rockcut-ui-dev.fly.dev · API https://rockcut-api-dev.fly.dev · build under test `921dfd8` (DEV only; prod was not touched) |
| **Method** | Playwright 1.63 (Chromium) scripts in this folder (`node <script>.mjs`). Personas were loaded only through `browser.newContext({ storageState: 'auth/<persona>.json' })`. API calls were made from inside the page with the page's own `localStorage` token, which was never printed. New tablets were paired in fresh empty contexts at **1280×800 landscape**. "Sign in as me" was **mocked**: `POST /api/session` was answered with `page.route` using bartender1's real session, which was read inside the browser and never printed. Screenshots are in `shots/`. |
| **Test data** | Device `[TEST-TEMP] QA2 Bar tablets A` (Taproom, id 37) with tablets `[TEST-TEMP] QA2 …`. A `[TEST-TEMP]` published event, a draft event, two draft shifts, two All-staff messages and one time-off request (Dec 28). |

## Result

**PASS with minor gaps.** All 14 scenarios, all 9 pass-1 fixes and both section C checks pass. There are no must-fix findings. Four minor gaps follow.

### Gaps

**1. minor (needs confirmation from the lead): a personal session on a tablet is ended only in the browser, never on the server**
- **Path:** tablet → Sign in as me → Sign out, or 5 minutes idle, or the device being revoked or deactivated.
- **Expected:** when a "Sign in as me" session ends on a shared tablet, the personal token can't be used any more.
- **Observed:** a personal Sign out and the idle return send no request to the server (no `DELETE /api/session` or any other non-GET request was seen). The client just drops the personal token. `POST /api/session` from the tablet sends only `email` and `password`, with no device token or header, so the server has no way to tie the personal token to the tablet. Revoke or deactivate therefore ends the personal session only on the client side (see G2).
- **Caveat:** the login was mocked, so I could not see whether a real tablet login gets a short-lived or device-bound token.
- **Repro:** pair a tablet → Sign in as me → watch network → Sign out. No server sign-out is sent for the personal token.

**2. minor: the device's Managers URL redirects silently instead of refusing**
- **Path:** `taproomDevice` → typed URL `/messages/managers`.
- **Expected:** "its URL returns 403". On the UI side I'd expect the "Not available on a shared device" page, as with the S9 routes.
- **Observed:** the UI silently redirects to `/messages/all`. The API does refuse (`GET /api/channels/managers/messages` → 403). The same redirect happens for any unknown channel key, for owners too.
- **Repro:** sign in as `taproomDevice`, open `/messages/managers` (`shots/s8-device-managers-url.png`).

**3. minor: the device header is cramped at phone width (412×915)**
- **Path:** device session, any page, 412×915.
- **Expected:** a tidy header.
- **Observed:** "Sign in as me" wraps onto 4 lines, so the header grows to about 99 px. The "Shared device · Taproom" pill overlaps the logo. Nothing scrolls sideways and every control can still be reached. Portrait 800×1280 is fine.
- **Repro:** `shots/c-412x915-schedule.png`.

**4. minor: the manifest is served with a generic content type**
- **Path:** `GET /manifest.webmanifest`.
- **Expected:** `application/manifest+json`.
- **Observed:** `content-type: application/octet-stream`. The content is correct, including `"orientation": "any"`, and Chrome tolerates the type.

**Observation, not a gap (S10):** a message post creates no bell notification for anyone (same as today). The All-staff unread count goes up by one for every person and also for the device. The device's notifications API returns 403, so it gets no notification. Its unread badge just reflects that it can read the channel. Push and email fan-out can't be observed from the browser.

## Results table

| # | Result | Evidence |
|---|---|---|
| S1 | **PASS** | Owner → Add shared device → `POST /api/devices` 201, home Taproom (`s1-device-created.png`). The device isn't in Users & Roles (17 people), `/api/users`, `/api/roster`, the scheduler staff rows or the Add shift assignee picker. The change log shows "Shared device created · [TEST-TEMP] QA2 Bar tablets A (shared device)". |
| S2 | **PASS** | barMgr → Pair a tablet shows the code, "works once" and a 10:00 countdown (`s2-pair-code.png`). A fresh context with "Set up as a shared device", the code and the name `[TEST-TEMP] QA2 tablet T1` signed in as a device session. The list shows the tablet, paired by Casey Tap, with a last-seen time (`s2-list-last-seen.png`). |
| S3 | **PASS** | breweryMgr: Shared devices isn't in its nav and `/api/devices` returns `[]`. `POST /api/devices/{19,37}/pairing_code` → 403. Revoking a taproom tablet (`DELETE /api/device_tokens/:id`) → 403. Deactivating the device (`PATCH /api/devices/37`) → 403. bartender1 also gets 403 on pairing_code. |
| S4 | **PASS** (one detail unverified) | Used code → "That code is invalid or has expired. Ask a manager for a new one." (`s4-used-code.png`). Code expired after 10.5 min → same message (`s4-expired-code.png`). Wrong code → same message (`s4-wrong-code.png`). In a clean window, attempts 1–5 were refused and the **6th** showed "Too many attempts. Try again in a few minutes." (`s4-rate-limited.png`). My network listener missed the request, so the HTTP 429 status code itself wasn't captured, and I didn't send a 7th attempt to get it. |
| S5 | **PASS** | The device's internal login email (`device-…@devices.rockcut.invalid`, taken from the change-log API) entered in the normal login form with two passwords → `POST /api/session` 401 "Invalid credentials", no token stored. The message is the same as for an unknown account. |
| S6 | **PASS** | At 1280×800 the nav shows Home, Schedule › View Schedule, Taproom (Coming soon), Messages › All-staff, Taproom. There is no Scheduler, Time off, Availability, Admin or Brewery. The header shows only "Shared device · Taproom", Sign in as me and Sign out, with no bell and no profile or email (`s6-device-nav-1280x800.png`). |
| S7 | **PASS** | The tablet's View Schedule shows the published `[TEST-TEMP]` event. It doesn't show the draft event or the two draft shifts. The API returns only `published` items. There is no claim control and tapping a shift does nothing. `POST /api/shifts/334/claim` (open published shift) → 403 "Not available on a shared device". |
| S8 | **PASS** (UI nuance, gap 2) | All-staff and Taproom both load messages, show no message box and say "Shared devices can read but not post." `POST /api/channels/all/messages` → 403. The channel list is only `all` and `dept:bar`, with no Managers. `GET /api/channels/managers/messages` → 403. The UI URL redirects (gap 2). |
| S9 | **PASS** | `/scheduler`, `/time_off`, `/availability`, `/users` and `/brands` each show "Not available on a shared device" (`s9-device-*.png`). The matching APIs return 403: `shift_templates`, `schedule_templates`, `time_off`, `availability`, `users`, `brands`. `/api/roster` returns 200 because View Schedule uses it, and it contains no emails. |
| S10 | **PASS** | bartender1 posted `[TEST-TEMP] QA2 S10 …` (201). All-staff unread went up by one for bartender2, brewer1, owner, office1 and newhire. No bell notification was created for anyone, as today. The device's notifications API returns 403, so it isn't a recipient (see the observation above). |
| S11 | **PASS** | Owner Revoke asks "Sign out … now? It will need a new pairing code" (`s11-revoke-confirm.png`), then `DELETE /api/device_tokens/:id` 204. On its next tap the revoked tablet got 401s and landed on **setup** with "This tablet was unpaired. Ask a manager for a new code." (`s11-revoked-tablet.png`). The second tablet kept working (`/api/me` 200). |
| S12 | **PASS** | After Deactivate (confirmed), the device tablet went to setup with the explanation on its next request. The tablet with an active "Sign in as me" session also went to setup within 5 s on its own (`g2-tc-after-deactivate.png`). After Reactivate, all old tablets stay signed out and all tokens show revoked. A new code pairs a new tablet (200). |
| S13 | **PASS** | On the tablet, bartender1 (mocked sign-in) requested time off: `POST /api/time_off` 201 for Sam Pour, shown under My requests. The banner reads "returns to the shared screen after 5 minutes without activity". **Real idle:** still personal at 290 s, device session at 310 s, `/api/me` → device, no re-pairing. **Simulated sleep** (Playwright clock jumped +6 min without firing timers, page hidden): the wake via visibilitychange, a tap and a reload each returned it to the device session. A control case with no wake event stayed personal until it was tapped (`s13-sleep-*.png`). |
| S14 | **PASS** | The Add shift and Add event pickers and the Users & Roles edit dialog (role selects only) never list a device. `POST /api/shifts` with `assignee_id` 37 or 19 → **422** "can't be a shared device", while a person id → 201 (deleted). `PATCH /api/users/37` with `is_owner` or memberships → 422 "Shared devices are managed under Shared devices". |
| G1 | **PASS** | A tablet whose network was frozen during deactivate and reactivate (so it sent no request in between) got 401 on its first request after Reactivate and landed on setup (`g1-stale-tablet-after-reactivate.png`). A new code was needed. |
| G2 | **PASS** (client side; see gap 1) | The personal session on the tablet ended within 5 s of Deactivate and the tablet went to setup. Revoke follows the same path. Server-side ending of a personal token can't be verified with a mocked login (gap 1). |
| G3 | **PASS** | Two tabs on one tablet: a personal sign-out in tab 1 moved tab 2 (on `/availability`, not reloaded) back to the shared screen (`g3-tab2-after-signout.png`). With `/api/availability` forced to 500, Availability shows "Couldn't load availability: boom" instead of a blank page (`g3-availability-load-error.png`). |
| G4 | **PASS** | Sign out in the device session asks "Sign out this tablet? A manager will need to pair this tablet again." Cancel keeps it paired (`/api/me` 200). With the server sign-out forced to 500, it stays paired and says "Couldn't sign this tablet out… It's still paired; try again." When confirmed and the server succeeds (`DELETE /api/session` with the device token → 200), the tablet unpairs, both tabs go to setup, and the server shows the token revoked. |
| G5 | **PASS** | Deactivate opens a confirm ("Every tablet paired to it is signed out now…"). Cancel left the tablets working (`g5-deactivate-confirm.png`). |
| G6 | **PASS** | No Calendar Sync button on the tablet's View Schedule at 1280×800, 800×1280 or 412×915. |
| G7 | **PASS** | Revoked, deactivated and reactivated-then-stale tablets all land on **setup** with "This tablet was unpaired. Ask a manager for a new code.", not the password login. |
| G8 | **PASS** | I scanned the body of every API response loaded by the device's pages (me, channels, departments, roster, positions, shifts, schedule_events, both channels' messages, and the 403s) for email patterns: none found. By comparison, the owner's shift data includes assignee emails. |
| G9 | **PASS** | A deactivated device's card shows "Deactivated" and Reactivate only, with no Pair a tablet button (`s12-deactivated-device.png`). |
| C: landscape | **PASS** | At 1280×800 on Home, View Schedule, All-staff and Taproom: scroll width equals client width (1280), and the nav, the "Shared device · Taproom" pill and "Sign in as me" are all fully in view (`c-1280x800-*.png`). Spot checks at 800×1280 and 412×915 show no horizontal scroll and the nav moves to a drawer (phone header cramped, gap 3). |
| C: manifest | **PASS** | `/manifest.webmanifest` has `"orientation": "any"` and `"display": "standalone"` (served as octet-stream, gap 4). |

## Not verified, and why

- **Real "Sign in as me" login:** mocked per the brief, because no passwords are available. That means whether the server ties, limits or revokes a personal token issued on a tablet wasn't verified (gap 1, G2 server side).
- **The S4 HTTP status code:** the 6th wrong code was shown as rate-limited in the UI, but the network listener didn't capture the response, so `429` itself isn't confirmed. I didn't send a 7th attempt to keep within the 6-attempt limit.
- **S5 "no password works":** only two passwords were tried, to avoid a login lockout. The device account has no password the UI could set.
- **S10 push or email fan-out:** not observable from the browser. Only the bell notifications API and unread counts were checked.
- **Real Samsung or Chrome install:** viewports were emulated in desktop Chromium. The installed-app orientation behaviour wasn't checked on hardware.
- **Security checks:** not attempted (header spoofing, token tampering, extra rate-limit probing), as the brief asks.

## Cleanup

- I revoked every `[TEST-TEMP]` tablet, deactivated `[TEST-TEMP] QA2 Bar tablets A`, then deleted it through the UI (with a confirm).
- I deleted the `[TEST-TEMP]` events (11888, 11889) and draft shifts (347, 348), and cancelled the `[TEST-TEMP]` time-off request.
- The two `[TEST-TEMP]` All-staff messages remain for `seed_synthetic()`.
- The seeded `taproomDevice` and `bartender1` sessions still work (`/api/me` 200) after the run.
