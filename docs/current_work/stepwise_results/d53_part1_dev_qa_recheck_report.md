# D53 Part 1: QA recheck after fix cycle 1 (DEV)

| | |
|---|---|
| **Build** | `1be89fbb63f73662b03be3ae59c405afb67952fa` (`/api/health`; ribbon `DEV · 1be89fb`) |
| **Date** | Sat 2026-11-07, about 21:20–21:55 America/Denver |
| **Environment** | DEV only. Prod not touched. Source not read. |
| **Personas used** | `owner`, `breweryMgr`, `brewer1`, `brewer2`, `floater`, `barMgr`, `breweryDevice` |

## Result

**Not ready to pass: 1 must-fix and 2 minor gaps, all new.** Every fix in the brief checks out. Gaps 1, 2, 3, 7 and 10 are fixed, and so is the settings gear. R8 found no regressions. The new must-fix is in the same area as before, repeats combined with people. It is narrower: an occurrence whose notes alone were changed, followed by a split that keeps changed occurrences.

| # | Severity | Gap |
|---|---|---|
| 12 | **must-fix** | After a split that keeps changed occurrences, a notes-only occurrence is left behind in the old series, unmarked. Later "following" people edits from the split date skip it silently. |
| 13 | minor | After a split from the **first** occurrence, a kept exception is cut loose from the series (`series_id: null`), and its menu loses Edit series… and Stop repeating |
| 14 | minor | An occurrence moved to another day, then kept through a split, gets a twin: the new pattern remakes its original date |

### Status of earlier gaps

| Earlier gap | Now |
|---|---|
| 1 Rule change replaces people on later dates | **Fixed** (R2) |
| 2 Exception loses people after split + following | **Fixed** (R3), through the API and the dialog |
| 3 Huge id list → 500 | **Fixed** (R5) |
| 7 Linked refusal doesn't name the person | **Fixed** (R5) |
| 10 Phone list clips long names | **Fixed** (R6) |
| Gear menu scrolls to top on close | **Fixed** (R7) |
| 4, 5, 6, 8, 9, 11 | Not retested, as the brief says (accepted or planned). Gap 11's crushed titles are still visible in `r8_all_1280.png`. |

## Must-fix gap

### 12. A notes-only occurrence is skipped silently after a "keep" split

- **Path:** Add notes ("Just this one") to one occurrence → change the rule from an earlier occurrence and choose "Remove N, keep the 1 changed on its own" → from the split date, change people with "This and all following".
- **Expected:** "Nothing changes silently." The following edit reaches "every later open one that wasn't changed on its own". Either the notes-only occurrence is changed like its neighbours, or it is visibly marked as changed on its own and left alone.
- **Observed:**
  - Through Add notes, a notes-only change does **not** mark the occurrence (`series_exception: false`). Before any split, "following" edits change its people like any other, as in the control below.
  - The split confirm, however, **counts** it ("1 was changed on its own"), and "keep" leaves it in the **old** series, still unmarked. The new pattern doesn't remake that date.
  - The following edit from the split date then changes every new-series date but **skips this one**. It keeps the old people, with nothing on the card or in the dialog to say why. A following edit from **before** the split does reach it, so whether it changes depends on where the edit starts.
- **Reproduced:** fully through the UI (`r4_gapA_board.png`) and through the API with notes on a different date. A title-only change, by contrast, is marked (`*`) and is correctly left alone.

| Step | 11/16 | 11/20 (notes added on its own) | 11/23 | 11/27 |
|---|---|---|---|---|
| Mon/Wed/Fri, Jake + Riley; Add notes on 11/20 ("Just this one") | Jake, Riley | Jake, Riley, *not marked* | Jake, Riley | Jake, Riley |
| Edit 11/16, untick Wed, Save → "Remove 151, keep the 1 changed on its own" | Jake, Riley (new series) | Jake, Riley (**old series**, not marked) | Jake, Riley (new) | Jake, Riley (new) |
| Edit 11/16 → Jordan, "This and all following" | Jordan | **Jake, Riley: skipped silently** | Jordan | Jordan |

Control without the split: Add notes on 11/16, then "following" from 11/9 → Riley. 11/16 became Riley, notes kept.

**Repro:**
1. As `brewer1`, add a Mon/Wed/Fri repeat with Jake and Riley, starting Mon 11/9.
2. On Fri 11/20, use Add notes, type anything, Save, and pick Just this one.
3. Edit Mon 11/16, untick Wed, Save, then pick "Remove 151, keep the 1 changed on its own".
4. Edit 11/16 again, set Assigned to Jordan, Save, and pick This and all following.
5. 11/20 still shows Jake and Riley, while 11/16, 11/23 and later show Jordan.

**Judgement:** I rated this must-fix because a date ends up with the wrong people and the user gets no sign of it. If notes-only changes are meant to count as "changed on their own", the fix could be to mark them that way from the start. As it is, "changed on its own" means one thing in the split confirm and another in the flag and in "following" edits.

## Minor gaps

**13. A split from the first occurrence detaches kept exceptions.**
- **Path:** Mon/Wed/Fri with Jake and Riley. This-only on 11/11 → Rowan. Change the rule from 11/9 (the first occurrence), adding Tue, with keep.
- **Expected:** the exception keeps its people and stays marked as part of the repeat. It does keep Rowan and stays marked.
- **Observed:** 11/11 now has `series_id: null`. Its menu shows Edit, Add notes, Mark completed, Change day…, Move up/down and Delete, with no Edit series… and no Stop repeating. In every other split I tried, a kept exception stays in the old series with those options. Series-wide actions can't reach it after this. I didn't confirm whether Delete → This and all following from 11/9 removes it, because cleanup deleted it on its own.
- **Repro:** the path above through the API (`changed:"keep"`), then open 11/11's menu.

**14. A moved occurrence gets a twin after a split.**
- **Path:** Mon/Wed/Fri from 11/2. Change day on Fri 11/20 → Sat 11/21 (marked). Edit 11/2: Every other week, Mon/Fri, then "Remove 155, keep the 1 changed on its own".
- **Expected:** nothing changes silently. The user moved the Friday work to Saturday.
- **Observed:** the week of 11/16 now has **both** the new pattern's Fri 11/20 and the kept Sat 11/21. Before the split there was one. People are right on both (Jake and Riley).
- **Judgement:** "keep" arguably asked for this, so this may be intended. But nothing in the confirm says the moved date will be remade.

## Scenarios

| # | Result | Notes |
|---|---|---|
| R1 | **Pass** | `sha` `1be89fbb…`; ribbon `DEV · 1be89fb`. Person IDs are unchanged since the reseed. |
| R2 | **Pass** | My gap 1 repro: the split is through the UI, from the 11/18 edit dialog (+Tue, people untouched). 11/18 and 11/20 keep Morgan. 11/23 onward keep Jordan. The new Tuesdays 11/24 and 12/1 take Jordan, from 11/23. The confirm has the new sentence ("…Dates that stay keep their people. New dates take them from the last regular occurrence."). History records the rule change with `removed:151`. See `r2_confirm.png`. |
| R3 | **Pass** | API and dialog both: after the split, 11/13 keeps Jake and Morgan and stays marked (`series_exception: true`, in the new series). The following edit from 11/9 → Riley changes 11/9, 11/11, 11/16 and onward, but not 11/13. The new 11/17 took Jake and Riley from 11/11, skipping the 11/13 exception. |
| R4 | **FAIL: gap 12** (plus 13, 14) | Passed: rule change with exceptions on dropped and surviving dates (keep, or remove all with the counts shown). Stop repeating with keep (the exception stays). Ends: after 5, after 12 (new dates take Morgan from the last regular), until 12/31. One-off → repeat (people and notes copied). Split from first and from last (counted series). Monthly 9th → 15th (12/15 took Jake and Riley; 1/15 onward Morgan; 3/15 skips the 3/9 exception and takes Morgan). Monthly → quarterly (surviving 12/9, 3/9 exception and 6/9 keep their people). Every other week (11/30 keeps Morgan; finished 11/4 and 11/6 kept). A person leaving, then a split: no Lee anywhere, and the emptied exception stays marked. Edit series… through the UI (+Tue from 11/20: 11/23 and 11/24 Jordan, 11/13 exception untouched). Rule + title + notes + people in one save: applied to following non-exception dates. The exception 11/20 kept Rowan. **History records** `from`/`to` for people, title and notes alongside the rule (`kept`/`removed`). `assignee_id` matched `assignees[0]` everywhere. |
| R5 | **Pass** | 100 distinct → 422 naming the first five, then "88 more can't be assigned" (count correct). Owners in the list aren't refused (gap 8, accepted). 6 refusals → "1 more"; 5 → names only. 101 → "A task can have at most 100 people" in 84–95 ms. 30,000 → same in 0.39 s (PATCH) / 0.52 s (POST); 50,000 → 0.69 s. 101 copies of one person → 200, one person. Linked task: `[Sam Pour]` → "Sam Pour must be a Brewery member" under `assignee_ids`. A lone `assignee_id` gives the same. Two people → `linked_task_assignees`. The task is unchanged afterwards. |
| R6 | **Pass** | 390 px, light and Hop Field Night: two `[TEST-TEMP]` names of 80+ characters wrap onto two or three lines in the Assigned to list, with no clipping and no sideways scroll (`scrollWidth` 390). Checkboxes line up. Readable in both themes (`r6_light_list.png`, `r6_dark_list.png`). |
| R7 | **Pass** | Phone (390×844, touch). The task board, View Schedule (`owner`) and the Gantt (Production; its own scroll at 300/234) all stay in place after tapping outside, Escape, or picking an item. Escape and tapping outside both put focus on the gear. First day → Monday scrolls today's header to the top (y 3287) and closing the menu leaves it there. Sunday does the same. Hide completed keeps today at the top. On Buy-a-Beer (`barMgr`; `floater` has no gear there), tapping outside and Escape keep the position and focus the gear. Its page only scrolls 18 px at 390×560, so this check was weak. Its History item switches the page to an in-page history view, which starts at the top. |
| R8 | **Pass** | Q2 (UI): create with two people, add, remove, clear, each reloaded. The card shows three sets of initials and the tooltip lists all three. History reads "Assigned…/Removed…". Q3: My tasks shows for Jake and Riley, not for Morgan; the emptied task appears in Unassigned. Q7: single picker with no checkboxes. Jake through the dialog reaches the step (`assignee_id` 2790); restored to Riley. Q8: Brewery tablet, three people with a staff code, History names the person, `on_shared_device: true`. Linked task through the tablet API → 403 `linked_task_device`. Q11: All departments shows three sets of initials then +2. The Dashboard's Today's tasks lists all five. The task menu lists all five. |

## Data made and cleaned

| Item | What happened |
|---|---|
| Tasks and series | All `[TEST-TEMP]` R2, R3, R4, R5, R6 and R8 tasks were deleted: 2,336 occurrences across 30 titles, all made by `brewer1`, except 2 by the Brewery tablet. A rescan of the Brewery board from 2026-10-01 to 2028-12-31 (days, Future and Unfinished) found 0 left. I made nothing on other boards. |
| People | `[TEST-TEMP] R4 Lee Leaver` (3326), `[TEST-TEMP] R6 Maximiliana Featherstonehaugh-Cholmondeley Wolfeschlegelsteinhausen` (3327) and `[TEST-TEMP] R6 Bartholomew-Wolfeschlegelsteinhausenbergerdorffvoralternwarengewissenhaft` (3328). Addresses are `test-temp-d53p1r-*@rockcut-test.com`. There's no delete, so all three are **deactivated, with no departments and no staff code**, and still exist. |
| Linked task / production step | FV2 · Galactic #40 · Set temp - 58° (task 81621, step 53492) was set to Jake for Q7 and **restored to Riley Wort**. Its `updated_at` changed. |
| Settings | `brewer1`'s theme went Light → Dark → **Light**. First day was changed and **restored to Today**. View was set by R8 for `brewer1`, `brewer2` and `breweryMgr` and **restored to All**. The `owner`'s My shifts filter and the Gantt's Collapse/Expand all were toggled and restored. I checked all of these afterwards. |
| Not touched | `[SEED] Scrub the cold room floor` and `[SEED] Deep clean the back bar` keep their people and `updated_at`. Other testers' `[TEST-TEMP]` people (e.g. 3272–3325) weren't touched. |
| History | My rows can't be removed and stay on the Brewery board. |
| Messages | None posted. |

## Things to know about how I ran this

- **Token rule:** API calls read the session value inside the page (`scripts/lib.js`), as the clarified rule allows. It was never returned to a script, printed, logged or screenshotted. A pattern scan of `scripts/r/` and `results/` found no token-like strings. I didn't open `auth/*.json`, didn't sign anyone out, and didn't change any password.
- **`/api/me`:** in R1 I printed the first 300 characters of `/api/me` for `brewer1`, with anything named like a token stripped. It showed only id, name, email and memberships.
- **Board reads mid-split:** my first read after the R2 UI split showed the old series up to 12/7 and the new one after. The read used two windows, and the first went out before the save had finished. A reread a moment later was consistent. I don't count it as a gap.
- **Two tablet tasks:** my first Q8 attempt reported that the code dialog was still open and found no task, yet that task existed later, so cleanup found two `R8 Q8 tablet` tasks. I suspect a slow save rather than a double save, but I didn't chase it.
- **Scripts:** this round's scripts are in `scripts/r/`. Some use IDs from this run. Screenshots are in `results/r2_*` to `r8_*`.

## What I couldn't test

- **Background top-up of series:** I saw new dates only from splits and Ends changes, not from the generator running over time.
- **Monthly "weekday" rule** (e.g. 2nd Monday): I tried it only through the API, which needs fields I didn't find (`weekday`, `week_of_month`). I didn't test it with people.
- **Gap 13's reach:** whether Delete or Stop repeating from the series still removes a detached exception.
- **Real phones and touch drag:** sizes were emulated in Chromium.
- **Buy-a-Beer scroll:** little content to scroll at phone size, as noted under R7.
