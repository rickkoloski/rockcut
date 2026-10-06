# D37 lead decisions 1

**From:** the lead, for Matt. **2026-10-05.** These answer the builder's three `LEAD:`
questions after step 5 (`f18303a`).

## 1 · Excel dates: accept M/D/YYYY (Matt)

The import also accepts US-order dates (`9/1/2026`, `09/01/2026`), read as midnight
Colorado time like `YYYY-MM-DD`. Anything else is still a row-numbered error. Exports
keep writing `YYYY-MM-DD`.
- Update spec §3.6 to say so.
- Add an ExUnit case and a fixture row (or extend the Excel-saved fixture).

## 2 · Replace tests: their own run (lead)

A Replace test clears the shared board, so it must not run alongside other spec files.
Move the Replace tests (S25, S28) into a Playwright project of their own that:
- runs with one worker;
- depends on the other projects, so it starts only after they finish.

Tag them, or put them in their own file. Keep the restore-after-each-test approach.
Update `tests/RUNNING.md` if the way to run the suite changes.

## 3 · Lint: fix the 26 errors in D37 (Matt)

Matt chose to fix them on this branch instead of waiving them.
- **A separate commit:** `fix: clear pre-existing lint errors`. Keep it apart from
  D37 code.
- **No behavior changes.** For `react-hooks/set-state-in-effect`, use the handoff's
  pattern: remount the dialog with a `key` and initialize from props.
- `pnpm lint` ends with 0 errors. Note any warning you leave, and why.
- **Check the dialogs you touched.**
  - Run the Playwright specs that cover them.
  - For any dialog with no spec, drive it once in a browser with a throwaway script
    (open, edit, save, reopen), and say which dialogs those were.
