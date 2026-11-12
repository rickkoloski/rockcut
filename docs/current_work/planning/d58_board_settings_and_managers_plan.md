# D58: Board settings on the server, managers and everyone, and a backlog sweep — Plan

2026-11-11 · lead. **Spec:** `specs/d58_board_settings_and_managers_spec.md` (approved 2026-11-11,
decisions 1–8). **Tasks:** 4994, 4991, 4992, 4984, 5769, 5202, 4261, 5204, 4118 (item 1), 5206, 5205,
4061. **Branch:** `d58-board-settings-and-managers` in `~/src/rockcut`, from `develop` @ `7f4e5be`.

Three themes in three stages, each its own commits, then Playwright. The spec sections drive the
work; this plan names the code and the order.

## Stages (stops marked ■)

1. **Board settings (spec §3.1, §3.2).**
   - **API:**
     - Migration `users.board_settings` (`:map`, default `%{}`, not null).
     - `Accounts.BoardSettings`: a closed schema per board key:
       - `span` 7|14;
       - `hide_completed`, `hide_shifts` boolean;
       - `first_day` today|sunday|monday;
       - `view` all|mine|unassigned (`all` board: all|unassigned);
       - `phone_view` vertical|day.
     - `board` is a department key the account can read, or `all` (owners only). Anything else is
       a 422 or 403.
     - `PUT /api/me/board_settings/:board` merges the given keys and answers with the board's map.
     - `GET /api/me` includes `board_settings`.
     - `Authz`: a person may for any board they can `:read`; a device only for its home board
       (`Authz.Device`), with no staff code.
     - ExUnit for each rule, the device refusal and a bad key or value.
   - **UI:**
     - `useBoardView` and `lib/tasks.ts` read from `/api/me`'s `board_settings` and save through the
       new route (optimistic, with "Not saved" on failure).
     - The View filter joins them: `TaskBoard`, `AllBoard`, `BoardToolbar`.
     - Carry-over: if the server has no entry for this board and `localStorage` has D41/D42/D45 keys,
       PUT them once and remove the keys. The last-board key stays.
     - **31-day clamp** in `useBoardView`: over 31 days, show `from` + 30 days, a notice, and
       `setParams(…, { replace: true })`; the same for an invalid range.
     - Vitest for the carry-over and the clamp.
2. **Managers and everyone (spec §3.3, §3.4).**
   - **List and visibility:**
     - `Accounts.list_users_for/1`: any manager gets every person.
     - The user JSON for a manager adds `can_edit`, `can_deactivate`, `addable_departments`.
     - On rows the actor doesn't manage, departments go through `Authz.can?(:see, {:department, d})`
       (decision 7: Owners hidden). Rows they manage keep the D59 chip.
   - **Authz:**
     - `can?(:update | :reset_password, target)`: unchanged (shared managed department).
     - New `can?(:deactivate, target)`:
       - owner → any (with the last-owner guard);
       - manager → when the target has no memberships, or every membership's department is
         managed by them.
     - `update_user` uses it whenever `active` changes.
     - `:assign` memberships: unchanged; Add department goes through it.
     - Flip the D31 parity tests that pin the old behavior **explicitly**, each with a comment
       naming D58.
   - **Positions (5769):**
     - `can?(action, %Position{})` writes need `role_in(user, position.department_id) == :manager`
       (owners pass), and moving a position needs both departments.
     - Shift templates and schedule templates: check whether they reference a position or
       department. If they do, apply the same rule to their positions. If not, note why. Flip their
       parity tests explicitly.
     - The Positions dialog shows only the manager's departments' positions as editable.
   - **UI** (`UserManagement`, `UserFormDialog`):
     - read-only rows;
     - Add department pull-down (from `addable_departments`);
     - Deactivate greyed out with a tooltip when `can_deactivate` is false.
   - **Tests:** ExUnit for every row of spec §5 S7–S14, as `breweryMgr`, `barMgr`, `dualMgr`,
     `owner`.
   - ■ **Stop 1:** stages 1–2, `mix test` twice, tsc, vitest, build. Report to Matt.
3. **Backlog sweep (spec §3.5–§3.11).**
   - **5202:** `Tasks.Series` remake skips dates whose occurrence was moved away. Update the confirm
     text, and add a test from the D53 Part 1 QA gap 14 repro.
   - **4261:** reproduce G1/R1 on `Scheduling.EventSeries` / `schedule_event_series`. Port D39's
     `continues_series_id` / `internal_end` only if a gap shows, and test both ways.
   - **5204:** `Shift` changeset: an inactive assignee gets a 422 "is not active" (create, update,
     reassign).
   - **4118 item 1:** `UserFormDialog`: staff code Remove waits for Save, and Cancel keeps it.
   - **5206:** `IdeaBoardRoutes` / `IdeaBoard`: a missing or bad card id gives the notice plus a
     replaced URL.
   - **5205:** `App.tsx` start-up: the loading screen at once, then "Still connecting…" + Retry at
     4 s while `/api/me` is pending.
   - **4061:** the tablet header in `App.tsx` at ≤384 px: icon Sign out with an aria-label, and the
     pill ellipsized.
3b. **UI follow-ups added 2026-11-11** (spec §3.12–§3.16; decision 9): 4118 items 2–7 (Buy-a-Beer
   import headers, stale Redeem dialog, Taproom "— None —", readable staff-code activity), 4115/4116
   (History search matches the actor; export sends `q`), 4319 (push subscribe failure message), 5193
   (drag Idea Board lists: an outer horizontal sortable, with the shared `components/dnd/` layer
   unchanged; re-run the task-board and Idea Board drag specs). Each item gets its own commit.
4. **Playwright + coverage.** (Specs for S22–S28 too.)
   - Specs for S1–S21 under `tests/regression/d58/`, one file per theme.
   - Negative personas assert visible refusals. Destructive actions only by id on `[TEST-TEMP]` rows.
   - S8–S11 use `[TEST-TEMP]` people where a seeded persona would change.
   - `tests/COVERAGE.md` D58 section.
   - Run the new specs twice.
   - ■ **Stop 2:** full local gate, with the lead running the full Playwright suite.

## Gate

Workflow §3: `mix test` twice, `mix compile --warnings-as-errors`, `tsc`, `vite build`, vitest, lint
no worse than 27, full local Playwright. Then DEV: claim, snapshot, deploy (one migration), reseed,
full DEV Playwright, independent QA.

## Risks

- **Parity flips (stage 2).** The D31 parity suite pins "any manager writes positions and templates"
  and "lists only their departments". Each flip must be deliberate and named. Anything else failing
  is a regression.
- **The users payload** is where D59's Owners privacy could leak again. Test as a non-managing
  manager on the network, as D59's QA did.
- **Settings carry-over:** if it runs twice or on the wrong board, it could overwrite server
  settings with stale local ones. Clear the local keys only after the PUT succeeds, and never PUT
  when the server already has that board.
- **Shared tablets:** the device settings route is a new write path for devices. It's
  deny-by-default except the home board, and has no staff code by decision.
