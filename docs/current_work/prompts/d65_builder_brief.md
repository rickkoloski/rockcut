# D65 builder brief — Stop 0 (carry the D62 DEV QA fixes)

2026-11-20 · lead → builder.

## Read first

- **Spec (approved):** `docs/current_work/specs/d65_fruit_spices_sugars_consumables_spec.md`,
  especially its last Amendment ("D62 DEV QA gaps carried into D65").
- **Plan:** `docs/current_work/planning/d65_fruit_spices_sugars_consumables_plan.md`, §Stages and
  stops, item 0.
- **The decisions you're finishing:** D62's `prompts/d62_lead_decisions_5.md`. It's on the carry
  branch, and you cherry-pick it in step 1 below.
- **Background:** the D62 spec and plan. D62 is on prod as `v2026.11.20`.

This brief covers **Stop 0 only**. Stop after it and report. Stop 1 (categories, catalog,
products) comes as a separate brief.

## Where and how

- Work in `~/src/rockcut` on branch `d65-fruit-spices-sugars-consumables`. It's already checked
  out, rebased onto `develop` `84071e7`, and holds the D65 spec and plan. Don't switch branches.
- **Commits:** keep them small (`fix: D65 …` / `test: D65 …`) and stage paths by name.
  - Don't push or merge.
  - Don't rebase, except the one `git reset --soft` of the wip commit in step 2.
- **Servers:** the lead owns them (API :4002, UI :5174). Stop 0 has no migrations. Ask me if you
  need a restart.
- **Formatting:** don't run repo-wide `mix format`; format only the files you touch.
- **Reference files:** don't touch the git-excluded `docs/current_work/reference/` files. They're
  Stop 3's input. Tests never edit or delete the seeded hop rows.
- **Tokens:** never print a synthetic token in your output.

## Do

1. **Cherry-pick** from the local branch `d65-carry-devqa`, in this order:
   - `1a3b3f5`: D62 lead decisions 5;
   - `c939d17`: gap 1, Companies Order target in packs;
   - `fcaefe4`: gap 2, crop year sent blank into an existing lot #;
   - `cb9ed73`: the wip.

   If any of them conflicts with `develop`, stop and tell me what conflicted.
2. **Finish the wip.**
   - Run `git reset --soft HEAD~1` to unpack the wip commit.
   - Read what it already has: `libraryView.ts`, `purchasing.ts`, `IngredientsList.tsx`,
     `ReceiveDialog.tsx`, `Inventory`, and the two `d62DevQaFixes5*.test.ts` files.
   - Finish the remaining work, then commit **one commit per gap** with its tests.
   - Rename the test files to `d65…` if you like.
   - **Gap 3, Receive split of 0:**
     - when any split is 0, the footer says "Each lot needs at least 1 box. Remove the empty one."
       Grain says "sack";
     - the zero split's row shows a remove button;
     - Receive stays disabled until the 0 is gone or changed.
   - **Gap 4, Library category in the URL:**
     - the chosen Category and any child go in `?category=<id>`;
     - Back and the "Ingredients" back link return to the same view;
     - with no parameter, the default view is unchanged;
     - grain children are covered too.
   - **Add lot supplier:**
     - when the product has offers, Supplier defaults to the reorder offer's supplier, or else
       the most recent offer's supplier;
     - when the product has offers, Supplier is required, and the API returns 422 without one;
     - a product with no offers behaves as it does today.
3. **A test for each fix that fails without it:**
   - ExUnit for gap 2 and the Add lot supplier 422 (allowed and refused cases);
   - vitest for gaps 1, 3 and 4 and the supplier default;
   - **Playwright** in the `ingredients` project: gap 3 (zero split, remove, Receive), gap 4 (Back
     returns to the chosen category, desktop and 360 px) and Add lot supplier (default + refusal).
     Use `[TEST-TEMP]` rows only, cleaned up by id.

   Where it's practical, revert the fix once to prove its test fails, and say which ones you did.
4. **Answer the open question from decisions 5:** where is the API refusal of a custom field
   definition on Hops tested, and what route does it cover? QA found no field-definition write
   route; a category PUT that carried a field was ignored. If no route can add a field, say so
   and name the test that shows it.
5. **`tests/COVERAGE.md`:** start a D65 section with these five fixes, each mapped scenario →
   layer.

## Done when (Stop 0)

- `mix test` passes twice, and `MIX_ENV=test mix compile --warnings-as-errors --force` is clean.
- vitest, `tsc -p tsconfig.app.json` and `vite build` are clean. `pnpm lint` still shows the same
  8 errors.
- The `ingredients` Playwright project passes against the local servers. I'll run the full suite
  in its own tab.
- **Browser check:** reproduce each of the five gaps as `brewer1`, at desktop and 360 px, and
  confirm each is fixed. Grain and hop screens otherwise read as before.
- **Reply with:**
  - your commits;
  - test counts before and after;
  - gap → fix → test, one line each, noting which tests you proved by revert;
  - the Hops field-definition answer;
  - `LEAD:` notes for anything left open.

---

# Stop 1 (categories, catalog, products)

2026-11-20 · lead. **Stop 0 accepted** (`52112e5` … `3dabdc6`; ExUnit 2,743 ×2, vitest 483,
ingredients Playwright 95). Your LEAD notes:

1. **Supplier now required on a lot when the product has an active offer, from any caller:**
   accepted. D65's QA briefs will say so.
2. Accepted.
3. Accepted. The wider return to the last library view is right.
4. **Fix both in this stop.** You're in the library anyway, and small gaps get fixed where they're
   found:
   - while categories load, the library shows a loading state, not "No ingredients found";
   - remove the duplicate gap 16 row in COVERAGE.md's D62 section.

## Do (plan Stop 1; spec §2 decision 8, §4.1–§4.3, §5 items 1–3; amendments)

Every rule gets a refusal test and an allowed test.

1. **Migrations** (timestamps after D62's last). **Ask me before running any of them**, because
   the product rebuild needs the API down; I'll stop it and restart it for you.
   - **Plan migration 3:**
     - add `ingredient_feature_values` (`ingredient_id`, `feature_type_id`, `value`), unique per
       pair, with foreign keys that cascade on ingredient delete;
     - add `ingredients.formula` (text, optional, ≤ 40 characters).

     The ion feature types and the ion UI come in Stop 2; this stop only adds the table and the
     formula.
   - **Plan migration 5, the products rebuild:**
     - `ingredient_products.manufacturer_party_id` becomes nullable;
     - the unique index becomes `(ingredient_id, coalesce(manufacturer_party_id, 0),
       coalesce(form,''), coalesce(name,''))`.

     Follow D62's `20261120140001` rebuild: foreign keys off, then on, then
     `PRAGMA foreign_key_check`. Every foreign key into `ingredient_products` must survive: offers,
     lots, order and contract lines, recipe lines, minimums, feature values. Write a down
     migration that refuses with a clear message if any product has no manufacturer.
   - **Plan migration 6, categories** (spec §4.1 and the Irish Moss and acids amendments). Each
     step is idempotent and by name:
     - add **Water Salts** and **Finings** under Other Consumables. No Acids;
     - move **Whirlfloc** into Finings when it's at the top of Other Consumables;
     - rename **"Corn Sugar (Dextrose)" → "Dextrose (Corn Sugar)"**;
     - delete **Irish Moss** if it has no products, lots or recipe lines; otherwise keep it;
     - delete **Future Ingredients** if it's empty; otherwise keep it;
     - delete the **Form** field definitions on Fruits, Spices & Flavorings and Sugars and
       Extracts;
     - **stop with a message naming the lots** if a lot in a D65 category has no product.

     Anything kept goes to the log (`Logger.warning`) with its name, for the release notes.
   - **`seeds.exs`:**
     - add the two children;
     - stop seeding Irish Moss, Future Ingredients and the three Form fields;
     - seed "Dextrose (Corn Sugar)" instead of the old name, and put Whirlfloc in Finings.

     A fresh `mix ecto.reset` must end in the same shape as a migrated database.
   - **ExUnit:**
     - run the migrations on a database shaped like D62 prod (grain and hop products, offers,
       lots, an order, a contract, the old categories and fields), and check that everything
       survives and the categories end as described;
     - run them a second time, and nothing changes;
     - an Irish Moss with a recipe line is kept;
     - a D65 lot with no product stops the migration.
2. **`Ingredients.Catalog`** (spec §4.2):
   - `@managed` covers every key except `yeast` and `future`;
   - `forms` and `units` per category, plus `forms/2` and `units/2` for the per-child lists of
     Other Consumables (Water Salts; Finings);
   - any other child of Other Consumables gets the union of the two lists (A10);
   - Sugars: Dry → `["lb"]`, Liquid → `["lb", "gal"]`;
   - pack names per category, and the default pack per unit (lb → bag, gal → pail, fl oz → jug,
     oz → bag, each → tub). Stop 2 puts these in the offer dialog; expose them now;
   - `manufacturer_required?/1` is true for `grains` and `hops` only;
   - `contract_unit/1` stays nil for D65 keys. Add a test that the API refuses Dextrose on a
     contract line.
3. **`Product.changeset`:**
   - the manufacturer is required only when `manufacturer_required?`;
   - form is required for D65 categories, from the category's or child's list;
   - unit comes from the list, depends on the form for sugars, and the API refuses Dry in gal;
   - the unit is still fixed once a lot exists (D62);
   - the duplicate rule treats a missing manufacturer as one value: a second None "Calcium
     Sulfate (Gypsum) Powder" is refused with the duplicate sentence, worded for None.
4. **`Products.display_name/1` with no manufacturer:** "Calcium Sulfate (Gypsum) Powder · None",
   and with a product name, "Whirlfloc T · None" (form omitted when there's a product name; check
   that against D62's rule and tell me if they disagree).
   - Grep every caller in the API and UI: pickers, Totals, To order, orders, receive, the recipe
     lot label, the duplicate sentence and Copy (TSV).
   - Nothing may print "nil", "undefined" or an empty maker.
   - Write a vitest for the UI label helpers and an ExUnit test for the API.
5. **`each` and tablets** (spec §4.3, finings amendment):
   - whole numbers on movements, counts, receipts, Used in brewing (Oldest first never splits into
     a fraction) and pack sizes;
   - the 422 names the product and its unit label: "Whirlfloc T is counted in whole tablets". An
     `each` product that isn't a Tablet reads "… is counted in whole numbers";
   - a product with form Tablet and unit `each` reads **"tablets"**, in the API's `unit_label` and
     everywhere in the UI. The stored unit stays `each`;
   - each refusal gets an ExUnit test.
6. **Categories** (A9):
   - hide **Add field** and **Add subcategory** on Fruits, Spices & Flavorings and Sugars and
     Extracts;
   - the API refuses both with a 422, as on Hops (`POST`/`PUT /api/category_field_definitions` and
     creating a child category);
   - **Other Consumables allows Add subcategory**, and its new child gets the union lists.
7. **Ingredient formula:** add an optional Formula field to the ingredient dialog and the
   ingredient JSON for every category (shown only when set or editing). The seed fills it in
   Stop 3.
8. **UI for the four categories** (spec §5 items 1–3):
   - **Ingredient Library:** generalize the Grains/Hops list layout:
     - columns: ingredient, manufacturer ("None" when blank), form, unit, on hand, and suppliers
       with $/pack;
     - Other Consumables is grouped by child;
     - search; filters for manufacturer (only those with products in the category shown),
       supplier and on hand only;
     - phone cards.
   - **Product dialog:**
     - fields: ingredient, manufacturer (optional for D65, a "None" choice, plus "Other
       manufacturer…"), form, product name and unit;
     - the unit comes from the category's or child's list; sugars set it from the form (Dry locks
       to lb); it's fixed once there's a lot;
     - **no feature fields yet** (Brix and extract come in Stop 2).
   - **Product page:** the header shows form, unit (tablets) and manufacturer or None. Offers,
     lots, movements, open orders and the minimum are as hops, with no Brix column yet.
   - Yeast keeps its old screens.
9. **Synthetic and test fixtures:**
   - anything that builds a lot in a D65 category without a product goes through a product now;
   - check that `mix rockcut.synthetic.setup` still runs clean and removes its tagged D65 rows.
10. **Playwright** (`tests/regression/ingredients/`; a new `d65.spec.ts` is fine), `[TEST-TEMP]`
    rows only, cleaned up by id:
    - Strawberry with two products (Purée gal, Whole lb), each with its own on hand, and the
      duplicate refused;
    - a None-manufacturer salt product and a refused second one;
    - a Liquid sugar in gal; Dry in gal refused by the API;
    - Cinnamon (Ground, oz) and Vanilla Extract (Extract, fl oz);
    - a Whirlfloc T product reading "tablets", with 2.5 refused;
    - Categories: Water Salts and Finings under Other Consumables; no Future Ingredients or Irish
      Moss; Add field and Add subcategory hidden on the three; Add subcategory allowed on Other
      Consumables;
    - the 360 px library and product page for a fruit and Whirlfloc;
    - D60, D61 and D62 specs still green.

## Done when (Stop 1)

- `mix ecto.reset`, seeds and `mix rockcut.synthetic.setup` run clean. The seeded hop counts are
  unchanged (28 lots, 409.6 lb).
- `mix test` passes twice, and `--warnings-as-errors --force` is clean.
- vitest, tsc and the build are clean. Lint still shows the same 8 errors.
- The `ingredients` Playwright project passes. I'll run the full suite in its own tab.
- **Browser check** as `brewer1` and `brewer2`, at desktop and 360 px: every flow above, and grain
  and hop screens still read as before.
- **Reply with:**
  - your commits and test counts;
  - the `display_name` caller list (file: what it shows now, one line each);
  - what migration 6 kept, if anything, on the local database;
  - `LEAD:` notes;
  - the diff size (`git diff --stat develop`).
