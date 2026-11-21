# D62 lead decisions 3 — QA recheck 2 fix cycle

2026-11-20 · lead → builder. Source: `~/src/rockcut-d62-qa/results/d62_qa_recheck2.md`. Gaps 13–18
are fixed. Two new minor gaps get fixed in this cycle. Same rules as decisions 1 and 2. Each fix
gets a test that fails without it.

**Gap 19:** To order's 409 message ("Someone else changed this product…") clears as soon as the
next pick saves, and also when the user picks again (before the save returns). Test it in
Playwright by extending G17.

**Gap 20:** the contract dialog's "Saving changes these offer prices" line:
- shows a line's price change **only once that line's offer is picked**, never before;
- when the product has more than one offer from the supplier, names the offer it will change by
  its current price: "Citrine T90 Pellet · QA Supply Co (now $150.00/box) price becomes $159.50
  from …". With a single offer, the wording stays as it is now. Grain keeps D61's wording unless
  it has two offers, where the same "(now $…/sack)" is added.
- Test with vitest and Playwright (G18 extended, two offers).

**Noted, not rated (no change):** To order's closed picker reads the same for two offers from one
supplier. That's D61's style; leave it.

**Done when:** ExUnit is green if the API was touched, vitest/tsc/build are clean, lint shows the
same 8 errors, the ingredients Playwright project is green, and the repros are checked at desktop
and 360 px. Reply with commits, counts, gap → fix → test and `LEAD:` notes. Don't run the full
suite; the lead does.
