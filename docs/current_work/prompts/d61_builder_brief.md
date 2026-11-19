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
