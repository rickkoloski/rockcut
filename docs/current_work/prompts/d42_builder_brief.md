# D42 builder brief

**From:** the lead (the Claude in the Herdr `lead` tab), for Matt.
**Branch:** `d42-task-board-follow-ups`, in `~/src/rockcut`, cut from
`develop` after D41 merged (`9966d4d`). Not pushed.
**Pace:** Matt wants D42 and D40 done today and one prod release tonight.
Build exactly the spec, nothing extra; keep tests targeted while building
and save the full suites for Task 3.

## Read first

1. `CLAUDE.md` (repo root).
2. `docs/process/three_environment_workflow.md` §3 (the local gate) and §6
   (the Playwright rules).
3. `docs/current_work/specs/d42_task_board_follow_ups_spec.md`: all of it.
   It's short; §2 is the behavior, §4 the scenarios (S121–S140).
4. `docs/current_work/SESSION_HANDOFF_2026-10-14.md` and
   `SESSION_HANDOFF_2026-10-13b.md`: **Gotchas**.

Build nothing from D40 (tablet, reminder, dashboard card).

## Your limits

**You may:**
- edit code, docs and tests on this branch;
- run `mix`, `pnpm`, `npx playwright` and `curl localhost`;
- commit on this branch, using the repo's commit format and the attribution
  line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Never:**
- `git push`, `gh`, `fly`, merge, rebase, branch delete, `git stash`, or
  switching branches;
- anything on DEV or prod;
- posting in PortableMind.

**Format only the files you changed.** Never run a repo-wide `mix format`
or `mix precommit`.

**Servers:** the local API (:4002) and UI (:5174) belong to the lead. Don't
start, stop or kill them. If you need them restarted, write "LEAD: please
restart the API" and wait.

**Memory is tight:** Playwright with `--workers=1`, never alongside
ExUnit.

**When a decision isn't in the spec,** don't guess. Stop, and write the
question in your reply starting with `LEAD:`.

## Task 1: the API (spec items 1–6)

One commit per item is fine; each with ExUnit.

1. **Password reset gate (§2.1, task 4117).** A plug after `AuthPlug` in the
   authenticated pipelines (see `router.ex`: `:authenticated`,
   `:device_allowed`, and any others that authenticate people). Allowed
   while `must_reset_password`: `GET /api/me`, `GET /api/session`,
   `DELETE /api/session`, `POST /api/session/password`; everything else 403
   `password_reset_required`. **First** list which routes are open today to
   such a person (read the router) and say so in your reply.
   - Tests: a sample of read and write routes across areas (board, beer
     board, schedule, users), the four allowed ones, and both ways into the
     state (`POST /api/users` temp password; manager reset). The D31 parity
     and boundary suites must stay green; if a parity row changes, stop
     (`LEAD:`).
   - Revert-check: comment the plug out, see the tests fail, restore.
2. **Foreign `before_id` (§2.2):** 404, nothing changes; a stale same-board
   `before_id` still goes last.
3. **`no_brewers` → `no_one_scheduled` (§2.3)** in `json_helpers.ex` and
   its tests (the UI half is Task 2; do it in the same commit if simpler).
4. **Delete a never-ticked retired Daily item (§2.4):** `DELETE
   /api/boards/:dept/daily_items/:id` (managers; `Authz {:daily_items,
   dept}` `:manage`), 422 `not_retired` / `has_ticks`, 404 for another
   board's id, `deletable` in the retired list, History `item_deleted`. Add
   the route to the route matrix test.
5. **Notes-only (§2.5):** `Series.update_this/3` doesn't set
   `series_exception` when only `notes` changed; `update_following` applies
   a notes change only to occurrences whose notes equal the series' notes
   before the edit (title/assignee as now). Keep remove-later's
   keep/remove offer consistent with the new rule.
6. **Ends-only (§2.6):** detect an Ends-only change (no rule field changed)
   on a "following" edit / Edit series…; move the chain's end without
   touching any part's rule; generate or remove only at the end. The API's
   preview (`GET /tasks/:id/series` or whatever the confirm uses) must let
   the UI say "Extends" vs "Removes N". Tests: S131 (split weekly → monthly,
   Ends → Never from the earlier part: monthly part unchanged, ~12 months),
   S132, and an unsplit series.

Then: full ExUnit once (`mix test`), `mix compile --warnings-as-errors`.
Report counts, and stop for the lead.

## Task 2: the UI (spec items 3, 4, 6–9)

Wait for the lead's go after Task 1.

1. `no_one_scheduled` in `types.ts` / `DayHeader.tsx` (if not done).
2. Retired section: Delete for `deletable` items, with the confirm (§2.4).
3. The series confirm wording for an Ends-only change (§2.6).
4. Add / Restore disabled at 12 active items, with the hint (§2.7).
5. **Per-board settings (§2.8):** `rockcut.tasks.<setting>` → keyed by
   board (`all` included), with a one-time fallback from the shared key
   (the D41 rename fallback in `lib/tasks.ts` is the pattern). Vitest for
   the fallback.
6. **First day (§2.9):** Today / Sunday / Monday beside 1 week / 2 weeks
   (desktop and the phone toolbar/menu, wherever 1 week / 2 weeks lives at
   that width); range, Prev/Next, "Today", dimmed past days, `?day=`,
   typed range, phone vertical scroll-to-today and one-day. Shared through
   `useBoardView` / `BoardLayout` so All departments gets it too. Vitest for
   the range math (week boundaries, Colorado today, Sunday vs Monday, 2
   weeks, a week crossing a month/year).
7. **Playwright:** a new `tests/regression/tasks/task-board-follow-ups.spec.ts`
   for S121 (API), S123, S124 (API), S125–S128, S133–S140; series cases
   S129–S132 may be ExUnit-only if the UI part is only the wording (cover
   the wording in one Playwright test). Run the `brewery-board` project and
   your new file (`--workers=1`). Revert-check the per-board settings and
   one first-day test.

Report and stop for the lead.

## Task 3: local gate and handoff note

Wait for the lead's go. Then: COVERAGE.md (a D42 section, scenario →
test), Vitest, `tsc`, build, lint (27 pre-existing is the baseline), and
`docs/current_work/prompts/d42_handoff_note.md` (PR description, the D41
note's shape: what changed, no migrations, tests, DEV must exercise,
decisions, LIMITATIONS). The lead runs the full Playwright suite.
