# D48 QA recheck 6: targeted pass on split check-off order (DEV)

- **Build:** D48 fix cycle 6 at `889c151` (DEV API v57 / UI v60, deployed and reseeded today), as given in my prompt. DEV has no version endpoint, so I couldn't confirm the build myself. Tested on https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev. Prod was not touched.
- **Tester:** fresh, independent QA (Claude), 2026-10-26 (America/Denver). Headless Chromium + Playwright, timezone America/Denver.
  - One browser per script, closed at the end of each.
  - The two-user checks used owner and breweryMgr as two contexts in that one browser.
- **Personas:** loaded from `auth/*.json` with `storageState`. I never opened the auth files.
  - API calls were made from inside the page, and no token was returned.
  - A grep of `results/r6_*` and `scripts/r6_*` for `ses_…`, `dev_…` and `Bearer …` finds nothing.
- **Data:** I used only my own `[TEST-TEMP]` data (ledger: `results/r6_created.json`), and all of it is cleaned up (see the end). I only read the seed.
  - The seed is unchanged: all 15 non-test batches match my opening snapshot step by step, and so do the Serving 3 / Serving 4 marks.
  - I didn't change any persona's theme.
- **Scripts:** `scripts/r6_*.mjs`. **Logs:** `results/r6_*.log`. **Screenshots:** `shots/r6_*.png`.
- **How status was checked:** after **every** check-off, un-check and undo, the scripts read the whole family from `GET /schedule`. They test it against the RECHECK6 rules (`scripts/r6_z1lib.mjs`, `verdict()`). Any breach is logged as `!!VIOLATION`.
  - **The rules checked:**
    - Split not done → every part is planned, with no done Transfer, Filter or Package.
    - Brew day not done → the parent is planned with a P-number.
    - Split done → a part with a full Package done is completed; any other part is fermenting.

## Summary

**Z1's direct paths are fixed, and so are Z2 and Z3.**
- Every part exit is refused ahead of the Split, in every shape I tried. The Split can't be un-checked while a part exit is done.
- Status is right after every plain check-off and un-check.

**But this pass finds 1 new must-fix (AA1): Undo gets around the Z1 guard.**
- An Undo can leave a part with a **done Transfer or Package - Partial while its parent's Split is not done**. That is the state Z1 forbids.
- It's reachable by one user, and by two users working normally (UI-confirmed).
- Under the close-out rule, **D48 can't close yet.**

| # | Severity | Item | Result |
|---|---|---|---|
| Z1 | was must-fix | A part could get ahead of its parent's Split | **Fixed for check-offs and un-checks** (API and step dialog; 2 and 3 parts; staying, leaving, nothing stays; Lager template transfers; recheck 5's two routes). **But see AA1** |
| Z2 | was minor | Late Split check-off snackbar didn't name the parts | **Fixed** (2 and 3 parts; late and early; Move all with the CIP → "and 1 following step"; Move only; Undo exact) |
| Z3 | was minor | `PATCH /steps/:id {due_on}` returned 200 and did nothing | **Fixed** (`due_on`, `done_on`, `completed_at` → 422 `date_not_here`, nothing saved; notes / detail / temperature / assignee still save) |
| **AA1** | **must-fix** | **Undo** of the Split check-off, or Undo of a part-exit un-check, leaves a part's Transfer / Package - Partial done with the Split not done | **New** |
| AA2 | minor | In AA1's state, the Brew day refusal reads "Mark Transfer not done first." and doesn't name the part | **New** (only reachable through AA1) |
| Spot | — | Y1 (Brew day Move all carries the parts, Undo exact), Y2 (exit refused before brew day), split lock, seed Altruism #39 | **Pass** |

---

## Z1. A part can't get ahead of its parent's Split: **fixed for check-offs and un-checks**

Sources: `results/r6_z1a.log`, `results/r6_z1b.log`, `results/r6_ui.log`.

**Shapes** (all past-dated so steps can be checked off; Split on Oct 6 unless noted):

| Family | Parts | Part exits tested |
|---|---|---|
| S1 std, Q1WG | stays 12 + Q1WH 8 | p1 (stays): added **Filter**, Package. p2: added **Transfer**, added **Package - Partial**, Package |
| S2 std, Q1WA | **nothing stays**: Q1WD 7, Q1WE 7, Q1WF 6 (parent CIP on the split day) | Package on all three |
| S3 Lager, Q1WC→Q1WB | Split Oct 1, stays 12 + Q1WJ 8 | **template Transfer** and Package on both parts |
| S4 std, Q1WG | **3 parts**: stays 8 + Q1WH 6 + Q1WJ 6 | Package on all three |

**Results** (identical in all four families; 0 status violations in `r6_z1b.log`):

| Step | Result |
|---|---|
| Any part exit, **brew day not done** | 422 `before_brew_day` "Check off brew day first." (wins over the Split message) |
| Any part exit, brew done, **Split not done** (staying and leaving parts) | 422 `before_split` "Check off Split - Transfer first." Also refused with a late or early `done_on` |
| Part FDH / Carb before the Split | Allowed. Parts stay **planned** |
| Split done with parts' FDH / Carb done → un-check the Split | Allowed. Parts go back to **planned** (FDH still done) |
| Split done, any part exit done → un-check the Split | 422 `part_exit_done`, e.g. "Mark [TEST-TEMP] QA R6 Pils #44.2: Package not done first." / "…#44.1: Transfer not done first." / "…#44.2: Package - Partial not done first." With every part packaged, it names part 1 |
| Split done → un-check Brew day | 422 `exit_done` |
| Part status with the Split done | fermenting; completed once its full Package is done; back to fermenting on un-check |
| **Recheck 5 route 1** (Split ✓, p2 Package ✓, un-check Split) | Refused at the un-check of the Split |
| **Recheck 5 route 2** (brew ✓, Split not done, part Package) | Refused (`before_split`) |
| **Un-check order back** (part exit → Split → brew day) | Every step allowed. The family ends **planned P1**, identical to before (`back to base true`). Undo split → 200, Delete → 200 |

**Step dialog (UI)** (`results/r6_ui.log` a–c):
- Check off on part 2's Package before brew day shows "Check off brew day first." at the top of the dialog (`shots/r6_ui_part_pkg_before_brew.png`).
- After brew day, it shows "Check off Split - Transfer first." for the staying part and for part 2 (`shots/r6_ui_p1_pkg_before_split.png`, `shots/r6_ui_p2_pkg_before_split.png`).
- Mark not done on the Split, with part 2's Package done, shows "Mark [TEST-TEMP] QA R6 Pils #44.2: Package not done first." (`shots/r6_ui_split_uncheck_refused.png`).
- Nothing was saved in any of these.

**Undo routes that the guard does catch** (409 `undo_stale`, nothing undone):
- Split ✓ → a part's **full Package** ✓ → Undo Split.
- Brew day ✓ → Split ✓ → Undo Brew day.
- A late Split check-off (Move all) → a part's Partial ✓ → Undo.
- Un-check a part's full Package → un-check the Split → Undo that un-check.

**Note (not counted):** a part's or parent's **CIP & Sanitize** can be checked off before brew day and before the Split (200). Status isn't affected, and CIPs aren't in RECHECK6's exit list, so I'm noting it for the lead rather than reporting it.

---

## Z2. Late / early Split check-off names the parts: **fixed**

Sources: `results/r6_ui.log` (d, e), `results/r6_ui2.log` (h), `results/r6_misc.log`.

| Case | Prompt | Snackbar |
|---|---|---|
| 2 parts (stays + Q1WH), done **Oct 11** | none | "Split - Transfer done, 5 days late. [TEST-TEMP] QA R6 Pils #44.1 and [TEST-TEMP] QA R6 Pils #44.2 moved with it." (`shots/r6_z2_late_2parts_snack.png`) |
| 2 parts, done **Oct 4** | none | "Split - Transfer done, 2 days early. … #44.1 and … #44.2 moved with it." (`shots/r6_z2_early_2parts_snack.png`) |
| 3 parts, nothing stays (CIP follows), Oct 11, **Move all** | "… #44 and its 3 parts · Split - Transfer done 5 days late. … #44.1, … #44.2 and … #44.3 move with it either way." (`shots/r6_z2_3parts_prompt_10-11_all.png`) | "Split - Transfer done, 5 days late. … #44.1, … #44.2, … #44.3 and 1 following step moved with it." (`shots/r6_z2_3parts_snack_10-11_all.png`) |
| Same, **Move only** | Move only selected | "… 5 days late. … #44.1, … #44.2 and … #44.3 moved with it." The CIP stays on Oct 6 (`shots/r6_z2_3parts_moveonly_snack.png`) |
| Same, Oct 3, Move all | "…done 3 days early…" | "Split - Transfer done, 3 days early. … #44.1, … #44.2, … #44.3 and 1 following step moved with it." (`shots/r6_z2_3parts_snack_10-03_all.png`) |

- The parts' steps moved by the right number of days in every case.
- Snackbar **Undo** → "Undone.", and the family was identical to before every time.

## Z3. `PATCH /steps/:id` date fields: **fixed**

Source: `results/r6_misc.log`.

- **Refused:** `{due_on}`, `{done_on}`, `{completed_at}`, `{due_on: null}` and `{done_on: null, notes}` → **422 `date_not_here`** "To change a step's date, move it (or check it off on the day it was done)."
  - The step was byte-identical afterwards.
  - With `{due_on, notes}`, the notes weren't saved either.
- **Still saved (controls):** `{notes}` → 200, saved. `{detail}` → 200, saved. `{assignee_id: null}` → 200. `{temperature: 57}` on a Set temp step → 200, renamed "Set temp - 57°". All were reverted afterwards.

## Spot checks: **pass**

Sources: `results/r6_misc.log`, `results/r6_z1a.log`.

- **Y1:** split on Nov 20 (stays + Q1WD), Brew day +7 Move all → the parent and both parts +7. Undo → identical.
- **Y2:**
  - On an unsplit planned batch, Package → 422 `before_brew_day`.
  - On a split, the Split before brew day → 422 `before_brew_day`.
- **Lock:**
  - parent vessel → 422 `split`;
  - Delete parent → 422 `split`;
  - part Brand → 422 `split_part`;
  - splitting again → 422 `split`.
- **Seed Altruism #39 / #39.1 / #39.2 (look only):**
  - #39 is fermenting in tank 286 (Brew day and PDH done), and #39.1 / #39.2 are planned in 286 / 288.
  - All three dialogs show "Undo the split first to change it".
  - Opening them sent **no write**, and the seed compare at the end shows 0 differences.

---

## New gaps

### AA1 (must-fix). Undo puts a part's exit back ahead of its parent's Split

**Path A (two users, UI-confirmed; `results/r6_ui2.log` g):**
1. Past-dated batch, split Oct 6 (stays + Q1WH); part 2 has an added Transfer on Oct 14 into Q1WJ. Brew day done.
2. **Owner** opens the Split step and Checks it off (done Oct 6). The snackbar reads "Split - Transfer done." with **Undo**.
3. **breweryMgr** checks off part 2's **Transfer** → 200. That's allowed, because the Split is done.
4. **Owner** clicks **Undo** in the snackbar → **"Undone."**

**Path B (one user, API; `results/r6_undo.log` U1, `results/r6_z1a.log` f):**
- Split ✓ → part 2's **Package - Partial** ✓ → Undo the Split check-off → 200.

**Path C (one user, API; `results/r6_undo.log` U4, U5):**
1. Split ✓ → part 2's Transfer (or Partial) ✓.
2. **Mark the part's exit not done** (its response has an undo token) → Mark the Split not done (allowed now).
3. **Undo the exit's un-check** → 200. This re-marks the part's Transfer / Partial done with the Split not done.

**Expected:** RECHECK6 Z1 says "A part can't get ahead of its parent's Split":
- Transfer / Filter / Package (full or partial) are refused while the Split isn't done.
- The Split can't be un-checked while a part's exit is done.
- An Undo that would produce that state should be refused, as it already is for a full Package (`undo_stale`, "Something changed since. Nothing was undone.").

**Observed:**
- **The saved state:** after the Undo, `GET /schedule` gives parent `fermenting` (Split **not** done) and part 2 `planned` **with its Transfer (or Package - Partial) done**.
- **Part 2's dialog** says "8 bbl · **planned**" while its Transfer row shows "✓ done" (`shots/r6_twouser_p2_dialog.png`; see also `shots/r6_twouser_undo.png`, `shots/r6_twouser_undo_gantt.png`).
- **Other actions in this state:**
  - Undo split → 422 `part_step_done`.
  - Delete → 422 `not_planned`.
  - Brew day un-check → 422 `exit_done` (see AA2).
  - Checking the Split off again works. Un-checking part 2's exit clears the state.
- **Which steps it affects:** in my runs, only steps that don't change the part's status slip through (Transfer, Package - Partial). The stale check caught the full Package (it turns the part completed), which suggests the stale check compares statuses / dates rather than the done state of the other family members' steps.

**Why must-fix:** a state the rules forbid is saved:
- a done exit (beer moved out, or partly packaged) on a part whose parent hasn't been split, shown as "planned";
- reached through the ordinary snackbar Undo by two users doing normal work.

**Repro (API):**
1. Plan a batch with brew day 4 weeks ago.
2. `POST /batches/:id/split` (stays + another tank), then `POST /batches/<part2>/transfers` (Transfer, a date after the split).
3. Complete brew (with a batch number), then complete the split step and keep its `undo_token`.
4. Complete part 2's Transfer.
5. `POST /undo/<token>` → 200.
6. `GET /schedule`: part 2 is planned with a done Transfer, and the parent's Split isn't done.

**Cleanup:** every probe un-checked the part exit, undid the split and deleted the batch.

### AA2 (minor). The Brew day refusal in AA1's state doesn't name the part

- **Path:** AA1's state → Mark Brew day not done.
- **Observed:** 422 "Mark Transfer not done first." The Transfer is on **#44.2**, but the message doesn't say so, while the Split's refusal does ("Mark … #44.2: …").
- **Expected:** "Mark … #44.2: Transfer not done first."
- **Severity:** message wording only, and it's only reachable through AA1 (`results/r6_undo2.log`).

---

## Notes

- **The step dialog defaults Done to today.** One of my UI runs checked the Split off without setting the date, so it became a 20-days-late check-off that carried the parts +20. That's expected behaviour, and the snackbar said so. I re-ran that two-user check with the date set.
- **P-numbers:** `next_batch_number` was 44 at the start and the end. Every brew-day check-off was un-checked, so no batch number was used.
- **No automated suite** was running. **Credentials:** no prompts.

## Data created and cleaned up (by recorded id; ledger `results/r6_created.json`)

| Kind | Ids | Cleanup |
|---|---|---|
| Brands | 736 `[TEST-TEMP] QA R6 Lager`, 737 `[TEST-TEMP] QA R6 Pils` | deleted (204) |
| Tanks | 1231–1239 `[TEST-TEMP] Q1WA`…`Q1WJ` | retired (`DELETE` 200) |
| Templates | 435 (copy of seed 432), 436 (copy of seed 434) | retired |
| Batches (parents) | 1512, 1515, 1522, 1525, 1529, 1532, 1535, 1538, 1542, 1545, 1549 | done steps un-checked, split undone, deleted (200) in their scripts |
| Split parts | the other batch ids in the ledger | removed by Undo split in the same scripts |
| Added steps / check-offs / moves / step notes | many | undone by undo token, un-check, Undo split or PATCH back, in the same script |

**After cleanup** (`results/r6_cleanup.log`):
- no batches remain from my ledger or for my brands;
- none of my tanks is active, and there are no marks on them;
- no flags name my data;
- both templates are retired;
- the seed is unchanged (15 batches compared, 0 differences; Serving 3/4 marks unchanged).
