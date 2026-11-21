# D62 lead decisions 5 — DEV QA fix cycle

2026-11-20 · lead → builder. **Source:** `~/src/rockcut-d62-devqa/results/d62_devqa_report.md` (you
may read it). DEV runs `a9998ea`. **Verdict:** pass with gaps, with 4 minor gaps. All 10
scenarios passed, and the seeded hops were unchanged.

**Rules:** same as before. Stage files by name, don't push, and never run Playwright against DEV.
Each fix gets a test that fails without it; where it's practical, revert the fix to prove it.

## Decisions

**Gap 1:** the Companies list's Order target column reads **"40 packs"**, matching the dialog's
"Order target (packs)". The Companies page is where the packs wording applies (D62 §4.6).

**Gap 2:** a receipt into an existing lot # that sends `crop_year` explicitly as null or blank,
while the lot has a crop year, is a mismatch. It gets the same 422 with nothing written, and the
same rule as gap 16 ("blank is a value"). A `crop_year` or feature key that isn't sent at all
still means "leave its values".

**Gap 3:** a Receive split of 0 is never silently blocked. When any split is 0, the footer says
**"Each lot needs at least 1 box. Remove the empty one."** ("sack" for grain), and that split's
row shows a remove button. Receive stays disabled until the 0 is gone or changed.

**Gap 4:** the Ingredient Library keeps the chosen Category, and any child, **in the URL**
(`?category=<id>`), so Back and the "Ingredients" back link return to the same view. The default is
unchanged when there's no parameter. This applies to grain children too.

**Observation, Add lot supplier:** a lot always has a supplier (decision 17).
- When the product has offers, Add lot's Supplier defaults to the product's reorder offer's
  supplier, or else the most recent offer's supplier.
- When the product has offers, Supplier is required; the API refuses a lot without one (422).
- A product with no offers keeps today's behavior.

**No change:**
- Lists newest first; allocation oldest first. That's the D60 design.
- The Orders list "Packs" header (decisions 1, gap 6).
- An estimated value follows the offer's current price (D61 A4).

**Couldn't test, so answer in your reply:** where is the API refusal of a custom field on Hops
tested, and what route does it cover? QA found no field-definition write route; a category PUT
that carried a field was ignored. If there's truly no route that can add one, say so.

## Done when

- `mix test` green twice; `--warnings-as-errors` clean.
- vitest, tsc and build clean; lint shows the same 8 errors.
- The local ingredients Playwright project is green.
- Each repro checked at desktop and 360 px.
- **Reply with:** commits, counts, gap → fix → test, and `LEAD:` notes.

**After this,** the lead redeploys DEV, runs the full suite there, and QA does a short recheck.
