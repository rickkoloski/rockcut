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
