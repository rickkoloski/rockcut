# D40: Shared tablets on the boards, shift-end reminder, dashboard card — Plan

**Status:** COMPLETE, on prod in `v2026.10.14` (PR #22 merged 2026-10-14)
**Backlog:** PortableMind task 4213
**Spec:** `specs/d38_brewery_task_board_spec.md` §3.4 (tablet), §3.5
(reminder), §3.8 (Dashboard card, Notification settings), scenarios S9g,
S32–S37a, S42–S50, S68; amended by `specs/d41_department_task_boards_spec.md`
items 6–7 and the decisions below.
**Branch:** `d40-brewhouse-tablet-reminders`, cut from `develop` after D42
merges.
**Concept:** 10_brewery_tasks
**Ships:** tonight's release with D38, D39, D41 and D42 (Matt: aiming for
today, no hard cutoff).

---

## Decisions (beyond the D38 spec)

1. **Every department's shared tablet shows its own board** (D41 item 6).
   The brewhouse tablet (home Brewery) opens to `/tasks/brewery`; the
   Taproom tablet keeps its current landing and gets **Tasks** in its nav
   (its board, `/tasks/bar`). A tablet sees only its home board: no
   switcher, no All departments, no History, no Edit Daily items, no "My
   tasks" filter.
2. **Every employee can hold a staff code** (Matt, 2026-10-14; was Taproom
   only). Eligible: any active person with at least one department.
   - **Who sets / reveals a code:** owners, and managers of a department
     the person belongs to (was Taproom managers only).
   - **Cleared automatically** when the person is deactivated or left with
     no departments (was "leaves the Taproom"). Leaving one department while
     staying in another keeps the code. **This changes D38's S49** ("the code
     is cleared" when `brewer2`, Brewery only, leaves the Brewery: still true,
     since they have no department left; reword S49 to say why).
   - **Accepted on a tablet** only for a member of the tablet's home
     department; anyone else's code counts as a wrong code (S45), and counts
     toward the lockout.
   - The beer board is unchanged (Taproom tablet, Taproom members).
3. **The 5-minute "acting as" window lives in the tablet's UI**, not on the
   server: after a correct code the tablet keeps the code in memory and sends
   it with each write until **Done** or 5 minutes without activity. The
   server stays stateless and checks the code (and the lockout) on every
   write, as D37 does. The code never goes to storage.
4. **History** uses the existing `task_events.device_id`: actor = the
   person, device = the tablet ("Kate on Shared Device").
5. **Reminder ledger:** a new table `task_reminders` (`shift_id` unique,
   `sent_at`), additive. Brewery only (D41 item 7).
6. **Dashboard card** uses the board's existing read (`GET
   /api/boards/brewery/tasks` for today) and its tick/complete writes; no new
   route.

## Approach and order of work

| Step | What | Scenarios |
|---|---|---|
| 1 | **Staff codes for everyone (API):** `Authz.can_hold_staff_code?/1`, `:set_staff_code` / `:reveal_staff_code` by department, `StaffCodes.clear_if_ineligible/2`. D31 parity rows updated deliberately (list them). | S48, S49 |
| 2 | **Tablets on the boards (API):** `Authz.Device` grants `:read`/`:write` on `{:tasks, home}` only (no `:history`, no `{:daily_items, _}` manage, no `{:tasks, :all}`); `Plugs.TaskBoard` lets a device in only to its home board. Every board write from a device needs `staff_code` (the D37 `acting/2` flow, extracted from `BeerBoardController` into a shared helper): 422 `staff_code_required`, 422 `staff_code_invalid`, 429/423 locked as D37, the person must be a member of the home department. Writes record actor = person, device = tablet; responses carry `recorded_as`. | S9g, S42–S47, S68 |
| 3 | **Shift-end reminder (API):** migration `task_reminders`; a second job in the D22 scanner (`Reminders.Scheduler`): published Brewery shifts with an assignee, ≥ 60 minutes long, ending in 55–60 minutes, not in the ledger → compute that Colorado day's open tasks (assignee first, unassigned, others with initials) and unticked Daily checks → nothing open: record and skip; else notify event `task_shift_end` (push + in-app, no email), on by default, opt-out in prefs; deep link `/tasks/brewery?day=<date>`. | S32–S37a |
| 4 | **Tablet UI:** board in tablet mode (decision 1); a staff-code dialog (reuse D37's) before the first write; the "Acting as Kate · Done" banner with the 5-minute idle timer; error copy for wrong/locked/not a member; nav for both tablets. | S9g, S42–S46, S68 |
| 5 | **Users & Roles:** the Staff code section for every employee, for owners and the person's department managers. | S48 |
| 6 | **Dashboard card** on `/brewery` (§3.8) and the **Notification settings** toggle (Brewery members only). | S35, S50 |
| 7 | **Seed:** `breweryDevice` persona (home Brewery, paired token for Playwright like `taproomDevice`), `brewer1`'s staff code; a Brewery shift for the reminder scenarios is created by the tests. COVERAGE.md, local gate, handoff note. | — |

Steps 1–3 are API (one builder task), 4–6 UI (a second), 7 the gate. The
reminder's timing is tested in ExUnit with an injected clock; DEV checks one
real reminder end to end (a shift ending ~65 minutes after deploy).

## Risks

- **Device auth on the board routes** is new surface: the DeviceGate is deny
  by default, so every new device route must be listed and the boundary /
  parity suites must show exactly the intended rows change.
- **The reminder on DEV** depends on the clock and push; QA gets a
  `[TEST-TEMP]` shift timed to end soon and checks the bell (push is checked
  by hand on the Pixel).
- **Prod after release:** humans pair the brewhouse tablet and set staff
  codes. Existing Taproom codes keep working.

## Release notes

One additive migration (`task_reminders`). No new secret (reuses
`STAFF_CODE_KEY`). No new dependency.
