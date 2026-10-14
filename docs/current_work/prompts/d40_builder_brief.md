# D40 builder brief

**From:** the lead (the Claude in the Herdr `lead` tab), for Matt.
**Branch:** `d40-brewhouse-tablet-reminders`, in `~/src/rockcut`, cut from
the D42 branch tip (`cb59d3b`, PR #21, on DEV now). The lead switched the
checkout; it's not pushed. If D42 needs a fix from its DEV gate, the lead
will tell you how (don't switch branches yourself).
**Pace:** Matt wants D40 done today and one prod release tonight. Build
exactly the spec and plan, nothing extra.

## Read first

1. `CLAUDE.md` (repo root).
2. `docs/process/three_environment_workflow.md` §3 and §6.
3. `docs/current_work/planning/d40_tablets_reminder_dashboard_plan.md`:
   all of it. **Its "Decisions" override the D38 spec where they differ.**
4. `docs/current_work/specs/d38_brewery_task_board_spec.md` §3.4, §3.5,
   §3.8 ("Brewery Dashboard", "Notification settings", the filter's tablet
   line), and scenarios S9g, S32–S37a, S42–S50, S68 (§4). Read "Brewery →
   Tasks" / `/api/brewery/...` there as `/tasks/<dept>` /
   `/api/boards/<dept>/...` (D41).
5. `docs/current_work/specs/d41_department_task_boards_spec.md` items 6–7
   and §3.3 (who can do what).
6. D37's staff codes: `lib/rockcut_api/staff_codes.ex`,
   `staff_codes/rate_limiter.ex`, `BeerBoardController.acting/2` and the
   Taproom UI dialogs (`pages/taproom/*Dialog.tsx`).

## Your limits

Same as D42 (`prompts/d42_builder_brief.md`, "Your limits"): no push, `gh`,
`fly`, merge, rebase, branch delete, stash or branch switching; nothing on
DEV or prod; no PortableMind; format only your files; the servers are the
lead's; `LEAD:` for anything not in the plan or spec.

**Memory:** the lead is running Playwright against DEV for D42 (about 20
minutes from when you start). Until the lead says so, run **targeted**
ExUnit files only, never the full suite and never Playwright.

## Task 1: the API (plan steps 1–3)

1. **Staff codes for every employee** (plan decision 2):
   `Authz.can_hold_staff_code?/1` (active person with ≥ 1 department),
   `:set_staff_code` / `:reveal_staff_code` for owners and managers of a
   department the target belongs to, `StaffCodes.clear_if_ineligible/2`
   (deactivated or no departments). D31 parity: list exactly which rows
   change and why in your report. Tests: S48, S49 (reworded per the plan), a
   Brewery-only employee gets a code from `breweryMgr`, `barMgr` can't set
   one for a Brewery-only person, leaving one of two departments keeps it.
2. **Tablets on the boards** (plan decisions 1, 3, 4; step 2):
   - `Authz.Device`: `:read` / `:write` on `{:tasks, home}` only; no
     `:history`, no `{:daily_items, _}` `:manage`, no `{:tasks, :all}`,
     nothing on another board (403). `DeviceGate` / the router must let the
     device reach the board routes it needs (board read, task writes, Daily
     ticks, series reads it needs for the dialog) and nothing else. Say in
     your report which routes a device can now reach.
   - Every board write from a device needs `staff_code`: extract D37's
     `acting/2` (rate limiter, resolve, lockout) into a shared helper used
     by both `BeerBoardController` and the board controllers; the person
     must be an active member of the device's home department (else it
     counts as a wrong code). Errors exactly as D37 (`staff_code_required`,
     `staff_code_invalid`, the lock).
   - Writes record actor = person, `device_id` = tablet; responses carry
     `recorded_as`. History reads "<name> on Shared Device".
   - Tests: S9g, S42 (API side), S43–S47, S68 (API side); the Taproom
     tablet on `/api/boards/bar`; the Brewery tablet refused on `bar` and
     `all`; a device on History / Daily items manage → 403; beer board
     unchanged (its existing tests green).
3. **Shift-end reminder** (plan step 3; spec §3.5): migration
   `task_reminders` (`shift_id` unique, references shifts, `sent_at`;
   reversible; rollback-check it on a scratch copy as D41 did); a second
   job in `Reminders.Scheduler`'s tick; event `task_shift_end` in
   Notifications (push + in-app, no email, on by default, prefs opt-out);
   deep link `/tasks/brewery?day=<date>`; ordering and text per §3.5.
   ExUnit with an injected clock for S32–S37a.

Then: the targeted suites you touched, `mix compile --warnings-as-errors`,
and stop for the lead (the lead says when the full ExUnit run is safe).

## Task 1 answers (lead)

Decisions 1–5: **confirmed** (owners keep codes; the 50–60 minute window
with the ledger; the reminder text; 200 + `recorded_as` on tablet deletes;
tablets read `daily_items`). The local dev DB is migrated
(`20261017120001`). Task 1's full ExUnit run waits until the D42 qa agent
finishes on DEV (memory); the lead will run it.

## Task 2: the UI (plan steps 4–6)

1. **Tablet mode on the boards** (plan decision 1): a device sees only its
   home board (no switcher, All departments, History, Edit Daily items or
   "My tasks"); the brewhouse tablet lands on `/tasks/brewery`; the Taproom
   tablet keeps its landing and gets **Tasks** in its nav.
2. **Staff code flow** (plan decision 3; spec §3.4): before the first write,
   the D37 code dialog (reuse it); then "Acting as <name> · Done" with a
   5-minute idle timer; the code only in memory; Done or idle clears it;
   wrong / locked / not a member errors as D37's copy. A write that comes
   back `staff_code_invalid` clears the remembered code and asks again.
3. **Users & Roles:** the Staff code section for every employee, shown to
   owners and to managers of one of the person's departments (`/api/me`
   `staff_codes`).
4. **Brewery Dashboard card** (`/brewery`, spec §3.8, S50) and the
   **notification toggle** "Unfinished tasks before shift end" on Profile →
   Notifications for Brewery members only (S35, S37).
5. **Tests:** Vitest for the acting timer; Playwright in a new
   `tests/regression/tasks/task-board-tablets.spec.ts` (S9g, S42–S46, S68 in
   the browser, the Taproom tablet's Tasks) and the dashboard card / toggle
   (S50, S35 UI). A device storageState for the brewhouse tablet is Task
   3's seed work; until then, build what you can and write the tests.
   **Memory:** Vitest is fine; **don't run Playwright until the lead says**
   (the D42 qa agent is using the browser on DEV).

Report and stop.

## Task 3: seed, coverage, gate, handoff note (plan step 7)

Wait for the lead's go.
