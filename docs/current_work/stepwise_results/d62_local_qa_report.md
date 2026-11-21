# D62 QA report: hops + grain generalization (local)

- **Date:** 2026-11-20 (America/Denver), against http://localhost:5174 after a fresh reseed. No source read; tested through the browser (Playwright) and the API only.
- **Personas used:** brewer1, brewer2, breweryMgr, owner, floater, splitRole, bartender1, office1, barMgr, breweryDevice, taproomDevice. (owner2 was only read for settings.)
- **Verdict:** **pass with gaps.** 2 must-fix, 6 should-fix, 4 minor.

## Summary

| Severity | # | Gaps |
|---|---|---|
| must-fix | 2 | 4 (Totals: hops inside "All grains" under grain headings), 7 (receiving into an existing lot reprices the whole lot) |
| should-fix | 6 | 3, 5, 6, 9, 10, 11 |
| minor | 4 | 1, 2, 8, 12 |

## Gaps

Each gap reads: path → expected → observed → repro. Desktop is 1366×768 unless noted.

### Gap 4 · must-fix · Q1 grain regression: Totals mixes hops into "All grains"
- **Path:** Purchasing → Totals → Inventory (desktop and 360 px).
- **Expected:** The grain Totals table reads as in D61, and hops are included in lb with a Hops category (per Q9).
- **Observed:** The Category filter offers only "All grains" plus the grain subcategories, but "All grains" lists all 27 seeded hop products and my hop products. They sit under the column headings **Grain / Maltster / Sacks**. The Sacks column shows hop boxes as fractions: African Queen 0.32, Galaxy 6.45, Magnum 0.05. You can't select or exclude Hops. The lb total (3,709.6 at the time, later 5,857.6) and the "1,124.6 lb has no price" note do add up (715 lb Rahr 2-Row + 409.6 lb hops). Value is correct and seeded hops show no value.
- **Repro:** as brewer1, open /ingredients/totals and read the rows with Category "Hops".

### Gap 7 · must-fix · Q18: receiving into an existing lot reprices the whole lot
- **Path:** Order → Receive → Goes to an existing lot (grain or hops).
- **Expected:** Lot value = old value + (received qty × price paid).
- **Observed:** The whole lot's $/lb becomes the latest receipt price.
  - **Grain:** lot `[TEST-TEMP]G1` held 4,235 lb at $0.90/lb ($3,811.50). After receiving 1 sack at $110 (order 246) it shows $/lb **$2.0000**, value **$8,580.00**. The value should be $3,921.50.
  - **Hops:** lot `[TEST-TEMP]H3` got 33 lb at $14.05, then 418 lb at $14.50. It shows 451 lb × $14.50 = $6,539.50. Price paid was $6,524.65, so it's $14.85 over.
  - Totals inherits the wrong figure.
- **Repro:** receive any order line at a price different from the lot's current cost into that existing lot.
- **Caveat:** I couldn't check whether D61 behaved the same way. Either way it's a wrong money figure.

### Gap 3 · should-fix · Q6: hop offers labelled "whole"
- **Path:** New order / Add lot → Offer picker.
- **Expected:** Hop offers read box · 11 lb with no grain form.
- **Observed:** "[TEST-TEMP] Citrine T90 · … Citrine T90 Pellet · 11 lb · whole" and "… · 11 lb whole". Seeded hop offers carry `form: "whole"` in the API too. A pellet offer is labelled "whole", which is easy to confuse with the "Whole leaf" form.
- **Repro:** New order for a hop supplier, then open the Offer list.

### Gap 5 · should-fix · Q1: Maltster pickers list hop companies
- **Path:** grain Add/Edit maltster product → Maltster; library Maltster filter (Grains); Totals Maltster filter.
- **Expected:** Grain screens read as D61; only Companies changes.
- **Observed:** "Maltster" lists every manufacturer, including the hop-only companies Billy Goat, John Fearless, Lupulin Exchange, Michigan Hop Alliance, Yakima Chief Hops and my `[TEST-TEMP] QA Hop Grower`. A hop grower can be picked as a grain's maltster. The Ingredient settings menu still says "Companies: Maltsters, suppliers, partner breweries".
- **Severity note:** This follows from the maltster→manufacturer rename. I rated it should-fix, not must-fix, because I can't confirm D61's list. Per the brief's strict rule it's arguably must-fix.

### Gap 6 · should-fix · Q6: Orders list says "Sacks" for mixed orders
- **Path:** Purchasing → Orders list.
- **Expected:** Mixed orders count packs ("36 packs"), as on the order page.
- **Observed:** The column header is "Sacks", and mixed order `[TEST-TEMP] Q6 mixed` shows 36 (30 sacks + 6 boxes) under it.

### Gap 9 · should-fix · Q14: concurrent hop product edits silently lose a field
- **Path:** Hop product → Edit hop product, open in two browsers.
- **Observed:** brewer1 changed alpha low 11 → 10.5 and saved. brewer2, whose dialog was opened earlier, changed only Origin and saved. Result: origin saved and **alpha silently back to 11**, with no message to either user. Last save wins is the known behavior, but losing a field the second user never touched is not what a user would expect. By contrast, orders, Receive and contracts all refuse the second save with a clear 409 message.

### Gap 10 · should-fix · Q18: receiving into a "new" lot # that already exists drops the specs typed
- **Path:** Receive → Goes to: New lot # → Lot # = an existing lot of the product (`[TEST-TEMP]H1`) → crop year 2020, alpha 9.5.
- **Observed:** The receipt is added to H1, and H1 keeps crop 2025 and alpha 14.1. The 2020 / 9.5 the user typed are silently discarded. The dialog does say "A number the product already has adds to that lot", but it gives no warning when the specs typed differ.

### Gap 11 · should-fix · Q18: Totals → Orders adds sacks and boxes together
- **Path:** Totals → Orders.
- **Observed:** "Ordered/Received" totals 120/118, which is 73 sacks + 47 boxes, with the footnote "Open orders count the sacks ordered; received ones the sacks received." lb (4,378) and $ ($11,152.25) are correct.

### Gap 12 · minor · Q1: To order says "0 boxes" while the product says "0 lb"
- **Observed:** This one is cosmetic. The To order row reads "0 boxes" for an empty hop product, while the product page and list read "0 lb".

### Gap 1 · minor · Q2: duplicate message shows a raw field name
- **Observed:** "ingredient id: [TEST-TEMP] QA Supply Co already has T90 Pellet [TEST-TEMP] Citrine." It does name the duplicate; the "ingredient id:" prefix is internal.

### Gap 2 · minor · Q2: one-ended and equal ranges read oddly
- **Observed:** Ranges read "12– %", "–9 %" and "12.5–12.5 %" on the product page and in the list. A blank beta reads "β — %" on the phone cards.

### Gap 8 · minor · Q12 (360 px): line pickers truncate
- **Observed:** In the order and contract dialogs at 360 px, every product reads "[TEST-TEMP] QA Supply…". Lines from one company look identical; only the Sacks/lb labels tell grain from hops.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | FAIL (gap 4; also 5, 12) | Grain list "$/sack", "Maltster", "Sacks + lb"/"lb"; product page; Add lot "12 sacks 22.5 lb" ($614.25); Record movement −1 sack; Count total (−2.5 lb) and by lot; order "36 of 40 sacks"; Receive into previous lot; To order says sacks when all-grain. Companies shows Manufacturer and "Order target (packs)". All read as D61. |
| Q2 | PASS | Form, origin, ranges 11–13 / 3.5–4.5 / 2.5–3.0 saved. Low > high refused (UI: Save disabled with "Alpha acid: low is above high"; API 422). Duplicate refused naming it (UI + API). A second manufacturer's same variety is a separate product. Bad form → 422. |
| Q3 | PASS | Pack field locked at "box · 11 lb". API POST/PATCH with 22 lb, sack or bag → 422 "Hop offers are 11 lb boxes". $165.00/box → $15.0000/lb. History keeps both rows. |
| Q4 | PASS | Blank crop year/alpha refused (UI + API). 1999 and 2028 refused ("2000 to 2027"); 2027 and 2000 OK. Alpha 14.10 saved and marked ⚠ "outside typical 11–13". Lot doesn't copy ranges. Beta/oil blank OK. "3 boxes 4.5 lb" = 37.5 lb. 0.6 lb reads "0.6 lb". |
| Q5 | PASS | 6.5 lb oldest first = −0.6 from H2 + −5.9 from H1. Over-use refused "That's more than the 2 boxes 9.6 lb on hand" (UI + API). Count total and by lot. Expired → oldest first skips it ("…plus 2 boxes 8 lb in expired lots"), then back. Traded out 5 lb to my partner. Movements sum = on hand every time. |
| Q6 | PASS (gaps 3, 6) | 30 sacks + 6 boxes → "36 packs · 1,716 lb · $2,412.30", "36 of 40 packs". Edit to 7 boxes. Receive: grain into G1, hops 2 into H1 + 3 into new lot H3 (asked crop year + alpha). Inventory rose exactly. A short delivery (5 of 7) closed the order. |
| Q7 | PASS | 2026: grain 100 sacks @ $48 + hop 440.5 lb @ $14.50 ("440.5 lb = 40.05 boxes", $159.50/box). Price rows: $159.50 "Contract 2026" from 2026-11-20; 2027 from 2027-01-01; 2025 writes none ("2025 is over"). Editing the hop price wrote a new $158.07 row. A yeast product line → 422 "Contracts are for grain and hops". brewer1: no write buttons; POST/PUT/PATCH/DELETE → 403. |
| Q8 | PASS | 3-box order → on order 33 lb. Received → 88 lb, $1,251.25, remaining 352.5 lb. Off-contract order and receipt changed nothing. 33 boxes more → "over by 10.5 lb", nothing refused. Totals "100 sacks · 440.5 lb", $11,187.25 and received $9,781.75 add up. Shortfall shows the hop line in lb (2027/2025). |
| Q9 | PASS | Galaxy (Lupulin, T90) 6 boxes 5 lb = 71.0 lb, crop 2025, 17.60 ⚠ vs 11–16. Citra Cryo 26.90 ⚠ vs 20–26. Magnum 0.6 lb. 27 products / 28 lots / 409.6 lb. Totals include them in lb, unvalued. Seeded products, lots and movements unchanged vs a baseline taken at the start, checked twice (mid-run and at the end). |
| Q10 | PARTIAL | The reseed has **no recipes** (GET /api/recipes = []), so there's no `[SEED]` recipe. On my own `[TEST-TEMP]` recipe the hop lot picker reads "… Galaxy T90 Pellet · MB030 · 2025 · 17.6% AA · 6 boxes 5 lb · Available". Cancelled with no writes. |
| Q11 | PASS | Hops category page: no Add field ("Hops use specs (features), not custom fields"). POST /api/category_field_definitions on Hops → 422 for owner and brewer1. 12.675 → "Use at most 2 decimals"; 1,234 parsed as 1234; 5,2 → "Use . for the decimal point"; −1 → "Enter 0 or more". |
| Q12 | PASS (gap 8) | 360 px touch: Hops list (cards), product page, product/offer/Add lot/movement/count dialogs, Orders, mixed order and edit dialog, Receive with new lot, Contracts and contract dialog with a hop line (breweryMgr), To order, Totals, Companies and company dialog. scrollWidth = 360 everywhere; Save reachable. |
| Q13 | PASS | Slow 4G double-click: hop product 1 POST, hop Add lot 1, mixed order 1, Receive 1 (one movement per line), contract 1 (one price row). Double-tap on phone: Add lot 1. |
| Q14 | PASS (gap 9) | Order: the second save → 409 "Someone else changed this order…"; nothing lost. Double Receive → 409 "already been received"; stock +33 lb once. Contract (breweryMgr + owner) → 409 and no stray price row. |
| Q15 | PASS | floater, splitRole and owner: library, hop product actions, orders and totals work (a 0.1 lb use each → 201). floater/splitRole read contracts with no write buttons, POST → 403. owner can write. |
| Q16 | PASS | bartender1, office1, barMgr: no Ingredient Library in nav. /ingredients/* pages redirect to Home. 30 hop/purchasing routes (reads + writes) all 403. |
| Q17 | PASS | breweryDevice, taproomDevice: the same 30 routes all 403. Pages say "Not available on a shared device". |
| Q18 | PASS (found gaps 7, 10, 11) | Also checked and fine: duplicate via form change refused; partner-only company as manufacturer refused; grain features on hops and hop features on grain refused; contract qty 3 decimals / 0 / negative and price 3 decimals / negative refused; grain contract sacks must be whole; 1.5 boxes = 16.5 lb. |

## Data I made (all `[TEST-TEMP]`) and clean-up
- **Companies:** 432 QA Supply Co (manufacturer + supplier, order target 40), 433 QA Partner Brewery, 434 QA Hop Grower. All **deactivated**.
- **Ingredients / varieties:** 239 Citrine (hop), 240 QA Pale (grain, Base), 241 QA Yeast. Left for the reseed; there's no deactivate.
- **Products:** 612 Citrine T90 Pellet, 613 (Hop Grower) Citrine T90 Pellet, 614 QA Pale, 615 QA Yeast, 616 Citrine Cryo. All **deactivated**.
- **Offers:** 899 (hop, box · 11 lb), 900 (grain, 55 lb sack). They carry price rows from my prices and the contracts.
- **Lots:** 518 G1, 519 H1, 520 H2, 521 H3, 522 S1, 523 S2.
- **Orders:** 241–249. All received; **no open orders left**.
- **Contracts:** 85 (2026), 86 (2027), 87 (2025), 88 (2028), 89 (2030, created by owner), 90 (2031). Left for the reseed; 85 can't be deleted after receipts.
- **Brand / recipe:** brand 325, recipe 19, both empty. Left for the reseed.
- **Seeded rows:** never edited. A final diff of all 27 seeded hop products, their lots and their movements showed **0 changes**.

## Settings
- Before: `board_settings` was `{}` for brewer1, brewer2, owner, owner2, breweryMgr, floater and splitRole, meaning the default "Sacks + lb" / "Boxes + lb".
- I toggled the display for brewer1 and brewer2 and set both back to "Sacks + lb". They are now stored as `{"ingredients":{"quantity_display":"packs"}}`, which shows exactly like the default.
- **Not byte-exact:** the API can't remove the key. `DELETE /api/me/board_settings/ingredients` → 404, and `PUT {}` keeps "packs". Other personas are untouched (`{}`).

## Couldn't test
- **Q10 on a `[SEED]` recipe:** none exist in this reseed. Tested on my own recipe instead.
- **Gap 7 against D61:** I couldn't confirm whether D61 already had this lot-repricing behavior.
- **Out of scope:** email, push and service worker (per the brief).
- **Not tried:** a Hops subcategory ("Add subcategory" is offered on Hops). Creating one would change the shared category tree.
