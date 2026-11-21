# D62 QA recheck 3 after fix cycle 3 (local, short)

- **Date:** 2026-11-20 (America/Denver), local after a reseed. Tested through the browser and the API only.
- **Personas used:** brewer1, brewer2, breweryMgr, bartender1, taproomDevice, owner (read-only seeded diff). Settings were read for all 7 personas.
- **Verdict:** **pass.**
  - Gaps 19 and 20 are both **fixed**.
  - No new gaps.

## Gaps 19 and 20

| Gap | Result | What I saw |
|---|---|---|
| 19 | **fixed** | brewer2 saved product 1268 (Origin), then brewer1 picked an offer on To order → 409 and "Someone else changed this product. The list is up to date now; pick the offer again." I held brewer1's next PUT for 2.5 s. 200 ms after picking another offer, the message was already gone and the PUT had not returned. It stayed gone after the save and 3 s later. There was one PUT with the fresh `lock_version`, and the saved offer was right. Checked at desktop and 360 px with touch (sw=360). |
| 20 | **fixed** | **Before an offer is picked:** a two-offer grain line or hop line lists nothing. **Once an offer is picked:** the grain line reads "[TEST-TEMP] QA Supply Co [TEST-TEMP] QA Supply Co [TEST-TEMP] QA Pale (now $46.00/sack) price becomes $48.00 from 2026-11-20". The hop line reads "[TEST-TEMP] Citrine T90 Pellet · [TEST-TEMP] QA Supply Co (no current price) price becomes $159.50 …" for the unpriced offer, and "(now $150.00/box) …" after switching to the priced offer. **Single offer:** Whole leaf reads as before: "… Citrine Whole leaf · [TEST-TEMP] QA Supply Co price becomes $132.00 …". **Switching product:** clears the offer and its line, and Save goes back to disabled. Checked at desktop and 360 px (sw=360; that dialog was cancelled). Contract 163 wrote "Contract 2026" prices only on the picked offers (1875 $48, 1871 $159.50, 1873 $132). Offers 1874 and 1872 are unchanged. |

## Noted, not rated
- **Re-picking the shown offer after a 409:** after the refetch, if you pick the offer the picker already shows, no write is sent and the message stays. RECHECK3 says that *another* offer clears it, and that works.
- **Grain line prefix:** the grain line's supplier name appears twice because the maltster is the supplier. This is the D61 wording "Supplier Product …", with a product named after its maltster.

## Scenarios
| # | Result |
|---|---|
| R1 | PASS 8 checks (gap 19, desktop + 360 px) |
| R2 | PASS 12 checks (gap 20, desktop + 360 px) |
| R3 | PASS 13 checks; see the R3 details below |

### R3 details
- **Receive at 360 px (touch), order 522:**
  - **Layout:** the dialog spans 0..360, sw=360, and no control is off-screen.
  - **Typed existing lot #:** typing " [test-temp]h1 " shows "Adds to existing lot [TEST-TEMP]H1" and "Crop year 2025 · Alpha acid 12.00 % · Total oil 2.50 mL/100 g". Crop year and alpha are not editable.
  - **Where it went:**
    - T90 → existing lot H1 (+2 boxes, 22 → 44 lb).
    - T90 alt → new lot H2 (crop year 2026, alpha 11.5).
    - Grain → G1.
  - The order is now received.
- **To order on a slow network:** brewer2 used `slow(page)`.
  - Double-clicking an offer sent one PUT.
  - Picking the same offer twice while the save was in flight also sent one PUT.
  - The `lock_version` went 7 → 9, and there was no 409 or message.
- **Access:** bartender1 and taproomDevice get **403** on these routes:
  - `GET /api/ingredient_reorder`
  - product PUT (reorder offer)
  - `POST /api/purchase_orders/523/receive`
  - order GET

  Product 1268, order 523 and the grain lots were unchanged. bartender1's pages redirect to Home. taproomDevice's pages say "Not available on a shared device".
- **Seeded diff:** 0 changes (see below).

## Seeded diff
`scripts/seedcheck_r3.js` compared against a baseline taken at the start (`results/baseline_r3_*`). It printed **"seeded hop products checked 27 diffs 0"**, covering products, lots and movements.

## Data and clean-up
All of these are `[TEST-TEMP]`. The full list is in `results/ids_recheck3.txt`.

- **Company:** 956 [TEST-TEMP] QA Supply Co. Deactivated.
- **Variety/ingredient:** 496 Citrine (hop), 497 QA Pale (grain). Left for the reseed.
- **Products:** 1268 Citrine T90 Pellet, 1269 Citrine Whole leaf, 1270 QA Pale. Deactivated (checked `active=false`).
- **Offers:** 1871 T90 ($150), 1872 T90 alt (no price), 1873 Whole leaf ($120), 1874 QA Pale 55 ($44), 1875 QA Pale 50 ($46).
- **Lots:** 951 H1, 952 G1, 953 H2.
- **Orders:**
  - 522: received.
  - 523: access probe, cancelled.
  - No open orders are left.
- **Contract:** 163 (2026).

## Settings
I didn't change the display toggle. All 7 personas are `{}` before and after.
