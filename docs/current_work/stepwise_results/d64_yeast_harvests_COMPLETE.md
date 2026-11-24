# D64: Yeast, brinks, harvests and cell counts — COMPLETE (DEV gate)

**Spec:** `docs/current_work/specs/d64_yeast_harvests_spec.md` (approved 2026-11-22; amendments 2026-11-22 and 2026-11-23).
**Plan:** `docs/current_work/planning/d64_yeast_harvests_plan.md`. **Brief and decisions:** `prompts/d64_builder_brief.md`, `d64_lead_decisions_1.md` … `_9.md`.
**Branch:** `d64-yeast-harvests`, from `develop` @ `45369b8` (0 behind). **Tested on DEV:** `0a56b70` (PR #94).

## What changed

| Area | Change |
|---|---|
| Yeast products | Lab + strain + form; Dry in whole bricks, Liquid in whole pitchables; temperature and attenuation specs; pitch size; editable Strain Types |
| Brinks | YB1–YB4 (managers edit the list); one yeast record at a time; pitch, adjust, dump, mark clean, counts, history with Remove |
| Harvests | Harvest dialog on the `yeast_harvest` step (Gantt, board, brewhouse device): harvest or Yeast dumped; dirty and has-yeast questions; un-check and Undo restore what they changed |
| Generations | Mother = 0; highest source + 1; different strains make a co-ferment at gen 1; split parts count the parent's pitches |
| Board tasks | Count on harvest, Clean when a brink empties |
| Batch page | Yeast section; batches with yeast, and split parents or parts, can't be deleted (a 500 before) |
| Brands | A brand with batches or recipes is refused with a sentence (a 500 before) |
| Seed | `seeds/d64_reference.exs`: 11 products with offers, no lots; idempotent |
| Tests | the `ingredients` project runs after `d58`; S183 matches labels exactly |

**Migrations:** `20261122120001`–`14`. 12 gives the "Yeast harvest" step type its behavior and stops if no such type exists. Rollback needs the pre-release snapshot.

## Local gate

- `mix test` 3,046 passed; warnings-as-errors clean; vitest 550; tsc and build clean; lint 8 (as `develop`).
- Full local Playwright on `c88cebc`: 1,014 passed, 1 skipped. `0a56b70` adds one docs line.

## Local QA

| Pass | Result |
|---|---|
| 1 | fail: 4 must-fix, 7 should-fix, 2 minor (one predates D64: brand delete) |
| 2 | fail: 1 must-fix, 6 should-fix, 1 minor (split batch deletes predate D64) |
| 3 | fail: 1 must-fix, 1 should-fix, 1 minor |
| 4 | pass with gaps: 2 minor (25 fixed, 26 kept) |

## DEV verdict: pass with gaps (`0a56b70`)

| Pass | Result |
|---|---|
| DEV deploy | 14 migrations, D64 seed (11 products, 11 offers, 2 prices), no foreign-key errors |
| DEV Playwright, full | 835 passed, 2 failed (d58 managers 12/13 and S16, both already in backlog 5911), 178 not run (`ingredients` depended on `d58`) |
| `ingredients` on DEV | 178 of 178 |
| The 2 failures | failed again right after the full run (S16's trace shows 500s on schedule reads under its burst of clicks); passed with nothing else running. Each test has passed on DEV, but not in one clean run |
| DEV QA (D1–D9) | pass with gaps: no must-fix, 1 should-fix, 3 minor. Seeded data unchanged but the next batch number |

**Gaps, accepted by Matt:**
- 3 (should-fix): phone Back on Dump brink, Mark clean and Remove pitch leaves the page. D63 (task 6260).
- 2 (minor): empty Voided rows in brink History. D63 (6261).
- 1 (minor): the order page footer reads "32 each". D63 (6262).
- 4 (minor): Harvest on top isn't re-asked after a weight adjustment. Left as designed.

**Not tested on DEV:** Transfer, and CIP and Package on a tank, beside a harvest; a real phone; un-check and Undo after every answer on the board and device (the Gantt had all); the Split dialog and Harvest from the Gantt at 360 px.

Commits after `0a56b70` change only docs and the Playwright project order (`ingredients` now runs before `d58`); the new order hasn't had a full run.

Matt approved the merge and release without a phone check on DEV (2026-11-23).
