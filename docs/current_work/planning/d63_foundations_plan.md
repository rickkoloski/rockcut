# D63: Foundations for recipes — Plan

2026-11-24 · lead. **Spec:** `specs/d63_foundations_spec.md` (approved by Matt 2026-11-24; A1–A9
answered). **Branch:** `d63-foundations`, from `develop` @ `0e9de47`. The builder works in
`~/src/rockcut`.

## Where things are (as of `0e9de47`)

- **Confirm dialog:** `rockcut-ui/src/components/ConfirmDialog.tsx` (41 files mention it). It has a
  one-press gate and an optional second answer (`onCancel`). `hooks/useBackCloses.ts` pushes a history
  entry while open, hands it over within a tick, and stacks for a confirm over a dialog. `FormDialog`
  uses it on phones (`phone`).
- **Brink History:** `pages/ingredients/BrinkDialogs.tsx`, `lib/rockcut_api/yeast/brinks.ex`.
- **Order footer:** `pages/ingredients/OrderPage.tsx` ~216 (`byUnitText(order.by_unit)`); New order's
  words come from its own summary (`lib/purchasing.ts`).
- **Catalog:** `lib/rockcut_api/ingredients/catalog.ex`. Other Consumables' children are matched by
  lower-cased **name** (`@consumable_children`: "water salts", "finings").
- **Allocation:** `Inventory.allocate/3` and `product_lots/1` (received date, id), used by movements,
  count shortfalls and pitches. UI copy: `lib/inventory.ts` `oldestFirst`, `MovementDialog`,
  `CountDialog`, `PitchDialog`.
- **Lots:** `IngredientLot` (`brewing/ingredient_lot.ex`); created in `Inventory.create_lot/2` and by
  receiving. `update_lot` refuses a product change once the lot has movements.
- **Ordered lists:** `pages/production/OrderedList.tsx` (handle, long-press, keyboard, arrows) over
  `components/dnd/`.
- **Per-account ingredient settings:** `accounts/board_settings.ex` (`@ingredients_types`,
  `@ingredients_defaults`, `@ingredients_names`), `hooks/useQuantityDisplay.ts`,
  `components/QuantityToggle.tsx`.
- **Permissions:** `authz.ex` ~505–530 (`:production`, `:ingredients`, `:yeast_settings`); devices are
  deny-by-default, with a D31 boundary/parity suite. UI: `DEVICE_PAGES` and the nav in `App.tsx`.
- **Seeds:** `priv/repo/seeds.exs` plus `seeds/{grain,hop,d65,d64}_reference.exs`, idempotent by name,
  run on every release (`Release.seed/0`).

## Shape

### Use order
- **Migration:** `ingredient_lots.use_position`, index on it; backfill per (ingredient, form) by
  received date, crop year, id; hops only (category key, not name).
- **Assign** max + 1 in the same transaction wherever a hop lot is inserted (add lot, receive into a
  new lot, synthetic and reference seeds). A shared function, with a test that covers each path.
- **`Ingredients.UseOrder`** (new): `list(ingredient_id)`, `use_order(ingredient_id, form)`,
  `reorder(ingredient_id, form, lot_ids, version, user)`. Reorder runs in the module's
  `BEGIN IMMEDIATE` write, rechecks the version inside it, and permutes the shown lots among the
  positions they hold.
- **`product_lots/1`** orders hops by `use_position`, then received date, then id. Overages must keep
  "newest by received date", so they no longer use `List.last(product_lots)` for hops. **This is the
  trap in this deliverable:** `count_parts` takes "newest" from the end of that list in three places.

### Catalog data migrations
One migration per topic, each reading rows by name and skipping with `Logger.warning "D63: …"` when
they aren't as expected: Process Aids rename (stops only on a duplicate), corrections, calcium chloride,
Pink Boots. On an empty database they do nothing. Seeds are edited in the same stop, with an ExUnit
test that runs migration + seed twice and one that starts from D64's data.

### Units g and mL
Find every list of units before adding them (API: `Catalog`, offers, `Units`, labels, refusals, Totals
subtotals, To order, whole-number rules; UI: `brewingUnits.ts`, `purchasing.ts`, dialogs). A lot's
`pack_size` limit is 10,000, so 10,000 mL fits exactly: test it.

### Brewery settings
`brewery_settings` single row created by its migration (and on first read if missing);
`RockcutApi.BrewerySettings` (context), controller, Authz `:brewery_settings` (`:read`, `:manage`).
The brewhouse device gets `:read` only. Page `/brewery/settings`.

## Stops

0. **Carry-ins** (spec §3): 6260, 6261, 6262, S16. No migrations.
1. **Catalog** (§5).
2. **Use order** (§4).
3. **Brewery settings** (§6), `[SEED]` data, COVERAGE.
Then: local gate → local QA → DEV Playwright + DEV QA.

Each stop ends with a report to the lead, and the next has its own brief. Expect a fix cycle after QA.

## Risks

| Risk | Guard |
|---|---|
| Back handling breaks a confirm that navigates away | Browser check each one; Playwright for the main ones |
| Count overages follow use order by mistake | ExUnit: newest-by-date lot isn't last in use order |
| A seed brings old rows back | Two-run test; a from-D64 test |
| A migration edits a value Matt changed | Old-value guard, with a test that a changed value is left |
| Playwright on the shared dev data | `[SEED]` hops only; reference rows are read-only in tests |
| A run crossing midnight | Don't start a long run after 23:00 (5911) |

## Release
Rollback restores the snapshot (spec §9). Read-only prod checks before it, and Matt's checks after.
