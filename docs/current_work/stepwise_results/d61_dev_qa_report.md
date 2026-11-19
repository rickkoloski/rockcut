# D61 DEV QA report: Purchasing

- **Build tested:** `b64784a` (ribbon `DEV · b64784a` checked on every page). UI: https://rockcut-ui-dev.fly.dev, API: https://rockcut-api-dev.fly.dev
- **Date:** 2026-11-19 (America/Denver, about 07:40–08:20)
- **Tester:** independent QA (Claude), black-box: no app source read. Tested with Playwright 1.63 headless Chromium using the `auth/` storage states (never opened or printed).
- **Personas used:** owner, owner2, breweryMgr, brewer1, brewer2, floater, splitRole, barMgr, bartender1, office1, taproomDevice, breweryDevice

## Verdict: **fail**

The main paths work well on the release build: contract → order → split/short receipt → contract figures, product pages and Totals all add up exactly (screen = Copy = API). Latency, the phone layout, the service worker and permissions are all clean. It fails on one thing the brief calls out explicitly: **two people editing the same order or contract**. The second save silently overwrites the first person's change. Under the brief's rules, data lost or changed silently is must-fix.

| # | Scenario | Result | Checks |
|---|---|---|---|
| D1 | Smoke on release build | **PASS** | 13/13 |
| D2 | End to end (breweryMgr, brewer1) | **PASS** | 14/14 |
| D3 | Real latency / double submit / receive race | **PASS** | 12/12 |
| D4 | Phone 360 px touch | **PASS** | 15/15 |
| D5 | Service worker | **PASS** | 20/20 |
| D6 | Who (all 12 personas) | **PASS** | 107/107 |
| D7 | Short open hunt | **FAIL** | gaps 1–5 |

## Gaps

### Gap 1: must-fix: concurrent order edits silently lose a change
- **Path:** Purchasing → Orders → order page → Edit (two people at once). Desktop 1366×768.
- **Expected:** the second save is refused ("this order changed, reload") or merges. It must not undo the first person's change without anyone knowing.
- **Observed:** brewer1 changed the line from 5 to **9 sacks** and saved (200). brewer2, whose Edit dialog was already open, changed only the PO/reference and saved (200). The UI sends the whole order on PUT, including the stale `sacks_ordered: 5`, so the order ended at **5 sacks** with brewer2's reference. Neither person saw a warning, and the order history doesn't show the revert.
- **Repro:** order 29. (1) brewer1 and brewer2 open the same open order and click Edit. (2) brewer1 sets Sacks to 9 → Save. (3) brewer2 edits only the reference → Save. (4) GET `/api/purchase_orders/29` → `sacks_ordered: 5`.
- **Note:** Edit after a receipt is refused correctly (409 "This order has already been received"), so this only hits open orders. It also affects the money and weight that feed contracts' "on order" and To order.

### Gap 2: must-fix: concurrent contract edits silently lose a change
- **Path:** Purchasing → Contracts → Edit contract (owner and breweryMgr at once). Desktop.
- **Expected:** as in gap 1.
- **Observed:** owner changed the line to **8 sacks** and saved (200). breweryMgr, whose dialog was already open, changed only Notes and saved (200). The PUT carries the whole contract with the stale `sacks: 5`, so the contract ended at **5 sacks** with no warning.
- **Repro:** contract 9 (2029). Both open Edit, owner saves sacks 8, mgr saves notes, then GET `/api/contracts?year=2029` → `sacks: 5`.
- **Why it matters:** contracted sacks drive Remaining / Over / Shortfall. The price on that line also writes into the offer's price history, so a stale price could be re-written the same way.

### Gap 3: should-fix: a contract for a year outside 2024–2028 can't be found from the Year picker
- **Path:** Contracts → New contract → Year 2029 → Save. Then come back to Contracts later. Desktop.
- **Expected:** every year that has a contract (or any year the dialog accepts) can be chosen in the Year picker.
- **Observed:** the dialog's Year box accepts any year from 2000 to 2100 (the API returns 422 outside that range), but the Contracts page Year picker only offers **2024 · 2025 · 2026 · 2027 · 2028** (this year ±2). Contract 9 (2029) only shows if you type `/ingredients/contracts?year=2029` into the address bar. Without that, nobody can view, edit or delete it, even though its "Contract 2029" price is already in the offer history (2029-01-01).
- **Also:** the Year box shows no inline message for 1999 or 20271. The error only comes from the server on Save.
- **Repro:** contracts 8 (2028, visible) and 9 (2029, hidden from the picker).

### Gap 4: minor: a past-year contract writes nothing into the offer price history
- **Path:** contract for 2025 (created through the API as breweryMgr, with the body shape the UI uses), line B50 @ $31.11.
- **Expected (brief):** "Saving a line writes the price into the offer's history from Jan 1 of the year **or today if later**." For 2025 that means a row dated 2026-11-19 at $31.11, "Contract 2025".
- **Observed:** no history row was written. Current-year and future-year contracts write rows correctly (2026 → 2026-11-19, 2027/2028/2029 → Jan 1). Skipping a past year is arguably the better behaviour, since otherwise last year's price would become the current price. The brief and the build disagree, so please confirm which is intended.
- **Repro:** contract 10, offer 137 history.

### Gap 5: should-fix: a slow double tap on "Cancel order" shows a false error
- **Path:** order page → CANCEL ORDER → confirm dialog → double-click **CANCEL ORDER** with `slow(page)`. Desktop.
- **Expected:** exactly one write. The user sees the order cancelled and no error.
- **Observed:** two `POST /api/purchase_orders/:id/cancel` requests. The first returns 200, the second 409, and the dialog then shows **"This order has already been cancelled"** even though the user's own cancel worked. The data is correct (cancelled once), but the user is told something failed. New order, Edit, Receive and contract Save don't do this; only the Cancel confirm button lacks the guard.
- **Repro:** orders 31 and 32.

## What passed (highlights)

- **D1:** ribbon `DEV · b64784a`. Purchasing opens Orders. All four tabs and both Totals sub-tabs load. An order page (`/ingredients/orders/21`) and a product page (`/ingredients/products/118`) work by direct URL and after reload. Deep links and reloads work on every tab. No console errors.
- **D2:** the 2027 contract shows in price history as "Contract 2027", 2027-01-01, $42.00. The order prefilled the current (contract 2026) prices. Running total "34 sacks · 1,820 lb · $1,412.00" and "34 of 40 sacks". Before receipt, the 2027 contract showed on order 24 / 10 (by expected date) and the product page listed the open order. Receive: A55 split 10 into the previous lot LOT-A1 and 14 into new LOT-A2 (the "10 + 14 = 24 of 24" sum is shown). B50 short at 7 of 10 closed the order. After receipt, the 2027 on order went to 0 and the 2026 contract showed received 24 / "over by 14" and 7 / remaining 3 ($1,032 / $266). Shortfall lists B50 = 3. Lots are $0.7818/lb with $602.00 each (A1 went from est. to price-paid). Inventory totals: 1,540 lb / 28 sacks / $1,204.00 and 350 lb / 7 / $266.00, total $1,470.00. Orders totals: 34 ordered / 31 received / 1,670 lb / $1,298.00. Screen, Copy (tab-separated, plain numbers) and API all match.
- **D3:** double-clicking Save on New order, Edit order, Receive and contract Save (breweryMgr), both normal and with `slow()`, each produced exactly one order, edit, receipt (+165 lb once) or contract (plus one price row). Two browsers receiving the same order at once, both normal and throttled: one got 200, the other got 409 "This order has already been received" shown in its dialog, and on hand went up by exactly 100 lb.
- **D4 (360×780 touch):** `scrollWidth` = 360 on Orders, order page, Contracts, Shortfall, To order, Totals Inventory and Totals Orders, and in the New order (2 lines), Receive (3 split rows + specs) and Edit dialogs. Save and Receive can be scrolled to. Browser back closes New order, Receive and Edit without leaving the page. (The DEV ribbon sits just under the dialog's action bar but doesn't cover the buttons.)
- **D5:** owner and brewer1: the page is controlled by the service worker after the first load. Reloads of all Purchasing pages are served by the SW (31–32 of 31–32 assets) and render. Leaving to about:blank and coming back, and in-app back/forward, both work. The ribbon still reads b64784a. No stale-bundle or console errors.
- **D6:** for owner, owner2, breweryMgr, brewer1, brewer2, floater and splitRole, all 8 new GET routes return 200 and all Purchasing pages load. Only owner, owner2 and breweryMgr see New/Edit/Delete contract. For brewer1, brewer2, floater and splitRole, contract POST/PUT/DELETE return 403 and those buttons are absent. barMgr, bartender1 and office1 get 403 on every new route (GET, order create/update/receive/cancel, contract create/update/delete) and every page sends them home. Both devices get 403 everywhere and every page says "Not available on a shared device". Delete contract is disabled with the tooltip "Grain has been received against this contract, so it can't be deleted". None of the refused writes created anything (checked afterwards).
- **D7 (beyond the gaps):** To order = ⌈min − on hand (non-expired) − on order⌉ was correct for 55 lb and 50 lb products, after switching B50's reorder offer to a 55 lb offer (10 + 3.64 → 7, which persists after reload), and after marking a lot Expired (→ 2). The Library shows "450 lb usable · 100 lb expired" and the Below minimum chip. Start an order prefilled 5 × A55 @ $43 and 7 × B50 (55 lb) @ $41.25, giving "12 sacks · 660 lb · $503.75 · 12 of 40". A slow double-click on Save made one order. Contract by weight: 7 × 55 lb against a 50 lb line counts as 7.7, so on order 11.7, then received 18.7 / $708.75 after receipt. An off-contract order is excluded. Lot # "  [test-temp] dev lot-a2 MWNNVO8F " went into the existing LOT-A2 (no new lot). An expired lot # and a 50 lb lot # for 55 lb sacks were refused with clear messages. A received date before the order date is blocked in the UI. A date after today is blocked by the date input's max and refused by the API (422), and so is an order date after today. 43.555 and 1.5 sacks are refused in the UI ("Use at most 2 decimals", "Whole sacks, 1 or more") and by the API. Reloading mid-Receive wrote nothing.

## Data I made (all `[TEST-TEMP] DEV … mwnnvo8f`)

| Kind | Ids | End state |
|---|---|---|
| Company (supplier + maltster, order target 40) | 41 | **deactivated** |
| Maltster products | 118 (A55), 119 (B50) | **deactivated** (minimums 50 / 20; B50 reorder offer 138) |
| Supplier offers | 136 (A55 55 lb), 137 (B50 50 lb), 138 (B50 55 lb) | left (inactive products) |
| Price rows | 42, 43 by hand; contract rows incl. 44, 46, 49; B55 price on 138 | left |
| Contracts | 6 (2027), 7 (2026), 8 (2028), 9 (2029), 10 (2025) | left (contract writes are owner/manager only; none received against 6, 8, 9, 10) |
| Orders | 23, 24, 25, 26, 27, 29, 30 received; 28, 31, 32 cancelled | **no open orders left** |
| Lots | 147 A1, 148 A2, 149 B1, 150 D3-fast, 151 D3-slow, 152 RACE-X, 153 RACE-Xs (**Expired**), 154 B55 | left (on inactive products) |

All writes touched only these rows. No reference or `[SEED]` row was edited. Existing `[TEST-TEMP]` rows from earlier runs (C1, F1, P5, T1 …) were only read.

**Incident (own data only):** in D7 a script of mine filled the wrong box in the product edit dialog ("SET" opens the full Edit dialog) and briefly renamed products 118 and 119 to "50" and "20". They were restored to their `[TEST-TEMP] DEV …` names about 30 s later and verified. No other rows were affected.

## Settings

- The sacks/lb display setting was **never changed** for any persona, so there was nothing to restore. Minimums and the order target were set only on my own rows.
- No persona or device was signed out, revoked or changed. No password sign-in. No token was read, printed, logged or screenshotted (the API was called only from inside the page with `lib.js` `api()`).

## What I couldn't test / limits

- **Real phone hardware:** D4 used Chromium's mobile emulation (touch, `isMobile`, 360×780). The "back gesture" was tested as browser back (`history.back`), not an OS gesture on iOS or Android.
- **Service worker update:** I couldn't watch a new deploy replace the old SW (no new build during the pass). Only first load, reload and navigation on `b64784a` were tested.
- **Time zone edges:** everything ran at about 08:00 Denver (15:00 UTC, same date). The late-evening Denver / next-day UTC edge for "not after today" was not exercised.
- **Settings toggle:** sacks + lb vs lb display was not toggled, so lb-only rendering of the new pages wasn't checked.
- **Contracts were left in place** (6–10). The brief only asks to cancel orders and deactivate products and companies; the reseed clears them.
- Firefox and Safari were not tested.
