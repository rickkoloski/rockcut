# D46 lead decisions 2 (after Task 2, 2026-10-20)

All Task 2 LEAD: items are **accepted**:
- Rename phases/step types in an Edit dialog; no reorder UI for the Templates list (API keeps reorder).
- Rows drag by their handle/edges; touch long-press is the shared layer's (checked by hand at the DEV gate on the Pixel/Samsung).
- Display limits noted for Playwright/COVERAGE: Brew day's starting temperature only in its Edit dialog; the preview's CIP hatch covers the last day's phase color; no "Will be flagged" preview until D47.
- P12 goes into Task 3's Playwright specs.
- brewer1's color mode was left Light; it may have been different before — specs must not depend on it (set it in the spec if needed).

**Memory is tight on this machine** (the lead's background watcher was killed by memory pressure during Task 2): run Playwright with `--workers=1` for the full suite in Task 3, close browsers, no parallel runs.

Next: Task 3 (Playwright + local gate).
