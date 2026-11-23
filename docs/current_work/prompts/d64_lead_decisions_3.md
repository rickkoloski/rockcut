# D64 lead decisions 3: local QA fix cycle

2026-11-23 · lead → builder. Decisions 2 accepted (`70b8944`).

**Source:** `stepwise_results/d64_local_qa_report.md`. Local QA **failed**: 13 gaps (4 must-fix).
Some were found through the API only, so reproduce each one with a failing test before fixing it.

**HELD for Matt; don't build yet:** gap 7 (un-check after "This brink is empty") and gap 3
(pitch or count dated before the harvest). If another fix touches that code, leave them as they are.

## Fix

| Gap | Fix |
|---|---|
| 8 must | Un-checking (or Undo of) a harvest recorded into a dirty brink puts the dirty mark back, with its original `dirty_since`, unless the Clean task was ticked or Mark clean was used since. The next harvest asks again. Record what the harvest cleared; don't infer it from an open task alone. |
| 9 must | `can_remove` is false whenever the API would refuse (brink refilled since). One shared rule for both, with a test that walks every refusal. |
| 13 must | Brand delete with batches or recipes → 422 sentence, shown in the dialog. Predates D64 (foreign key since Feb, code unchanged); fixed here. |
| 2 | History shows direction: "Adjusted −7 lb (40 → 33)". |
| 4 | When a record closes at 0, delete its open Count task, and an empty brink never reads Recount due. Removing the closing entry brings the task back if a recount was due. |
| 5 | Remove a purchased-yeast pitch (spec §8): the maker or a Brewery manager, from the product page's movements and from the batch page. Stock goes back to the lot. Pitches only, no other `used` movements. Check whether later movements or counts on the lot should block it, and reply with what you chose. |
| 6 | At 360 px with touch, the Harvest dialog and its questions fit on the Gantt and Save can be tapped. Find why the page is 405 px wide, say whether that predates D64, and fix it if it's small. Your Stop 3 360 px check passed, so add a touch-emulated test (`hasTouch`, `isMobile`). |
| 10 | Un-ticking a Clean task marks the brink dirty again, if it's still empty. (This reverses the plan's "un-ticking doesn't re-dirty", which was the lead's call.) |
| 11 | Deleting a count that ticked the Count task reopens that task, if no other count follows the latest harvest. Ticking Count by hand still needs no count (spec §7). |
| 12 | Renaming a brink renames its open Count and Clean tasks. |
| 1 | Yeast product page: no "Bricks + bricks" toggle, no duplicate "$/brick" column, "brick · 1 brick" singular. |
| Obs. | A harvest with an empty strain list → 422. A generation over the limit gets its own sentence. |
| Obs. | Four `[TEST-TEMP] Check type` strain types were left over: synthetic setup deletes `[TEST-TEMP]` strain types. |

Not changing: optional `lock_version`; "0 packs · 0 lb" on an empty order; no Cancel on the
on-top question (Escape returns to the dialog); a harvest keeping its stored generation after its
source pitch is removed.

## Done when

- Every fix has a test that fails without it (say which you proved by revert).
- `mix test` twice, warnings-as-errors, vitest, both tsc configs and the build are clean; lint 8.
- `ingredients`, `brewery-board --no-deps` and `production` pass, each alone, after a fresh setup.
- **Reply with:** commits, gap → cause → fix → test, what predates D64, and `LEAD:` notes.

Ask me before any migration. Don't push.
