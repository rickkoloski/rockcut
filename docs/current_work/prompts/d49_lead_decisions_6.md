# D49 lead decisions 6 (Task 3, Linkage API)

**2026-10-26** · Lead, with Matt. Answers the decisions from `9eee16b`.

## Checks (lead)

- **API restarted** with migrations `20261026160001`, `20261026160002`.
- **Local reseed** (`mix rockcut.synthetic.reset`): 19 personas, 101 linked tasks, 1 pencilled batch.
- **Full ExUnit:** 1782 passed.
- **`sync!` cost** (builder): a move with `sync!` 14 ms at 30 batches / 630 linked tasks, against 500 ms. On the release build with the full seed: a DEV LIMITATION, as planned.

## Decisions

1. **Phase markers never get a task** (Matt). Plan decision 6 stands. The spec is corrected (§2 phases, the `template_steps.on_task_list` row, §3.12's first bullet). **Task 4:** don't offer the "on the task list" switch for a marker (template entry dialog, step dialog); a marker's `on_task_list` stays off.
2. **Retire isn't hooked** (accepted). Retiring changes no title; only renames call `sync!`.
3. **Move all to today skips linked tasks** (accepted). It would otherwise move production steps with no move prompt.
4. **No board History for linked tasks; a drag to another day lands at the bottom** (accepted). The production schedule is the record.
5. **Deleting a linked task returns 200 `{data: null, undo_token}`** (accepted). Task 4's board handles it and offers the Undo.
6. **Leaving the Brewery unassigns the person's unfinished steps** (accepted). Same rule as D41's "leaving a department unassigns on that board"; otherwise `sync!` would put them back.
7. **Task list panel range** (accepted): request today → today+6 and take Late from `unfinished`. Plan decision 10's today−30 is over the board's 31-day cap, and `unfinished` already holds every overdue task.

## Next

Task 4, Linkage UI (plan "Tasks for the builder" 4, P90–P103, P108), plus decision 1's marker switch, P125's board title check, and the board side of P130/P132/P133/P135.
