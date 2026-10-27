# D49 lead decisions 9 (Task 4 done)

**2026-10-26** · Lead. After `57f9718`, `8ae8001` and `9f4539e`.

## Checks (lead)

- **Full ExUnit** at `57f9718` (no API change since): 1782 passed.
- **Full Playwright, all projects** (`--workers=4`):
  - at `8ae8001`: 367 passed, 5 failed, 195 didn't run (seed step 7009 ticked by S50; the phone toolbar; S48; G4);
  - after a local reseed, at `9f4539e`: **563 passed**, 2 failed:
    - G4, known flake 4933;
    - `task-board-phone.spec.ts:508` S71 ("list bottom at 2570, still scrolling"): passed 3 of 3 alone (`--no-deps`), so a load flake. Watch it on DEV: the seed's linked tasks make the phone's day list longer.

## Decisions

1. **Accepted:** `step_name` / `batch_label` from the API (8.2); the Dashboard card (8.3); S50's own task and the seed guard; the Task list icon at phone width.
2. **Lead logs** go to `/tmp/claude-501/pwlogs/`, not `test-results/` (Playwright empties it).

## Next: Task 5, Playwright and the local gate

Per `three_environment_workflow.md` §3 and the plan's "Local gate":
- **Coverage:** every scenario P90–P103, P108, P122–P135, BB1 and BB2 has a test or a stated reason in `COVERAGE.md`.
- **Persist-verified writes:** each new write in the specs is checked after a reload or a navigation, not only from the response.
- **Bug-fix revert runs:** BB1, BB2, the Move all fix (3b) and the step-dialog focus fix. The results go in the completion record.
- **Static checks:** `npx tsc --noEmit -p tsconfig.app.json && pnpm exec vite build && pnpm lint`.
- **Draft the handoff note** for the PR in `docs/current_work/stepwise_results/d49_handoff_note.md`: branch + SHA, what changed, personas and scenarios for DEV, the migrations (reversible?) and **LIMITATIONS**. That's the plan's three (the `sync!` timing on the release build with the full seed; the board's move prompt and the read-only linked tasks on the Samsung tablet; the Task list panel at phone width), plus decisions 1.2, 3.2, S71 above, and anything else local couldn't tell us.
- Stop with `LEAD: run` for the final full suites. The lead pushes and opens the PR.
