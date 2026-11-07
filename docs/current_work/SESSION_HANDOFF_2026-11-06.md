# Session Handoff: 2026-11-06

Supersedes `SESSION_HANDOFF_2026-10-30.md`. **D54 is on prod as `v2026.11.04` and closed out. D53 (Idea Boards + multiple assignees on tasks) is next, in spec review.**

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.11.04` (D54; release PR #49, squash `d37e4b6`): API v32 / UI v29. Rollback: API v31 `deployment-01M66H3S4P6DJTH8Y4GA97CYX4`, UI v28 `deployment-01M66H4WXJVZHS9ZVY1W5C1XRD`; snapshot `vs_JblapqvV0k91Uve2XYXak7k2`. |
| **DEV** | Runs `3341faf` (API v68 / UI v72), the same tree as `develop` at the D54 merge; reseeded; **released** (conv 80 msg 102715). |
| **`develop`** | D54 merge (PR #48), then the close-out (`-s ours` sync of `main`, completion record). |

## Open for Matt

1. **REMIND at the end of D53 (Matt asked): task 5164.** Sign in on prod and check the three tablets (updated, paired, no Sign in as me, a staff code write works). Not done yet. It's also the only run of a paired tablet going from the old app to the new one.
2. **Task 5121:** ecto 3.14.2 (HIGH) and phoenix_html 4.3.0 (MEDIUM) advisories. Hotfix or next release?
3. Tank abbreviations on prod (Set up → Tanks); D50 (4934) needs its tablet paired; 4963 can ride with a release.
4. **REMIND:** 4055 / 4056 when planning a features deliverable.

## D53: where the spec stands

`specs/d53_idea_boards_spec.md`, task 5063. **In review.** Review findings: A (mistakes) and B (gaps) were accepted as proposals; items 17–20 wait for Matt: who sees History, comments on locked things, who manages labels, two DEV gates. D54 made B16 unnecessary.

## Habits (from this session)

- **A reseed deletes `[TEST-TEMP]` devices and people.** Don't reseed while a hand test uses one.
- **`--no-deps` with several projects runs them in parallel.** `production` and `brewery-board` must not overlap; run them one at a time.
- **Reseed before a local run** if the DB is more than a day old: the production seed is relative to the day it ran.
- **`herdr agent` "done" can mean waiting on its own background shells.** For QA, wait for the report file.

## Known flakes

`staff-codes` S48 and `d48-batch-changes` P83–P84 each failed once on DEV and then passed; causes unproven. `task-board-phone` S73 as before.
