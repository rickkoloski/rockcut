# D53 Part 1: lead decisions 2

2026-11-06 · lead → builder, answering stop point 2.

1. **Reorder plus a change through the API:** the dialog's guarantee is enough. Leave
   the API as is. Nobody sees the order except through the first person, and only a
   crafted request can do this.
2. **`--warnings-as-errors` on `reminders.ex:12`:** leave it alone; the lead files a task.

## Step: first run in a browser

Servers are up from `~/src/rockcut-d53` (API :4002, UI :5174), with your migrated and
seeded DB. **DEV is in use by a hotfix; never set `E2E_TARGET=dev`.**

1. Run `npx playwright test --project setup` first.
2. **Look at it before trusting the specs** (workflow §3): a throwaway Playwright script
   in `/tmp`, using `storageState`, that takes screenshots as `brewer1` of: the dialog with
   the list open; a card with 2, 3 and 5 people in a day column, at desktop and phone
   width; the task menu; the Brewery Dashboard card. Save them in
   `/tmp/claude-501/pwlogs/d53shots/`, and fix anything crowded or broken. `[TEST-TEMP]`
   data only, cleaned up after.
3. Run your new spec, then the specs you changed, then `--project brewery-board --no-deps`
   and `--project production --no-deps`, **one at a time, never in the same command**,
   with `caffeinate -ims`.
4. Fix what fails. For a real bug, add a test that catches it. If a test seems wrong, say
   why before changing it.

Don't run the full suite; the lead does. Stop at **stop point 3**: append it to the status
file (results, what you fixed, screenshot paths), commit with a message containing
`stop point 3`, then stop.
