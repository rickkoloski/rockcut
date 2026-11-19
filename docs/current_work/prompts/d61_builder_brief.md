# D61 builder brief — Stage 1 (carry-over and schema)

2026-11-18 · lead → builder.

**Read first:** `docs/current_work/specs/d61_purchasing_contracts_spec.md` (approved) and
`docs/current_work/planning/d61_purchasing_contracts_plan.md`. D60 is on prod; its completion record
`docs/current_work/stepwise_results/d60_grain_catalog_COMPLETE.md` lists the carry-over. This brief
covers **plan Stage 1 only**. Stop after it and report; Stage 2 (API) comes as a separate brief.

**Where:** `~/src/rockcut`, branch `d61-purchasing` (already checked out; don't switch). Commit in
small commits (`feat: D61 …` / `fix: D61 …`), staging paths by name. No push, merge or rebase. The
lead owns the servers (API :4002 and UI :5174 are running); ask if you need a restart. **Don't run
repo-wide `mix format`**: format only the files you touch.

## Do

1. **B8 fix:** `git cherry-pick 0299732` (from local branch `d61-carry`; the D60 lot dialog reads
   the live lot, Delete disabled by either query). Resolve nothing by hand without saying so.
2. **Carry-over (spec §5, items 2–6)**, each with a test (ExUnit, vitest or Playwright as fits):
   - **Delete disabled with the reason** for companies and categories that can't be deleted:
     `delete_blocked` (reason or null) on the party and category JSON, computed by the same rules
     the API's delete enforces (a party: in use by products, offers, lots, movements; a category:
     grains or children). Contracts and orders join the party rule in Stage 2. The UI disables
     Delete with the reason under it, as `GrainLotDialog` does; the confirm only opens when
     deletable. API refusals unchanged.
   - **"usable · expired"**: one formatter for on hand with expired stock ("11 sacks 50 lb usable ·
     43 lb expired", lb mode "650 lb usable · 43 lb expired"; no expired → just the amount), used by
     the product header, Grains list, Count and Record movement, so all four say the same.
   - **Extra decimals refused:** `DecimalInput` takes the field's decimals and refuses more with
     "Use at most N decimals" (lb 2; features by their feature type's decimals; prices 2), Save
     disabled, nothing sent. The API keeps rounding as a backstop. Update tests that relied on
     rounding.
   - **Recipe lot picker** leaves out expired lots (one already chosen on that line stays shown).
   - **Add field** hidden on Grains and its children (CategoryDetail); the API refuses creating a
     custom field definition on them (422).
   - **Late-evening price:** an ExUnit (or vitest, where "today" is decided) that a price effective
     today is current at 23:30 Colorado (next UTC day) and one effective tomorrow isn't.
3. **Migrations** (timestamps after the latest, `20261117120003`), additive only:
   - `supplier_contracts`: `supplier_party_id` (parties), `year` (integer), `notes`, `created_by_id`
     (users), timestamps; unique `[supplier_party_id, year]`.
   - `supplier_contract_lines`: `contract_id` (on delete cascade), `product_id`
     (ingredient_products), `sacks` (integer), `price_per_sack` (decimal); unique
     `[contract_id, product_id]`.
   - `purchase_orders`: `supplier_party_id`, `ordered_on` (date), `expected_on` (date, null),
     `reference` (string, null), `off_contract` (bool, default false), `notes`, `status` (string,
     default `open`), `received_on` (date, null), `created_by_id`, `received_by_id`,
     `cancelled_by_id`, `received_at`, `cancelled_at` (utc), timestamps.
   - `purchase_order_lines`: `order_id` (cascade), `offer_id` (supplier_offers), `sacks_ordered`
     (integer), `price_per_sack` (decimal), `sacks_received` (integer, null), timestamps.
   - `parties.order_target_sacks` (integer, null); `ingredient_products.min_on_hand_sacks`
     (integer, null).
   - `inventory_movements.purchase_order_line_id` (null, references purchase_order_lines),
     `unit_cost_per_lb` (decimal, null).
   - **Unique `ingredient_lots [product_id, lot_number]`**: first a step that renames existing
     duplicates within a product (keep the oldest id's number; others get ` (2)`, ` (3)` …), then the
     index. ExUnit: the migration on a DB with duplicates.
4. **Schemas** in `RockcutApi.Ingredients`: `Contract`, `ContractLine`, `PurchaseOrder`,
   `PurchaseOrderLine` with changesets (required fields, `status` ∈ `open received cancelled`,
   sacks integers ≥ 1 for contract and order lines, prices ≥ 0, year 2000–2100, unique
   constraints), and the new fields on `Party`, `Product`, `Movement`, `IngredientLot` (lot number
   unique constraint → "This product already has lot <#>"). Business rules are Stage 2.

## Done when (Stop 1)

- `mix ecto.reset` + seeds + `mix rockcut.synthetic.setup` clean; `mix test` green;
  `MIX_ENV=test mix compile --warnings-as-errors --force` clean; vitest, `tsc`, `vite build` clean;
  the ingredients Playwright folder green.
- Reply with commits, test counts, and `LEAD:` notes for anything the spec or plan left open.

---

# Stage 2 (API)

2026-11-18 · lead. Stop 1 accepted (`edd42df`, `78fdcf1`, `56bd6c2`, `e4714bc`). Your LEAD notes:

1. **Company Delete wording:** use the specific reason in both places: the API refusal says the
   same sentence as the reason under the button ("This company has maltster products and supplier
   offers; deactivate it instead"). One function builds it.
2. Decimals: accepted as you did them (singular/plural, whole number, trailing zeros, 2-decimal
   sacks, popup unrestricted).
3. Accepted; keep the vitest for the fractional-sack case.
4. **Lot numbers:** trim on save, and treat them **case-insensitively** within a product (`w123`
   is lot `W123`; receiving into it adds to that lot). Make the unique index case-insensitive
   (`COLLATE NOCASE` or a lower() expression) with a migration that renames clashing duplicates the
   same way; the lot keeps the spelling it was first entered with.
5. Yes: offer delete → 422 when an order line uses it (and when a contract line covers its
   supplier + product); contracts and orders join the company Delete rule. No 500 anywhere.
6–7. Accepted. 8. Good; and ask before adding a migration while the server is up, as you said.

## Do (plan Stage 2; spec §3)

Every rule gets a refusal test and an allowed test. Flat params, as the rest of the API.

1. **Contracts** — `/api/contracts` (index `?year=`, show, create, update, delete; lines in the
   body as a full list) and `GET /api/contracts/shortfall?year=`.
   - `Authz`: `can?(user, :read, :contracts)` = Brewery member; `can?(user, :write, :contracts)` =
     owner or `manages_department?(user, brewery)`. Devices denied. Boundary and device-matrix
     tests updated.
   - Supplier must hold `supplier`; product unique per contract; one contract per supplier + year
     (422 "BSG already has a 2027 contract").
   - Saving a line with a new or changed price writes an offer price row on **that supplier's
     active offer for the product** (422 "Add a <supplier> offer for <product> first" if none;
     several offers → the line names the offer, `offer_id` in the body, required then),
     `effective_on = max(Jan 1 of year, today Colorado)`, note "Contract <year>". Unchanged prices
     write nothing.
   - Read JSON per line: `contracted_sacks`, `contracted_dollars`, `on_order_sacks` (open,
     on-contract order lines, this supplier + product, `ordered_on` in the year),
     `received_sacks`/`received_dollars` (received, on-contract lines, `received_on` in the year,
     dollars at the line prices), `remaining_sacks` (may be negative) and `over_by` when negative.
   - Delete: 422 once anything was received against it in its year.
   - Shortfall: per product with a contract line in the year: contracted, received, short
     (contracted − received when > 0), sorted by short descending.
2. **Orders** — `/api/purchase_orders` (index with `supplier_id`, `status`, `from`, `to`; show;
   create; update; `POST /:id/cancel`; `POST /:id/receive`).
   - Lines' offers belong to the order's supplier (422); sacks whole ≥ 1; price defaults to the
     offer's current price when omitted; `ordered_on` not after today (Colorado), like movements;
     `expected_on` ≥ `ordered_on` when set.
   - Update replaces header and lines while `open`; cancel sets `cancelled` + who/when. Any write on
     a received or cancelled order → 409 "This order has already been received" / "…cancelled".
   - JSON: lines with offer (order name, sack size, product label), `line_dollars`; totals
     `total_sacks`, `total_lb`, `total_dollars`; `target` = supplier's `order_target_sacks` and
     `next_multiple` (smallest multiple ≥ total sacks, at least one target) when the supplier has a
     target.
3. **Receive** (spec §3.3, A3) — body: `received_on` (≤ today) and per line `sacks_received` (≥ 0)
   with `allocations: [{lot_id} | {lot_number, features?, notes?}, sacks]`.
   - Defaults when a line has no allocations: the product's **previous lot** (most recent
     `received_date` among its non-expired lots with `sack_size_lb` = the offer's sack size), all
     sacks to it; none → 422 "Enter a lot number for <product>".
   - A `lot_number` matching an existing lot of the product (case-insensitive, trimmed) adds to it;
     its sack size must equal the offer's (422 "Lot X holds 50 lb sacks; use a new lot number");
     otherwise a new lot (supplier and sack size from the offer, `received_date` = `received_on`,
     specs from the standard plus any `features` given, as Add lot).
   - Allocations' sacks must add up to `sacks_received` (422). `sacks_received` 0 → no movement.
   - Each allocation writes a **Received** movement: `quantity_lb` = sacks × sack size,
     `occurred_on` = `received_on`, `purchase_order_line_id`, `unit_cost_per_lb` = line price ÷
     sack size. Existing lots keep their `received_date`. Lot status follows on-hand as in D60.
   - Order → `received`, `received_on`, who/when, line `sacks_received` stored. One transaction
     with `BEGIN IMMEDIATE`; status re-checked inside it (a second receive → 409). Test two
     parallel receives (one wins).
4. **Valuation** (`Ingredients.Valuation`, spec §3.4, A4 = **most recent costed receipt**).
   - `on_hand_as_of(lot or product, date)` = movements with `occurred_on` ≤ date; `cost_per_lb(lot,
     date)` = `unit_cost_per_lb` of the latest costed Received movement on or before date (ties:
     highest id); none → estimate = the lot's supplier offer for its product, price in effect on
     date ÷ sack size, `estimated: true`; no price → `unvalued: true`, value null.
   - Lot JSON gains `cost_per_lb`, `value`, `estimated`, `unvalued` (today).
   - `GET /api/ingredient_totals/inventory?as_of=&supplier_id=&maltster_id=&category_id=`: rows per
     maltster product with stock on that date (grain, maltster, category, `lb`, `expired_lb`,
     `sacks` when all its lots share a sack size else null, `value`, `per_lb`, `estimated` if any
     lot estimated, `unvalued_lb`), and `total` {lb, value}. `as_of` ≤ today (422).
   - `GET /api/ingredient_totals/orders?from=&to=&supplier_id=&status=`: one row per order line
     (ordered_on, supplier, reference, product, status, sacks_ordered, sacks_received, lb, dollars
     per decision 35), `by_supplier` subtotals and `total`. Cancelled excluded unless
     `status=cancelled`.
5. **Reorder** (`Ingredients.Reorder`, spec §3.5).
   - `min_on_hand_sacks` writable on product update (any Brewery member).
   - `GET /api/ingredient_reorder`: products with a minimum: reorder offer (offer of the most
     recent order line for the product, else the first active offer by id; `?offer_id[<product>]`
     not needed: the UI passes the chosen offer when starting an order), `on_hand_sacks`
     (non-expired lb ÷ that offer's sack size, 2 dp), `on_order_sacks` (open lines, any supplier),
     `to_order` = ceil(min − on hand − on order) when > 0 else 0, `below_minimum`.
   - `below_minimum` on the product JSON and on Grains list rows.
6. **Delete rules joined:** company delete reason/refusal includes contracts and orders; offer
   delete 422 when an order line or contract covers it (item 5 above).
7. **Lot numbers** (LEAD 4): trim + case-insensitive uniqueness per product, migration as above
   (ask before adding it while the server is up).

## Done when (Stop 2)

`mix test` green twice; `MIX_ENV=test mix compile --warnings-as-errors --force` clean; the
ingredients Playwright folder still green (no UI yet beyond Stage 1). Reply with commits, counts and
`LEAD:` notes, including whether Stage 3 looks too big (the plan's fallback: Totals as its own
deliverable).

---

# Stage 3a (UI: orders and receiving)

2026-11-18 · lead. Stop 2 accepted (`c7dfffa`, `df33a0e`, `b92a505`). Your LEAD notes:

1, 2, 4, 5, 9, 10, 11: accepted as built.
3. **Yes, `offer_id` on contract lines** (migration; add it and migrate the dev DB yourself, as
   last time). Set when the line is saved (required when the supplier has several offers for the
   product, inferred when one); later price changes use it. Existing rows: none outside tests.
6. **Receiving into an expired lot is refused:** 422 "Lot X is expired; use a new lot number" (by
   id or by number). Other defaults accepted (left-out line = in full into the previous lot;
   missing `received_on` = today).
7. **Inactive offers:** refused on new or changed order lines (422 "That offer is inactive");
   lines already on an open order keep theirs. The reorder offer skips inactive offers (the latest
   order's offer if active, else the first active).
8. Accepted; the To order page lists such a product with "No offer" and no number.
12. **Split accepted:** Stage 3a (this) and 3b (contracts, To order, Totals, lint), with a stop
   between. If 3a runs long, say so at Stop 3a.

## Do (plan Stage 3; spec §4 items 1, 5, 6, 7)

1. The API changes from notes 3, 6, 7 above, with tests.
2. **Orders list** `/ingredients/orders` (nav: a Purchasing entry in the Ingredient Library's top
   row, next to Companies/Categories): open orders first, then received and cancelled newest first;
   filters supplier and status; columns order date, supplier, reference, sacks, $, status, expected.
   Phone: cards.
3. **New / Edit order dialog:** supplier (suppliers only), order date (default today, max today),
   expected date, reference, off-contract switch, notes; lines: offer picker limited to the
   supplier's active offers (order name · product · sack size · milled/whole), sacks (whole
   numbers), price (prefilled with the current price, `DecimalInput`, 2 decimals), remove line, Add
   line. A running total under the lines: "36 sacks · 1,980 lb · $1,512.00", and when the supplier
   has a target "36 of 40 sacks" (reaching a multiple reads "40 of 40 sacks"; above it "44 of 80").
   Save locks as every dialog. Phone: full screen.
4. **Order page** `/ingredients/orders/:id`: header, lines (ordered / received once received,
   price, $), totals; **Edit** and **Cancel** (confirm "Cancel this order? Nothing has been
   received.") while open; **Receive**; read-only once received or cancelled with who/when.
5. **Receive dialog:** received date (default today, max today); per line: sacks received (default
   ordered; "Received in full" is just leaving it), and where it goes: the previous lot preselected
   ("Lot W123 · received 2026-10-02 · 8 sacks on hand"), or **New lot #** (lot # box, specs from the
   standard collapsed under "Specs", editable as in Add lot), **Add lot #** to split (rows must add
   up; show "6 + 4 = 10 of 10"). A line with no previous lot starts on New lot #. Received 0 hides
   the lot rows. Errors from the API shown on the line they belong to where possible.
6. **Product page:** Minimum on hand (sacks, edit inline or in the product dialog), a **Below
   minimum** chip next to on hand; an **Open orders** section (order date, supplier, sacks, link);
   lots table gains **$/lb** and **Value** (estimated marked "est.", unvalued "—").
7. **Grains list:** Below minimum chip on the row (and card).
8. **Companies:** suppliers get **Order target (sacks)** in the dialog and a column.
9. 360 px: no sideways scroll on every page above; dialogs full screen. Look at it in a browser as
   `brewer1` and `owner` (desktop and 360 px), and `bartender1`/`breweryDevice` refused.
10. Playwright (`tests/regression/ingredients/`): orders (create with target progress, edit,
    cancel, received read-only), receive (in full into the previous lot, short, split, new lot,
    expired lot refused), product page minimum/below-minimum/open orders/value, phone, slow
    double-click on New order Save and Receive Save. `[TEST-TEMP]` suppliers and products only.

## Done when (Stop 3a)

vitest, `tsc`, `vite build` clean; lint no worse (21, or fewer if you touch a 4084 file in passing);
`mix test` green; the ingredients Playwright folder green twice. Reply with commits, counts, `LEAD:`
notes, and whether 3b still fits in D61.
