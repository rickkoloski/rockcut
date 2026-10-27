# D49 lead decisions 8 (Task 4, Linkage UI)

**2026-10-26** · Lead. Answers the decisions from `3e9aeeb`.

## Decisions

1. **"Show planned batches" is a switch next to Hide completed and Hide shifts** (accepted). It's per person and for everyone; the ⋮ menu is managers-only (S11).
2. **Don't parse the task title** (lead). A brand or tank name can contain " · ", and the title's format is display, not data. Add `step_name` and `batch_label` to the linked task's `production` object in the API, and have the board use them. An ExUnit test for the fields; rerun the targeted board and production specs.
3. **The Brewery Dashboard's Today's tasks card: the small fix** (Matt). When checking off a linked task there needs a prompt (brew day's batch number, or off-plan), the card doesn't show the error: it opens the step in the schedule (`/brewery/production?step=&day=`, as Open in schedule does). Linked tasks that need no prompt still check off in the card. A Playwright test for the brew-day case.

## Next

Decisions 2 and 3 (Task 4b), then stop with `LEAD: run` for the full suites.
