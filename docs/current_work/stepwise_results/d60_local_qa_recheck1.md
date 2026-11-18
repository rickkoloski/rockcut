# D60 local QA: recheck 1

- **Date:** 2026-11-18, about 10:37–11:00 America/Denver, against http://localhost:5174 after the reseed.
- **Rules:** same as `BRIEF.md`. I tested through the browser and the in-page API only, and did not read the app source.
- **Personas used:** brewer1, brewer2, breweryMgr, owner, bartender1, office1, barMgr, breweryDevice, taproomDevice.
- **Sizes:** desktop 1366×768, plus 360×780 with touch for the product-name check.
- **Verdict: pass with gaps.** All 14 first-pass gaps are closed. There are 2 new **minor** gaps (15, 16) and no new must-fix or should-fix. R1–R9 all passed.

## First-pass gaps

| Gap | Was | Now | Evidence |
|---|---|---|---|
| 6 | must-fix: double-click wrote twice | **closed** | R1: slow network + double-click, and normal network + triple-click, on add product, add offer, add price, Add lot, Record movement and Count each sent **1 request**. The API had 1 product, offer, price, lot, movement and count each time, and the history had 3 rows. R9 found the same on edit product, edit lot, edit offer, add company, add sub-category, and pressing Enter three times in Record movement. |
| 9 | must-fix: lot deleted with no confirm | **closed** (see new gap 15) | Confirm: "Delete lot [TEST-TEMP] R2-A? Its Received 3 sacks (150 lb) goes too." Cancel kept the lot (API 200, row present); Delete removed it (204 → 404). In lb: "Its Opening amount 50 lb goes too." A lot with later movements, a "Counted, no change", or a recipe that uses it → 422 with a message shown in the dialog. |
| 12 | must-fix: 500 on category delete | **closed** | A Grains child holding a grain gets "This category has grains; move them first" in the dialog, and nothing is deleted. A parent with a child gets "This category has sub-categories; move or delete them first". Empty categories delete (204). No 500 anywhere. |
| 3 | should-fix: `1,234` read as 1.234 | **closed** | Add lot `1,234` lb → `1234`; `12,345.5` → `12345.5`. `5,2`, `1,23`, `1,2345`, `1.234,5`, `12,34,567`, `,5` → "Use . for the decimal point"; `-1` → "Enter 0 or more"; `abc` → "Use digits and one . for the decimal point". Save stays disabled and no request is sent. Checked in a spec field (Protein, Diastatic power), the movement lb and Sacks boxes, price, offer sack size, lot sack size, total count and by-lot count. The API refuses `"5,2"` and `"1,234"` sent raw (422). |
| 4 | should-fix: stored decimals ≠ shown | **closed** | `2.789` / `80.16` / `11.456` / `4.444` are stored and shown as 2.79 / 80.2 / 11.46 / 4.44, rounded half-up (80.25 → 80.3). Lot list and dialog marks agree on all 5 lots: a new lot copying the standard has no marks; Color `2.790` is not marked; Protein 11.5 is marked as "Protein 11.50" (standard 11.46) in both. |
| 7 | should-fix: Est. OG blank | **closed** | 500 lb at 80.1 % FGDB, 10 bbl, 75 % → **Est. OG 1.045** on the brand's recipe list and in the recipe header (API `est_og` = 1.0448). Changes: 80 % → 1.048; 0.75 % → 1.000, so efficiency is read as a percentage; back to 75 % → 1.045. |
| 1 | minor: messages | **closed** | Sacks: "That's more than the 1 sack on hand in lots that aren't expired (plus 3 sacks 35 lb in expired lots; pick that lot to use it)". lb: the same sentence with 50 lb / 185 lb. Dialog "On hand: 50 lb · 185 lb expired (pick that lot to use it)". Hand-picked lot: "That's more than lot [TEST-TEMP] R6-A has on hand (1 sack)". Count: "The count is 235 lb under on-hand, more than the 50 lb in lots that aren't expired; count by lot instead". |
| 2 | minor: company delete with no confirm | **closed** | "Delete [TEST-TEMP] RC Co? A company in use can't be deleted; make it inactive instead." Cancel keeps it; Delete → 204. |
| 5 | minor: name cut at 360 px | **closed** | The full name "Weyermann [TEST-TEMP] R1D product (Pilsner)" appears as a heading in the page body, and the page is 360 px wide (`rc_phone_product.png`). |
| 8 | minor: Grain Bill pickers | **closed** | The category list shows Grains then Base…Roasted, then the other top-level categories. Lots read "Weyermann · [TEST-TEMP] R4-1234 · 24 sacks 34 lb · Available" or "… · Expired". A depleted lot is left out of a new ingredient's picker but listed ("· 0 lb · Depleted") when editing the ingredient that already uses it. |
| 10 | minor: Convert popup ranges | **closed** | 50 PPG → "108.2 % FGDB is out of range: Extract must be between 0 and 100", Use disabled. Also refused with the same kind of message: 77000 %, 125 %, 738225.87 °L, 3747.9 °L and 28575.7 °Lintner. Negatives → "Enter 0 or more"; `3,0` → "Use . for the decimal point". Moisture 150 in the form → "Moisture must be between 0 and 100", Save disabled. Valid conversions are unchanged: 3.0 SRM → 2.78, 5.91 EBC → 2.78, 37 PPG → 80.1, 77 % as-is at 4 % moisture → 80.2, 300 °WK → 90.3. |
| 11 | minor: count edges | **closed** | A total count equal to on-hand (13,814.5 lb) records "Counted, no change" (0 lb) on the newest non-expired lot. A by-lot count equal to a lot's on-hand records "Counted, no change" on that lot. A total count of 250 lb with every lot expired → "Every lot is expired; count by lot instead" (422). |
| 13 | minor: future dates | **closed** | Record movement, Count and Add lot have the date picker `max` set to 2026-11-18. Typing tomorrow is blocked by the browser ("Value must be 11/18/2026 or earlier.") and no request is sent. The API refuses a future movement, count or lot received date: "The date can't be in the future". Add price still allows future dates, as intended. |
| 14 | minor: sack size rewrote history | **closed** | With later movements, the Sack size box is disabled ("Fixed: the lot has movements after its first"), and the API refuses with the reason. A lot with only its Received movement can still change it (209: 50 → 55 lb, 200). |
| Item 14 | 0.01 lb, sort order, $0 | **mostly**, see gap 16 | The API refuses 0.001 lb ("Enter a quantity of at least 0.01 lb …") and accepts 0.01 lb. A new Grains child gets sort order 5, after Roasted (4). $0.00 prices were not retested (unchanged per Matt). |

## New gaps

### Gap 15 (minor): Delete is still offered on lots that can't be deleted, and its confirm contradicts itself. Desktop

- **Path:** brewer1 → product 193 → click lot `[TEST-TEMP] R1D-L1` (205; Received, then Used and a count) → Delete.
- **Expected (RECHECK item 2 / R2):** for a lot with a later movement, no Delete is offered, or it is refused cleanly.
- **Observed:**
  - Delete is enabled. The confirm reads "Delete lot [TEST-TEMP] R1D-L1? It has movements after its first, so it can't be deleted; correct it with a movement or a count." It still shows an active **DELETE** button.
  - Clicking that button sends `DELETE /api/ingredient_lots/205` → 422, and the lot dialog shows the same sentence.
  - The same happens for a lot whose only later movement is a "Counted, no change" (208).
  - For a lot a recipe uses (212), the confirm says "Its Opening amount 1 sack (50 lb) goes too." and the API then refuses with "A recipe uses this lot, so it can't be deleted". The confirm doesn't know about the recipe rule.
- Nothing is lost. The UI offers an action it already knows will fail.
- **Repro:** `node scripts/r2.js brewer1 193 205 delete`, `… 208 delete`, `… 212 delete`

### Gap 16 (minor): quantities under 0.01 lb get a misleading message. Desktop

- **Path:** brewer1 → product 194 → Record movement → lb `0.001`.
- **Expected:** a hint under the box such as "at least 0.01 lb" (the API's own wording).
- **Observed:** there is no hint under the box and Save is enabled. Clicking Save shows "Enter the quantity" although a quantity was entered, and no request is sent.
- **Repro:** `node scripts/move.js brewer1 194 "Used in brewing" - - 0.001`

## Scenarios

| # | Result | Checks |
|---|---|---|
| R1 | PASS | 12: six dialogs × (slow double-click, fast triple-click), each one write, with the API and the history matching |
| R2 | PASS (gap 15) | 9: confirm names the lot and quantity in sacks and in lb; Cancel keeps; Delete removes; later movement, "Counted, no change" and recipe use are refused |
| R3 | PASS | 6: refused with grains; refused with sub-categories; message in the dialog; empty child and parent deleted; no 500 |
| R4 | PASS | 25 input and field combinations |
| R5 | PASS | 8 |
| R6 | PASS | 7 (Est. OG on the list and header, three efficiency changes, recipe-used lot can't be deleted) |
| R7 | PASS | 30 (messages in sacks and lb, company confirm, 360 px name, pickers, 25 convert inputs, 3 plain fields) |
| R8 | PASS (gap 16) | 14 |
| R9 | PASS | 40 |

### R9 hunt: what I checked and found correct

- **Save lock:** the dialogs I checked in R9 (see gap 6 above) each sent one write and closed. After a refused save (over on-hand), Save is enabled again, a corrected retry saves once, and a reopened dialog starts empty with no stale error.
- **Number rules:** checked in every D60 number box (see R4 / gap 3).
- **Confirm wording:** checked in both sacks and lb (gap 9 row).
- **Access:**
  - bartender1, office1, barMgr and both shared devices get 403 on `/api/formulas/execute`, ingredient products, lots, movements, parties and recipes.
  - brewer2 gets 200 on those reads (and on `/api/formulas/execute`); an invalid movement gets 422 (validation, not 403).
- **Grains list:** 46 products in five groups (24/10/3/4/5), my two included.
- Nothing that worked in the first pass broke.

## Data I made, and cleanup

All names start with `[TEST-TEMP]`. Each row was read back and its name checked before any delete, deactivate, Expired or count, by exact id.

| Kind | Ids | End state |
|---|---|---|
| Maltster products | 193 R1D product, 194 R1T product (Weyermann Pilsner) | **deactivated** |
| Supplier offers | 192 (on 193), 193 (on 194) | **deactivated** |
| Prices | one $40.00 on each offer | remain (the offer is inactive) |
| Lots | 205 R1D-L1, 206 R1T-L1, 208 R2-B, 209 R4-1234, 210 R4-12345, 211 R5-A, 212 R6-A | remain (they have movements); all Available or Depleted, none left Expired |
| Lot | 207 R2-A | deleted in R2, as the test intended |
| Movements | ids 351–370 on products 193/194, including 368 (0.01 lb, API) and 369/370 (R9) | remain (they can't be deleted) |
| Companies | 30 RC Co, 31 R9 Co | deleted |
| Categories | 98 RC CatDel, 99 RC Parent, 100 RC Child, 101 R9 Cat | deleted |
| Grain | 182 RC Grain | deleted |
| Brand, recipe | brand 5727 RC Brand, recipe 25, recipe ingredient 36 | deleted |

- I moved no stock on [SEED] lots or reference products, and touched no reference product, company or [SEED] row.
- A loan attempt named `[SEED] Mountain Brewing` as the partner on my own lot. It was refused (over the lot's on-hand), so nothing was saved.

**Sacks/lb setting:** before the recheck, all six Brewery-capable personas had an empty `board_settings` ("Sacks + lb"). Only brewer1 was changed, to lb for the R7 messages and confirm. It was set back to **Sacks + lb**, which is what brewer1 sees. As in the first pass, the API stores this as `{"ingredients":{"quantity_display":"sacks"}}` because it can't be cleared to `{}`: `null` → 422 and there is no DELETE route. The other five are unchanged (`{}`).

## What I couldn't test

- **A price dated "today" late in the Colorado evening vs UTC:** I can't move the server clock.
- **Deleting a [SEED] lot or reference category:** not allowed. All delete rules were checked on `[TEST-TEMP]` rows.
- **Email, push and service worker:** out of scope.
