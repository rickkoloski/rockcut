# D60 lead decisions 4 (DEV Playwright)

2026-11-18 · lead → builder. DEV runs `7fb208a`. The full suite on DEV: 569 passed, 2 failed, 276
did not run (projects depending on a failed one; I'm running them separately). Both failures pass
alone on DEV. Don't redeploy; commit only. I deploy once DEV QA is in.

1. **B8 race (real, minor).** On DEV, B8 failed at `brewer.spec.ts:323`: after Record movement, the
   lot dialog showed Sack size **Fixed** (from `movements.length > 1`) but **Delete enabled**
   (`lot.delete_blocked` from the lots query, not yet refetched). The two come from different
   queries, so for a moment after a save they disagree, and a user could open a delete confirm the
   API then refuses. Make the dialog consistent: Delete is disabled whenever the dialog's own
   movements show a later movement (same reason text), as well as when `delete_blocked` says so;
   and/or don't open the lot dialog from stale lot data (your call, the simpler one). Harden B8 so it
   doesn't depend on refetch timing, and add a vitest for the dialog rule.
2. **P79–P82** (`d48-split-select.spec.ts:104`) got a 500 from the schedule GET on DEV under load
   (`schedule.ts:71`); DEV keeps only 100 log lines, so the cause is lost. Passes alone. Not D60
   code as far as I can tell; just say if anything in D60 touches the schedule path. No change unless
   you find a link.

Done when: vitest/`tsc`/`vite build` clean, the ingredients Playwright folder green twice locally.
Commit, reply with commits and counts. No repo-wide `mix format`.
