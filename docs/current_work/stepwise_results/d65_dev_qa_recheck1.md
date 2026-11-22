# D65 DEV QA recheck 1

- **Build:** `DEV · db7595e` (ribbon checked). DEV was redeployed and reseeded. Date 2026-11-21, about 13:00–14:20 America/Denver.
- **Personas:** brewer1 for everything, owner for the seed baseline. Settings snapshots were taken for brewer1, brewer2 and owner.
- **Sizes:** desktop 1366×768; phone 360×780 with touch.
- **Rules:** I re-read the brief's rules before starting.

## Result: all six pass-1 gaps are fixed. Two new gaps: 7 (minor), 8 (should-fix)

| Log | Gap | Result |
|---|---|---|
| R1 | 1: Formula only on Water Salts | **Fixed** |
| R2 | 2: "Other manufacturer…" | **Works.** It was **not a real defect in 15e9c12**: my pass-1 test was wrong (see below). |
| R3 | 3: Copy $ grand total row | **Fixed** |
| R4 | 4: Copy Unit `tablets`, no decimals | **Fixed** |
| R5 | 5: All Categories at 360 px | **Fixed** |
| R6 | 6: empty-line summary "sacks" | **Fixed** as decided (new minor gap 7 is next to it) |
| R7 | Regression sweep D3 + D5 | **Pass** (new gap 8 was found here) |
| R8 | Seeded baseline diff | **0 differences**, start → end |

## Gap rechecks

### Gap 1: Formula field: fixed
- **UI:** the Add dialog has a Formula field (and ion fields) only in Water Salts (219). Fruits, Spices, Sugars, Finings, Grain (Base) and Hop have neither. Edit Ingredient also has Formula only on the salt (516), not on fruit 514 or grain 518, and the ingredient pages show "Formula" only for the salt.
- **API** (`formula: "X"`):
  - POST to Fruits, Hops, Finings and Grains, and PUT on fruit 514 and grain 518, all return **422** "formula is only for Water Salts ingredients".
  - Ions on a sugar return **422** "Only a Water Salts ingredient has ion values".
  - `formula: null` and `formula: ""` on a fruit are accepted (201) and stored as `null`. Those are probe rows 520 and 521, since deleted.

### Gap 2: "Other manufacturer…" / "Other maltster…": works, and my pass-1 finding was wrong
**Correction to the pass-1 report.** The lead is right. My pass-1 script decided the dialog had closed by counting `getByRole('dialog')` while the full company list was open over it. An open MUI list hides the dialog from that query, so the count read 0. It was never shown with a screenshot or a check of the dialog's own inputs. **Gap 2 should not have been logged, and certainly not as must-fix.** Without it, pass 1 would have been **pass with gaps** (1 should-fix, 4 minor), not fail.

This time I judged by screenshots and by the dialog's inputs after the list closed. 65 checks, 0 failures:

| Case | Desktop (1366) | Phone (360, touch) |
|---|---|---|
| Add fruit product | ✓ 640 saved with maker "[TEST-TEMP] DEV Supply Co" (547) | ✓ 642 saved with 547 |
| Add grain product ("Other maltster…") | ✓ 641 saved with 547 | ✓ 643 saved with 547 |
| Edit fruit product | ✓ 640 → Aseptic Fruit | ✓ 640 → 547 |
| Edit grain product | ✓ 641 → Rahr | ✓ 641 → 547 |

For every case:
- The full list has 31–32 options and includes my company 547, which hadn't been used in the category. It has **no** company without the manufacturer role (checked against `/api/parties`).
- A "Search companies" box is at the top. For example, "dev sup" leaves only my company; "RAHR" finds Rahr. The current maker and "None" stay pinned in the results.
- **Esc (desktop) or phone Back (360) closes only the list.** The dialog stays, the URL is unchanged, and the product name, Brix low/high, Color and notes are all kept (screenshot `r2_phone_add_grain_after_close.png`).
- After picking, the dialog is still open with every input kept, and Save writes once (one POST/PUT). The API returns the chosen `manufacturer_party_id`.
- Phone scrollWidth stays 360.
- Behavior note: once expanded, the select stays in full-list mode when reopened. That's fine.

### Gap 3: Copy $ grand total: fixed
- **Inventory → Copy** (supplier 547): per-unit rows `Total … 750 tablets 0`, `Total … 10.00 gal 0.00` and `Total … 271.00 lb 0.00` carry no $. A separate `Total value … 624.00` row follows, and 120 + 120 + 84 + 165 + 135 = 624.
- **Orders → Copy:** per-supplier `Total [TEST-TEMP] DEV Supply Co` rows for tablets, gal and lb, with no $. Then `Total [TEST-TEMP] DEV Supply Co value … 584.00`, and the same pair for the overall `Total` / `Total value 584.00`.
- **Grain-only Copy** (Category Base) keeps the grain layout as before: `Grain Maltster Product Category lb Expired lb Sacks $/lb Value Estimated`, with one row `Total 5985.00 110.00 … 1692.00`, which matches the screen (5,985 / 110 / $1,692.00). A Hops-only Copy uses the new layout with `Total value 660.00` on its own row.

### Gap 4: Copy Unit for Tablet: fixed
Inventory Copy: `750 tablets 0` (On hand / Unit / Expired). Orders Copy: `500 tablets`. With the Manufacturer = None filter, the 4 Tablet rows read `600 / 750 / 600 / 600` with Unit `tablets`. The Packs column still shows `1.50` tubs, which is right: packs can be fractional.

### Gap 5: All Categories at 360 px: fixed
`/ingredients?category=all` measures scrollWidth **360**. At phone width it shows Name and On Hand (Notes is dropped), and On Hand is fully visible (screenshot `d5_list_all.png`). Tapping "[TEST-TEMP] DEV Salt Gypsum" opens `/ingredients/516` with its ions (width 360), and Back returns to `?category=all`.

### Gap 6: empty-quantity line summary: fixed as decided
With an offer picked and no quantity typed:

| Line | Summary |
|---|---|
| Strawberry 44 lb pail | `0 pails · 0 lb · $0.00` |
| Whirlfloc T | `0 tubs · 0 tablets` |
| Gypsum bag | `0 bags · 0 lb` |
| SoNature Lime | `0 pails · 0 lb` |
| my tub | `0 tubs · 0 tablets · 0 of 40 tubs` |
| my pail | `0 pails · 0 gal · 0 of 40 pails` |
| grain | `0 sacks` (correct) |

- **Mixed:** a tub with quantity 1 plus a pail with none gives `1 pack · 0 gal · 500 tablets · $80.00 · 1 of 40 packs`.
- **Edit order 317:** clearing the tub gives `8 packs · 10 gal · 271 lb · 0 tablets · $504.00`. Clearing every quantity gives `0 packs · 0 gal · 0 lb · 0 tablets`. Adding an empty bag line still reads in packs.
- Everything was cancelled; no writes.

## New gaps

### Gap 7 · minor · New order with no offer picked yet reads "0 sacks · 0 lb" and "0 of 40 sacks"
- **Path:** New order (desktop), before any offer is picked on the first line.
- **Observed:** before a supplier is picked, the summary reads `0 sacks · 0 lb · $0.00`. After picking my mixed-pack supplier "[TEST-TEMP] DEV Supply Co" (target 40 packs), it reads `0 sacks · 0 lb · $0.00 · 0 of 40 sacks` until an offer is picked.
- **Expected:** neutral wording such as "0 packs", since no line kind is known yet and this supplier's target counts packs.
- **Severity:** minor and cosmetic. It sits next to gap 6, which is fixed exactly as decided (lines with a pail, tub or bag offer).

### Gap 8 · should-fix · API: a Brix value without `low`/`high` keys is accepted and silently clears the stored Brix
- **Path:** `PUT /api/ingredient_products/:id` (also seen on POST), fruit product.
- **Expected:** a malformed feature value is refused (422), the way an unknown feature key already is (`bogus_feature is not a feature`, 422).
- **Observed:** product 648 had Brix low 12.
  - `features: { brix: { value: "12" } }` returns **200** and stores `features: {}`, so the Brix is gone.
  - `{ brix: { lo: "12" } }` does the same.
  - The UI is not affected. Add and Edit send `{ low, high }`, and an Edit that changes only notes keeps low-only Brix (`12.0` → stored `value 12`).
- **How I found it:** my own clean-up script sent the `{value}` shape when it deactivated product 642 (Mango Whole, Brix low 12), and the Brix disappeared. I proved the cause on probe product 648, then put Brix 12 back on 642 and 648 with the correct shape.
- **Severity:** should-fix: silent data loss, but only through a body the UI never sends.

## Regression sweep (R7): pass, 41 checks

### D3 end to end (brewer1)
- **Order 317** from my supplier: grain sack ×2, hop box ×1, sugar bag ×3, fruit pail ×2, tub ×1. It reads `9 packs · 10 gal · 271 lb · 500 tablets · $584.00 · 9 of 40 packs`, the same as pass 1.
- **Receive** validation is unchanged: extract prefilled 91; Brix optional; Brix 5 marked "outside typical"; Brix 7.55, 150 and −2 refused; tubs whole only ("Whole tubs, 0 or more"). One receive POST. On hand: grain 110 lb, hop 11 lb, sugar 150 lb, fruit 10 gal, tabs 500.
- **Half tubs:** 0.5 tub of 500 saved as 250 tablets (on hand 750). 0.5 tub of 333 was refused with "…is counted in whole tablets".
- **To order:** min 3 tubs, 1.5 tubs on hand, 2 to order, marked "Below minimum".
- **Totals:**
  - Inventory screen: 750 tablets / 10 gal / 271 lb and $624.00.
  - Orders tab: per pack name.
  - Manufacturer = None filter: 9 rows, all None; rows add to $651.15, matching `Total value`.
  - Copy: see gaps 3 and 4.

### D5 phone 360 px
- **Widths:** categories 5, 6, 7, 8, 219, 220 and All, fruit product 640, salt ingredient 516, Whirlfloc T 325, orders, To order, Contracts and Totals (both tabs) all measure 360. Copy is reachable.
- **Dialogs:** product (Brix 7.25 refused), ingredient (Mg 1.25 refused), Add lot (Brix 101 refused), Count (10.5 tablets refused), Receive (Brix 5 marked, 0.5 tub refused). In each, Save and Cancel are on screen, the refusal is visible, and **Back closes the dialog on the same URL**.
- **Offer:** the pack note field caps input at 40 characters, and the API refuses 41 (422 "should be at most 40 character(s)"). My checker flags this as "missing refusal", the same harmless artifact as in pass 1.
- **Phone mixed order 318:** `5 packs · 5 gal · 150 lb · 500 tablets · $245.00 · 5 of 40 packs`, and 0.5 tub refused visibly. One POST, cancelled in clean-up.

## Seeded baseline (R8)
- **Start** (`results/seed_baseline_r1_start.json`) and **end** (`results/seed_baseline_r1_end.json`): 14 categories, 110 ingredients, 103 products with offers and prices, and 21 companies, all non-`[TEST-TEMP]`.
- **Diff: 0.**
- Counts at both ends: 29 D65 reference products, 30 offers (26 priced), 7 salts, 10 spices, hops 28 lots / 409.6 lb. Gypsum CaSO₄·2H₂O, Ca 61.5, SO₄ 147.4, $32.00.
- In R2 I picked Aseptic Fruit and Rahr as makers on **my own** products 640 and 641, then set both back to 547. Neither company changed.

## My ids, all `[TEST-TEMP] DEV…`, and end state

| Kind | Ids | End state |
|---|---|---|
| Company | 547 "[TEST-TEMP] DEV Supply Co" (target 40) | **deactivated** |
| Ingredients | 514 fruit, 515 sugar, 516 salt (formula + ions), 517 fining, 518 grain, 519 hop | kept: they have products |
| Ingredients | 520, 521 (R1 probes, no products) | **deleted** (204) |
| Products | 640, 641, 642, 643, 644, 645, 646, 647, 648, 649 | **all deactivated**. Brix 12 restored on 642 and 648 (gap 8). |
| Offers | 1161, 1162, 1163, 1164, 1165, 1166 | priced; left with the deactivated products |
| Lots | 732, 733, 734, 735, 736, 737 | on my deactivated products |
| Orders | 317 PO-1 | received |
| Orders | 318 PO-2 phone | **cancelled** |
| Subcategories | none this time | — |

Destructive steps were done by exact id after reading the row back and checking its prefix. Pass-1 ids are kept for reference in `results/ids_pass1.json`. DEV again holds many other runs' `[TEST-TEMP]` rows; I left them alone.

**Settings:** I never clicked the packs/Total toggle. `board_settings` before (`results/board_settings_before_r1.json`) and after (`…_after_r1.json`) are identical for brewer1, brewer2 and owner. brewer1's settings on this reseed include `ingredients.quantity_display: "packs"`, and they are unchanged.

## Not covered
- A real phone: Chromium emulation, with Back simulated by `history.back()`.
- Gap 2 on build 15e9c12: I didn't re-run it there. The correction above rests on the lead's repeat and on finding the mistake in my pass-1 method (counting dialogs while the list was open).
