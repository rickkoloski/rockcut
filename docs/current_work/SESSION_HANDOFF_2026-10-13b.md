# Session Handoff — 2026-10-13 (b)

Follows `SESSION_HANDOFF_2026-10-13.md` (D39 close-out), which this
supersedes. Written before a machine restart (Matt), at a clean stopping
point: **D41 steps 1–4 are done; step 5 is next.**

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.07` (D37), API v25 / UI v20. |
| **DEV** | **Free** (conv 80, msg 89298). Runs D39 `08dd32e` (API v34 / UI v31). D41 has not been on DEV. |
| **develop** | `e3548f3` (D39 merged + close-out), pushed. |
| **D41 branch** | `d41-department-task-boards`, **local only, not pushed** (Matt: no need before the restart). Everything is committed; the only untracked path is `.playwright-mcp/` (the builder's screenshots, not for git). HEAD `6b2b70e`. |
| **Backlog** | D41 = 4237, D42 = 4260, D40 = 4213, 4261 (D32 split-gap check). |
| **herdr** | `lead` tab; `builder` (w1:p5) was restarted fresh for Task 4 to free memory; tab `d41-brewery-pw` (a shell, can close). After the restart these are gone: see "Restart". |

## D41 progress

Spec `specs/d41_department_task_boards_spec.md` (approved 2026-10-13, with
two later wording fixes: S115 authorize-first, S105 owners not listed).
Plan `planning/d41_department_task_boards_plan.md`. Builder brief
`prompts/d41_builder_brief.md` (Tasks 1–4 + answers).

| Step | Commits | Result |
|---|---|---|
| 1. API rename (tables, `Tasks` modules, `/api/boards/:dept`) | `e3086df` | ExUnit 1,270/0 with test diffs names/paths only; migration `20261016120001_rename_brewery_task_tables` up/down/up on a copy |
| 2. UI rename (`pages/tasks`, `/tasks/brewery`, `boardPath`, storage-key fallback, redirect) | `b10058a`, `383f357` | Vitest 68, brewery folder 136/136, spec diffs names/paths only |
| 3. Per-department API (plug for 4 boards, `Authz` by department, scoped lookups, assignee rule, leaving a department, migration `20261016120002_add_department_id_to_task_events`, header, `task_boards`) | `31fe3ce`, `4e843b7` | ExUnit 1,344/0; brewery folder 136/136 (lead, `--workers=1`) |
| 4. Per-department UI (top-level Tasks, `/tasks/:dept`, switcher, per-board manager tools, hidden Daily card + "Set up Daily checks", neutral copy, `brewery_tasks_manage` removed) | `592fdeb`, `1473777`, `1cf0dde` | ExUnit 1,344/0, Vitest 75, `brewery-board` project 131/131 incl. new `tests/regression/tasks/task-board-departments.spec.ts`, `route_gating` 21/21 |

Decisions made during the build (spec updated): access is checked before
the id (outsiders get 403 on every route of a board; 404 for another
board's id applies to someone who can open both); `task_boards` in
department order (Brewery, Taproom, Office, Sales); owners aren't listed
as assignees (API accepts them); a board whose Daily items are all retired
shows "Set up Daily checks" again.

## Next

1. **Restart** (below).
2. **Task 5 = plan step 5, the All departments view** (spec §3.6, S118–S120;
   owners only, read-only, grouped by department per day, `GET
   /api/boards/all/tasks`, `/tasks/all`, `task_boards` adds `all` for
   owners). Write it into the brief and send it.
3. **Task 6 = plan step 6:** seed (Taproom + Office `[SEED]` tasks, no
   Daily items for non-Brewery boards), COVERAGE.md, local gate (full
   Playwright, all projects), handoff note, then ask Matt to push + PR + DEV
   gate.
4. Then D42 (**remind Matt he wants other changes in it**), then D40.

## Restart

- **Local servers:** start the API (`cd rockcut_api && mix phx.server`,
  :4002) and UI (`cd rockcut-ui && pnpm dev`, :5174); see the
  `rockcut-local-dev-native` memory. The local dev DB has all D41
  migrations.
- **Local data:** `[TEST-TEMP] … Trivia` events piled up locally from an old
  spec leak (fixed in Task 4); run `mix rockcut.synthetic.setup` to clean
  them before the next browser pass.
- **herdr:** recreate the `build` tab and start the builder (command in
  `~/.config/herdr/`'s Rockcut workflow doc; name `builder`, the
  `--disallowedTools` list there). Its first prompt: read
  `docs/current_work/prompts/d41_builder_brief.md` from the top, then do
  Task 5.
- **Memory:** the machine has ~10 GB. Run Playwright with `--workers=1`
  and never alongside ExUnit; Claude Code reaps background runs under
  memory pressure.

## Gotchas (new)

- **Low memory reaps runs:** both the builder's and the lead's watchers
  were killed mid-Playwright. One worker fixed it.
- **The builder can't be stopped by `herdr agent stop`** (no such command):
  prompt it `/exit`, then `herdr agent start builder … --pane w1:p5`.
