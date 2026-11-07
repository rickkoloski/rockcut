# D53 Part 1: lead decisions 5

2026-11-07 · lead → builder. Your decisions 4 departures are accepted.

**One real failure in the full local run:** S139, `regression/tasks/task-board-follow-ups.spec.ts:428`
(phone, First day → Monday: the vertical view should end up scrolled to today).
`getByTestId('day-<today>')` is `viewport ratio 0`.

| Build | S139 alone, `--repeat-each`, `--workers 1` (Saturday 2026-11-07, Monday first) |
|---|---|
| this branch, `a900509` | **4 of 8 failed** |
| `develop`, `40ef440` | 1 of 12 failed |

So it's an existing race that this branch may make worse. The samples are small. It's also a
user-visible behaviour, so **find the cause; don't just make the test wait**.

Start at `PhoneVerticalView.tsx:31`, the one-time `scrollIntoView` on today. What runs after it?
Candidates to confirm or rule out: the scroll firing before the data, or a refetch after the setting
changes, pushes today down (or re-renders the days); and anything Part 1 adds to the height above
today, such as the two-person seed row or a card's new people row. Measure rather than guess: log
scroll position and today's offset over time in a throwaway run.

**Fix the cause in the app** so today stays in view after the board finishes loading, without
fighting someone who has started to scroll. Then:
- S139 `--repeat-each 20`: all pass, and record the before and after.
- Add a test only if S139 can't catch the cause.
- A revert check on the fix.
- The other phone specs (`task-board-phone`) still pass.

Servers are up from `~/src/rockcut-d53`, reseeded, with local auth files current.

**The confirm's wording (your item 4):** please use "Dates that stay keep their people. New dates
take them from the last regular occurrence." Update the Vitest and Playwright assertions.

If the cause turns out not to be in the app, stop and tell me what you measured.

## Gate and stop

`mix test`, `tsc`, `vite build`, vitest, lint, `task-board-multi-assignee`, `task-board-phone`,
`task-board-follow-ups`. Commit, append to the status file, and commit with a message containing
`decisions 5 done`, then stop.
