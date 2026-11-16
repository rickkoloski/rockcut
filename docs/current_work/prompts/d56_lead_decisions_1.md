# D56 lead decisions 1

2026-11-12 · lead → builder. Matt's answer to the Stage 1 `LEAD:` question (spec decision 11).

**A pre-brew step checked off on or after brew day is allowed.**
- The step **stays on its planned day** (before brew day). `done_on` records the real day.
- No move prompt and no move of anything: the off-plan move that a check-off on another day
  normally does is skipped for a pre-brew step done on or after the first brew day.
- Checked off on another day that is still **before** brew day, it behaves as any step does
  today (it moves to that day, with the usual prompt for its own links).
- `before_brew_day` still refuses moving it (drag, date box) on or after brew day.
- ExUnit: done on brew day, done the day after, and done earlier but still before brew day.
