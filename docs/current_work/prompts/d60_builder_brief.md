# D60 builder brief — Stage 1 (schema, migrations, seeds)

2026-11-17 · lead → builder.

**Read first:** `docs/current_work/specs/d60_grain_catalog_inventory_spec.md` (approved) and
`docs/current_work/planning/d60_grain_catalog_inventory_plan.md`. This brief covers **plan
Stage 1 only**. Stop after it and report; Stage 2 (API) comes as a separate brief.

**Where:** `~/src/rockcut`, branch `d60-grain-catalog` (already checked out; don't switch).
Commit in small commits (`feat: D60 …`), staging paths by name. No push, merge or rebase. The lead
owns the servers; Stage 1 needs only `mix` commands (stop and ask if you need the dev server
restarted).

## Do

1. **Schemas** in a new context `RockcutApi.Ingredients` (`lib/rockcut_api/ingredients.ex` +
   `lib/rockcut_api/ingredients/`), per spec §3 and the plan's "Shape": `Party`, `PartyRole`,
   `Product` (table `ingredient_products`), `FeatureType`, `CategoryFeatureType`,
   `ProductFeatureValue`, `LotFeatureValue`, `SupplierOffer`, `OfferPrice`
   (table `supplier_offer_prices`), `Movement` (table `inventory_movements`). Changesets with the
   basic validations (required fields, closed sets: party roles `maltster|supplier|partner_brewery`,
   movement kinds `opening|received|used|traded_out|traded_in|loaned_out|loaned_in|count`, offer
   form `milled|whole`), unique constraints from spec §3. Business rules (sign of a movement,
   below-zero, role checks across tables) are Stage 2; leave them out unless they're one-line
   changeset checks.
   - Quantities and money and feature values are `:decimal`. Movement quantity is signed lb.
   - `entered_value` (decimal) and `entered_unit` (string) on both feature value tables, nullable.
2. **Existing schemas:** `IngredientCategory` gets `parent_id` (+ `belongs_to :parent`,
   `has_many :children`). `IngredientLot` gets `product_id`, `supplier_party_id`, `sack_size_lb`,
   `has_many :feature_values`, `has_many :movements`, and loses the dropped columns (item 3).
   `Ingredient` gets `has_many :products`. Keep `IngredientLot`'s `status` set
   (`available depleted expired`).
3. **Migrations** (timestamps after `20261114120001`), in this order:
   - create the new tables and add the new columns;
   - a data migration that inserts the 7 feature types (spec §3.4 keys and ranges: extract,
     protein, moisture, alpha acid, attenuation 0–100; color, diastatic power 0–1,000; unit labels
     `% FGDB`, `°L`, `°Lintner`, `%`), then copies every lot's non-null `color_lovibond`,
     `extract_potential_fgdb`, `protein_perc`, `moisture_perc`, `diastatic_power_linter`,
     `alpha_acid`, `attenuation` into `lot_feature_values`, and deletes the Grains / Origin and
     Grains / Maltster rows of `category_field_definitions`. Use SQL (`execute/1`) or
     `repo().insert_all` with schemaless queries, **not** the app schemas, so the migration still
     runs after the schemas change;
   - drop `color_lovibond`, `extract_potential_fgdb`, `protein_perc`, `moisture_perc`,
     `diastatic_power_linter`, `alpha_acid`, `attenuation`, `maltster`, `supplier`, `order_name`,
     `order_unit_size`, `properties` from `ingredient_lots`. SQLite: check how D55 dropped its two
     columns and do the same.
   - Every `down` that's feasible; the drop's `down` can re-add the columns empty.
4. **Code that reads the dropped columns** must keep compiling and working:
   `Formulas.Functions.BrewingCalcs` (`est_og` FGDB, `est_ibu` alpha acid) reads
   `lot_feature_values` by feature key instead; `Brewing` lot CRUD and `IngredientLotController`/
   its JSON view stop accepting/returning the old fields and return the lot's feature values as a
   map keyed by feature key (Stage 2 finishes the API; here just don't break it). Leave `est_og`'s
   0.46 factor for Stage 2. Existing tests that set the old columns get updated to feature values.
5. **`priv/repo/seeds.exs`:**
   - stop seeding Grains / Origin and Grains / Maltster;
   - create the five Grains children (`Base`, `Crystal/Caramel`, `Kilned`, `Specialty`,
     `Roasted`, in that order) and move each of the 38 grains into its child per spec
     Appendix A — **only while the grain is still on the Grains parent**, so a later move by hand
     sticks;
   - category applicability: the five grain features on Grains (none required); alpha acid on
     Hops; attenuation on Yeast Strains.
6. **Reference data** in a new `priv/repo/seeds/grain_reference.exs`, run from `seeds.exs`,
   idempotent by name (re-running inserts nothing new). Source: `grain_lots_raw` in
   `git show 1694c09^:rockcut_api/priv/repo/seeds.exs`. Per spec §6 and Appendix B:
   - 8 parties: Rahr, Root Shoot, Weyermann, Simpsons, Crisp, Dingemans, Grain Millers (maltster
     role) and BSG (supplier); Root Shoot also supplier. "RS" in the data = Root Shoot.
   - one maltster product per row (44): grain + maltster, no product name, standard specs as
     `product_feature_values` (skip nils; keep 0 diastatic power as 0).
   - one supplier offer per row: supplier, order name (nil for Root Shoot rows), sack size from
     `order_unit_size`, form `milled` when the order name contains "(milled)", else `whole`.
   - corrections: "Dingmans" → Dingemans; Brown Malt's order name → "Crisp - Brown Malt".
   - no prices, lots or movements. Don't use the old lot numbers.
   Check `RockcutApi.Release.seed/0` runs the new file too (prod runs seeds through it).
7. **Synthetic seed** (`lib/rockcut_api/seeds/synthetic.ex`): a partner brewery
   `[SEED] Mountain Brewing` (role `partner_brewery`); two `[SEED]` lots of Rahr 2-Row (older:
   received 30 days ago, 3 sacks; newer: 7 days ago, 10 sacks; 55 lb; supplier BSG; feature
   values copied from the product standard) with Opening amount movements; cleaned up and rebuilt
   by the existing `[SEED]` reset like the other brewing rows. Depends on the reference data being
   seeded first; if it isn't (a fresh test DB), skip with no error.
8. **Tests** (ExUnit):
   - the data migration's copy: a lot with every old column set ends with matching
     `lot_feature_values` (test the copy SQL/function directly if a migration test is awkward;
     say which you did);
   - seeds run twice → same counts (categories, 38 grains all on a child, 44 products,
     8 parties with the right roles, offers); a grain moved by hand to another child isn't moved
     back; Origin/Maltster definitions absent;
   - `est_og` and `est_ibu` give the same numbers as before for the same inputs (fixture with
     feature values instead of columns);
   - synthetic setup run twice → the two `[SEED]` lots, not four.

## Don't

- No API routes, controllers for the new tables, or UI (Stages 2 and 3).
- Don't touch `CLAUDE.md`, the spec, the plan or `SESSION_HANDOFF_*`.
- No repo-wide `mix format`: format only the files you change.

## Done when

- `mix ecto.reset` then `mix rockcut.synthetic.setup` run clean on your local DB (the lead will
  restart the API server afterwards; tell the lead before you reset if the server is running).
- `mix test` green twice, `mix compile --warnings-as-errors` clean.
- Commits on the branch.
- Reply with: commits (sha + subject), files touched, test counts, the seeded counts
  (categories, grains per child, products, parties, offers), and anything you weren't sure about
  prefixed `LEAD:`.

---

# Stage 2 (API)

2026-11-17 · lead → builder. Stage 1 is in (`eb58f36`, `7544609`, `9f87a13`); the lead migrated
and seeded the local dev DB the prod way (migrate + `seeds.exs` + synthetic setup) and it matches
your counts. Your `LEAD:` notes are accepted: the display decimals, ranges moving to feature
types (below), children counted in `est_og`/`est_ibu`, the seed's any-child name check, `''` for
an empty product name in the unique index, the `[SEED]` company cleanup, "Rahr to Thee" kept
(Matt checks the reference data later). Lot specs not saving through the old dialog is fine until
Stage 3.

**Read first:** spec §3.2–3.9 and plan Stage 2. Same rules as Stage 1 (branch, commits, no push,
the lead owns the servers; the dev server is running on the migrated DB).

## Do

1. **Routes** in the `:brewery` scope of `router.ex`, controllers + JSON views in the existing
   style, all logic in `RockcutApi.Ingredients` submodules (`Parties`, `Products`, `Features`,
   `Offers`, `Inventory`):
   - `parties` (CRUD; roles as a list in the body; `?role=` filter; delete of a party in use →
     422 "This company is in use; deactivate it instead");
   - `ingredient_products` (CRUD; `?ingredient_id=`, `?category_id=` including children,
     `?maltster_id=`, `?supplier_id=`, `?on_hand=true`); the JSON includes the grain, category,
     maltster, standard features as a map by feature key (value, `entered_value`, `entered_unit`),
     offers with their current price, and `on_hand_lb`. The list loads features, offers, prices
     and on-hand in a fixed number of queries (no N+1); say how many;
   - `feature_types` (index only; with the categories each applies to);
   - `supplier_offers` (CRUD), `supplier_offers/:id/prices` (index newest first, create);
   - `ingredient_lots`: add product, supplier, `sack_size_lb`, features, `on_hand_lb`; **create**
     takes the first movement (`initial_kind` = `opening|received`, `initial_quantity_lb` > 0)
     and, for a lot with a product, copies the product's standard features unless the body gives
     its own; a lot's features can be updated; old spec fields stay ignored;
   - `inventory_movements` (index by `product_id` or `lot_id`, newest first; create). Create takes
     `kind`, `quantity_lb` (> 0; the sign comes from the kind), `occurred_on`, `note`, `party_id`,
     and either `lot_id` or `product_id` with `allocation: "oldest_first"`. No update or delete
     routes;
   - `ingredient_products/:id/count`: `mode: "total"` with `counted_lb`, or `mode: "by_lot"` with
     `lots: [%{lot_id, counted_lb}]`; `counted_on`; returns the adjustments written.
2. **Rules** (spec §3; each with a refusal and an allowed test):
   - roles closed set; a product's maltster must hold `maltster`, an offer's supplier `supplier`,
     a trade/loan's party `partner_brewery` (and is required for those four kinds, refused for the
     others);
   - feature values: the type must apply to the product's/lot's category (or a parent), value
     within the type's min/max (this replaces the old column ranges), `entered_unit` from a closed
     list per feature (`extract_fgdb`: `fgdb`, `as_is`, `ppg`; `color_lovibond`: `lovibond`, `srm`,
     `ebc`; `diastatic_power_lintner`: `lintner`, `wk`) and only together with `entered_value`.
     The API stores what it's sent; the conversion math is the UI's (Stage 3);
   - current price = latest `effective_on` ≤ today **Colorado** (reuse the Colorado-today helper the
     task boards use); a future-dated price doesn't show as current yet;
   - `Inventory.allocate/3` per the plan's Shape: received date then lot id; inside a
     `BEGIN IMMEDIATE` transaction that recomputes on-hand; short → `{:error, :short, on_hand_lb}`
     → 422 with the on-hand in the message. Outgoing movements and total counts both use it;
     a total-count overage goes onto the newest lot; by-lot writes one adjustment per changed lot;
   - a movement can't take a lot below 0; lot status follows on-hand (`depleted` at 0,
     `available` above) unless it's `expired`;
   - lot delete only with exactly one movement and no `recipe_ingredients` → otherwise 422;
   - categories: the category changeset accepts `parent_id` (one level: a child can't have
     children; a category can't be its own parent).
3. **Formulas:** `est_og` uses `Ingredients.Units.ppg/1` (FGDB % × 46.214 ÷ 100) and treats
   `efficiency_target` as a **percentage** (68 → 0.68). **Matt approved this fix (2026-11-17):**
   the OG estimate changes, so update the parity test deliberately, with the new expected numbers
   worked out by hand in a comment. `Inventory.on_hand` formula → the product's or ingredient's
   on-hand lb from movements.
4. **`BoardSettings`:** board key `"ingredients"`, setting `quantity_display` ∈ `sacks`, `lb`
   (default `sacks`), saved through the existing board settings endpoint. Who may save it:
   anyone who can see the brewery module (check how `Authz` gates `{:board_settings, board}`).
5. **Authz:** add the new resources to the brewing area in `Authz` so the D31 boundary test stays
   green. Tests across the new routes: `brewer1`, `floater`, `splitRole`, `owner` allowed;
   `bartender1`, `office1` 403; a device token (`breweryDevice`) 403 on every new route.
6. **Concurrency test:** two parallel outgoing movements against the same product, each for more
   than half the on-hand: one succeeds, one gets 422, and on-hand never goes below 0.

## Don't

- No UI (Stage 3). No new migrations unless a rule needs an index or constraint (say so).
- Don't touch `CLAUDE.md`, the spec, the plan or `SESSION_HANDOFF_*`. Format only files you change.

## Done when

- `mix test` green twice, `mix compile --warnings-as-errors` clean.
- Commits on the branch.
- Reply with: commits, files touched, test counts, the query count for the product list, the new
  `est_og` numbers, and anything you weren't sure about prefixed `LEAD:`. If you need the dev DB
  migrated again, ask the lead.

---

# Stage 3 (UI)

2026-11-17 · lead → builder. Stage 2 is in (`b006ae7` … `f5ef099`). Your `LEAD:` notes are
accepted, including the extra safeguards, delete with zero or one movement, hop lots unchanged
until D62, per-key overrides on lot features, and the shared-connection concurrency test (dev and
prod run `pool_size: 1`, so writes are serialized anyway).

**One API change first (Matt, 2026-11-17; spec §3.7 updated):** `expired` stays a manual status,
but **Oldest first skips expired lots**: outgoing movements with `allocation: "oldest_first"` and
total-count shortfalls draw only from non-expired lots (a shortfall larger than the non-expired
on-hand is a 422 that says so). An explicit `lot_id` may still be an expired lot; a by-lot count
includes expired lots. Product JSON adds `expired_lb` (on-hand in expired lots; `on_hand_lb` stays
the total). Tests for each.

**Read first:** spec §4, §5, §9 and plan Stage 3. Same rules as before. The dev server is running
the branch's API; ask the lead if it needs a restart for the API change. The UI dev server
(`pnpm dev`, :5174) is the lead's too.

## Do

1. **Shared pieces** (with vitest):
   - `src/lib/brewingUnits.ts`: the five conversions in spec §3.5 (as-is needs moisture; returns
     an error if it's missing or ≥ 100), sacks ↔ lb with a sack size, `formatQuantity(lb, sackSize,
     mode)` ("12 sacks 22.5 lb" / "682.5 lb"; whole sacks only "12 sacks"; under one sack "22.5 lb"),
     and formatting a feature value by its type's decimals (the API drops trailing zeros).
   - `components/DecimalInput.tsx` (4982): `type="text" inputMode="decimal"`; accepts `,` or `.`
     as the decimal point; anything else shows a field message and isn't sent; sends a string.
   - `components/QuantityInput.tsx`: sacks + lb boxes or one lb box, following the account's
     `quantity_display`; returns lb.
   - `components/ConvertButton.tsx` + popup per feature (Extract: FGDB / As-is / PPG; Color: °L /
     SRM / EBC; Diastatic power: °Lintner / °WK): pick unit, type value, see the stored value,
     **Use** fills the field and remembers `entered_value`/`entered_unit`.
   - A hook for the `ingredients` board setting (`quantity_display`), read from `/api/me` and saved
     through the board settings endpoint like the Gantt's.
2. **Grains list** at `/ingredients` when the Grains category is selected (other categories keep
   today's view until D62): grouped by the five child categories (collapsible), one row per
   maltster product, grains without products on their own row. Columns per spec §4.1, on-hand
   formatted by the toggle with expired shown as "· 55 lb expired". Search; filters category,
   maltster, supplier, on hand only. The sacks/lb toggle in the page's top row. Phone width:
   cards (product, on hand, color, extract), no sideways scroll at 360 px.
3. **Maltster product page** `/ingredients/products/:id` (spec §4.2): standard specs with edit and
   the convert buttons, showing "entered as …" when a conversion was used; offers (order name,
   sack size, milled/whole, current price, $/lb, price history, add price with an effective
   date); lots (lot #, received, supplier, on hand, status, specs that differ from standard
   marked); movement history (date, kind, lot, quantity, partner, note, who); actions **Add lot**,
   **Record movement**, **Count**.
4. **Dialogs** (all `FormDialog` + `parseApiError`, labelled selects with `id`/`labelId`, numbers
   through `DecimalInput`/`QuantityInput`, full screen at phone width, Android back closes them via
   `useBackCloses`): grain (name, child category, notes); maltster product (grain, maltster,
   product name, standard specs); offer; price; Add lot (offer → supplier and sack size, lot #,
   received date, Opening amount / Received, quantity, specs prefilled from the standard,
   editable); Record movement (kind, lot defaulting to **Oldest first** for outgoing kinds, partner
   brewery shown and required for trades and loans, quantity, date, note; an expired lot is
   labelled "Expired" in the lot list); Count (one total by default, **Count by lot** switch with
   one `QuantityInput` per lot showing its on-hand; date). Disable the submit button while a save is
   in flight (no double movements on a slow network).
5. **Companies page** `/ingredients/companies`: list with role chips, add/edit (name, roles,
   notes, active), deactivate; the API's "in use" refusals shown as messages. Reachable from the
   Ingredient Library's top row.
6. **Categories page** (`/ingredients/categories`): Grains shows its children; add/rename a child
   (parent picker limited to top-level categories).
7. **Existing screens:** `IngredientLotDialog` for non-grain categories edits alpha acid /
   attenuation through the lot's `features` (behavior unchanged otherwise); the recipe lot picker
   label is "maltster · lot #" when the lot has a product. 5203: `id`/`labelId` on
   `IngredientLotDialog` Status, `IngredientsList` Category filter, `IngredientFormDialog`
   Category. 4084: `pnpm lint` shows no errors under `pages/ingredients/`, `pages/settings/` files
   you touch and the new components (run `pnpm lint` and report the before/after totals).
8. **Look at it** in the browser with token injection (`rockcut-ui/tests/RUNNING.md`) as `brewer1`,
   `breweryMgr`, `owner`, `bartender1` (refused) and `breweryDevice` (refused), at desktop and
   360 px, against the `[SEED]` Rahr 2-Row lots. Screenshots to `/tmp/claude-501/d60-shots/`.

## Don't

- No Playwright specs yet (Stage 4). Don't touch recipe, batch or Gantt screens beyond item 7.
- Don't touch `CLAUDE.md`, the spec, the plan or `SESSION_HANDOFF_*`.

## Done when

- `pnpm tsc`/`vite build` clean, vitest green, lint totals reported, `mix test` green twice for the
  API change.
- Commits on the branch.
- Reply with: commits, files touched, test counts, lint before/after, what you saw per persona,
  and anything you weren't sure about prefixed `LEAD:`.
