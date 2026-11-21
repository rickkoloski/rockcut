# D65 lead decisions 4: DEV QA recheck fix cycle

2026-11-21 · lead → builder.

**Source:** `~/src/rockcut-d65-devqa/results/d65_dev_qa_recheck1.md`. You may read it.

**DEV runs `db7595e`.**
- DEV Playwright: 960 of 960 passed. One test timed out at 30 s: `d65-stop2.spec.ts:180`, the mixed
  order. Its rerun passed in 21 s.
- **DEV QA recheck verdict:** pass with gaps.
  - All six pass-1 gaps are fixed.
  - Gap 2 is confirmed as QA's false positive.
  - The seeded diff is 0.
  - Two new gaps: 7 (minor) and 8 (should-fix).

**Rules:** the same as before. Each fix gets a test that fails without it, proved by revert where
it's practical. Stage files by name, don't push, and never run Playwright against DEV.
**No migration is expected. Ask me before writing one.**

## Should-fix

**Gap 8: a malformed feature value is accepted, and it silently clears what was stored.**
- What happens now: on `PUT /api/ingredient_products/:id` (and POST) for a fruit product with Brix
  low 12, the bodies `features: { brix: { value: "12" } }` and `{ brix: { lo: "12" } }` both return
  **200** and store `features: {}`. The Brix is gone. An unknown feature key is already refused
  with a 422 ("bogus_feature is not a feature").
- **The fix:** every feature value must have the shape that feature takes, or the API returns a
  **422** with a sentence. Nothing is stored or cleared on a 422.
  - On the product, Brix is a map whose only keys are `low` and/or `high`, with at least one of
    them. Unknown keys and an empty map are refused, for example "Brix takes low and/or high".
  - An explicit `brix: null` (or leaving the key out of `features`) keeps today's behaviour,
    whatever that is. Tell me what it is.
  - Apply the same strictness to **every** feature shape on products, ingredients (ions) and lots:
    Brix on lots, `extract_fgdb`, and ion values. A map where a number is expected, or a number
    where a map is expected, is a 422, never a silent drop.
  - Grep for any other place `features` input is filtered down silently.
- ExUnit: one refusal test per shape (product Brix `{value}`, `{lo}` and `{}`; a lot Brix given as a
  map; an extract or ion given as a map), plus a test that a valid Edit that leaves Brix out keeps
  the stored Brix.

## Minor

**Gap 7: New order says "sacks" before any offer is picked.**
- What happens now: before a supplier is picked, the summary reads `0 sacks · 0 lb · $0.00`. With a
  mixed-pack supplier (target 40 packs), it reads `… · 0 of 40 sacks` until an offer is picked.
- **The fix:** with no line that has an offer yet, the pack word follows the supplier's target
  wording: "0 of 40 packs" for a supplier whose target counts packs. With no supplier yet, use
  "packs".
  - **Exception:** if an existing grain/hops test asserts the empty "sacks" wording, keep it for a
    grain-only supplier and tell me.
  - Don't change the wording once a line has an offer, because gap 6's fix covers that.
- Check the same empty state in Edit order.
- vitest for the summary helper, plus one Playwright assertion on the empty mixed-supplier state.

## Test timing

`d65-stop2.spec.ts:180` (the mixed order, Receive, To order and Totals) is one long test. It took
21 s against the 30 s limit on DEV. Mark it `test.slow()`, or split it if that reads better. Check
the other long D65 tests in `d65-stop2.spec.ts` and `d65.spec.ts` with the same eye, and mark only
the ones that are genuinely long. Don't raise the global timeout.

## Done when

- `mix test` passes twice, and `--warnings-as-errors` is clean.
- vitest, tsc and the build are clean. Lint still shows the same 8 errors.
- The `ingredients` Playwright project passes locally.
- **Reply with:**
  - commits and counts;
  - gap → fix → test, saying which tests you proved by revert;
  - what `brix: null` does;
  - the gap 7 wording you chose, and any grain exception;
  - `LEAD:` notes.

**After this,** the lead runs the full suite locally, deploys to DEV, and QA runs recheck 2.
