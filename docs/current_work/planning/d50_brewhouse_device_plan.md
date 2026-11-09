# D50: The brewhouse device on the production schedule — Plan

2026-11-08 · lead. **Spec:** `specs/d50_brewhouse_device_spec.md` (approved). **Task:** 4934.
**Branch:** `d50-brewhouse-device` in `~/src/rockcut-d50`, from `develop` @ `18a0502`.

D55 is merged to `develop` but not on prod yet. **D50 doesn't merge to `develop` until D55 is
released.** If Matt's tablet check forces the `35c6c7b` revert on `develop`, D50 merges `develop`
afterwards.

## What's there today (read before stage 1)

- **Production routes** all sit in one `pipe_through [:api, :authenticated]` scope
  (`router.ex`, `/api/production`), so `DeviceGate` 403s a device on every one. The controllers ask
  `Authz.can?(user, :read | :write | :setup, :production)` through a private `allow/2`, and pass
  `user(conn)` to `Undo.track/4`, `Signoffs.sign_off/2`, `Steps.complete/4` and the rest.
- **`Authz.Device`** has nothing for `:production` (the catch-all denies it).
- **`StaffCodeActing.acting/2`** (D37/D40) resolves the person from `staff_code` in the JSON body,
  checks `Authz.can?(person, :write, resource)`, and counts wrong codes per device token
  (`RateLimiter`, keyed by `device_token.id`), so the board and production **already share the
  counter** if both use it.
- **Linked tasks on the board:** `TaskBoardController.linked_write/3` refuses a device with
  `linked_task_device` (D49 decision 8, "until D50").
- **Undo:** `Production.Undo.undo/3` answers `:not_found` for another person's token.
- **No production History or notifications exist.** Who did something is stored as the person on
  the row (`production_steps.done_by_id`, `production_flag_signoffs.user_id`,
  `production_undos.user_id`).
- **Show planned batches:** `users.show_planned_batches` (D49). A device is a `users` row, so it
  already has the column; `TaskBoard.tsx` forces it on for a device (`|| isDevice`), and the Gantt
  filters pencilled batches client-side.
- **UI:** `useActing` (zustand, global) is the Acting-as state; `ActingBanner` and
  `ActingCodeDialog` exist. `App.tsx` limits a device's nav to `DEVICE_PAGES`. `TaskBoard.tsx` and
  `TaskMenu.tsx` mark linked cards read-only on a device.

## Lead decisions (made here; Matt can overrule)

1. **One resource for every production write on the device: `:production`.**
   - `Authz.Device`: a device whose home key is `"brewery"` may `:read` and `:write` `:production`.
     `:setup` falls through to the catch-all.
   - Every production write goes through `StaffCodeActing.acting(conn, :production)`. For people
     that's today's `Authz.can?(user, :write, :production)`, so behaviour doesn't change.
   - Owners' codes pass through the owner shortcut (spec §5.1).
2. **"On the Brewhouse device" is recorded with a nullable `device_id`** on
   `production_flag_signoffs`, on `production_steps` beside `done_by_id` (`done_on_device_id`) and on
   `production_undos`. That's one migration, with no new tables. The flags dialog and the step dialog
   show "Signed off by Jake · on Brewhouse" and "Done by Jake · on Brewhouse". Production has no
   History page, so these rows are its record. Linked-task writes made on the board write the
   board's task events with `device_id`, as D40's board writes do.
3. **Undo by someone else** gets a new error, `undo_not_yours` (403):
   `"Only <first name> can undo this."`. It applies to people too. An expired record still answers
   `undo_expired`, and an unknown token `not_found`.
4. **A code from outside the Brewery** gets the board's existing answer (`staff_code_invalid`,
   counted toward the lock). The spec says "as D40's S45"; use whatever the board says today, and
   don't add a new message.
5. **The per-device Show planned batches setting** is the device row's own `show_planned_batches`.
   - `PATCH /api/devices/:id` accepts it, under `:manage_device`.
   - `/api/me` reports it for a device.
   - On a device, `TaskBoard.tsx` and the Gantt read it instead of forcing it on.
   - Shared devices gets a switch, shown only for a Brewery-home device.
6. **Batch step links (§2.7):**
   - `POST /api/production/steps/:id/links` with `{ comes_after_id | leads_to_id, answer }`;
   - `PATCH /api/production/step_links/:id` with `{ default_answer }`;
   - `DELETE /api/production/step_links/:id`.

   Every one is Undo-tracked with the batch's scope (Undo already snapshots
   `production_step_links`). Validation is the template rules: no loop; "comes after" is never on a
   later day; within one batch or one split tree only (422 with a readable message). The step
   dialog's pickers offer only what passes, and the API refuses the rest.

## Stages (each its own commits; stops marked ■)

1. **API.**
   - `Authz.Device` `:production` clauses (decision 1); `authz_device_test.exs` pins them
     (brewery-home device yes, taproom-home device no, `:setup` no).
   - `router.ex`:
     - production **reads**, including setup reads (tanks, phases, step types, templates,
       template show, schedule), go into a `[:api, :device_allowed, :brewery]`-style scope
       (`:brewery` = `ModuleAccessPlug`, so a Taproom tablet gets 403);
     - **schedule writes** (batches, steps, CIPs, condition marks, flags, undo, outages) go there too;
     - **setup writes** (tanks except outages, phases, step types, templates) stay people-only.
     - Update `device_route_matrix_test.exs` for every moved route.
   - Controllers:
     - replace `allow(conn, :write)` + `user(conn)` with an `actor(conn)` helper that returns the
       person, with `on_device_id` set as `TaskBoardController.writer/1` does;
     - pass the person to `Undo.track`, `Signoffs`, `Steps.complete` and the rest;
     - answer `recorded_as` on device writes (as the board does);
     - `ProductionErrors` renders `StaffCodeActing.render_error/2`.
   - Decision 2's migration, its fields, and their serialization.
   - Decision 3: `undo_not_yours`.
   - Board linked tasks: `linked_write/3` drops the device refusal and resolves the person through
     `StaffCodeActing.acting(conn, :production)` after the board's own `allow`. D49's
     `linked_task_device` tests become device-with-code tests.
   - Decision 5 (the API side).
   - Decision 6: the link routes and their validation.
   - Tests for P104–P107, D1–D5, D7, D8, L2–L4 at the API level (persist-verify).
   - ■ **Stop 1.**
2. **UI.**
   - **Nav:** Brewery → Production for a Brewery-home device (`DEVICE_PAGES` per home). The setup
     pages read-only on a device: no add/edit/retire/reorder controls, plus the "Set up on a
     personal account" note. A Taproom device typing `/brewery/production…` still gets
     `DeviceNotAvailable`.
   - **Gantt and dialogs on a device:** every write through `useActing.run`, with `staff_code` in
     the body; `ActingBanner` on the Gantt. This covers drag, multi-select and Shift-drag, the
     move, batch-number and off-plan prompts, check off, the step dialog, the batch dialog, Plan
     batch, flags sign-off, the batch changes, CIPs, marks, outages and Undo.
   - **Touch:** long-press multi-select at 1280×800. Check that `useTimelineDrag` works with
     touch.
   - **The Brewery board's linked tasks** become writable on a device (remove the
     `isDevice && card.production` read-only branches and TaskMenu's "Do this on the production
     schedule" for a device).
   - **Show planned batches:** the per-device switch in Shared devices; the board and the Gantt
     follow it.
   - **§2.6 template editor:** a step chosen in a picker is linked on **Save**. On a failed Save
     nothing is linked and the error shows. The Links section moves above Notes.
   - **§2.7 step dialog:** the Links section (Comes after / Leads to, default answer, Remove,
     filtered pickers, Link button).
   - The "on Brewhouse" text in the step and flags dialogs.
   - `docs/process/taproom_tablet_setup.md`: the brewhouse section from spec §2.1.
   - Vitest where there's logic (picker filtering, Save-links).
   - Playwright specs for all scenarios, at 1280×800 touch and 1366×768 mouse projects (D6). They
     may run once the lead moves the local servers to `~/src/rockcut-d50`.
   - ■ **Stop 2.**
3. **Local gate.** `tests/COVERAGE.md` rows for D50; full local Playwright (lead runs it in its own
   tab). Fix what fails.
   - ■ **Stop 3:** the local gate green.

## Gate

Workflow §3:
- `mix test` twice;
- `mix compile --warnings-as-errors`;
- `tsc`, `vite build`, vitest;
- lint no worse than `develop`;
- the full local Playwright run.

Then DEV, after D55 is released and DEV is reseeded. DEV QA covers the scenarios at both sizes plus
the regression sweep (spec §6). The QA brief carries the destructive-by-id rule (revoke, delete or
deactivate only by exact id on the agent's own `[TEST-TEMP]` rows).

## Risks

- **Moving routes out of `:authenticated`** also drops `DeviceGate` for those routes. Every moved
  route must still refuse a non-Brewery device (the `:brewery` module plug plus `Authz.Device`).
  The route matrix test is the guard; check it lists each route.
- **Setup writes must stay people-only.** P106 checks each setup route answers 403 for the device.
- **The shared lock counter** only works if production uses the same `RateLimiter` key. D8 tests
  it across board and Gantt.
- **Undo** now carries a person who isn't the signed-in user. A device's Undo request must send
  the code, and the person resolved from it must match the record.
