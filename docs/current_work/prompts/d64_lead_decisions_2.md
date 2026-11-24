# D64 lead decisions 2: the full local suite

2026-11-22 · lead → builder. Decisions 1 accepted (`07678a8`, `2ee9183`).

**Full local suite** (after `mix rockcut.synthetic.setup`, 2026-11-22 ~18:00):
- 950 passed, 1 failed, 1 skipped, and 47 did not run (d58, which waits on brewery-board).
- Rerun of brewery-board + d58 `--no-deps`: 279 passed, the **same 1 failed**.
- **Run alone, it fails every time:**
  `npx playwright test --project=brewery-board --no-deps
  tests/regression/brewery/task-board-phone.spec.ts:545`.

The failure is **D39 S73** ("in the one-day view on today, a task from the Unfinished card goes
between today's first and second"). `touchDrag` (`taskBoardHelpers.ts:329`) polls `dropSpot` and
gets "not in this list" instead of "ok" for 15 s. It flaked once at the D65 gate and passed on
rerun. Now it's deterministic, so treat it as a **D64 regression until shown otherwise**.

**Lead's guess, to check rather than trust:** Stop 4's `[SEED]` data puts new tasks on the Brewery
board **today**:
- "Clean YB3" (a yeast task, no production step);
- Galactic #40's Yeast harvest, a linked production task.

Either could change what's first and second in today's list, or how the one-day view lays it out.
The first may also change how a drop slot is found (a task with `yeast_kind`).

## Do

1. **Find the cause.** Compare against `develop` behaviour; you can't check it out, so reason from
   the diff and the data. For example, run S73 after temporarily removing the two `[SEED]` tasks
   through a throwaway `mix run`, then put them back by rerunning setup.
2. **Fix the right side:**
   - **an app bug** (a yeast task, or today's linked harvest task, breaking the touch drop) → fix
     the app, with a test that fails without it;
   - **only the spec's assumption about today's list** → fix the spec so it makes its own
     `[TEST-TEMP]` tasks and doesn't depend on what `[SEED]` puts on today. Don't change the
     `[SEED]` data to suit one spec.
3. Run `task-board-phone.spec.ts` alone **three times**, then the brewery-board project `--no-deps`
   once, after a fresh `mix rockcut.synthetic.setup`.

## Done when

- S73 passes 3 of 3, and brewery-board `--no-deps` passes in full.
- **Reply with:** the cause (one paragraph), the commit(s), and the runs.
