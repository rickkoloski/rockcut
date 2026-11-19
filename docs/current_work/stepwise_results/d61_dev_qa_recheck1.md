# D61 DEV QA: recheck 1

- **Build tested:** `2237ed1` (ribbon `DEV · 2237ed1` checked). UI: https://rockcut-ui-dev.fly.dev, API: https://rockcut-api-dev.fly.dev
- **Date:** 2026-11-19, about 10:28–10:50 America/Denver, on DEV freshly reseeded at deploy
- **Tester:** independent QA (Claude), black-box. Playwright 1.63 headless Chromium with the fresh `auth/` storage states (never opened or printed).
- **Personas used:** brewer1, brewer2, breweryMgr, owner

## Verdict: **pass with gaps**

All five gaps from the first pass are closed (gap 4 by Matt's decision, and its wording is in place). The D2 end to end still adds up on the new build. The open items are should-fix, not must-fix:

- **Gap 6:** Edit contract still has the "Save pressed too early does nothing" problem that item 5 fixed in other dialogs.
- **Gaps 7 and 8:** in the Scheduler, Delete on an event or a shift has no confirm at all.

None of them loses or corrupts data, and none is a main path that can't be completed.

| # | Scenario | Result | Checks |
|---|---|---|---|
| R1 | Gaps 1 + 2: stale saves on orders and contracts | **PASS** | 14/14 (new gap 6 found here) |
| R2 | Gap 3 Year picker / Year box, gap 4 wording | **PASS** | 13/13 |
| R3 | Gap 5: one press on Cancel order / Delete contract | **PASS** | 8/8 |
| R4 | Item 5: Save waits for lists (slow + delayed lists) | **PASS** | 8/8 |
| R5 | Item 6: shared confirm elsewhere | **PARTIAL** | task board 4/4; Schedule has no confirm (gaps 7, 8) |
| R6 | Short hunt + D2 rerun | **PARTIAL** | 18/19 (the miss is gap 6) |

## Earlier gaps

| Gap | Status | Evidence |
|---|---|---|
| 1 must-fix: concurrent order edits | **Closed** | brewer1 saved 5→9 sacks. brewer2's stale save got 409 and the dialog said "Someone else changed this order since you opened it. Close and reopen it to see their change." brewer2's reference text stayed in the box and nothing was written (still 9 sacks, old reference). Reopening showed 9, and saving again kept both changes. Edit left open across a receive got 409 "This order has already been received", and across a cancel (made in the UI by another person) got "This order has already been cancelled". Nothing was written in either case. |
| 2 must-fix: concurrent contract edits | **Closed** | owner saved 10→8 sacks. breweryMgr's stale notes save got 409 with the contract wording, the input was kept and nothing was written. Reopening showed 8, and saving again kept both (once the dialog had loaded; see gap 6). A contract edit left open while an on-contract order was received against it still saves (200, no false 409). |
| 3 should-fix: Year picker | **Closed** | 2029 and 2023 contracts appear in the picker (2023 … 2029) and open from it. After they were deleted the picker went back to 2024–2028. The Year box shows "A whole year, 2000–2100" with Save disabled for 1999, 20271, 2026.5, abcd and an empty box. |
| 4 minor: past-year price row | **Closed (spec amended)** | New and Edit for 2023 show "2023 is over: saving changes no offer prices." No price row was written for 2023, while 2029 wrote "Contract 2029" dated 2029-01-01. |
| 5 should-fix: Cancel double tap | **Closed** | A slow double tap on Cancel order and on Delete contract each sent exactly one request (200 / 204), with no error shown. Keep it / Cancel were disabled while the request was in flight. Single presses work, and Keep it / Cancel back out with no request. |

## New gaps

### Gap 6: should-fix: Edit contract: Save pressed before the dialog's lists load does nothing
- **Path:** Purchasing → Contracts → Edit contract → change Notes → Save straight away. Desktop 1366×768, breweryMgr.
- **Expected (as item 5 now does for the product, lot and offer dialogs):** Save stays disabled until the dialog's lists (`/api/parties`, `/api/supplier_offers?supplier_id=…`, `/api/ingredient_products`) have loaded, or a press saves.
- **Observed:** Save is enabled at once. Pressing it before the lists arrive sends **no request** and shows **no message**, and the dialog stays open with the edit in it. A second press after the lists arrive saves (PUT 200). This reproduced 3 out of 3 times: at normal speed with no delay (a real DEV round trip is enough), with `slow(page)`, and with `/api/supplier_offers` delayed 4 s. It reproduced again in R6 with all three lists delayed. A user who presses Save once and then closes the dialog loses the edit without knowing.
- **Repro:** contract 18 (2026) / 21 (2027). Open Edit, fill Notes, click Save within about 1 s, then check the network log for no PUT.
- **For comparison, all fine:** Edit order (Save disabled until its lists arrive), Receive (disabled until lots arrive, then defaults to the most recent lot), and New contract / New order (can't be made valid until the lists are in).

### Gap 7: should-fix: Scheduler: Delete in Edit event deletes at once, with no confirm
- **Path:** Scheduler (breweryMgr) → click a `[TEST-TEMP]` event → Edit event → **DELETE**. Desktop.
- **Expected (RECHECK R5):** a confirm appears ("exactly one request each, Cancel backs out").
- **Observed:** a single press sends `DELETE /api/schedule_events/<id>?scope=this` (200) straight away and closes the dialog. There is no confirm and no undo, for a draft event (27380) and for a published one (27381).
- **Note:** I didn't test the Scheduler in the first pass, so I can't say whether this is new with item 6's change or older behaviour. The RECHECK lists Schedule deletes among the confirm places, so I'm flagging it.

### Gap 8: should-fix: Scheduler: Delete in Edit shift deletes at once, with no confirm or undo
- **Path:** Scheduler (breweryMgr) → click a `[TEST-TEMP]` open draft shift chip → Edit shift → **DELETE**. Desktop.
- **Expected:** as in gap 7.
- **Observed:** one press sends `DELETE /api/shifts/<id>` (200) immediately, with no confirm and no Undo snackbar (watched for 6 s). Shifts 5836 and 5837.
- **Note:** same caveat as gap 7.

## What else was checked (all OK)

- **R4:** with `slow(page)` and a 4 s delay on `/api/parties`, `/api/ingredients`, `/api/feature_types` (plus categories, offers and products), Save in **Edit maltster product**, **Add lot**, **Add offer** and **Edit offer** started disabled and enabled at about 4.7–5.0 s, right after the last list arrived. A double-click then made exactly one write each (PUT product 200, POST lot 201, POST offer 201, PUT offer 200).
- **R5, Brewery task board (brewer1):** Delete task → confirm "Delete '…'?". Cancel backs out with no request. A slow double tap on Delete sends one DELETE (204) with no error, and Cancel is disabled while it's in flight. A single press works.
- **R6, D2 rerun:**
  - Contract 2027 writes "Contract 2027" dated 2027-01-01 at $42.
  - New order prefill is $43/$38, with "34 sacks · 1,820 lb · $1,412.00" and "34 of 40 sacks".
  - The 2027 contract shows on order 24/10, which goes back to 0 after receipt.
  - The receipt split 10 → previous lot / 14 → new lot ("10 + 14 = 24 of 24") and B50 short at 7 of 10 closed the order. That was one receive request.
  - The 2026 contract received went up by +24 / +7 with matching $, and over/remaining are consistent.
  - The new lot is at price paid (14 × $43 = $602).
  - Inventory went up by exactly 1,670 lb. Inventory and Orders totals match across screen, Copy and API.
- **Not a gap:** Receive's "Goes to" is blank for a moment while lots load, but Receive is disabled during that time and then defaults to the most recent lot.

## Data made (all `[TEST-TEMP] DEV … mwntqvbu`) and cleanup

| Kind | Ids | End state |
|---|---|---|
| Company (supplier + maltster, order target 40) | 71 | **deactivated** |
| Products | 167 (A55), 168 (B50) | **deactivated** (167 has R4 test notes) |
| Offers | 215 (A55 55 lb), 216 (B50 50 lb), 217 (B50 55 lb, R4) | left on inactive products |
| Lots | 202 A1, 203 R1, 204 R4, 205 A2, 206 B1, 207 R6 | left on inactive products |
| Contracts | 18 (2026), 21 (2027) | left; 19 (2029) and 20 (2023) **deleted** in R3 |
| Orders | 58, 62, 64 received; 59, 60, 61, 63, 65 cancelled | **no open orders** |
| Brewery tasks | 198603, 198604 | **deleted** (R5) |
| Schedule events | 27380, 27381 (deleted by the gap 7 single press), 27382 | all **deleted** (27382 by exact id at cleanup) |
| Schedule shifts | 5836, 5837 (open, draft, Brewer, 2026-11-22) | **deleted** (gap 8 single press) |

Events 27381 and 27382 were **published** (Brewery, today 19:00–21:00) for a short time before they were deleted. If DEV sends publish notifications, synthetic Brewery staff may have received one each. Every write was on my own `[TEST-TEMP]` rows by exact id. No reference or `[SEED]` row was touched, and the other `[TEST-TEMP]` rows on DEV were only read.

## Settings

- The sacks/lb display setting was **not changed**, so there was nothing to restore. Minimums weren't set this time, and the order target (40) was set only on my own company.
- No sign-out, revoke or persona change. No password sign-in. No token was read, printed or logged (API calls were made only from inside the page with `lib.js` `api()`).

## What I couldn't test

- **Item 6 covers about 36 confirm places;** I sampled Cancel order, Delete contract, Delete task and the Scheduler's event/shift Delete (which has no confirm). The rest weren't covered.
- **Whether gaps 7 and 8 are regressions:** the Scheduler wasn't part of the first pass, so I have nothing to compare against.
- Gap 6's sibling in **New contract** can't be hit the same way, because the dialog can't be filled before its lists load.
- Real phone hardware, time zone edges, Firefox and Safari were out of scope for this recheck.
