# D62 builder brief — Stage 1 (packs, units and manufacturer; grain unchanged)

2026-11-19 · lead → builder.

## Read first

- **Spec (approved):** `docs/current_work/specs/d62_hops_other_ingredients_spec.md`, including its
  Amendments.
- **Plan:** `docs/current_work/planning/d62_hops_other_ingredients_plan.md`.
- **Background:** the D60 and D61 specs in the same folder. D61 is on prod.

This brief covers **plan Stage 1 only**. Stop after it and report. Stage 2 (hops) comes as a
separate brief.

## Where and how

- `~/src/rockcut`, branch `d62-hops-other-ingredients`. It's already checked out; don't switch.
  The spec and plan are committed there.
- Commit in small commits (`feat: D62 …` / `fix: D62 …` / `refactor: D62 …`), staging paths by
  name. No push, merge or rebase.
- **Servers:** the lead owns them (API :4002, UI :5174). Ask before running migrations while the
  API is up, and ask for restarts.
- **Formatting:** don't run repo-wide `mix format`; format only the files you touch.
- Don't touch the git-excluded `docs/current_work/reference/` files. They're Stage 4's input.

## The goal of Stage 1

Rename D60/D61's grain-only vocabulary to the general model (**packs**, **quantity in the
product's unit**, **manufacturer**, **category keys**) **with no change in what a grain user sees
or can do**. Every existing D60/D61 ExUnit, vitest and Playwright test must pass after the rename,
with no assertion weakened. Grain screens still say "sacks" and "Maltster".

## Do

1. **Migrations** (timestamps after `20261119120000`). SQLite `ALTER TABLE … RENAME COLUMN` via
   Ecto `rename`. Check that indexes and foreign keys survive each rename.
   - **`ingredient_categories.key`** (string, null, unique index), set by name on top-level rows:

     | Name | Key |
     |---|---|
     | Grains | `grains` |
     | Hops | `hops` |
     | Fruits | `fruits` |
     | Spices & Flavorings | `spices` |
     | Sugars and Extracts | `sugars` |
     | Other Consumables | `consumables` |
     | Yeast Strains | `yeast` |
     | Future Ingredients | `future` |

     Children have no key. `seeds.exs` sets keys too (idempotent).
   - **Column renames:**

     | Table | From | To |
     |---|---|---|
     | `supplier_offers` | `sack_size_lb` | `pack_size` |
     | `ingredient_lots` | `sack_size_lb` | `pack_size` |
     | `inventory_movements` | `quantity_lb` | `quantity` |
     | `inventory_movements` | `unit_cost_per_lb` | `unit_cost` |
     | `parties` | `order_target_sacks` | `order_target_packs` |
     | `ingredient_products` | `min_on_hand_sacks` | `min_on_hand_packs` |
     | `ingredient_products` | `maltster_party_id` | `manufacturer_party_id` |
     | `purchase_order_lines` | `sacks_ordered` / `sacks_received` / `price_per_sack` | `packs_ordered` / `packs_received` / `price_per_pack` |
     | `supplier_offer_prices` | `price_per_sack` | `price_per_pack` |
     | `supplier_contract_lines` | `sacks` / `price_per_sack` | `quantity` / `price` |

     For `supplier_contract_lines.quantity`, keep the integer data. Its type becomes decimal in
     Stage 2 when hop lines arrive; if SQLite makes that awkward, do it now and say so.
   - **New columns:**
     - `pack_name` (string, not null, default `sack`) on `supplier_offers` and `ingredient_lots`.
     - On `ingredient_products`: `unit` (string, not null, default `lb`), `form` (string, null),
       `origin` (string, null).
   - **`party_roles.role`:** `maltster` → `manufacturer` (data update).
   - **`users.board_settings`:** `ingredients.quantity_display` `"sacks"` → `"packs"` (JSON
     update; `"lb"` stays and now means "total in unit").
   - **ExUnit:** run the migrations up on a database shaped like D61 (a product, offer, price
     history, lots with movements and cost, an order received, a contract, a user with the
     `sacks` setting). Every value survives under its new name.
2. **`Ingredients.Catalog`** (new):
   - Gives a category's key, or its parent's for a child.
   - `managed?/1`: true for `grains` only in Stage 1. Hops etc. are added in Stages 2–3.
   - `contract_unit/1`: `:packs` for grains.
   - Placeholders for `forms/1`, `units/1` and `pack_names/0` that Stages 2–3 fill.
   - **Replace every category-name check** with `Catalog`: `Inventory.grain_lot?/1`,
     `BrewingCalcs.get_category_ids/2` (by key: `hops`; `grains` + `sugars`), the seeds' lookups
     where sensible, and the UI's `grainCategories()` (the category JSON gains `key`; the UI uses
     it).
   - Test that renaming the Grains category changes nothing.
3. **Code rename** through API, UI and tests:
   - Schemas, changesets, contexts, controllers, JSON keys and UI types and props all move to the
     new names: `pack_size`, `pack_name`, `quantity`, `unit_cost`, `packs_*`, `price_per_pack`,
     `manufacturer`, `min_on_hand_packs`, `order_target_packs`.
   - Computed fields too: `on_hand_lb` → `on_hand` (plus `unit` in the JSON),
     `contracted_sacks` → `contracted`, and so on.
   - **No dual names** in the JSON.
   - Keep **grain wording** on screen: grain packs render "sack/sacks", and the role chip and
     labels say "Maltster" on grain screens.
   - The **Companies page chip and filter say "Manufacturer"**. That's the one visible change,
     per spec §3.2. Update tests that read it.
4. **`Units`:**
   - `format_quantity(qty, pack_name, pack_size, unit, mode)`, in the API (`Units`) and the UI
     (`formatQuantity` and friends):
     - "12 sacks 22.5 lb";
     - total mode "682.5 lb";
     - plural pack names (sack/sacks, box/boxes, bag/bags, pail/pails, jug/jugs, bottle/bottles,
       tub/tubs, case/cases);
     - **`each` is whole numbers** (unit tests only in Stage 1; no `each` product exists yet).
   - `quantity_display/1` returns `"packs"` | `"lb"`. Keep the stored value `"lb"` and label the
     toggle "Total" (grain still shows lb).
   - Refusal messages read in the product's unit.
5. **`Products.display_name/1`:**
   - Uses the manufacturer.
   - Grain names are unchanged.
   - A non-grain product adds the form ("Yakima Chief Citra T90 Pellet") once `form` is set (not
     used until Stage 2; unit-test it).
6. **`inventory_on_hand` formula** (spec §3.9):
   - With `product_id`: `{value, unit}`.
   - With `ingredient_id`: the sum when all its products share a unit; otherwise refused with the
     spec's message.
   - Update the formula catalog description and any UI that shows the result.
7. **Deferred register** (`docs/current_work/issues/deferred_register.md`):
   - DR-1 → Resolved: D60 made on hand the sum of movements; `inventory_on_hand` reads it, and
     D62 adds units.
   - DR-4 → claimed by D62 (inventory units) and D63 (recipe units).
8. **After the rename**, `grep -rniE "sack|quantity_lb|maltster"` over `rockcut_api/lib`,
   `rockcut-ui/src` and the tests. Every remaining hit must be grain **wording** or a test name.
   List them in your report by file, as one line each.

## Done when (Stop 1)

- **Setup:** `mix ecto.reset`, seeds and `mix rockcut.synthetic.setup` run clean.
- **ExUnit:** `mix test` green twice, and
  `MIX_ENV=test mix compile --warnings-as-errors --force` clean.
- **UI checks:** vitest, `tsc -p tsconfig.app.json`, `vite build` and `pnpm lint` (still the same
  8 errors, no new ones) all clean.
- **Playwright:** the `ingredients` project is green against the local servers. Ask me to restart
  them after the migrations; I'll run the full Playwright suite in its own tab.
- **Browser check:** drive the Grains list, a product page, Add lot, Count, an order with Receive,
  and a contract in a browser as `brewer1`, desktop and 360 px, and confirm the text reads exactly
  as before.
- **Reply with:**
  - your commits;
  - the test counts before and after;
  - the grep list from item 8;
  - `LEAD:` notes for anything the spec or plan left open;
  - the diff size (`git diff --stat develop`).

---

# Stage 2 (hops)

2026-11-20 · lead. Stop 1 accepted (`50cf495`, `59a7dd0`, `2888fe7`, `de5b576`, `aa92982`;
ExUnit 2,700 ×2, vitest 449, ingredients Playwright 56/56). Before this brief went out, the lead
ran the full local Playwright suite on Stage 1. Your LEAD notes:

1. **Toggle label:** the second button shows **the page's unit** wherever the page has one unit
   ("lb" on grain and hop pages, "gal" on a purée product page). It shows **"Total"** only where
   units mix (Totals, To order once Stage 3 lands). The first button stays "Sacks + lb" on grain
   pages; on other pages it reads by the pack and unit ("Boxes + lb" on hops). So grain reads
   exactly as before.
2. `by_unit` totals: accepted.
3. Unique index with form: accepted.
4. INTEGER `quantity` and the old FK name: accepted. Stage 2 changes the Ecto type; add a test that
   440.5 lb round-trips.
5. **"Order target (packs)":** do it in this stage, since hop boxes now count toward a target
   (A5). The order's running total says "packs" whenever the order mixes pack names, and keeps
   "sacks" for an all-grain order.
6. Accepted, all of it.
7. Accepted.
8. Accepted; Stage 2 opens `form`, `unit`, `origin` and `pack_name` for hops.
9. Pre-existing e2e tsc errors: leave them; note them in the Stop 2 report only if they change.
10. Check that `mix rockcut.synthetic.setup` removes the tagged supplier and its contract and
    order. If it doesn't, extend the cleanup the way D61 did for tagged products. Then rerun
    setup so your browser-check rows are gone.

## Do (plan Stage 2; spec §3.1 Hops, §3.4, §3.6 Hops, §3.7, §4; Amendments)

Every rule gets a refusal test and an allowed test.

1. **Migrations** (ask before running them while the API is up):
   - `category_feature_types` gains:
     - `product_mode` ∈ `none value range` (default `value`, which is grain today);
     - `lot_mode` ∈ `none copy enter` (default `copy`);
     - `lot_required` (bool, default false);
     - `only_unit` (string, null).
   - `product_feature_values.value_high` (decimal, null), plus the matching `entered_*` handling
     if you need it (ranges are typed directly; no convert popup for hop features).
   - New feature types:
     - `beta_acid_pct` "Beta acid" %, 0–100, **2 decimals**;
     - `total_oil_ml_100g` "Total oil" mL/100 g, 0–10, 2 decimals.
   - `alpha_acid_pct` decimals → **2**.
   - Hops applicability: alpha, beta and oil are `product_mode range`, `lot_mode enter`; **alpha
     is `lot_required`**.
   - `ingredient_lots.crop_year` (integer, null).
   - Delete the Hops `category_field_definitions` (Form, Origin, Crop Year) and stop seeding them.
   - **Any existing Hops lot without a product:** the migration raises with a clear message that
     lists the lots (prod expects none). Update the synthetic/test fixtures that make old-style
     hop lots so they go through a product.
2. **`Catalog`:**
   - `hops` becomes managed.
   - `forms("hops")` = T90 Pellet, Cryo, Whole leaf, Extract.
   - `units("hops")` = `lb`.
   - `contract_unit("hops")` = `:lb`.
   - Pack names: hops offers are fixed at `box` · 11 lb.
3. **API rules:**
   - **Hop product:** `form` required (from the list), `unit` = lb (set by the API), `origin`
     optional text (≤ 100). Manufacturer required, as for every product. Unique index with form.
     Display name "Yakima Chief Hops Citra T90 Pellet"; with a product name, "… Citra T90 Pellet
     (Lupomax)".
   - **Ranges:** product features in range mode take `{low, high}` (either may be blank, but if
     both are given, low ≤ high or 422 "Alpha acid: low is above high").
   - **Hop offer:** `pack_name` `box`, `pack_size` 11. Anything else gets 422 "Hop offers are
     11 lb boxes". Omitted, the API sets them.
   - **Hop lot** (Add lot, Receive with a new lot #, lot edit):
     - **`crop_year` required**, between 2000 and next year (Colorado);
     - **alpha required**;
     - beta and oil optional;
     - **ranges are not copied** to the lot (`lot_mode enter`).
     
     A lot value outside the product's range is allowed. The JSON marks it (`outside_range: [keys]`)
     for the UI.
   - **Contracts:**
     - Lines take grain (whole sacks, $/sack, as today) or hop products (**lb with 2 decimals,
       $/lb**, A1). Any other category gets 422 "Contracts are for grain and hops".
     - A hop line's price row on the offer = $/lb × 11, effective as D61 A2. A past year writes
       none.
     - On order, received and remaining for a hop line are by weight (boxes × 11 lb), shown in
       lb. Shortfall lines carry their unit.
     - Contract totals: grain sacks and hop lb separately, $ combined.
   - **Order target and running total:** packs across the order (A5), `by_unit` as now.
   - **Recipe lot label** (`/api/recipes/.../ingredients` or wherever the picker reads it): a hop
     lot is labelled "<product display name> · <lot #> · <crop year> · <alpha>% AA".
   - **`est_ibu`:**
     - ExUnit: a hop lot made through the new path (product + lot with alpha 12.40) gives the
       same IBU as a lot built the pre-D62 way with the same alpha, amount and time.
     - A recipe line on an old-style lot still works.
4. **UI:**
   - **Hops in the Ingredient Library:** the `GrainsList` layout, generalized, with per-category
     columns:
     - Hops: variety, manufacturer, form, origin, alpha / beta / oil ranges ("11–13"), on hand,
       suppliers with $/box.
     - Search; filters manufacturer, supplier, on hand only.
     - Phone: cards.
   - **Hop product page and dialog:**
     - Form picker, origin, and range inputs (low–high pairs).
     - Offers show "box · 11 lb" (read-only) and $/box with $/lb.
     - The lots table shows crop year, alpha / beta / oil, outside-range marks and value.
   - **Add lot / Receive (new lot #) for hops:**
     - Crop year (default the current year) and alpha (required), beta and oil.
     - Each with "typical 11–13" beside it; a value outside it is marked but saves.
   - **Contract dialog:** product picker offers grain and hops. A hop line shows "lb" and
     "$ / lb", with box equivalents beside them ("440 lb = 40 boxes").
   - Companies / party dialog: "Order target (packs)". Running total wording per note 5.
   - Toggle labels per note 1.
   - **Yeast and the other categories** keep the old lot screens until D64 / Stage 3.
5. **Playwright** (in `tests/regression/ingredients/`; a new `hops.spec.ts` is fine):
   - hop product with ranges, with the duplicate refused;
   - box-only offer;
   - Add lot with crop year and alpha (refused without them; outside-range mark);
   - Oldest-first use;
   - a mixed BSG order (sacks + boxes) with "packs" and the target;
   - receiving hops into a new lot;
   - a `[TEST-TEMP]` supplier's future-year contract with a hop line in lb (price row × 11);
   - the 360 px hop pages.
   
   `[TEST-TEMP]` rows only, cleaned up by id.

## Done when (Stop 2)

- `mix test` green twice; `--warnings-as-errors --force` clean.
- vitest, tsc, vite build clean; lint the same 8.
- The `ingredients` Playwright project green.
- **Browser check** as `brewer1` and `breweryMgr`, desktop and 360 px: every hop flow above; grain
  still reads as before.
- **Reply with:**
  - commits, counts and `LEAD:` notes;
  - the diff size so far;
  - **whether Stage 3 still fits D62.** Plan §Stages says Stop 2 is the split point.

---

# Stage 4 (hop reference data, Playwright, O9, coverage) — the last stage of D62

2026-11-20 · lead. **Stop 2 accepted** (`a82f2fd`, `dc17393`, `b32dd9a`, `0639511`, `bcb49cb`;
ExUnit 2,720 ×2, vitest 462, ingredients Playwright 63/63). **Matt split D62 at Stop 2:** Stage 3
(fruits, spices, sugars, other consumables) is now **D65**; see the spec's last Amendment and the
plan's Split section. Don't build any of it here. Your LEAD notes:

1. Accepted. **Add the API refusal for Hops now** (422 on creating a custom field definition on
   Hops), with a test; the other categories' clean-up is D65.
2. Accepted (`remaining_lb` / `over_lb`).
3–7. Accepted.
- The H2 cleanup failure with no captured error: if it shows again, capture the error text before
  making anything best-effort.

## Do (plan Stage 4; spec §7 and the hop Amendments)

1. **Hop reference seed** `priv/repo/seeds/hop_reference.exs`, evaluated by `seeds.exs` after the
   grain reference, idempotent, on every environment. **Embed the data in the file**: the CSVs
   are in the git-excluded `docs/current_work/reference/` (read them, don't reference them at
   run time):
   - `d62_hop_products.csv`: 27 products (variety, manufacturer = supplier, form, origin,
     alpha/beta/oil ranges; Pink Boots Blend has none).
   - `d62_hops_matt_2026-11-19.csv`: 28 lots (skip EKG, which has no lot # or alpha): lot #, crop
     year, alpha (2 decimals as given: 12.67, 15.40, 7.90), supplier, on-hand lb.
   - **Parties** (manufacturer + supplier roles): John Fearless (`JFear`), Lupulin Exchange
     (`LupEx`), Billy Goat (`BillyGoat`), Michigan Hop Alliance (`MHA`), Yakima Chief Hops
     (`YCH`), and BSG (exists: add manufacturer).
   - **Ingredients** in Hops: the variety names with the "(23)" / "(25-2)" / "(24-cryo)" labels
     removed. "Hallertau Mittelfrueh" becomes "Hallertau Mittelfrüh". "Pink Boots" becomes
     "Pink Boots Blend".
   - **Products:** each manufacturer + variety + form. Citra (24-cryo) is the **Cryo** product;
     everything else is **T90 Pellet**. Chinook has two products (Lupulin Exchange, Billy
     Goat).
   - **Offers:** one per product from its supplier, box · 11 lb, order name = the variety, **no
     price**.
   - **Lots:** product, supplier, lot #, crop year, alpha, `received_date` 2026-11-19, and an
     **Opening amount** movement of the listed lb dated **2026-11-19**, no `entered_by`.
   - **Idempotence:** a lot already present (same product + lot #, case-insensitive) is skipped
     and never topped up. Existing products, offers and parties are matched by name, never
     duplicated.
   - Lots under 1 box show correctly (Magnum 0.6 lb).
   - ExUnit: seed twice, and the counts are unchanged (27 products, 28 lots, 420.0 − 10.4 =
     409.6 lb in total). Spot-check Galaxy 71.0 lb / 17.6 % / 2025 and Citra Cryo 26.9 %.
2. **Tests that must not trip over the seeded hops:** any Playwright or ExUnit test that counts
   hop products, lots or inventory totals filters to its own `[TEST-TEMP]` rows. Tests and QA
   never edit or delete seeded hop rows.
3. **Playwright from spec §9:**
   - the *Stage 1*, *Hops* and *People, devices, edges* scenarios not already covered by
     `hops.spec.ts` and the D60/D61 specs;
   - including **two people, one record** (an open order with hop lines; a contract with a hop
     line) and **slow network** double-submit on hop Add lot and Receive;
   - `bartender1` and `breweryDevice` refused on every hop route.
4. **5911 O9:** find the race in `tests/regression/ingredients/owner.spec.ts` O9 (a reload or
   `goto` right after a write, or a phone dialog's `history.back()`, as PO7/P4 in D61). Fix it,
   then run O9 10× under the full ingredients project's load. Note what it was.
5. **`tests/COVERAGE.md`:** a D62 section, scenario → layer, with gaps marked.
6. **Stage 1 leftovers to tidy (no behavior change):** `Product`'s unique message ("This
   maltster already has that product for this grain.") becomes general ("<manufacturer> already
   has <form> <ingredient>"; grain keeps the old sentence). Do the same for
   `Inventory`'s "A grain lot needs its maltster product" (grain wording on grain only).

## Done when (Stop 4 = the local gate's build part)

- `mix ecto.reset` + seeds + synthetic setup clean (the seed shows 28 hop lots, 409.6 lb).
- `mix test` green twice; `--warnings-as-errors --force` clean; vitest, tsc, build clean; lint
  the same 8.
- The ingredients Playwright project green. **Ask me to run the full suite** in its own tab.
- Reply with commits, counts, the O9 cause, the COVERAGE gaps and `LEAD:` notes. After that, the
  lead writes the local QA brief.
