# D65 DEV QA — recheck 2

- **Build:** `cec1228` (ribbon read: `DEV · cec1228`), https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev
- **Date:** 2026-11-21 (America/Denver)
- **Personas:** `brewer1` (all writes), `owner` (seed baselines), `brewer2` and `owner` (settings read only)
- **Viewports:** desktop 1366×768, phone 360×780 with touch (Chromium emulation)
- **Verdict: pass with gaps.** Gaps 8 and 7 are fixed. One new minor gap (9). The seeded data didn't change.

| # | What | Result |
|---|---|---|
| R1 | Gap 8: feature value shapes | **PASS, fixed** (80 checks) |
| R2 | Gap 7: summary before any line has an offer | **PASS, fixed** (32 checks); new minor gap 9 |
| R3 | Regression sweep: D3, plus the UI's Brix and extract editing | **PASS** (33 checks) |
| R4 | D2 seeded baseline diff | **PASS**: 0 differences, start vs end |

DEV was reseeded, so my recheck 1 rows were gone (product 640 → 404, company 547 missing). I set everything up again under the same `[TEST-TEMP] DEV` names. Recheck 1's ids are kept in `results/ids_recheck1.json`.

## R1: gap 8, fixed

Every bad shape returned a 422 with a clear message. After each one I read the row back: it was unchanged. On products, the `lock_version` didn't move either. On a create, no row was made. Scripts: `scripts/r2_g8a.js`, `r2_g8b.js`, `r2_g8c.js`. Output: `results/r2_g8a.out`, `r2_g8b.out`, `r2_g8c.out`.

**Product Brix (a range), on create (POST) and edit (PUT):**

| Sent | Result |
|---|---|
| `{value}`, `{lo}`, `{}`, `{low,high,extra}`, `{value,low}` | 422 "Brix takes low and/or high" |
| a number `7`, a string `"7"`, an array | 422 "Brix is a range: give low and high" |
| an unknown feature `bogus` | 422 "bogus is not a feature" |
| `extract_fgdb` on a fruit product | 422 "Extract doesn't apply to this category" |
| `{low,high}`, `{low}` only, `{high}` only | 201/200, stored as sent |
| `features` key left out, or `features: {}` | 200, **Brix kept** |
| `brix: null`, both ends `""`, both ends `null` | 200, Brix cleared (`features: {}`) |

**Extract on a sugar product (one value):**
- `{low}`, `{}`, `{value, bogus}`, `{low,high}`, `{value, value_high}` → 422 "Extract takes one value". POST is refused the same way.
- Brix on a Dry sugar product → 422 "Brix is entered on Liquid sugar lots, not on the product".
- `{value}` and `{value, entered_value, entered_unit}` → 200.

**Ions on a salt ingredient (PUT and POST):** an ion sent as `{value}`, `{low,high}`, `{}` or an array → 422 ("Calcium is not a number" and so on). Ions and formula were unchanged, and no ingredient was created. A plain string ion (`"2.5"`) saves.

**Lot create and edit** (fruit lot, and a lot of my Liquid sugar product 818):
- Brix `{low}`, `{low,high}`, `{}`, `{value, bogus}` or `{value, value_high}` → 422 "Brix takes one value". No lot was made, and on edit the stored lot was unchanged.
- An unknown feature → 422 "bogus is not a feature".
- Extract on a Liquid sugar lot sent as `{low}`, `{}` or with an unknown key → 422 "Extract takes one value", on both create and edit.
- `{value}` → 201/200.
- Leaving `features` out, or sending `features: {}`, keeps the lot's Brix. `brix: null` clears it.
- Editing a Liquid sugar lot's Brix with extract left out keeps extract 78.5.

**Receive into a new lot** (my order 362): I captured the UI's own Receive request without sending it. I then sent it with each bad shape in the allocation's `features`:
- `{low}`, `{low,high}`, `{}` or an unknown key → 422 "Brix takes one value". An unknown feature → 422. Extract on fruit → 422.
- Each time, no lot was made and the order stayed open.
- The real UI Receive with Brix 7.2 then went through once: lot 841 stored 7.2 and 10 gal.

**For information, not gaps:**
- A plain number for a one-value feature is accepted and stored as that value: sugar extract `88`, and lot Brix `7.5` (lot 840). The decision only restricts maps, so I read this as intended.
- In recheck 1, my clean-up wiped Brix on a product. This time I deactivated 11 products with `features` left out, and all kept their features.

## R2: gap 7, fixed

Script `scripts/r2_g7.js`, output `results/r2_g7.out`. Desktop and 360 px gave identical text, and the 360 px page never scrolled sideways (`scrollWidth` 360).

| State | Summary |
|---|---|
| New order, no supplier | `0 packs · 0 lb · $0.00` |
| New order, my mixed-pack supplier (target 40), no offer (one or two empty lines) | `0 packs · 0 lb · $0.00 · 0 of 40 packs` |
| …then a pail offer is picked, no quantity | `0 pails · 0 gal · $0.00 · 0 of 40 pails` (gap 6 wording) |
| …a pail and a tub offer, no quantities | `0 packs · 0 gal · 0 tablets · $0.00 · 0 of 40 packs` |
| New order, my sack-only supplier (`[TEST-TEMP] DEV Sack Co`, target 40), no offer | `0 sacks · 0 lb · $0.00 · 0 of 40 sacks` (D61) |
| …sack offer, then 3 sacks | `0 sacks …` → `3 sacks · 150 lb · $120.00 · 3 of 40 sacks` |
| Seeded Aseptic Fruit (no target), no offer → Strawberry picked; then **Cancel** | `0 packs · 0 lb · $0.00` → `0 pails · 0 lb · $0.00` |
| Edit my open mixed order (1 tub): add a line, remove the tub line so only an empty line is left | `1 tub · 500 tablets · $80.00 · 1 of 40 tubs` → `0 packs · 0 lb · $0.00 · 0 of 40 packs` |
| Edit my open sack order (2 sacks), same steps | `2 sacks · 100 lb · $80.00 · 2 of 40 sacks` → `0 sacks · 0 lb · $0.00 · 0 of 40 sacks` |

Every Edit was cancelled, so nothing was written (0 writes).

### GAP 9 (minor, new): a line with no offer labels its fields "Sacks" and "$ / sack"
- **Path:** Purchasing → New order (or Edit order → Add line). Before an offer is picked, at desktop and 360 px.
- **Expected:** the empty line's fields name packs generically, in line with gap 7's "0 packs". Or the quantity field is disabled until an offer is picked.
- **Observed:**
  - The empty line's fields are "Sacks" and "$ / sack" for every supplier: none, my mixed-pack supplier, my sack-only supplier, and the seeded Aseptic Fruit.
  - The field takes input. I typed 3 into "Sacks" and the summary stayed `0 packs · 0 lb · $0.00`, with Save disabled.
  - After I picked a tub offer, the field became "Tubs" = 3, and the summary read `3 tubs · 1,500 tablets · $240.00 · 3 of 40 tubs`. Nothing was saved (I cancelled).
- **Repro:**
  1. New order.
  2. Pick `[TEST-TEMP] DEV Supply Co` and don't pick an offer.
  3. The line shows "Sacks" and "$ / sack".
  4. Type 3, then pick a tub offer: you now have 3 tubs.
- **Size:** desktop and 360 px (screenshot at 360: the empty line under "0 packs · 0 lb · $0.00 · 0 of 40 packs" reads "Sacks", "$ / sack").
- **Severity:** minor. The label changes as soon as an offer is picked, and the summary and Save stay right. But the label is wrong for non-grain suppliers, and a number typed as "sacks" quietly becomes tubs or pails.

## R3: regression sweep

**D3 end to end** (my order 365 "[TEST-TEMP] DEV PO-1", from my supplier):
- **Order:**
  - Lines: 2 sacks Pils (55 lb), 1 box Citra (11 lb), 3 bags Cane Dry (50 lb), 2 pails Mango (5 gal) and 1 tub Tabs (500 tablets, "2 lb").
  - Summary: `9 packs · 10 gal · 271 lb · 500 tablets · $584.00 · 9 of 40 packs`. This adds up.
  - One POST.
- **Receive:**
  - Extract was prefilled at 91.
  - Fruit Brix is optional: I left it empty and the lot stored `{}`.
  - The fruit line offered my existing lots or "New lot #", and I picked New.
  - Tubs 0.5 and 1.5 were refused ("Whole tubs, 0 or more"), with Receive disabled.
  - One receive POST made five lots, 842–846: 110 lb, 11 lb, 150 lb (extract 91), 10 gal and 500 tablets. Unit costs were 0.7636, 15, 0.9, 12 and 0.16. The order is received.
- **Half tubs (Add lot):**
  - 0.5 tub of 500 was accepted and stored as 250.
  - 0.5 tub of 333 was refused: "… is counted in whole tablets", with Save disabled.
  - On hand is 750 tablets.
- **Minimum:** 3 tubs, saved with one PUT. The product shows "Below minimum".
- **To order:** my Tabs T shows 1.5 tubs on hand, minimum 3, 1 on order (my open PO-G7) and 1 to order.
- **Totals → Inventory** (my supplier):
  - Rows: 750 tablets $120.00 est., 35 gal $420.00 est., 110 lb $84.00, 11 lb $165.00 and 150 lb $135.00.
  - Subtotals per unit: 750 tablets, 35 gal and 271 lb, never added together.
  - **$924.00** grand total, which is the sum of the rows.
  - Copy has a Unit column, whole tablets ("750 tablets 0"), and "Total value 924.00" on its own row.
  - The API's `total.value` is 924.00, and its `by_unit` gives 750 / 35 / 271. This matches.
  - With the None manufacturer filter: 3 rows, $675.00, which is the sum of those rows.
- **Totals → Orders** (my supplier):
  - Each pack name is counted separately: `3 bags · 1 box · 4 pails · 2 sacks · 2 tubs` ordered, with 1 tub received.
  - 1,000 tablets, 20 gal and 271 lb.
  - $784.00.
  - Copy has a column per pack name and per-unit total rows.
  - The API's `by_pack`, `by_unit` and `dollars` 784.00 match.
- No console errors in any of these.

**The UI's Brix and extract editing** (script `scripts/r2_brixui.js`, output `results/r2_brixui.out`):
- **Add a fruit product, Brix low only 12:**
  - The UI sends `{low:"12", high:null}`; the API stores 12, with no high.
  - The page shows "≥ 12.0 °Bx".
- **Edit a product:**
  - Changing only notes keeps Brix 12.
  - Setting low to 11.5 saves, and the page shows "≥ 11.5 °Bx".
  - On a 6–9 range, clearing High stores a low-only 6.
  - Clearing both ends sends `brix: null` and clears Brix.
  - My other fruit product, 809, still shows "6.0–9.0 °Bx".
- **Liquid sugar lot, through Add lot:**
  - Extract was prefilled at 78.5.
  - Brix 67.5 saves both values.
  - Editing the lot's Brix to 68 keeps extract 78.5.
  - The lot table shows Extract 78.5 and Brix 68.0.
- **Receive with Brix:** the R1 UI receipt shows Brix 7.2 in the fruit lot table.
- **Dry sugar product:** shows "91.0 % FGDB".

My first run's checker marked 4 display checks BAD. That was my regex: it expected "12 °Bx" and a unit in the lot cells. The screen shows "≥ 12.0 °Bx" and "6.0–9.0 °Bx", with the lot Brix in a "Brix °Bx" column. I checked those rows directly, and they display correctly.

## R4: seeded baseline

- **Start and end:** `results/seed_baseline_r2_start.json` and `…_r2_end.json`, both taken as owner, are **byte-identical**. Nothing seeded changed.
- **What they cover:** 14 categories, 110 ingredients, 103 products, 21 companies, all offers and prices, ions and hop lots, excluding `[TEST-TEMP]` rows.
- **Counts:**
  - 29 D65 reference products and 30 offers, 26 of them priced.
  - Hops: 28 lots, 409.6 lb.
  - 7 salts and 10 spices.
  - Gypsum: CaSO₄·2H₂O, Ca 61.5, SO₄ 147.4, $32.00.
- **Seeded rows I touched:** I only picked Aseptic Fruit and Strawberry in a New order dialog, then cancelled it.

## My ids, all `[TEST-TEMP] DEV…`, and end state

| Kind | Ids | End state |
|---|---|---|
| Companies | 653 "[TEST-TEMP] DEV Supply Co" (target 40), 654 "[TEST-TEMP] DEV Sack Co" (target 40) | **deactivated** |
| Ingredients | 628 fruit, 629 sugar, 630 salt (formula + ions), 631 fining, 632 grain, 633 hop | kept: they have products |
| Products | 809–819 | **all deactivated**, features unchanged |
| Offers | 1340–1345 (Supply Co), 1346 (Sack Co), all priced | left with the deactivated products |
| Lots | 837–848 | on my deactivated products |
| Orders | 362 PO-G8 receive, 365 PO-1 | received |
| Orders | 363 PO-G7 mixed, 364 PO-G7 sack | **cancelled** |
| Subcategories | none | — |

- **Refused probes:** none of the refused POSTs created a row.
- **Exact ids only:** every destructive step used an exact id, after reading the row back and checking the `[TEST-TEMP] DEV` prefix (`scripts/r2_cleanup.js`, output `results/r2_cleanup.out`).
- **Other runs' rows:** DEV also holds other runs' `[TEST-TEMP]` rows, which I left alone.

**Settings:** I never clicked the packs/Total toggle. `board_settings` before (`results/board_settings_before_r2.json`) and after (`…_after_r2.json`) are identical: `{}` for brewer1, brewer2 and owner.

## Not covered
- **A real phone:** I used Chromium emulation at 360×780 with touch.
- **D5 dialogs:** the phone pass covered only gap 7's order dialogs. I didn't re-run the other D5 dialogs, which recheck 2 didn't ask for.
