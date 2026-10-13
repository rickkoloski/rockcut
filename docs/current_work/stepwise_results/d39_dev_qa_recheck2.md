# D39 QA recheck 2: DEV pass 3 (`08dd32e`)

| | |
|---|---|
| Tester | Claude (independent QA agent), acting only as personas from the refreshed `auth/` (brewer1, brewer2, breweryMgr for cleanup) |
| Time (UTC) | 2026-10-13 19:53 – 20:01 (Colorado: Tue 10/13, 1:53p – 2:01p MDT) |
| Target | https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev, build `08dd32e` per RECHECK2.md (the UI shows no build stamp, so I couldn't verify it). DEV had been reset again: the seed series are now 105/106/107, and there were no `[TEST-TEMP] QA` tasks at the start. |
| Method | Same as the earlier passes: Node + Playwright (Chromium, `America/Denver`). The step being tested in each item went through the UI. Setup went through the API from inside the page, using the page's own token: create, own-change exceptions, finishing 1/6, and the splitting rule change. All data was fresh (series 108–147). Scripts are `scripts/r2_*.mjs`, logs are in `results/recheck2/`, screenshots in `shots/recheck2/`. |

**Split setup**, as in recheck 1: weekly Wed from 10/14, then at 12/2 a rule change to Monthly, 1st Wed, "following", keep. That gives an old part (10/14 – 11/25) and a new part (12/2, 1/6 … 10/6/2027). Where an item says "with extras", the setup also has:
- 1/13 changed on its own (old part);
- 3/3 changed on its own (new part);
- 1/6 finished.

## Result: **PASS, with one minor gap**

R1 is fixed. Dialogs on an occurrence before a split show Ends = Never. A rule change from before the split now runs to the end of the 12-month window, and it respects an explicit Never or a date. All G1/G2 regressions pass. One case under item 2 doesn't match RECHECK2's wording: a count-limited series ("after 10 times") that has been split, then gets a rule change from before the split, ends with 9 occurrences instead of 10 (gap R2, minor).

| # | Item | Result | Evidence |
|---|---|---|---|
| 1a | R1 exact repro (with extras): Edit on 11/4 before touching anything | **PASS** | Edit and Edit series… both show **Ends = Never**, "Repeats every week on Wed". No "until Dec 1". `shots/recheck2/R1A_presplit_edit.png` |
| 1b | Wed → Fri, following, Ends untouched, keep | **PASS** | The confirm reads "Removes 12 later occurrences. 2 were changed on their own", with buttons "Remove 12, keep the 2" and "Remove all 14". Those counts are right: 3 old-part + 9 new-part plain open ones, plus 1/13 and 3/3. Afterwards there are 49 Fridays, 11/6/2026 → **10/8/2027**, none on another day and no day with two copies. 1/13 and 3/3 are kept, finished 1/6 is kept, and 10/14–10/28 are untouched. New series 110 has no end, and a later Friday's dialog shows Never. `r2_1.log` |
| 1c | Fresh series, Ends set to **Never** explicitly, Remove | **PASS** | "Removes 14 later occurrences." → 49 Fridays, 11/6 → 10/8/2027, no duplicates. Series 113 has no end. |
| 1d | Fresh series, Ends = **On a date 4/30/2027**, Remove | **PASS** | The summary reads "every week on Fri, until Apr 30, 2027" → 26 Fridays, 11/6 → **4/30/2027**, then none. Dialogs on 11/27 and on 10/28 (the earlier Wed part) both show until Apr 30, 2027. |
| 2 | Ends across a split: "after 10 times", split after 5 (11/18 → Thu, following), then edited from before the split | **PASS for a non-rule edit, FAIL (minor) for a rule edit** | **Split:** still 10 in total (5 Wed + 5 Thu, ending 12/17). The old part's Edit, its Edit series… and the new part's Edit all show the same end, "On a date, until Dec 17, 2026" (the documented choice).<br>**Non-rule edit:** assign Riley "following" from 10/28. Still 10 in total, all 8 later ones are Riley, and both parts still show until Dec 17.<br>**Rule edit:** 10/28 Wed → Fri, Ends untouched. The confirm says "Removes 7" (right). The result is **9 in total**: 10/14, 10/21, then 7 Fridays 10/30 – 12/11, ending at 12/17 → gap R2. `r2_234.log`, `shots/recheck2/R2b_presplit_edit.png` |
| 3 | Ends = Never clears a date end | **PASS** | **Plain series:** weekly Thu, until 1/31/2027 (16 occurrences). Edit series… on 10/29 → Ends Never → "Removes 13 later occurrences" → Remove. It now runs 10/15/2026 → **10/7/2027** (52), with no duplicates, and the dialog shows Never.<br>**Also across a split:** split series with an end of 3/31/2027. Every part showed until Mar 31. Edit series… from 10/28 → Never. It now reaches **10/13/2027** with no duplicates. See O1 about the monthly part. |
| 4 | Stop / delete and the end | **PASS** | **Stop repeating** on the later part's 3/3/2027 → Remove ("Removes 7"). On 11/4 (before the split), Edit and Edit series… show "On a date, **until Mar 3, 2027**". The later part's 2/3 shows the same date. `shots/recheck2/R4a_presplit_edit.png`<br>**Delete → This and all following** from 3/3/2027 → Remove. 11/4 and 2/3 both show "until **Mar 2**, 2027", the day before the deleted occurrence, so no later dates remain. |
| 5 | G1 regression (recheck 1 items 1, 2a–2c, 4) | **PASS** | **Item 1:** Edit series… from 10/28 → Jake. Every later open one on both sides of the split is Jake (0 not Jake), own-changed 1/13 is kept, and 10/14 and 10/21 are untouched.<br>**2a:** Delete following from 10/28, keep. The confirm reads "Removes 13 … 2 were changed on their own / Remove all 15". Only 1/13 and 3/3 stay open, and finished 1/6 is kept.<br>**2b:** Stop, Remove all. Nothing is open past 10/28, and the series is `until 2026-10-28` with `later_open 0`.<br>**2c:** Stop, keep. Only 1/13 and 3/3 stay open past 10/28.<br>**Item 4 (two people):** brewer2 assigns Riley "following" from 11/9 while brewer1 has changed the rule from 11/16 to Thu. All 48 open from 11/9 are Riley (0 not), with no duplicates, through 10/7/2027. `rc1.log`, `rc2.log`, `rc4.log` |
| 6 | G2 regression, S52, S63 | **PASS** | **G2:** after Stop → Remove all, 10/28's menu has Edit series… and no Stop repeating. After Stop → keep, it still offers Stop repeating.<br>**S52:** "Repeats every week on Wed", 53 occurrences from 10/14/2026 to 10/13/2027, and the 9/8–9/21/2027 range shows 2 cards.<br>**S63:** "Removes 40 later occurrences" → the last one is the acted-on 1/1/2027, and that occurrence's menu no longer offers Stop repeating.<br>**Also re-run:** S60/S61 (10/21 alone gets "+ sanitize"; 50 of 50 from 11/4 are Riley) and the R1 repro with extras (Fridays to 10/8/2027, no duplicates). `rc5_6.log` |

## Gap

### R2: a split "after N times" series loses an occurrence when its rule is changed from before the split (minor)
- **Path:** create weekly Wed from 10/14, Ends = After 10 times. Rule change at occurrence 6 (11/18 → weekly Thu, following). Then Edit on **10/28** (before the split): untick Wed, tick Fri → Save → Remove.
- **Expected (RECHECK2 item 2):** the task still ends after 10 in total.
- **Observed:**
  - After the split, Ends shows "On a date, until Dec 17, 2026" in every part, which is the documented choice.
  - The rule change keeps that date, so the result is 10/14, 10/21, then Fri 10/30, 11/6, 11/13, 11/20, 11/27, 12/4, 12/11. That is **9 in total**, and the series runs `2026-10-28..2026-12-17`.
- **Contrast:** the same rule change on an unsplit "10 times" series gives exactly 10 (10/14, 10/21 + 8 Fridays to 12/18). The unsplit case keeps the count; the split case keeps the date.
- **Judgement:** this follows from showing a date after a split, and nothing in the dialog is misleading, because it shows "until Dec 17" before saving. So it's minor. The lead should decide whether "10 in total" or "the shown date" is the intended rule here.
- **Repro:** `[TEST-TEMP] QA R2-2b Count` (series 119/120 → 121). Control: `R2-2c Count` (122 → 123). Both are now deleted. `results/recheck2/r2_234.log`

## Observation

- **O1:** changing only Ends (Edit series… → Never) is handled as a rule change. The confirm says "Change the repeat — Removes 13 later occurrences" even though the same dates are regenerated, which is alarming wording for an extension.
  - On a split series, Edit series… from the old part shows the old part's rule (weekly Wed). Saving with only Ends changed applies that rule to everything after, so the **monthly part from 12/2 became weekly Wed** (`R2-3b`).
  - This matches "the later part follows the newest rule", but a user who only wanted to remove the end date may not expect it.
  - Not a regression, and not a fail of item 3.

## Cleanup

- **Deleted:** every `[TEST-TEMP] QA …` task I created: 496 found across series 108–147 → **0 remaining** (breweryMgr).
  - Delete following on each old part also removed the linked later parts, so the follow-up deletes on those parts returned 404 as expected.
  - The five finished 1/6 occurrences were deleted one at a time.
- **Seed series 105/106/107:** untouched. They still run to 10/13/2027, 9/24/2027 and 7/15/2027.
- **Daily items:** Backups, Gravities, Temps and Pressures (unchanged, never edited).
- **Not done:** no Move all to today; no people, shifts or events created.
- **Credentials:** no token was printed or logged, and none were asked for.
