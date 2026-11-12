# D58: Board settings on the server, managers and everyone, and a backlog sweep — Complete

**Spec:** `specs/d58_board_settings_and_managers_spec.md` (decisions 1–15)
**Builder brief and decisions:** `prompts/d58_builder_brief.md`, `prompts/d58_lead_decisions_1.md`
**Tasks:** 4994, 4991, 4992, 4984, 5202, 4261, 5204, 4118, 5206, 5205, 4061, 5769, 4115, 4116, 4319,
5193
**Completed:** 2026-11-12 (on prod as `v2026.11.12`, release PR #69; D58 PR #68). Matt's prod check
is next.

---

## Summary

Task board settings are saved on the server, per person and per board. A shared tablet keeps its own
settings for its home board. Every manager sees every employee in Users & Roles. A manager changes a
person's account only when they manage every department that person is in. Owners is hidden from
managers. Plus a sweep of backlog fixes and small UI follow-ups.

## What Was Built

- **Board settings (§3.1, 4994, 4991):**
  - `users.board_settings`: `%{board => settings}`, written by `PUT /api/me/board_settings/:board`.
  - Settings: days shown, hide completed, hide shifts, first day, the View filter and the phone
    view.
  - A device writes only its home board, and never `view: "mine"` (422).
  - The browser's old local settings carry over once per board, filling only the keys the server
    lacks (`lib/tasks.ts` `carryOver`).
- **31-day URL cap (§3.2, 4992):** a longer range shows 31 days with a notice and a corrected URL.
  An invalid range (garbage, reversed, or an impossible date like Feb 30) shows the default range
  with its own notice.
- **Managers and everyone (§3.3, 4984; decisions 3, 5, 10–12):**
  - Every manager lists every person. Each row carries `can_edit`, `can_deactivate` and
    `addable_departments`.
  - Add department works on anyone. A role can be set in the manager's own departments.
  - Details, password reset, the staff code (set, remove, reveal) and Active need a manager of every
    department the person is in. Never an owner. With no department, any manager qualifies.
    `Authz` `@account_actions` / `manages_all_departments_of?/2`.
  - Owners is left out of every reply to a non-member (`hidden_department_ids`), and there's no
    read-only chip.
  - Deactivating someone takes them off every shift that starts after now. Drafts stay drafts, and
    published shifts become open shifts that send the open-shift notification. One change-log entry
    records the count. Users & Roles asks first, with the count from
    `GET /api/users/:id/future_shifts`.
- **Positions (§3.4, 5769):** a manager can change positions only in their own departments.
- **Fixes:**
  - repeat tasks: no twin after a rule change (5202);
  - event series: the split chain (`continues_series_id`, `internal_end`), and the dialog shows the
    chain's current rule (4261);
  - shifts: no deactivated assignee (5204);
  - staff code: Remove waits for Save (4118 item 1);
  - Idea Board: links to a missing card (5206);
  - the start-up screen (5205);
  - the tablet header at phone width (4061);
  - Buy-a-Beer: import and dialog follow-ups (4118 items 2–6); History search and export (4115,
    4116);
  - readable staff-code activity (4118 item 7);
  - push where the browser can't (4319);
  - dragging Idea Board lists (5193);
  - notification preference validation.

## Migrations

- `20261111150001_add_board_settings_to_users`
- `20261111160001_add_chain_to_schedule_event_series`

Both are additive. Rollback is API v37 / UI v33, image only.

## Testing

- `mix test` 2376 tests, green twice. Vitest 289. Lint unchanged at 27.
- Local full Playwright: 764 passed, 1 skipped (D52's conditional).
- DEV gate (two fix cycles):
  - Run 1 at `be7f764`: 11 failures, one of them a real bug (the Users & Roles Save before
    `/api/departments` loaded, `ea3b895`).
  - Run 2 at `58c961c`: 759 passed.
  - Run 3 at `b59278e`: 759 passed, 2 failed. Both were test-only and passed on rerun.
- QA pass 1: fail (`stepwise_results/d58_dev_qa_report.md`). Must-fix gaps 12/13 and 7.
- QA recheck: pass with gaps (`stepwise_results/d58_dev_qa_recheck_report.md`). Matt accepted R-1.

## Accepted and later

- Accepted:
  - Gap 11: a list lock stops only that list's own move.
  - Gap 8, task side: after a split, the task series dialog still shows the first part's rule.
  - R-1: a manager can work out an Owners membership from "View only".
- Not a bug: gap 2. The tooltip shows only after pressing Escape, and that's correct.
- Backlog:
  - Task 5789: a manager editing their own name and email.
  - Task 5207 (D56): the Gantt's "Label by" picker.
- Known DEV limit: S16's rapid week clicks briefly overloaded DEV's API (500s for a few seconds).
