# D65 lead decisions 5: DEV QA recheck 2 fix cycle

2026-11-21 · lead → builder.

> **DEFERRED to D64 (Matt, 2026-11-21).** Not built in D65. The builder discarded its
> uncommitted work. D65 ships with gap 9 as a known minor. Use this brief as the D64 carry-in.

**Source:** `~/src/rockcut-d65-devqa/results/d65_dev_qa_recheck2.md`. You may read it.

**DEV runs `cec1228`.**
- DEV Playwright: 961 of 961 passed. One d58 S16 events-cell timeout passed on rerun.
- **DEV QA recheck 2 verdict:** pass with gaps.
  - Gaps 8 and 7 are fixed.
  - The sweep passed, and the seeded diff is 0.
  - One new minor gap: 9.

**Rules:** the same as before. Each fix gets a test that fails without it, proved by revert where
it's practical. Stage files by name, don't push, and never run Playwright against DEV.

## Minor

**Gap 9: an order line with no offer yet labels its fields "Sacks" and "$ / sack".**
- What happens now: in New order (and in Edit order → Add line), before an offer is picked, the
  line's quantity and price fields read "Sacks" and "$ / sack" for every supplier (none, mixed,
  sacks-only, Aseptic Fruit). The field takes a number. When an offer is then picked, the field
  becomes "Tubs" and keeps the number, so "3 sacks" quietly becomes 3 tubs.
- **The fix:** an empty line uses the same rule as gap 7's summary:
  - "Packs" and "$ / pack" before an offer is picked;
  - "Sacks" and "$ / sack" for a supplier whose offers are all sacks (D61 unchanged).
  Keep a number typed before the pick. With the generic label it means packs, which is what it
  becomes.
- Share one helper with gap 7's summary, so the two can't drift.
- Check New order, Edit order → Add line, and 360 px.
- Tests: vitest for the label helper, plus a Playwright assertion on the empty mixed-supplier line
  ("Packs", "$ / pack") and on a sacks-only one ("Sacks").

## Done when

- vitest, tsc and the build are clean. Lint still shows the same 8 errors.
- `mix test` passes (only if you touch the API, which shouldn't be needed).
- The `ingredients` Playwright project passes locally.
- **Reply with:** commits, gap → fix → test (which you proved by revert), and `LEAD:` notes.

**After this,** the lead runs the full suite locally, deploys to DEV, and QA runs recheck 3.
