# D43 lead decisions 5 (QA pass 1, 2026-10-15)

DEV run 2 at `ae70ef1` (app = API v40 / UI v38 built from `7249387`; only a
test changed): **380 passed, 0 failed.** QA: **PASS with gaps**, report in
`stepwise_results/d43_dev_qa_report.md` (screenshots in
`~/src/rockcut-d43-qa/shots/`, readable by you; don't edit that folder).

Fix all of these on this branch (one `fix: D43 …` commit is fine), each
with a test that would have caught it (revert-and-rerun rule):

1. **G1 (must-fix):** bell popover timestamps `rgba(0,0,0,0.38)` in Dark and
   the dim ⚙ icon. Find the hard-coded / light-only color; use theme tokens.
2. **G2 (must-fix):** icon-only buttons stay `rgba(0,0,0,0.54)` in Dark (board
   ‹ › arrows, board ⋮, "Days shown", Scheduler ‹ ›, row ⋮, Edit pencils,
   trash icons, the password eye). Likely the dark theme's
   `palette.action.active` (or a light `action` object deep-merged from the
   base). Fix in `theme.ts`; then re-check the screens QA named.
3. **G3 (minor, pre-existing, both themes):** white text on light shift
   colors (Brewer `#D6934A`, Bar-mid `#7EABDE`, Event-offsite) in the
   Scheduler, View Schedule and Positions; dimmed done-task "✓ name" lines
   and avatar initials on dark boards. Use the existing `contrastText` (or a
   contrast check) for the chip text; aim for ≥ 4.5:1 for the chip label.
   Don't change the colors themselves (spec: out of scope).
4. **G4 (minor):** Move mode must end when the person clicks anything
   outside the moving row's controls (a cell, a chip, another menu), and
   arrow keys must do nothing while any dialog or menu is open.
5. **G5 (minor):** a theme save that fails (offline / network error) must
   switch back and show the message, as the plan says; QA saw nothing at
   all. Check the network-error path, not only an HTTP error.
6. **obs:** the change-log page's top-bar title says "Activity" while the
   nav says "User change log". Make the title "User change log" (check specs
   that look for "Activity").
7. **G6:** no change (by design: a tablet/second browser updates on its next
   load, S147).

Then: typecheck, eslint on touched files, the affected specs locally
(workers ≤ 2), commit, stop and report. The lead redeploys DEV and runs the
full suite; QA rechecks.
