# Session Handoff — 2026-10-21

Supersedes `SESSION_HANDOFF_2026-10-20.md`. This session finished the production scheduling design, wrote and got approval for the spec (D46–D49), and took **D46** through the full workflow to `develop` and DEV.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.16` (UI v23 / API v27). D46–D49 go to prod together in one release after D49 (Matt). |
| **DEV** | Free (released in discussion 80). Running `develop` `600a7cf` (API v45, UI v48), reseeded. |
| **develop** | `6f91887` (D46 completion record) plus this handoff. PR #32 is merged. |
| **Local** | Checkout on `develop`. The untracked `.playwright-mcp/` was already there. |

## Production scheduling

- **Spec (approved):** `specs/d46_production_scheduling_spec.md`: D46 setup, D47 batch schedule and Gantt, D48 links/ramps/moves on batches, D49 task-board linkage and the brewhouse tablet. Scenarios P1–P108. All open questions are decided (see §6).
- **PortableMind (project 254):** D46 = 4629 (In Review), D47 = 4630, D48 = 4631, D49 = 4632. Follow-ups from the D46 gate = **4650**.
- **D46 record:** `stepwise_results/d46_tanks_templates_COMPLETE.md`.
- Local-only design files are in `docs/current_work/reference/` (excluded from git): the mockup and the notes.
- **Order:** D46–D49 come before 3994 (due 2026-10-30) and 4058 (due 2026-11-04). Matt said not to move those due dates yet.

## Next: D47

1. Branch `d47-batch-schedule-gantt` from `develop`. Write the plan from spec §3.5–§3.10 (P20–P64) and the D46 plan's lead decisions (the Gantt takes over out-of-service management, the tank-retire stub, Plan batch offers complete templates only).
2. **Start with task 4650** (N1–N4, the a11y fix for sortable rows, and concurrent edits).
3. The builder brief must say: **full test runs go in a visible herdr tab**, never a hidden background shell.
4. QA briefs: the agent cleans up only the ids it created. Never clean up by id range or name pattern.

## Gotchas from this session

- The DEV reseed is `RockcutApi.Release.seed_synthetic()` over `fly ssh console`. Locally it's `mix rockcut.synthetic.setup`.
- The QA folder is `~/src/rockcut-d46-qa`, with auth storageStates; never open them. Reuse it, or copy it for D47 QA, and update the Read-deny list.
- Memory is tight: one Playwright run at a time, `--workers=1` against DEV. A full DEV run takes about 26 minutes.
