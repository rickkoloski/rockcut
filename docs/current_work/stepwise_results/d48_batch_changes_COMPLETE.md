# D48: Changing a Batch — Completion Record

**Status:** COMPLETE on DEV. Merged to `develop` 2026-10-26 (PR #34). **On prod** in `v2026.10.27` (2026-10-27, PR #38, with D46–D49).
**Spec:** `specs/d46_production_scheduling_spec.md` (§3.11, the Shift-drag row and "Toolbar changes in D48" in §3.6, "Marking a tank clean or dirty" in §3.8; scenarios P65–P89, P110, P113–P121)
**Plan:** `planning/d48_batch_changes_plan.md`
**Brief / lead decisions:** `prompts/d48_builder_brief.md`, `prompts/d48_lead_decisions_1.md` … `_8.md`; fix-cycle status in `prompts/d48_fix_cycle_1_status.md` … `_7.md`
**QA:** `stepwise_results/d48_qa_report.md`, `d48_qa_recheck_report.md`, `d48_qa_recheck2_report.md` … `d48_qa_recheck7_report.md`
**PortableMind:** task 4631 (D48). Flakes: 4706 (task-board dark "✓ name"), 4933 (device_signout G4, new).

## What shipped

| # | Item |
|---|---|
| 0 | **Toolbar and layout** (decision 1); Shift-drag = Move only (P113). |
| 1 | **Batch changes** (`Production.BatchChanges`): add a step (type or "Something else", with links, tank, task list, assignee), remove an unfinished step, ramps (add / change), add or remove a Transfer/Filter (merge on remove), change template or brand while planned. Every change has a message with Undo. |
| 2 | **Splits** (`Production.Splits`, `Parts`): Split - Transfer / Filter into parts (one may stay; volumes must add up), part labels (#40.1), dashed gold arrows, Undo split. The stored `split_stays` / `split_links`. |
| 3 | **Split rules from the DEV gate:** the tree rule across a parent and its parts; tanks locked while split, and Brand and Template too; **a split batch moves as one tree** (Move all, the Split itself, a late check-off, the bar's Shift; a done part step blocks it; Move only flags out-of-order parts); **check-off order**: nothing that empties a tank before brew day, a part's exit waits for the parent's Split, the Split and brew day stay done while an exit after them is; **Undo obeys the same order rules**. |
| 4 | **Multi-select** on the Gantt: highlight, selection bar, move and assign. |
| 5 | **Clean / dirty marks** (`Production.ConditionMarks`): the ⋯ panel's Mark clean… / Mark dirty… and History; icons on the Gantt; the occupancy rule respects them. |
| 6 | **Misc from QA:** the step PATCH refuses dates (`date_not_here`); the seed guard (a production spec that changes seed data fails by name). |

**Migrations:** `20261022120001_add_batch_changes_columns` (`batches.split_parent_id`, `part_number`; `production_steps.ramp_group`), `20261022120002_create_tank_condition_marks`, `20261022140001_add_split_stays_and_links`.

**DEV seed:** `[SEED]` batches with an added transfer and a split (Altruism #39, one part stays), and clean / dirty marks. The `[TEST-TEMP]` clean-up covers parts and marks.

## Testing

- **Final local gate (`5c0e9ec`):** ExUnit **1723 / 0**. Full Playwright 532 passed, 1 skipped, 1 failed (device_signout G4, a flake in D34 code: task 4933; DEV run 10 passed it).
- **DEV runs** (the ones recorded in the handoffs):

  | Run | SHA | Result |
  |---|---|---|
  | 1 | `4fce188` | 516 passed / 0 failed |
  | 3 | `04a757d` | 518 / 3 failed (two DST tests, fixed by hotfix `v2026.10.22`; one flake, 4706) |
  | 4 | `48f5688` | 523 / 1 failed (4706) |
  | 6 | (seed guard) | 527 / 1 failed (4706). Run 5's seed change was a hand edit on DEV |
  | 7 | `1625302` | 528 passed; 3 board flakes (4706) |
  | 8 | `bb38b29` | 531 passed; 2 board flakes |
  | 9 | `889c151` | **535 passed / 0 failed** |
  | 10 | `5c0e9ec` | **536 passed / 0 failed** |

- **QA:** a first pass, then seven rechecks, with seven fix cycles. Must-fixes by round: R1 (Undo not stale-checked) → X1/X2 (Undo of Undo split; split tank pickers) → Y1/Y2 (split moves as one tree; check-offs before brew day) → Z1 (a part ahead of its Split) → AA1 (Undo around the Z1 guard). **Recheck 7 found no must-fix**, so D48 closed under Matt's close-out rule (`d48_lead_decisions_5.md`): only minors → close, minors to D49.

## LIMITATIONS / for D49

- **BB1 (minor):** after a refused snackbar Undo, the UI drops the Undo button, though the API would accept the retry once the blocker is cleared.
- **BB2 (minor):** a few Undo routes are still refused as a generic `undo_stale` and stay refused once the blocker is cleared: the Split's Undo after a part's full Package, brew day's Undo in a split family, a Split un-check's Undo after brew day, and a late Split check-off's Undo. Safe (nothing saved wrong), but after a refused late-Split Undo the parts keep their carried dates and must be moved back by hand. Fix: give these the rule's own code and keep the Undo available.
- **CIP & Sanitize** can be checked off before brew day or the Split (not an exit, no status effect). Left as it is.
- **Flakes:** 4706, 4933.

## Notes for D49

- Same workflow, with the targeted-recheck close-out rule.
- D49 scope already added to the spec: §3.12a Clean not sanitized (P122–P129), §3.12b Pencilled batches (P130–P135). Check during planning whether D49 needs splitting. Fold BB1 / BB2 in.
- Watch for Herdr permission prompts on the builder ("Dangerous rm operation not ruled out" fired on a `\${` in a grep), and for API connection drops on QA agents (resume them with a short prompt).
