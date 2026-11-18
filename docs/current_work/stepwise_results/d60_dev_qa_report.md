# D60 DEV QA: Ingredient Library (grains + inventory)

**Build tested:** `7fb208aa1aee11e7d517b871f46fa6ef86e2d5a7` (`/api/health` env=dev; ribbon `DEV · 7fb208a` on every load)
**Date:** 2026-11-18, America/Denver · **Tester:** independent QA (scripts in `scripts/`, screenshots in `results/shots/`)

## Verdict: **pass with gaps**

All seven scenarios (D1–D7) passed on the real release build. I found no 500s, crashes, hangs, wrong inventory, lost data or permission holes. The open hunt (D8) found **two should-fix gaps and one minor gap**. Two of them come close to must-fix categories in the brief's rubric, so Matt should decide on those (see the notes on gaps 1 and 3).

| # | Scenario | Result |
|---|---|---|
| D1 | Smoke on release build (brewer1) | **PASS** |
| D2 | DEV reference seed (owner) | **PASS** (data notes for Matt below) |
| D3 | Real latency, double-click / double-tap Save (brewer2) | **PASS** |
| D4 | Phone 360 px touch (brewer1) | **PASS** |
| D5 | Service worker (owner, brewer1) | **PASS** |
| D6 | Who on DEV data (7 personas) | **PASS** |
| D7 | Recipes, Est. OG (brewer1) | **PASS** |
| D8 | Open hunt (phone + desktop) | **FAIL**: gaps 1–3 |

## Gaps

### Gap 1: should-fix: Delete is offered for an in-use company, then refused
- **Path:** Ingredient Library → Companies → click a company in use (I used my `[TEST-TEMP] D8 partner`, after a Traded out movement) → Delete → Delete.
- **Expected:** "In-use companies can only be deactivated." Lot delete handles this case well: the button is disabled and the reason is shown.
- **Observed:** Delete is enabled. The confirm says generically "A company in use can't be deleted; make it inactive instead". After confirming, `DELETE /api/parties/11` → **422** "This company is in use; deactivate it instead", shown in the dialog. Nothing is lost.
- **Repro:** desktop 1366×768, brewer1. Create a partner brewery, record a Traded out with it, then Delete it from Companies.
- **Severity note:** the brief lists "an action the UI offers but the API refuses" as must-fix. I graded it should-fix because the refusal is clean and explained, and the confirm text warns ahead of time. Category delete behaves the same way: Delete is enabled on a category that holds grains, and confirming gives a 422 "This category has grains; move them first". That matches the brief ("a message says why"), but it's the same offer-then-refuse pattern.

### Gap 2: minor: "On hand … · X expired" means different things in different places
- **Path:** product page with one expired lot (my D1-B 43 lb expired, D1-A 655 lb available).
- **Expected:** the same wording means the same number everywhere.
- **Observed:** the header, list row and **Count** dialog say "12 sacks 38 lb · 43 lb expired", a total that *includes* the expired 43 lb. **Record movement** says "11 sacks 50 lb · 43 lb expired (pick that lot to use it)", which is *usable only*. The numbers are each internally correct: a total count of the shown 12 sacks 18 lb recorded "Counted, no change" against the non-expired lot, and Oldest first skipped the expired lot. Only the wording is ambiguous.
- **Repro:** desktop. Mark a lot Expired, then compare the header, Record movement and Count dialogs.

### Gap 3: should-fix: extra decimals are rounded silently on save
- **Path:** Record movement / Edit standard specs.
- **Expected:** a stored value equals what was entered, or the box refuses or rounds it visibly (the boxes already show messages for `5,2`, `-1` and out-of-range values).
- **Observed (no message, Save enabled):**
  - Used in brewing `1.555` lb → request and stored `1.56` lb (movement 62).
  - Extract `80.15` → stored `80.2`; Color `2.785` → `2.79`; DP `123.45` → `123.5` (product 63).
  - Price `42.555` and `1,234.5` are also accepted with no message (I didn't save those).
- **Repro:** desktop. On your own product: Record movement → lb `1.555` → Save, then read `/api/inventory_movements?product_id=…`.
- **Severity note:** the rubric lists "a stored value differing from what was entered" as must-fix. The brief does define the precisions (Extract 1 dp, Color 2 dp, lb 0.01), so the rounding is probably intended, and the inventory effect is under 0.01 lb. I graded it should-fix for the missing notice. **Matt to confirm it's intended.**

## Scenario detail

### D1: Smoke (brewer1, desktop): PASS
- Grains list: five groups Base (22 reference + leftovers, see notes) / Crystal/Caramel 10 / Kilned 3 / Specialty 4 / Roasted 5 = 44 reference products. Rahr 2-Row page shows specs, the BSG offer and two `[SEED]` lots.
- Created product **63** `[TEST-TEMP] D1 smoke mwmijps9` (2-Row, Rahr): Convert Color 3.0 SRM → popup "Stored as: 2.78 °L" → field 2.78, stored `2.78` with `entered 3 srm`. Extract 80.1.
- Offer 63 (BSG 55 lb). Prices 40.00 @ 11-01, 45.00 @ **11-19 (tomorrow)**, 42.50 @ 11-18. Current price = **$42.50**, $0.7727/lb ✔.
- Add lot D1-A, Received, **12 sacks** → 660 lb. Added an older lot D1-B (3 sacks, 11-10) so Oldest first had a choice.
- Used in brewing **2 sacks 10 lb**, Oldest first → 120 lb taken from D1-B (the oldest) ✔.
- Count 12 sacks 45 lb (= on hand 705) → **"Counted, no change"** (movement qty 0) ✔.
- History rows (4) and on-hand 705 lb match `/api/ingredient_lots` and `/api/inventory_movements` exactly. No console errors, no 5xx.

### D2: Reference seed (owner): PASS
- 38 grains, **all** under the five sub-categories (Base 16, Crystal/Caramel 10, Kilned 3, Specialty 4, Roasted 5). None sit directly under Grains ✔.
- 44 active reference products from 7 maltsters (Rahr 4, Root Shoot 12, Weyermann 15, Simpsons 7, Dingemans 2, Crisp 3, Grain Millers 1) plus supplier BSG = **8 companies** ✔ (plus `[SEED] Mountain Brewing` partner).
- "Dingemans" spelled correctly ✔. Brown Malt is Crisp (Roasted) ✔. Grains and all five sub-categories have `field_definitions: null` (no Origin/Maltster fields) ✔.
- **For Matt to check (reference data, not app bugs):**
  1. Identical spec sets on different products, possibly copy-paste: **Rahr 2-Row = Rahr Pilsner** (2.00/81.5/154/11.0/4.7). **Rahr Wheat, Extra Pale = Rahr Wheat, White** (3.25/85.0/190/12.0/4.5). **Weyermann Pilsner = Weyermann Pilsner-Barke** (1.75/80.5/110/10.75/3.9).
  2. Root Shoot **Rye Malt extract 89.1 % FGDB** is high for rye. Root Shoot **Oats, Malted 62.6 %** and Simpsons **Roasted Barley 62.0 %** are low (plausible, worth a look).
  3. DP > 0 on crystal malts: **Root Shoot CaraRuby 70** and **Crisp Dextrin 95** (other crystals are 0).
  4. Weyermann Acidulated and Grain Millers Oats, Flaked have no extract.
  5. All 12 Root Shoot offers have **no order name**. No offer has a price yet.
  6. Offer order name **"Rahr to Thee - Pilsner (milled)"**: check the wording.
  7. Oats, Malted is filed under **Base**.

### D3: Real latency (brewer2): PASS
On my product **64**, each Save was double-clicked (desktop) or double-tapped (phone, touch):

| Run | Add lot | Record movement | Count | Save → dialog closed |
|---|---|---|---|---|
| Slow-4G (`slow()`), desktop dblclick | 1 POST 201 | 1 POST 201 | 1 POST 201 | ~0.81–0.83 s |
| Real network, desktop dblclick | 1 POST 201 | 1 POST 201 | 1 POST 201 | ~0.21 s |
| Slow-4G, phone 360 double-tap | 1 POST 201 | 1 POST 201 | 1 POST 201 | ~0.84–0.88 s |

Final stock 642 lb = 3 × 220 − 3 × 5 − 3 × 1, exactly one write each ✔.

### D4: Phone 360×780 touch (brewer1): PASS
- No sideways page scroll (scrollWidth = 360) on the Grains list, the product page, Companies and Categories. Wide tables scroll inside their own cards.
- Product page heading shows the full name "Rahr [TEST-TEMP] D1 smoke mwmijps9 (2-Row)", wrapped. The app-bar title is ellipsized, which is fine.
- Add lot, Record movement, Count and the lot dialog are full screen (360×780), with Save visible and tappable.
- Lot dialog for D1-A: **Delete disabled**, reason "This lot has movements after its first; correct it with a movement or a count" ✔.
- Quantity `0.001` / `0.004` → **"Enter at least 0.01 lb"**, Save disabled ✔. `0.01` OK. `5,2` → "Use . for the decimal point" ✔. `1,234` accepted as 1234 ✔.

### D5: Service worker (owner, brewer1): PASS
- `sw.js` registered and controlling. Load 0, reload 1 and reload 2: ribbon **`DEV · 7fb208a`** every time. On reloads 1 and 2, every UI asset came from the service worker (5/5, 6/6).
- After the reloads the list shows fresh data (my new products present, 61 rows). The product page opens, and Add lot, Record movement, Count, Add offer, Edit and Convert Extract (% as-is) all open and work. No stale screen.

### D6: Who (DEV data): PASS
| Persona | Nav link | `/ingredients` | 7 ingredient GETs | POST movement |
|---|---|---|---|---|
| bartender1, office1, barMgr | none | → Home | all 403 | 403 |
| breweryDevice, taproomDevice | none | "Not available on a shared device … Go to Home" | all 403 | 403 |
| floater, splitRole | yes (under Brewery) | opens | all 200 | 201 (1 lb on my product) |

### D7: Recipes (brewer1): PASS
- Brand **5573** `[TEST-TEMP] D7 brand`, recipe **38** (10 bbl, 75 %, notes `[TEST-TEMP]`). Grain Bill → 2-Row → lot picker shows "Rahr · [TEST-TEMP] D1-A · 12 sacks · Available" ✔ → 500 lb.
- **Est. OG 1.045** in the recipe header and on the brand's recipe list. API `est_og` = 1.0448 ✔.
- Extra check: a fresh lot (94) used by the recipe → lot Delete disabled, "A recipe uses this lot, so it can't be deleted". The API also refuses (422) ✔.
- Recipe and brand deleted through the UI (confirm dialogs name them). Both GETs → 404 ✔.

### D8: Open hunt: gaps 1–3 above; also checked OK
- Over-use (1,234 lb vs 705) → 422 "That's more than the 14 sacks 43 lb on hand", shown in the dialog. There's no inline warning before Save, but it is refused cleanly.
- A future date is blocked by the date input's `max` (today). The API also refuses: "The date can't be in the future" ✔. The API refuses 0.004 lb ✔.
- Lot delete (lot 94, only its first movement, recipe removed): the confirm names the stock, "Its Opening amount 2 sacks (110 lb) goes too", and deleting works ✔.
- Traded out (specific lot) and Loaned in with a `[TEST-TEMP]` partner work. An unused company deletes after confirming ✔.
- Expired: Oldest first skipped the expired lot (20 lb taken from D1-A) ✔. The total count recorded no change ✔.
- Count by lot (brewer2, product 64): only the counted lot changed (−20 lb) ✔.
- Sacks/lb toggle saves per person (`PUT /api/me/board_settings/ingredients`). Product page and list show "678 lb · 43 lb expired" in lb mode ✔.
- Spec boxes: `5,2` and `1,2345` refused with "Use . for the decimal point". `-1` → "Enter 0 or more". `120` → "between 0 and 100" ✔. Convert popups refuse out-of-range results: 99999 EBC → "37473.55 °L is out of range", 60 PPG → "129.8 % FGDB is out of range" ✔.
- Lot spec difference is marked: moisture 5.0 vs standard 4.20 → "Specs changed from standard: Moisture 5.00" ✔.

## Other observations (not graded as gaps)
- **Leftover test data on DEV despite "reseeded today":** 10 inactive `[TEST-TEMP]` products ("B3 toggle" … "S2 slow use", ids 47–62) created 18:38–19:2x UTC, after the 18:32 reseed. They're on 2-Row/Rahr with stock, appear in the Grains list (Base shows 32), and their lots appear in the recipe lot picker for 2-Row. They aren't mine and I didn't touch them.
- The app allows a duplicate lot # within a product. My D3 run made two "[TEST-TEMP] D3 slow …" lots, and the old data has two "B8 delete". In the recipe picker and Count by lot they can only be told apart by on-hand.
- The recipe lot picker lists **expired** lots, labelled "Expired", and they're selectable.
- A grain sub-category's detail page still offers **Add field** (custom fields). Nothing stops someone adding fields back to Grains categories.
- One `page.goto(/brands/5573)` hit the 60 s networkidle timeout once. The retry was immediate and fine, and the API health check took 80 ms. Treat it as a transient.

## Ids I made, and cleanup
| Kind | Id(s) | End state |
|---|---|---|
| Maltster product | **63** `[TEST-TEMP] D1 smoke mwmijps9` (brewer1) | **deactivated** (stock remains: lot 89 633.44 lb, lot 90 43 lb expired) |
| Maltster product | **64** `[TEST-TEMP] D3 dbl mwmiokqs` (brewer2) | **deactivated** (lots 91/92/93 = 202/200/220 lb) |
| Supplier offers | 63, 64 | left on the deactivated products |
| Prices | 3, 4, 5 (offer 63) | left (history) |
| Lots | 89, 90, 91, 92, 93 | left on the deactivated products. **94 deleted** (UI) |
| Movements | 42–63 (mine: 42–54, 55 floater, 56 splitRole, 58–63) | left (history) |
| Brand / recipe | brand **5573**, recipe **38**, recipe ingredients 65, 66 | **deleted** (UI) |
| Companies | **11** `[TEST-TEMP] D8 partner mwmj1chh` | **deactivated** (in use) |
| | **12** `[TEST-TEMP] D8 unused mwmj1chh` | **deleted** (UI) |
| Category / grain | category **162**, grain **92** `[TEST-TEMP] D8 …` | **deleted** (by exact id after read-back) |

I didn't touch any `[SEED]` row, reference product or reference company, or any stock on them. Every delete, deactivate, expire or count was done by exact id after reading the name back.

## Settings changed and restored
- brewer1 Sacks/lb: read `sacks` → set `lb` (D8) → **restored `sacks`** (verified via `/api/me`).
- brewer2 `sacks`, owner/floater/splitRole unset at start → unchanged at end (verified).
- I made no persona or device changes and didn't sign out or sign in with a password.

## Not tested
- Real phones/tablets and iOS Safari (Chromium emulation only). Network conditions beyond the `slow()` profile.
- Prices becoming current at midnight (only "tomorrow isn't current yet" was checked). Dates around midnight Denver.
- owner2 and breweryMgr weren't exercised (owner and the brewers were).
- The "Received" movement kind on an existing lot, the Loaned out / Traded in kinds, and the price-history UI beyond the current-price display.
- Hops/yeast/other categories ("look as before"), beyond seeing they're listed.
