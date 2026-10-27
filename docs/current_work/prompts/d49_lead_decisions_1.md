# D49 lead decisions 1 (after Task 0)

**2026-10-26** · Lead, with Matt. Answers the `LEAD:` lines from Task 0 (`26c91ec`).

## Task 0 checks (lead)

- **Full ExUnit:** 1728 passed.
- **Playwright** (`d49-undo-retry.spec.ts`, `d48-fix-cycle-7.spec.ts`, project `production`): 3 passed, after the lead seeded the local DB (`seeds.exs` + `mix rockcut.synthetic.setup`, 19 personas).

## Decisions

1. **`updated_at` is left out of the Undo hash** (lead, accepted). Decision 2 says not to loosen the stale check, and this doesn't: every other column still counts, the rules run first, and a real change since is still `undo_stale`. Without it, a refused Undo could never be retried after real time has passed.
2. **A refused Undo doesn't survive the same person's next write** (Matt). When the person who got the refusal clears the blocker themselves, that write's snackbar replaces the refused one. That stays as it is in D49, with no new UI. Note it in D49's LIMITATIONS as a follow-up. The retry works when someone else clears the blocker (QA's path A), and that is what BB1 covers.

## Next

Task 1, Clean not sanitized (§3.12a, P122–P129; plan decision 3). Stop after it, as the brief says.
