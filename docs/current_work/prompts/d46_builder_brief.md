# D46 builder brief

**Branch:** `d46-tanks-templates` (checked out in `~/src/rockcut`).
**Read first:** `specs/d46_production_scheduling_spec.md` (APPROVED; D46 = §3.1–§3.4, P1–P19) and
`planning/d46_tanks_templates_plan.md` (the instructions, including the lead decisions at the top).
The mockup the spec came from: `docs/current_work/reference/tank_schedule_mockup.html` (local only; read it for look and wording — its JS is sample code, not a design to copy).

## Working rules (same as D45)

- Servers belong to the lead (API :4002, UI :5174 from this checkout). When you add migrations or need a restart, stop and say `LEAD: restart API` (or UI); don't start your own on those ports.
- **Memory is tight:** Playwright `--workers=2` at most, one run at a time, close every browser you start.
- Commits on this branch, staging paths by name; `feat: D46 …` / `fix: …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read or print tokens; use the harness storageState files.
- Format only files you changed (never repo-wide `mix format`).
- Stop after each task with a short report and `LEAD:` lines (questions, restarts, anything that deviates from the spec or plan).

## Task 1 — API

Migrations with the seeded phases and step types, the `RockcutApi.Production` context, `Authz` clauses, routes and controllers, the DEV seed, and ExUnit tests (plan "API" and "Tests"). Stop before UI work with `LEAD: restart API` and the test count.

## Task 2 — UI

Nav + hub, Tanks page with out-of-service periods, Phases & steps, Templates list and editor with preview, phase color palette (plan "UI"). Drive it in a browser as `brewer1` before writing Playwright.

## Task 3 — Playwright + local gate

Specs in `tests/regression/production/` for P1–P19 as the plan maps them, `tests/COVERAGE.md`, then the full local gate (ExUnit, tsc/build/lint, the full Playwright default suite). Report results and any LIMITATIONS for the DEV handoff.
