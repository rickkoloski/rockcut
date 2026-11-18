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
