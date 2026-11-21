# D62 independent QA pass on DEV

- **Date:** 2026-11-20 (America/Denver), evening run
- **Target:** https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev, build `a9998ea` (from the DEV banner). No prod host was touched.
- **Personas used:** `brewer1`, `brewer2`, `owner` (read only), `breweryMgr`, `floater` and `splitRole` (one read each, as a check), `bartender1`, `office1`, `taproomDevice`, `breweryDevice`. Nobody signed in with a password. No persona or device was signed out or changed.
- **Verdict:** **pass with gaps.** There are 4 minor gaps and no must-fix or should-fix gaps. The seeded hop rows match the start-of-run snapshot exactly.

## Summary

| # | Persona | Result | Checks | Notes |
|---|---|---|---|---|
| Setup | brewer1 | PASS | – | Company, hop variety, hop product and offer, grain product and 55 lb offer, and prices were all made through the UI |
| D1 | brewer1 | PASS | 9 | Grain screens read as D61 did. Gap 1 (minor) is on Companies |
| D2 | owner | PASS | 9 | 27 products, 28 lots, 409.6 lb, 28 Opening amounts dated 2026-11-19. Galaxy, Citra Cryo and Magnum all check out |
| D3 | brewer1 | PASS | 14 | Ranges, box · 11 lb, lot rules, oldest-first use, Count, Expired and trades. On hand = sum of movements |
| D4 | brewer1 | PASS | 12 | Mixed order counts in packs, Receive works into a new lot # and an existing one, Totals → Orders splits per pack name. Gaps 2 and 3 (minor) |
| D5 | breweryMgr | PASS | 11 | The hop line writes $159.50/box "Contract 2026". A past year writes no price. Next year's price takes effect 2027-01-01. lb accounting is right and brewer1 gets 403 |
| D6 | brewer1 + brewer2 | PASS | 8 | Product 409, order 409 (on edit and on edit vs receive), and To order 409 → refetch → the next pick saves |
| D7 | brewer2 (+ breweryMgr) | PASS | 6 | Six double-tapped saves under Slow-4G each wrote exactly once |
| D8 | brewer1 (+ breweryMgr) | PASS | 16 | At 360 px, `scrollWidth` = 360 on every screen and every dialog's Save can be reached |
| D9 | bartender1, office1, taproomDevice, breweryDevice | PASS | 104 | 24 routes × 4 personas return 403. Pages either redirect home or say "Not available on a shared device" |
| D10 | brewer1 | PASS | 14 | The service worker registers and the shell survives a reload. Totals "as of" and Copy are right and there are no latency races. Gap 4 (minor) |

## Gaps

### GAP 1 (minor, D1): Companies list shows the order target in "sacks"
- **Path:** Ingredient Library → ⚙ → Companies → the `[TEST-TEMP] D62QA Hop & Malt Co` row (supplier + manufacturer, target 40)
- **Expected:** Companies is where the wording changes to packs. The dialog says "Order target (packs)" and explains "Every pack on an order counts, sacks and boxes alike (e.g. 40: "36 of 40 packs")".
- **Observed:** the list's Order target column reads **"40 sacks"**. A supplier that also sells hops is told its target is in sacks.
- **Repro:** make a supplier with Order target 40, then open the Companies list.

### GAP 2 (minor, D4): API accepts a blank crop year when receiving into an existing hop lot #
- **Path:** `POST /api/purchase_orders/:id/receive` with `allocations:[{lot_number:"<existing lot>", crop_year:null, features:{same alpha/beta}}]`
- **Expected:** the brief says "the API refuses different values (a blank counts as a value) with a 422".
- **Observed:** **200**, and the receipt goes into the lot. The lot keeps crop year 2025, so no data changed. The API does return 422 for a different alpha, an explicitly blank beta (`""` or `null`), an extra total oil, and a different crop year. Leaving the `beta_acid_pct` key out while sending the other features was also accepted. That may be the intended "leave its values" path.
- **Repro:** order 225 (`[TEST-TEMP] D4 api blank probe`) into lot 519 `[TEST-TEMP] HOP-R1`.

### GAP 3 (minor, D4): Receive is disabled with no reason when one split is 0
- **Path:** Order → Receive → hop line, Boxes received 2 → ADD LOT # → first split "Goes to" existing lot = **0**, second split New lot # = 2, with lot #, crop year and alpha filled in
- **Expected:** either the save goes through (0 to one lot, 2 to the other) or the dialog says what's wrong.
- **Observed:** the footer reads "0 + 2 = 2 of 2" and **RECEIVE stays disabled with no message**. A user can't tell what to fix. The workaround is to change the first "Goes to" to "New lot #" without adding a split.
- **Repro:** order 222 (`[TEST-TEMP] D4 mixed`) before it was received.

### GAP 4 (minor, D10): the Category filter goes back to Grains when you return to the list
- **Path:** Ingredient Library → Category = Hops → open a hop product → browser Back, or the "Ingredients" back link
- **Expected:** the list returns still showing Hops.
- **Observed:** the Category filter is back to **Grains** every time. A grain subcategory (Roasted) resets the same way, so this probably isn't new in D62. It hurts more for hops, because Hops is never the default: someone working through the hop cooler has to re-pick Hops after every product.
- **Repro:** as above, as brewer1, on desktop.

## Scenarios that passed (highlights)

- **D1:** I checked five reference grains: Rahr 2-Row (id 2, with two `[SEED]` lots, 13 sacks, movements), Simpsons Maris Otter, Weyermann Caramunich 1, Dingemans Special B and Weyermann Carafa 3. All five show "Maltster", "$/sack", "Sacks + lb" / "lb", and none uses the words pack, box or manufacturer. Lots and value show "—" because seeded grain has no cost. Other things that read as before:
  - My grain lot shows "12 sacks 22.5 lb". A grain-only order shows "4 of 40 sacks".
  - To order says "in whole sacks" when there's no hop minimum.
  - Totals → Inventory → Grains is the D61 table (Grain/Maltster/Category/lb/Expired lb/Sacks).
  - Yeast and other pre-D62 categories still render.
  - Only Companies says Manufacturer.
- **D2:** Lot on-hand amounts add up to 409.60 lb across 28 lots, and every lot has exactly one Opening amount dated 2026-11-19 equal to its on hand. Manufacturers and suppliers are the six named in the brief. The spot checks:
  - Galaxy (Lupulin Exchange, T90) is lot MB030, 71 lb = "6 boxes 5 lb". Alpha 17.60 ⚠ has the tooltip "Outside typical 11–16".
  - Citra Cryo lot PC1-JUCIT2206 has alpha 26.9.
  - Magnum has 0.6 lb.
  - Totals → Inventory → Hops lists them in lb with no value, totalling 409.6 lb.
- **D3:**
  - **Product dialog and API refusals:** the dialog blocks a low above its high and 3 decimals. The API returns 422 for each of: low > high, 3 decimals, a bad form, a duplicate manufacturer + variety + form, a missing `lock_version`, and box sizes other than 11 or other packs. A stale `lock_version` gets 409.
  - **Offer:** the offer dialog's pack is fixed at "box · 11 lb". $170.50/box shows as $15.5000/lb.
  - **Lot rules:** crop year must be 2000–2027 (UI and API). Alpha is required (the UI says "Enter the alpha acid", the API returns 422). Out-of-range values are marked ⚠, never refused.
  - **Stock movements:** Used in brewing takes 15 lb oldest first (11 lb from HOP-B, then 4 lb from HOP-A). Count to 30 lb, then Expired: "0 lb usable · 2 boxes 8 lb expired". Traded out and Traded in work with my own partner brewery. On hand equals the sum of movements at every step.
  - **Custom fields:** Hops has no "Add field" ("Hops use specs (features), not custom fields").
- **D4:**
  - **Mixed order:** totals read "7 packs · 253 lb · $731.50, 7 of 40 packs".
  - **First Receive:** grain went into the previous lot GR-1. Hops went into a new lot # that asked for crop year and alpha.
  - **Second order:** typing the existing lot # showed "Adds to existing lot … Crop year 2025 · Alpha acid 12.10 % · Beta acid 4.10 %" read-only, and the receipt went through.
  - **API check:** a different alpha gets a 422 that names the lot's values.
  - **Totals → Orders:** shows "7 boxes · 4 sacks" ordered and "6 boxes · 4 sacks" received. lb and $ add up.
- **D5:**
  - **Price written:** the contract dialog previewed "price becomes $159.50 from 2026-11-20", and the offer history then had a $159.50 entry with note "Contract 2026". The 2024 contract dialog said "2024 is over: saving changes no offer prices", and the 2025 contract wrote none either.
  - **Totals:** the contract shows "40 sacks · 440.5 lb, $8,547.25".
  - **After the on-contract order was received:** on order 0 lb, received 88 lb, remaining 352.5 lb, received $1,342.00.
  - **Read-only check:** brewer1 sees no New contract button and gets 403 on POST and PUT.
- **D6:** The second save got "Someone else changed this product…" (409) and nothing was written. Reopening shows the other person's change and the save then works. The same open order gives 409 "Someone else changed this order…", and editing an order the other person just received gives 409 "already been received". On To order the banner reads "Someone else changed this product. The list is up to date now; pick the offer again", and the next pick saved.
- **D7:** These each wrote once, checked through the API: the hop product save, Add lot (one lot and one movement), the mixed order (one order), Receive (one receipt per line) and the contract as breweryMgr (one contract).
- **D8:** At 360 px with touch, these all had `scrollWidth` = 360 and a reachable Save: the Hops list, the product page, the product, offer and lot dialogs, Orders, New order with a hop line, the order page, Receive with new-lot fields, Contracts, the contract dialog with a 440.5 lb hop line (screenshot `results/shot_d8_contract.png`), To order, Totals Hops and Totals Orders.
- **D9:** All 13 GETs and 11 writes return 403 for each persona, and nothing was written. bartender1 and office1 are sent to Home and have no Ingredient Library in the nav. Both devices show "Not available on a shared device".
- **D10:**
  - **Installed app:** `/sw.js` is active and controls the page. The manifest has `display: standalone` and 3 icons. The app shell loads after a reload. Offline it shows "Can't reach the server, retrying…" and recovers when back online.
  - **Totals "as of":** 2026-11-18 under Hops excludes all seeded hops (only my 11 lb lot dated 11-01). 2026-11-19 includes them (420.6 = 409.6 + 11).
  - **Copy:** puts 30 tab-separated lines with a Total row on the clipboard.
  - **Latency races:** quick Hops→Grains and as-of changes under Slow-4G end on the last choice.
- **Seeded hop integrity:** I compared a full snapshot of products, lots and movements (results/baseline_seeded_hops.json) with one taken at the end (results/after_seeded_hops.json). There were **0 differences** and no new movements on seeded products.

## Observations (not counted as gaps)

- Movements and lots list **newest first** on product pages, for both grain and hops, and the API returns that order too. "Oldest first" holds for allocation ("From the oldest lots first, skipping expired lots"). If the brief meant the display order, the two disagree.
- The Orders list column header says **"Packs"** even when every order is grain. I can't compare with D61 without prod, so please confirm whether D61 said "Sacks".
- The hop Add lot dialog leaves Supplier empty when a product has two offers (`supplier_party_id: null`). With one offer it fills it in.
- Lots made with Add lot "Received" carry no cost and are valued "est." at the offer's current price, so their value follows later contract prices ($15.50 → $14.50).

## Couldn't test

- **The PWA update prompt.** It needs a new deploy during the session. I only confirmed the `rockcut-sw-prompt-v1` cache exists. Playwright also can't emulate a real home-screen install; I used a regular session with the service worker in control.
- **The recipe lot picker** ("… Citra T90 Pellet · lot · crop year · alpha% AA"). DEV has no recipes (`/api/recipes` is empty), and recipes and brands aren't among the data types I may create.
- **API refusal of a custom field on Hops.** I couldn't find the field-definition write route: `/api/ingredient_categories/3/field_definitions` and `/api/field_definitions` return 404. A category PUT that carried a field returned 200 and ignored it (nothing written). The UI offers no Add field.
- **"Contracts accept only grain and hop products".** DEV has no products in other categories to try.

## Data I made (all `[TEST-TEMP]`) and cleanup

| Kind | Ids | End state |
|---|---|---|
| Companies | 337 `[TEST-TEMP] D62QA Hop & Malt Co` (supplier + manufacturer, target 40), 338 `[TEST-TEMP] D62QA Partner Brewery`, 339 `[TEST-TEMP] D62QA Supplier Two` | **deactivated** |
| Ingredients | 261 `[TEST-TEMP] D62QA Hopvariety` (Hops), 262 `[TEST-TEMP] D62QA Grain` (Base) | left for the reseed (no deactivate) |
| Products | 545 hop T90 Pellet (min 20 boxes), 546 grain (min 30 sacks) | **deactivated** |
| Offers | 784 (hop, box · 11 lb), 785 (grain, 55 lb sack), 786 (hop, Supplier Two) | inactive with their products |
| Prices | 376, 377, 381 entered by hand; 378, 379 (Contract 2026); 380 (Contract 2027, eff. 2027-01-01) | history |
| Lots | 515 HOP-A (expired), 516 HOP-B (depleted), 517 HOP-C, 518 GR-1, 519 HOP-R1, 520 HOP-D7 | left for the reseed |
| Orders | 222, 223, 224, 225, 226, 227, 228 (received); 229 `[TEST-TEMP] D8 phone receive` | 229 **cancelled** by exact id; no open orders left |
| Contracts | 70 (2026), 71 (2025), 72 (2027), 73 (2024) | left for the reseed (notes `[TEST-TEMP] …`) |

Every destructive action (Expired, Count, cancel, deactivate) went by exact id, after reading the row back and checking its name or reference started with `[TEST-TEMP]`.

## Settings

- I read every persona's `board_settings` before the run (`results/settings_before.txt`) and again at the end (`results/settings_after.txt`).
- **brewer1:** at the start it was `{}`, which defaults to packs and shows "Sacks + lb" pressed. I toggled to "lb" once and back to "Sacks + lb". The display setting is **restored to packs ("Sacks + lb")**, which is what the user saw before.
- **Not restored exactly:** the stored record now reads `{"ingredients":{"quantity_display":"packs"}}` instead of `{}`. The API has no way to clear it: DELETE returns 404, and a PUT of `{}` keeps `packs`. The screen is unchanged, but this is not byte-for-byte the original.
- **All other personas:** unchanged (`{}`).
