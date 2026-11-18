# D60 QA report: Ingredient Library (grains and grain inventory), local

- **Date:** 2026-11-18, about 07:50–08:45 America/Denver
- **Target:** http://localhost:5174 (local only; no `*.fly.dev` touched). Tested through the browser (Playwright) and the API from inside the page. No app source was read.
- **Personas used:** brewer1, brewer2, breweryMgr, owner, floater, splitRole, barMgr, bartender1, office1, breweryDevice, taproomDevice. owner2 was not needed.
- **Sizes:** desktop 1366×768 unless noted; phone 360×780 with touch for I12 and the I13 double-tap run.
- **Verdict:** **fail.** 3 must-fix, 3 should-fix, 8 minor.

## Summary

| # | Severity | Scenario | Gap |
|---|---|---|---|
| 6 | **must-fix** | I13 | On a slow network, double-clicking Save creates **two lots** (Add lot) and writes **the movement twice** (Record movement) |
| 9 | **must-fix** | I20 | A lot whose only movement is its first one (Received/Opening) is **deleted at once with no confirmation**. Its movement goes too, so on-hand drops with no record |
| 12 | **must-fix** | I20 | Deleting a Grains sub-category that has a grain returns **500** (Ecto.ConstraintError). In the UI the dialog stays open with no message |
| 3 | should-fix | I11 | `1,234` is saved as **1.234** without any hint, a 1000× error for anyone who types a thousands separator |
| 4 | should-fix | I11 | Specs keep more decimals than are shown, so the lot's "changed from standard" marks disagree with what is displayed |
| 7 | should-fix | I18 | **Est. OG stays blank** for a recipe with 500 lb of a grain lot at 75 %, so the new OG estimate can't be seen anywhere |
| 1 | minor | I7/I8 | Refusal messages give lb and a raw field name (`quantity lb: …485 lb`) while the dialog shows sacks. The dialog's "On hand" includes expired stock |
| 2 | minor | I10 | Delete company acts at once with no confirmation |
| 5 | minor | I12 | At 360 px the product page header cuts the product name to "Root S…", and the name appears nowhere else on the page |
| 8 | minor | I18 | Grain Bill pickers interleave grain sub-categories with top-level categories and offer depleted lots with no status |
| 10 | minor | I20 | The Convert popup offers impossible results (108.2 % FGDB, 77 000 % FGDB) that the server then refuses. Negative numbers get the wrong message |
| 11 | minor | I20 | A total count over on-hand with every lot expired puts the extra onto an expired lot. A count equal to on-hand leaves no record |
| 13 | minor | I20 | Movements can be dated in the future and already count in today's on-hand |
| 14 | minor | I20 | Changing a lot's sack size changes how its past movements read |

## Gaps

### Gap 6 (must-fix): a double-click on Save writes twice (Add lot, Record movement). Desktop 1366×768, slow network

- **Path:** brewer1 → product `[TEST-TEMP] QA FIFO` (143) with `slow(page)` → Add lot → fill → **double-click Save**. Then Record movement → Used in brewing, 10 lb, Oldest first → **double-click Save**. Then Count → total = on-hand − 5 lb → double-click Save Count.
- **Expected:** exactly one lot, one movement set and one count.
- **Observed:**
  - Add lot: **two `POST /api/ingredient_lots`**, both 201, so two lots: **130 and 131**, both `[TEST-TEMP] DBL-dbl`, 2 sacks each. On-hand went up by 200 lb, not 100.
  - Record movement: **two `POST /api/inventory_movements`**, both 201, so movements **217 and 218** of −10 lb each (−20 lb in total).
  - Count: two POSTs, but the second returned `[]` because stock already matched, so only one adjustment (219). This was safe here only because a count sets an absolute value.
  - Movements went from 11 to 16 and lots from 3 to 5. The API, the history table and the Grain Bill lot picker all list the duplicates (two identical "Root Shoot · [TEST-TEMP] DBL-dbl" options).
- **Phone double-tap (360 px, touch):** one lot (132), one movement (221) and one count (222). The second tap landed after the dialog had already reacted, so the phone check passed, but desktop double-click did not.
- **Repro:** `node scripts/i13.js dbl` (Save isn't disabled while the request is in flight).

### Gap 9 (must-fix): a lot is deleted with its movement, with no confirmation. Desktop

- **Path:** brewer1 → product 144 → click lot `[TEST-TEMP] H-D` (136; Received 4 × 50 lb = 200 lb, no other movements) → **Delete**.
- **Expected (brief):** a lot with movements can't be deleted, and movements can't be edited or deleted. At minimum, a confirmation before stock disappears.
- **Observed:** `DELETE /api/ingredient_lots/136` → **204** on the first click, with no confirmation. The lot and its "Received 200 lb" movement are gone, and product on-hand dropped from 334.75 to 134.75 lb with no movement or count to explain it. A lot that also has later movements is refused (`422 "This lot has movements after its first; correct it with a movement or a count"`), so the rule is really "only the first movement".
- **Risk:** the same Delete button appears on every lot with only its Opening amount or Received movement, for example `[SEED] Rahr 2-Row A/B` (not tried, per the rules). One mis-click deletes 3–10 sacks of real stock and its history.
- **Repro:** `node scripts/editlot.js brewer1 144 136 --delete`

### Gap 12 (must-fix): deleting a grain sub-category that has a grain returns 500. Desktop

- **Path:** breweryMgr (also brewer1 by API) → Categories → Grains → my child `[TEST-TEMP] QA CatDel` (90) containing grain `[TEST-TEMP] QA Grain` (177), which has one maltster product (145) → **Delete Category** → Delete.
- **Expected:** a refusal such as "in use".
- **Observed:** `DELETE /api/ingredient_categories/90` → **500** with an `Ecto.ConstraintError` HTML page. In the UI the confirmation dialog stays open with no message, and the page logs an uncaught error ("Request failed with status code 500"). Nothing was deleted. Brewery employees see Delete Category on every category, including Base…Roasted.
- **Repro:** `node scripts/catdel.js`, then `node scripts/catdelui.js`. Screenshot: `results/gap12_catdelete.png`.

### Gap 3 (should-fix): `1,234` is read as 1.234 without any hint. Desktop

- **Path:** brewer1 → Edit maltster product → Protein `1,234` → Save.
- **Expected:** following the brief, `,` is a decimal point, but a value people commonly type as a thousands separator should at least show what will be stored ("= 1.234").
- **Observed:** saved as **1.234** with no helper text. `1.234,5` and letters are refused correctly. The same parsing applies to lb boxes, so "Received 1,234 lb" would store 1.234 lb.
- **Repro:** `node scripts/i11.js`

### Gap 4 (should-fix): stored decimals differ from what is shown, and the "changed" marks disagree. Desktop

- **Path:** brewer1 → Edit product 142: Color `2.789`, Extract `80.16`, Protein `11.456` → Save. Then edit lot 126 and type Color `2.79`.
- **Expected:** fixed decimals (color 2, extract 1), and "changed from standard" only when the displayed values differ.
- **Observed:**
  - The API stores `2.789`, `80.16` and `11.456`, while the page shows 2.79, 80.2 and 11.46.
  - The lot list then marks **"Color 2.79"** as changed, although the standard also reads **2.79 °L**.
  - The list does *not* mark Extract (lot 80.1 vs standard 80.2 shown) or Protein (11.50 vs 11.46), while the lot dialog flags all three.
- **Repro:** `node scripts/dec.js`, then `node scripts/editlot.js brewer1 142 126 "Color (°L)=2.79"`

### Gap 7 (should-fix): Est. OG blank. Desktop

- **Path:** brewer1 → new `[TEST-TEMP] QA Brand` → recipe v1.0 (10 bbl, efficiency 75 %) → Grain Bill → 2-Row, lot "Rahr · [TEST-TEMP] B2-A" (80.1 % FGDB), 500 lb. Use was also set to `mash`.
- **Expected:** an Est. OG (about 1.045 at 75 %).
- **Observed:** Est. OG and Est. IBU are empty in the brand's recipe list, and no OG appears on the recipe page. `GET /api/recipes/20` has no estimate field. I couldn't find another place where the estimate appears, so the "efficiency as a percentage" change couldn't be verified. Saving the grain bill did not change on-hand (485 lb before and after), which is correct.

### Gap 1 (minor): refusal messages in lb with raw field names. Desktop

- Oldest first with expired stock gives `quantity lb: is more than the 250 lb on hand in lots that aren't expired (200 lb is in expired lots; pick one by hand to use it)`, while the dialog says **"On hand: 9 sacks"**, which includes the expired 4 sacks.
- Over on-hand gives `quantity lb: is more than the 485 lb on hand`, while the dialog shows "8 sacks 45 lb".
- The content is right; the units and the `quantity lb:` / `counted lb:` / `moisture pct:` prefixes are not user language.

### Gap 2 (minor): Delete company has no confirmation. Desktop

- owner → Companies → `[TEST-TEMP] QA Malt Co renamed` → Delete deleted it immediately (204). Products and lots ask for confirmation first.

### Gap 5 (minor): product name truncated at 360 px

- `/ingredients/products/143` at 360 px: the header shows "Root S…" (the 404 px name in an 89 px box), and the page body has no name. Dialog titles do show the full name.

### Gap 8 (minor): Grain Bill pickers. Desktop

- Category order is "Grains, Base, Future Ingredients, Crystal/Caramel, Hops, Kilned, Yeast Strains, Specialty, Fruits, Roasted…": children and top-level categories are interleaved by sort order.
- The Lot picker lists depleted lots (F-OLD, F-NEW at 0 lb) with no status or quantity. Two products of the same maltster and grain are told apart only by lot #.

### Gap 10 (minor): Convert popup range checks. Desktop

- 50 PPG → "Stored as 108.2 % FGDB"; 120 % as-is → 125 %; 77 % as-is at moisture 99.9 → **77 000 % FGDB**. Use stays enabled, the form accepts the value with "entered as 50.0 PPG", and Save then fails with `extract fgdb: must be between 0 and 100`.
- Negative values (`-1` SRM, `-16` °WK) are blocked, but with "Use digits and one , or . for the decimal point".
- Moisture `150` typed directly is only refused by the server.
- The formulas themselves are correct:
  - 3.0 SRM → 2.78 °L
  - 5.91 EBC → 2.78 °L
  - 37 PPG → 80.1
  - 46.214 PPG → 100
  - 77 as-is at 4 % moisture → 80.2
  - 300 °WK → 90.3
  - moisture 100 is refused in the popup

### Gap 11 (minor): count edges. Desktop

- Product 142 with its only lot expired: Count total 500 lb with 485 on hand → +15 lb onto the **expired** lot, with no prompt. With an available lot present, the overage correctly skipped the expired newest lot (+10 lb onto lot 131, not the expired 132).
- A total count equal to on-hand returns 201 `[]`, so there's no trace that a count was done.
- A count of 0 with only expired stock is refused clearly ("count by lot instead").

### Gap 13 (minor): future-dated movements. Desktop

- Record movement with Date 2027-01-01 saves (201) and reduces today's on-hand immediately. The API also accepted 2027-05-01.

### Gap 14 (minor): editing a lot's sack size changes past movements. Desktop

- Lot 136 was received as 4 × 50 lb. After changing Sack size to 55, the lot and its **Received** movement read "3 sacks 35 lb". The lb total was unchanged.

## Scenarios

| # | Result | Notes |
|---|---|---|
| I1 | PASS | 5 groups (22/10/3/4/5 = 44). Search "pils" → 4, "weyer" → 15. Category Kilned → 3; maltster Rahr → 4; supplier Root Shoot → 12; on hand only → 1; filters combine. |
| I2 | PASS | 3.0 SRM → 2.78 °L "entered as 3.0 SRM"; 37.0 PPG → 80.1 "entered as 37.0 PPG"; as-is with no moisture: Use disabled with a message; 300 °WK → 90.3 °Lintner. POST body matches. Typing over a converted value clears "entered as" (no stale value). |
| I3 | PASS | $48.50 current, $51.00 dated 2026-12-18 not current; history lists both with $/lb ($0.8818, $0.9273). Same date: the later entry wins. 99 999 999 is refused. |
| I4 | PASS | brewer2: Opening 12 sacks = 660 lb. Moisture 5,0 then 5,5 → lot "Moisture 5.50", standard stays 4.20. |
| I5 | PASS | Used 2 sacks 10 lb → 9 sacks 45 lb. lb → 540 lb (quantity box becomes "Quantity (lb)"). Saved by `PUT /api/me/board_settings/ingredients`; brewer2 is unaffected. |
| I6 | PASS | Used 5 sacks Oldest first → F-OLD −3 (Depleted), F-NEW −2 → 8 sacks: two movements. Picking F-NEW by hand changes only F-NEW. |
| I7 | PASS (gap 1) | Expired F-MID is skipped; on-hand "· 4 sacks expired"; with only expired stock, Oldest first is refused with a clear text; picking the expired lot by hand works; set back to Available. |
| I8 | PASS (gap 1) | Loaned out with no partner: the UI blocks it with no request sent, and the API refuses traded/loaned with no party (422). With [SEED] Mountain Brewing → saved. 20 sacks → refused with the on-hand. |
| I9 | PASS | breweryMgr: total 6 sacks (on hand 8) → −2 sacks from F-MID (oldest non-expired). By lot F-MID 8 / F-NEW 0 → +7 / −5, F-NEW Depleted. History shows "Count adjustment". |
| I10 | PASS (gap 2) | Add (maltster + supplier), edit name and notes, delete (204). Rahr delete → "This company is in use; deactivate it instead" (422); Rahr unchanged. |
| I11 | PASS (gaps 3, 4) | `5,5` → 5.5. `1.234,5`, `abc`, `-1`, `1e2`, `5..2` are refused with a message and Save disabled; no request sent. |
| I12 | PASS (gap 5) | 360 px: list shows cards; `scrollWidth` = 360 on the list, product page, Companies and Categories. Every dialog is full screen (360×780) with Save reachable: add/edit product, Convert, add grain, Add lot, Record movement, Count (total and by lot), Add offer, Add price, edit lot, add company. Product page tables scroll inside their cards; Add price and Price history work by tap. |
| I13 | **FAIL** | Gap 6: double-click duplicates lots and movements. The count was not duplicated; the phone double-tap was not duplicated. |
| I14 | PASS | floater, splitRole, owner: nav item, list, product page, all four action buttons, a 1 lb Used movement saved (201), Companies and Categories open. |
| I15 | PASS | bartender1, office1, barMgr: no nav item; `/ingredients`, `/ingredients/companies`, `/ingredients/categories`, `/ingredients/products/2` all go Home; 25 routes (GET/POST/PUT/DELETE on products, lots, movements, count, parties, offers, prices, categories, ingredients, feature types, board setting) → 403. |
| I16 | PASS | breweryDevice, taproomDevice: the same routes → 403; the four pages say "Not available on a shared device". |
| I17 | PASS | Grains shows Base, Crystal/Caramel, Kilned, Specialty, Roasted; Field Definitions empty (no Origin/Maltster). Added, renamed and deleted `[TEST-TEMP] QA Smoked` (89). |
| I18 | PARTIAL | The picker lists all 38 grains from every child; lot labels read "maltster · lot #". No recipes existed, so I made my own `[TEST-TEMP]` brand and recipe (no [SEED] recipe touched). OG estimate not visible (gap 7); see also gap 8. |
| I19 | PASS | Hops (6) and Yeast Strains (4) list and open as before; the hop lot dialog shows Alpha acid (%), yeast shows Attenuation (%). |
| I20 | FAIL | Open hunt: gaps 9–14. Also checked and correct: equal received dates (first entered lot first: −100.5 then −0.5); hand-pick over the lot's on-hand refused; 0 and negative quantities refused; lots in another product refused in a by-lot count; mixed 50/55 lb lots switch the quantity box to lb only; list, product page and API on-hand agree (135.75 lb / 2 sacks 25.75 lb / 135.7499); product delete with lots refused with a message; Add category/company buttons match API permission for brewers, floater and splitRole. |

## Data I made, and cleanup

All names start with `[TEST-TEMP]`. Each one was read back and its name checked before any delete, deactivate, Expired or count, always by exact id.

| Kind | Ids | End state |
|---|---|---|
| Maltster products | 142 QA Pale (Rahr 2-Row), 143 QA FIFO (Root Shoot 2-Row), 144 QA Hunt (Weyermann 2-Row) | **deactivated** |
| Maltster product | 145 QA CatDel product | deleted |
| Supplier offers | 141 (on 142), 142 (on 143), 143 and 144 (on 144) | **deactivated** |
| Prices | on offer 141: $48.50, $51.00 (2026-12-18), $49.00, $0.00 (first id 19) | remain (the offer is inactive) |
| Lots | 126 B2-A (by brewer2), 127 F-OLD, 128 F-NEW, 129 F-MID, 130 and 131 DBL-dbl (duplicate pair from gap 6), 132 DBL-tap, 133 H-A, 134 H-B, 135 H-C | remain (they have movements); all set back to Available or Depleted, none left Expired |
| Lot | 136 H-D | deleted through the UI (that is gap 9) |
| Movements | ids 201–236 on products 142/143/144 (my lots only), including the 1 lb test movements by floater, splitRole and owner | remain (they can't be deleted) |
| Company | 23 QA Malt Co | deleted (I10) |
| Categories | 89 QA Smoked; 90 QA CatDel | deleted |
| Grain | 177 QA Grain | deleted |
| Brand, recipe | brand 5572 QA Brand, recipe 20, recipe ingredient 30 | deleted |

- I moved no stock on [SEED] lots or reference products, and edited, deactivated or deleted no reference product, reference company or [SEED] row. The Rahr delete attempt was refused, as the brief expected.
- A loan used `[SEED] Mountain Brewing` as the partner on my own lot.

**Sacks/lb setting:** before the run, all six Brewery-capable personas I opened (brewer1, brewer2, breweryMgr, owner, floater, splitRole) had an empty `board_settings`, which shows "Sacks + lb". Only brewer1 was changed (lb for I5). It was set back to **Sacks + lb**, which is what brewer1 now sees. The API stores it as `{"ingredients":{"quantity_display":"sacks"}}`, not the original empty `{}`: sending `{}` keeps the value and `null` is refused (422 "can't be blank"), so the stored value can't be cleared through the API. The other personas were never changed and are still `{}`.

## What I couldn't test

- **A price dated "today" late in the Colorado evening vs UTC:** the server clock can't be moved from the browser. I tested only today's date (2026-11-18, both zones the same day), same-date ties and future dates.
- **The OG estimate formula:** no estimate showed anywhere (gap 7).
- **Deleting a [SEED] lot or a reference product or category** to confirm gaps 9 and 12 on real data: not allowed. Both were reproduced on `[TEST-TEMP]` rows only.
- **Recipe grain lots on a [SEED] recipe:** none existed. I used my own recipe and deleted it.
- **Email, push and service worker:** out of scope (local).
- **owner2:** not used.

### Other observations (not counted as gaps)

- A $0.00 price is accepted and becomes current.
- Movements of 0.0001 lb are accepted by the API (the UI blocks them) and show as "−0 lb".
- A new Grains child gets sort order 8 instead of 5.

Scripts are in `scripts/`. Phone screenshots are `results/phone_*.png`.
