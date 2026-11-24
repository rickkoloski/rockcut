# Session handoff — 2026-11-24

## Where things stand

- **Prod: `v2026.11.24` (security hotfix, API only).** Matt's check passed. PR #97, squash `1e34a76`; API v46, UI v41 (still the `v2026.11.23` build).
  - **Rollback:** API v45 `registry.fly.io/rockcut-api:deployment-01M862CR4G2W8GP971MGZD029P`, image only. Snapshot `vs_PgeR1XOzNL6xun5QeBnZP5kB`.
  - Record: `stepwise_results/hotfix_v2026.11.24_COMPLETE.md`. `mix hex.audit` is clean.
- **D64** went out in `v2026.11.23`; its gate and untested paths are in `SESSION_HANDOFF_2026-11-23.md`.
- **DEV is free** (conv 80 msg 110149): API `e35e040`, UI `0a56b70`, both `develop`'s app code.
- `main` is an ancestor of `develop`, so the next release PR should be conflict-free.

## Next

1. **D63: scope in chat first**, and write the spec only when Matt says scoping is done.
   - Recipes on products, brew-day drawdown, °Plato (4987), batch-log time (4986), the rest of 4989/5203, lint 4084.
   - **Stop 0 carry-ins:** 6260 (phone Back on ConfirmDialog), 6261 (empty Voided rows), 6262 (order footer units).
   - **Matt's rule:** a brew is always saved. An unmatched yeast pitch is marked "Yeast source needed". D64's date refusal lives in the Pitch and count actions so brew day isn't bound by it.
   - Not filed: Edit Batch requires a batch number, so a planned batch or split part can't be saved there without one (predates D64).
   - Memory note: `rockcut-d64-yeast-scoping`.

## Notes

- **5911** is updated with D64's and the hotfix's flakes.
- **Don't run Playwright across midnight:** the seed's "today" turns "late" (Gantt P46, P49–P51).
- **DEV reseed** failed three times right after Playwright runs (ssh status 1, cause unknown) and worked later by itself. Keep the full output.
- **Playwright order:** production → brewery-board → ingredients → d58. A `production` failure skips the rest; run them with `--no-deps`.
- **Snapshots are incremental:** 1–2 KB is normal soon after another one.
- **Builder (w1:p4):** `/clear` it before D63, then `herdr agent rename w1:p4 builder`.
