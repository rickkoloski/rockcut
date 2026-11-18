# D60: Grain catalog and inventory — Plan

2026-11-17 · lead. **Spec:** `specs/d60_grain_catalog_inventory_spec.md` (approved 2026-11-17).
**Tasks:** 3843, 4982, 5203 (ingredient screens), 4084 (ingredient screens). **Branch:**
`d60-ingredients-recipes` in `~/src/rockcut`, from `develop` @ `672a0d0`.

## Where things are today

- Schemas in `RockcutApi.Brewing` (`ingredient.ex`, `ingredient_lot.ex`,
  `ingredient_category.ex`, `category_field_definition.ex`); CRUD in `brewing.ex`; routes in the
  `:brewery` scope of `router.ex` (`ModuleAccessPlug, module: :brewery`, which already refuses
  devices). The UI is the **Ingredient Library** (`/ingredients`, `IngredientsList`,
  `IngredientDetail`, `IngredientFormDialog`, `IngredientLotDialog`); categories moved to
  `/ingredients/categories` in D52 (the spec's "Settings → Categories" means this page,
  `CategoryDetail`).
- Lot spec numbers are columns read by `Formulas.Functions.BrewingCalcs` (`est_og` uses
  `fgdb × 0.46`, `est_ibu` uses `alpha_acid`) and set in `IngredientLotDialog`.
  `Formulas.Functions.Inventory.on_hand` counts available lots.
- `seeds.exs` seeds categories, the Grains Origin/Maltster definitions and 38 grain names; prod
  runs it through `RockcutApi.Release.seed()`. The synthetic seed has no ingredient data.
- Per-person view settings live in `Accounts.BoardSettings` (a closed set keyed by board; the
  Gantt uses `"production"`).

## Shape

- A new context **`RockcutApi.Ingredients`** (schemas under `lib/rockcut_api/ingredients/`):
  `Party`, `PartyRole`, `Product` (maltster product), `FeatureType`, `CategoryFeatureType`,
  `ProductFeatureValue`, `LotFeatureValue`, `SupplierOffer`, `OfferPrice`, `Movement`, with
  submodules `Parties`, `Products`, `Features`, `Offers`, `Inventory`. `Brewing.IngredientLot` and
  `Brewing.Ingredient` stay where they are and gain the new associations.
- **One allocation function** (`Inventory.allocate/3`): a product, a quantity, and `:oldest_first`
  or a lot id → a list of `{lot, quantity}` or `{:error, :short, on_hand}`. Outgoing movements and
  total counts both use it. Order: `received_date`, then lot id. Writes in one transaction with
  `BEGIN IMMEDIATE` (as D32's series writes) so two brewers can't take the same sacks.
- Quantities in the API are **lb as decimals**; sacks are a UI conversion with the lot's sack size.
- **One units module per side:** `src/lib/brewingUnits.ts` (conversions, sacks ↔ lb, formatting)
  and `RockcutApi.Ingredients.Units` (the 46.214 constant; `est_og` uses it).

## Stages (each its own commits; stops marked ■)

1. **Schema, migrations, seeds** (spec §3, §6, Appendix A/B).
   - Migrations: `ingredient_categories.parent_id`; `parties`, `party_roles`;
     `ingredient_products`; `feature_types`, `category_feature_types`, `product_feature_values`,
     `lot_feature_values`; `supplier_offers`, `supplier_offer_prices`; lot columns
     (`product_id`, `supplier_party_id`, `sack_size_lb`); `inventory_movements`. Then a data
     migration: seed the 7 feature types, copy every lot's spec columns into
     `lot_feature_values`, drop the old columns (`color_lovibond`, `extract_potential_fgdb`,
     `protein_perc`, `moisture_perc`, `diastatic_power_linter`, `alpha_acid`, `attenuation`,
     `maltster`, `supplier`, `order_name`, `order_unit_size`, `properties`), delete the Grains /
     Origin and Grains / Maltster definitions. Existing lots get no movements (lots have no
     quantity today), so they start at 0 on hand.
   - `seeds.exs`: stop seeding Origin/Maltster; add the five Grains children and assign the 38
     grains (Appendix A) only while a grain is still on the Grains parent (so later moves by hand
     stick); applicability of the five features to Grains. A new `priv/repo/seeds/grain_reference.exs`
     (called from `seeds.exs`, idempotent by name): 8 parties with roles, 44 maltster products with
     standard specs, offers (order name, sack size, milled from "(milled)"), Appendix B corrections.
   - Synthetic seed: a few `[SEED]` lots and movements (Rahr 2-Row with two lots for the
     oldest-first scenarios; one partner brewery "[SEED] Mountain Brewing") so DEV has inventory.
   - ExUnit: migration copy (a lot with every column set round-trips into feature values), seeds
     run twice without duplicates, Appendix A mapping complete (all 38 placed).
   - ■ **Stop 1:** `mix ecto.reset` + seeds + synthetic setup clean; `mix test` green. Report.
2. **API** (spec §3.2–3.9). Every rule gets a refusal and an allowed case.
   - Routes in the `:brewery` scope: `parties` (+ roles in the body), `ingredient_products`,
     `feature_types` (read), `supplier_offers`, `supplier_offers/:id/prices` (list, create),
     `inventory_movements` (list by product or lot, create), `ingredient_products/:id/count`
     (create; `mode: total | by_lot`). Extend `ingredient_lots` (product, supplier, sack size,
     features, `on_hand_lb`; create takes the first movement: kind + quantity).
   - Rules: party roles closed set; a maltster product's maltster must hold `maltster`, an offer's
     supplier `supplier`, a trade/loan's party `partner_brewery`; feature values against the
     type's range and the category's applicability; `entered_value`/`entered_unit` only with a
     known unit for that feature; current price = latest `effective_on` ≤ today (Colorado);
     movement can't take a lot below 0 (422 with on-hand); movements can't be updated or deleted;
     lot delete only with one movement and no `recipe_ingredients`; party in use → 422
     "deactivate instead"; lot status follows on-hand except `expired`.
   - Counts: total → difference via `allocate` (shortfall oldest first, overage onto the newest
     lot); by lot → one adjustment per changed lot; one count date.
   - `BrewingCalcs`: read `lot_feature_values`; `est_og` uses `Units.ppg/1` (46.214). Test that
     `est_og`/`est_ibu` match the old results for the same inputs within rounding.
     `Inventory.on_hand` formula → the sum of movements in lb.
   - `BoardSettings`: board key `"ingredients"`, setting `quantity_display` ∈ `sacks`, `lb`
     (default `sacks`).
   - Authz: these routes are already Brewery-only through `ModuleAccessPlug`; add the new
     resources to the brewing area in `Authz` so the D31 boundary test stays green. Tests:
     `brewer1`, `floater`, `splitRole`, `owner` allowed; `bartender1`, `office1` 403; a device
     token 403 on every new route.
   - ■ **Stop 2:** `mix test` green twice, `--warnings-as-errors` clean. Report.
3. **UI** (spec §4, §5).
   - Shared pieces first: `DecimalInput` (4982: `type="text" inputMode="decimal"`, `,` or `.`,
     message on anything else; used by every number box touched here), `QuantityInput` and
     `formatQuantity` (sacks + lb or lb, from the account setting), `ConvertButton` + popup
     (Extract, Color, Diastatic power; vitest for every formula in spec §3.5 and the as-is
     moisture requirement).
   - **Grains list** at `/ingredients` for the Grains category (other categories keep today's
     view until D62): grouped by child category, product rows, columns, search and filters,
     the toggle in the toolbar; phone cards.
   - **Maltster product page** `/ingredients/products/:id`: standard specs, offers + price history,
     lots (changed-from-standard marks), movement history, Add lot / Record movement / Count.
   - Dialogs: grain, maltster product, offer, price, Add lot, Record movement, Count (total / by
     lot). Companies page `/ingredients/companies`.
   - `IngredientLotDialog` for non-grain categories reads and writes alpha acid / attenuation
     through the feature values (behavior unchanged). The recipe lot picker label shows
     "maltster · lot #".
   - 5203: `id`/`labelId` on the three ingredient selects (or the new screens' selects);
     4084: `pnpm lint` shows no errors under `pages/ingredients/` and the new components.
   - Look at it in a browser as `brewer1`, `breweryMgr`, `owner`, `bartender1` and
     `breweryDevice`, at desktop and 360 px.
4. **Playwright + coverage.**
   - `rockcut-ui/tests/regression/ingredients/` from spec §9, one file per persona group.
     `[TEST-TEMP]` products, lots and parties, cleaned up by id; never touch `[SEED]` or the
     reference rows. Inventory is asserted by the API's `on_hand_lb` and on screen.
   - `tests/COVERAGE.md` D60 section.
   - ■ **Stop 3:** the full local gate.

## Gate

As D44's trial order (local gate → local independent QA → shorter DEV QA), with the two additions
the D44 trial asked for, now in the local QA brief: a **360 px no-sideways-scroll** check on every
new page and a **slow-network pass** (Chrome "Slow 4G") on Add lot, Record movement and Count
(double-submit must not write two movements). The QA brief lists the destructive actions by exact
id on its own `[TEST-TEMP]` rows. Record local and DEV cycle counts in the PR.

## Release

- Migrations drop columns, so rollback past this release needs the pre-release snapshot (as D55).
  Prod has no lots; the copied data is empty there.
- After deploy, run `RockcutApi.Release.seed()` on prod (reference data + category mapping), then
  check: 38 grains placed, 44 products, 8 parties, no Origin/Maltster definitions.
- Matt checks the reference data before the brewery uses it (spec §6).

## Risks

- **Oldest-first under concurrency:** two brewers drawing from the same product at once. Hence
  `BEGIN IMMEDIATE` and recomputing on-hand inside the transaction; test two parallel requests
  for more than half the stock (one wins, one gets 422).
- **Feature values as rows** make the list query heavier (five values per product). Load them in
  one query and pivot in Elixir; check the list with 44 products + lots stays fast.
- **Decimal handling:** store lb and feature values as decimals, never floats, end to end;
  `DecimalInput` sends strings.
- **Recipes still point at lots** until D63; the lot picker must keep working and `est_og` must not
  move. Covered by the Stage 2 parity test and the Grain Bill scenario.
- **Grain names that carry the maltster** (Pilsner-Barke, Munich Barke) stay as grains; renaming
  is Matt's call after seeding.
