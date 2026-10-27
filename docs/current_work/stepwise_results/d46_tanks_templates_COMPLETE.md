# D46: Production Setup (Tanks, Out of Service, Phases & Step Types, Templates) — Completion Record

**Status:** COMPLETE on DEV. Merged to `develop` 2026-10-21 (PR #32, merge `600a7cf`). **Not on prod:** per the spec, D46–D49 go to prod in a single release after D49.
**Spec:** `specs/d46_production_scheduling_spec.md` (§3.1–§3.4, scenarios P1–P19)
**Plan:** `planning/d46_tanks_templates_plan.md`
**Brief / lead decisions:** `prompts/d46_builder_brief.md`, `prompts/d46_lead_decisions_1.md`, `_2.md`, `_3.md`
**QA:** `stepwise_results/d46_qa_report.md`, `stepwise_results/d46_qa_recheck.md`
**DEV now:** `develop` at `600a7cf` (API v45, UI v48), reseeded.
**PortableMind:** task 4629 (D46). Follow-ups accepted at the gate: **4650** (fix at the start of D47).

## What shipped

| # | Item |
|---|---|
| 1 | **Brewery → Production** hub (`/brewery/production`) with Tanks, Templates and Phases & steps cards. Brewery members and owners only. Devices get 403 until D49. |
| 2 | **Tanks**: add/edit (type, capacity in bbl, location, notes), names unique ignoring case (full-width characters folded), reorder (drag or arrows), retire/restore. **Out of service** periods in the tank dialog: Now / Coming up / Past, open-ended "Until further notice", Back in service today, no overlaps (the error names the other period), and a list chip ("Out Oct 27–Nov 2"). |
| 3 | **Phases & steps**: 9 seeded phases with a 12-color palette (contrast ≥ 4.5:1 in both themes); 19 seeded step types, 7 of them built-in (can be renamed, not retired); add, rename, recolor, full name, starting phase, task-list default, reorder, retire/restore. |
| 4 | **Templates**: list (step count, Incomplete badge with reasons, Duplicate, Retire/Restore). The editor: Brew day fixed at day 0; steps with a name addition and Set temp °F; phase starts; tanks; a **Transfer/Filter moves the beer into a new tank** (the API refuses anything else) and adds a CIP for the tank it leaves; links (comes after / leads to; move all / move only; no cycles, no earlier days); **ramps** (28–80°F, whole degrees); an issues banner; a per-tank preview; stale-edit handling ("removed by someone else · Reload"). |

New tables: `tanks`, `tank_outages`, `production_phases` (seeded), `production_step_types` (seeded), `process_templates`, `template_steps` (with `ramp_group`), `template_links`. The DEV seed adds FV1–FV7, Serving 1–2, two outages and three `[SEED]` templates.

## Testing

- **Local gate:** ExUnit 1537 tests, 0 failures; Vitest 133; tsc and build clean; lint unchanged (27 waived). Full Playwright `--workers=1`: 426 passed, 1 skipped (DEV-only banner), including 26 D46 specs.
- **DEV run 1** (`3e81989`): P16 and S35 failed every time; the tests read or reloaded before the save had finished. Fix cycle 1 (`2ea3565`) added `waitForResponse`.
- **QA pass 1:** 1 must-fix (M1: a second Transfer/Filter could target a tank that already exists) and 11 minor. Fix cycle 2 (`ad7a48b`) fixed M1 and minors 1–9.
- **DEV run 2** (`ad7a48b`, API v44 / UI v47, reseeded): **438 passed, 0 failed** (25.8 min).
- **QA recheck:** all 10 FIXED; P14–P17 pass. New minor findings N1–N4.
- **Accepted gaps (Matt, 2026-10-21) → task 4650:** N1 transfers added out of day order give an unclear error; N2 removing a middle Transfer orphans the later tanks; N3 the ramp dialog's per-day limit; N4a–c misleading messages and copy; item 10 nested controls in sortable rows (a11y); item 11 concurrent edits (last write wins).
- **Incident:** in pass 1, QA retired and deleted rows by id range, which hit seed rows. Fixed by reseeding DEV. From now on, QA briefs say to clean up only the ids the agent created.

## Notes for D47

- Start with task 4650.
- Builder briefs must say that full test runs go in a visible herdr tab, never a hidden background shell.
- What D46 left for D47 (plan lead decisions): the Gantt (including out-of-service management there, P6/P10), the tank-retire check for unfinished steps (currently a stub), and Plan batch offering complete templates only.
