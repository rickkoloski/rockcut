# D64 lead decisions 7: local QA recheck (2026-11-23)

Report: `stepwise_results/d64_local_qa_recheck_report.md`. Fix 15–21 except as noted. For each, check
the cause first; QA didn't read the code.

- **20 and 21 (predate D64: `delete_batch` was a bare `Repo.delete`).** The batch page's delete follows
  Production's split rules. A part: refused with Production's sentence ("That's a part of a split.
  Undo the split to change it that way."). A parent with parts: refused, 422, "#73 has been split, so
  it can't be deleted. Undo the split first." (or Production's own wording, if it has one for this).
  Yeast refusals stay. Look for any other foreign key that still makes this delete a 500 and refuse
  it the same way. The dialog shows the sentence.
- **17.** A split part counts its parent's pitches as its own, plus any pitched into the part, for the
  dialog's strains and generation, its default brink and the part's batch page Yeast section (marked
  as pitched into the parent, e.g. "into #73"; no Remove there). With no pitches at all, the parent's
  earlier harvest is the fallback, as a batch's own is now. The parent's page is unchanged. Undoing
  the split needs nothing.
- **15.** The spec (§4.7, §8) lets a count's maker or a Brewery manager edit or delete it until
  something is pitched after it, and no screen does. Put Edit and Delete on counts in History, shown
  exactly when the API allows them (one rule, as gap 9), Delete with a confirm.
- **16.** "This brink is empty" must not write an adjustment before the old record's entries. Don't
  refuse the harvest. Date the closing adjustment at the later of the check-off date and the old
  record's latest entry. The new harvest keeps its own date. The un-check restore still works.
- **19.** The answer carries what was asked about (the record's id; for "This brink is empty" its
  lock_version too). If it changed, nothing is written and the dialog asks again with the brink as it
  is now. The same for "Harvest on top" when the record id differs. A missing value from an old
  client: ask again. A double tap still writes once.
- **18.** A Clean or Count task that reopens takes the brink's current name, unless someone retitled it.

**Not changed:**
- **14:** your note 2 stands; my QA brief misdescribed it. But your note 4 says a brink can hold yeast
  and be dirty, and QA found no path to it. Tell me the exact steps, or that there are none.
- **1 (hint):** decisions 6 item 3, as built.
- **11 (Count ticked by hand):** stays; a count isn't required before use.

Tests for each, proved by revert, plus COVERAGE rows. Gate: ExUnit twice, warnings-as-errors, vitest,
tsc, build, lint 8, and the affected Playwright spec files only (include production split specs). I
run the full suite after you. No `git checkout`, restore or stash. Stop and ask before a migration.

Commit locally by path, then reply: gap → cause → fix → test, plus LEAD notes. No background runs left.
