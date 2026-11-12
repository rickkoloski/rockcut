# D58 lead decisions 1 (DEV QA, fix cycle 2)

2026-11-12 · lead → builder. DEV QA at `58c961c` failed: `stepwise_results/d58_dev_qa_report.md`
(read it; the gap numbers below are its numbers). Matt's decisions are marked. **This is the last
fix cycle** (workflow §4), so test every change locally and keep each item its own commit.

DEV fix cycle 1 is already in (`ea3b895`: the Users & Roles Save waits for `/api/departments`;
`58c961c`: settings helpers wait for the PUT). Don't undo either.

## Must-fix

1. **Gaps 12, 13: who may change a person's account (Matt, 2026-11-12: "manage all their
   departments").**
   - A manager may **edit name / email / schedulable**, **reset the password**, and **set, remove or
     reveal the staff code** only when they manage **every** department the person is in, the
     same test as `can?(:deactivate, target)`. Never an owner. Never anyone in Owners (nobody
     manages Owners, so that falls out of "every department"). Owners still pass everything.
   - Unchanged:
     - a role in a department the manager manages (`can?(:assign, {:memberships, dept})`);
     - Add department;
     - removing someone from the manager's own department.
   - Put it in `Authz` (one predicate shared by `:deactivate`, `:update`, `:reset_password`,
     `:set_staff_code`, `:reveal_staff_code`, and whatever staff-code remove uses). Check every
     controller path QA listed (`PATCH /api/users/:id`, `PUT /api/users/:id`,
     `POST …/reset_password`, `PUT`/`DELETE …/staff_code`, reveal).
   - Users payload: `can_edit` follows the new rule. The dialog for someone the manager shares a
     department with but doesn't fully manage:
     - shows details, password reset and staff code read-only or absent;
     - keeps the role selector for the manager's own departments the person is in, plus Add
       department.
     Pick the smallest clean UI for that and say what you chose.
   - Flip the D31/D58 parity and ExUnit tests that pin "shares a department → may update/reset"
     **explicitly**, each marked `# D58 lead decisions 1`. Example: `breweryMgr` can no longer reset
     `floater` (Taproom + Brewery).
   - ExUnit: QA's paths as refusals:
     - Add department to an owner, then PATCH name / staff code / reset → 403;
     - same for an Office + Owners person;
     - a fully managed person still works.
   - Playwright: update S8, S11, S13 as needed, and add one for gap 12/13's path (Add department,
     then Reset password is not offered and the API 403s), on `[TEST-TEMP]` people only.
2. **Gaps 7, 6: Owners hidden from managers everywhere (Matt, 2026-11-12; this reverses spec
   decision 7).**
   - No Owners membership in any response to a non-owner who isn't an Owners member, on any row,
     managed or not. That includes `/api/users`, `/api/users/:id` and the `PUT …/memberships`
     response (gap 7's leak).
   - A manager's save already never sends Owners and the API keeps it; keep that.
   - UI: drop the read-only Owners chip for managers (`readOnlyOwnersOnly` and friends). Owners keep
     their own Owners controls.
   - Active's greyed-out tooltip becomes neutral for everyone: **"You can't change Active for this
     person."** That narrows gap 6; the residual inference is accepted.
   - Tests: QA's gap 7 repro as a refusal (Add department, then the response and the row have no
     Owners); update S11/S12 and the D59 O6/O7 specs that expected the chip.

## Should-fix and minor (all now; Matt: fix the small ones in this cycle)

3. **Gap 1: carry-over fills missing keys (Matt).** When the server has an entry for the board,
   PUT only the local keys the server entry lacks; never overwrite a server value. Then clear the
   local keys as now (only after the PUT succeeds; if nothing is missing, clear them without a PUT).
   Vitest for: empty entry, partial entry, full entry.
4. **Gaps 4, 5: invalid board URL ranges.**
   - A calendar-invalid date (`2026-02-30`, `2026-11-31`) counts as invalid, like garbage.
   - Every corrected range (invalid, reversed, garbage) shows a notice and replaces the URL, as the
     31-day clamp does. Wording, e.g. "That date range wasn't valid, so the board shows the
     default." Keep the 31-day notice as is.
   - Vitest for the parser; a Playwright check in the D58 settings spec.
5. **Gap 2:** the gear's "Board settings" tooltip must not stay on screen on touch after the menu
   closes. Check the other `SettingsGear` pages share the fix.
6. **Gap 3:** `PUT /api/me/board_settings/:board` refuses `view: "mine"` from a device (422), since
   a device has no tasks of its own. ExUnit.
7. **Gap 8:** after a split, the series dialog shows the chain's **current** rule (the latest
   part's weekdays/interval), not the first part's. "Every Thursday" after a Thu → Wed split must
   read "Every Wednesday". `EventSeries.chain_view`; check the task-series equivalent (D39) for the
   same slip and fix it too if present. ExUnit.
8. **Gap 9: deactivating unassigns future shifts (Matt).**
   - When a person is deactivated (any path: owner or manager), their shifts that start after now
     lose their assignee. Drafts stay drafts; published shifts become open shifts and notify the
     way an unassigned published shift does today (follow the existing unassign path; don't
     invent a new notification).
   - Record it in the change log (one entry with the count).
   - The Users & Roles save, when it turns Active off, first asks: "N future shifts will become
     open shifts. Deactivate?" (skip the question when N is 0). Get N the smallest clean way.
   - Reactivating doesn't reassign them.
   - ExUnit (draft and published, past shifts untouched); Playwright on a `[TEST-TEMP]` person.
9. **Gap 10:** `PUT /api/notification_preferences` validates the shape: known events, known
   channels, boolean values; anything else is a 422 and nothing is stored. ExUnit.
10. **Gap 11: accepted (Matt).** A list lock stops that list's own move only. No change.

## Then

- Gate: `mix test` twice, `mix compile --warnings-as-errors`, tsc, vitest, lint no worse than 27,
  build.
- Run the changed and new Playwright specs twice. Also run the `owners` and `d58` projects
  (`--no-deps`) and the Users & Roles specs.
- Report: commits, the parity flips by name, and anything you chose. I run the full local suite
  before DEV.
- Don't run repo-wide `mix format`.
