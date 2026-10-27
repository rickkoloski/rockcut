# Session Handoff: 2026-10-26 (c)

Supersedes `SESSION_HANDOFF_2026-10-26b.md`. **D49 is planned. The builder hasn't started.** First session on the MacBook.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.22` (UI v24 / API v27). D46–D49 go to prod in one release after D49. |
| **DEV** | **Free.** Runs `develop` at `bae9548`. Not claimed for D49. |
| **Branch** | `d49-schedule-task-list` from `develop`, local only (not pushed). `df84721` holds the plan, the brief and the spec/CLAUDE.md split, on top of the 10-26b handoff commit (`46bcf34`, also unpushed). |
| **Local** | `~/src/rockcut` is on `d49-schedule-task-list`, with a clean tree. Servers stopped. No agents running. |

## D49 planning this session

- **Scope** (Matt, 2026-10-26): D49 = §3.12 task list linkage (P90–P103, P108) + §3.12a Clean not sanitized (P122–P129) + §3.12b Pencilled batches (P130–P135) + D48's BB1/BB2. The 10-26b handoff left §3.12 out.
- **D50** = the brewhouse tablet on the schedule (§3.13, P104–P107). Until D50, the tablet sees linked tasks read-only (`linked_task_device`). A PortableMind task for D50 isn't created yet.
- **"Show planned batches"** is per person on the server (`users.show_planned_batches`, `PUT /api/me/show_planned_batches`).
- **Plan:** `planning/d49_schedule_task_list_plan.md` (12 lead decisions). **Brief:** `prompts/d49_builder_brief.md` (Task 0 only: BB1/BB2).
- **Main design:** the step is the source, and `Production.TaskLink.sync!` recomputes derived board tasks after every schedule write, Undo and rename. Watch its timing against the 500 ms move budget.

## Next steps

1. **Start Herdr** in lead mode (`~/.config/herdr/rockcut-workflow.md` §1):
   - the lead in `~/src`, with the API and UI servers in the lead tab;
   - the build tab;
   - the ops tab.
2. **Start the builder** in `~/src/rockcut` with the `--disallowedTools` command from the workflow doc. Prompt it to read `prompts/d49_builder_brief.md` and do Task 0. Watch it.
3. **Before the DEV gate:** push the branch and claim DEV in discussion 80.
4. **Open:** create the D50 task in PortableMind (project 254).

## MacBook (new)

- **Installed today:** Herdr 0.9.5, with Claude integration hook v11 and `~/.config/herdr/` copied from the Chromebook bundle (`~/Downloads/rockcut-mac-setup/`).
- **Playwright MCP:** `--isolated`, using Google Chrome 156 from Homebrew.
- **Login check:** `fly auth login` may be needed on the first deploy.
- **Reboot checks:** the "after a reboot" checks in older handoffs used `free -m`, which doesn't exist on macOS. This machine has 24 GB.

## Other open items (unchanged)

- **Due soon:** 3994 (`decimal` / `bandit`), Oct 30; 4058 (pre-D34 token path), Nov 4.
- **Open tasks:**
  - D44 item 0 (`Schedule.tsx` split);
  - task 4707;
  - flakes 4706 and 4933.
- **REMIND:** 4055 / 4056 (events in calendar feeds, company-wide events). Raised during D49 planning; neither belongs in D49.
