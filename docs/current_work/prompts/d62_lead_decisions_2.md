# D62 lead decisions 2 — local QA recheck fix cycle

2026-11-20 · lead → builder.

**Source:** `~/src/rockcut-d62-qa/results/d62_qa_recheck.md`. It's outside the repo and you may
read it. Verdict: pass with gaps. Pass-1 gaps 1–6 and 8–12 are fixed. Gap 7 is closed by design
(Matt, 2026-11-20: "Stick with new price"; D61 A4 stays). There are six new gaps: 16 must-fix,
17 should-fix, and 13, 14, 15 and 18 minor. All of them get fixed in this cycle.

**Rules:** same as decisions 1. Branch `d62-hops-other-ingredients`, small commits, stage files by
name, no push. Ask before running a migration or resetting the DB (none should be needed). QA's
`[TEST-TEMP]` rows are in the local DB. Don't touch the seeded hop rows. Every fix gets a test that
fails without the fix; where it's practical, revert the fix to prove it.

## Decisions

**Gap 16 (must-fix): a 500 when an existing-lot receipt sends a spec the lot has blank.**
- A blank on the lot is a value. When the receipt sends a spec that the matched lot has blank, or
  leaves blank one the lot has, it's a mismatch.
- Return the same 422 as the other mismatches, with nothing written. The blank reads "no beta
  acid" (or the feature's label), in the same style as "no crop year".
- A spec that isn't sent at all is still fine; that's what the UI sends.
- Test hops (beta, oil) and grain (diastatic power) in ExUnit. Then look for any other path that
  compares a sent value with a nil one, such as Add lot or contract lines, and fix the same way.

**Gap 17 (should-fix): To order's offer pick is stuck after a 409.**
- On a 409, To order refetches its rows, so the version becomes current, and shows a message that
  fits the page: "Someone else changed this product. The list is up to date now; pick the offer
  again."
- The picker goes back to the saved offer, and the next pick saves.
- Test it in Playwright with two browsers.

**Gap 13 (minor): "Other manufacturer…" looks like it does nothing.**
- Choosing it switches to the full list **and opens it at once**, keeping the current value until
  the user picks.
- It works with a mouse and with touch.

**Gap 14 (minor): grain wording.**
- On grain screens the item reads **"Other maltster…"**. Hop screens keep "Other manufacturer…".
- Nothing else on grain changes.

**Gap 15 (minor): To order's offer picker.**
- A hop offer reads "… · box · 11 lb", the same as the order and Add lot pickers.
- A grain offer reads exactly as it did in D61. Check D61 on `main`, and if it read "· 50 lb"
  there, keep that.
- Also from QA's "noted, not rated": the To order caption's pack word follows each row's own
  product, not only its offer. A hop-only list says "boxes", and an empty list keeps D61's wording.

**Gap 18 (minor): the contract's price-change line repeats the company.**
- Every line on a contract is from the contract's supplier, so leave the leading supplier off:
  "Citrine T90 Pellet · [TEST-TEMP] QA Supply Co price becomes $159.50 from 2026-11-20".
- For grain, keep D61's wording if dropping the supplier would change it. Check `main`.

## Done when

- `mix test` green twice; `--warnings-as-errors` clean.
- vitest, tsc and build clean; lint shows the same 8 errors.
- The ingredients Playwright project green.
- **Browser check:** each gap's repro at desktop and 360 px.
- **Reply with:** commits, counts, each gap → fix → test, and `LEAD:` notes.

**After this:**
- The lead runs the full suite.
- QA then does a short recheck of gaps 13–18 only.
