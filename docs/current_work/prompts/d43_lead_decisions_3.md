# D43 lead decisions 3 (after Task 3, 2026-10-15)

1. **Task 3 accepted** (`7a03922`). Not covered (batch, ingredient, Settings
   category detail pages; phone nav drawer) go in the handoff note's
   LIMITATIONS for DEV, where seeded data exists; QA's pass covers them.
2. **Task 4: go**, with memory limits (the machine ran out of memory during
   Task 3; ~1.8 GB free now):
   - run Playwright with **`--workers=2`** at most (one when a single spec
     is enough); never two runs at once;
   - run the new and updated specs first, then the full suite once;
   - if the full run dies from memory, rerun with `--workers=1` and say so.
3. New specs: one file per area under `tests/regression/ui/` as the plan
   says; S148 creates, uses and deactivates a `[TEST-TEMP]` person (no seed
   password). Every spec restores what it changes (theme back to Light,
   staff order, Daily ticks).
