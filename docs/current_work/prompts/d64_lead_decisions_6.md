# D64 lead decisions 6: three loose ends from your decisions 3–5 reply (2026-11-23)

Your reply is accepted. LEAD notes 1–8 stand as built.

1. **Note 10: a retired brink.** Remove of a closing entry (pitch, dump or adjustment to 0) is
   refused (409, nothing written) while the brink is retired: "YB2 is retired. Make it active
   again first." Use the same rule for History's `can_remove`. If un-check or Undo can reach a
   retired brink by reopening a record (gap 7's restore), refuse there with the same sentence.
   Use the app's own wording for the un-retire action if it differs.
2. **Adjust and Dump dates.** Same rule as gap 3: a date before the open record's first harvest is
   refused (422, the same sentence), same day allowed. Adjust's dialog sets the minimum and shows
   the sentence. Dump's API only (its dialog sends today).
3. **Note 9.** The offer hint matches what a saved offer shows (the spec amendment's form). Don't
   change saved offers.

Tests for each, proved by revert, plus COVERAGE rows. Gate: ExUnit, warnings-as-errors, vitest, tsc,
build, lint 8, and the affected Playwright spec files only. I run the full suite after you.

`git checkout` (and restore, stash) to discard edits is denied on purpose, and you reached for it
again this cycle. Don't try it. Keep using saved copies.

Commit locally by path, then reply with what changed and the numbers.
