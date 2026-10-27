# D49 lead decisions 7 (Task 3b done)

**2026-10-26** · Lead. After `e8c936c`.

## Checks (lead)

- **Full Playwright, all projects** (`--workers=4`):
  - at `9eee16b`: 507 passed, 40 failed (38 `brewery-board`, P130, G4);
  - at `e8c936c`: **546 passed**, 1 failed (G4, known flake 4933), 1 skipped, 2 didn't run. 30.3 minutes.

## Decisions

1. **The Move all fix is accepted.** It's a real bug from decision 6.3: the count and the button now cover only the board's own tasks.
2. **`brewery-board` runs after `production`** (accepted). Both write the Brewery board. The cost is a longer full run (20.5 → 30.3 min) and a skipped board project when a production test fails; `tests/RUNNING.md` says to rerun it with `--no-deps`. Carry this to the DEV run.

## Next

Task 4, Linkage UI (see decisions 6, "Next").
