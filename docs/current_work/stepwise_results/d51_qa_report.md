# D51 part 1 — independent QA report (DEV)

- **Build:** `4a5921c` (DEV API v63 / UI v66), UI https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev. Prod was not touched.
- **Date:** 2026-10-28, approx. 11:40–12:15 America/Denver.
- **Method:** Playwright scripts (Chromium 153) in `scripts/` and `curl` (HTTP/1.0, 1.1, 2). Logins used the `auth/*.json` storageState files without opening them. The bearer token was only used inside the page and never printed or logged. The temporary password and the new password of the `[TEST-TEMP]` person were kept in a mode-0600 scratch file during the run, never printed, then deleted.
- **Personas used:** `breweryMgr`, `owner`, `barMgr`, `bartender1`, `taproomDevice`, plus one `[TEST-TEMP]` person I created (`temp-d51qa-hewx1kx1@rockcut-test.com`, Taproom employee).

## Summary

| # | Severity | Gap |
|---|---|---|
| G1 | **must-fix** | Decimal fields accept JSON **number** values that the same API refuses as **strings**: 40-digit numbers and `1e308` are saved after rounding to float precision, and tiny values such as `-1e-9999` are saved as `0`. The UI sends numbers, so the main UI path saves a 40-digit ABV as `1234567890123456800000000000000000000000`. This affects every decimal field tested (brand, lot, batch, batch log, recipe). |
| G2 | minor | Errors returned before the router runs (400 malformed JSON, 413 body too large) have no CORS headers. The browser then shows only "Failed to fetch", so the UI cannot show an error. |
| G3 | minor | "Enable push" in a browser that can't subscribe (e.g. Chrome incognito) throws an unhandled page error and gives the user no feedback. The button just stays as it was. |
| G4 | minor | Batch log Timestamp: the local time typed in is stored as UTC with no time-zone conversion (10:00 Denver is saved as `10:00Z`) and shown as raw ISO. Shifts and time off convert correctly. Probably not caused by D51. |
| G5 | minor | No range checks on brewing numbers: ABV `-5`, `1000` and `525` are saved. In the UI, typing `5,25` gives `525` (Chromium drops the comma), which saves as ABV 525. |
| G6 | minor (housekeeping) | Messages can't be deleted (no UI or API), so my one `[TEST-TEMP]` message in All-staff stays. |

No 500s, crashes, hangs or blank pages anywhere. `/api/health` returned 200 after every hostile request.

---

## Gaps in detail

### G1 (must-fix): JSON number literals bypass the decimal guard and are saved wrong

- **Path:** Brewery → Brands & Recipes → `[TEST-TEMP]` brand → Edit Brand → Target ABV = `1234567890123456789012345678901234567890` → Save. The same thing happens straight at the API: `PUT /api/brands/:id` with a raw JSON number.
- **Expected:** refused with a field error ("is invalid"), the same as the string form, or saved exactly as typed.
- **Observed:**
  - **UI:** the request body has `"target_abv":1.2345678901234568e+39`. The API returns 200 and stores `1234567890123456800000000000000000000000`, which is shown on the brand page after reload. See `q2_ui_40digit_saved_wrong.png`.
  - **API, string form:** `"1e9999"`, `"-1e-9999"`, `"1e999999999"`, 40 digits, `"abc"`, `"5,25"`, `"  5.5  "`, `"NaN"`, `"Infinity"` all return **422 `is invalid`**. This is correct.
  - **API, number form, same field:**

    | Raw JSON value | Response | Stored |
    |---|---|---|
    | `1234567890123456789012345678901234567890` | 200 | `1234567890123456800000000000000000000000` |
    | `1e308` | 200 | a 309-digit number |
    | `-1e-9999`, `1e-400` | 200 | `0` |
    | `123456789012345678.25` | 200 | `123456789012345680` |
    | `5.123456789012345678901` | 200 | `5.123456789012345` |
    | `1e9999`, `1.79e309` | clean 400 (JSON parser rejects it) | — |

  - **UI, `-1e-9999`:** saved silently as `0` (`q2_ui_tiny_saved_as_0.png`).
  - **String `"99999999999999999999999999999999.99"` (34 digits):** accepted and stored as `1E+32`, losing the `.99`.
- **Scope:** I fuzzed each field below with the same matrix (10 strings + 4 raw literals) and got the same result on all 16:
  - brand `target_abv`, `target_ibu`, `target_srm`
  - ingredient lot `alpha_acid`, `color_lovibond`, `extract_potential_fgdb`, `attenuation`, `protein_perc`, `moisture_perc`, `diastatic_power_linter`
  - batch log `gravity`, `temperature`, `ph`
  - batch `actual_abv`, `actual_og`, `actual_volume`, `ferm_temp`
  - recipe `batch_size`, `efficiency_target`

  The only difference: `batch_size` refuses `-1e-9999` (it must be positive).

  The UI path was confirmed for brand ABV and batch-log Gravity (`q3_log_40digit_gravity.png`).
- **Repro:** run `node scripts/q2_raw.js <brandId>` and `node scripts/fuzz.js breweryMgr /api/brands/<id> target_abv 1`. By hand: `PUT /api/brands/<id>` with body `{"target_abv": 1234567890123456789012345678901234567890}`. You get 200, and `GET` returns the rounded value.
- **Likely cause (from behaviour, not source):** JSON numbers reach the changeset as floats or integers rather than strings, so the new decimal limit only applies to string input, and SQLite storage keeps only float precision.

### G2 (minor): parser-level error responses have no CORS headers

- **Path:** the UI origin sends a body the parser rejects (malformed JSON, the JSON literal `1e9999`, or more than about 8 MB).
- **Expected:** a 400 or 413 the UI can read and show.
- **Observed:** curl shows a clean `400 {"errors":{"detail":"Bad Request"}}` and a clean `413 Request Entity Too Large`, but neither has `access-control-allow-origin`. In the browser, `fetch` rejects with `TypeError: Failed to fetch` (status hidden). Normal app errors (401, 403, 422) do carry CORS headers.
- **Repro:** `curl -D - -X PUT -H 'origin: https://rockcut-ui-dev.fly.dev' -H 'content-type: application/json' --data '{bad' https://rockcut-api-dev.fly.dev/api/brands/1` returns 400 without any `access-control-*` headers.

### G3 (minor): "Enable push" fails silently when the browser can't subscribe

- **Path:** `bartender1` → bell → Notification preferences → Enable push, in a browser where `pushManager.subscribe` rejects. Chrome incognito is the real-world case; Playwright's normal contexts behave the same way.
- **Expected:** a message such as "Push isn't available in this browser".
- **Observed:** the page throws an unhandled `Registration failed - permission denied` error, and the dialog doesn't change. When permission is actually blocked, the app does show "Notifications are blocked for this site…", so only this branch is missing.
- **Repro:** `node scripts/q7_prefs.js`.

### G4 (minor, probably not caused by D51): batch log timestamp saved without time-zone conversion

- **Path:** Batch → Log Entries → Add Entry → Timestamp `2026-10-28 10:00` → Save.
- **Expected:** 10:00 America/Denver, stored as `16:00Z` and shown as local time. That is how shifts and time off behave: time off starting 2026-11-20 is stored as `07:00Z`.
- **Observed:** the request sends `"2026-10-28T10:00"`, the API stores `2026-10-28T10:00:00Z`, and the table shows the raw string `2026-10-28T10:00:00Z`. The value is 6 hours off from the rest of the app's UTC data (`q3_log_after_reload.png`).

### G5 (minor): no range validation on brewing numbers

- **Observed:** ABV, IBU and SRM accept `-5`, `1e3` (saved as 1000) and 32-digit values. Typing `5,25` in the ABV box in Chromium becomes `525`, which saves as ABV 525% with no warning (`q2_ui_comma_saved_525.png`). This was probably already the case before D51.

### G6 (minor): test message can't be cleaned up

- `[TEST-TEMP] D51 QA message — please ignore` (id 478, All-staff, posted by `barMgr`) remains. Messages have no delete in the UI, and `DELETE /api/channels/all/messages/478` and `DELETE /api/messages/478` both return 404.

---

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | **Pass** | Created `[TEST-TEMP] D51 QA Lager` with ABV 5.25, IBU 35, SRM 4.5. All three were the same after reload, in the list, the detail page and the API (`q1_after_reload.png`). |
| Q2 | **Fail → G1** (also G5) | **API strings:** every absurd value gives 422 `is invalid`, never a 500; empty string clears the field; `"  5.5  "` is refused (acceptable). **UI:** `1e9999` and `1e999999999` get the native "Please enter a number." and Save is blocked (`q2_ui_1e9999_native_error.png`); `abc` can't be typed. The failures: 40 digits saved rounded, `-1e-9999` saved as 0, `5,25` saved as 525. No 500, hang or blank page. |
| Q3 | **Fail → G1** (also G4) | **Ingredient lot:** Add Lot via UI saved alpha 12.3 / color 3.5, same after reload. **Batch log:** Add Entry via UI saved gravity 1.05 / temp 66.5 / pH 5.2, same after reload; a missing timestamp shows "timestamp: can't be blank". All decimal fields behave as described in G1. Batch and recipe decimals were also covered. The batch was created via the API, because I found no "new batch" button in the UI. |
| Q4 | **Pass** | Owner → Users & Roles → Add User showed the temp password once in the dialog. It was not on the page after reload and not in `GET /api/users`. Signing in with it led to "Set a new password". Before the reset, the API returned 403 for `/api/brands` and `/api/shifts`. A short password was refused ("at least 8 characters"). After setting a new password: Log out cleared the token; the old temp password then returned 401; the new password signed in straight to Home. |
| Q5 | **Pass** | Two contexts signed in as the temp person. Profile → Sign out of all other devices → confirm → `DELETE /api/sessions/others` 200, "Signed out of 2 other sessions." The other context's next `/api/me` returned 401 and on reload it showed the sign-in form. The current context stayed signed in. |
| Q6 | **Pass** | Taproom tablet → Sign in as me: wrong password shows "Invalid credentials"; correct password signs in as the temp person. Their Sign out (`DELETE /api/session`) returns the tablet to the shared "Taproom tablets" screen, and the tablet is still signed in as the device after reload. The person's old token reused afterwards returned **401** (revoked on the server). |
| Q7 | **Pass**, with a caveat about the persona | Playwright's normal (incognito) Chromium can't subscribe to push ("Registration failed - permission denied"; Chrome doesn't support push in incognito), so `bartender1`'s storageState can't be used for push → G3. A persistent, non-incognito profile can subscribe, but storageState can't be loaded into it without handling the token, so I used the `[TEST-TEMP]` Taproom person instead. In the app UI: Enable push → "Push is enabled on this device", `POST /api/push/subscriptions` 201. `barMgr` then created and published a `[TEST-TEMP]` Bar-open shift to them. The service worker's **`push` event fired about 170 ms after publish**, with a decrypted payload `{"title":"You've been scheduled","body":"Bar-open — Taproom",…}`, and a system notification was shown (`q7_live_receiver.png`). The in-app bell got the matching entry. This shows VAPID signing and payload encryption work on DEV over HTTPS. A push published while the receiving browser was closed was not delivered when it reopened; that is expected FCM/TTL behaviour and is not counted as a gap. |
| Q8 | **Pass** | Each page loaded with no page errors, and one write per page persisted after reload: **Scheduler** (barMgr) — Add shift + Publish week (`POST /api/shifts` 201, `/publish` 200). **View Schedule** (temp person) — shows their published shifts; no write that doesn't touch seed data (Claim would modify a `[SEED]` open shift), so this one is read-only. **Messages** (barMgr) — posted message persisted. **Time off** (temp person) — request with note persisted, then cancelled. **Tasks board** (barMgr, `/tasks/bar`) — added task persisted. **Buy-a-Beer Board** (barMgr) — "Add from chalkboard" row persisted. **Production Gantt** (breweryMgr) — Add process → Plan batch (pencilled) persisted. |
| Q9 | **Pass** | Results below. |

**Q9 results** (`/api/health` 200 after every step):

| Request | Result |
|---|---|
| 5 MB JSON body | parsed normally (401) |
| 20 MB JSON body | clean **413** |
| 10k-deep array, 100k-deep object, 200k keys | normal 400 in under 0.5 s |
| Header 8 KB | 200 |
| Header 16–65 KB, or 200 headers | clean **431** |
| Header ≥100 KB | connection reset at the TLS/proxy layer; the static UI host does the same, so this is Fly's edge, not the API |
| HTTP versions | HTTP/1.0, 1.1, 2 and h2-prior-knowledge all 200 |
| Keep-alive / multiplexing | 5 requests over one HTTP/1.1 connection and over one h2 connection, all 200 |
| 30 parallel health checks, 30 parallel bad logins, 5 parallel 5 MB uploads | all clean |
| 30 parallel authenticated SQLite writes (PUT brand) | all 200 in 0.4 s |
| 10 parallel `POST` log entries + 20 parallel `GET` shifts | all 2xx; exactly 10 rows written; no "database busy" errors |
| CORS preflight from the UI origin | allowed |
| CORS preflight from `evil.example.com` and from the prod UI origin | no `allow-origin` |

## LIMITATIONS: what I checked specifically

- **Bandit behind Fly's proxy:** HTTP/2, keep-alive, large bodies, headers, parallelism and CORS were all checked (Q9). The only problem found is G2.
- **SQLite driver in the Docker image:** every write path in Q1–Q8 worked. Concurrent writes worked (Q9). Deletes cascaded correctly: deleting the batch removed its log entries.
- **Web push signing (jose):** a real end-to-end push was delivered (Q7).
- **Sign-in sessions (plug_crypto):**
  - Each of these returns 401, never 500: flipped first, middle or last character; truncated; doubled; empty; 7 KB; `a.b.c`; an unsigned `alg:none` JWT; non-ASCII characters; `%00`; wrong auth scheme.
  - Garbage `X-Rockcut-Device` header values are ignored.
  - Calendar feed `/api/calendar/<token>.ics`: valid returns 200 `text/calendar`; tampered or truncated returns 404.
  - Small note: `bearer` in lower case is refused (401).
- **Vite build / PWA:**
  - Manifest: 200 `application/manifest+json` with standalone display and 192, 512 and maskable icons, all 200. Chromium reports no installability errors.
  - `sw.js` is served with `no-cache`, is active and controls the page, with a Workbox precache.
  - Offline reload shows the cached app shell with "Can't reach the server, retrying… / TRY NOW".
  - **"New version available · Reload":** simulated by installing a modified `sw.js` and then letting the real one arrive as the update. The banner appeared, Reload navigated, the new service worker took control and the banner went away (`pwa_new_version_prompt.png`, `pwa_after_reload_click.png`).

## Not testable or not tested

- Push to `bartender1`'s own storageState session: Playwright incognito contexts can't subscribe. The push path itself was covered by the temp Taproom person (see Q7).
- One rule bent on purpose: Q7's live push test had two browsers open briefly in one script, the receiver's persistent profile and `barMgr`'s browser. A push receiver has to be online while someone else publishes. Every other script used one browser.
- A View Schedule write without touching seed data (see Q8).
- Real browsers other than Chromium 153, and real mobile devices.

## Other observations (not counted as gaps)

- No login rate limiting: 30 parallel bad logins all return 401 and none return 429.
- Seed data says "reseeded today", but seed brands have `inserted_at` 2026-10-21, and a brand named "Oktoberfest" (id 814, no `[SEED]` tag) exists from 2026-10-27.
- `[TEST-TEMP]` data from earlier QA rounds is still on DEV and is not mine: disabled users "D34/D37/D40 tablet …" and production processes "[TEST-TEMP] Souring tat1tk", "Fining t8gptp", "Hop stand t7gs98".

## Data I created and cleaned up

| Item | Cleanup |
|---|---|
| Brand `[TEST-TEMP] D51 QA Lager` (id 1129) | deleted (204) |
| Recipe v1.0 (id 2) on that brand | deleted (204) |
| Batch `[TEST-TEMP] B1` (id 2228) + 12 log entries (including 10 tagged `[TEST-TEMP] parallel n`) | batch deleted; log entries gone (`GET` returns `[]`) |
| Production batch `[TEST-TEMP] D51 QA Lager X2` (id 2229, pencilled 2026-12-01) | deleted (200) |
| Ingredient `[TEST-TEMP] D51 QA Hop` (id 52) + lot `[TEST-TEMP] LOT-1` (id 1) | deleted (204) |
| Shifts 3334–3337 (`[TEST-TEMP] D51 QA push test …`, published to the temp person) | deleted (200) |
| Bar task `[TEST-TEMP] D51 QA task` (id 46859) | deleted (204) |
| Beer board row `[TEST-TEMP] D51 QA For / Buyer` (id 2578) | deleted (200) |
| Time-off requests 321, 322, 323 (temp person) | cancelled. 321 and 322 were accidental default submissions by my script; 323 has the `[TEST-TEMP]` note. Cancel is the only removal the app offers. |
| Person `[TEST-TEMP] D51 QA hewx1kx1` (user 2853) + push subscription | push disabled (`DELETE /api/push/subscriptions` 204), signed out, then set to **inactive** and not on schedule. The app has no delete; the user now gets 401 on sign-in. |
| Message 478 in All-staff | **not removable** (G6) |
| Local scratch: secret file, Chromium profile, Q9 payloads | deleted |

No `[SEED]` data was changed. No persona was signed out, revoked or had its password changed. `taproomDevice`'s device session is still valid.
