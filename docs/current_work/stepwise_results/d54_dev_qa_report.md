# D54 independent QA report: shared tablets, no personal login

| | |
|---|---|
| **Build** | `ca5d9be` (`ca5d9be6a50ec4f7de44c1db38c60a218099e267`), `env: "dev"`; same SHA at start and end of the run |
| **Date** | 2026-11-04, evening (America/Denver) |
| **Environment** | DEV only (`rockcut-ui-dev.fly.dev`, `rockcut-api-dev.fly.dev`). Prod not touched. App source not read. |
| **Client** | Playwright 1.63 headless Chromium with a real service worker; viewports 320–1280 wide. No physical tablet. |
| **Personas used** | `owner`, `taproomDevice`, `breweryDevice`, plus one `[TEST-TEMP]` person and `[TEST-TEMP]` devices |

## Result

**One must-fix, six minor gaps.** The `/login` page, normal sign-in and sign-out, revoke, unpair and staff codes all behaved as the brief says. I never got a login form to appear on a live tablet.

The must-fix is at the API level: a live tablet's token sent as `Authorization: Bearer`, without `X-Rockcut-Device`, gets a personal session. I could not trigger this from the current UI. The open question is whether an old cached shell sends that request, which I could not test (see G1).

## Summary

| # | Severity | Gap |
|---|---|---|
| G1 | **must-fix** | `POST /api/session` accepts a personal login from a live tablet if its token is in `Authorization` rather than `X-Rockcut-Device` |
| G2 | minor | Messages is reachable on tablets (nav, Home tile, typed URL), but T2 lists it as not reachable. Likely a brief/product conflict. |
| G3 | minor | No theme shown in the tablet header, but the brief says it still is |
| G4 | minor | Header chip shows the department, not the device name; at phone width even that is hidden, and at 320px it truncates and Sign out wraps |
| G5 | minor | Pairing from the `/login` URL lands a new tablet straight on the refusal message |
| G6 | minor | Unknown URLs on a tablet say "needs your own account" instead of "not found" |
| G7 | minor (confirm) | Buy-a-Beer asks for the code on every write, with no "Acting as" window, though the brief describes one for both |

## Gaps

### G1 (must-fix): personal login accepted on a live tablet via the `Authorization` header

- **Path:** live `taproomDevice` → `POST /api/session` with the tablet's own token as `Authorization: Bearer`, no `X-Rockcut-Device`, and the right email and password.
- **Expected:** 403 with the refusal text. "A personal login accepted on a live tablet" is on the must-fix list, and the API knows this token belongs to a live device.
- **Observed:** **200, with a session for `[TEST-TEMP] D54 QA One`**. The same request with `X-Rockcut-Device` added, or sent instead, gets the 403. So the check looks only at that one header.
- **Repro:**
  1. Open a context with `storageState: 'auth/taproomDevice.json'` and load `/`.
  2. Inside the page: `fetch(API + '/api/session', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.rockcut_token}, body: JSON.stringify({email, password})})`.
  3. It returns 200. Add `'X-Rockcut-Device': localStorage.rockcut_token` and it returns 403.
- **How reachable is it? (please read before triaging)**
  - **Not reproduced from the current UI.** The new shell shows no form on a live tablet, so this took a scripted request. T4 as written, which specifies the `X-Rockcut-Device` header, passes.
  - **The real risk is an old cached shell**, which the brief flags as a limitation. Normal app requests on a tablet carry `Authorization`. If the old shell's Sign in as me sent its login that way, or with no device header at all, this API would accept it. I had no old shell to confirm this, so that part is inference.
  - **A request with no token at all can't be told apart from a normal browser login**, so the server can't refuse that case. Old shells would need to be ruled out on the client side (forced update).
- **Suggested triage:** developers should check what the previous build's Sign in as me sent. If it can't reach this path, this could drop to minor. I've kept it as must-fix until then.

### G2 (minor): Messages reachable on tablets

- **Path:** tablet → Home "Messages" tile, nav, or typed `/messages` (redirects to `/messages/all`). Same on both tablets and both sizes.
- **Expected:** T2: nothing personal reachable, including Messages; typed URLs say they need your own device.
- **Observed:** Team channels are readable, with the notice "Shared devices can read but not post" and no compose box. Admin → Shared devices also says tablets "can read the schedule and their channels". Profile, Time off and Availability are correctly blocked.
- **Repro:** `taproomDevice` → type `/messages`.
- **Note:** This looks deliberate, so the brief's wording may be what's wrong. No personal data or posting was seen. It needs a product decision.

### G3 (minor): no theme in the tablet header

- **Path:** tablet header at any size.
- **Expected:** Device name, theme and Sign out shown.
- **Observed:** The header has only the device chip and Sign out, and the nav drawer has no theme either. Theme is set per device by an owner in Admin → Shared devices. Setting a `[TEST-TEMP]` device to Dark did apply on its tablet.
- **Repro:** `taproomDevice` → `/` → inspect the header (`results/shots/recon_taproomDevice.png`).
- **Note:** The brief may have meant that the theme still applies. I couldn't compare with the earlier build.

### G4 (minor): device name in the header

- **Path:** tablet header at several widths.
- **Expected:** Device name shown at tablet and phone widths.
- **Observed:**
  - The chip shows the home department, not the device: "Brewhouse tablet" shows "Brewery", and "[TEST-TEMP] D54 Tablets" showed "Taproom". The actual device name appears only as the Home page heading.
  - At 390px and 360px the chip reads only "Shared device". At 600px and wider it includes the department; I didn't test widths between 390 and 600.
  - At 320px the chip truncates to "Shared de…" and SIGN OUT wraps to two lines. It's still usable, with no horizontal scroll.
- **Repro:** paired tablet at 390×844 and 320×568 (`results/shots/refusal_320.png`).

### G5 (minor): a newly paired tablet can land on the refusal message

- **Path:** blank browser → type `/login` → Set up as a shared device → valid code.
- **Expected:** A successful setup goes to the tablet's Home.
- **Observed:** Pairing works, but the URL stays `/login`, so the first thing the installer sees is "Personal logins not accepted". GO TO HOME recovers. Starting from `/` lands correctly on Home.
- **Repro:** as in the path above.

### G6 (minor): misleading message on unknown URLs

- **Path:** tablet → type any route that doesn't exist or isn't offered on tablets, such as `/nonexistent-xyz`, `/reset-password` or `/taproom`.
- **Expected:** A "not found" message for pages that don't exist.
- **Observed:** "Not available on a shared device. This page needs your own account. Use your own phone or computer." That sends staff to their phone for a page that may not exist. It's safe, with no form and GO TO HOME works.
- **Repro:** `taproomDevice` → `/nonexistent-xyz`.

### G7 (minor, please confirm): no "Acting as" window on Buy-a-Beer

- **Path:** `taproomDevice` → Buy-a-Beer → add an entry with a code → Redeem.
- **Expected:** The brief describes a 5-minute "Acting as" window for staff codes on "task boards, Buy-a-Beer".
- **Observed:** Add and redeem both work, but no "Acting as" banner appears after a valid code, and the redeem dialog asks for the code again. Task boards do have the window.
- **Repro:** add a `[TEST-TEMP]` entry with a valid code, then press REDEEM on it.
- **Note:** This may be how it has always worked; I have no earlier build to compare.

## Scenarios

| # | Result | Notes |
|---|---|---|
| T1 | **Pass** | `env: "dev"`, full SHA matches, ribbon reads `DEV · ca5d9be` |
| T2 | **Partial** | No Sign in as me anywhere. 41 typed routes plus `/devices` showed no form; Profile, Time off, Availability and Admin are blocked. See G2, G3, G4. |
| T3 | **Pass** | All `/login` variants, including `?next=` with an external URL, show the refusal with no fields, on both tablets at both sizes. Home still works and the tablet stays paired. See G6. |
| T4 | **Pass as written** | Exact 403 text for right password, wrong password, unknown email, extra fields, form-encoded and null or empty values. Empty body, email only and password only give 400. The person's own session stayed valid. **See G1 for the header variant.** |
| T5 | **Pass** | "This tablet was unpaired" appears on reload, and on the next request without a reload. An idle board flipped by itself within 70s. Typed `/login`, `/profile` and others show the set-up screen, never a sign-in form. Back to sign in → normal login works in that browser. |
| T6 | **Pass** | Confirm dialog, then unpaired. A twin tab follows. The used code is refused; a new code pairs. |
| T7 | **Pass** | First-login password change, wrong current, mismatch and short password errors, and a successful change all work. The change signs out other devices. "Signed out of 1 other session" kept this browser and its twin tab. Logging out signs out the twin tab too. |
| T8 | **Pass** | Brewery tick and untick and Buy-a-Beer add and redeem work on the live tablets. Details below. See G7. |
| T9 | **Partial** | No form, lost pairing or prompt during a 35-minute real idle or a simulated 25h idle and wake. **Idle reload and the update prompt were not observed** (see below). |

**T8 details**
- **Window:** it's 5 minutes from the **last write**, not from code entry. A write at 4:42 needed no prompt; the banner went at 9:48 and the prompt returned. Done ends it immediately.
- **Lockout:** the 5th wrong code gives "Too many wrong codes. Try again in 10 minutes." on boards and Buy-a-Beer, with **no mention of Sign in as me**. The right code is also refused during lockout, and accepted again when retried at 10.5 minutes.
- **Scope:** the lockout applies per pairing. Another tablet on the same device and the live Taproom tablet accepted the right code during it. Wrong codes never unpaired a tablet.

**Other paths tried for a stray login form (none appeared)**
- A login form left open in one tab while a twin tab pairs: it switched to the tablet Home by itself.
- A real revoked token in the header: right password 200, wrong password 401, empty body 400. A signed-out token with the right password: 200. A made-up token: right password 200, wrong password 401. Deactivating a whole device unpaired its tablet to the same screen.
- Revoke, personal login, log out, re-pair: the refusal returns correctly.
- API failures, injected on a `[TEST-TEMP]` tablet (500, 503, 429, network down) and real offline with the service worker: "Can't reach the server, retrying…", with pairing kept and recovery afterwards.
- Layouts, checked by eye: the refusal at 390px (light), 320px and 1280px (dark), and the unpaired screen at 390px. All read cleanly. No horizontal scroll at any width tested.

**Risk worth a look, not a gap**
- A single 401 on any API call makes the tablet forget its token for good, even one on `/api/channels` with `/api/me` fine. I injected this, and found no way to get a false 401 from real DEV. Any proxy or deploy blip that returns 401 would need a new pairing code.

**Rate limiter**
- **Pairing:** no 429s. I submitted only one invalid code (a reused one).
- **Sign-in:** no 429s.
- **Staff codes:** the only real 429s were the expected lockouts.
- **Logs:** the 500, 503 and 429 lines on `/api/me` in `t5rest.log` are ones I injected.

## Couldn't test

- **Old cached shell against the new API:** no old build was available. This is the key open question for G1.
- **"New version available" prompt:** none appeared naturally, and I couldn't force one because Playwright doesn't intercept `/sw.js`.
- **Tablets reloading when idle:** not observed in 35 real minutes or with a fake clock. The trigger may be longer or tied to a new version, so this is neither confirmed nor shown broken.
- **Release sign-out (item 4):** needs a session from before the release.
- **Real tablet hardware and touch:** only emulated viewports in headless Chromium.
- **Wrong-code lockout on `taproomDevice` and `breweryDevice` themselves:** run on `[TEST-TEMP]` tablets instead, so the live ones weren't locked. Right codes were tested on the live tablets.
- **Ticking a future-day task with a code:** it opens a "finish" dialog that I didn't complete. Today's tasks were covered.
- **Old password refused after a change:** not directly checked; other devices being signed out was.
- **A real reset-password link:** the sign-in page offers no such link, and the routes I guessed show the normal form or the shared-device message. Owner → Reset password was not run.

## Data made and cleaned

| Item | Made | Cleanup |
|---|---|---|
| Person `[TEST-TEMP] D54 QA One` (`test-temp-d54-qa1@rockcut-test.com`, id 3108), with a staff code | 1 | **Deactivated**; confirmed `active: false` |
| Devices `[TEST-TEMP] D54 Tablets`, `[TEST-TEMP] D54 Tablets 2` and all their pairings | 2 | **Deleted**; confirmed gone |
| Tasks `[TEST-TEMP] D54 task 1` and `task 2` (Brewery board) | 2 | **Deleted** through the API as `owner`, because I found no delete in the UI; confirmed gone |
| Buy-a-Beer `[TEST-TEMP] D54 Guest` and `Guest 2` | 2 | **Deleted**; confirmed gone |
| Scratch file with the password and staff code (mode 0600) | 1 | **Deleted** |

**Left behind or changed**
- The inactive person's row, and any entries my actions added to the user change log.
- Unread markers: opening Messages on `taproomDevice` marked its channels read, and its badge went from 4 to 2.
- Sessions my tests created for the person, including the G1 one. I didn't test them after deactivating the person.

**Not mine, not touched:** a `[TEST-TEMP] S4 … Trivia` event on the Taproom board for Mon 11/16.

**Confirmed at the end:** `taproomDevice` and `breweryDevice` are still paired (`/api/me` returns 200, kind `device`), and their two devices are active. No messages posted, no `[SEED]` data changed, and no persona or live tablet signed out or revoked. A pattern search of `results/` found no tokens.

Scripts are in `scripts/`; logs and screenshots are in `results/shots/`.
