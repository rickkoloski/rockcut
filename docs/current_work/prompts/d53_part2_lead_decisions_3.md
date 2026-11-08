# D53 Part 2: lead decisions 3

2026-11-08 · lead → builder, answering stop 3.

1. **LEAD-3: keep it read-only.** A manager who wants a note gone from an archived card can restore the
   card, delete the note and archive it again.
2. **LEAD-4: plain "Removed" is fine.** Drop the unused `removed_at` column from the stage 1 migration
   (edit in place, since nothing has shipped), and make the spec's §4.1 table say so in the same commit.

## Next: stage 6, the UI, to stop 4

**Local servers are now up from `~/src/rockcut-d53p2`** (API :4002, UI :5174; migrated and reseeded).
You may run Playwright against them. **Never set `E2E_TARGET=dev`.** Run
`npx playwright test --project setup` first. Use `caffeinate -ims` for long runs.

- Build stage 6 as the plan says (spec §4.4–§4.7 for the UI parts, plus the task dialog's "From idea"
  line and the `from_idea` type).
- **Look before you trust any spec:** a throwaway script taking screenshots in
  `/tmp/claude-501/pwlogs/d53p2shots/`, in **both themes**, at 1280 px and 390 px:
  - a board with several lists and cards (labels, people, due dates past and future, a checklist,
    note counts, a locked list and a locked card, a sent card's chip);
  - the card dialog: description, people, labels, checklist and a notes timeline of 5 or more;
  - the Send dialog for a department card and a Company card;
  - the Archived view; History; the tablet view; the phone list tabs.

  Fix anything crowded, clipped or confusing. `[TEST-TEMP]` data only, cleaned up after.
- Write Playwright for what you build as you go. The bulk of the specs is stage 8, but every screen
  needs at least one smoke spec now.

Stop 4: the non-Playwright gate passing, your new specs passing, and screenshot paths in the status.
Commit with a message containing `stop 4`, then stop.
