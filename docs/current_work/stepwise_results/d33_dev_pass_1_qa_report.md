# QA acceptance report — Rockcut D33 (taproom shared-device access), DEV

- **Tester:** independent QA pass (Claude). **Date:** 2026-09-30, about 17:15–17:50 UTC.
- **Target:** https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev (DEV only; prod was not touched).
- **Method:** throwaway Playwright scripts in this folder (`*.mjs`) using the pre-minted persona storageStates, plus raw API calls with those persona tokens. Screenshots are in `shots/`. I did not read any feature code.

## Result

**13 of 14 scenarios PASS, and S12 FAILS.** The access boundary is solid at the API layer. Every write, claim, post and blocked read from the device returned 403, and every blocked page showed the device-only page. The gaps are all about **ending sessions**:

- Deactivating a device doesn't really sign its tablets out.
- A personal session outlives the device.
- A stale second tab keeps showing the last person's personal UI after they sign out.

---

## Gaps

### G1 — Reactivating a device brings every old tablet back (deactivate is only a suspend) · **should-fix**
- **Path:** Admin → Shared devices → Deactivate, then Reactivate.
- **Expected (S12):** "Every tablet is signed out." A tablet that was signed out needs a new pairing code to come back, just like after Revoke.
- **Observed:**
  - While the device is deactivated, its tablet tokens get 401.
  - After Reactivate, the **same old tokens work again** (`GET /api/me` → 200) without any new pairing.
  - While deactivated, the list still shows every tablet as live with a REVOKE button.
  - So an owner who deactivates because a tablet was lost or stolen, then reactivates, silently turns the lost tablet back on.
- **Repro:**
  1. As `owner`, create device `[TEST-TEMP] D33 Brewhouse tablets` (home Brewery, id 25).
  2. As `breweryMgr`, pair tablet A.
  3. `PATCH /api/devices/25 {"active":false}` → 200. Tablet A: `GET /api/channels` → 401.
  4. `PATCH /api/devices/25 {"active":true}` → 200. Tablet A's old token: `GET /api/me` → **200**.
  - Tokens 11 and 12 stayed `revoked_at: null` throughout.

### G2 — A "Sign in as me" session survives the device being deactivated · **should-fix**
- **Path:** tablet in a personal session → owner deactivates the device.
- **Expected (S12):** every tablet is signed out on its next request.
- **Observed:**
  - Tablet B, signed in as `brewer1` through "Sign in as me", kept working after the deactivation.
  - It stayed on /time_off, then a tap on Availability 25 s later still worked. There was no 401, and the "Signed in as Jake Brewer on a shared tablet" banner stayed up. Only the tablet in device mode was signed out.
  - The personal session runs until the 5-minute idle return or sign-out. Only then does the tablet fall back to the dead device session and hit 401.
- **Repro:** device 25 with tablets A (device mode) and B (personal, `brewer1`). Owner deactivates in the UI. A shows the sign-in screen after about 21 s (`GET /api/channels` 401). B keeps working.
- I did not test Revoke during a personal session. It very likely behaves the same way, so the same question applies to S11.

### G3 — A stale second tab keeps showing the last person's personal UI after they sign out · **should-fix**
- **Path:** a tablet with two browser tabs. A person uses "Sign in as me", then taps Sign out in tab A.
- **Expected:** every tab on the tablet goes back to the shared-device screen. The next person shouldn't see the previous person's name, nav or data.
- **Observed:**
  - Tab B, with no reload, keeps the full personal UI: `bartender1@rockcut-test.com`, the bell badge (10), the Time off and Availability nav, and Sam's own time-off list on screen. It was still like that 25 s later.
  - Navigating inside tab B (Availability) switches the header to a normal person's **LOGOUT** button, with no shared-device banner.
  - The page loads with the device token, so the API refuses it (`GET /api/availability?user_id=6` → 403, twice). That 403 is swallowed: the page shows **"Available" for every day**, which is wrong because Sam has an unavailable day.
  - Pressing ADD there shows "Not available on a shared device".
  - No data leaked through the API, but personal data that was already loaded stays visible, and the UI is misleading.
- **Repro:**
  1. Paired tablet (`[TEST-TEMP] Taproom iPad 3`) with two tabs.
  2. Tab A: Sign in as me (`bartender1`). Tab B: open `/time_off` (it shows as personal).
  3. Tab A: Sign out → A shows the shared screen.
  4. Tab B: no reload → still personal. Click Availability → header shows LOGOUT, and the 403s appear.
  - Screenshot: `shots/odd_staletab.png`.

### G4 — Signing out in that stale tab unpairs the tablet with no confirmation and leaves its server token live · **should-fix**
- **Path:** continue from G3 and tap the header SIGN OUT in stale tab B.
- **Expected:** at most, the person's session ends. Unpairing the tablet should only happen through the confirmed "Sign out this tablet? A manager will need to pair this tablet again." dialog. That confirmed path works: it sends `DELETE /api/session` → 200 and the server revokes the token.
- **Observed:**
  - With no dialog, the tablet's device token is wiped from localStorage. Both tabs end up on "Sign in to continue", and the tablet needs a new pairing code.
  - The UI's `DELETE /api/session` returned **401**, so the server-side device token stayed live: token 10 was still "live" on Shared devices until I revoked it during cleanup.
  - A leftover `rockcut_personal_last_activity` key stays in localStorage.
- **Repro:** the G3 steps, then click SIGN OUT in tab B → `DELETE /api/session 401`. `GET /api/devices` shows `[TEST-TEMP] Taproom iPad 3` with `revoked_at: null`.

### G5 — "Deactivate" on Shared devices fires with no confirmation · **should-fix**
- **Path:** Admin → Shared devices → DEACTIVATE (as `owner`).
- **Expected:** a confirmation step, like Revoke ("Revoke tablet … CANCEL / REVOKE") and like the tablet's own Sign out. This one action signs out every tablet at once.
- **Observed:** one click sends `PATCH /api/devices/:id {"active":false}` right away. There is no dialog, native or MUI.
- **Repro:**
  - I first found this with non-GET requests intercepted and aborted, so the Taproom device (id 19) was never actually deactivated.
  - I confirmed it for real on `[TEST-TEMP] D33 Brewhouse tablets`: no confirm dialog appeared, and the page immediately showed "Deactivated".

### G6 — Calendar Sync button on the tablet's View Schedule · **minor**
- **Path:** `taproomDevice` → View Schedule → CALENDAR SYNC.
- **Expected:** a personal feature like calendar feeds isn't offered on a shared device.
- **Observed:** the button is shown. The dialog opens, calls `GET /api/calendar_feeds` twice (403 each time), and shows "No feeds available."
- Screenshot: `shots/tab_calsync.png`.

### G7 — A revoked or deactivated tablet lands on the password login, not setup, and gets no explanation · **minor**
- **Path:** a tablet that was revoked (S11) or whose device was deactivated (S12).
- **Expected (S11):** "…goes back to setup."
- **Observed:**
  - The tablet goes to the normal **"Sign in to continue"** email/password form. "Set up as a shared device" is only a link on that form.
  - Nothing says the tablet was signed out by a manager.
  - Staff are likely to try typing a password there.

### G8 — Device API responses include staff email addresses · **minor / question for the lead**
- **Path:** `taproomDevice` → `GET /api/shifts`.
- **Observed:** each shift's `assignee` includes `email` (for example `brewer1@rockcut-test.com`). The UI doesn't show it. The spec says the device can't see anything personal, so the lead should decide whether emails count.

### G9 — "Pair a tablet" is still offered on a deactivated device · **minor**
- **Observed:**
  - A deactivated device still shows PAIR A TABLET.
  - The API refuses the request cleanly: `POST /api/devices/25/pairing_code` → 422 "Reactivate this device before pairing a tablet".
  - I only checked the API refusal. I didn't click the button to see how the UI shows the error.

---

## Scenarios

| # | Result | Notes |
|---|---|---|
| S1 | **PASS** (variant) | "Taproom tablets" already existed from seeding, so I ran S1 with `[TEST-TEMP] D33 Brewhouse tablets` (home Brewery). The new device (id 25) was absent from: `/api/users`, Users & Roles, `/api/roster` (for owner, breweryMgr and brewer1), the Scheduler staff rows, and the Add shift / Time off / Availability pickers. The change log (/activity) showed "Shared device created". Deleted afterwards. The Taproom device (id 19) is also absent everywhere. |
| S2 | **PASS** | `barMgr` → Pair a tablet gave an 8-character code with a 10-minute countdown. Signed-out browser → Set up as a shared device → code + "Taproom iPad 1" → `POST /api/device_tokens` 201, signed in. The list showed "Taproom iPad 1 · Casey Tap · Paired · Last seen". Codes typed in lowercase or without the dash are also accepted. |
| S3 | **PASS** | `breweryMgr`: `POST /api/devices/19/pairing_code` 403, `DELETE /api/device_tokens/8` 403, `/api/devices` lists only its own department's device, and `/devices` redirects home. `bartender1`, `office1` and `floater` also got 403. `dualMgr`, `splitRole` and `owner2` got 201 (they're Taproom managers or an owner, so that's expected). `barMgr` pairing the Brewery device: 403. |
| S4 | **PASS** | Used code, expired code and wrong code each → 422: "That code is invalid or has expired. Ask a manager for a new one." shown in the UI. 3 refusals in total, only 1 of them a made-up wrong code. The expired attempt came about 5 s after `expires_at`. |
| S5 | **PASS** | Normal form with `taproom.device@rockcut-test.com` and a dummy string (not a real password) → `POST /api/session` 401 "Invalid credentials", the same as any bad login. |
| S6 | **PASS** | Nav shows Home, Schedule → View Schedule, Taproom ("Coming soon"), and Messages → All-staff, Taproom. No Scheduler, Time off, Availability, Admin, Brewery, bell or profile. The header shows "Shared device · Taproom · SIGN IN AS ME · SIGN OUT". See G6 for Calendar Sync. |
| S7 | **PASS** | Owner sees 22 shifts; the device sees the 18 published ones (0 drafts, including with `?status=draft` and similar parameters). For a published + draft `[TEST-TEMP]` event pair, the device sees only the published one. `GET` on a draft shift or draft event → 403. No claim control in the UI. `POST /api/shifts/227/claim` and `/228/claim` → 403, and the shift stayed unassigned. |
| S8 | **PASS** | Reads All-staff (3 messages) and Taproom (2). No message box; the page says "Shared devices can read but not post." `POST` to all, dept:bar and managers → 403. Managers isn't listed. `GET /api/channels/managers/messages` → 403. The UI URLs `/messages/managers` and `/messages/dept:brewery` → /messages/all. |
| S9 | **PASS** | `/scheduler`, `/time_off`, `/availability`, `/users`, `/brands` (plus /devices, /admin, /brewery, /office, /profile, /notifications and unknown URLs) all show the device-only "Not available on a shared device" page. The APIs `/api/time_off`, `/api/availability`, `/api/users`, `/api/brands`, `/api/devices`, `/api/notifications`, `/api/calendar_feeds`, `/api/batches`, `/api/recipes`, and writes to shifts, events and time off → 403. |
| S10 | **PASS** (partly observable) | `bartender1` posted to All-staff → 201. Everyone's All-staff unread count went up. Channel posts don't create notification rows for anyone (that's how it works today), and the device has no notification endpoint (403), so it can't be a recipient. I couldn't check push or email. |
| S11 | **PASS** (see G7) | Owner revoked "Taproom iPad 1" through the confirm dialog → `DELETE /api/device_tokens/8` 204. iPad 1's next poll (about 9 s) → 401, and it showed the sign-in/setup screen with storage cleared. "[TEST-TEMP] Taproom iPad 2" kept working. |
| S12 | **FAIL** | A device-mode tablet is signed out on its next request (401 at about 21 s). But see G1 (reactivation brings the tokens back), G2 (the personal session survives) and G5 (no confirmation). Run on the `[TEST-TEMP]` Brewery device, not the Taproom one, so the seeded `taproomDevice` token wasn't killed. |
| S13 | **PASS** (browser) | `bartender1` signed in as themself on the tablet and requested time off → row created with `user_id: 6`, pending. With real idle time, the tablet was still personal at 290 s and back to the device session at 310 s, without re-pairing. Emulated sleep (clock jumped 6 min, then a wake by visibilitychange, a tap or a reload) returned to the device session each time. Back button and reload after the return show only device pages. The personal token stays valid on the server (known issue 3991, confirmed). **Caveat:** "Sign in as me" needs a password, so I mocked the `POST /api/session` response with the persona's pre-minted token; the real server login wasn't run. The iPad hardware check is NOT RUN (Matt's manual check). |
| S14 | **PASS** | No device in any picker. `POST /api/shifts` with `assignee_id: 19` (as owner and as barMgr) → 422 "can't be a shared device", and `PATCH` → 422. `PATCH /api/users/19` (is_owner, memberships, name, active) and `PUT …/memberships` → 422 "Shared devices are managed under Shared devices". |
| 3939 | **PASS** | As `floater`, `/messages/managers`, `/messages/dept:office` and `/messages/nonsense` → /messages/all, and the refused channel has no box. Watching for 45 s: 0 responses of 403 or other 4xx; normal polling only. With the post response forced to 403, 422 and 500 (mocked), each showed a visible error ("You can't post in this channel.", etc.) and the draft text was kept. |
| Owner → device | **PASS** | As `owner` and `barMgr`, `POST /api/time_off` and `POST /api/availability` with `user_id: 19` → 403. The same body for `user_id: 6` → 201, so the refusal is specific to devices. There's no endpoint for creating a feed for another user (`POST /api/calendar_feeds` 404), and `?user_id=19` returns only the owner's own feeds. |
| Rate limiting | NOT RUN | Out of scope (the lead checks it). |
| Real iPad / PWA | NOT RUN | Manual check. |

## What I verified in the known limitations
- **#3 / 3991 confirmed:** after a personal sign-out or idle return, `bartender1`'s token still returned 200 on `/api/me`.
- **#6:** the emulated sleep paths work, as described in S13.

## Test-hygiene notes
- **Created and removed:**
  - device 25 (deleted);
  - tablet tokens 8, 9, 10, 11 and 12 (all revoked);
  - events 11626 and 11627, shift 239 and availability 19 (deleted);
  - time off 22 and 23 (cancelled; there's no delete endpoint).
- **Left in place:**
  - All-staff message id 38, "[TEST-TEMP] D33 S10 muodn3xl". There's no delete in the API or UI.
  - Several pairing codes that were issued but never used (all expired by now).
  - Audit rows.
  - The `[SEED] Playwright tablet` token (not mine; untouched).
- **Tokens:**
  - The local tablet storageState files I created were deleted at the end.
  - **One slip:** a `GET /api/calendar_feeds` as `owner` printed the owner's DEV feed URL tokens to my session log. They're fictional DEV data, but rotating them would be tidy.
- **Passwords:** none were typed. A dummy string was used for S5 and in the mocked "Sign in as me" form.
