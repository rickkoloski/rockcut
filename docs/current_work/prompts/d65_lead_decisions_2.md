# D65 lead decisions 2 — QA recheck 1 leftovers

2026-11-21 · lead → builder.

**Source:** `~/src/rockcut-d65-qa/results/d65_qa_recheck1.md`.

**Verdict:** pass with gaps.
- All 13 gaps from the first pass are fixed. Gap 8 is partly fixed (one string, below).
- The regression sweep is clean, and no seeded row changed.
- The full local Playwright run on fix cycle 1 passed: 947 passed, 1 skipped.

**Rules:** the same as before. Every gap below is minor, and all of them are fixed in this cycle.
Each fix gets a test.

1. **Gap 8 leftover:** the **New order** dialog's line helper reads "872 tablets tubs (5 lb)".
   - Use the wording you gave Add lot: "tubs of 872 tablets (5 lb)".
   - Grep for any other "<unit> <packs>" helpers that build the same string: the order edit dialog
     and Receive.
2. **Gap 14:** the disabled Delete Ingredient button keeps `aria-label="Delete Ingredient"`. Its
   reason is in a tooltip and linked with `aria-describedby`, as the Categories delete does (D61).
3. **Gap 15:** the duplicate refusal names the **existing** product with its stored spelling ("There's
   already a … KT-872 with manufacturer None."), not the spelling that was typed.
4. **Gap 16:** a negative or zero `each` quantity reads "Enter at least 1 tablet" (or "at least
   1"), on input, in every dialog that takes an `each` quantity. Decimal units keep "Enter 0 or
   more" where 0 is allowed.

## Done when

- `mix test` passes, and `--warnings-as-errors` is clean.
- vitest, tsc and the build are clean. Lint still shows the same 8 errors.
- The `ingredients` Playwright project passes.
- **Reply with:** commits, gap → fix → test, and `LEAD:` notes.

**After this,** the lead deploys to DEV for the DEV gate. QA rechecks these four on DEV, as part of
the DEV QA pass.
