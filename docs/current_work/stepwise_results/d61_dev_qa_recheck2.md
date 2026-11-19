# D61 DEV QA: recheck 2

- **Build tested:** UI `e310007` (ribbon `DEV · e310007` checked); API unchanged (`2237ed1`); DEV not reseeded
- **Date:** 2026-11-19, about 11:02–11:20 America/Denver
- **Tester:** independent QA (Claude), black-box. Playwright 1.63 headless Chromium with the fresh `auth/` storage states (never opened or printed).
- **Personas used:** brewer1, breweryMgr

## Verdict: **pass with gaps**

Gap 6 is closed. Edit contract, New order, Edit order and Receive now hold Save/Receive until their lists arrive, then write exactly once. The D2-style path and the 360 px New order / Receive work at normal speed, and nothing got stuck disabled.

One minor gap is left (gap 9). **Record movement** isn't gated as change 2 says, but a press is never lost and nothing wrong gets saved.

| # | Scenario | Result | Checks |
|---|---|---|---|
| R1 | Gap 6: Edit contract Save waits for lists | **PASS** | 8/8 |
| R2 | New order, Edit order, Receive, Record movement | **PARTIAL** | 7/8 (Record movement, gap 9) |
| R3 | Quick D2-style pass + 360 px New order / Receive | **PASS** | 18/18 |

## Earlier gaps

| Gap | Status |
|---|---|
| 6 should-fix: Edit contract Save pressed before lists load does nothing | **Closed.** In four runs (normal ×2, `slow(page)`, and `/api/parties` + `/api/supplier_offers` + `/api/ingredient_products` delayed 4 s), Notes was changed right after the dialog opened. Save started **disabled** and enabled only after the last list arrived: 0.20–0.21 s after lists at 0.16–0.18 s normally, 0.96 s after 0.77 s with slow, 4.21 s after 4.16 s delayed. A double-click then sent exactly **one PUT (200)** and the notes were saved every time. |
| 7, 8 (Scheduler Delete with no confirm) | Out of scope: pre-D61 behaviour, and Matt is deciding on a backlog item. |

## R2 detail (normal, and slow + 4 s delay on all list endpoints)

| Dialog | Gated? | Write |
|---|---|---|
| New order | Save never enabled while lists were outstanding. It enabled after the supplier's offers arrived (2.3 s normal / 6.4 s delayed). | one POST 201 each time |
| Edit order | Started disabled, enabled right after its 3 lists arrived (0.2 s / 5.0 s). Sacks were changed at once. | one PUT 200, sacks saved |
| Receive | Started disabled, enabled right after the lots, product and feature types arrived (0.2 s / 4.8 s). It then defaults to the previous lot. | one receive 200, +165 lb once |
| Record movement | **No.** Save is enabled at 0.1 s while `/api/parties` is still loading (gap 9). | "Used in brewing" 1 sack: one POST 201, −55 lb once |

### Gap 9: minor: Record movement isn't gated on its partner list
- **Path:** product page → Record movement. Desktop. `/api/parties` delayed 5 s with `page.route` (`slow(page)` alone shows the same thing for a shorter time).
- **Expected (RECHECK2 change 2):** Save stays disabled until the dialog's lists have loaded.
- **Observed:** Save is enabled at 0.11 s, and `/api/parties` returns at 5.14 s.
  - **Used in brewing** doesn't need the list, so pressing early saves correctly, once.
  - **Traded out / Loaned:** Save stays disabled until a partner is chosen, so nothing wrong is saved and no press is lost.
  - **But:** while the list is loading, the partner field says **"No partner breweries yet: add one on the Companies page"**, which is wrong (it's still loading) and could send the user off to add a company.
- **Repro:** product 217, Record movement, Kind = Traded out within 5 s of opening, with `/api/parties` delayed.

## R3 detail

- **D2-style pass (normal speed):**
  - breweryMgr's 2027 contract wrote "Contract 2027" dated 2027-01-01 at $42.
  - brewer1's order prefilled $43 / $38, showing "34 sacks · 1,820 lb · $1,412.00" and "34 of 40 sacks". The 2027 contract showed on order 24/10.
  - Receive split 10 → previous lot / 14 → new lot ("10 + 14 = 24 of 24"), with B50 short at 7 of 10. That was one receive 200, the order was received and closed, and the 2027 on order went back to 0.
  - The 2026 contract received went up by +24 / +7 with matching $, and over/remaining are consistent. The new lot is at price paid ($602).
  - Inventory went up by exactly 1,670 lb. Inventory and Orders totals match across screen, Copy and API (14/14).
- **360×780 touch:**
  - New order with 2 lines: `scrollWidth` 360, Save scrolled into view, enabled and saved by tap. Exactly one order exists; I checked by API, because my network listener missed the POST during the page change, as it did in the first pass.
  - Receive with a split row: `scrollWidth` 360, "1 + 1 = 2 of 2", Receive visible and enabled, saved by tap (one receive, order received).

## Data made (all `[TEST-TEMP] DEV … mwnuydv6`) and cleanup

| Kind | Ids | End state |
|---|---|---|
| Company (supplier + maltster, target 40) | 101 | **deactivated** |
| Products | 217 (A55), 218 (B50) | **deactivated** |
| Offers | 296 (55 lb), 297 (50 lb) | left on inactive products |
| Lots | 252 A1, 253 A2, 254 B1, 255 LOT-PH | left on inactive products |
| Contracts | 30 (2026), 31 (2027) | left |
| Orders | 91, 92, 93, 94 | all **received**: no open orders |
| Movements | two "Used in brewing" 1 sack on 217 (notes `[TEST-TEMP] DEV RC2 …`) | left |

Recheck 1 rows (company 71, products 167/168) were already deactivated and weren't touched again. No reference or `[SEED]` row was touched.

## Settings

The sacks/lb setting was not changed, so there was nothing to restore. No sign-out, password sign-in or persona change. No token was read, printed or logged.

## What I couldn't test

- Dialogs "with nothing to load" (said to be unchanged) weren't re-checked.
- Real phone hardware, Firefox and Safari weren't tested. The 360 px check used Chromium mobile emulation.
