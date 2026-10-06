# Session Handoff — 2026-10-06

Follows `SESSION_HANDOFF_2026-10-05b.md` (D37 steps 1–4 built).

This session, the lead (`w1:p1`) briefed the `builder` Claude (`w1:p5`) through steps
5–7. **D37's local gate passed.** The branch still isn't pushed. **Next is the PR and
the DEV gate**, and every step of that is outward-facing, so ask Matt before each.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.05` (D36), API v23 / UI v19. |
| **DEV** | Free; it runs `develop` `0207fcd`. D37 hasn't been near DEV, and nothing is claimed in discussion 80. |
| **Branch** | `d37-buy-a-beer-board`, cut from `develop` (`ade4433`). HEAD `5bccaae` before this handoff's commit. **Not pushed**, no upstream, no PR. |
| **Task** | PortableMind **4083**. Its status is still "Not Started"; update it when the PR opens. **4084** (new, low): fix the 26 lint errors on `develop`. |
| **Handoff note** | `docs/current_work/prompts/d37_handoff_note.md` (the PR description). Its SHA is still `<filled by lead at push>`. |
| **Briefs/decisions** | `prompts/d37_builder_brief.md` (Tasks 1–3, all done), `d37_lead_decisions_1.md`, `d37_lead_decisions_2.md`. |
| **Local servers** | API in `w1:p2` (:4002, restarted this session after `nimble_csv`), UI in `w1:p3` (:5174). The local DB is reseeded: the board holds the five `[SEED]` entries, and only `bartender1`, `bartender2` and `barMgr` have staff codes. |
| **Builder** | `w1:p5`, idle, limits checked (`--disallowedTools` intact). Its login expires around 2026-10-06/07: it needs `/login` in that pane. |

### Commits this session (oldest first)

| SHA | What |
|---|---|
| `d8ca046` | builder brief, Task 1 (step 5) |
| `f18303a` | **step 5:** CSV import and export |
| `53c9bb5`, `b371de7`, `e517662` | lead decisions 1 (three revisions) |
| `1c34778` | import accepts M/D/YYYY dates (decision 1 §1) |
| `509a2fa` | Replace specs in their own Playwright project (decision 1 §2) |
| `fa952c5` | builder brief, Task 2 (step 6) |
| `68e42a3` | **step 6:** synthetic seed, staff codes, COVERAGE.md |
| `fdc1834` | lead decisions 2 |
| `5d38632` | coverage gaps S5, S11, S13 closed |
| `1296569` | builder brief, Task 3 (step 7) |
| `5bccaae` | **step 7:** handoff note + local gate results |

## Decisions this session

**Matt:**
- **Excel dates:** the import also accepts `M/D/YYYY`. The board export is unchanged:
  it writes the full date-time, as spec §3.6 says.
- **Lint is waived for D37.**
  - The 26 errors are already on `develop`, and D37 adds 0. The PR records the
    waiver, and task 4084 tracks the fix.
  - **How we got here:** the question tool returned "Fix them in D37", but Matt
    hadn't meant that. The builder's cleanup reached 27 Brewery/Settings files
    before Matt stopped it.
  - The cleanup was discarded, never committed. A patch of it was saved in the old
    session's scratchpad (`d37-lint-wip.patch`); that's temporary and probably gone.
  - **Don't touch Brewery, Settings or `ComponentShowcase` in D37.**

**Lead:**
- **Replace tests** (S25, S28) run in their own Playwright project: one worker,
  starting after the main project. A side effect is that `npx playwright test
  <folder>` runs the whole main suite first. `tests/RUNNING.md` gives the split
  commands for a quicker run.
- **Coverage gaps** S5, S11 and S13 were closed before the gate, not left for DEV.
- **After a full Playwright run, re-run setup.** A Replace run marks the `[SEED]`
  entries as imported. This is in `RUNNING.md` and the LIMITATIONS.
  `three_environment_workflow.md` (Rick's doc) was left untouched.

## Local gate (at `1296569`, 2026-10-06)

- **API:** 1,001 tests, 0 failures.
- **`tsc` and `vite build`:** pass.
- **Lint:** 26 errors + 1 warning, all in files D37 didn't change (waived).
- **Playwright, the whole local suite:** 174 passed, 1 skipped (the DEV-only banner
  check), 0 failed, no retries.
- **Persist-verify:**
  - as `bartender1`: add, redeem, edit, delete;
  - on the tablet: a redeem with a `[TEST-TEMP]` person's code;
  - as `barMgr`: an Add import (including a `9/1/2026` date) and both exports.
- **Migrations:** 2 files, both reversible. They were tested on a scratch copy of the
  DB. A rollback loses all board data and staff codes.

## Open: the builder's two `LEAD:` questions (not answered yet)

1. **Wrong-code limit on DEV.** Each full run uses one wrong code on the shared
   tablet's token, so 5 runs within 10 minutes would lock it. **Recommendation:**
   keep the real limit on DEV, and wait 10 minutes if it trips.
2. **Migration count.** The spec says three migrations; there are two, because both
   board tables are in one file with the same schema. **Recommendation:** a
   one-line spec correction (spec §Non-functional), committed before the push.

## Next: the PR, then the DEV gate (each step needs Matt's OK)

1. Answer the two questions above. If Matt agrees, make the spec correction.
2. **Push** with an explicit refspec:
   ```
   git push -u origin d37-buy-a-beer-board:d37-buy-a-beer-board
   ```
   Then fill the SHA in the handoff note. The note's own commit moves the SHA, so
   use the pushed HEAD and say so.
3. **Open the PR** to `develop`, with `d37_handoff_note.md` as the body. Update task
   4083's status.
4. **The DEV gate** (workflow §4):
   - claim DEV in PortableMind discussion 80;
   - **set the secrets before the deploy:**
     - `fly secrets set STAFF_CODE_KEY=… -a rockcut-api-dev`. It must be 32 bytes,
       or the API won't boot;
     - `SYNTHETIC_STAFF_CODES` goes in the PortableMind secrets file and on
       `rockcut-api-dev`;
   - deploy;
   - `reset_synthetic()`;
   - the full Playwright suite on DEV;
   - a fresh **qa** agent for the independent pass;
   - re-run setup afterwards.
5. **Before the prod release:** `STAFF_CODE_KEY` on `rockcut-api`. Keep it where the
   other prod secrets are kept. Losing it makes stored codes unreadable.

## Gotchas (new this session)

- **Watch every prompted agent.** After each `herdr agent prompt`, start a background
  `herdr agent wait <name> --until working --timeout 60000; herdr agent wait <name>`.
  - It's in `~/.config/herdr/rockcut-workflow.md` §4 and the lead's memory.
  - Matt caught the builder waiting twice before this was in place.
- **Confirm surprising answers.** When an answer from the question tool goes against
  the recommendation and widens scope, confirm it in a sentence before acting (the
  lint mix-up).
- **Adding a dependency** makes the running API answer 500 (CompileError) until it's
  restarted. The builder asks with "LEAD: please restart the API". Ctrl+C twice in
  `w1:p2`, then `mix phx.server`.
- **This machine has no `lsof`.** Use `ss` or `curl /api/health` to check :4002.
- **Staff codes stay out of git.** `SYNTHETIC_STAFF_CODES` is in the gitignored
  `rockcut_api/.env.synthetic`. The lead checked the step 6 commit for the three
  values; none were there.
