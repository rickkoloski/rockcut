# D51 part 2: independent QA report (DEV)

- **Build:** `f9485759312d7dcc5916162039e43522b3ef56c4` (`/api/health` → `{"env":"dev","status":"ok","sha":"f948575…","app":"rockcut_api"}`), checked at start and end.
- **Date:** 2026-10-28, evening (America/Denver)
- **Environment:** https://rockcut-ui-dev.fly.dev, https://rockcut-api-dev.fly.dev. Prod was not touched.
- **Browser:** Playwright Chromium (headless). Firefox/WebKit are not installed.
- **Personas used (storageState, files never opened):** owner, breweryMgr, barMgr, brewer1, bartender1, dualMgr, taproomDevice, breweryDevice. No persona was signed out, revoked or had its password changed.
- **Scripts:** `scripts/` (raw output: `results/r6_api_matrix*.json`, `results/r6_ui.json`).

## Summary

| # | Severity | Gap |
|---|---|---|
| 1 | **must-fix** | Recipe → Grain bill → **Add ingredient** with Sort Order left blank → **500**; the dialog just stays open with no message, and the console shows `i.join is not a function`. The same happens on update (`PUT sort_order: null`). |
| 2 | **must-fix** | A **comma decimal is silently dropped** in number boxes: typing `5,2` in ABV **saves 52**, `5,25` in batch volume saves 525, `6,8` in ferm temp saves 68, `5,25` in °L saves 525. `5,25` in ABV is only blocked because 525 > 100. |
| 3 | **must-fix** (per the brief's "a 500" rule; API-only) | `POST /api/users` with malformed `memberships` (form-encoded, a map, a string, `[null]`) → **500**, for owner and manager alike. Nothing is saved. |
| 4 | minor | A manager can create a person with **no department** (`memberships` left out, or "— None —" in the dialog), and that person then disappears from the manager's own list. |
| 5 | minor | Water tab: the browser's min/max check does not stop the submit, unlike every other dialog. The server refuses correctly (422 with range message), so nothing is saved wrong. |
| 6 | minor | Tablet holding only an old `rockcut_device_token` (no `rockcut_token`): shows the **"Sign in as yourself"** form without first checking the device. Valid credentials then end on "This tablet was unpaired" (the session is created and deleted cleanly). Confusing, but not stuck. |
| 7 | minor | Non-numeric strings (`"5,25"`, `"abc"`, a 40-digit **string**) get "is invalid" instead of the range message. A 40-digit **number** and `"1e308"` do get the range message. |
| 8 | minor | Malformed JSON numbers (`{"target_abv": 1e999}`) → 400 **without CORS headers**, so the browser sees "Failed to fetch". Crafted requests only. |
| 9 | minor | Recipe batch size and ingredient amount inputs have `min=0`, so the browser lets `0` through (the server refuses it with the right message). Mash step Temperature and Duration are required by the server but the labels have no `*`. |
| 10 | minor | Cosmetic: the Brew turn recipe picker shows `vv1.0`. Error alerts are rendered twice. `1e-320` is stored and returned as a 300-plus-character decimal. `/batches/new` (or any non-numeric id) gives a blank page. `/batches` works but isn't in the nav. |

No out-of-range value was accepted anywhere (API or UI). There were no 500s on brewing range checks, no sign-in loops, and the "Can't reach the server" screen never appeared.

## Gaps in detail

### 1. Add recipe ingredient with blank Sort Order → 500 (must-fix)
- **Path:** breweryMgr → Brands & Recipes → brand → recipe → Grain bill → Add ingredient. Choose the ingredient and lot, Amount 500, Unit lb, leave Time and Sort Order empty, Save.
- **Expected:** saves (both fields are optional), or shows a field message.
- **Observed:** `POST /api/recipe_ingredients` → **500**. The body has `"sort_order":null`. The dialog stays open with no message, and the console shows `PAGEERROR i.join is not a function` (the error handler can't render a 500).
- **Repro:** API with `{recipe_id, lot_id, amount:2, unit:"lb", use:"mash", time_minutes:5, sort_order:null}` → 500. Leaving the key out → 201. `time_minutes:null` → 201. `PUT /api/recipe_ingredients/:id {sort_order:null}` → 500. A real user has to type a Sort Order to add any ingredient.

### 2. Comma decimal saved as a wrong number (must-fix)
- **Path:** any brewing number box, e.g. Add Brand → Target ABV, type `5,2` → Save.
- **Expected:** refused, or read as 5.2 ("Typing 5,25 … no longer saves 525").
- **Observed:** Chromium drops the comma as you type (the box shows `52`), the browser check passes, and the server stores **52**. Verified saves: ABV `5,2`→52, IBU `2,5`→25, batch Actual Volume `5,25`→525, Ferm Temp `6,8`→68, lot Color `5,25`→525 (all deleted afterwards). `5,25` in ABV is only stopped because 525 > 100.
- **Repro:** `scripts/r6_comma.mjs`. Inputs are `type=number`. With a real keyboard, Chromium (en-US) doesn't insert the `,`, so the app never sees it. A fix probably needs `type=text inputmode=decimal` plus app-side parsing. Firefox/Safari were not tested (they may give `badInput` instead).

### 3. `POST /api/users` with malformed memberships → 500 (must-fix by rule)
- **Path:** `POST /api/users` as owner or barMgr with `memberships` as a map `{"0":{…}}`, a string, `[null]`, or form-encoded `memberships[0][department]=bar`.
- **Expected:** 422.
- **Observed:** 500 `{"detail":"Internal Server Error"}`. No user is created. Form-encoded with no memberships → 201.
- **Repro:** `scripts/r5_500.mjs`.

### 4. Manager creates a no-department person (minor)
- **Path:** barMgr → `POST /api/users {email, name}` (no memberships), or the Add user dialog with Taproom "— None —".
- **Expected:** refused ("can't create outside their department").
- **Observed:** 201 (user 2905). That person is not in barMgr's `/api/users` afterwards, so the manager can't see or fix them. Possibly pre-existing behavior.

### 5. Water tab skips the browser check (minor)
- **Path:** recipe → Water → Edit water profile, Calcium `2001` → Save.
- **Observed:** the input is natively invalid, but a `PUT` is still sent → 422 "calcium: must be between 0 and 2,000", shown in an alert. Nothing saved. Every other dialog blocks before sending.

### 6. Old device token alone → "Sign in as yourself" (minor)
- **Path:** localStorage `rockcut_device_token=SFMyNTY…` and no `rockcut_token`, then load `/`.
- **Expected:** the sign-in page (or "tablet was unpaired").
- **Observed:** the tablet's "Sign in as yourself" form, with no API call. Cancel → sign-in page (both keys cleared). Signing in with valid credentials → `POST /api/session` 200, `GET /api/session` 401 (device), `DELETE /api/session` 200 → "This tablet was unpaired". Clean, but the person's correct password appears to "not work". With both old keys set you get "This tablet was unpaired" directly. Adding `rockcut_personal_last_activity` → sign-in page. All of these are without a loop.

### 7–10. See the table; repro data is in `results/r6_api_matrix*.json` and `results/r6_ui.json`.

## Scenarios

| # | Result | Notes |
|---|---|---|
| R1 | **Pass** | Health 200, `env:"dev"`, sha `f948575…`. The ribbon reads `DEV · f948575 — fictional test data only`. |
| R2 | **Pass** (gap 6 is minor) | The service worker was installed first (`controller` active). Stale tokens tried: Phoenix-style `SFMyNTY.…`, `abc`, JWT-like, `ses_bogus`, `"null"`, `""`. Pages tried: `/`, `/scheduler`, `/brewery/production`, `/devices`, `/tasks/bar`, `/schedule`, `/taproom/beer-board`. Each showed the sign-in page, `rockcut_token` was cleared, there was exactly one `/api/me` and no repeat calls in the next 5 s, and no blank page, error screen or "Can't reach". Signing in afterwards from `/scheduler` landed on Home and survived a reload. `dev_bogus` → "This tablet was unpaired" pairing screen (sensible). Tablet path: stale token → sign-in → "Set up as a shared device" → a bogus code shows "That code is invalid or has expired"; a real code pairs fine (R4). |
| R3 | **Pass** | `[TEST-TEMP]` person: forced password change on first sign-in, sign in, Log out (token cleared, deep link → sign-in), sign in again. Two contexts, then Profile → "Sign out of all other devices" → confirm → "Signed out of 4 other sessions." The other context got 401 on its next request, and in-app navigation (no reload) dropped it to sign-in with the token cleared. This context stayed signed in, and the other could sign back in. |
| R4 | **Pass** | A **new `[TEST-TEMP]` tablet was paired from a browser holding a stale token**. Its screens (Home, Schedule, Tasks, Buy-a-Beer, Production) load. Sign in as me (Taproom person) → "Signed in as … on a shared tablet". Sign out → back to the shared screen with a device `/api/me`. A Brewery person on the Taproom tablet also works. Owner revoke → the tablet shows "unpaired". Persona tablets (breweryDevice and taproomDevice): Sign in as me → sign out → the device token is still 200, the **person's token is 401 after sign-out**, and the shared screen survives a reload. |
| R5 | **Pass** (gaps 3, 4) | The UI dialog has no password field and sends `{email,name,memberships}`. The response's `temp_password` is shown once in the dialog and is gone after Done. API with `password:"typed-secret-123"` (also nested `user.password`, `password_confirmation`, `temp_password`, `must_reset_password:false`, form-encoded): `temp_password` ≠ typed, typed sign-in → 401, temp → 200, `must_reset_password` stays true. barMgr: Brewery membership → 403 "Cannot assign roles in department: brewery". `is_owner:true` is ignored. |
| R6 | **Fail** (gaps 1, 2; minors 5, 7, 9) | **API:** 1,242 create and update cases over all 10 entities and 38 fields. Every bound passed: boundaries saved exactly, values just outside, −1, 1000, 12.5 gravity, a 40-digit number, `1e308`, `"1e308"`, `100.0000001` and `1.2000000001` were all refused with the right range message. Empty/null were allowed, except on fields the server marks required. Refused updates left values unchanged. No 5xx. Flat, nested `{brand:{…}}` (ignored) and form-encoded bodies were all safe. **UI:** all 10 dialogs, plus edit dialogs for Brand, Batch, Recipe and Water. Out-of-range values are stopped by the browser (an `invalid` event, no request), recipe batch size/amount `0` and Water reach the server and get the range message in an alert, valid values save and persist after reload. Gaps 1 and 2 break the "main path / saved wrong" rules. |
| R7 | dropped | — |
| R8 | **Pass** | All of these load with no errors: Scheduler (barMgr, breweryMgr, owner, dualMgr), View Schedule (barMgr, brewer1, bartender1), Time off (barMgr, brewer1, bartender1), Tasks boards (bar and brewery, several personas), Buy-a-Beer Board (barMgr, bartender1), Production Gantt (breweryMgr, brewer1, owner), Availability, User change log. Writes that persisted after reload: a brewery task, a Buy-a-Beer entry, and a time-off request (Dec 14 all day, correct MST offset). All three were then removed. |

## Data made and cleaned

- **People (16 `[TEST-TEMP] D51p2 …`, ids 2901–2916):** all **disabled**, verified by sign-in → 401. The UI has no user delete, so earlier QA rounds' `[TEST-TEMP]` users also remain disabled.
- **Tablet** `[TEST-TEMP] D51p2 tablet mvszhx17` (Taproom tablets): **revoked**. The row stays listed as "Revoked".
- **Brewing (deleted, 204):** brand 1234, recipe 3, batch 2379, brew turn 1, log entry 13, ingredient 53, lot 2, mash step 1, process step 1, water profile 1, recipe ingredients 1–6. Also ~600 rows created and deleted by the API matrix, plus UI-run rows (brands 1250–1253, batches 2405–2407, lot 38). A final sweep found no `[TEST-TEMP]` brewing rows left.
- **R8:** task 49639 deleted, beer-board entry 2640 deleted, time off 328 **cancelled** (no delete exists; it stays as "cancelled" under the disabled test person).
- No messages posted. No `[SEED]` data changed: brand 1234/batch 2379 were mine, and the water profile, log entry 13 and recipe ingredient 1 were restored to their valid values before being deleted.

## Tester process notes (credential handling)

- Twice I printed a **`[TEST-TEMP]` person's password** to my own console output. (1) The first created user's dialog text: the user (2901) was disabled immediately and never used. (2) A logged `/api/session` request body with the new password of `[TEST-TEMP] D51p2 R4 brewery` (2904), now disabled. No persona token or persona password was exposed. The scratch secrets file (mode 0600) was shredded at the end, and the post-create screenshots (which showed temp passwords) were deleted right after they were taken.

## Not tested

- Firefox and Safari/WebKit, and real iPad tablets: gap 2 may behave differently there.
- Real "old" (pre-Oct-5) tokens: the stale tokens tried were realistic-looking strings, not forged real ones.
- A tablet's own SIGN OUT (unpair) on persona tablets (not allowed); it was exercised only by revoking the `[TEST-TEMP]` tablet.
- The production-schedule process editors (separate model, not in the D51p2 field list). Their set-temp inputs have `min=28 max=80`.
- Alpha acid and attenuation in the UI (those inputs don't appear for Grains lots); they were covered via the API.
