# D37 lead decisions 1

**From:** the lead, for Matt. **2026-10-05.** These answer the builder's three `LEAD:`
questions after step 5 (`f18303a`).

## 1 · Excel dates: accept M/D/YYYY (Matt)

The import also accepts US-order dates (`9/1/2026`, `09/01/2026`), read as midnight
Colorado time like `YYYY-MM-DD`. Anything else is still a row-numbered error. **Exports
are unchanged:** the board export keeps writing the full date-time that spec §3.6 asks
for, so a Replace from an export keeps exact moved-off times (S28). (Corrected after the
builder asked; the first wording said `YYYY-MM-DD`.)
- Update spec §3.6 to say so.
- Add an ExUnit case and a fixture row (or extend the Excel-saved fixture).

## 2 · Replace tests: their own run (lead)

A Replace test clears the shared board, so it must not run alongside other spec files.
Move the Replace tests (S25, S28) into a Playwright project of their own that:
- runs with one worker;
- depends on the other projects, so it starts only after they finish.

Tag them, or put them in their own file. Keep the restore-after-each-test approach.
Update `tests/RUNNING.md` if the way to run the suite changes.

## 3 · Lint: waived for D37 (Matt, 2026-10-06)

The 26 lint errors already on `develop` are **waived** for D37's local gate. D37 adds
none. Matt first chose to fix them in D37. He reversed that once the cleanup was
reaching across the Brewery and Settings pages, which have little test coverage.
- The builder's uncommitted cleanup was stopped and discarded. Nothing from it was
  committed.
- **The PR records the waiver.** It says that `pnpm lint` shows 26 errors, all already
  on `develop`, and that D37 adds 0.
- A follow-up task fixes them on their own branch.
- **Don't touch Brewery, Settings or `ComponentShowcase` files in D37.**

## 4 · Partial Playwright runs (lead)

Because the Replace project depends on the main project, `npx playwright test <folder>`
now runs the whole main suite first. That's accepted: the gate runs everything anyway.
For a quick day-to-day run, use the split in `tests/RUNNING.md` (main project only, or
Replace on its own). No script is needed.
