# D62 lead decisions 1 — local QA fix cycle

2026-11-20 · lead → builder.

**Source:** the local QA report, `~/src/rockcut-d62-qa/results/d62_qa_report.md`. It's outside the
repo and you may read it. Verdict: pass with gaps, with 12 gaps (2 must-fix, 6 should-fix,
4 minor).

**Same rules as the brief:** branch `d62-hops-other-ingredients`, small commits, stage by name, no
push. Ask before migrations or a DB reset while the API is up. QA's `[TEST-TEMP]` rows are still
in the local DB. Don't touch the seeded hop rows.

**Tests:** every fix gets a test that fails without it. Where it's practical, revert the fix,
watch the test fail, then restore it, and note that in the report.

## Decisions

**Gap 7 (must-fix in the report): no change, by design.** D61 A4 (Matt, 2026-11-18): a lot topped
up by a receipt is valued at its **most recent price paid**, not a weighted average. Leave the
code as it is. Matt sees this gap in the lead's summary and may revisit it; if he does, it comes
as its own decision. Check that the D61 test pinning A4 still exists and passes.

**Gap 4 (must-fix): Totals → Inventory.**
- The Category filter lists every category with stock: **All categories**, then Grains (and its
  children) and Hops. The default is All categories.
- Column headings are general: Ingredient, Manufacturer, Form (blank for grain), On hand (with
  unit), Packs, Value, $/unit.
- Packs uses each product's own pack: hops show boxes (African Queen 0.32 boxes), grain shows
  sacks.
- The grain-only view (Category = Grains) reads as D61 did, with the Grain, Maltster and Sacks
  headings.
- Copy follows the headings shown and adds a Unit column.
- Test with the seeded hops present.

**Gap 5: Maltster pickers on grain screens.**
- **Filters** (library, Totals): list only manufacturers that have products in the category being
  shown. On grain screens that's manufacturers with grain products; on Hops, those with hop
  products.
- **Product dialogs:** the grain dialog lists manufacturers that have grain products, plus the
  product's current one. An **"Other manufacturer…"** option opens the full manufacturer list,
  so a new maltster can still be picked. The hop dialog works the same way for hops.

**Gap 3: hop offers show no grain form.**
- `form` (milled/whole) is grain-only. Hop offers store **null**: fix the seed and the API, and
  migrate existing hop offers to null.
- Labels for hop offers read "box · 11 lb".
- The API refuses a `form` on a non-grain offer with a 422.

**Gap 6:** the Orders list column reads **Packs** whenever an order mixes pack names, and a
"Sacks" column for an all-grain order, consistent with the order page. Simplest: the list column
is "Packs", and grain-only orders show "N sacks" in the cell.

**Gap 11:** Totals → Orders never adds sacks and boxes into one number. Show ordered and received
**per pack name** ("73 sacks · 47 boxes"), and give subtotals and the grand total per pack name.
The lb column stays per unit. Copy gets one column per pack name, or one row per pack name (your
call; say which). Fix the note's wording.

**Gap 9: stale product saves.** Add `lock_version` to `ingredient_products`, the D61 pattern for
orders and contracts. A stale save gets a 409 "Someone else changed this product since you opened
it. Close and reopen it to see their change." Nothing is written. This covers grain products too.
Test it in ExUnit and Playwright.

**Gap 10: receiving into an existing lot # with different values.**
- When the typed lot # matches an existing lot of the product (case-insensitive, trimmed), the
  Receive row **shows that lot's crop year and alpha read-only**, with the caption "Adds to
  existing lot H1".
- The API refuses a mismatch with a 422 "Lot H1 already exists with crop year 2025, alpha 14.10;
  use a new lot number or leave its values". It never silently ignores what was sent.
- Grain lots work the same way for any spec values sent.

**Gap 12:** To order shows a product's quantity in its own display (a hop product with no stock
reads "0 lb", the same as the product page) when the packs view would show 0 boxes.

**Gap 1:** the duplicate-product message is shown under the form, not as "ingredient id: …". Show
the API's sentence only.

**Gap 2:** how ranges read:
- both ends: "11–13 %";
- equal ends: "12.5 %";
- low only: "≥ 12 %";
- high only: "≤ 9 %";
- the same on the product page, the list and the "typical" captions.

**Gap 8:** at 360 px, line pickers in the order and contract dialogs wrap or show the variety and
form first ("Citra T90 Pellet · Yakima Chief Hops"), so lines from one company are told apart.

**Not a gap:** "Add subcategory" shows on Hops. Hide it on Hops (no hop subcategories in D62), and
have the API refuse it with a 422.

## Done when

- `mix test` green twice; `--warnings-as-errors` clean.
- vitest, tsc and build clean; lint the same 8.
- The ingredients Playwright project green.
- **Browser check:** each fixed gap's repro, desktop and 360 px.
- **Reply with:** commits, counts, each gap → fix → test, and `LEAD:` notes. The lead then runs
  the full suite and the QA recheck.
