# D39 QA acceptance report: recurring Brewery tasks + D38 follow-ups (DEV)

| | |
|---|---|
| Tester | Claude (independent QA agent), acting only as the synthetic personas in `auth/` |
| Time (UTC) | 2026-10-13 16:09 – 16:35 (Colorado: Tue 10/13, 10:09a – 10:35a MDT) |
| Target | https://rockcut-ui-dev.fly.dev / https://rockcut-api-dev.fly.dev, build D39 `914aa21` (as stated in brief; not independently verified) |
| Method | Node + Playwright (Chromium, `timezoneId: America/Denver`). Desktop at 1440×1000 (taller for some drags); phone at 412×915 with `isMobile`/`hasTouch` and CDP touch events (long press = 700 ms hold), `page.goBack()` for the back gesture. API reads and some setup calls made from inside the page (`page.evaluate`) with the page's own token, never returned. Scripts in `scripts/`, raw logs in `results/`, screenshots in `shots/`. |

## Result: **PASS with gaps**

Every D39 scenario I could run passed, and I saw no duplicates, ghost occurrences or lost edits under concurrency. I found one functional gap: series edits don't carry past a split. A rule change saved with "This and all following" splits a series in two. After that, any "This and all following" or "Edit series…" edit made from an earlier occurrence silently stops at the split point. A few minor items are listed below.

## Gaps

### G1: "This and all following" / Edit series… stops at an earlier rule-change split (must-fix)
- **Path:** a weekly series → edit a later occurrence, change the Repeat rule, choose This and all following (S62). The API gives the later part a new `series_id`. Then use **Edit series…** (or Edit → This and all following) on an occurrence *before* that point.
- **Expected:** the dialog says "Changes apply to this one and every later open one that wasn't changed on its own." Every later open "Keg Wash" occurrence should change, including the ones after the rule change. To the user it is one ↻ task.
- **Observed:** only the occurrences up to the split change. Every occurrence from the rule-change point onwards (the new monthly ones) keeps the old value, and nothing tells the user. History records `count: 4` for the edit.
- **Repro (done on DEV):** `[TEST-TEMP] QA Keg Wash` weekly Wed from 10/14. On 11/4: assign Riley, following. On 12/2: change Repeat to Monthly, 1st Wednesday, following, keep the changed one, which creates series 24. Then 10/28 → Edit series… → Assign to Jake Brewer → Save. Result: 10/28, 11/4, 11/11 and 11/25 show Jake. **12/2, 1/6, 3/3 … 10/6/2027 still show Riley Wort.** Log: `results/split.log`.
- The same thing happened in the two-user run: brewer2's "assign following" from 11/9 changed only 1 occurrence because brewer1 had split the series at 11/16 (`results/lim2.log`, case B). I did not test whether Stop repeating or Delete → This and all following from before a split also stop at the split. That seems likely: the Stop-repeating confirm on 10/21 counted only the 4 pre-split occurrences.

### G2: a stopped series still offers "Edit series…" and "Stop repeating" (minor)
- **Path:** S63. Stop repeating on the 1/1/2027 occurrence → Remove. Then open that occurrence's menu.
- **Expected:** the occurrence is now the last one. It is debatable whether series actions should remain, but "Stop repeating" on a series that has already stopped invites a no-op.
- **Observed:** the menu still lists Edit series… and Stop repeating. The series keeps `until_date: 2027-01-01` and `later_open: 0`. I did not click it again. Log: `results/s63_64_65.log`.

### Observations (not gaps; the UI copy says this is the intended behaviour)
- **O1 (S61):** an occurrence whose *notes only* were changed "just this one" (11/18) was skipped by the later "assign following". This matches the dialog copy ("…that wasn't changed on its own"). A user may still be surprised that adding a note exempts that occurrence from a reassignment.
- **O2 (S75):** at 12 active Daily items, Add and Restore stay enabled. Clicking either is refused with an inline "Up to 12 items" message (API: `422 too_many_items` "The Daily card holds at most 12 items").
- **O3:** a series can be created with a start date in the past (used for S65). Its past occurrences are created and go straight to Unfinished.
- **O4:** retired Daily items cannot be deleted (no UI; `DELETE /api/brewery/daily_items/:id` returns 404). Anything a tester adds and retires stays in the Retired list permanently (see Cleanup).

## Scenario table

| # | Result | Evidence |
|---|---|---|
| S52 | PASS | Weekly preselected Wed; summary "Repeats every week on Wed". The ↻ card is on every Wed from 10/14 to 10/13/2027 (53). Range 2027-09-08..21 in the UI shows 2 cards with ↻ (`shots/S52_dialog.png`, `results/series_check.log`). |
| S53 | PASS | "Repeats every other week on Mon and Thu". Dates 10/15, 10/26, 10/29, 11/9, 11/12, … 10/11/2027. Started from Thu 10/15 because Mon 10/12 is already past. |
| S54 | PASS | 10/31, 11/30, 12/31, 1/31, **2/28/2027**, 3/31, 4/30 … The summary says "on the 31st (or the last day)". Leap-year Feb 29 (2028) is beyond the 12-month window, so not observable. |
| S55 | PASS | "last Friday" defaulted from 10/30. Dates 10/30, 11/27, 12/25, 1/29, 2/26, 3/26, 4/30, 5/28, 6/25, 7/30, 8/27, 9/24. |
| S56 | PASS (breweryMgr) | 10/15, 1/15, 4/15, 7/15. |
| S57 | PASS, partial | "Repeats every year on Mar 1, 3 times"; series `count: 3`; 3/1/2027 generated. The 2028 and 2029 occurrences are outside the 12-month window, and "then nothing" depends on the daily top-up, so I couldn't observe them. |
| S58 | PASS | Checking 10/14 opens the "Where should it show" dialog. With the planned day chosen, only 10/14 is done and 10/21 stays open. Unchecked afterwards. |
| S59 | PASS | Desktop drag Wed 10/14 → Thu 10/15 (`POST …/move`). Wed has no copy and 10/21 is still on Wed. The moved occurrence is marked `series_exception`. |
| S60 | PASS | Save asks Just this one / This and all following. With Just this one, only 10/21 is renamed "… + sanitize". |
| S61 | PASS | Assign Riley from 11/4, following. 10/15 (moved), 10/21 (renamed) and 10/28 are unchanged. 11/4 onward are assigned to Riley, except 11/18, which had its own note (O1). The renamed 10/21 keeps its title. |
| S62 | PASS (but see G1) | 12/2 → Monthly, 1st Wednesday. The dialog says "Removes 43 later occurrences. 1 was changed on its own": [Remove 43, keep the 1…] / [Remove all 44]. After Keep: the weekly occurrences after 12/2 are gone. 12/2, 1/6, 2/3 … 10/6/2027 exist. Done 12/16 and own-title 12/23 are kept, and the earlier ones are untouched. |
| S63 | PASS | New weekly series. Stop repeating on the occurrence with 40 after it shows "Removes 40 later occurrences". Afterwards the last occurrence is 1/1/2027 (G2). |
| S64 | PASS, partial | Delete 2/3/2027 → Just this one: it's gone and `later_open` dropped from 10 to 9. I couldn't observe "not put back the next day" because the daily scan doesn't run during the session. |
| S65 | PASS | Series started 3 weeks ago: Unfinished lists Tue 9/22, 9/29 and 10/6 with dates. Move all to today ("Move 8 unfinished tasks to today?") moved all 3, with `series_date` kept. |
| S66 | PASS (substitute check) | Seed series reach the horizon with no duplicate `series_date` or id. Keg Wash runs to 10/13/2027, Glycol to 9/24/2027 (next is 10/29/2027, past the window), pH to 7/15/2027. My series also reached 10/13/2027. I re-checked at the end of the run. |
| S67 | PASS | Add from Future: Repeat is disabled with "Pick a day to repeat". Choosing Weekly and then ticking No day resets Repeat to Never/disabled. |
| S69 | PASS | Changing only the notes still asks Just this one / This and all following. |
| S70 | PASS (emulated) | Fresh context opens in the vertical view: today first, then 14 days with headers and Daily cards, then Future. Unfinished was empty at that moment; it appears at the top in later runs. `scrollWidth` = 412. Switched to the one-day view, reloaded: still one-day (`rockcut.breweryTasks.phoneView` in localStorage). A new context starts vertical again. |
| S71 | PASS (emulated) | Long-pressed a today task and held it near the bottom edge: the page auto-scrolled (scrollY 1002→1410). Dropped between day 3's 1st and 2nd tasks, and it is 2nd on Thu 10/15 after a reload. History shows "Moved … from Tue 10/13 to Thu 10/15". My first attempt dropped nothing because my test harness moved the finger while the page was still scrolling; that was not a product failure. |
| S72 | PASS (emulated) | A task from 3 days ago on the Unfinished card, long-pressed and dropped after tomorrow's first task: it is 2nd on Wed 10/14 and gone from Unfinished and 10/10. My first harness attempt overshot to 10/21 because auto-scroll was still running; that was the harness, not the product. |
| S73 | PASS (emulated) | In the one-day view, a task from yesterday on the Unfinished card, dropped between today's 1st and 2nd: it is 2nd after a reload and gone from Unfinished (`results/phone.log` "S73b"). My earlier attempt landed 3rd, which was where the drop placeholder showed under my finger. |
| S74 | PASS (emulated) | Long-press a today task and drop it on the Future list: it lands in Future at the drop spot (4th), with `due_on: null`. |
| S75 | PASS, partial | I retired Temps today, so I couldn't reproduce "retired last week". Past ticks on 10/11 and 10/12 still show, today's card drops to 1/3, and the 10/12 Temps checkbox is disabled. API refuses untick, tick and rename of the retired item with 422 "That Daily item was retired". At 12 active, Restore is refused with "Up to 12 items". After freeing slots, Restore puts Temps back **at the bottom**, today's card shows it (1/4), and its old ticks still show. I moved it back to 3rd (order restored: Backups, Gravities, Temps, Pressures). |
| S76 | PASS (emulated) | Back closes the bottom sheet, Edit, "Where should it show", Change day…, Delete scope, Stop repeating, Edit series…, the Save scope dialog, Add, History, Edit Daily items and Retire confirm, and the board stays. The next back leaves the board for `/brewery`. A dialog opened from the sheet closes with one back. |
| S77 | PASS | For a one-off, an occurrence (Just this one) and an occurrence (This and all following), brewer2's Save after brewer1's delete shows "This task was deleted". Nothing was recreated. |
| S78 | PASS (breweryMgr) | One-off Wed → Repeat Weekly → Save: it becomes series 32 with ↻ and copies on 10/21 and 10/28. History has one "Made … repeat from Wed 10/14 (Repeats every week on Wed)" entry. The Future task shows "Pick a day to repeat" (disabled). The finished task has no Repeat section. |
| S68 | N/A | D40, not built. |
| D38 sweep | PASS | Desktop, brewer1: add; reorder within a day (to top, holds after reload); move between days; check; Unfinished → a day; a day → Future; a drop onto Unfinished is refused (task stays put); Daily tick and untick (Gravities, net unchanged). History renders as breweryMgr. |

## LIMITATIONS: what I found

1. **Top-up on a real clock:** the seed series are at about 12 months (to 10/13/2027) with no duplicate dates or ids, at both the start and the end of the run. New series reach 12 months at creation. I could not observe the next-day top-up itself.
2. **Series edits with two people:** no duplicates, ghosts or undone edits in any case (`results/lim2.log`):
   - A: brewer1 renamed "following" while brewer2 had a stale dialog open, then saved a notes change "just this one". Both changes survived, because the PATCH sends only the changed fields.
   - B: brewer1 changed the rule while brewer2 assigned "following" from earlier. This is where G1 showed up: brewer2's change silently reached only 1 occurrence.
   - C: two simultaneous rule changes at different points gave a consistent split.
   - D: two simultaneous "following" notes edits resolved last-writer-wins with no duplicates.
   - S77 with occurrences: covered and passed.
3. **New routes cross-origin:** every series write went from the UI origin to the API and succeeded with the expected status:
   - create with repeat: 201;
   - `PATCH` with `scope` this/following/`changed: keep`: 200;
   - `DELETE ?scope=this`: 204;
   - `POST …/stop_repeating`: 200;
   - `GET …/series`: 200;
   - `POST /daily_items/:id/restore`: 200, or 422 at the limit.

   Refused messages reach the UI: "This task was deleted", "Up to 12 items", and "That Daily item was retired" (API).
4. **Volume:** a 31-day `GET /api/brewery/tasks` with about 10 active series (69 cards, 62 KB) had a median of 43 ms, with one cold outlier of 275 ms. The UI rendered the 31-day range in about 440 ms. The API refuses ranges over 31 days with "Choose a range of 1 to 31 days".
5. **Vertical view, phone-sized:**
   - No horizontal scroll (`scrollWidth` 412).
   - Auto-scroll works during a long-press drag.
   - The view toggle is remembered after a reload, and a fresh context starts vertical.
   - I could not verify that a normal flick starting on a card only scrolls. CDP `synthesizeScrollGesture` didn't scroll the page from either a card or the title, so the harness can't tell. Needs the Pixel.
6. **Back gesture:** passed on every listed dialog (S76 row). After Cancel, a single back leaves the board, so there was no dead back press. With stacked dialogs (Edit → Save scope; Daily items → Retire confirm), one back closes only the top dialog.
7. **"Today" on a UTC server after 6 pm Colorado:** NOT RUN. The run was at about 10 am MDT, when UTC and Colorado share a date, and I can't move the server clock. The API reports `today: 2026-10-13`, which is correct, but that doesn't exercise the case.
8. **Restore and retired days:** retired and restored within the run. Past ticks remain and today's count includes the restored item (1/4). Today's card dropped Temps while it was retired.

The real Pixel checks (S70–S74, S76) are **emulated** only and still need a human on hardware.

## Cleanup

- **Deleted:** every `[TEST-TEMP] QA …` task and series. That is 15 series (ids 23–37) and their occurrences: Delete → This and all following on each, then the remaining earlier and finished ones individually. That was 337 tasks found, 0 remaining when I re-checked.
- **Not created:** no people, shifts or events. S49 is not part of this pass.
- **Could not clean up:** 9 retired Daily items `[TEST-TEMP] QA D1`–`D9` (ids 92–100). They have no delete path (O4), so they stay in the Retired list.
- **Changes to shared data:**
  - Daily items are back to Backups, Gravities, Temps, Pressures.
  - Seed Temps tick on Mon 10/12 was accidentally unticked and re-ticked by breweryMgr, so it now shows "Morgan, 10:21a" instead of the seed's original.
  - **Move all to today** moved 8 open past tasks to today, including `[SEED] Keg Wash` 9/30 and 10/7, `[SEED] Carb FV3`, `[SEED] Dry hop FV1` and a non-seed "Test2". This is allowed by rule 4; lead to reset.
  - My drops changed the order of some seed cards on 10/13–10/15.
- **Not mine, left alone:** "Repeat test 1" (series 38), "Mh test 1" and "Test2".

## Notes on credentials

- `auth/spares.json` holds 40 extra tokens for `bartender2`. The brief doesn't cover them, so I didn't use them.
- No token was printed, logged or screenshotted. All logs pass through a redaction filter.
- No other credentials were requested.
