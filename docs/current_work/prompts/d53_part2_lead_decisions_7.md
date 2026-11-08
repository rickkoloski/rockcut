# D53 Part 2: lead decisions 7 (fix cycle 1, from DEV QA)

2026-11-08 · lead → builder. Report: `docs/current_work/stepwise_results/d53_part2_dev_qa_report.md`
(on `588a372`). Verdict: fail, 2 must-fix, 2 should-fix, 5 minor. Fix all nine. Each gets a test from
the report's repro that fails with the fix reverted.

## Must-fix

- **Gap 6: blank/null title, list name or label name → 500.** Must be 422 ("can't be blank"), like
  notes and checklist items. Card title, list name, label name; `""`, `"   "`, `null`; create and update.
- **Gap 7: out-of-range ids → 500** on most Boards endpoints, in the URL and the body (`1e20`,
  `99999999999999999999`; the report's table lists them). Must be 404 for a URL id and 422 (or 404 for a
  reference that can't exist) for a body id. Fix it in one place (id parsing in `Plugs.IdeaBoard` / a
  shared helper the Boards controllers use), not per endpoint. **Also check Part 1's task-board
  endpoints** (`assignee_ids`, `before_id`, URL ids): if the same 500 happens there and the same
  helper fixes it, include it, with a test; if it's wider than that (other areas of the app), don't
  fix it; list what you found under `LEAD:`.

## Should-fix

- **Gap 1: list ⋮ → Rename does nothing.** It should open the same name field as clicking the title.
- **Gap 5: per-item send chip on the board card** says "Removed from the task list" when one of two
  tasks is deleted. The card face must agree with the dialog: if any sent task is still on the list,
  show that (e.g. "On the Taproom task list" with the count if it helps); "Removed" only when all are.

## Minor

- **Gap 2:** closing the card dialog (✕, Escape, Android back) with an unsaved description asks
  "Discard your changes to the description?" (Discard / Keep editing). No change when nothing is unsaved.
- **Gap 3:** Enter on `Add the label "…"` creates and adds it, as clicking does.
- **Gap 4:** restoring an archived list that holds a locked card needs `:manage`, mirroring the
  archive rule (423 or the same "holds a locked card" message, your call; say which).
- **Gap 8:** renaming an archived list → 422 "That's archived. Restore it first", like every other
  write on archived things.
- **Gap 9:** History reasons name the department ("left the Taproom"), never the key. Check the task
  boards' History wording for `left_bar` too and fix it the same way if it shows the key.

## Gate and stop

`mix test` twice, `tsc`, `vite build`, vitest, lint, the ideas Playwright files and any task-board
specs you touch (local, `--repeat-each 2`; servers are up; run setup first; **never `E2E_TARGET=dev`**).
Append to the status file, commit with a message containing `fix cycle 1 done`, then stop.
