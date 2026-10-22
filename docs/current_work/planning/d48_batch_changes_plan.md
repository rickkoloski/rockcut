# D48: Changing a Batch — Implementation Plan

**Spec:** `specs/d46_production_scheduling_spec.md` (APPROVED). D48 covers:
- §3.11, the Shift-drag row in §3.6, and the D48 toolbar changes in §3.6;
- "Marking a tank clean or dirty" in §3.8;
- scenarios P65–P89, P110 and P113–P121.

**Created:** 2026-10-21 · **Branch:** `d48-batch-changes` from `develop` (`e7cb13e`/`bce3015` or later) · **Task:** PortableMind 4631
**Builds on:**
- D47's `Production.Batches`, `Steps`, `Parts`, `Flags`, `TankStatus`, `Undo` and `Schedule`;
- the D47 Gantt in `pages/production/Gantt/`;
- D46's template step, link and ramp logic in `production.ex`.

## Lead decisions for D48

1. **Task 0 is the Gantt toolbar and layout** (P118–P121), UI only, in its own commit before any API work:
   - Today = a week back plus the zoom weeks, and it always scrolls (it fixes the D47 no-op);
   - the 3-way Collapse | ● | Expand switch;
   - the zoom menu;
   - the Add process menu;
   - compact expanded rows (20 px for `pointer: fine`, 28 px for touch);
   - the label indents (phase ~8 px, step ~20 px).
2. **Reuse the template logic.** Add step (with comes after / leads to / slot-in), ramps and remove (links pass through) already exist for templates in D46. Pull the shared parts into functions that work on either `template_steps` or `production_steps`. Don't write a second copy. Batch steps differ in three ways: they use dates (`due_on`), they can be done (finished steps never move or regenerate), and an added step is marked `added: true`.
3. **Ramps on batches:**
   - Add `production_steps.ramp_group`. Plan copies it from the template.
   - **Change ramp…** regenerates only the **unfinished** steps of that ramp group from the last finished temperature (or the start) to the new target, at the new change per day. The first regenerated step keeps the position of the first unfinished one, and the links into and out of the group are kept.
4. **Transfers on a batch** (§3.11):
   - **Adding one** on date D takes the unfinished steps of vessel k dated **on or after D**. They move to a new vessel k+1, the later vessels shift up by one, and `batch_vessels` follows: the new vessel gets the chosen tank (or Unassigned). A CIP & Sanitize for vessel k is added on D, linked `move_all` from the Transfer/Filter.
   - **Refused** (422 `step_done_after`) if any step in vessel k after D is done.
   - **Removing one** (unfinished) merges vessel k+1 back into k, shifts the later vessels down, and removes the CIP it set up.
5. **Split** (§3.11):
   - **The parts:** each part is a **new `batches` row** with `split_parent_id` and `part_number` (1…n), and the parent's brand, template and `brew_two_days`. Parts have **no `batch_number` of their own**: the label comes from the parent's number or P-number plus `.n` (#40.1, P2.1). Batch-number uniqueness and the next-number suggestion ignore parts.
   - **The Split step:** the parent gets a Split step on the split date in the current vessel, with `split_method` `transfer` or `filter` (one per split; P110). The parent keeps every step before the split date plus the Split. Each part gets its own copy of the parent's **unfinished** steps from the split date on, in the split vessel and the later ones, with the links between them copied. The parent's own copies of those steps are deleted.
   - **Tanks:** the part marked "(stays here)" occupies the parent's current tank from the split date; every other part fills its own tank. At most one part stays, two parts can't share a tank (`same_tank`), and the volumes must add up (`volumes_must_add_up`). If no part stays, the parent's tank gets a CIP on the split date.
   - **Status:** the parent's part ends at the Split (its exit). When the Split is checked off, the parent becomes `completed` and the parts become `fermenting`. Parts of a planned parent stay `planned`, and take the number when the parent's brew day is checked off (P82).
   - **Undo split:** part 1's steps go back to the parent (in the parent's tank), the other parts are deleted, and the Split step is removed. Refused (`part_step_done`) if any part has a finished step.
   - Splitting a part again is refused (`split_part`).
   - **Moves:** a part's steps move independently (P79). Moving the parent's earlier steps with "Move all" doesn't reach into the parts.
6. **Change template** (planned, not split):
   - Rebuilds every non-added step from the new template from the same brew day, keeping two-day brews and the tanks of vessels that still exist.
   - **Added steps** are kept (re-anchored by date) and **added transfers** are dropped.
   - A new later vessel starts Unassigned; a vessel that no longer exists is dropped.
   - The message is: "Standard ale → Lager with transfer. Kept 1 added step."
   - Change brand is a plain update; parts follow, because their label comes from the parent.
7. **Multi-select** (§3.6):
   - **Selecting:** Ctrl/Cmd-click toggles a step. Shift-click selects every step between two steps in the same tank (by date, in that tank's rows). On touch, a long-press without a drag starts selection mode, where taps add or remove steps.
   - **The selection bar** shows "N steps selected", **Assign to…** (`POST /steps/assign`) and **Done selecting**.
   - **Dragging any selected step** moves them all through `POST /steps/move` with `ids[]`. The prompt runs for the steps that follow the moved set (the server already computes `following` over a set).
   - **Shift-drag** (P113): `answer: "only"` with no prompt, and the message "… (only this step)" with Undo.
8. **Clean / dirty marks** (§3.8 addition):
   - A `tank_condition_marks` table, with `POST /tanks/:id/condition` and `DELETE /condition_marks/:id`.
   - `TankStatus` and `Flags` take the latest of the done exits, done CIPs and marks per tank by date, with ties going to the later `inserted_at`. Use the **same occupancy and cleanliness helper** as D47's cycle-2 rule; don't add a second one.
   - The ⋯ panel has the menu items and a History list with Remove.
   - The Gantt marker is a small icon in the tank's row, with a tooltip.
   - Undo covers the new table.
9. **Undo** covers every D48 write: inserted batches (parts) are deleted, and deleted ones (Undo split, Change template) are restored with their steps, links and vessels. **Extend the tracked tables:** `batches` inserts and deletes, and `tank_condition_marks`.
10. **No change** to D49 items (the task board) or the tablet.

## API (`rockcut_api`)

**Migrations:**
- `batches`: `split_parent_id` (FK `batches`, delete restrict) and `part_number`.
- `production_steps`: `ramp_group`.
- `tank_condition_marks`: `tank_id`, `state`, `marked_on`, `user_id`, `note`, timestamps.

**Modules:** keep D48's batch-change code out of `Batches` and `Steps`, which are already big. Put it in new modules: `Production.BatchChanges` (add/remove step, ramps, transfers, change template/brand), `Production.Splits` and `Production.ConditionMarks`.

**Routes** (spec §3.15 D48 list, plus the following):
- `POST /batches/:id/ramp`
- `POST /steps/:id/ramp` (change ramp)
- `DELETE /batches/:id/transfers/:step_id` (or `DELETE /steps/:id` on a Transfer/Filter, which does the merge)
- `POST /tanks/:id/condition`
- `DELETE /condition_marks/:id`

**Error codes:**
- Batch changes: `step_done_after`, `brew_day`, `split_fill`, `volumes_must_add_up`, `same_tank`, `one_stays`, `part_step_done`, `split_part`, `not_planned`, `name_required` ("Give the step a name.").
- Clean/dirty marks: `tank_in_use`, `date_invalid`.

**DEV seed:** a `[SEED]` batch with an added transfer, a `[SEED]` split batch (one part stays), and one clean and one dirty condition mark, on tanks the D47 seeds don't depend on. The `[TEST-TEMP]` clean-up also covers parts and marks.

## UI (`rockcut-ui`)

- **Task 0:** decision 1.
- **Batch dialog:**
  - **Add step…** (type or "Something else", addition, temperature, Transfer/Filter for a Split, Full/Partial for a Package, date, tank when there are several, comes after / leads to, task list, assignee, notes);
  - **Add a ramp…**;
  - Remove on each unfinished step (not Brew day, not a part's fill);
  - **Add transfer / filter…**;
  - **Split…** (date, method, parts with tank / "(stays here)" / volume, Add part / remove, a live total) and **Undo split**;
  - Template and brand pickers when planned;
  - "Added" chips on added steps.
- **Step dialog:** Remove step; **Change ramp…** on a ramp step.
- **Gantt:**
  - dashed gold arrows from parent to parts;
  - part labels (#40.1);
  - the multi-select highlight and selection bar;
  - Shift-drag;
  - condition-mark icons;
  - the ⋯ panel's Mark clean… / Mark dirty… and History.
- **Messages with Undo** for every change, with the texts in the spec (P65–P89, P114–P117).

## Tests

**ExUnit:**
- add step (slot-in, `added`, the template unchanged);
- the name-required error;
- ramp add and change (only unfinished steps regenerate);
- remove (links pass through; Brew day and a part's fill are refused);
- add and remove transfer (vessel shift, CIP, `step_done_after`);
- split:
  - volumes, same tank, one stays;
  - copies of unfinished steps only;
  - a CIP when nothing stays;
  - status on check-off;
  - planned parts numbering (P82);
- Undo split, and its refusal;
- change template (keeps added steps, drops added transfers, Unassigned vessel);
- change brand;
- multi-move with `following` over a set;
- condition marks: status, flags, `tank_in_use`, `date_invalid`, latest-wins with exits and CIPs;
- Undo for split, template change and marks;
- Authz as before.

**Playwright** (`tests/regression/production/`) for P65–P89, P110 and P113–P121, plus `COVERAGE.md`:
- Use your own `[TEST-TEMP]` data, with relative P-number checks.
- Multi-select and Shift-drag use the mouse and keyboard modifiers.
- P87 (the Pixel long-press selection) is checked by hand at the DEV gate.

**Local gate:** per `three_environment_workflow.md` §3. Full runs only through `LEAD: run` (the lead runs them in a visible herdr tab).

## Tasks for the builder

0. **Toolbar and layout** (decision 1). Stop.
1. **API A:**
   - migrations;
   - shared step logic (decision 2);
   - add/remove step;
   - ramps and change ramp;
   - add/remove transfer;
   - change template/brand.

   Stop with `LEAD: restart API`.
2. **API B:** splits and Undo split, part numbering, condition marks (status and flags), Undo coverage and the DEV seed. Stop with `LEAD: restart API`, `LEAD: reseed local` and the test count.
3. **UI A:** the batch and step dialog actions (add, ramp, remove, transfer, template/brand, change ramp).
4. **UI B:** split and Undo split, arrows and labels, multi-select and the selection bar, Shift-drag, Mark clean / dirty with the panel History and markers.
5. **Playwright + local gate.**
