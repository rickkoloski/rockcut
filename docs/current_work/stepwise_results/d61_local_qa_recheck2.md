# D61 local QA: recheck 2 (gap 19)

- **Date:** 2026-11-19 (America/Denver), against http://localhost:5174 with no reseed. Nothing touched `*.fly.dev`.
- **Personas:** `brewer1` (set-up and cleanup) and `brewer2` (To order). Sessions came from the `auth/` files. I used no passwords and never read, printed or logged a token.
- **Verdict: pass.** Gap 19 is closed and there are no new gaps.

| # | Result | Checks |
|---|---|---|
| R1 | PASS | 12 |
| R2 | PASS | 6 |

## R1: gap 19, the To order offer at phone width (closed)

**Set-up:**
- One `[TEST-TEMP]` product, RC Phone Pale (803).
- Two offers:
  - a 55 lb offer (1228) from a supplier with a long name, "[TEST-TEMP] RC Northern Plains Cooperative Grain Merchants & Maltings" (442);
  - a 50 lb offer (1229) from "[TEST-TEMP] RC Short" (443).
- Minimum 10 and one opening lot of 110 lb.

| Size | Card overflow (client / scroll width) | Page width | Offer shown | To order number | Change offer → saved → after reload |
|---|---|---|---|---|---|
| 360×780 touch | 310 / 310, none | 360 | Picker on its own row under the product, full width (294 px). The long name wraps to three lines and ends "· 55 lb"; the select's text width equals its box, so nothing is cut off. | "8" at x 286–335, in view | 55 → 50 lb sent `PUT /api/ingredient_products/803 {"reorder_offer_id":1229}`. Kept after reload (API 1229). On hand shows 2.2 sacks, To order 8. |
| 390×844 touch | 340 / 340, none | 390 | Same layout, 324 px picker | "8" at x 315–365, in view | 50 → 55 lb sent `{"reorder_offer_id":1228}`. Kept after reload (API 1228). On hand shows 2 sacks. |
| 1366×768 desktop | 1076 / 1076, none | 1366 | Offer stays in its own column (no extra row). The long name wraps inside the cell and reads in full. | "8" in its column | 55 → 50 lb sent the PUT and was kept after reload. |

- The figures check by hand. 110 lb is 2 sacks of 55 lb or 2.2 sacks of 50 lb, and To order = ⌈10 − 2.2 − 0⌉ = 8 or ⌈10 − 2 − 0⌉ = 8.
- At phone width the menu options show full labels inside the screen (x 16–344 at 360 px).
- Screenshots:
  - `results/shots/rc2_360_row_long.png`: the long name wrapped, with "55 lb" readable.
  - `results/shots/rc2_360_row.png`: the 50 lb offer.
  - `rc2_{360,390,desktop}_{before,after}.png`.

## R2: To order end to end (pass)

At 360 px touch, as `brewer2`: I ticked RC Phone Pale and tapped **Start an order**.
- **The New order dialog** opened full screen (360×780) with no sideways scroll. It was prefilled with:
  - the long-named supplier;
  - order date today;
  - the 55 lb offer, 8 sacks at $46 (the current price);
  - running total "8 sacks · 440 lb · $368.00".
- **Saved** with reference `[TEST-TEMP] RC2-start` → 201, order 428. The order was saved as on-contract (`off_contract: false`).
- **Back on To order:** "Minimum 10 · on order 8", To order **0**. The API agrees: `on_order_sacks` 8, `to_order` 0.
- **Afterwards:** I cancelled order 428 by exact id → 200.

## Data and cleanup
- **Made:**
  - companies 442 and 443;
  - product 803;
  - offers 1228 and 1229, with prices 592 and 593;
  - lot 841;
  - order 428.
  All are `[TEST-TEMP]`.
- **Cleaned:** order 428 is cancelled, and product 803 and companies 442 and 443 are deactivated. Recheck 1's rows are as I left them.
- **Not mine, left alone:** six open `[TEST-TEMP] P4 a long reference number …` orders (300, 323, 346, 369, 392 and 415). They're on suppliers 306–429, which I didn't create.
- **Settings:** I didn't change any persona's sacks/lb setting.
- **Scripts:** `scripts/rc2_*.js` and `scripts/r2_setup.js`. Ids are in `results/ids.txt` (lines starting `R2`).
