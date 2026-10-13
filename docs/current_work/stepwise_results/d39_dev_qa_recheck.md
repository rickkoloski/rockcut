# D39 QA recheck: DEV pass 2 (`ef48d87`)

| | |
|---|---|
| Tester | Claude (independent QA agent), acting only as personas from the refreshed `auth/` |
| Time (UTC) | 2026-10-13 18:36 – 18:43 (Colorado: Tue 10/13, 12:36p – 12:43p MDT) |
| Target | https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev, build `ef48d87` per RECHECK.md (not independently verified). DEV had been reset: the seed series are now 40/41/42. |
| Method | Same as the first pass: Node + Playwright (Chromium, `America/Denver`). The acted-on step in each item went through the UI. Series setup (create, own-change exceptions, the split rule change) went through the API from inside the page with the page's own token. Phone: 412×915, `isMobile`/`hasTouch`, CDP touch. All data was fresh: series 61–80, none of 23–37 reused. Scripts are `scripts/rc*.mjs`, logs are in `results/recheck/`, screenshots in `shots/recheck/`. |

Each split setup used a weekly Wed series from 10/14. At 12/2 it got a rule change to Monthly, 1st Wed, "following", keep. That gives an old part (Wed 10/14 – 11/25) and a new part (12/2, 1/6, 2/3 … 10/6/2027). Items 2 and 3 also set up:
- 1/13: changed on its own (old part, left open by the keep);
- 3/3: changed on its own (new part);
- 1/6: finished.

## Result: **FAIL**

The G1 edit, delete and stop paths now reach across a split, and G2 is fixed. A **rule change made from before a split** (item 3) is still broken, and worse than before: the new rule picks up the old part's internal end date, even when Ends is set to Never, and the later part is deleted. The task silently stops repeating after about 4 weeks.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | G1 exact repro: assign Riley from 11/4 "following", rule change at 12/2, keep, then **Edit series…** from 10/28 assigning Jake | **PASS** | Every later open occurrence is now Jake, on both sides of the split (10/28 … 11/25 old part; 12/2, 1/6, 2/3 … 10/6/2027 new part). The own-changed 1/13 keeps its value, and 10/14 and 10/21 are untouched. `results/recheck/rc1.log` |
| 2a | G1: Delete → This and all following from 10/28 (before the split), keep | **PASS** | The confirm says "Removes 13 later occurrences. 2 were changed on their own" (Remove 13, keep the 2 / Remove all 15). The 15 count includes the 11 new-part occurrences. Afterwards the only things open past 10/28 are the 2 kept ones (1/13, 3/3). Finished 1/6 is kept. `rc2.log`, `shots/recheck/RC2a_confirm.png` |
| 2b | G1: Stop repeating from 10/28, Remove all | **PASS** | Same counts, 13 + 2 = 15. Afterwards nothing is open past 10/28. Finished 1/6 is kept, and the series is `until_date 2026-10-28` with `later_open 0`. |
| 2c | G1: Stop repeating from 10/28, keep | **PASS** | Afterwards only the kept 1/13 and 3/3 are open past 10/28, and 1/6 (finished) is kept. |
| 3 | G1: rule change from **before** a split (11/4: Wed → Fri, following) | **FAIL (must-fix)** | See gap R1. Afterwards the Friday occurrences run only 11/6, 11/13, 11/20 and 11/27, and then nothing; the monthly part (12/2 … 10/6/2027) is deleted. No day has two copies. |
| 4 | G1 with two people (`lim2` case B) | **PASS** | brewer2 had 11/9's Edit open and chose Riley. Meanwhile brewer1 changed the rule from 11/16 to Thu, following (which creates new series 78). brewer2 then saved "This and all following". Result: 11/9 and every later Thu through 10/7/2027 are Riley (0 not Riley), with no duplicate days. `rc4.log` |
| 5 | G2 | **PASS** | After Stop repeating → Remove (Remove all), the stopped-at occurrence's menu has **Edit series…** but no Stop repeating (RC2b, and a plain series stopped at 1/1/2027). After Stop repeating → keep (RC2c), 10/28 still offers Stop repeating. An earlier occurrence (12/18) of the plain stopped series also still offers it, which is consistent because later open ones exist. `rc5_6.log` |
| 6 | Regression | **PASS** | All four checks passed (`rc5_6.log`, `rc6_s71.log`):<br>• **S52:** "Repeats every week on Wed"; 53 occurrences from 10/14/2026 to 10/13/2027; the range 2027-09-08..21 shows 2 cards with ↻.<br>• **S60/S61:** 10/21 alone is renamed "+ sanitize"; from 11/4, all 50 later ones are Riley; 10/14–10/28 are untouched.<br>• **S63:** "Removes 40 later occurrences"; afterwards the last one is the acted-on 1/1/2027.<br>• **S71 (emulated):** long-pressed a today task with auto-scroll (scrollY 697→1401) and dropped it after day 3's first task; it is 2nd on Thu 10/15 after a reload; History shows from 10/13 to 10/15, position 2. |

## Gap

### R1: a rule change from before a split cuts the task off at the split date (must-fix)
- **Path:** the split setup above, then Edit on the **11/4** occurrence (old part). Weekly: untick Wed, tick Fri → Save → Change the repeat → Remove / Keep.
- **Expected (RECHECK item 3):** from 11/4 on, the task repeats every Friday. The later part follows the newest rule, and no day has two copies.
- **Observed:**
  1. **The rule picks up the split's end date.** Before you touch anything, the Edit and Edit series… dialogs on an old-part occurrence show Ends = **On a date** and "Repeats every week on Wed, **until Dec 1, 2026**". That date is the split's internal end, not something the user set. New-part occurrences show Ends = Never.
  2. **The confirm counts the later part.** For example: "Removes 14 later occurrences", which includes the 11 monthly ones.
  3. **The task stops after 11/27.** Saving creates a new Friday series with `until_date 2026-12-01`. Only 11/6, 11/13, 11/20 and 11/27 are generated, and the whole later part is removed. **Explicitly setting Ends = Never** gives the summary "Repeats every week on Fri", yet the saved series still has `until_date 2026-12-01`. The Edit dialog's Ends value is ignored, and the task stops repeating.
- **Repro (on DEV):**
  - `[TEST-TEMP] QA RC3 Rule` (keep): series 69/70 → 71 `until 2026-12-01`.
  - `[TEST-TEMP] QA RC3c Rule` (Ends = Never, Remove): series 74/75 → 76 `until 2026-12-01`, and the dates end at 11/27.
  - Logs: `results/recheck/rc2.log`, `rc3c.log`. Screenshots: `shots/recheck/RC3_confirm.png`, `RC3c_presplit_edit.png`.

## Cleanup

- **Deleted:** every `[TEST-TEMP] QA …` task I created, 186 found and **0 remaining** (series 61–80 and the one-offs). Delete → This and all following on the old part of each split series now also removes the linked later part. My follow-up deletes on those later parts returned 404 because they were already gone, which fits the fix.
- **Seed series:** intact at the end, reaching 10/13/2027 with no duplicate dates. Seed Keg Wash's two past occurrences show twice in my count only because the API lists them both on their day and on the Unfinished card.
- **Not touched:** I ran no Move all to today and no Daily-item edits, and created no people, shifts or events.
- **Not mine, left alone:** the Retired Daily items now on DEV (`[TEST-TEMP] Item 1–9`, `S31 …`, `DO`, `Hoses`, `Backups`) come from other runs.
- **Credentials:** no token was printed or logged, and none were requested. `auth/spares.json` is no longer present.
