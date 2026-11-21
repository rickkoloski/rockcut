# D62 QA recheck 2 after fix cycle 2 (local)

- **Date:** 2026-11-20 (America/Denver), local after a reseed. Tested through the browser and the API only.
- **Personas used:** brewer1, brewer2, breweryMgr, owner. Settings were read for all 7 personas.
- **Verdict:** **pass with gaps.**
  - Gaps 13–18 are all **fixed**. Two new **minor** gaps: 19 and 20.
  - R4 was first logged PARTIAL when my usage limit hit, then finished and passed.

## Gaps 13–18

| Gap | Result | What I saw |
|---|---|---|
| 13 | **fixed** | "Other …" opens the full 15-company list at once. The current value stays until you pick, and after Esc. Checked on grain and hop Add/Edit, with a mouse at desktop and touch at 360 px (sw=360). Picking `[TEST-TEMP] QA Hop Grower` this way saved product 1000. |
| 14 | **fixed** | Grain pickers end with "Other maltster…"; hop pickers end with "Other manufacturer…". |
| 15 | **fixed** | **Offers:** a hop offer reads "QA Supply Co · Citrine T90 · box · 11 lb" (closed: "QA Supply Co · box · 11 lb"). A grain offer reads "QA Supply Co · 55 lb". **Caption:** "sacks" when the list is empty, "boxes" for hops only (including a hop row with no offer), "packs" when mixed. Desktop and 360 px. |
| 16 | **fixed** | **Hops:** beta sent while lot H1 has none, oil 2.6 vs 2.5, and `total_oil: null` vs 2.5 all → 422 "Lot … already exists with crop year 2025, alpha acid 12.00, no beta acid, total oil 2.50; use a new lot number or leave its values". **Grain:** protein sent while lot G1 has none, DP 150 vs 140, and `diastatic_power: null` vs 140 → the same 422 style. Nothing is written in any of these cases. **Accepted:** matching values (case/spaces, 12.00 vs 12, 80.0 vs 80). With `lot_id`, specs are ignored and the lot is unchanged. Explicit `""` or `{value:null}` → 422 "X can't be blank", the same as on new lots and Add lot (the API's existing convention). `crop_year: null` is treated as not sent: accepted, and H1 kept 2025. |
| 17 | **fixed** | brewer1 was on To order while brewer2 saved product 998. brewer1's pick → 409. The page then refetches and shows "Someone else changed this product. The list is up to date now; pick the offer again.", the picker shows the saved offer (aria-selected), and the next pick saves. Desktop and 360 px. See gap 19. |
| 18 | **fixed** | The hop line reads "[TEST-TEMP] Citrine T90 Pellet · [TEST-TEMP] QA Supply Co price becomes $159.50 from 2026-11-20". The grain line keeps "Supplier Product price becomes $48.00". Contract 132 wrote $159.50 "Contract 2026" on offer 1451 only. Desktop and 360 px (sw=360; that dialog was cancelled). See gap 20. |

## New gaps
- **Gap 19 · minor · R3:** On To order, the 409 message stays on screen after the re-pick has saved. It only clears on a page reload.
- **Gap 20 · minor · R3:**
  - When the hop product has two offers from the supplier, the contract dialog shows "… price becomes $159.50" before the required "Offer *" is picked. Save is disabled until it is.
  - The line never says which offer will change, even after one is picked.

## Noted, not rated
- On To order, the closed picker for two offers from one supplier reads the same text for both ("QA Supply Co · box · 11 lb"). You can only tell them apart in the open list. This is the D61 closed-label style.

## Scenarios
| # | Result |
|---|---|
| R1 | PASS 16 checks |
| R2 | PASS 10 checks |
| R3 | PASS 14 checks (gaps 19, 20) |
| R4 | PASS 14 checks. Logged PARTIAL first, then finished. **Receive at 360 px (touch), order 413:** the dialog spans 0..360, sw=360, no control is off-screen, and Receive's right edge is at 352 px. " [test-temp]h1 " shows "Adds to existing lot … Crop year 2025 · Alpha acid 12.00 % · Total oil 2.50 mL/100 g". Grain went into G1 (+110 lb) and hops into new lot H3 (2026, 11.5). **To order on a slow network (brewer2):** one pick = one PUT, no 409, no message. Two quick picks send two PUTs in order, each with a fresh `lock_version`, and the saved offer is the last one picked. **Access:** bartender1 and taproomDevice get 403 on `GET /api/ingredient_reorder`, product PUT (reorder offer), order GET, receive POST and lots GET, and product 998 was unchanged. bartender1's pages redirect to Home; taproomDevice's say "Not available on a shared device". **Also:** the seeded diff is 0 and settings are unchanged. |

## Seeded diff
`scripts/seedcheck_r2.js` against a baseline taken at the start (`results/baseline_r2_*`) printed **"seeded hop products checked 27 diffs 0"**.

## Data and clean-up (all `[TEST-TEMP]`; full list in `results/ids_recheck2.txt`)
- **Companies:** 739, 740, 741. Deactivated.
- **Varieties/ingredients:** 396, 397. Left for the reseed.
- **Products:** 998, 999, 1000. Deactivated.
- **Offers:** 1451, 1452, 1453.
- **Lots:** 771 G1, 772 H1, 773 H3.
- **Orders:** all received, including 413 (R4); no open orders left.
- **For R4:** I reactivated company 739 and products 998/999, after reading each back, then deactivated them again (checked `active=false`).
- **Not mine:** while I was testing, `[TEST-TEMP] G15`/`G17` hop products and companies appeared on To order (created 22:22). Someone else made them, and I didn't touch them.
- **Contract:** 132 (2026).

## Settings
I didn't change the display toggle. All 7 personas are `{}` before and after, byte-exact.
