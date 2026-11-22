# D65 lead decisions 1 — local QA fix cycle

2026-11-21 · lead → builder.

**Source:** `~/src/rockcut-d65-qa/results/d65_qa_report.md`. You may read it, and the screenshots
in `results/shots/`.

**Verdict:** fail, with 2 must-fix, 3 should-fix and 8 minor gaps.
- 15 of 18 scenarios passed.
- No seeded row changed.
- The full local Playwright run on Stop 3 passed: 936 passed, 1 skipped.

**Rules:** same as the brief.
- Stage files by name; don't push.
- Each fix gets a test that fails without it. Prove by revert where it's practical, and say which
  you proved.
- Don't touch the QA folder.
- **Fix every gap in this cycle, minors included.**

## Must-fix

**Gap 5: Add lot rounds a fractional tablet count without saying so.**
- An `each` quantity entered as packs (Tubs 0.5 × 333 = 166.5) must never be rounded before it's
  sent. When packs × pack size isn't a whole number, the dialog shows "<product> is counted in
  whole tablets" ("… whole numbers" for a non-Tablet `each`) and Save stays disabled. Nothing is
  sent.
- This applies to every dialog that takes packs + unit for an `each` product: Add lot, Count
  (total and by lot), Record movement, and Receive (new and existing lot #).
- Check grain and hops: they're decimal units, so 0.5 sack stays fine.
- Grep for any other place the UI rounds a quantity before sending it.
- Tests: vitest for the conversion helper, and Playwright for Add lot with 0.5 tub of 333.

**Gap 13: Delete Ingredient returns a 500 when the ingredient has a product.**
- The API refuses it with 422 "<ingredient> has products; deactivate them instead", or the D60/D61
  wording used for categories with grains, whichever fits. It never returns a 500.
- The UI shows Delete disabled, with the reason, when the ingredient has products, as Categories
  does for a category with a grain (D61 carry-over gap 12).
- An ingredient with no products still deletes.
- Grep for other deletes that can hit `Ecto.ConstraintError` (product with offers or lots, company
  with products or offers, offer with lots or order lines). Each must be a 422 with a sentence. Add
  tests for any you find.

## Should-fix

**Gaps 1 and 10: refusals sit above the visible part of a tall dialog.** Fix it in FormDialog so
every dialog benefits: when `error` is set, scroll the alert into view and move focus to it. This
covers the duplicate-product 422 and the product 409. Playwright: at 1366×768, the duplicate
refusal is in the viewport after Save.

**Gap 11: the API accepts lots with a pack name outside the category.**
- A lot's `pack_name` is checked against the category's list, or the child's for Other
  Consumables, with the union for other children. Use the same message as for offers.
- This applies to lot create and edit, and to Receive into a new lot.
- Existing grain and hop lots are unaffected. Grain keeps sack; hops keep box.
- Add an ExUnit refusal test and an allowed test.

## Minor

- **Gap 2:** Brix messages.
  - Brix on a sugar **product**: "Brix is entered on Liquid sugar lots, not on the product".
  - Brix on a **Dry** sugar lot: "Brix is only for Liquid sugars".
- **Gap 3:** the default pack must be in the category's list. Spices fl oz → **bottle**. Generally,
  if the unit's default isn't in the list, use the first name in the list.
- **Gap 4:** ions and Brix always **display** with 1 decimal ("Ca 72.0", "SO₄ 103.0", "14.0 °Bx"),
  on screens, in labels and in reopened dialogs. Keep the stored values exact.
- **Gap 6:** a quantity of exactly 1 is singular: "1 tablet", "−1 tablet". Check the other pack and
  unit words too ("1 tub", "1 bag").
- **Gap 7:** the UI's whole-number messages match the API's: "<product> is counted in whole
  tablets" and "at least 1 tablet".
- **Gap 8:** "tablets" wherever the quantity is all Tablet products:
  - the order page total;
  - the Receive "Goes to" picker;
  - a Totals per-unit line made only of Tablet products. A line that mixes Tablet and other `each`
    products says "each".
  
  Copy's Unit column may stay `each`. Fix "500 tablets tubs" so it reads naturally ("500 tablets ·
  1 tub", or whatever matches the grain "Sacks" pattern).
- **Gap 9:** the Totals Manufacturer filter gets a **None** choice.
- **Gap 12:**
  - Product duplicate checks are **case-insensitive** on the product name, for every category,
    with a unique index on the lowercased name if SQLite allows it. If a migration is needed, it
    stops and names any existing case-only duplicates (prod expects none); ask me before running
    it.
  - A product named "None" (any case) is refused: "'None' means no manufacturer; pick another
    product name".

## QA's other notes (decided)

- **Form after lots:** the **form is locked once a product has a lot**, as the unit is. The UI
  disables it, and the API returns 422. Changing the form would silently change which features
  apply (Brix only on Liquid) and the "tablets" wording.
- **Receive "Goes to" default:** make D65 match grain and hops: default to **New lot #**, or to
  whatever rule grain uses. Say which.
- **Deactivated products in the category lists:** match grain and hops. If grain hides inactive
  products by default, hide them for D65 too. Say what grain does.
- **Q13, recipe lot picker:** no `[SEED]` recipe exists locally, so QA couldn't open the picker.
  If no Playwright test opens the recipe ingredient dialog on a D65 lot, add one that uses a
  `[TEST-TEMP]` recipe and checks the "· 8.5 °Bx" label in the dialog.
- Accepted as they are: a lot's supplier may have no offer on the product; a Brix range with only
  a low end is open; a product with two pack sizes shows units only in Totals.

## Done when

- `mix test` passes twice, and `--warnings-as-errors` is clean.
- vitest, tsc and the build are clean. Lint still shows the same 8 errors.
- The `ingredients` Playwright project passes.
- **Ask me before any migration.**
- Each repro is checked at desktop and 360 px.
- **Reply with:**
  - commits and counts;
  - gap → fix → test, noting which tests you proved by revert;
  - the answers on grain's Receive default and inactive products;
  - `LEAD:` notes.

**After this,** the lead runs the full suite, and QA rechecks.
