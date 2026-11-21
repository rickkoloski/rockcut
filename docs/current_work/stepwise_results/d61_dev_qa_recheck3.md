# D61 DEV QA: recheck 3 (gap 9)

- **Build tested:** UI `4360e03` (ribbon `DEV · 4360e03` checked); API unchanged (`2237ed1`); DEV not reseeded
- **Date:** 2026-11-19, about 11:20–11:30 America/Denver
- **Tester:** independent QA (Claude), black-box. Playwright 1.63 headless Chromium with the fresh `auth/` storage states (never opened or printed).
- **Persona used:** brewer1

## Verdict: **pass**

Gap 9 is closed and no new gaps were found.

| # | Scenario | Result | Checks |
|---|---|---|---|
| R1 | Gap 9 repro: `/api/parties` held 5 s; Traded out and Loaned out; Used in brewing at normal speed | **PASS** | 13/13 |
| R2 | Record movement at normal speed (desktop) and at 360 px touch | **PASS** | 6/6 |

## Gap 9: minor: **Closed**

With `/api/parties` held for 5 s by `page.route`, on product 268 (desktop 1366×768), for both **Traded out** and **Loaned out**:

- While the list is held, the partner field shows **"Loading partner breweries…"**. "No partner breweries yet" **never** appears; I sampled every 150 ms until the list answered at 5.1 s. The partner picker is disabled (`aria-disabled="true"`) and **Save is disabled**, even with Sacks and Note filled in.
- After release, the loading line disappears and the picker lists the partners (`[SEED] Mountain Brewing`, `[TEST-TEMP] DEV partner …`). I picked my own partner and double-clicked Save: **one POST `/api/inventory_movements` 201** each, on hand −55 lb exactly once, and the partner was stored on the movement.
- **Used in brewing** at normal speed: a double-click made one write, −55 lb once.

## R2 detail

- **Desktop, normal speed:** Traded out 1 sack to my partner made one write (−55 lb). Used in brewing was covered in R1.
- **360×780 touch:** the product page `scrollWidth` is 360. In Record movement, **Used in brewing** and **Traded out** (partner picked by tap) each had `scrollWidth` 360 with Save scrolled into view and enabled. A tap made one write each (−55 lb).
- The movements list shows every movement once, with the right kind and partner.

## Data made (all `[TEST-TEMP] DEV … mwnvkh9h`) and cleanup

| Kind | Ids | End state |
|---|---|---|
| Supplier company (supplier + maltster, target 40) | 131 | **deactivated** |
| Partner brewery company | 132 | **deactivated** |
| Products | 268 (A55), 269 (B50) | **deactivated** |
| Offers | 377 (55 lb), 378 (50 lb) | left on inactive products |
| Lots | LOT-A1 (4 sacks), LOT-RC3 (5 sacks), both on 268 | left; 3 sacks on hand |
| Movements on 268 | 2 × used, 3 × traded out, 1 × loaned out (notes `[TEST-TEMP] DEV RC3 …`) | left |

I made no orders or contracts this round, so there are no open orders. No reference or `[SEED]` row was changed: `[SEED] Mountain Brewing` was only listed in the picker. The sacks/lb setting was not changed, so there was nothing to restore. No sign-out, password sign-in or persona change. No token was read, printed or logged.

## What I couldn't test

- Real phone hardware, Firefox and Safari weren't tested; 360 px used Chromium mobile emulation.
- "Loaned in" and "Traded in" (the incoming partner kinds) weren't exercised separately. They use the same partner field.
