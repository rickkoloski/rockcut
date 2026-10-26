# D48 QA recheck 7: targeted pass on Undo around the Split (DEV)

- **Build:** D48 fix cycle 7 at `5c0e9ec` (DEV API v58 / UI v61, deployed and reseeded today), as given in my prompt. DEV has no version endpoint, so I couldn't confirm the build myself. Tested on https://rockcut-ui-dev.fly.dev and https://rockcut-api-dev.fly.dev. Prod was not touched.
- **Tester:** fresh, independent QA (Claude), 2026-10-26 (America/Denver). Headless Chromium + Playwright, timezone America/Denver.
  - One browser per script, closed at the end of each.
  - The two-user checks used owner and breweryMgr as two contexts in that one browser.
- **Personas:** loaded from `auth/*.json` with `storageState`. I never opened the auth files.
  - API calls were made from inside the page, and no token was returned.
  - A grep of `results/r7_*` and `scripts/r7_*` for `ses_…`, `dev_…` and `Bearer …` finds nothing.
- **Data:** I used only my own `[TEST-TEMP]` data (ledger: `results/r7_created.json`), and all of it is cleaned up (see the end). I only read the seed.
  - The seed is unchanged: all 15 non-test batches match my opening snapshot step by step, and so do the Serving 3 / Serving 4 marks.
  - I didn't change any persona's theme.
- **Scripts:** `scripts/r7_*.mjs`. **Logs:** `results/r7_*.log`. **Screenshots:** `shots/r7_*.png`.
- **How status was checked:** as in recheck 6, I read the whole family from `GET /schedule` after **every** check-off, un-check, Undo and refused Undo. I checked it against the RECHECK7 rules (`scripts/r7_z1lib.mjs`, `verdict()`; Filter counts as an exit, since its behavior is `transfer`).
  - **The rules checked:**
    - Split not done → every part is planned, with no done Transfer, Filter or Package (full or partial).
    - Brew day not done → the parent is planned with a P-number.
    - Split done → a part with a full Package done is completed; any other part is fermenting.
  - **Result:** 0 violations in every script: `r7_undo`, `r7_undo2`, `r7_undo3`, `r7_ui`, `r7_ui_avail` and `r7_spot`.
  - For each refused Undo, the script also compared the whole family (dates, done states, statuses, P-numbers, links) before and after.

## Summary

**AA1 is fixed.** I couldn't find any Undo path, by one user or two, that leaves a part's exit done while its parent's Split isn't done.
- Recheck 6's paths A (two users, also in the UI), B and C are refused with the rule's own code and message, and nothing changes.
- The same Undo then succeeds once the blocker is cleared (API).
- **No must-fix found, so under the close-out rule D48 can close.** I found two minor gaps for D49 (BB1, BB2).

| # | Severity | Item | Result |
|---|---|---|---|
| AA1 | was must-fix | Undo could leave a part's exit done with the Split not done | **Fixed.** Covers paths A, B and C; Transfer, Filter, Package - Partial and full Package; the staying part, a leaving part and nothing stays; Brew day both ways; a late Split; chains |
| AA2 | was minor | Brew day refusal didn't name the part | **Can't be reached now.** The state behind it (a part's exit done, Split not done) can't be made any more. The parent's own exit keeps "Mark Split - Transfer not done first." as specified |
| **BB1** | **minor** | After a refused snackbar Undo, the UI no longer offers that Undo, even once the blocker is cleared. The API token still works | **New** |
| **BB2** | **minor** | Some Undo routes are still refused with `409 undo_stale` rather than the rule's code, and that Undo never comes back (see the list in BB2) | **New** (refusal is safe; nothing undone) |
| Spot | — | Z1, Z2, Y1, seed Altruism #39 | **Pass** |

---

## AA1: **fixed**

Sources: `results/r7_undo.log` (first run), `results/r7_undo3.log` (clean re-run of the chains), `results/r7_undo2.log` (Brew day / Lager, late Split, 2-minute window), `results/r7_ui.log` (UI).

**Families** (all past-dated so steps can be checked off; Split on Oct 6):

| Family | Parts | Exits on the parts |
|---|---|---|
| F1 / G1 / H1, std, Q1XG | stays 12 + Q1XH 8 | p1 (stays): added **Filter** Oct 13 → Q1XJ, full Package. p2: added **Transfer** Oct 14 → Q1XD, added **Package - Partial** Oct 16, full Package |
| F2, std, Q1XA | **nothing stays**: Q1XE 7, Q1XF 7, Q1XB 6 (parent CIP on the split day) | p2: added **Filter → Unassigned**. Full Package on p1 and p3 |
| G3, Lager w transfer (unsplit), Q1XC→Q1XJ | — | template **Transfer** (Brew day both ways) |

### Path B: Split ✓ (token) → part exit ✓ → Undo the Split check-off

| Exit | Undo | Family | Retry after un-checking the exit |
|---|---|---|---|
| p1 (stays) Filter | 422 `part_exit_done` "Mark [TEST-TEMP] QA R7 Pils #44.1: Filter not done first." | unchanged | **200**, Split not done, parts planned |
| p2 Transfer | 422 `part_exit_done` "Mark … #44.2: Transfer not done first." | unchanged | **200** |
| p2 Package - Partial | 422 `part_exit_done` "Mark … #44.2: Package - Partial not done first." | unchanged | **200** |
| p1 / p2 / F2 p3 full Package | 409 `undo_stale` "Something changed since. Nothing was undone." (recheck 6's caught case, as RECHECK7 expects) | unchanged | still 409 `undo_stale` (see **BB2**) |
| F2 (nothing stays) p2 Filter → Unassigned | 422 `part_exit_done` "Mark … #44.2: Filter not done first." | unchanged | **200** |

### Path C: Split ✓ → exit ✓ → un-check exit (token) → un-check Split → Undo the exit's un-check

| Exit | Undo | Family | Retry after checking the Split off again |
|---|---|---|---|
| p1 Filter, p2 Transfer, p2 Partial, F2 p2 Filter | 422 `before_split` "Check off Split - Transfer first." | unchanged | **200**, the exit is done again with the Split done, and the part is fermenting |
| p1 / p2 / F2 p1 full Package | 409 `undo_stale` | unchanged | **200** |

### Path A: two users (owner + breweryMgr)

- **API** (`r7_undo3.log`, PATH A; CH3, CH3b):
  1. Owner checks the Split off (token).
  2. breweryMgr checks off p2's Transfer.
  3. Owner's Undo → 422 `part_exit_done` "Mark … #44.2: Transfer not done first.", and the family is unchanged.
  4. breweryMgr un-checks the Transfer, then owner's same Undo → **200**.
  - The same happens with breweryMgr's Package - Partial, and with the roles reversed (breweryMgr's Split, owner's p1 Filter → "Mark … #44.1: Filter not done first.").
- **UI** (`r7_ui.log` A; `shots/r7_A_undo_refused_snack.png`):
  1. Owner checks the Split off in its step dialog, dated Oct 6. The snackbar reads "Split - Transfer done. UNDO".
  2. breweryMgr checks off p2's Transfer.
  3. Owner clicks **Undo**. The snackbar reads **"Mark [TEST-TEMP] QA R7 Pils #44.2: Transfer not done first."**, and nothing is undone (the family is identical).
- **UI, path C** (`r7_ui.log` C; `shots/r7_C_undo_refused_snack.png`):
  1. Owner clicks **Mark not done** on p2's Transfer. The snackbar reads "Transfer is not done. UNDO".
  2. breweryMgr un-checks the Split.
  3. Owner clicks Undo. The snackbar reads **"Check off Split - Transfer first."**, and nothing changes.
- **But see BB1:** in both UI cases the Undo button is gone once the blocker is cleared.

### Brew day both ways

| Case | Result |
|---|---|
| G3 Lager (unsplit): brew ✓ (token) → template Transfer ✓ → Undo brew | 422 `exit_done` "Mark Transfer not done first.", unchanged. After the Transfer is un-checked, the retry → **200**, and the batch is planned with a P-number |
| G3: un-check Transfer (token) → un-check brew → Undo the un-check | 422 `before_brew_day` "Check off brew day first.", unchanged. After brew ✓, the retry → **200** |
| Split family BD2: Split ✓, p2 Partial ✓ → un-check Partial (token) → un-check Split → un-check brew → Undo | 422 `before_brew_day`. After brew ✓ → 422 `before_split`. After Split ✓ → **200**. Each refusal left the family unchanged |
| Split family BD1: brew ✓ (token) → Split ✓ → p2 Transfer ✓ → Undo brew | 409 `undo_stale`, unchanged (BB2) |
| Split family BD3: un-check Split (token) → un-check brew → Undo the un-check | 409 `undo_stale`, unchanged (BB2) |

### Late (off-plan) Split check-off

- **The route:** Split done Oct 8 or Oct 9 with `move_all`, which carried both parts (+2 / +3 days), then p2's Partial or p1's Filter ✓, then Undo.
  - Undo → 409 `undo_stale`, and the family is unchanged.
- **Control:** late Split, then only p2's FDH ✓, then Undo → 200. The family is identical to before the late check-off.
- **In the UI** (Z2 spot): late Split Oct 11 → Undo → "Undone.", identical.

### Chains (`r7_undo3.log`, clean re-run; 28/28 pass)

- **CH1:** Split ✓ (t1) → p2 FDH ✓ (t2) → Undo t2 → Undo t1. Both 200.
- **CH2:** Split ✓ (t1) → p2 Transfer ✓ (t2).
  - Undo t1 → 422 `part_exit_done`.
  - Undo t2 → 200, then Undo t1 → 200.
  - Re-using t1 → 404.
- **CH3 / CH3b:** one user's Undo is refused because of the other's exit. The other user undoes theirs, and then the first Undo → 200.
  - Owner can't use breweryMgr's token (404).
- **CH5:** Undo of a move (p2 FDH +1) while p2's Transfer is done → 200, unaffected.
- **CH6:** Undo of a Split un-check with no blocker → 200.
- **CH7:** Split ✓, p2 Transfer ✓, then un-check the Transfer (u1) and un-check the Split (u2).
  - Undo u2 then u1 → both 200.
  - **CH7b**, the reverse order: u1 first → 422 `before_split`, unchanged. Then u2 → 200 and u1 → 200.
- **2-minute window:**
  - Undo refused → about 86 s later, after clearing → **200**.
  - A token used after 123 s → 422 `undo_expired` "It's too late to undo that."

**Not counted (my script):** my first runs (`r7_undo.log` CH1–CH5 and F3; `r7_undo2.log` CH1–CH3b, CH7 and W1) contain `!!FAIL` lines that come from my script, not the app.
- A safe `undo_stale` refusal left the Split done, or left the parts' dates shifted.
- My cached step dates were then stale, so check-offs hit `answer_required`, and later Undos had nothing to refuse.
- `r7_undo3.log` re-runs all of those from a clean state, reading each step's current date first, and they all pass.
- One oddity in that shifted state (`r7_undo2.log` CH3): a two-user Undo was refused with `undo_stale` rather than `part_exit_done`. It was safe, it didn't reproduce from a clean state, and the same token worked after the other user's Undo.

## AA2: the state behind it can't be reached now

- With AA1 fixed, a part's exit can no longer be done with the Split not done, so the brew-day message that should name the part can't be triggered.
- Directly un-checking Brew day with the Split done and p2's Transfer done → 422 `exit_done` "Mark Split - Transfer not done first.". That's the parent's own exit, as specified.
- Unsplit Lager → "Mark Transfer not done first." (the parent's own Transfer).

---

## New gaps

### BB1 (minor). A refused Undo can't be retried from the UI

- **Path:** owner checks the Split off in the step dialog → a part's exit is checked off (by breweryMgr, or by owner) → owner clicks **Undo** in the snackbar.
  - It's refused correctly: "Mark … #44.2: Transfer not done first."
  - The blocker is then cleared (the exit is un-checked).
- **Expected:** RECHECK7 says "The Undo stays available: the same Undo works once the blocker is cleared, within its 2 minutes." The API does keep the token, and retrying it within 2 minutes → 200.
- **Observed:**
  - The refusal replaces the snackbar's text **and removes its UNDO button**. The message stayed at least 10 s.
  - There's no other Undo control on the page, and Ctrl+Z does nothing.
  - So in the UI, the user's only way back is to un-check the Split by hand (`results/r7_ui.log` A/C retry: "Undo buttons visible: 0"; `results/r7_ui_avail.log`; `shots/r7_A_undo_retry_snack.png`, `shots/r7_avail_after_clear.png`).
- **Why minor:** no wrong data is saved and nothing is lost. A manual un-check reaches the same state, except after a late Split (see BB2).
- **Repro:**
  1. Split a past-dated batch, and check off Brew day.
  2. Check off the Split in its step dialog.
  3. Check off a part's Transfer (API or a second user).
  4. Click Undo in the snackbar. It's refused, and the button is gone.
  5. Un-check the Transfer. There's still no Undo.

### BB2 (minor). Some Undo routes are still refused as `undo_stale`, and that Undo never comes back

- **Routes still refused as `undo_stale`** (409 "Something changed since. Nothing was undone."):
  - Undo of the Split check-off after a part's **full Package** was done (path B). RECHECK7 expects this one.
  - Undo of **Brew day** in a split family after the Split was checked off (BD1). The rule says `exit_done`.
  - Undo of a **Split un-check** after Brew day was un-checked (BD3). The rule says `before_brew_day`.
  - Undo of a **late Split check-off** after a part exit was done.
- **Observed:**
  - In all of them, **nothing was undone** and the family was unchanged.
  - But the refusal doesn't say what to clear, and the same token stays `undo_stale` after the blocker is cleared, even with nothing done after Brew day (BD1).
  - **Exception:** path C with a full Package recovers. Its retry after Split ✓ → 200.
  - **For the late Split, this matters:**
    - only that Undo puts the parts' carried dates back;
    - after it's refused, un-checking the Split by hand leaves both parts 3 days later than planned (`r7_undo2.log` LATE-A: "dates back to before? false").
    - The user has to move them back by hand.
- **Expected:** RECHECK7: an Undo that marks a step done or not done gets the rule's own code (`exit_done` / `before_brew_day`), and stays available once the blocker is cleared.
- **Why minor:** each refusal is safe. No forbidden state is saved and no data is lost, and the dates can be moved back. It's the refusal's wording and the Undo staying available.
- **Repro (BD1, API):**
  1. Split a past-dated batch.
  2. Complete Brew day with a batch number, and keep its `undo_token`.
  3. Complete the Split.
  4. `POST /undo/<token>` → 409 `undo_stale`.
  5. Un-check the Split, then `POST /undo/<token>` again → still 409.

---

## Spot checks: **pass**

Source: `results/r7_spot.log`, `results/r7_ui.log`.

- **Z1:**
  - Part 2's Package before brew → 422 `before_brew_day`.
  - After brew, p2 and p1 Package → 422 `before_split` "Check off Split - Transfer first.".
  - With the Split done and p2 packaged, un-checking the Split → 422 `part_exit_done` "Mark … #44.2: Package not done first.".
  - Un-checking Brew day → 422 `exit_done`.
- **Z2** (UI): Split done Oct 11 → "Split - Transfer done, 5 days late. [TEST-TEMP] QA R7 Pils #44.1 and [TEST-TEMP] QA R7 Pils #44.2 moved with it." (`shots/r7_z2_late_snack.png`). Both parts moved +5, and Undo → "Undone.", identical.
- **Y1:** Brew day +7 Move all on a split family carries the parent and both parts +7. Undo → identical.
- **Seed Altruism #39 / #39.1 / #39.2 (look only):**
  - #39 is fermenting in 286 (Brew day and PDH done). #39.1 / #39.2 are planned in 286 / 288.
  - All three dialogs show "Undo the split first to change it".
  - Opening them sent **no write**, and the seed compare shows 0 differences.

## Notes

- **P-numbers:** `next_batch_number` was 44 at the start and the end. Every Brew day check-off was un-checked.
- **No automated suite** was running. **Credentials:** no prompts.
- **Pressing Escape closes the Undo snackbar** (MUI's default). It's noted only because it cost me one script run, and I'm not reporting it.

## Data created and cleaned up (by recorded id; ledger `results/r7_created.json`)

| Kind | Ids | Cleanup |
|---|---|---|
| Brands | 812 `[TEST-TEMP] QA R7 Lager`, 813 `[TEST-TEMP] QA R7 Pils` | deleted (204) |
| Tanks | 1365–1373 `[TEST-TEMP] Q1XA`…`Q1XJ` | retired (200) |
| Templates | 470 (copy of seed 467), 471 (copy of seed 469) | retired (200) |
| Batches (parents) | 1689, 1692, 1696, 1697, 1700, 1701, 1704, 1707, 1710, 1713, 1716 | done steps un-checked, split undone, deleted (200) in their scripts |
| Split parts | 1690–1691, 1693–1695, 1698–1699, 1702–1703, 1705–1706, 1708–1709, 1711–1712, 1714–1715, 1717–1718 | removed by Undo split in the same scripts |
| Added steps / check-offs / moves | many | undone by Undo, un-check or Undo split in the same script |

**After cleanup** (`results/r7_cleanup.log`):
- no batches remain from my ledger;
- none of my tanks is active, and there are no marks on them;
- no flags name my data;
- both templates are retired;
- the seed is unchanged (15 batches compared, 0 differences; Serving 3/4 marks unchanged).
