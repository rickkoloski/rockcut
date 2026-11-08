# D55 independent QA: tablets and tidy-up (DEV)

- **Build:** `1a409337bfd00cc095719e1794a5c59007a90e0f` (`GET /api/health` → `env: dev`, ribbon `DEV · 1a40933`)
- **Date:** 2026-11-08 (America/Denver), about 13:40–15:05
- **Where:** https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev only. Prod was never touched.
- **Personas used (stored sessions only, no password sign-ins):** owner, barMgr, breweryMgr, brewer1, brewer2, bartender1, bartender2, floater, splitRole, dualMgr, office1, sales1, noDept, taproomDevice. breweryDevice was used only until the incident below.
- **Method:** Playwright scripts in `scripts/`. API calls were made from inside the page with the session it already held; the token was never returned or printed. Every 401 or `/api/me` failure was forced with `page.route` in a throwaway context, and all writes were blocked in those contexts.
- **Verdict:** **fail.** 2 must-fix, 4 should-fix, 7 minor.

## ⚠ Incident caused by me: a seeded tablet token was revoked

In Q3 my "Revoke" locator on Admin → Shared devices matched a container that held **both** device cards. The click revoked token **1165 "[SEED] Playwright tablet"** on **Brewhouse tablet**, which is the session in `auth/breweryDevice.json`. It now answers 401 (still 401 at the end of the pass). This was my error, not an app bug, and it broke the brief's "never revoke a seeded tablet" rule. I can't undo a revoke.

- **Action needed (Matt):** re-pair the Brewhouse tablet and regenerate `auth/breweryDevice.json` before the next run.
- **What I did after:** I revoked only my own tokens, by exact row or id, after checking that the row and the confirm dialog named `[TEST-TEMP]`. For the brewery-tablet checks I paired a `[TEST-TEMP]` Brewery-home device (since deleted).
- **Also:** while debugging the pairing flow, one pairing code for my own `[TEST-TEMP]` device printed to my terminal once. It was never used and expired at 14:34. Nothing like it reached `results/`.

## Summary

| # | Severity | Scenario | Gap |
|---|---|---|---|
| 8 | **must-fix** | Q7 | Creating an ingredient category with Sort Order empty (the UI default) → **500**. Updating a category with `sort_order: null` → 500. |
| 11 | **must-fix** | Q8 | **500** on `POST /api/shifts` when `position_id` has the wrong type, and on `POST /api/time_off` and `/api/availability` when `user_id` has the wrong type. |
| 2 | should-fix | Q2 | Mid-session, when `/api/me` is 5xx or offline: no "Can't reach the server, retrying…", no re-check, and the failed view never recovers on its own. |
| 6 | should-fix | Q6 | `memberships` naming one department twice → 200/201, and only the first entry is kept, silently. |
| 10 | should-fix | Q7 | Brand, recipe or ingredient URL that names nothing → spinner forever (API correctly says 404). |
| 12 | should-fix | Q8 | A shift can be assigned to a **deactivated** person, or to someone outside the shift's department (201). |
| 1 | minor | Q1 | Manifest `short_name` and `apple-mobile-web-app-title` are "Rock Cut", not "Rock Cut Brewing". |
| 3 | minor | Q2 | `/api/me` hangs at start-up → blank page for about 15 s before the retry banner. |
| 4 | minor | Q4 | Tablet, unknown channel URL → "Not available on a shared device" instead of "Page not found". |
| 5 | minor | Q4 | Card URL naming no card → the board is shown, with no "not found". |
| 7 | minor | Q6 | `memberships: null` → 201 on create but 422 on update; an out-of-range `department_id` inside memberships reports the error on `department_id`, not `memberships`. |
| 9 | minor | Q7 | API `sort_order: ""` → saved as 0 (top), not the end (grain bill, category field, category). The UI sends `null`, so this only shows through the API. |
| 13 | minor | Q8 | Shift `position_id` that names nothing → 403, not 422 "does not exist". `POST /api/notifications/<missing>/read` → 200 `{"ok":true}`, not 404. |

## Gaps

### Gap 8: must-fix: empty Sort Order on an ingredient category gives a 500
- **Path:** owner → Ingredient Library → Ingredient categories → Add Category → Name only, Sort Order left empty (its default) → Save.
- **Expected:** saved at the end of the list (item 5's rule), or at least a readable 422.
- **Observed:** the UI sends `POST /api/ingredient_categories {"name":…,"sort_order":null}` and gets **500**. The dialog says "Something went wrong on the server. Please try again." (`results/q7_category_500.png`). Nothing is saved.
- **More detail:**
  - `sort_order` left out, or `""` → 201, but saved at **0** (top) rather than the end.
  - `PUT` or `PATCH /api/ingredient_categories/:id {"sort_order":null}` → **500**.
  - So clearing Sort Order on an existing category in the UI likely 500s as well. I didn't check this through the UI.
- **Repro:** `POST /api/ingredient_categories {"name":"x","sort_order":null}` as owner.

### Gap 11: must-fix: 500 on bad-typed parent ids in scheduling bodies
- **Path:** as barMgr:
  - `POST /api/shifts {"position_id":"abc"|1.5|true|[]|{}, "starts_at":…, "ends_at":…}`
  - `POST /api/time_off {"type":"pto","all_day":true,"starts_at":…,"ends_at":…,"user_id":1.5|true|[]|{}}`
  - `POST /api/availability {"weekday":1,"kind":"unavailable","all_day":true,"user_id":1.5|true|[]|{}}`
- **Expected:** 422 on that field. The same shapes on `assignee_id`, and on every other body I tried, give 422 "is invalid".
- **Observed:** **500** `{"errors":{"detail":"Internal Server Error"}}`, 13 cases. Re-checked after the sweep; still 500. Nothing was saved.
- **Also:** `user_id: "abc"` on time off and availability → 201, created for the caller. The field looks ignored when it is a string.
- **Repro:** `results/q8_sweep.txt` (lines marked `!!` with 500), and `scripts/q8b.mjs`.

### Gap 2: should-fix: `/api/me` unreachable mid-session gives no banner and no retry
- **Path:** taproomDevice (also checked as bartender1) on Buy-a-Beer. `/api/beer_board` answers 401 while `/api/me` answers 503 or is offline. Then both come back.
- **Expected (Q2):** stays paired, shows "Can't reach the server, retrying…", recovers.
- **Observed:**
  - Stays paired. ✔
  - The page shows "Couldn't load the board." with no retry banner.
  - `/api/me` is not called again (two calls, both within 2 s, then none in the next 45 s).
  - After the server is back, the board stays on "Couldn't load the board." until the user navigates.
  - The **start-up** path works: banner shows, `/api/me` retries every 10 s, and the page recovers after the outage.
- **Repro:** `scripts/q2d.mjs taproomDevice 5xx|offline /taproom/beer-board /api/beer_board`. Screenshots: `results/q2_mid_*.png`.

### Gap 6: should-fix: a duplicate department in memberships is silently collapsed
- **Path:** `PUT /api/users/:id/memberships {"memberships":[{"department":"bar","role":"manager"},{"department":"bar","role":"employee"}]}`, or the same in `POST /api/users`. Seen as owner and as barMgr.
- **Expected:** 422 on `memberships` (malformed: contradictory roles).
- **Observed:** 200/201, and only the first entry is stored. Swapping the order changes the stored role (manager vs employee). The caller isn't told one role was dropped.
- **Repro:** `scripts/q6d.mjs` (on a `[TEST-TEMP]` user).

### Gap 10: should-fix: missing brand, recipe or ingredient spins forever
- **Path:** brewer1 or owner opens `/brands/99999`, `/brands/2827/recipes/99999`, `/ingredients/99999`, or `/brands/99999999999999999999`. A real case is a bookmark to something deleted.
- **Expected:** a "not found" page with a way back, like the new "Category not found".
- **Observed:** the spinner is still there after 20 s (`results/q7_missing__brands_99999.png`). The API correctly answers 404.
- **Note:** a permanent spinner fits the brief's "hang" wording for must-fix. I rated it should-fix because the rest of the app still works and it only shows on a bad link.

### Gap 12: should-fix: a shift can be given to a deactivated or out-of-department person
- **Path:** barMgr `POST /api/shifts {"position_id":5,"assignee_id":3562,…}`. 3562 is a deactivated `[TEST-TEMP]` person. Also `assignee_id: 2790` (Jake Brewer, Brewery only) on a Taproom position.
- **Expected:** 422 on `assignee_id`.
- **Observed:** 201 in both cases. The shifts were deleted afterwards.

### Gap 1: minor: app name
- `manifest.webmanifest`: `name` is "Rock Cut Brewing" ✔, `short_name` is **"Rock Cut"**. `apple-mobile-web-app-title` is **"Rock Cut"**. The tab title is "Rock Cut Brewing" ✔.
- This may be intentional for home-screen length, but item 7 lists short name and Apple title as "Rock Cut Brewing".

### Gap 3: minor: slow `/api/me` at start-up gives a blank page
- **Path:** `/api/me` held for 40 s at start-up.
- **Observed:** only the DEV ribbon shows, with no spinner, for about 10–20 s. Then "Can't reach the server, retrying…" appears and the page recovers. The session is kept.

### Gap 4: minor: tablet unknown channel
- **Path:** taproomDevice `/messages/nope`.
- **Expected:** "Page not found".
- **Observed:** "Not available on a shared device … needs your own account". A person sees "Channel not found". `/messages/dept:brewery` on the Taproom tablet also says "Not available", which is fine.

### Gap 5: minor: unknown card URL
- **Path:** `/boards/bar/cards/99999999` or `/boards/bar/cards/abc`, as a tablet or a person.
- **Observed:** the board renders with no card and no message. On the Brewery tablet the URL is rewritten to `/boards/brewery`.

### Gap 7: minor: memberships edge cases
- `POST /api/users … "memberships": null` → 201 with no roles. `PUT …/memberships {"memberships":null}` → 422 "must be a list". The two are inconsistent.
- `[{"department_id":"99999999999999999999",…}]` → 422 `{"department_id":["is out of range"]}`, not under `memberships`.

### Gap 9: minor: `""` Sort Order through the API
- `POST /api/recipe_ingredients`, `PUT /api/recipe_ingredients/:id`, `POST /api/category_field_definitions` and `PUT /api/category_field_definitions/:id` with `"sort_order": ""` → saved as **0**. `null` → end ✔. Left out → unchanged ✔.

### Gap 13: minor: wrong status codes
- `POST /api/shifts {"position_id":12345678,…}` → 403 Forbidden. Item 9 expects 422 "does not exist". The huge value gives 422 "is out of range" ✔.
- `POST /api/notifications/12345678/read`, `/2147483648/read` and `/9223372036854775807/read` → 200 `{"ok":true}`. The 20-digit id gives 404.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | PASS (gap 1) | Health sha and ribbon match. Tab title "Rock Cut Brewing". Manifest `name` correct. |
| Q2 | PARTIAL (gaps 2, 3) | Tablet and bartender1. A one-off 401 on shifts, roster, tasks, boards, beer board, time off or availability → one `/api/me`, stays in, the request retries once and the page loads. A burst of 4–6 concurrent 401s → **one** `/api/me` per burst. A persistent 401 → one check per retry wave, no loop. `/api/me` 401 → "This tablet was unpaired." / "Sign in to continue" (writes blocked, so no real session was touched). `/api/me` answering 200 HTML, 404, 403, 502 or `{}` → kept. 401 with an HTML body → unpaired, which is correct. |
| Q3 | PASS | `[TEST-TEMP]` tablet revoked → next in-app request shows "This tablet was unpaired" and clears the token. Start-up with the revoked token on `/`, `/schedule` and `/boards` → unpaired. Deactivating the whole device → paired tablet unpaired. `[TEST-TEMP]` person deactivated via owner API → `active:false` and gone from the roster. |
| Q4 | PASS (gaps 4, 5) | 48 URLs × Taproom tablet, a `[TEST-TEMP]` Brewery tablet and bartender1: deep paths, `%E2%9C%93`, `<script>`, `..%2F`, `//double//slash`, query and fragment, trailing slashes, `/NOPE`. Unknown → "Page not found" + Go to Home (lands on the tablet home). Profile, Production, brands, ingredients, users, devices, scheduler, time off, availability, settings → "Not available on a shared device". Boards and card URLs open view-only. A person's unknown URL → Home. |
| Q5 | PASS | Malformed, trailing-garbage, BOM, truncated-array → 400 `{"errors":{"detail":"Bad Request"}}`. Oversize (8 MB and up, Fly path) → 413 `{"errors":{"detail":"Request Entity Too Large"}}`. CORS `access-control-allow-origin` only for `https://rockcut-ui-dev.fly.dev`; none for a foreign origin, the prod UI origin or `null`. 10 authenticated routes in-page plus 7 from Node. A 9 MB brand description through the Add Brand form → the dialog shows "Request Entity Too Large", not "Failed to fetch", and nothing is saved. The 400 text is generic but readable. |
| Q6 | PARTIAL (gaps 6, 7) | 41 shapes × create (`POST /api/users`) and update (`PUT /api/users/:id/memberships`) as owner and as barMgr → 422 on `memberships`, stored memberships unchanged. barMgr granting Brewery → 403. Note: `PATCH /api/users/:id` ignores `memberships` and answers 200; the UI uses the PUT route. |
| Q7 | PARTIAL (gaps 8, 9, 10) | Through the UI: category fields with Sort Order empty → end (0 on an empty list, then 6, 7), 5 kept, cleared on edit → end (8), renamed only → kept. Grain bill: empty → 0/6/7, 5 kept, cleared → end, amount-only edit → kept. All survive reload. `/ingredients/categories/99999`, huge, `abc`, `0`, `-1` → "Category not found" + "Back to Ingredient categories" (owner and brewer1). Add Ingredient: `getByLabel` finds Category, Ingredient and Lot as comboboxes. Field Type is labelled in the aria snapshot. Note: Lot is required and the seed has **no lots**, so nobody can add to a grain bill on a fresh seed without first creating a lot. Probably by design, but worth knowing. |
| Q8 | FAIL (gaps 11, 12, 13) | 2032 requests (`results/q8_sweep.txt`), across owner, barMgr and taproomDevice. **URL:** 12 bad ids × GET/PATCH/PUT/DELETE/action routes over brands, recipes, ingredients, categories, fields, lots, recipe ingredients, users, devices, device tokens, positions, shift templates, schedule templates, batches, tanks, beer board, time off, availability, notifications, shifts, events, tasks, daily items, cards, lists, channels → 404/403/401, **no 500**. **Query:** History `task_id`/`card_id` = `abc`, `-1`, `0`, `1e20`, huge, `1.5`, space, `[]` → 422. Empty or absent → full History. Huge `page` → `[]`. Unknown `before_id` → rows. Tablets get 403 on History. **Body:** 11 bad values × 29 parent fields → 422 except gaps 11–13. Many 201s turned out to be **ignored** fields, not stored bad parents: shift `department_id` comes from the position, shifts use `assignee_id` not `user_id`, batch `recipe_id`, user `home_department_id` on PATCH, list `position`. All of those rows were deleted. **Stale parent in the UI** (deleted via API while the form is open): grain-bill lot, recipe's brand, category field's category → 422 "… does not exist" shown in the dialog. |
| Q9 | PASS | Pairing view correct. On the Taproom tablet: Buy-a-Beer redeem with a wrong staff code → "That staff code isn't right", nothing changed; with a `[TEST-TEMP]` person's code → beers 2 → 1. Task "Mark completed" → staff-code dialog → done. Boards: no add or menu controls, a locked card says "Only a manager can change it". `/login` → "Personal logins not accepted". 13 people × 15 pages: no sign-outs, no JS errors, no 401/5xx, role-gated pages redirect Home. |

## Data made and cleaned

| Kind | Made | Cleanup |
|---|---|---|
| Shared devices | 3561 "[TEST-TEMP] D55 QA tablet" (tokens 1178, 1179), 3563 "[TEST-TEMP] D55 QA brewery tablet" (token 1180) | tokens revoked, both devices deleted |
| People | 3562, 3564–3578 (Q6 shapes), 3579–3586 (Q8). 3567 got a staff code for Q9. | all deactivated (people can't be deleted) |
| Brands, recipes | brands 2827, 2828; recipe 13 with recipe ingredients 12–16; batches 4724–4731 (from the sweep) | deleted |
| Ingredients | ingredient 55; lots 40, 41 | deleted |
| Categories | 48, 49, 50, 51, 52 (+ fields 16–20) | deleted |
| Shifts | 4228–4245 (sweep, drafts, Dec 1–2) | deleted |
| Time off / availability | time off 380 and availability 247, created on **barMgr** (note "[TEST-TEMP] q8") | availability deleted; time off 380 **cancelled** (no delete route), still listed as cancelled |
| Boards | idea lists 215–225, tasks 108082, 108083 | archived + deleted / deleted |
| Buy-a-Beer | 3417 "[TEST-TEMP] D55 drinker" | deleted |

`scripts/verify.mjs` at the end shows no leftovers apart from inactive people and the cancelled time off. Local files that held my `[TEST-TEMP]` tablet sessions and the staff code were deleted. No seed data was changed, except the revoked token above. The id-1 seeds (2-Row, Grains, Brewer, FV1, …) were checked after the sweep and are unchanged.

## What I couldn't test

- **breweryDevice persona** after the incident. I used a `[TEST-TEMP]` Brewery tablet instead.
- **A deactivated person's own session:** no password sign-ins allowed, so this was checked through the owner API only.
- **A real deploy mid-session, and real network flakiness:** simulated with `page.route` (503 / HTML 502 / 404 / offline / 40 s hang on `/api/me`).
- **Installed-PWA update path:** Matt's manual check, skipped as the brief says.
- **Clearing Sort Order on an existing category through the UI:** API-only (500, gap 8).
- **Message posting with bad parents:** "don't post messages". Only GET by channel or id was swept.
- **Item 11, removed database columns:** not observable from outside the API.
