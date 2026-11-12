# D58 builder brief — Stage 1 (Board settings)

2026-11-11 · lead → builder.

**Read first:** `docs/current_work/specs/d58_board_settings_and_managers_spec.md` (approved,
decisions 1–8) and `docs/current_work/planning/d58_board_settings_and_managers_plan.md`. This brief
covers **plan Stage 1 only** (spec §3.1, §3.2). Stop after it and report.

**Where:** `~/src/rockcut`, branch `d58-board-settings-and-managers` (checked out; don't switch).
Small commits (`feat: D58 …`), staging paths by name. No push, merge or rebase. The lead runs the
servers (API :4002, UI :5174); ask with `LEAD:` if you need a restart or migration on the dev DB.
**Only `mix format` the files you change** (a repo-wide format reflows the legacy tree).

## Do

1. **Migration** `users.board_settings` (`:map`, default `%{}`, `null: false`). Reversible.
2. **`Accounts.BoardSettings`** (or similar): one closed schema per board key.
   - `span` 7|14;
   - `hide_completed`, `hide_shifts` boolean;
   - `first_day` "today"|"sunday"|"monday";
   - `view` "all"|"mine"|"unassigned" ("mine" not allowed on `all`);
   - `phone_view` "vertical"|"day".
   - Unknown keys or values → 422 (field errors), nothing saved. Merging keeps the other keys and
     boards.
3. **API:** `PUT /api/me/board_settings/:board` (merge the given keys; answer the board's full map,
   defaults filled in). `GET /api/me` adds `board_settings` (the stored map; the UI fills defaults).
   `board`:
   - **a person:** any department board they can `:read` (`Authz`, as the board routes check), or
     `all` (owners only);
   - **a device:** only its home board, no staff code (`Authz.Device`). Anything else is 403;
   - an unknown key is 404.
   ExUnit for each rule, both allowed and refused, plus a device on another board.
4. **UI** (`pages/tasks/useBoardView.ts`, `lib/tasks.ts`, `TaskBoard`, `AllBoard`, `BoardToolbar`):
   - settings come from `/api/me`'s `board_settings` with defaults (2 weeks, off, off, Today, All,
     vertical), and changes save through the new route: optimistic, with a quiet "Not saved" toast
     on failure (the change stays for this page);
   - the **View filter** is now one of them (it wasn't remembered before);
   - **Carry-over:** if `/api/me` has no entry for this board and this browser has the old local keys
     for it (D41/D42/D45, incl. the shared/legacy fallbacks `readFor` handles), PUT them once, and
     clear those local keys **only after the PUT succeeds**. Never PUT a carry-over when the server
     already has that board. The last-board key (`rockcut.tasks.board`) stays local.
   - Remove the now-dead local read/write helpers, but keep what the carry-over needs.
   - **31-day clamp** (spec §3.2): over 31 days, show `from` + 30, with a notice "Showing 31 days
     (the most a board shows)", and correct the URL with `replace`. An invalid range falls back to
     the default and is corrected the same way. Same on All departments.
   - Vitest: carry-over (has local + no server → one PUT, then cleared; server has it → no PUT; a
     failed PUT → keys kept), the clamp and invalid-range math, defaults.
5. Look at it in a browser (token injection per `rockcut-ui/tests/RUNNING.md`):
   - as `brewer1`: change settings and confirm they hold after a reload and in a fresh context;
   - as `taproomDevice`: change View;
   - try a 40-day URL.

## Don't

- No manager or positions work (Stage 2) and no backlog items (Stage 3).
- No Playwright specs yet (Stage 4).
- Don't touch `CLAUDE.md`, the spec, the plan or the handoffs.

## Done when

`mix test` twice green, `mix compile --warnings-as-errors`, tsc, vitest, lint no worse than 27, build.
Commits on the branch. Reply with: commits, files, test counts, what you checked in the browser,
and `LEAD:` notes.

---

# Stage 2 (Managers and everyone)

2026-11-11 · lead → builder. Stage 1 is in (`5933d34`, `d9c2509`); your five Stage 1 choices are
accepted. Do **plan Stage 2** (spec §3.3, §3.4; decisions 3, 5, 6, 7), then stop and report. Same
rules as Stage 1.

1. **List:** `Accounts.list_users_for/1`: any manager gets every person (devices excluded). For a
   manager, each user row adds:
   - `can_edit`: shares a managed department, as today's `can_manage_user?`;
   - `can_deactivate`: see 3;
   - `addable_departments`: the departments the actor manages that the person isn't in, as keys
     and names.
   Owners get `true` / all assignable departments, as fits.
2. **Owners stays hidden** (decision 7, D59 decision 9): on a row the actor **doesn't** manage, the
   person's memberships/departments pass through `Authz.can?(actor, :see, {:department, d})`.
   Owners is dropped for a non-member manager. Rows they manage keep D59's chip. Check every
   payload a manager gets about a person (list, show, update/save replies, audit/activity if
   shown). Test as `breweryMgr` on `ownersAsst`: no Owners in any response.
3. **Deactivate** (`Authz.can?(actor, :deactivate, target)`; used by `update_user` whenever `active`
   changes, both directions):
   - owner → yes, with the last-owner guard kept;
   - manager → yes if the target has **no** memberships, or the actor manages **every** department
     the target is in (Owners included, which no one manages);
   - otherwise → 403 "You can manage this person only in your departments" (or similar plain
     text).
4. **Read-only rows:** for a target the manager doesn't manage, every write except adding a
   membership in a department they manage is 403: name, email, schedulable, roles, reset password,
   staff code, deactivate. **Add department** adds an `employee` membership through the existing
   membership path, which already checks `:assign` per department. Make sure a manager's
   membership PUT on such a person only **adds** and never removes the departments they can't see
   or manage.
5. **Positions (5769):**
   - `can?(action, %Position{})` writes (create/update/delete/reorder/retire/recolor) need
     `role_in(user, position.department_id) == :manager`; create checks the requested department,
     and moving a position needs both departments. Owners pass.
   - Then look at shift templates and schedule/day/week templates: if they carry positions or
     departments, a manager may write only those whose positions are all in departments they manage.
     If not, note why in your report.
   - **D31 parity tests:** flip only the expectations this deliberately changes (managers listing
     everyone, positions and templates scoped). Each flip gets a `# D58: …` comment. Anything else
     failing is a regression: fix it, don't flip it.
6. **UI** (`pages/users/UserManagement.tsx`, `UserFormDialog.tsx`, the Positions dialog):
   - read-only rows say so;
   - **Add department** pull-down from `addable_departments`, hidden when empty;
   - Deactivate greyed out with a tooltip when `can_deactivate` is false;
   - no Owners on read-only rows (the API already leaves it out; don't reintroduce it from
     `/api/departments`);
   - the Positions dialog shows other departments' positions read-only for managers.
   - Vitest for any helper.
7. **Tests:** ExUnit for spec §5 S7–S14 as `breweryMgr`, `barMgr`, `dualMgr` and `owner`, each with
   both refusal and allowed cases. Plus a check that S7's add keeps `bartender1`'s Taproom
   membership. Use `[TEST-TEMP]` people in tests where a seeded persona would change.
8. **Browser:** as `breweryMgr`, Users & Roles: everyone listed, `bartender1` read-only with Add
   department (Brewery), `floater` Deactivate greyed out, `ownersAsst` with no Owners in the
   network traffic. Undo any change you make to seeded personas on the dev DB.

## Done when

`mix test` twice, warnings-as-errors, tsc, vitest, lint ≤ 27, build. Commits. Reply with: commits,
files, the parity tests flipped (each named), test counts, browser checks, `LEAD:` notes.

---

# Stage 3 (Backlog sweep)

2026-11-11 · lead → builder. Stages 1–2 are in (through `bfe0556`); your Stage 2 notes are accepted
(Add department not forced to employee in the API; 404 for unknown ids). Do **plan Stage 3**
(spec §3.5–§3.11), then stop and report. Same rules. Each item is its own commit. Each bug fix
gets a test that **fails with the fix reverted and passes with it restored**: actually revert and
re-run, and say so.

1. **5202 repeat twin (§3.5):**
   - when a rule change remakes a task series' dates, skip a date whose occurrence was moved away
     ("Just this one" to another day); the moved one stands in for it;
   - update the rule-change confirm text to say moved ones stay on their new days;
   - ExUnit from the D53 Part 1 QA repro (`docs/current_work/stepwise_results/d53_part1_dev_qa*.md`,
     gap 14).
2. **4261 event-series split (§3.6):**
   - reproduce D39's G1 ("following" from before a split stops at it) and R1 (a rule change from
     before a split keeps the split's internal end) on `Scheduling.EventSeries` /
     `schedule_event_series`, with ExUnit;
   - if a gap shows, port D39's chain approach (`continues_series_id`, `internal_end`; a migration if
     needed), with tests;
   - if neither shows, keep the tests as proof and say so.
3. **5204 (§3.7):** `Shift` changeset: an inactive assignee gets a 422 on `assignee_id`, "is not
   active", on create, update and reassign/drag. Existing shifts untouched.
4. **4118 item 1 (§3.8):** `UserFormDialog`: staff code **Remove** marks it ("Removed when you press
   Save"), **Cancel** keeps it, and only Save sends the `DELETE`.
5. **5206 (§3.9):** Idea Boards: a card URL naming a card that isn't on this board (missing, bad id)
   shows the board plus "That card wasn't found (it may have been deleted)", and the URL is
   replaced with the board's. People and tablets.
6. **5205 (§3.10):** start-up in `App.tsx`: the loading screen at once while `/api/me` is pending;
   after 4 s it adds "Still connecting…" with Retry. The existing failure/timeout banner is
   unchanged. Vitest with fake timers.
7. **4061 (§3.11):** the shared device header at 320/360/384 px stays one line:
   - Sign out becomes an icon button with an aria-label;
   - the device pill ellipsizes;
   - the logo keeps its gap;
   - unchanged at ≥412 px.
8. **Tidy:** the greyed-out Active switch's tooltip in Users & Roles sits on the switch.
9. **Browser:** check items 4–8 by hand (token injection).

## Done when

`mix test` twice, warnings-as-errors, tsc, vitest, lint ≤ 27, build. Commits. Reply with: commits,
the revert checks, the 4261 finding, browser checks, `LEAD:` notes.

---

# Stage 3b (UI follow-ups added by Matt, 2026-11-11)

2026-11-11 · lead → builder. The spec has decision 9 and §3.12–§3.16; the plan has Stage 3b. Do them
after Stage 3, one commit per item, then stop and report. Same rules (revert checks for bug fixes,
format only your files).

1. **§3.12 (4118 items 2–6):** Buy-a-Beer import "Ignored columns" (blank → "(blank)", long ones
   wrap, repeats once); Redeem after "already removed" closes the dialog and refreshes; Users &
   Roles Taproom "— None —" shows as such, with the staff code note "cleared when you press Save".
   The QA2 report has repros: `docs/current_work/stepwise_results/d37_dev_qa2_report.md`.
2. **§3.13 (4118 item 7):** readable labels for `staff_code.set` / `.remove` / `.reveal` in the user
   change log.
3. **§3.14 (4115, 4116):** History `q` also matches the actor's name, and "Shared Device" matches
   device changes; Export CSV passes the same `q`. ExUnit for the query; vitest if a helper.
4. **§3.15 (4319):** catch the push subscribe failure (`src/lib/push.ts` /
   `NotificationPreferencesDialog`) and show the message; vitest with a stubbed failing subscribe.
5. **§3.16 (5193):** drag Idea Board list columns on desktop. Use an outer horizontal sortable with
   the card layer nested; **don't change** `components/dnd/` (the task boards use it). Same rules
   and History as ⋮ Move left/right. Phone unchanged. Re-run the task-board and Idea Board drag
   Playwright specs locally (`--project=idea-boards --no-deps`, then `--project=brewery-board
   --no-deps`, one at a time) and report.
6. **Browser:** check 1, 3, 4 and 5 by hand.

Done when: `mix test` twice, warnings-as-errors, tsc, vitest, lint ≤ 27, build, the two drag
projects green. Reply with commits, revert checks, and `LEAD:` notes.

---

# Stage 4 (Playwright + coverage)

2026-11-12 · lead → builder. Stages 1–3b are in (through `0fb9b6a`). Do **plan Stage 4**, then stop
and report. Same rules; servers are the lead's.

1. **Reset board settings in the Playwright setup:** board settings live on the server now and leak
   between specs and runs. In the setup project (`tests/auth.setup.ts` or a fixture beside it),
   clear every persona's and both devices' `board_settings` before a run, through the API or the
   synthetic setup path that works on local **and** DEV (no DB access from tests on DEV). Also make
   `mix rockcut.synthetic.setup` / `seed_synthetic()` reset `board_settings` for personas and
   synthetic devices, so DEV starts clean.
2. **Update the old specs** that read or set the D41/D42/D45 local board keys:
   `tasks/task-board-follow-ups.spec.ts:365`, `tasks/task-board-departments.spec.ts:369` and `:523`,
   `brewery/task-board-hide-shifts.spec.ts:164`. They now go through the server settings (and the
   carry-over where that's what they test).
3. **Specs for S1–S28** (spec §5) under `tests/regression/d58/`, one file per theme (settings,
   managers, sweep, follow-ups). Fold in the specs you already wrote in Stage 3/3b rather than
   duplicating them.
   - Every spec declares its persona with `test.use({ storageState: authFile('<key>') })`, and no UI
     login.
   - Negative personas assert the **visible** refusal (greyed control, tooltip, read-only note), plus
     the API status where there's no UI path.
   - Anything created is `[TEST-TEMP]` and removed **by exact id** in cleanup. People are deactivated
     by id. Settings changed on a persona are reset in `afterAll`, even on failure.
   - S8–S11 and S24 use `[TEST-TEMP]` people where a seeded persona would change.
   - S12 asserts no Owners in the `/api/users` response as `breweryMgr`.
   - S16 covers the 4261 chain.
   - If specs share personas' settings or memberships, give them their own project with one worker,
     as D59's `owners` project does.
4. **`tests/COVERAGE.md`:** a D58 section, scenario → layer (ExUnit / Playwright / vitest /
   manual-only / GAP).
5. **Run** the D58 specs twice, then the projects whose specs you changed
   (`--project=<name> --no-deps`, one at a time). Don't run the full suite: the lead does that at
   Stop 2.

Done when: the D58 specs pass twice, the changed projects are green, `tsc -p tsconfig.e2e.json`
shows no new errors, lint ≤ 27. Commits. Reply with: commits, files, run results, any manual-only
or GAP rows and why, `LEAD:` notes.
