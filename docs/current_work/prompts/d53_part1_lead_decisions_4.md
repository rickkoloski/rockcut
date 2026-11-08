# D53 Part 1: lead decisions 4

2026-11-07 · lead → builder, answering fix cycle 1.

1. **An exception doesn't pass its people on; change this.** My rule said "the last occurrence
   before it", but an occurrence changed on its own is a one-off by definition: Sam covering
   one Monday shouldn't land on the new Tuesday. Make people match title and notes: a new date
   takes the people of the last occurrence before it **that wasn't changed on its own**. A
   finished occurrence still counts. If only exceptions come before it, use the series' own
   values. Update the pinned test ("may be one changed on its own"), and confirm by breaking the
   code on purpose. Update the confirm's wording only if it's now wrong.
2. **"Removes N" is good enough.** The new line explains it. No `change_preview` work.
3. **New ids on remade occurrences:** leave as on `develop`. A redesign isn't in scope. The lead
   notes it in the PR.

**The corners you listed are accepted.**

## Gate and stop

`mix test` twice, `tsc`, `vite build`, vitest, lint, `task-board-multi-assignee`. Don't run the
wider suites; the lead does. Commit, append to the status file, and commit with a message
containing `decisions 4 done`, then stop.
