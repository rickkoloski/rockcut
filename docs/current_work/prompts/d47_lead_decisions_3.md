# D47 lead decisions 3 (after Task 2, `cadef89`)

Confirmed:
1. **Phase markers:** a marker starts once its day has come and its predecessors are either done or markers that have already started. That's fine (plan decision 8).
2. **The 180-day history window** for statuses and flags: fine.
3. **Reseed clears every sign-off and undo record:** fine on DEV and locally (the seed recreates its own signed-off flag).

Process note: after a stop with `LEAD:` lines, wait for the lead's reply even if Matt types "continue" in your pane. Matt's "continue" means resume, not skip the lead's steps. The lead has now restarted and reseeded the API and is running the full ExUnit suite. Carry on with Task 3.
