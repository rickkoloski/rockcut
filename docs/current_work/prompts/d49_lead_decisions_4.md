# D49 lead decisions 4 (Task 2, API half)

**2026-10-26** · Lead. Answers the `LEAD:` lines from `0b1f310`.

## Checks (lead)

- **API restarted** with migration `20261026140001` (`pencilled`) on the local dev DB.
- **Full ExUnit:** 1751 passed.

## Decisions

1. **A mixed overlap gives two flags** (accepted). The scheduled batch keeps its own overlap flag, same key, unmuted; the pencilled batch gets its own, keyed `…:pencilled`, muted. This is what §3.12b says ("A scheduled batch that overlaps a pencilled one still gets its own (unmuted) overlap flag") and P131. Every other flag is muted when the first batch it's about is pencilled.

## Next

The UI half of Task 2, as listed in your report, with Playwright for P130–P134. The board side (P130/P132/P133/P135: no tasks for pencilled batches) stays in Task 3. Stop when Task 2 is done.
