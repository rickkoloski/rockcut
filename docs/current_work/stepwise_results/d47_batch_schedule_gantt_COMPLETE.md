# D47: Batch Schedule and Gantt — Completion Record

**Status:** COMPLETE on DEV. Merged to `develop` 2026-10-21 (PR #33, merge `5e0a4ed`). **Not on prod:** D46–D49 go to prod in one release after D49.
**DEV now:** `develop` at `5e0a4ed` (API v50, UI v53), reseeded.
**Spec:** `specs/d46_production_scheduling_spec.md` (§3.5–§3.10; scenarios P20–P64, P109, P111, P112, plus the Gantt parts of P1/P2, P4, P6–P10)
**Plan:** `planning/d47_batch_schedule_gantt_plan.md`
**Brief / lead decisions:** `prompts/d47_builder_brief.md`, `prompts/d47_lead_decisions_1.md` … `_6.md`
**QA:** `stepwise_results/d47_qa_report.md`, `d47_qa_recheck.md`, `d47_qa_recheck2.md`
**PortableMind:** task 4630 (D47) and 4650 (the D46 follow-ups, done in task 0). New: 4669 (build SHA on `/api/health`, from Rick's review), 4670 (Gantt ideas from Bryntum, after D49).

## What shipped

| # | Item |
|---|---|
| 0 | **4650 follow-ups:** template-editor fixes N1–N4 and a drag handle in the reorderable lists (a11y). **New:** Split - Transfer / Split - Filter (P109), Package - Partial (P111; not a tank exit), and a Transfer's CIP follows its day. |
| 1 | **Batches:** planning from a template (two-day brews; a CIP after a full Package); P-numbers; the brew-day batch number (suggestion; unique ignoring case; a leading `#` stripped; un-check frees it). |
| 2 | **Moving and checking off:** the server-side preview with move all / move only and following steps; off-plan check-offs; shifting a batch; changing one vessel's tank; occupancy that ends at a done exit. |
| 3 | **Status and flags:** tank status lines (§3.8); eight flag kinds with sign-off. Signatures are **canonical strings**, the same on every node. |
| 4 | **Standalone CIP & Sanitize; server-side Undo** (2 min, author only); retiring a tank in use is refused (P4). |
| 5 | **The Gantt at Brewery → Production:** toolbar, grid, phase-colored bars, planned bars ghosted, dots with initials, badges, stacking, out-of-service bands, transfer arrows, expand, names-only, remembered view. Plan batch, drags (mouse, plus a 450 ms long-press on touch) with a **live drag hint**, the move and number prompts, the batch / step / CIP dialogs, the Flags list, out of service on the Gantt, and Undo. The Batches nav entry is removed. |

**Migrations:**
- `template_steps.split_method`, `package_partial`;
- `batches` (number nullable, unique on `lower(batch_number)`, `volume_bbl`, `template_id`, `brew_two_days`);
- `batch_vessels`, `production_steps`, `production_step_links`, `flag_signoffs`, `production_undos`.

**DEV seed:** the legacy synthetic batches are removed; `[SEED]` scheduled batches cover every state.

## Testing

- **Local gate (`dd47248`):** ExUnit 1598/1599 (one "Database busy" flake in the D41 `task_board_test` setup; passed 3/3 on rerun). Vitest 153. Full Playwright 482 passed, 1 skipped (47 min).
- **DEV runs:**

  | Run | SHA | Result |
  |---|---|---|
  | 1 | `6e1c5ac` | 481 passed / 2 failed. P32 was a real refetch-mid-drag bug, fixed. P5 was a test assumption. |
  | 2 | `31890b6` | 491 passed / 1 failed. A keyboard test pressed keys too fast; fixed in `c0f9cbe`. |
  | 3 | `143db36` | **496 passed / 0 failed** |
  | 4 | `63ad57d` | **496 passed / 0 failed** |

- **Final ExUnit:** 1609 tests, 0 failures.
- **QA:**
  - Pass 1: 3 must-fix (typed dates, `#40`, early full Package) and 9 minor, all fixed.
  - Recheck: 7 new minor (preview numbering, hint layering and position, leftover CIP occupancy, Escape, out-of-service hint, drag back to start), fixed.
  - Recheck 2: all fixed except four small items. Those were fixed in cycle 3 (Matt approved a third cycle).
- **Lead-found in cycle 3:** flag signatures hashed `:erlang.term_to_binary`, which differed between the seed's `eval` node and the server, so the seeded sign-off read as reopened. Now a canonical string. Verified on DEV: the running server reads the seeded sign-off as signed off.
- **Matt on the Pixel:** the long-press drag and the drag hint both work.
- **Performance (QA, DEV):** the schedule loads in a median 56 ms (target < 300 ms); a move round trip takes 41–122 ms (target < 500 ms).

## LIMITATIONS / later

- The "Label by" picker is deferred.
- An expanded tank draws links only within itself.
- **D48:** Shift-drag = Move only (P113), plus the batch changes (§3.11).
- **Task 4670:** flag fix buttons, planned vs actual, a capacity row, date bands, print, live updates.
- **Pre-existing:** two `tsconfig.e2e.json` errors (task-board-phone, beer-board-import) and 27 lint problems in older pages.

## Notes for D48

- Same workflow. The builder brief keeps the rule "full runs only through `LEAD: run`".
- When Matt types "continue" in the builder pane, it means resume; it doesn't mean skip the lead's steps.
- Running QA alongside the full DEV suite works when QA uses its own data. Tests that read the shared tank order must assert relatively (P5, item 10).
