# D50: builder status

2026-11-08 · builder → lead. Branch `d50-brewhouse-device` in `~/src/rockcut-d50`, not pushed.

## Stop 1 (stage 1: API)

Code commit `0e32f2b`. Gate so far: `mix compile --warnings-as-errors` clean; `MIX_ENV=test mix test`
green twice (2214 tests); `mix format --check-formatted` clean on every changed file. No UI change yet.

**Migration:** `20261108160001_add_production_device_ids` (reversible; up, down, up checked on the test
DB). **The dev DB isn't migrated**: I didn't touch the servers. Run `mix ecto.migrate` in
`~/src/rockcut-d50/rockcut_api` when the local servers move here.

### What changed

- **Authz (decision 1).** `Authz.Device`: a device whose home key is `"brewery"` may `:read` and
  `:write` `:production`; `:setup` and every other device fall through to the catch-all.
- **Router.** `/api/production` is two scopes now:
  - `[:api, :device_allowed, :brewery]`: the reads (tanks, phases, step types, templates, template
    show, schedule) and every schedule write (batches, steps, CIPs, condition marks, flags, undo,
    out-of-service periods) plus the three new link routes. The `:brewery` module plug gives any
    other device (and anyone outside the Brewery) 403 `Forbidden`.
  - `[:api, :authenticated]`: the setup writes (tanks except periods, phases, step types, templates),
    so `DeviceGate` refuses the device before any code runs.
  - People: the `:brewery` plug passes the same people `Authz :production` did (Brewery members,
    owners), so nothing changes for them.
- **Who a write is for.** New `StaffCodeActing.actor/2` (`acting/2` as one person with
  `on_device_id` set, as `TaskBoardController.writer/1` does). `ProductionScheduleController` and
  `ProductionTankController` (periods) resolve it once per request (`writer/1`, cached in
  `conn.assigns.actor`, so `complete_cip` → `complete_step` and `remove_transfer` → `remove_step`
  don't check the code twice) and pass the person to `Undo.track`, `Steps.complete`, `Signoffs`,
  `Cips.create`, `ConditionMarks.create`, `create_outage`. Every answer goes through `reply/2`:
  `for_viewer` (no emails on a device) and `recorded_as` on a device write.
  `ProductionErrors` renders `staff_code_required` / `staff_code_invalid` / `staff_code_locked`
  through `StaffCodeActing.render_error/2`. The counter is the board's (`RateLimiter`, keyed by the
  device token), so the lock is shared (D8 test).
- **Decision 2.** Nullable `production_steps.done_on_device_id`, `flag_signoffs.device_id`,
  `production_undos.device_id` (FK to `users`, `nilify_all`). Set from `on_device_id` on check-off
  (`Steps.complete`, a CIP added "already done"), sign-off and every Undo record; cleared on
  un-check. Undo keeps `done_on_device_id` with the other done columns. Serialized as the step's
  `done_on_device: {id, name}` and the flag sign-off's `device_name` (the schedule preloads them).
- **Decision 3.** `Undo.undo/3`: unknown token `not_found`; expired `undo_expired` (checked first,
  as the plan says); someone else's `{:undo_not_yours, first_name}` → 403
  `"Only Jake can undo this."`. For people too.
- **Board linked tasks (§2.5).** `linked_write/3` drops the `linked_task_device` refusal: after the
  board's `allow`, `StaffCodeActing.actor(conn, :production)`. Responses carry `recorded_as`. A
  same-day reorder is the board's `Tasks.move` with the person, so its event has `device_id`.
  `TaskErrors` no longer has `linked_task_device`.
- **Decision 5.** `PATCH /api/devices/:id` takes `show_planned_batches` (`:manage_device`, owners;
  null is 422); `device/1` JSON has it; `/api/me` already reported the row's value for a device.
- **Decision 6 (§2.7).** `POST /steps/:id/links` `{comes_after_id | leads_to_id, answer?}`,
  `PATCH /step_links/:id` `{default_answer}`, `DELETE /step_links/:id`, all Undo-tracked with the
  steps' batches. New `Production.StepLinks`; `StepGraph.tree/1` (the split's parent and parts, so
  "within its own tree" holds and loop checks see the tree's links). Refusals: `link_cycle`,
  `link_order`, `link_exists` (existing messages), new `link_pick` ("Pick one step to link.") and
  `link_other_batch` ("A step links only to steps of its own batch (or its split)."), 404 for a
  missing step or a standalone CIP.

### Files

- New: `lib/rockcut_api/production/step_links.ex`,
  `priv/repo/migrations/20261108160001_add_production_device_ids.exs`,
  `test/rockcut_api_web/controllers/production_device_test.exs`.
- Changed: `authz/device.ex`, `authz.ex` (comment), `router.ex`, `staff_code_acting.ex`,
  `production_errors.ex`, `production_schedule_controller.ex`, `production_tank_controller.ex`,
  `task_board_controller.ex`, `task_errors.ex`, `device_controller.ex`, `json_helpers.ex`,
  `accounts/user.ex`, `production/{undo,undo_record,step,steps,cips,signoffs,flag_signoff,flags,schedule,step_graph,step_link}.ex`.

### Tests

**New** `production_device_test.exs` (22): P104 (read without a code, check-off refused), P105 (move
with brewer1's code, `recorded_as`, Undo record person + device), preview needs a code, D1 (plan
with a code, linked tasks exist, Undo record), D2 (breweryMgr signs off: row and schedule show the
person and "Brewhouse"), D3 (bartender1's code refused on four kinds of write, nothing changes),
owner's code, D5 (no code 422; brewer2's code 403 `undo_not_yours`; brewer2 signed in 403; brewer1's
code undoes; brewer1 on their own login undoes a device change), check off / un-check (person +
device, cleared on un-check, none on a person's own), D7 (add step, transfer, split, Undo split
with a code), periods and CIPs with a code, D8 (four wrong codes on the Gantt + one on the board
locks both), CIP check-off counts a wrong code once, decision 5 (owner sets it, device `/api/me`
follows, no person changes; null 422; breweryMgr refused), L2 (add comes-after, remove another,
the move preview follows the new links, Undo puts each back), leads-to + changed answer, L3 (loop,
later-day comes-after, another batch, duplicate, none/both picked → 422; missing step 404; links
unchanged), split tree (part 2's FDH → part 1's Carb accepted; outside the tree refused), L4 (on the
device with a code), bartender1 refused.

**Changed** (shape changed, meaning per the decisions):
- `device_route_matrix_test.exs`: production routes moved from `@denied` into `@brewery_device_ok` (6)
  and `@brewery_device_with_code` (37, including the 3 link routes); the 28 setup writes stay in
  `@denied`. New: Taproom device gets 403 on every production route, code or not (P107); brewery
  device reads 2xx with no email (P104); every schedule write without a code 422; every setup write
  403 "Not available on a shared device", with a code or without (P106); people still reach the
  reads, bartender1 403. The D49 describe ("every linked write is 403 `linked_task_device`") became
  "every linked write without a code is 422 `staff_code_required`" (D49's refusal ends, per the brief).
- `task_board_linked_test.exs`: "decision 8: a shared tablet can't write a linked task, with a code
  or without" → "a shared tablet needs a staff code for every linked-task write" (422 without, nothing
  changes, still reads). Added: with a code (notes, move + Undo with the code, check off with person
  and device, un-check, take off), D4 (brewer2's code checks off brew day: batch-number prompt, then
  person + device on the step and in the Gantt's JSON), same-day reorder logged with the device,
  bartender1's code refused (D3).
- `task_board_multi_assignee_test.exs`: "a tablet is refused, whatever it sends" → "a tablet with a
  code sets one person; two are refused" (`linked_task_assignees`).
- `authz_test.exs`: "a shared device gets nothing yet, even at home in the Brewery (D49)" → the
  brewhouse device reads and writes, never setup; a Taproom device nothing.
- `authz_device_test.exs`: new "D50 production" describe pinning the same.
- `undo_cips_test.exs`, `production_schedule_controller_test.exs`: another person's Undo was
  `:not_found` / 404, now `{:undo_not_yours, first}` / 403 with the message (decision 3); an unknown
  token is still 404.

Nothing deleted or weakened beyond the D49 "refused" assertions above, which D50 replaces.

**Revert checks.** Stage 1 is new behaviour, not a bug fix (the §2.6 bug is UI, stage 2). For the
record: the CIP "counts a wrong code once" test passes with the `writer/1` cache reverted too (a
wrong code stops at the first check, so it can't count twice); it pins behaviour, it doesn't guard a
fix.

### Notes for stage 2 (UI)

- On the device, the **move and check-off previews need the code too** (they go through `writer/1`),
  so the code dialog comes before the prompt's preview.
- `tests/COVERAGE.md` line 683 describes D49's read-only linked tasks; it changes with stage 2/3.
- `ProductionListController` / `ProductionTemplateController` reads don't wrap `for_viewer`: their
  bodies have no people in them; the matrix's no-email test covers them.

### LEAD:

1. **Undo order.** Someone else's *expired* token answers `undo_expired`, not `undo_not_yours` (the
   plan's "an expired record still answers `undo_expired`"). OK?
2. **`link_other_batch`** is a new error code with a new message (the plan asked for "422 with a
   readable message"). Wording OK?
3. **Device Show planned batches** is owner-only (`:manage_device`, as the plan says); a Brewery
   manager can't flip it, though they can set the device's theme. Keep it owner-only?
