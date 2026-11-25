# D63 independent QA report

**Date:** 2026-11-25 (local, America/Denver). **Result: FAIL** (one must-fix, one should-fix, two minor).
**Personas used:** owner, breweryMgr, brewer1, brewer2, floater, splitRole, breweryDevice, barMgr, bartender1, office1, taproomDevice. Not used: owner2.
Check counts in this file and in `progress.log` are approximate; Q1's was not tallied by a script.

## Summary

| # | Result | Notes |
|---|---|---|
| Q1 | PASS | Every catalog value in the brief matched; Summit Cone A used up, B Expired, C In use; settings and YB1–YB4 recorded in the snapshot |
| Q2 | FAIL | Gap 3. Back on Dump, Mark clean, Remove (History stays), lot delete, product delete all correct |
| Q3 | PASS | See note on footer wording |
| Q4 | PASS | |
| Q5 | PASS | |
| Q6 | FAIL | Gap 1 |
| Q7 | PASS | |
| Q8 | PASS | |
| Q9 | PASS | |
| Q10 | PASS | |
| Q11 | PASS | Gap 4 (minor wording) |
| Q12 | PASS | |
| Q13 | PASS | |
| Q14 | PARTIAL | Gap 2 |
| Q15 | PASS | |
| Q16 | PASS | No seeded row differs; settings values back at the table |
| Q17 | PASS | |

## Gaps

### 1. must-fix: extra stock skips the newest lot when it is Expired (Q6)
- **Path:** hop product, two lots: old (received 2026-08-01, 4 lb, Available), new (received 2026-09-10, 3 lb, Expired). Count → 8 lb → Save count.
- **Expected:** the extra 1 lb goes to the newest lot by received date, "also ... when it's Expired".
- **Observed:** it goes to the older, non-expired lot (4 → 5); the Expired newest stays 3. Same when the newest is Expired and used up. When every lot is Expired the count is refused: "Every lot is expired; count by lot instead". The dialog says "Over: onto the newest lot."
- **Repro:** `scripts/q6b.js` cases 1, 3, 4, from scratch; first seen in `scripts/q567.js`. Product totals stay right; the lot is wrong. UI count, 1366 px.
- **Note:** if skipping Expired lots is intended, the brief and the dialog text need to say so. Newest lot used up (not Expired) works.

### 2. minor: taproom device does not go Home from /brewery/settings (Q14)
- **Expected:** the URL goes Home. **Observed:** stays at `/brewery/settings` with "Not available on a shared device ... Go to home". No settings values shown, no nav entry, API 403. Other non-brewery personas go Home. `scripts/q14.js`.

### 3. should-fix: Back after deleting a product shows it as live (Q2)
- **Path:** Hops list → own product page → Delete hop product → Delete → (lands on the Hops list, right) → Back.
- **Expected:** a not-found page or the list. **Observed:** the deleted product's page is drawn in full, with Record movement, Count and Add lot, 6 s later and although its GET answered 404. On the phone Forward then stayed on that page. On desktop Forward went to the list.
- **Repro:** `scripts/q2d.js`, phone and desktop, two fresh products. I did not try pressing the buttons on that page.

### 4. minor: pack note hint says "(5 lb)" on g and mL offers (Q11)
- Add supplier offer on a g product: "Optional, shown with the pack: "bag · … g (5 lb)"". Wording only; no quantity is shown as lb.

## Passed in detail
- **Use order:** mouse drag, keyboard (Space, arrows, Space; Escape cancels), arrows, phone arrows, long-press on the handle (**simulated touch**: 400 and 800 ms hold drag, 120 ms does not; holding the row text does not drag). New lot to the end even with an older date; receiving does not move; a second form is a second list; one "In use" per list.
- **Movements:** 3 lb over a 2 lb first lot made two movements, that maker only; by hand, Traded out, Loaned out; over on hand refused; Expired skipped and next reads In use.
- **Counts:** short off the first in order; over onto the newest (first in order, used up, newly re-dated); on hand = movements on all 145 products at the end.
- **Used up, switches, two people:** hidden lots keep their slot through reorders and through a count to zero; each account's switch is its own; a stale reorder gets the sentence and the new order; slow double move and double drag stick; blocked or 500 save restores the old order and says so.
- **Lists by API:** foreign, repeated, missing, empty ids → 422; stale version → 409; missing version → 422. A product with lots cannot change form; moving hop joins the end.
- **g and mL:** offers, price, 2-bag order, receive 500 g, count 480, use 30.5, To order (2 bags), Totals subtotals by unit and $ (1,061.49 + 300.00 + 44.95 = 1,406.44). Odd values refused.
- **Settings:** limits and decimals agree between UI and API on the fields checked; text, empty and comma refused, typing kept; zinc typed = shown = stored × 8; unchanged save writes nothing; two editors, "Now: …", third save in between, slow double-click once; lock_version and updated_by rules.
- **360 px:** no sideways scroll on the Hops list, hop page (14 lots, long names), product page, dialogs, Process Aids, settings page and dialog, Brands, orders. Arrow buttons are 30 × 30 px, small but usable.
- **Order footer:** New order and the order page read "32 packs · 20 bricks · 12 pitchables", with separators other than the brief's "20 bricks, 12 pitchables". Unit words are right, so not a gap. A voided brink record with no entries does not appear in History.

## UI or API
UI: Q2 and Q3's order and History view; Q4's reorders; Q5 movements; Q6 counts; Q7 switches; Q8; Q11 main path; Q12 dialog limits (desktop); Q13; Q14 pages; Q15; most of Q17. API only: most set-up, Q9 edge cases, Q10's own-yeast use, Q12 API limits, voiding the harvest in Q3, expiring lots in `q6b`.

## Not tested / limits
- Long-press is simulated. Local only: no email, push, service worker.
- Q6: count on a product whose every lot is used up (the script stopped at a different field; 4 of 5 cases ran; Q17 covers it by API).
- Q10: yeast *pitching* from a brew step; only the movement was checked. Q13 was desktop only. `owner2` unused. Delete/Back on ingredient, brand and company pages not repeated.

## Things I did that the brief should know about
- **I clicked "Check off" on the seeded step 84883** (Galactic #40, Yeast harvest) expecting a dialog. It sent `POST /steps/84883/complete`. On my own batch that request carries `preview: true` and wrote nothing, and a full read of the schedule, brinks, batches, brands and recipes showed 0 differences in seeded rows. I made no undo. Nothing was saved from the harvest dialog.
- **My planned batch 6324 (own brand) renumbered seeded plan labels while it existed** (for example Altruism P1/P2, Enos P2/P3). It is deleted and the final diff shows the schedule back to baseline. I checked its brew day off as #44 and undid it: the number was freed.
- Product names `QA-1` (7572) and `QA-2` (7578) and briefly `3` on 7573 did not start with `[TEST-TEMP]`; their ingredients do.
- My test hop/brink dump ticked the board's own "Clean [TEST-TEMP] Brink Q" task; I did not check whether that task row remains.
- Settings: lock_version 22 → 132 from my saves; every value equals the table.

## Ids
- **Deleted:** products 7556, 7557, 7559, 7563, 7567–7570, 7575–7577, 7579; hops 4346, 4347, 4353, 4354; brand 4927; batch 6324 (steps 84885–84900); every lot the app allowed (list in `results/cleanup.txt`).
- **Deactivated:** products 7555, 7558, 7560, 7561, 7562, 7564, 7565, 7566, 7571, 7572, 7573, 7574, 7578, 7580; companies 5078, 5079; brink 1013.
- **Left (app will not delete):** ingredients 4341–4345, 4348–4352, 4355; lots 5022, 5027, 5029–5031, 5033–5036, 5039–5042, 5044, 5055, 5057, 5059, 5075–5078 (they keep stock); offers 8718–8724 and prices 4601, 4602; orders 2196 (received) and 2197 (cancelled).
- brewer1 and brewer2: hide on, boxes, as at the start.
- Seeded diff (`scripts/diff.js`): no baseline row differs except the settings row's `updated_at` and `lock_version`.
