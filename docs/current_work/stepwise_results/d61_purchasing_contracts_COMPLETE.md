# D61: Purchasing, malt contracts, reorder and totals — Complete

**Spec:** `specs/d61_purchasing_contracts_spec.md` (scoped with Matt 2026-11-17/18, approved
2026-11-18, amendments from local QA 2026-11-18 and DEV QA 2026-11-19)
**Plan and briefs:** `planning/d61_purchasing_contracts_plan.md`, `prompts/d61_builder_brief.md`
(Stages 1–4), `prompts/d61_lead_decisions_1.md` (items 1–22), `_2.md` (items 1–8)
**Completed:** 2026-11-19 (on prod as `v2026.11.19`, release PR #84, squash `ef2dee8`; D61 PR #83,
merge `412c51f`). Matt's prod check passed 2026-11-19.

---

## Summary

Purchasing on top of D60's grains, in one **Purchasing** area of the Ingredient Library (Orders ·
Contracts · To order · Totals). Brewers order from a supplier's offers with a running total toward
the supplier's sack target, receive into the previous lot, a new lot # or a split, and every receipt
records its cost. Owners and Brewery managers keep yearly malt contracts whose figures (on order,
received, remaining, over) follow the orders and receipts by weight. A minimum on hand per product
drives To order, and Totals give inventory value (as of any date) and order totals with Copy.

## What Was Built

- **Data model (Stage 1):** `supplier_contracts` (unique supplier + year) and
  `supplier_contract_lines` (product, offer, sacks, price); `purchase_orders` and
  `purchase_order_lines` (open, received, cancelled); `parties.order_target_sacks`;
  `ingredient_products.min_on_hand_sacks` and `reorder_offer_id`; Received movements carry
  `purchase_order_line_id` and `unit_cost_per_lb`; a unique, trimmed, case-insensitive lot # per
  product (the migration renames duplicates first); `lock_version` on orders and contracts.
  Migrations `20261118120001`–`05`, `20261119120000`, all additive.
- **API (Stage 2):** `Ingredients.Contracts`, `Orders` (create/update/cancel/receive), `Valuation`
  (lot cost = most recent costed receipt (A4), else the offer price "estimated", else unvalued; all
  "as of" a date), `Reorder` (⌈minimum − on hand non-expired − on order by weight⌉). Receive is one
  `BEGIN IMMEDIATE` transaction with the status re-checked inside. Contract saves write the offer's
  price from Jan 1 or today if later ("Contract <year>"); a past-year contract writes none (Matt,
  4a). A stale order or contract save → 409, nothing written. `Authz :contracts` (write = owners and
  Brewery managers); every new route in the device route matrix (devices 403).
- **UI (Stage 3):** Orders list and page, New/Edit order with running total and target progress,
  Receive (previous lot preselected, new lot #, split rows, specs on a new lot), Contracts by year
  (Year picker lists every year with a contract) with Shortfall, To order with Start an order, Totals
  (Inventory with As of and filters, Orders with filters) and `CopyTableButton` (tab-separated);
  product page minimum, Below minimum, open orders, lot $/lb and value; Companies order target.
  Phone: cards, full-screen dialogs, tables scroll inside their card.
- **Shared dialog changes:** ConfirmDialog takes one press at a time (Cancel disabled while a save is
  in flight); dialogs that load lists keep Save disabled until they arrive (the D60 ingredient
  dialogs, orders, receive, contracts, Record movement, whose partner field shows "Loading partner
  breweries…").
- **D60 carry-over:** B8 fix (`0299732`), company and category Delete disabled with the reason,
  "N usable · M expired" in one formatter, extra decimals refused (UI and API), unique lot #, expired
  lots out of the recipe lot picker, no Add field on grain categories, the late-evening price test.
- **Lint (task 4084):** 21 → 8; the 8 left are the recipe and batch dialogs D63 rebuilds.
- **Tests:** ExUnit 2,617 → 2,686; vitest 416 → 443; Playwright `tests/regression/ingredients/`
  27 → 56 (orders, receiving, contracts, reorder, totals, refusals, phone, slow, QA fixes);
  `tests/COVERAGE.md` D61 section.

## Gate (third run of local QA before DEV)

| Pass | Result | Fix cycles |
|---|---|---|
| Local gate | mix 2,680 ×2, Playwright 868 passed | — |
| Local QA (19 scenarios) | fail: 1 must-fix, 8 should-fix, 8 minor | local cycle 1 (Matt: 2a, 17a) |
| Local QA recheck 1 | 17/17 closed; 1 new minor (To order at 360 px) | item 21 |
| Local QA recheck 2 | closed; no new gaps | — |
| DEV Playwright (`b64784a`) | all pass apart from PO7: Save dropped while a dialog's lists load (a real slow-network gap) | item 22 |
| DEV QA (7 scenarios) | fail: D1–D6 pass (181 checks); 2 must-fix (concurrent order / contract edits silently lost a change), 2 should-fix, 1 spec question | DEV cycle (Matt: 4a) |
| Local gate after the DEV cycle | mix 2,686 ×2; Playwright 870 + reruns (D51 G5 broke on my `noValidate` addition; removed) | item 6 |
| DEV Playwright (`2237ed1`) | all pass (4 failed during a DEV API slowdown, passed alone) | — |
| DEV QA rechecks 1–3 | gaps 1–5 closed; new should-fix 6 and minor 9 fixed and closed; recheck 3 clean | items 7, 8 |

Reports: `stepwise_results/d61_local_qa_report.md`, `d61_local_qa_recheck1.md`,
`d61_local_qa_recheck2.md`, `d61_dev_qa_report.md`, `d61_dev_qa_recheck1.md`–`3.md`.

**Trial note:** local QA again caught the arithmetic and refusal gaps before DEV. DEV found what
local couldn't: real latency (the dropped Save, which the release build's faster dialogs exposed in
PO7) and two people working at once (the stale-save must-fixes). Worth keeping a "two people, one
record" scenario in every local brief.

## Not tested / left open

1. **Scheduler Delete has no confirm** (DEV recheck 1 gaps 7, 8; pre-D61 behaviour) → backlog task
   **6107** (Matt).
2. Flaky on DEV, passed alone: T9 (recipe sort order), S123 (temporary password), S185 (hide shifts),
   d58 S16; locally PO7/P4 (fixed), O9. Added to **5911**.
3. Not covered: real phone hardware (Chromium mobile emulation only), Firefox/Safari, a service
   worker update across a deploy, the late-evening Colorado / next-day UTC edge for "not after today"
   on orders and receipts, lb-only display on the new pages.
4. Prod has no orders, contracts or lots yet; Matt will start using Purchasing once everything is in
   place.
