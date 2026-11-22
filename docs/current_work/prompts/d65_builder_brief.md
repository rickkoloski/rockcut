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

---

# Stop 2 (features, offers, totals)

2026-11-20 · lead. **Stop 1 accepted** (`611fb32` … `23abd0a`; ExUnit 2,763 ×2, vitest 491,
ingredients Playwright 103; local dev DB migrated, nothing kept). The lead ran the full local
Playwright suite on Stop 1. Your LEAD notes:

- **`display_name`:** keep what you built. A None product with a product name drops the form
  ("Whirlfloc T · None"), as the finings amendment wants. Products with a manufacturer read as in
  D62. I'll flag the difference to Matt; don't change it unless I come back.
1. Nothing to remove; fine.
2. Accepted: the unit is fixed once a lot exists, with a 422.
3. Accepted: grain and hop units are set by the API, and D65 refuses a mismatch.
4. Accepted: the minimal Pack select. Stop 2 finishes it, see item 4 below.
5. Accepted: good catch on the `NOT IN` with NULLs.
6. Accepted: the category's `catalog` object is the UI's single source.
7. Accepted. The per-unit subtotals land in this stop.
8. Watch d62-fix-cycle-1 G3/G6/G11. If it fails again in this stop, find the race, as with O9 in
   D62.
9. **From this stop on, prove fixes by revert where it's practical.** That means each refusal
   rule and each bug fix; screens don't need it. Say which ones you proved.
10. **Fix it here:** an `each` quantity below 1 reads "at least 1 tablet" ("at least 1" for a
    non-Tablet `each`), never 0.01. Add a test.

## Do (plan Stop 2; spec §4.4, §4.5, §5 items 2, 4–6; the salts, sugars, fruit and finings amendments)

Every rule gets a refusal test and an allowed test.

0. **First: fix `owner.spec.ts` O2**, which the lead's full run on Stop 1 caught.
   - Lines 97–101 still expect Add field on **Fruits**, which Stop 1 rightly hides (A9). Point
     that check at **Yeast Strains**, which still has custom fields until D64.
   - Then grep the other D60–D62 specs for anything else that assumes the old Fruits, Spices,
     Sugars, Irish Moss, Future Ingredients or "Corn Sugar (Dextrose)" setup.
   - Your Stop 1 report says the ingredients project passed. Find out why O2 didn't fail in your
     run (was it skipped, filtered or run against an older build?), and say what you found.

1. **Migrations** (plan 1, 2 and 4). They're additive, so they can run with the API up; still,
   **tell me before you run them** so I can restart it afterwards.
   - **`feature_types`:**
     - add `brix` (°Bx, 0–100, 1 dp);
     - add the seven ion types `ca_ppm_per_g_gal`, `mg_…`, `co3_…`, `hco3_…`, `so4_…`, `na_…`,
       `cl_…` (ppm @ 1 g/gal, 0–1000, 1 dp);
     - set `extract_fgdb` to **2 dp**. Grain values are unaffected; a typed grain extract still
       takes up to 2 dp now, which is fine.
   - **`category_feature_types`:**
     - add a nullable **`only_form`**;
     - Fruits: `brix` with product range, lot enter, optional;
     - Sugars: `extract_fgdb` with product value, lot copy (editable), and `brix` with product
       none, lot enter, optional, `only_form: "Liquid"`.
   - **`supplier_offers.pack_note`:** text, optional, ≤ 40 characters.
   - ExUnit: up on a Stop 1–shaped database, then a second run that changes nothing.
2. **Features in the API:**
   - `only_form` is handled everywhere `only_unit` is: lot create and edit, Receive into a new or
     existing lot #, and the product feature check. A Dry sugar lot sent a Brix gets a 422.
   - Fruit **Brix range** on the product works as hop alpha does: either end may be blank, and
     low > high gets a 422. On the lot it's optional and never copied; a value outside the range
     is marked (`outside_range`), never refused.
   - Sugar **extract** is copied to the lot and can be edited there, as grain. The 2 dp check
     applies.
   - Brix with 2 decimals (8.55) or outside 0–100 gets a 422.
   - **An existing lot #:** a purée lot with Brix 8.5 shows read-only, and sending 9.0 gets the
     D62 mismatch 422.
3. **Ions on the ingredient** (salts amendment, decision 1):
   - `GET`/`PUT` of ion values on the ingredient, stored in `ingredient_feature_values`. This works
     for Water Salts ingredients only; any other gets a 422. Values have 1 dp and a range of
     0–1000;
   - the product JSON carries its ingredient's ion values, read-only;
   - **UI:** the ingredient dialog shows an ion grid (Ca, Mg, CO₃, HCO₃, SO₄, Na, Cl, ppm @ 1
     g/gal) for Water Salts ingredients, next to the Formula field from Stop 1. The ingredient
     page shows them, and each product page shows them read-only.
4. **Offers and packs:**
   - the offer dialog lists pack names per category, or per child for Other Consumables, with the
     unit's default pack (Stop 1's select, finished);
   - the API checks Other Consumables pack names against the **child's** list, with the union for
     other children (A10). If Stop 1 used the union for every child, fix it;
   - **`pack_note`**: optional, ≤ 40 characters. It's shown wherever the pack is, reading "tub ·
     872 tablets (5 lb)": offers, order lines, Receive, To order and lots;
   - `each` pack sizes are whole numbers.
5. **Totals and To order** (spec §4.5):
   - **Totals → Inventory**, general view: quantity subtotals per unit (lb, gal, oz, fl oz,
     each/tablets) that are never added together, plus one $ grand total. Copy (TSV) keeps the
     Unit column. The Grains-only view reads exactly as D61;
   - **Totals → Orders:** the per-pack-name line, "2 bags · 6 boxes · 30 sacks · 1 tub", and the
     quantity column subtotals per unit;
   - **To order:** a product with no stock reads "0 gal" or "0 tablets" in its own unit, and
     shortfalls are in packs.
6. **Screens:**
   - Product dialog: extract for every sugar, and a Brix range (low–high) for fruit;
   - product page header: form, unit, the standard extract for sugars and the Brix range for
     fruit. The lots table shows Brix where the category has it, and extract for sugars;
   - Add lot and Receive: Brix is optional on fruit lots and Liquid sugar lots, with "typical
     6.5–9" beside it for fruit and outside values marked. Extract is prefilled on sugar lots.
     `each` lots take whole numbers;
   - **Recipe lot label** (A11): "Aseptic Fruit Strawberry Purée · lot # · 8.5 °Bx". Brix appears
     only when the lot has it, and nothing extra otherwise. This label is used in the recipe
     ingredient picker.
7. **Playwright for the §10 scenarios not covered in Stop 1** (`d65.spec.ts`), using
   `[TEST-TEMP]` rows only, cleaned up by id:
   - Fruit:
     - a pail · 5 gal offer;
     - lots with Brix 8.5 and with no Brix; 8.55 refused;
     - a count of "2 pails 1.5 gal";
     - `inventory_on_hand` returns `{11.5, "gal"}` for the product and is refused for the
       ingredient.
   - Sugars: extract copied and editable; Brix only on Liquid; a Dry lot's Brix refused.
   - A Water Salts ingredient with ions and a formula; ions read-only on its product page.
   - **Purchasing:**
     - a `[TEST-TEMP]` supplier's order mixing grain, hop, sugar and Whirlfloc lines, showing its
       packs against the target;
     - Receive with extract prefilled and a whole Whirlfloc lot;
     - Whirlfloc's minimum of 1 tub with 600 on hand shows on To order;
     - Dextrose isn't offered in the contract dialog, and the API refuses it.
   - **Totals as `owner`:**
     - per-unit subtotals and one $ grand total;
     - the Copy Unit column;
     - the Grains view unchanged;
     - Orders per pack name.

     Totals tests filter to their own rows, since the seeded hops (and Stop 3's reference data)
     are on every environment.
   - **Edges:**
     - `floater` and `splitRole` can use the new pages;
     - `bartender1` and `breweryDevice` get a 403 on every D65 route;
     - **two people, one record:** `brewer1` and `brewer2` save the same fruit product, and the
       second gets the 409 with nothing written;
     - **slow network:** a double-click on Save in Add lot and Receive writes once;
     - at 360 px, the fruit product page, Add lot with Brix, the Whirlfloc count and Totals with
       mixed units have no sideways scroll.

## Done when (Stop 2)

- `mix test` passes twice, and `--warnings-as-errors --force` is clean.
- vitest, tsc and the build are clean. Lint still shows the same 8 errors.
- The `ingredients` Playwright project passes. I'll run the full suite.
- **Browser check** as `brewer1` and `owner`, at desktop and 360 px: every flow above, and grain
  and hop screens still read as before.
- **Reply with:**
  - your commits and test counts;
  - which fixes you proved by revert;
  - `LEAD:` notes;
  - the diff size so far.

---

# Stop 3 (reference seed, `[SEED]` data, gate prep) — the last build stop of D65

2026-11-21 · lead. **Stop 2 accepted** (`9549e00` … `d17ddf8`; ingredients Playwright 114/114, nine
fixes proved by revert). The lead runs the full local suite on Stop 2. Your LEAD notes:

1. Accepted: extract shows 1–2 decimals and the converter rounds as D60.
2. Good catch: `inventory_on_hand` now carries its unit over HTTP.
3. Accepted: D62's packs rule on To order.
4. Accepted.
5. **Fix it here:** ions save in **one request and one transaction** with the ingredient. The
   ingredient `POST`/`PUT` takes `ions` and writes both or neither. Keep `PUT …/ions` if tests use it,
   or remove it; your call. Add a test where a bad ion value leaves the ingredient's name unchanged.
6. Accepted: no pack note on lots.
7. **Fix:** the price per unit is singular: "$0.1055/tablet", "$1.54/lb". Totals' "each" line is
   fine.

## Do (plan Stop 3; spec §7 and every reference-data amendment)

1. **`priv/repo/seeds/d65_reference.exs`** runs on every environment:
   - `seeds.exs` evaluates it after the hop reference, and `Release.seed()` runs it;
   - it's idempotent and matches everything by name (case-insensitive), so nothing is duplicated
     and no existing row is overwritten unless stated.

   **Embed the data in the file.** Read the git-excluded CSVs in
   `docs/current_work/reference/d65_*.csv`, but don't read them at run time. **The spec's
   amendment tables are the source of truth for names**; the CSVs' names are Matt's raw input.
   Prices are effective **2026-11-20**. **No lots are seeded.**
   - **Companies (parties with roles):**
     - manufacturers: Candico, Sweetener Sup Co., Colorado Honey Co., Muntons;
     - suppliers: Redstone, SoNature;
     - Aseptic Fruit is both;
     - BSG exists already; it only needs the supplier role.
   - **Water salts** (salts amendment): seven ingredients in Water Salts, each with its formula and
     ion values. Use the amendment's names: "Calcium Carbonate (Chalk)", "Sodium Bicarbonate
     (Baking Soda)", "Calcium Sulfate (Gypsum)", "Magnesium Sulfate (Epsom Salt)", "Sodium
     Chloride (Table Salt)", "Calcium Chloride (Hydrous)", "Calcium Chloride (Anhydrous)".
     - Six products with manufacturer None and unit lb: the calcium chlorides are Flake, the rest
       are Powder, and Anhydrous has no product.
     - Each has a BSG offer, bag · 50 lb, at the amendment's price.
   - **Sugars** (sugars amendment): six products with extract as the standard.
     - Lactose and Dextrose (Corn Sugar), None, Dry: Dextrose (Corn Sugar) is the ingredient that
       already exists; use it, don't create a new one.
     - Belgian Candy Syrup (Candico, Liquid, 70).
     - Black Strap Molasses (Sweetener Sup Co., Liquid, 81.95).
     - Honey (Colorado Honey Co., Liquid, 80.33, supplied by Redstone).
     - DME (Muntons, Dry, 100).

     All are in lb. The offers have their packs, with pack price = $/lb × weight: BSG bag · 50,
     pail · 55 and pail · 60; bag · 55 for DME; Redstone pail · 60 for Honey.
   - **Fruit, Aseptic Fruit** (batch 3): 12 ingredients with 12 Purée products in lb, each with a
     Brix range; Watermelon is 12–12.
     - 13 offers in pail · 11 or pail · 44 with prices. Strawberry has two.
     - "Tangerine" is spelled that way.
   - **Fruit, SoNature** (batch 3b): new ingredients Apricot and Cherry (Juice / concentrate);
     Lemon and Lime reuse the Aseptic ingredients.
     - Four products, manufacturer None, lb, with Brix low = high: Apricot 50, Cherry 11.4, Lemon 11.
       Lime has no Brix.
     - SoNature offers have no price: pail · 40, and pail · 56 for Cherry.
   - **Finings:** Whirlfloc T, a product of the existing Whirlfloc. Manufacturer None, Tablet, each,
     product name "T". BSG offer tub · 872 with pack note "5 lb" at $92.00.
   - **Spices:** ten ingredients in Spices & Flavorings with no products: Cinnamon, Clove,
     Coriander, Juniper Berries, Timut Pepper, Lemongrass, Cacao Nibs, Vanilla Beans, Coffee,
     Peppermint Leaf.
   - **Expected totals:**
     - 7 + 6 + 14 + 10 = **37 new ingredients**. Dextrose (Corn Sugar) and Whirlfloc already
       exist.
     - **29 products:** 6 salts, 6 sugars, 16 fruit and 1 fining.
     - **30 offers**, of which **26 have prices**.
   - **ExUnit:**
     - seed twice and the counts are unchanged;
     - spot-check Calcium Sulfate (Gypsum) (CaSO₄·2H₂O, Ca 61.5, SO₄ 147.4, $32.00/bag), Strawberry
       (two offers, 6.5–9), Black Strap Molasses 81.95, Whirlfloc T "tub · 872 tablets (5 lb)" and
       SoNature Lime (no Brix, no price);
     - the seed leaves the D60 grain and D62 hop counts unchanged (28 hop lots, 409.6 lb).
2. **Synthetic `[SEED]` data** (DEV and local only, through `mix rockcut.synthetic.setup`): one fruit
   purée product with a lot, one Dry sugar with a lot, and one `each` fining with a lot, each with
   an offer and a minimum, so To order and Totals have mixed units.
   - Use `[SEED]` product names that don't clash with the reference data.
   - Setup removes and recreates them, as the D60–D62 `[SEED]` rows are.
3. **Tests that must not trip over the reference data:** any Playwright or ExUnit test that counts
   D65 products, offers, ingredients or totals filters to its own `[TEST-TEMP]` rows. Tests and QA
   never edit or delete seeded reference rows.
4. **`tests/COVERAGE.md`:** a complete D65 section with every §10 scenario → layer, and gaps
   marked.
5. **Release notes input:** append to `docs/current_work/planning/d65_fruit_spices_sugars_consumables_plan.md`
   a short "Release" section covering:
   - migration order, and which migration needs the API down;
   - what migration 6 may keep and log;
   - that rollback needs the pre-release snapshot;
   - the reference counts above.

## Done when (Stop 3 = the local gate's build part)

- On a throwaway copy, `mix ecto.reset`, seeds and `mix rockcut.synthetic.setup` run clean. The
  seed prints the D65 counts, and a second seed adds nothing.
- **Tell me before seeding the local dev DB.** I'll stop the API, run the seed and setup, and
  restart it.
- `mix test` passes twice, and `--warnings-as-errors --force` is clean. vitest, tsc and the build
  are clean, and lint still shows the same 8 errors.
- The ingredients Playwright project passes on the seeded dev DB. I'll run the full suite.
- **Browser check** as `brewer1`, at desktop and 360 px:
  - the Water Salts list and the Gypsum product page with its ions;
  - the Fruits list with Brix ranges;
  - the Sugars list with extract;
  - Whirlfloc T reading "tub · 872 tablets (5 lb)";
  - Totals → Inventory with the `[SEED]` mixed units.
- **Reply with:** commits, counts, the seed's printed totals, the COVERAGE gaps and `LEAD:` notes.
  After that, the lead writes the local QA brief.
