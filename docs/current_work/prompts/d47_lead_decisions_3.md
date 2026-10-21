# D47 lead decisions 3 (after Task 2, `cadef89`)

Confirmed:
1. **Phase markers:** a marker starts once its day has come and its predecessors are either done or markers that have already started. That's fine (plan decision 8).
2. **The 180-day history window** for statuses and flags: fine.
3. **Reseed clears every sign-off and undo record:** fine on DEV and locally (the seed recreates its own signed-off flag).

Process note: after a stop with `LEAD:` lines, wait for the lead's reply even if Matt types "continue" in your pane. Matt's "continue" means resume, not skip the lead's steps. The lead has now restarted and reseeded the API and is running the full ExUnit suite. Carry on with Task 3.

## After Task 3 (`50061e8`)

4. **Range and zoom:** the default is 7 days back to 77 days ahead. Zoom sets how many weeks fit across the screen and the rest scrolls. That matches the spec.
5. **Links in an expanded tank only within the tank:** accepted. The transfer arrow covers the hand-off.
6. **"Label by" picker:** deferred. "step · batch" labels are acceptable for D47. List it as a LIMITATION in the Task 5 report.
7. **ExUnit after Task 2:** 1599 tests, 0 failures.
