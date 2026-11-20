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
