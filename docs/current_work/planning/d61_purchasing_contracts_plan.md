# D61: Purchasing, malt contracts, reorder and totals — Plan

2026-11-18 · lead. **Spec:** `specs/d61_purchasing_contracts_spec.md` (approved 2026-11-18).
**Branch:** `d61-purchasing` in `~/src/rockcut`, from `develop` @ `44f7926`. The D60 B8 fix
`0299732` (local branch `d61-carry`) is cherry-picked in Stage 1.

## Where things are today (D60, on prod `v2026.11.18`)

- Context `RockcutApi.Ingredients` (`lib/rockcut_api/ingredients/`): `Party` + `PartyRole`
  (`maltster`, `supplier`, `partner_brewery`), `Product` (maltster product), feature types and
  values, `SupplierOffer` + `OfferPrice` (current = latest `effective_on` ≤ today, Colorado),
  `Movement` (kinds `opening received used traded_out traded_in loaned_out loaned_in count`;
  `quantity_lb`, `occurred_on`, `partner_party_id`, `entered_by_id`), `Inventory.allocate/3`
  (oldest first by `received_date`, then id, in `BEGIN IMMEDIATE`), `Units`.
- Lots stay `Brewing.IngredientLot` (`lot_number`, `received_date`, `status`, `sack_size_lb`,
  `product_id`, `supplier_party_id`; virtual `on_hand_lb`, `delete_blocked`). **No unique lot
  number per product today**, and lots carry no cost.
- `Authz.can?(user, :read | :write, :ingredients)` = Brewery member (owners pass; devices denied by
  `Authz.Device`). `counts_as_manager?/1` and `manages_department?/2` exist for the contract rule.
- UI: `pages/ingredients/` (`GrainsList`, `ProductPage`, `CompaniesPage`, dialogs), shared
  `DecimalInput`, `QuantityInput`/`formatQuantity` (sacks/lb from `board_settings.ingredients`),
  FormDialog's save lock. Playwright project `ingredients` (one worker) with
  `tests/regression/ingredients/helpers.ts`.

## Shape

- New schemas in `RockcutApi.Ingredients`: `Contract`, `ContractLine`, `PurchaseOrder`,
  `PurchaseOrderLine`; submodules **`Contracts`**, **`Orders`** (create/update/cancel/receive),
  **`Valuation`** (lot cost, value, as-of), **`Reorder`** (to order). Receiving reuses `Inventory`
  for the movements, in one `BEGIN IMMEDIATE` transaction.
- **One "as of" query** (`Valuation.on_hand_as_of/2`, `cost_as_of/2`) used by the totals and the
  lot value, so today's figures are the as-of figures for today.
- Contract figures (`on_order`, `received`, `remaining`) and To order are **computed on read**,
  not stored.
- UI: one **Purchasing** area under the Ingredient Library: `/ingredients/orders`,
  `/ingredients/orders/:id`, `/ingredients/contracts`, `/ingredients/to-order`,
  `/ingredients/totals`. A shared `CopyTableButton` (tab-separated, plain numbers).

## Stages (each its own commits; stops marked ■)

1. **Carry-over and schema** (spec §5, §3).
   - Cherry-pick `0299732` (B8). Carry-over items 2–6 (spec §5): Delete disabled with the reason
     for companies and categories (`delete_blocked` on their JSON, same rules as the API);
     "usable · expired" wording in one formatter used by the header, list, Count and Record
     movement; `DecimalInput` refuses more decimals than the field allows ("Use at most N
     decimals"); expired lots out of the recipe lot picker (except one already chosen); Add field
     hidden on Grains and its children (API refuses too); the late-evening price test.
   - Migrations: `supplier_contracts` (supplier, year, notes, created_by; unique supplier + year),
     `supplier_contract_lines` (contract, product, sacks, price; unique contract + product);
     `purchase_orders`, `purchase_order_lines`; `parties.order_target_sacks`;
     `ingredient_products.min_on_hand_sacks`; `inventory_movements.purchase_order_line_id`,
     `unit_cost_per_lb`; **unique index on `ingredient_lots (product_id, lot_number)`**: before
     creating it, the migration renames any existing duplicates (`<lot #> (2)`, …) so it can't
     fail on DEV/local test data (prod has none; check before release).
   - ExUnit: migration on a database with duplicate lot numbers; seeds unchanged.
   - ■ **Stop 1:** `mix ecto.reset` + seeds + synthetic setup clean; `mix test` green; carry-over
     vitest and ExUnit green. Report.
2. **API** (spec §3). Every rule gets a refusal and an allowed case.
   - **Contracts:** CRUD under `/api/contracts` (lines in the body); `Authz` `:contracts`
     (`:read` = Brewery member; `:write` = owner or `manages_department?` Brewery). Saving a line
     writes the offer price row (effective `max(Jan 1 of year, today)`, note "Contract <year>");
     no offer → 422. Delete refused once anything was received against it. Read returns per line
     contracted / on order / received / remaining, sacks and $ (A5: order date / received date
     within the year; off-contract orders excluded). `GET /api/contracts/shortfall?year=`.
   - **Orders:** `/api/purchase_orders` CRUD + `POST …/:id/cancel` + `POST …/:id/receive`. Lines'
     offers must belong to the order's supplier; whole sacks ≥ 1; price ≥ 0 defaulting to the
     current price; received/cancelled → 409 on any write. Running total and target progress in
     the JSON.
   - **Receive:** body = received date (≤ today) + per line `sacks_received` and allocations
     `[{lot_id | lot_number, sacks}]` (default: the previous lot by A3; a new lot # makes a lot with
     the offer's supplier and sack size and the standard specs, editable values accepted as in Add
     lot). Allocations must add up to `sacks_received`; first delivery with no previous lot needs a
     lot #; a sack size different from the lot's → 422 "new lot number needed". Writes Received
     movements with `purchase_order_line_id` and `unit_cost_per_lb`, sets the order received, all
     in one transaction. The order's received date doesn't change any lot's `received_date`.
   - **Valuation:** lot `cost_per_lb` = the most recent costed receipt (A4), as of a date; value =
     on hand × cost, else the estimate from the supplier offer's price in effect (marked
     `estimated`), else `unvalued`. `GET /api/ingredient_totals/inventory?as_of=&supplier_id=
     &maltster_id=&category_id=` and `GET /api/ingredient_totals/orders?from=&to=&supplier_id=
     &status=`.
   - **Reorder:** `min_on_hand_sacks` on product create/update; `GET /api/ingredient_reorder`
     (spec §3.5: reorder offer, on hand non-expired, on order, ⌈to order⌉); `below_minimum` on the
     product JSON and the Grains list rows.
   - Every new route refused to devices (add to the device route matrix) and to non-Brewery
     people (D31 boundary test green).
   - ■ **Stop 2:** `mix test` green twice, `--warnings-as-errors` clean. Report with any rule the
     spec left open.
3. **UI** (spec §4).
   - Orders list and page; New / Edit order dialog with lines (offer picker of that supplier,
     sacks, price), running total "N sacks · N lb · $" and target progress; Cancel (confirm);
     **Receive** dialog (per line: received sacks default ordered, lot rows with "previous lot"
     preselected, New lot #, Add lot # for a split, specs on a new lot).
   - Contracts page by year (cards per supplier, over marked), New/Edit contract for owners and
     Brewery managers only (others read), Shortfall view.
   - To order page with row selection → **Start an order** (one order per supplier, opens prefilled).
   - Totals page: Inventory (as-of date, filters) and Orders (filters), plain tables, total rows,
     `CopyTableButton`.
   - Product page: minimum on hand (edit), below-minimum mark, open orders, lot value; Grains list
     below-minimum mark; Companies: supplier order target.
   - **Lint (task 4084, Matt 2026-11-18):** clear 13 of the 21 old errors: the 10
     `no-explicit-any` in `src/datagrid-extended.d.ts`, `ComponentShowcase` (only-export-components),
     and set-state-in-effect in `settings/FieldDefinitionDialog` and `brands/BrandFormDialog` (remount
     with a `key` and initialize from props, the D37 pattern; no behavior change; drive each dialog
     once in a browser: open, edit, save, reopen). Lint goes 21 → 8; the 8 recipe and batch dialogs
     are D63's (rebuilt there), after which lint is 0 and the gate can require it green.
   - Phone: cards, full-screen dialogs, tables scroll inside their card. Look at it in a browser as
     `brewer1`, `breweryMgr`, `owner`, `bartender1`, `breweryDevice`, desktop and 360 px.
4. **Playwright + coverage.**
   - `tests/regression/ingredients/` new files from spec §8 (orders, receiving, contracts,
     reorder, totals, refusals, phone, slow); `[TEST-TEMP]` rows only, cleaned up by id; contract
     tests use a `[TEST-TEMP]` supplier and a future year so they never touch real price history.
     Assert inventory by the API and on screen; assert Copy output from the clipboard.
   - `tests/COVERAGE.md` D61 section.
   - ■ **Stop 3:** the full local gate.

## Gate

The D60 order: local gate → independent local QA (360 px no sideways scroll on every new page; a
slow-network double-submit pass on New order, Receive, contract save) → DEV Playwright + a shorter
DEV QA. Every Playwright and QA run, reruns included, in its own herdr tab with pwwatch / qawatch.
QA destructive actions only by exact id on its own `[TEST-TEMP]` rows; QA never creates a contract
for a real supplier in the current year (it would write price rows on reference offers).

## Release

- Additive migrations plus the lot-number unique index; before deploying, check prod for duplicate
  lot numbers per product (expect none; prod had 0 lots at D60's release).
- Rollback is image-only (API v41 / UI v37 ignore the new tables and columns); take the usual
  snapshot anyway.
- No seed changes, no secrets.

## Risks

- **Receiving under concurrency:** two people receiving the same order, or receiving while
  someone draws from the same lot. One transaction with `BEGIN IMMEDIATE`, status re-checked
  inside it (the second gets 409); test two parallel receives.
- **Contract price rows on real offers:** a contract writes price history on a real offer. Tests
  and QA use `[TEST-TEMP]` suppliers or future years only.
- **As-of correctness:** backdated movements change past values (accepted, decision 37). Test
  as-of before, on and after a receipt and a count.
- **The lot-number index** on existing data (renamed duplicates) and on receiving into an
  existing number (adds to it, never a second lot).
- **Size:** comparable to D60. If Stage 3 runs long, Totals (§3.6) is the piece that could move to
  its own deliverable; say so at Stop 2 rather than later.
