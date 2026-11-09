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

## Stop 2 (stage 2: UI)

Commits `3cb5b03` (UI and specs) and `15abc95` (brands route and spec fixes from the local run).

**Gate so far:**
- `tsc -p tsconfig.app.json` clean; `vite build` OK; vitest 17 files / 250 tests.
- `pnpm lint`: 26 errors + 1 warning (the ceiling; none in files D50 touches).
- `tsc -p tsconfig.e2e.json`: only the two errors that were already there (`task-board-phone`, `beer-board-import`).
- `mix compile --warnings-as-errors` clean; `MIX_ENV=test mix test` green after the brands change (2214).

**Playwright (my specs only, local servers, logs in `/tmp/claude-501/pwlogs/d50_*.log`):**
- `production/d50-brewhouse-device` 14/14;
- `production/d50-brewhouse-touch` 3/3;
- `production/d50-links` 4/4;
- `production/access` 5/5 (P19 updated);
- `tasks/task-board-linked` 17/17;
- `devices/brewhouse_show_planned` 1/1.

I did not run the full suite (the lead's, stage 3).

**Revert check (§2.6, the one bug fix):** with the Save-links loop disabled (`.slice(0, 0)`), L1
"pick Leads to FDH and press Save" **fails** (no "after PDH" after the reload); restored, it
**passes** (`d50_revert_L1.log`, `d50_restore_L1.log`).

### What changed

- **Every schedule write through `useActing.run`.**
  - `flows.write(call, message)` now hands `call` a `codedApi(code)` (`src/lib/codedApi.ts`:
    post/patch/delete with `staff_code` in the JSON body, never the URL). For a person `code` is
    undefined and nothing changes.
  - The move and check-off previews and Undo go through it too, so on the device the code dialog
    opens before the prompt (lead decisions 1). The window is the board's, so a second write doesn't
    ask again.
  - A cancelled code dialog is a Failure `cancelled` with no message: nothing shows, and a cancelled
    preview returns null like a cancelled prompt.
  - A refused Undo (`undo_not_yours`) keeps its button while the token lasts, so the right person
    can press it.
  - `OutageDialog` does the same. Every Gantt write site was converted: `grep "=> api\."` under
    `Gantt/` finds none.
  - `codedApi` lives apart from `lib/production.ts` because two Playwright specs import that file and
    it mustn't load the axios client.
- **Nav and routes.** `DEVICE_PAGES` adds `/brewery/production`, so a Brewery-home device's Brewery
  heading has Production. The device routes add the five production pages for a Brewery home. A
  Taproom device's typed URL still reaches `TabletFallback` → `DeviceNotAvailable` (P107).
- **Setup read-only on a device:**
  - Tanks, Phases & steps, Templates and the template editor show "Read only on a shared device. Set
    up on a personal account." (`SetupReadOnlyNote`, `useIsDevice`).
  - There's no add, edit, retire, restore, rename or reorder (`OrderedList` `readOnly`), and the
    editor's task-list switches are disabled.
- **The Gantt:** `ActingBanner` under the header on a device.
- **The Brewery board on a device:** linked cards have their checkbox, drag, Edit notes and every
  menu action, Open in schedule included. D49's `linkedReadOnly` / "Do this on the production
  schedule" is gone from `TaskMenu`, and so are `TaskBoard`'s `isDevice` branches for linked cards.
- **Show planned batches:**
  - Shared devices has a switch on a Brewery-home device (owners: `:manage_device`).
  - `TaskBoard` no longer forces it on for a device: it reads `/api/me`, which is the device's own
    row. The Gantt's Task list panel already read the same field.
- **§2.6 (template editor):**
  - The Links pickers' values moved up into `EntryDialog`. Save PATCHes the entry, then links each
    pick (`pickedLinks`).
  - A refused PATCH links nothing and shows the error. A refused link keeps the dialog open with the
    entry as saved.
  - Links sits above Notes. The pickers' filter is now the shared `linkChoices` (lib).
- **§2.7 (step dialog):**
  - The new `StepLinks` component has "Comes after" / "Leads to" lists, each link with its default
    answer and Remove, and a picker plus Link button for each. Choices come from `linkChoices` over
    the split's tree (`splitTree`, lib/gantt).
  - What the pickers hold is linked on Save or Close, after the other changes.
  - Every change goes through `flows.write` (Undo; a code on the device).
- **"· on Brewhouse":** the step status ("Done Tue Nov 10 by Jake Brewer · on Brewhouse tablet") and
  the flag sign-off line.
- **Docs:** `docs/process/taproom_tablet_setup.md` §8, the brewhouse device (spec §2.1).
- **API addition (found by D1's spec):** the Plan batch and batch dialogs list brands from `GET
  /api/brands`, which was people-only, so the device couldn't plan a batch.
  - `GET /api/brands` (index only) moved to a `[:api, :device_allowed, :brewery]` scope. The module
    plug, which asks `Authz.Device` `:access`, lets in the brewhouse device; a Taproom device and
    non-Brewery people get 403 as before. The rest of `/brands` stays people-only.
  - In the route matrix it's in `@brewery_device_ok`, so the no-email check covers it. See LEAD 1.

### Files

- New:
  - `src/lib/codedApi.ts`, `src/hooks/useIsDevice.ts`, `src/lib/links.test.ts`;
  - `src/pages/production/SetupReadOnlyNote.tsx`, `src/pages/production/Gantt/StepLinks.tsx`;
  - `tests/regression/production/{device.ts, d50-brewhouse-device.spec.ts, d50-brewhouse-touch.spec.ts, d50-links.spec.ts}`;
  - `tests/regression/devices/brewhouse_show_planned.spec.ts`.
- Changed:
  - `App.tsx`, `lib/{production,gantt,types}.ts`;
  - `pages/production/{EntryDialogs,ListsPage,OrderedList,OutageDialog,TanksPage,TemplateEditor,TemplatesPage}.tsx`;
  - `pages/production/Gantt/{BatchChangeDialogs,BatchDialog,CipAddDialog,FlagsDialog,GanttPage,PlanBatchDialog,StepDialog,TankPanel,flows}.tsx`,
    `flowsContext.ts`, `scheduleText.ts`;
  - `pages/tasks/{LinkedTaskDialog,TaskBoard,TaskMenu}.tsx`, `pages/devices/SharedDevices.tsx`;
  - API: `router.ex`, `device_route_matrix_test.exs`;
  - docs: `taproom_tablet_setup.md`.

### Tests

- **Vitest** `src/lib/links.test.ts` (8): `linkChoices` (earlier/later, already linked, loops, never
  Brew day as leads-to, ISO dates as day offsets), `pickedLinks` (what Save links; a stale pick
  links nothing), `splitTree`, `stepStatus` with the device.
- **Playwright, mouse at 1366×768** (`d50-brewhouse-device`):
  - P104: nav, Gantt, Check off asks for a code; cancel changes nothing.
  - P105: a drag asks once; the prompt; "Acting as"; the second drag asks nothing.
  - D6 mouse (Ctrl-click three, drag), P106 (all four setup pages read-only), D1 (Plan batch via the
    dialog: P-number, linked tasks on the board).
  - D2 (Mark OK: "Signed off by … · on Brewhouse tablet"), D3 (a Taproom member's code: "That staff
    code isn't right", the dialog stays, nothing moves).
  - D5: B's code on A's Undo shows "Only [first name] can undo this."; the Undo button stays, and A's
    code undoes it.
  - D7 (Add step), D8 (stubbed 429 message in the dialog), L4 (step dialog Link with a code).
  - P107 (taproomDevice: typed URLs show "Not available", no Production in nav), and a person sees
    no code dialog or banner.
- **Playwright, touch at 1280×800** (`d50-brewhouse-touch`, CDP touch events): P105 by long-press
  drag, D6 by long-press selection + taps + touch drag, a tap opens the step dialog and Check off
  (with the batch number) works with a code.
- **`d50-links`** (breweryMgr):
  - L1: picked + Save is kept after a reload; Links is above Notes; a refused Save (stubbed 422)
    links nothing.
  - L2: add with Save → Undo removes it; Remove → Undo puts it back.
  - L3: a loop and a later-day comes-after aren't offered; Brew day and earlier steps aren't offered
    as leads-to.
- **`task-board-linked`:** the D49 describe "a linked task has no checkbox and no actions" (the
  read-only tablet) is **replaced**, as the brief said, by two D50 tests:
  - a linked task has its checkbox and every action, and Open in schedule opens the Gantt;
  - D4: brewer's code checks off brew day on the board (batch-number prompt; done on the Gantt with
    `done_by` and `done_on_device`).
- **`production/access`:** "P19: breweryDevice (until D49) – the API refuses the shared tablet"
  became "the device reads the setup; its setup changes are refused (`Not available on a shared
  device`)". The meaning changes per D50.
- **`devices/brewhouse_show_planned`:** D9. The owner turns it off on a `[TEST-TEMP]` Brewery device
  (the Taproom device has no switch); it's off after a reload; a tablet paired to it gets
  `show_planned_batches: false` from `/api/me`; brewer1's own setting is unchanged.

Nothing else deleted or weakened.

### Not covered, or for stage 3

- **Full suite not run.** Shared code changed under these existing specs, which are the ones to
  watch:
  - `flows.write`'s call signature (every Gantt spec);
  - `EntryDialogs` links (`production/templates`, P16);
  - `OrderedList`, `TaskBoard`, `TaskMenu` (the board specs).
- **D7 in the UI** covers Add step only. A transfer and a split with a code are ExUnit's
  (`production_device_test`), and so is the shared counter's actual lock (D8).
- **`tests/COVERAGE.md`** still has the D49 rows (P19, line 683 "linked tasks read-only"). Stage 3
  rewrites them with the D50 rows.
- **Indentation:** new `{!readOnly && (` blocks in the setup pages aren't re-indented (the UI has no
  formatter config). Cosmetic.

### LEAD:

1. **`GET /api/brands` for the brewhouse device** (above): the plan's route list missed it, and
   without it D1 can't work. It's read-only and Brewery-gated, with no new `Authz.Device` clause (the
   module plug's `:access` is the decision, as for any `:brewery` route). OK, or would you rather
   have an explicit `:read, :brands` clause?
2. **Spec D9 wording.** "The device's Gantt and board hide pencilled batches", but "Show planned
   batches" (D49) hides the *planned* batches' linked tasks on the board and the Gantt's Task list.
   The Gantt itself always shows pencilled batches, as it does for people. I kept D49's meaning, now
   per device. OK?

## Stage 3 (doc work)

- `rockcut-ui/tests/COVERAGE.md`:
  - D50 section: P104–P107, D1–D9, L1–L4 and the extra rows.
  - D49's read-only-tablet row replaced, pointing to D50.
  - D46 P19, D48's "people-only until D49" and D49's P104–P107 rows updated to D50's rule.
- **D7 in the UI covers Add step only.** A transfer, a split and Undo split with a code are covered
  in ExUnit (`production_device_test` D7), and so is the shared wrong-code lock (D8: four wrong
  codes on the Gantt and one on the board). Playwright checks only the lock's message, with a
  stubbed 429.
- Not run, per lead decisions 2: Playwright, `vite build`, `mix compile --force`.

## Stop 3 (local gate green)

Final tree `6cf57e2` (code unchanged since `15abc95`; docs only after).

| Check | Result |
|---|---|
| Full local Playwright (lead, its own tab) | **691 passed, 1 skipped** (the DEV-only banner spec), 36.4 min; `/tmp/claude-501/pwlogs/d50_local_full.log`. Nothing to fix. |
| `MIX_ENV=test mix test` | 2214 passed, twice (104.4 s, 102.8 s) |
| `mix compile --warnings-as-errors` | clean |
| `tsc --noEmit -p tsconfig.app.json` | clean |
| `vite build` | OK (`/tmp/claude-501/pwlogs/d50_vite_build.log`) |
| vitest | 17 files, 250 tests passed |
| `pnpm lint` | 26 errors + 1 warning: the ceiling, none in files D50 touches |

The local DB was reseeded after the full run (lead). Not pushed; no PR yet.
