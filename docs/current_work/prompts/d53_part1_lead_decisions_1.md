# D53 Part 1: lead decisions 1

2026-11-06 · lead → builder, answering `d53_part1_builder_status.md` (stop point 1).

1. **Old `made_repeating` History detail:** keep the fix. It turns "someone no longer
   here" into the real name, and no one is relying on the wrong text. Note it in the
   PR's handoff.
2. **History wording:** full names, matching History today. The spec now says so.
3. **Reorder is not a change; this changes the plan.** People don't think of the list
   as ordered. Compare **as sets**: `Assignees.changed/2` returns nil when the same
   people come back in another order. So no event, no scope question, no exception,
   and `assignee_id` stays put. Remove "Changed the order of people on …". The dialog
   keeps the order of people who stay and appends new ones, so the first person only
   changes when they're removed. Add a test for each level (context, series, API),
   confirmed by breaking the code on purpose, as you did for the others.
4. **New series check everyone:** fine as is.

**Your carry list goes in the handoff note:** the old UI tab points, rollback then
forward, and the "following" quirk. I'll also raise rollback then forward in the
release PR.

## Next

Plan steps 8–10, then stop point 2: the non-Playwright gate passing, with Playwright
specs written but **not run**, and no servers. Make the decision 3 change first, in its
own commit. Append a "Stop point 2" section to the status file, and use a commit message
containing `stop point 2`.
