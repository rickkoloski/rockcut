# Session Handoff: 2026-11-08

Supersedes `SESSION_HANDOFF_2026-11-07.md` (which is on the Part 1 branch).

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.11.07` (hotfix, API v33) on `v2026.11.04` (D54, UI v29). |
| **DEV** | **Free.** Runs D53 Part 1 (`967d872`, API v72 / UI v75) = `develop`'s app code. |
| **`develop`** | D53 Part 1 merged (PR #53, `8e434ce`). Not released. |
| **Part 2** | Branch `d53-part2-idea-boards` in `~/src/rockcut-d53p2`, at `713a487` (stop 5b). Not pushed. All 8 plan stages done, plus Matt's changes: "Boards" name, `/boards` URLs, Archived search, no list drag (task 5193), no auto-watch. |
| **Local servers** | Running from `~/src/rockcut-d53p2`; brewer1 reset to Light. |
| **Agents** | builder (tab "d53p2 build"), idle at stop 5b. |

## Next steps

1. **Full local suite** on `713a487` (the last full run at `390d287` failed 3: S152 nav order and S26's
   colour, both fixed at stop 5b and rerun green on their own). Reseed and run setup first.
2. **Matt hasn't yet OK'd Part 2's DEV gate.** Ask, then: push, open the PR, claim DEV, snapshot,
   deploy (migrations: the Idea Board tables and the starter lists), **reseed** (it also clears
   brewer1's dark mode if it's there), full DEV suite, independent QA (brief to write; the Part 1 one at
   `~/src/rockcut-d53p1-qa/BRIEF.md` is the model).
3. Then the D53 release decision. **Before it, REMIND Matt of task 5164** (prod sign-in and the three
   tablet checks), as he asked.

## Open for Matt

- Gap 14 kept D39's behaviour: a moved repeat occurrence gets a twin on its original date after a rule
  change, and the confirm now says so. It's a one-line change if he'd rather have no twin.
- Tasks 5119, 5120, 5165, 5193; 4055 / 4056 when planning features.
