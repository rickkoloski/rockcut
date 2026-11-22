# D65 DEV QA report (independent pass)

- **Build tested:** `DEV · 15e9c12` (ribbon checked on every page in D1, D6). UI https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev.
- **Date:** 2026-11-21 (America/Denver), about 10:25–11:20 local.
- **Personas used:** owner, owner2, breweryMgr, brewer1, brewer2, floater, splitRole, barMgr, bartender1, office1, taproomDevice, breweryDevice. All signed in from `auth/*.json`. No passwords, no sign-outs, no persona or device changes.
- **Sizes:** desktop 1366×768; phone 360×780 with touch (D5).
- **Throttling:** `slow(page)` (560 ms latency, 400 kbps) in D4 and D9.

## Verdict: **fail**: 1 must-fix, 1 should-fix, 4 minor

The D65 release behaves correctly on DEV. The seeded reference data is complete and unchanged. Inventory and money add up. `each` is whole everywhere, in the UI and the API. Access control is right for all 12 personas. Double-submits write once, and the 409 conflict check works.

The verdict is **fail** only because of gap 2, a dialog bug in the product form: picking "Other manufacturer…" or "Other maltster…" closes the form. If the team rates it should-fix, the verdict becomes **pass with gaps**. It isn't D65-only: it also blocks grain and hop products from a new maltster. I couldn't compare with prod (off-limits), so I don't know whether it is new in this build.

| # | Scenario | Result | Notes |
|---|---|---|---|
| D1 | Smoke on release build | **PASS** | 14 URLs × (direct + reload) = 28 checks. Ribbon `DEV · 15e9c12`, no console errors, no 4xx/5xx. |
| D2 | Reference seed, read only | **PASS** | 29 D65 reference products, 30 offers (26 priced), hops 28 lots / 409.6 lb. The start→end diff is **empty**. |
| D3 | End to end mixed order | **PARTIAL** | Order, receipt, To order, Totals and API all agree. Copy has gaps 3 and 4. |
| D4 | Real latency, double-submit, 409 | **PASS** | 5 actions × (fast + slow), exactly 1 write each. The 409 is shown and nothing is lost. |
| D5 | Phone 360 px | **PARTIAL** | All D65 lists, pages and dialogs fit. Back closes dialogs. Gap 5: the "All Categories" list is too wide. |
| D6 | Service worker | **PASS** | Controlled by `/sw.js` from the first load. 42 checks across reload, away-and-back and in-app navigation. |
| D7 | Who on DEV | **PASS** | 7 allowed personas get 200. barMgr, bartender1 and office1 get 403 on 18 reads and 6 writes and are sent home. Devices get 403 and "Not available on a shared device". |
| D8 | Four recheck leftovers | **PASS** | All 4 confirmed on DEV. |
| D9 | Short open hunt | **FAIL** | Gap 2 (must-fix), plus minor gaps 1 and 6. Everything else held. |

## Gaps

### Gap 1 · minor · the water-salt "Formula" field shows on every Add Ingredient dialog
- **Path:** Ingredient Library → Add → Ingredient / Grain / Hop, in any category (Fruits, Sugars, Base, Hops…).
- **Expected:** Formula and ions belong to Water Salts ingredients (brief item 5).
- **Observed:** Every Add Ingredient dialog shows "Formula — Optional, e.g. CaSO₄·2H₂O". It is saved: hop ingredient 403 was stored with `formula: "[TEST-TEMP] hop formula probe"` (POST 201). Ions show only on Water Salts, which is correct.
- **Repro:** `/ingredients?category=3` → Add → Hop. The Formula field is there; type a value and Save, and `GET /api/ingredients/403` returns it.
- **Size:** desktop 1366 px.

### Gap 2 · must-fix · "Other manufacturer…" / "Other maltster…" closes the product dialog, so a new maker can't be picked
- **Path:** Add product (any category) or Edit product → Manufacturer select → last option "Other manufacturer…" (Grains: "Other maltster…").
- **Expected:** a way to pick a manufacturer that isn't in the short list (for example a new company), with the dialog and its input kept.
- **Observed:** choosing the option **closes the whole Add/Edit product dialog** and throws away what was typed (ingredient, form, unit, name). There's no network call, no console error and no second dialog. The short list only shows makers already used in that category: my new manufacturer company "[TEST-TEMP] DEV Supply Co" (441, roles manufacturer + supplier) was never offered. In Grains and Hops a manufacturer is required, so **a product from a new maltster or hop maker can't be created in the UI at all**. The API accepts it (I created grain 474 and hop 475 with `manufacturer_party_id: 441`, 201), so the UI blocks something the API allows.
- **Repro:** `/ingredients?category=5` → Add → Product → pick an ingredient, type a product name → Manufacturer → "Other manufacturer…". The dialog closes and the input is gone. It reproduced 3 out of 3 times, by mouse and by keyboard (ArrowDown + Enter), on Add (Fruits, Base) and on Edit (product 470).
- **Size:** desktop 1366 px.
- **Why must-fix:** a main path doesn't work (new maker), and an action the UI doesn't allow is one the API accepts.

### Gap 3 · should-fix · Totals Copy puts the $ grand total on the first per-unit "Total" row
- **Path:** Purchasing → Totals → Inventory (and Orders) → Copy.
- **Expected:** per-unit subtotals that are never added together, and one $ grand total (brief item 7).
- **Observed:** on screen it is right: Total 750 tablets / 10 gal / 271 lb, then **$624.00** on its own. In the copied TSV the grand total sits on the "each" subtotal row: `Total … 750.00 each 0.00 … 624.00`, then `Total … 10.00 gal` and `Total … 271.00 lb` with no $. Pasted into a spreadsheet, it reads as "750 each are worth $624". Totals → Orders → Copy does the same (`Total … 500.00 each 584.00`). The numbers are correct; the layout is misleading.
- **Repro:** Totals → Inventory → Supplier = "[TEST-TEMP] DEV Supply Co" → Copy → paste.
- **Size:** desktop 1366 px.

### Gap 4 · minor · Totals Copy Unit column says "each" for a Tablet product
- **Path:** Totals → Inventory / Orders → Copy.
- **Expected:** "A Tablet product reads 'tablets'"; screen, Copy and API agree.
- **Observed:** the screen shows "750 tablets" and the API row has `unit_label: "tablets"`, but Copy has Unit `each` and quantities `750.00` (2 decimals on a whole-number unit). It's the same in the Orders copy (`500.00 each`).
- **Repro:** as for gap 3.
- **Size:** desktop 1366 px.

### Gap 5 · minor · the library's "All Categories" view scrolls sideways on a phone
- **Path:** Ingredient Library → Category "All Categories" (`/ingredients?category=all`). It's the only list that links to ingredient pages, where ions are edited.
- **Expected:** no sideways scroll at 360 px.
- **Observed:** `document.documentElement.scrollWidth` is **411**, and the On hand column is cut off at the right edge. Every single-category D65 list (5, 6, 7, 8, 219, 220), the product and ingredient pages, Purchasing, To order, Contracts and Totals measure 360.
- **Repro:** phone 360×780 with touch → `/ingredients?category=all`.
- **Size:** 360 px. It may pre-date D65.

### Gap 6 · minor · New order summary reads "0 sacks · 0 lb" before a quantity is typed
- **Path:** New order → pick a pail, tub or bag offer, quantity still empty.
- **Observed:** the summary reads `0 sacks · 0 lb · $0.00` for a Strawberry pail line, a Whirlfloc T tub line and a Gypsum bag line. Once a quantity is typed it is correct ("1 pail · 44 lb · $116.50", "2 tubs · 1,744 tablets · $184.00").
- **Size:** desktop 1366 px.

## Scenario detail

### D1 smoke (brewer1)
`/ingredients`, `?category=5,6,7,8,219,220`, products 310 (Strawberry), 325 (Whirlfloc T), 299 (Gypsum), `/ingredients/orders`, `/contracts`, `/to-order` and `/totals`: each was opened by direct URL and again after a reload. All 28 loads were OK: ribbon present, no console errors, no API errors, no redirect.

Category settings: Fruits, Spices & Flavorings and Sugars and Extracts show "…use products (form and unit), not custom fields", with no Add field and no Add subcategory. Other Consumables has Water Salts and Finings plus Add Subcategory / Add Field. Irish Moss and Future Ingredients are gone from the category list.

### D2 reference seed (owner): baseline at start, diff at end
- Baseline files: `results/seed_baseline_start.json` and `results/seed_baseline_end.json`. They hold every non-`[TEST-TEMP]` category, ingredient (formula, ions, lots of seeded products), product (features, on hand, lock_version, updated_at), offer (pack, note, current price) and company.
- **Diff: 0 differences** across 14 categories, 110 ingredients, 103 products with their offers and prices, and 21 companies.
- Counts (API, start and end): 29 D65 reference products, 30 offers, 26 priced. 7 salts with formulas and ions, 6 salt products (None, BSG bag · 50 lb, priced). 6 sugars. 12 Aseptic purées with Brix and prices. 4 SoNature products with no prices. 10 spices with no products. Hops: 28 lots and 409.6 lb on seeded products.
- Spot-checks, screen and API:
  - Gypsum: CaSO₄·2H₂O, Ca 61.5, SO₄ 147.4, $32.00/bag. Ions show read-only on product 299.
  - Black Strap Molasses: 81.95 % FGDB.
  - Strawberry: 6.5–9.0 °Bx, pail · 11 lb $45.00 and pail · 44 lb $116.50.
  - SoNature Lime: Brix "—".
  - Whirlfloc T: "tub · 872 tablets (5 lb)", $92.00, $0.1055/tablet.
  - Manufacturer shows "None" where blank.

### D3 end to end (brewer1, owner cross-check)
- **Order 270** from "[TEST-TEMP] DEV Supply Co": 2 grain sacks · 1 hop box · 3 sugar bags · 2 fruit pails · 1 fining tub. The dialog read `9 packs · 10 gal · 271 lb · 500 tablets · $584.00 · 9 of 40 packs`. 110 + 11 + 150 = 271 lb, and $84 + 165 + 135 + 120 + 80 = $584. The fining helper read "tubs of 500 tablets (2 lb)".
- **Receive:**
  - Extract was prefilled at 91. Fruit Brix was optional (left blank) and showed "typical 6.0–9.0". Brix 5 was marked "outside typical" and not refused. 7.55 was refused ("Use at most 1 decimal"), 150 was refused ("between 0 and 100"), and −2 was refused.
  - The fining line takes whole tubs only ("Whole tubs, 0 or more").
  - Result: on hand grain 110 lb, hop 11 lb, sugar 150 lb, fruit 10 gal, tabs 500. Every line was received exactly once.
- **Half tubs (Add lot):** 0.5 tub of 500 was accepted and stored as `initial_quantity: "250"`, so on hand went to 750. 0.5 tub of 333 was refused with "[…] Tabs T is counted in whole tablets" and Save was disabled. The API refuses 166.5 tablets and a pack size of 333.5 with the same message (422).
- **To order:** minimum 3 tubs on my fining (PUT min_on_hand_packs 3). With 1.5 tubs on hand and 0 on order, it shows 2 to order, marked "Below minimum".
- **Totals → Inventory**, my supplier:
  - Rows $120 + 120 + 84 + 165 + 135 = **$624.00**, matching the grand total.
  - Per-unit subtotals 750 tablets / 10 gal / 271 lb, never added together.
  - The API (`/api/ingredient_totals/inventory?supplier_id=441`) matches: total 624.00 and the same `by_unit`.
  - With the Manufacturer = **None** filter, only None rows show. $63.30 + 112.50 + 93.75 + 120 + 120 + 135 + 63.30 = $707.85 matches the total, and unpriced quantities are listed as not valued.
  - Copy: see gaps 3 and 4.
- **Totals → Orders** per pack name: "3 bags · 1 box · 2 pails · 2 sacks · 1 tub", with 500 tablets / 10 gal / 271 lb and $584.00. Copy has one column pair per pack name (Bags/Boxes/Pails/Sacks/Tubs ordered/received).
- **Owner** sees order 270 and the same totals (API 200, page OK).

### D4 latency (brewer2)
- Double-click on Save or Receive, once without and once with `slow(page)`:

  | Action | Fast | Slow |
  |---|---|---|
  | Add product | 476 | 477 |
  | Water-salt ingredient with formula and ions | 404 | 405 |
  | Add lot | 625 | 626 |
  | New order | 271 | 272 |
  | Receive | 1 POST | 1 POST |

  Each run made exactly one write, confirmed in the data: fruit on hand 10 → 20 gal, grain 110 → 220 lb, and the ions were stored once (`Mg 11.9, Cl 34.7`).
- **Two browsers on product 476:** A saved its note (200). B's save got **409**, shown in the dialog: "Someone else changed this product since you opened it. Close and reopen it to see their change." B's typed values stayed in the form, and A's note was kept (lock_version 2).

### D5 phone 360×780, touch (brewer1)
- **Lists and pages:** categories 5, 6, 7, 8, 219, 220, fruit product 470, ingredient 400, Whirlfloc T 325, orders, To order, Contracts, Totals (both tabs) all measure scrollWidth 360. The Totals table scrolls inside its own box, and Copy is reachable. "All Categories" is 411 (gap 5).
- **Dialogs:**

  | Dialog | Refusal shown |
  |---|---|
  | Edit product | Brix 7.25: "Use at most 1 decimal" |
  | Edit ingredient (ions) | Mg 1.25: "Use at most 1 decimal" |
  | Edit offer (pack note) | the field caps input at 40 characters; the API refuses 41 ("should be at most 40 character(s)") |
  | Add lot | Brix 101: "between 0 and 100" |
  | Count | 10.5 tablets: "…is counted in whole tablets" |
  | New order | 0.5 tub: "Whole tubs, 1 or more" |
  | Receive | Brix 5: "outside typical 6.0–9.0"; 0.5 tub refused |

  In every dialog: scrollWidth 360, Save and Cancel fully on screen after scrolling, the refusal visible, and **Back closes the dialog and stays on the same URL**.
- **Mixed order 273** (pail + bag + tub + 2 bags), created on the phone: `5 packs · 5 gal · 150 lb · 500 tablets · $245.00 · 5 of 40 packs`. Saved with one POST, then cancelled in clean-up.

### D6 service worker (owner, brewer1)
- `navigator.serviceWorker.controller` is `/sw.js` (activated, scope `/`) **on the first load**, and again after a reload.
- 6 Purchasing and library routes, each by direct URL, after a reload and after going away and back (`/schedule` → Back): 18 per persona, all OK.
- Library → product → Back returns to `?category=5`.
- Offline reload shows "Can't reach the server, retrying… / TRY NOW" with the ribbon and recovers when back online.
- No stale-bundle errors.

### D7 who
- **owner, owner2, breweryMgr, brewer1, brewer2, floater, splitRole:**
  - 18 read routes all return 200: categories, ingredients incl. salt 277 and 400 with ions, products, offers, prices, lots, purchase orders, both totals, contracts, companies.
  - Empty-body writes return 422, i.e. validation; they are authorized.
  - All 6 pages load, and the nav shows Ingredient Library.
- **barMgr, bartender1, office1:**
  - 403 on all 18 reads and on 6 writes (POST lots, orders, categories, products, offers; PUT ingredient 400).
  - Every D65 page redirects to `/` (Home), and there's no Ingredient Library in the nav.
- **taproomDevice, breweryDevice:** 403 on all 18 reads and 6 writes. Every page shows "Not available on a shared device. This page needs your own account. Use your own phone or computer. GO TO HOME."

### D8 local leftovers (brewer1)
1. New order → BSG → "Whirlfloc T · None · tub · 872 tablets (5 lb)". The helper reads **"tubs of 872 tablets (5 lb)"**, and the price prefills $92. Cancelled with no write.
2. Ingredient 400 (mine) and 277 (seeded Gypsum, read only): the disabled button has `aria-label="Delete Ingredient"`, is `disabled`, and has `aria-describedby` pointing to the reason. Hovering shows the tooltip "… has products; deactivate them instead".
3. "[TEST-TEMP] DEV MANGO PUREE" (same ingredient, form and None maker as "[TEST-TEMP] DEV Mango Puree") was refused with 422: "There's already a [TEST-TEMP] DEV Fruit Mango [TEST-TEMP] DEV Mango Puree with manufacturer None." The existing spelling is named, and nothing was created.
4. −1 tablets (Add lot tablets, Add lot tubs, Record movement) reads **"Enter at least 1 tablet"**. Count −1 reads "Enter 0 or more", which is right because 0 is a valid count.

### D9 open hunt (what held, besides gaps 1, 2 and 6)
- **API refusals:**
  - Subcategory under Fruits, Sugars or Spices: 422 "… has no subcategories".
  - Field definition on those categories: 422 "… use products, not custom fields".
  - A product named "None" or "none": 422.
  - Dry sugar in gal, or fruit in oz: 422.
  - Unit or form change on a product with lots: 422 "…stays each / stays Tablet".
  - Lot with no supplier when the product has an active offer: 422 "Pick the supplier…".
  - Brix 120 or 7.25 on a lot: 422. Brix on a Dry sugar lot: 422 "Brix is only for Liquid sugars".
  - Fractional tablets in a movement (0.5) or a count (698.5): 422.
  - Contract with a sugar product: 422 "Contracts are for grain and hops". The New contract picker offers only my grain and hop.
- **Liquid sugar lot (478):** extract 75.25 is copied to the lot and Brix 70.5 is optional and accepted. Both show in the lots table.
- **Throttled double-click:** Record movement, Count, Add price and Edit ingredient (ions) each wrote once. On hand 750 → 740 → 700, as expected. The ion edit shows on the product page ("Ca 61.5 · SO₄ 147.4 · Na 3.5 · Cl 1.5").
- **Reload mid-save (Add lot, throttled):** exactly one lot (627) was created, and on hand went 150 → 200 lb (4 bags). Reloading with New order half-filled just closes the dialog and creates nothing.
- **Seeded data in pickers** (all opened and cancelled, no writes):
  - Strawberry Add lot lists "pail · 11 lb" and "pail · 44 lb", with "typical 6.5–9.0" under Brix.
  - The Aseptic Fruit, SoNature, BSG and Redstone offer lists show labels with None, units and pack sizes.
  - SoNature shows "No current price", and Save stays disabled until a price is entered.
- **Library Back:** product → Back returns to the right `?category=`. The product breadcrumb links to `/ingredients?category=<its category>`. Category switches **replace** the history entry instead of adding one, so Back skips earlier categories. I read that as a design choice, not a gap. The library's Manufacturer filter (including "None") is not kept in the URL and resets on reload (an observation).
- **Inventory reconciles:** fining 473 on hand 699 = 500 received + 250 (half tub) − 10 used − 40 (count to 700) − 1 used.

## Data I made, all `[TEST-TEMP] DEV…`, and what I did with it

| Kind | Ids | End state |
|---|---|---|
| Company | 441 "[TEST-TEMP] DEV Supply Co" (manufacturer + supplier, target 40) | **deactivated** |
| Ingredients | 398 fruit, 399 sugar, 400 salt (ions), 401 fining, 402 grain, 403 hop | kept: they have products, and the API says "deactivate them instead" |
| Ingredients | 404, 405 (D4 salts, no products) | **deleted** (204) |
| Products | 470, 471, 472, 473, 474, 475, 476, 477, 478 | **all deactivated** (features unchanged) |
| Offers | 980, 981, 982, 983, 984, 985 (prices on each; 983 also has a second price of $82) | left with the deactivated products |
| Lots | 619, 620, 621, 622, 623, 624, 625, 626, 627, 628 | on my deactivated products; nothing expired, deleted or counted on rows that aren't mine |
| Orders | 270 PO-1, 271 D4 fast, 272 D4 slow | received |
| Orders | 273 PO-2 phone | **cancelled** |
| Subcategory | 234 "[TEST-TEMP] DEV Sub" under Other Consumables, with field def 134 | field and subcategory **deleted** (204) |

All destructive steps were done by exact id, after reading the row back and checking its `[TEST-TEMP]` prefix.

My only effects on non-`[TEST-TEMP]` rows were reads, and dialogs opened then cancelled (Strawberry Add lot, the BSG/Aseptic/SoNature/Redstone order pickers, Gypsum ingredient 277). The seed diff is 0.

**Settings:** I never clicked the packs/Total toggle. `board_settings` for brewer1, brewer2 and owner were saved before (`results/board_settings_before.json`) and after (`…_after.json`), and they are identical. `GET /api/me/board_settings` from the brief returns 404 on this build; the settings are in `GET /api/me` → `board_settings`, which is what I compared.

## What I couldn't test, or only partly
- **Prod comparison** for gap 2 (whether it already exists in D60–62) and gap 5: prod is off-limits.
- **A real phone or mobile Safari:** D5 used Chromium phone emulation (360×780, touch, `isMobile`). The Back gesture was simulated with `history.back()`.
- **A new service-worker version taking over:** only one build was deployed, so I couldn't watch an update replace an older SW. I tested first-load control, reloads and offline recovery.
- **Receiving into an existing lot whose pack size differs from the offer's:** not set up.
- **Contracts end to end:** brewer1 has no New contract button. As owner I only opened the dialog and probed the API; I created no contract.
- **Other people's data:** DEV holds many open `[TEST-TEMP]` orders and products from other runs (C1…T3, P4/P5, "D65 mixed", "Order Tabs", …). I left them alone. They show in To order, Totals and the supplier filters and make the lists long.
- Product page "Movements" tables were read on screen only. There's no movements list endpoint I could use for the API side (`/api/ingredient_movements` returns 404).
