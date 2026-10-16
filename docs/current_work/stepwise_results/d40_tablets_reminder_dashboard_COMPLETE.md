# D40: Shared Tablets on the Boards, Shift-end Reminder, Dashboard Card — Completion Record

**Status:** COMPLETE and **on prod** in `v2026.10.14` (2026-10-14, PR #24).
Merged to `develop` 2026-10-14 (PR #22, merge `960bec1`).
**Spec:** `specs/d38_brewery_task_board_spec.md` §3.4, §3.5, §3.8 (S9g,
S32–S37a, S42–S50, S68), amended by `specs/d41_department_task_boards_spec.md`
items 6–7. **Plan:** `planning/d40_tablets_reminder_dashboard_plan.md`
(decisions 1–6, incl. Matt's "every employee can hold a staff code").
**Concept:** 10_brewery_tasks
**Branch:** `d40-brewhouse-tablet-reminders`, cut from the D42 tip
(`cb59d3b`), 19 commits. DEV gate SHAs: `0f2f0a0` (API v38 / UI v35), fix
cycle 1 `8895862` (API v39 / UI v36), fix cycle 2 `9dae539` (UI v37).
**Backlog:** 4213.
**QA report:** `stepwise_results/d40_dev_qa_report.md`
**PR description / full detail:** `prompts/d40_handoff_note.md`

---

## Summary

Shared tablets show their own department's task board (the Taproom tablet
the Taproom board; a brewhouse tablet the Brewery board), and every write
needs a staff code of someone in that department, remembered for 5 minutes
of activity ("Acting as … · Done"). Any employee can now hold a staff code.
Brewery staff get a push about an hour before a shift ends listing what's
still open. The Brewery Dashboard has a Today's tasks card.

## What shipped

| Area | Change |
|---|---|
| **Staff codes** | Any active person with a department (owners too); set/revealed by owners and managers of one of the person's departments; cleared on deactivation or no department left. |
| **Tablets** | `Authz.Device` read/write on the home board only; no History, Daily items setup, All departments or other boards. `StaffCodeActing` shared with the beer board; the code only in the JSON body; a non-member's code is a wrong code (lockout as D37). History "<name> on Shared Device". |
| **UI** | Tablet mode; the code dialog before the first write; nothing ticked until accepted; the pinned "Acting as" banner on the task board only; Staff code section for every employee; Dashboard card; "Unfinished tasks before shift end" in the bell's Preferences (Brewery members). |
| **Reminder** | `task_reminders` ledger; a second job in the 5-minute scanner (shifts ending in 50–60 minutes, ≥ 60 minutes long, published, Brewery, assigned); push + in-app; once per shift. |
| **Seed** | `breweryDevice` persona. |

**Migration (1, additive):** `20261017120001_create_task_reminders`. No
new secret (`STAFF_CODE_KEY`) or dependency.

## Testing

- **Local gate:** ExUnit 1,453/0 (1,455/0 after fix cycle 1); full
  Playwright 341 passed / 1 skipped (D33 S3 updated for the brewhouse
  tablet's Shared devices page). Lead revert-checked the tablet's
  department check.
- **DEV (`0f2f0a0`):** full Playwright 343/343 (2 skipped). QA: **PASS with
  gaps**, no must-fix; no write ever without a code or as the wrong person;
  the reminder on the real clock. Gaps 1 (code in the URL), 3 (ticked
  behind the dialog), 5 (banner on the beer board), 6 (banner not pinned)
  fixed in two cycles; 2 and 4 accepted (spec / D37 behavior).
- **DEV recheck (`9dae539`):** tablet, beer-board device, dashboard and
  staff-code specs 29/29.
- **Matt's checks:** brewhouse tablet on DEV (pairing, code, banner, Done,
  wrong code, History) pass; a real shift-end push on the Pixel pass; on
  prod, the Taproom tablet's Tasks with a staff code pass.

## Follow-ups

- **Prod:** Matt creates the brewhouse tablet (Admin → Shared devices, home
  Brewery) and pairs it later. All staff have staff codes (Matt,
  2026-10-14).
- Accepted gaps 2 (reminder body lists 3 tasks) and 4 (lock shown after a
  code is typed).
