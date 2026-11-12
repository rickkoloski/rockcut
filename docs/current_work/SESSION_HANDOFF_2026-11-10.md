# Session Handoff: 2026-11-10

Supersedes `SESSION_HANDOFF_2026-11-09.md`. **A planning session only: no code, no deploys. Prod,
DEV and `develop` are unchanged since that handoff.** Prod is `v2026.11.09` (D50; rollback API v35 /
UI v31); DEV is free.

## Done this session

- **Decisions (Matt, 2026-11-09), written into each task's description:**
  - **4994 + 4991:** all board settings (Hide shifts, Hide completed, First day, Days shown, Show
    planned batches, and now the View filter) are saved per person on the server. Each shared tablet
    keeps its own, like D50's Show planned batches.
  - **4992:** a board URL range over 31 days is clamped to 31 days. The board says so and the URL
    is corrected.
  - **4984:**
    - Every manager sees every employee in Users.
    - A person outside the manager's departments is read-only except **Add department**: a pull-down
      of the departments that manager manages (a manager may manage several) that the person isn't
      already in.
    - **Deactivate** only when the manager manages **every** department the person is in. Owners are
      unchanged.
    - Staff codes stay as they are: a manager of one of the person's departments.
    - Creating a person with no department stays allowed.
  - **5202:** when a repeat rule change remakes the dates, skip a date whose occurrence was moved
    away.
- **D58 reserved** for these. Next new ID: **D59**.
- **Backlog tagged in PortableMind** (deliverable as a name prefix):
  - **D56** (with 5207): 5210 (template Save all-or-nothing), 5211 (a step taken off the task list
    leaves the Gantt), 4950 (Undo snackbar).
  - **D57:** 5208 only.
  - **D58:** 4994, 4991, 4992, 4984, 5202, plus 4261 (D32 event-series split check), 5204 (shift to
    a deactivated person), 4118 **item 1 only** (staff-code Remove is immediate), 5206 (card URL
    "not found"), 5205 (blank start-up page), 4061 (tablet header wrap).
- **`CLAUDE.md`:** the next-deliverable line lists D58 and the tags. It isn't committed yet (local
  change on `develop`), and neither is this handoff.

## Next

- **D56 production timing** (5207, plus 5210/5211/4950): spec next. Matt hasn't started it.
- **D58:** Matt said **don't write the spec yet**. Answered 2026-11-11 (recorded on 4984): any
  manager can deactivate a person with **no** department.
- **D57 test results** (5208) after D56.
- **Still open and untagged:** 4055/4056 (schedule events in calendar feeds, company-wide events;
  raise when planning), 4990 (message delete: a decision), 5193 (drag Board lists), Buy-a-Beer
  4115/4116/4118 items 2–7, 4084 lint, 4319, 4238, the brewing side (3843, 4982, 4986, 4987, 4989,
  5203), RBAC 3847–3853, 3855/3856.

## Notes

- Code facts checked for 4984 (`rockcut_api`, `develop`):
  - There is no user delete, only deactivate through `update`, gated by `Authz.can_manage_user?`
    (any shared managed department).
  - `Accounts.list_users_for/1` scopes to the manager's departments.
  - `apply_memberships/3` only adds or removes memberships in departments the actor manages.
  - `JSONHelpers.user/1` never sends the code (only `has_staff_code`).
