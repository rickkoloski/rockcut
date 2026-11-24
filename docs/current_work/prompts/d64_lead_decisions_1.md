# D64 lead decisions 1: Stop 4 follow-ups

2026-11-22 · lead → builder. **Stop 4 accepted** (ExUnit 2,966 ×2; Playwright production 216,
brewery-board `--no-deps` 233, ingredients 166; e2e tsc clean). Your LEAD notes:

1. **Accepted: Totals per unit and label.** Tablets and plain `each` on two lines is right; they're
   different things.
2. Accepted. Good catch: Undo of a Plan was a fourth delete path.
3. Accepted.
4. Accepted.
5. **Fix the second edge case now.** DEV QA will harvest `[SEED]` products into YB1–YB4, which
   aren't tagged, and a stopped `mix rockcut.synthetic.setup` on DEV blocks the next QA round.
   - Before deleting `[SEED]` / `[TEST-TEMP]` yeast products, setup removes their
     `yeast_harvest_products` rows.
   - Records left with no strain are voided, with their entries kept. Log one line per brink
     touched.
   - Add a synthetic test: a QA-style harvest of `[SEED] Dry Ale` into YB1, then setup runs clean
     and leaves YB1 empty.
6. Accepted.
7. **Revert the `overflowWrap: 'anywhere'`** on the Product cell. It wasn't the constraint, and
   keeping the diff to the fix is better. Keep the padding change.
8. Accepted.

## Done when

- `mix test` passes, and `--warnings-as-errors` is clean. vitest, tsc and the build are clean, and
  lint shows the same 8.
- The `ingredients` Playwright file for To order still passes at 360 px.
- **Reply with:** commits, and the new test proved by revert.

Don't run the full Playwright suite; the lead runs it next, in its own tab.
