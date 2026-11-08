# D53 Part 2: lead decisions 5

2026-11-08 · lead → builder. Your stop 5 judgment calls 1–4 are accepted (gap 14 keeps D39's twin,
and the confirm says so; I'm telling Matt).

**The full local run** (`/tmp/claude-501/pwlogs/d53p2_local1.log`): 638 passed, 3 failed, 2 did not
run (`board-replace`, because `chromium` failed).

1. **`ui/layout.spec.ts:26` and `:31`, S152's nav order.** Expected Home, Tasks, Schedule; got Home,
   Tasks, Boards. The spec puts Boards after Tasks, so update S152 to the new order (desktop and phone
   drawer), and check D43's spec text that S152 cites. This is a change of meaning required by spec
   §4.4, so say so in the status.
2. **`brewery/task-board-daily.spec.ts:119`, S26.** `daily-count` was `rgb(245, 124, 0)`, the
   **dark** theme's `warning.dark`, where light's `rgb(230, 81, 0)` was expected. So `brewer1` was in
   dark mode while S26 ran (`brewery-board` runs beside `chromium`). **Find what switched it.** My
   guess is one of your `regression/ideas/` specs, or a screenshot run, setting `brewer1`'s
   `color_mode`. Test personas are shared: a spec that re-themes must use a persona no other spec
   relies on for colour (as D52's 4706 contrast tests do), or a `[TEST-TEMP]` person, and must restore
   it. Fix the spec that does it, not S26. If it wasn't one of yours, say what you found.

Then rerun `--project chromium --no-deps tests/regression/ui`, the ideas project, and S26 with
`--repeat-each 5`, one at a time. Commit, append "Stop 5b" to the status, and commit with a message
containing `stop 5b`, then stop.
