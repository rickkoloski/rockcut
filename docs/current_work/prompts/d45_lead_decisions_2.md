# D45 lead decisions 2 (DEV run 1, 2026-10-16)

DEV: UI v41 (build `d45-cc37ff5-1`, API unchanged v42). S189 confirmed on
DEV: a saved profile on the old build reloaded itself into D45 exactly once.

Full suite on DEV: **400 passed, 1 failed**: `tasks/task-board-tablets.spec.ts:103`
S43 ("tick Temps with a code; a second tick within 5 minutes needs none").
Line 121 (`dailyCard(api, today)` → Temps and Pressures both checked) got
`false`. Reran alone on DEV `--repeat-each=3`: **2 of 3 failed** (passed in
all three D43 DEV runs). Traces: `rockcut-ui/test-results/regression-tasks-task-boar-0b54f-*`.

**Do (box-only, cycle 1 of 2):**
1. From the trace (network): did Pressures' tick request go out, with what
   body, and what did it return, and when relative to the `dailyCard` read?
   Was the tablet still "acting" (the code sent)?
2. If it's the optimistic UI racing the read: make the read wait
   (`expect.poll`), as the untick below it already does, and say why.
3. If the second tick doesn't persist (or is refused): it's an app bug; find
   whether D45 (UpdatePrompt on a device, the idle rule, Hide shifts) or
   something older causes it, and fix the app with a test.
4. Run S43 on DEV `--repeat-each=5 --workers=1` (DEV tokens are in
   `tests/.playwright-auth/` now; don't re-run setup against local before
   that), commit, stop and report.
