# D53 Part 1: second QA recheck after fix cycle 2 (DEV)

| | |
|---|---|
| **Build** | `967d872d5fedcf28a45ca2e538b24a0e2884c23a` (`/api/health`; ribbon `DEV · 967d872 — fictional test data only`) |
| **Date** | Sat 2026-11-07, about 23:45–00:00 America/Denver |
| **Environment** | DEV only. Prod not touched. Source not read. |
| **Personas used** | `brewer1` (all scenarios), `breweryMgr` (History reads, gap 7 check), `owner` (read-only user list to confirm person IDs) |

## Result

**Pass. No must-fix and no new gaps.** Gap 12 is fixed through both the UI and the API. All four S3 variations behave as the brief describes. R2, R3 and R5 show no regressions. As the brief asks, gaps 13 and 14 are not re-reported. A few observations that aren't gaps are listed at the end.

| # | Severity | Gap |
|---|---|---|
| — | — | None found |

### Status of earlier gaps

| Earlier gap | Now |
|---|---|
| 12 Notes-only occurrence skipped after a "keep" split | **Fixed** (S2, S3) |
| 13, 14 | Not retested, as the brief says (planned). S3's first-occurrence split touches gap 13; see the notes below. |
| 1, 2, 3, 7 | Still fixed (S4) |

## Scenarios

| # | Result | Notes |
|---|---|---|
| S1 | **Pass** | `sha` `967d872d…`; ribbon `DEV · 967d872`. Person IDs are unchanged: Jake 2790, Riley 2791, Morgan 2788, Jordan 2795, Rowan 2800. |
| S2 | **Pass** | Gap 12 repro, UI and API. See the table below. |
| S3 | **Pass** | All four variations, plus Delete following and an Ends-only change. See below. |
| S4 | **Pass** | R2, R3 and R5 as before. See below. |

### S2: the gap 12 repro

**Through the UI** (`[TEST-TEMP] S2 ui notes`): Mon/Wed/Fri with Jake and Riley from Mon 11/9. Fri 11/20 → menu **Add notes** → "Just this one" → Save → Just this one (`PATCH {"notes":…,"scope":"this"}`). Edit 11/16, untick Wed, Save. Edit 11/16 → Jordan → This and all following.

| Step | 11/16 | 11/20 (notes only) | 11/23 | 11/27 |
|---|---|---|---|---|
| After Add notes on 11/20 | Jake, Riley | Jake, Riley, notes, not marked | Jake, Riley | — |
| Split from 11/16 (Mon/Fri) | Jake, Riley (new series) | Jake, Riley, notes, **new series** | Jake, Riley (new) | Jake, Riley (new) |
| Following from 11/16 → Jordan | Jordan | **Jordan, notes kept** | Jordan | Jordan |

- **Confirm:** "Change the repeat · Removes 152 later occurrences. · The new pattern remakes them. Dates that stay keep their people. New dates take them from the last regular occurrence." The only buttons are **REMOVE** and CANCEL. There's no "changed on its own" line and no keep option (`s2_confirm.png`). The UI sent `changed:"remove"`.
- **History:** the rule change records `kept:0, removed:152`. The following edit records `count:102`, Jake and Riley → Jordan.
- **Board:** `s2_board.png`. The 11/20 edit dialog shows Jordan Float.

**Through the API** (`[TEST-TEMP] S2 api notes`): the same steps with PATCH. After the split, 11/20 is in the new series with its notes. Following from 11/16 → Jordan reaches 11/20. A following edit from **the other side** of the split (11/9 → Morgan) also reaches every date, 11/20 included, and its notes stay. History `kept:0`.

### S3: variations

| Variation | What I did | Observed | Result |
|---|---|---|---|
| **a. Notes-only on a dropped date** | Notes on Wed 11/18; split from 11/16 dropping Wed (API) | 11/18 is gone like the other Wednesdays. Nothing is kept or counted. | Pass, as specified |
| **b. Notes-only + an exception in one split** | Notes on 11/20 and on Wed 11/25 (dropped); 11/23 → Morgan, Just this one; split from 11/16 dropping Wed. **UI** and API. | The confirm reads "Removes 151 later occurrences. **1 was changed on its own.**", with buttons "REMOVE 151, KEEP THE 1 CHANGED ON ITS OWN" and "REMOVE ALL 152" (`s3b_confirm.png`). With keep: 11/23 stays marked in the old series with Morgan. 11/20 is remade in the new series with its notes. 11/25 is gone. History `kept:1, removed:151`. A later following edit from 11/16 → Jordan changes 11/20 and leaves 11/23 with Morgan. | Pass |
| **c. Notes-only, then Stop repeating with keep, then a following edit** | Notes on 11/20; menu **Stop repeating** on 11/16 (UI) | The dialog offers "REMOVE 151, KEEP THE 1 CHANGED ON ITS OWN" (`s3c_c_confirm.png`). `POST …/stop_repeating {"changed":"keep"}`. 11/20 stays in the series, unmarked, as its "Last in series", with an Extend series… item. A following edit from 11/9 → Jordan reaches all five occurrences, 11/20 included (`count:5`). Nothing is skipped. | Pass |
| **c′. Same, with Delete → This and all following** | UI | The second dialog offers keep (`s3c_del_confirm.png`), which sends `DELETE …?scope=following&changed=keep`. 11/20 is kept, and a following edit from 11/9 reaches it (`count:4`). | Pass |
| **c″. Ends-only change** | Notes on 11/20 (inside the new end) and 11/27 (beyond it); edit 11/16 → Ends: After 7 times (UI) | "Change when it ends · Removes 148 later occurrences. 1 was changed on its own." This counts only 11/27 (`s3g_ends_confirm.png`). With keep, 11/27 stays in the series and 11/20 is untouched. History `ends_only:true, kept:1`. A following edit from 11/9 → Jordan reaches all 8, both notes dates included. | Pass |
| **d. Notes-only + finished** | Series from Mon 10/26. Notes on Wed 11/4 and Fri 11/6, then both marked done through the checkbox ("On … its planned day"). Notes on open 11/13. Split from 11/2 dropping Wed (UI). Then following from 11/2 → Jordan. | The confirm is "Removes 156 later occurrences" with a plain REMOVE. The finished ones aren't counted. Both finished dates stay done, in the old series, with Jake and Riley and their notes. The dropped Wed 11/4 is kept because it's finished. There's no duplicate 11/6. Open 11/13 is remade with its notes and later becomes Jordan. The following edit leaves both finished dates alone. | Pass |

I also ran (d) as a split from the **first** occurrence (series from 11/2). The two finished notes-only dates kept their done state, people and notes, but lost their series (`series_id: null`). That is gap 13's pattern, so I haven't re-reported it.

### S4: no regressions

- **R2** (UI split from 11/18, +Tue, after following edits to Morgan from 11/16 and to Jordan from 11/23): 11/18 and 11/20 keep Morgan. 11/23 onward keep Jordan. The new Tuesdays 11/24, 12/1 and 12/8 take Jordan. The confirm has the new sentence (`s4_r2_confirm.png`). History records `removed:151`.
- **R3:** through the API and through the dialog, the 11/13 exception (Jake, Morgan) stays marked in the new series after the +Tue split. A following edit from 11/9 → Riley changes everything except 11/13. The new 11/17 took Jake and Riley (`s4_r3_board.png`).
- **R5:** 100 distinct → 422 naming the first five, then "88 more can't be assigned" (or "93 more", "95 more", which are correct for each list). 6 refusals → "1 more". 5 → names only. 101 → "A task can have at most 100 people" in 76–80 ms. 30,000 → same in 0.44 s (PATCH) and 0.52 s (POST). 50,000 → 0.65 s. 101 copies of Jake → 200, one person. **Gap 7:** linked task 89349 (FV4 · Crusher #42 · Set temp - 58°): `[Sam Pour]` → "Sam Pour must be a Brewery member" under `assignee_ids`. A lone `assignee_id` gives the same. Two people → `linked_task_assignees`. The task is unchanged (same people and `updated_at`).
- `assignee_id` matched `assignees[0]` on every occurrence I listed in this run. No 5xx or page errors.

## Observations (not gaps)

1. **Notes on a dropped date vanish without a mention.** In S3a, the notes a user typed on 11/18 are removed with the other Wednesdays. The confirm just says "Removes 152 later occurrences", and History records nothing about the notes. That matches the brief ("it goes, like its neighbours"), so I don't count it as a gap. A user who added notes may not expect them to go, though.
2. **The API applies a rule change without `changed`.** A rule-change PATCH with no `changed` returned 200 and applied the split. Where there was a people exception (S3b API), it was kept, so the default looks like keep. The UI always sends `changed`. I'm noting it only because I first meant it as a dry probe.
3. **Ends "After N times" message shows a field name.** The inline error reads "count: the series already has 3 dates before this one; choose a larger number". The `count:` prefix looks like a raw key. Also, after keep in S3c″, a series set to "7 times" holds 8 occurrences (7 plus the kept one).
4. **The checkbox on a future occurrence does nothing.** Clicking it on Fri 11/20 sent no request and didn't change the box. I didn't look for a message, and this may be intended.

## Data made and cleaned

| Item | What happened |
|---|---|
| Tasks and series | All made by `brewer1` on the Brewery board, titled `[TEST-TEMP] S2 ui notes`, `S2 api notes`, `S3a dropped`, `S3b mix`, `S3b ui mix`, `S3c stop`, `S3c ui stop`, `S3c ui delete`, `S3d done`, `S3d ui done` (two series from an aborted run), `S3e done past`, `S3f done mid`, `S3g ends`, `S3g2 ends`, `S4 R2 gap1`, `S4 R3 api`, `S4 R3 ui` and `S4 R5 size`. There were about 1,800 occurrences, including 4 finished ones. All are deleted. A rescan of the Brewery board from 2026-10-01 to 2028-12-31 (days, Future and Unfinished) found **0 left**. `S4 R5 post` was never created, because every POST was refused. Nothing was made on other boards. |
| People | None created. |
| Linked task | Task 89349 got only refused PATCHes and is unchanged (`updated_at` the same). |
| Settings | None changed (theme, First day, View and filters were not touched). |
| Not touched | `[SEED]` data. Other testers' `[TEST-TEMP]` data. |
| History | My rows can't be removed and stay on the Brewery board. |
| Messages | None posted. |

## How I ran this

- **Token rule:** API calls read the session value inside the page (`scripts/lib.js`), as allowed. It was never returned to a script, printed, logged or screenshotted. A pattern scan of `scripts/s/` and `results/` found no token-like strings. I didn't open `auth/*.json`, sign anyone out or change a password. As in R1, `/api/me` was printed truncated, with token-named fields stripped. It showed only id, name, email and memberships.
- **Scripts** are in `scripts/s/`. They reuse the helpers in `scripts/ui.js` and `scripts/r/h.js`. Screenshots are `results/s2_*`, `s3*_*` and `s4_*`.
- **Two false starts:** `PATCH {done:true}` on an occurrence returned 200 but didn't complete it (completion goes through `POST …/complete`), so S3d used the UI checkbox and its "Where should it show as done?" dialog. An aborted S3d run left a stray series with the same title, which I deleted before rerunning under new titles.

## What I couldn't test

- Real phones and touch: everything ran in desktop Chromium. S2 and S3 don't depend on the layout.
- The background top-up of series over time, as before.
- Notes-only occurrences on monthly or quarterly rules: I tried weekly only.
