# D52 QA acceptance report — DEV

- **Build:** `58e5c55` — `GET /api/health` → `{"env":"dev","status":"ok","sha":"58e5c5575e261d14b466ce088180dd4cba5f2dea"}`; ribbon `DEV · 58e5c55 — fictional test data only`
- **Date:** 2026-10-29 (America/Denver), UI https://rockcut-ui-dev.fly.dev
- **Method:** Playwright Chromium 1.64 scripts (`scripts/`), personas via `storageState` paths only (no token was opened, printed or captured). Desktop 1440×900, phone 412×915 (`isMobile` + touch), tablet 1280×800 (touch). Light and Dark through account menu → Theme. Screenshots: `results/shots/`.
- **Personas used:** owner, brewer1 (Jake Brewer), breweryMgr (Morgan Mash), barMgr (Casey Tap), bartender1 (Sam Pour), bartender2 (Alex Draft), floater, breweryDevice, taproomDevice.

## Summary

| # | Severity | Gap |
|---|---|---|
| 1 | **must-fix** | A series that ends **after N times** is never treated as ending: no "last in series", no "Extend series…", and no Extend prompt when its last task is checked off |
| 2 | **must-fix** | Task board gear **View** (All / My tasks / Unassigned) isn't remembered after a reload; every other board setting is |
| 3 | minor | A task board URL range longer than 31 days is silently ignored: the board shows the default 2 weeks while the URL keeps `?from=&to=` |
| 4 | minor | Task notes icon can't be reached by keyboard (Tab skips it; the notes preview is hover-only). Clicking it puts the cursor at the **start** of Notes, not the end |
| 5 | minor | Old `/settings/categories` (no id) redirects to **Home**, not to Ingredient categories |
| 6 | minor | Old link to a category that doesn't exist (`/settings/categories/999999` → `/ingredients/categories/999999`) spins forever (API 404, no message) |
| 7 | minor | Buy-a-Beer History has no URL of its own: reload goes back to the Board, and browser/Android **Back** from History leaves the page for Home instead of returning to the Board |
| 8 | minor | Board settings are saved in two different places: **Hide planned batches** is saved per account (server); Hide shifts, Hide completed, First day and Days shown are saved per browser. So on a new device only some of them come back |
| 9 | minor | Production "Weeks on screen" doesn't match its label: **2 weeks** shows 10/22–11/12 (3 weeks) and **6 weeks** shows 7 (one week of history is added) |
| 10 | minor (nit) | Collapsed nav (owner, 900px tall): the last Messages channel icon (Taproom) sits half under the DEV ribbon (DEV-only) |

## Gaps in detail

### 1. must-fix — "after N times" series has no end handling
- **Path:** Brewery board → Add a task → Repeat Weekly → Ends **After a number of times** = 2 → its 2nd (last) card.
- **Expected (item 12):** the last task of a series that ends "on a date **or after N times**" shows "last in series". Checking it off, or its menu → Extend series…, asks "Extend the series?".
- **Observed:** `[TEST-TEMP] Q13 B` (Edit series shows "Repeats every week on Fri, 2 times", Times = 2). Its last card (Fri 11/6):
  - has no `last in series` tag;
  - its menu offers **Stop repeating** and no **Extend series…** (seen as breweryMgr);
  - checking it off as brewer1 completed it (`POST …/tasks/54170/complete → 200`) with **no Extend prompt**.
  The same steps with **Ends: On a date** work correctly (Q13 A).
- **Repro:** brewer1, create a weekly task ending after 2 times; open `/tasks/brewery`; look at the 2nd card; check it off.

### 2. must-fix — board "View" not remembered
- **Path:** brewer1 `/tasks/brewery` → gear → View → **My tasks** → reload.
- **Expected:** "Board follows each setting; remembered as before."
- **Observed:** the board filters correctly, but after a reload the gear shows **View: All** and the board is unfiltered. In the same run First day = Sunday, Days shown = 1 week and the three Hide switches all survived the reload. No View key appears in local storage, and View isn't in the URL.
- **Note:** if View was never remembered before D52, downgrade this to minor. It's must-fix only under the brief's "setting … isn't remembered" rule.

### 3. minor — URL ranges over 31 days are silently dropped
- **Path:** `/tasks/brewery?from=2026-10-29&to=2026-11-28` → 31 columns, correct. `…&to=2026-11-29` (32 days) or `…&to=2026-12-03` → the default 10/28–11/11 view, while the URL still shows the long range.
- **Expected:** honour the range, or clamp it visibly. **Observed:** silent fallback. It made a series occurrence look as if it had "disappeared".

### 4. minor — notes icon: keyboard and cursor
- **Path:** brewer1, a `[TEST-TEMP]` task with notes → hover / click the notes icon / click the popup.
- **Mouse and touch:** pass. Hover shows the notes; clicking the icon or the popup opens **Edit task** with focus in Notes; on the phone, tapping the icon opens Edit with Notes focused.
- **Keyboard:** Tab from the card's checkbox goes straight to "ADD A TASK". The icon isn't focusable, so keyboard users can't see the preview (Notes are still reachable through the card menu → Edit).
- **Cursor:** the caret lands at position 0 of the existing notes, not the end.

### 5 & 6. minor — old Settings links
- `/settings` → `/ingredients/categories` ✅. `/settings/categories/3` → `/ingredients/categories/3` (Hops) ✅, query string dropped ✅.
- `/settings/categories` → `/` (Home) ✗. Expected the categories list.
- `/settings/categories/999999` → `/ingredients/categories/999999`: spinner still showing after 15 s; `GET /api/ingredient_categories/999999 → 404` is never handled (`results/shots/q16_badid.png`).

### 7. minor — Buy-a-Beer History navigation
- **Path:** barMgr `/taproom/beer-board` → gear → History.
- **Observed:** URL stays `/taproom/beer-board`. "‹ Board" works. But reload → Board, and browser Back → `/` (Home). On a phone, the system Back gesture will leave Buy-a-Beer.

### 8. minor — inconsistent persistence of board settings
- Hide planned batches survived new browser contexts (saved per account). Hide shifts, Hide completed (`rockcut.tasks.*.brewery`), First day and Days shown are per browser.
- Not wrong on its own terms, but on another device or tablet only one of the four comes back. (Found because my runs changed brewer1's server-side value; I reset it to off.)

### 9. minor — Production "Weeks on screen" vs range
- From 10/22: 2 weeks → 10/22–11/12 (22 day columns); 6 weeks → 10/22–12/10; 12 weeks → longer. Each is one week more than the label (one week of history plus N). Confirm this is intended; if so, the label could say so.

## Scenarios

| # | Result | Notes |
|---|---|---|
| Q1 | ✅ pass | sha and ribbon match |
| Q2 | ✅ pass | 7 pages × Light/Dark: one top row, controls left, actions + gear right, no white panel. Gear at x=1376, y=73 on all 7 in both themes; readable. Brands gear says "No settings yet" |
| Q3 | ✅ pass (nit #10) | owner and brewer1: rail stays 64px; Brewery/Taproom/Messages open their pages as icons and close again; hover names every icon; links go to the right pages (e.g. Managers → `/messages/managers`, Brewery channel → `/messages/dept:brewery`). Messages shows `all`, `mngr` and department icons; icons are outline in Light and Dark |
| Q4 | ⚠ gap #2, #3, #8 | Each setting applies (View All/My/Unassigned, Hide ×3, First day Sun/Mon/Today, Days 1/2 weeks). All except View are remembered. URL range works up to 31 days; ‹ › step the range; Today clears it. brewer1 has only one board; `/tasks/bar` and `/tasks/office` redirect to Brewery |
| Q5 | ✅ pass | breweryMgr: Edit Daily items + History; brewer1: neither; taproomDevice: View = All / Unassigned (no My tasks), no Hide planned batches |
| Q6 | ✅ pass | Scheduler (moved to Nov 9–15) → View Schedule via nav, home card and browser Back always shows 10/29–11/04. Today keeps the span (11/10–11/20 → 10/29–11/08). Department/Position/My shifts/Open only filter correctly, and the dot shows only while a filter is on. Calendar sync opens with populated links (owner 7, barMgr 2, bartender1 1). Filters reset on reload (not required by the brief) |
| Q7 | ✅ pass | barMgr, week Dec 7–13: "Publish this week? / Publish 1 draft shift and 1 draft event for Dec 7 – 13? Staff will be notified." Cancel and Escape leave both drafts (also after a reload); Publish → Scheduled 8 hr / Draft 0 hr, still true after a reload. A week with 0 drafts shows a snackbar "No draft shifts or events to publish this week" |
| Q8 | ✅ pass | Drafts are striped in their own color (Bar-close navy, Brewer orange, Bar-open blue; `repeating-linear-gradient(135deg…)`); published shifts are plain; text is readable in Light and Dark (owner, barMgr) |
| Q9 | ✅ pass (#9 note) | Gear by mouse (Weeks 2/6/12, Tanks Collapse/Your selection/Expand, Set up links) and keyboard (Enter → first setting, arrows, Enter picks, Esc closes back to the gear; Space opens too). Task list opens over the chart (x=1099, w=317), its title is level with the date header, rows are checkbox/title/notes/who, there's no Move/assign/Open, and a title opens its step. Batch-bar and step tooltips both at y=283. Two steps on the same day sit side by side and both are clickable. An expanded tank has no lines between steps. Narrow column shows SV1–SV4 |
| Q10 | ✅ pass | `[TEST-TEMP] Q10 tank`: AB12 saved and shown in the narrow column. Typing ABCDE gives ABCD (maxlength 4). A forced `ABCDE` PATCH → **422** "Use up to 4 characters." shown in the dialog. Blank or spaces → `null` → full name shown |
| Q11 | ✅ pass | `[SEED] Lager with transfer` preview: each tank's caret opens and closes its steps (diamonds, names, link lines) by mouse and Enter, Light and Dark. Left without saving |
| Q12 | ⚠ gap #4 | Mouse and touch pass; keyboard and cursor gaps |
| Q13 | ⚠ gap #1 | Date-ended series: last card shows "last in series". Checking it off (after the "Where should it show as done?" step) asks "Extend the series?" with Not now / Pick a new end… / **Same again: to Thu 11/12**. Not now completes it and leaves the end alone; Same again extends to 11/12 and the new last card is tagged. The menu → Extend series… (breweryMgr) → Pick a new end… opens Edit series → Save → second confirm "Change when it ends / Extends the series." → Save; the new end (11/19) survives a reload. Count-ended series fails (#1) |
| Q14 | ◐ partial | breweryDevice: the last card shows "last in series", and its menu has **no Extend series…** ✅. The end-to-end check-off is blocked: after "show as done" the tablet asks "Who's making this change? Your staff code" (cancelled; nothing saved). **Needs a staff code from the lead** |
| Q15 | ✅ pass | floater: `/tasks/taproom`, `/tasks/taproom/`, `/tasks/Taproom` → `/tasks/bar` (Taproom tasks). The `?from=2026-11-02&to=2026-11-05` range carries over |
| Q16 | ⚠ gaps #5, #6 | No Settings in the nav (all sections expanded) or the account menu. The Ingredient gear → "Ingredient categories" opens `/ingredients/categories` |
| Q17 | ✅ pass (#7) | barMgr has the gear (Export CSV / Import CSV / History); bartender1 and taproomDevice have none; no Board/History tabs. History lists entries; "‹ Board" returns. Export downloads `buy-a-beer-board-2026-10-29.csv`. Import preview with a `[TEST-TEMP]` CSV: Add/Replace; Replace preview says "This deletes all 5 entries…", **Replace the board** stays disabled until REPLACE is typed; cancelled, only the preview POST was sent. On the tablet (barMgr, touch, Light/Dark) the gear menu and History → ‹ Board work |
| Q18 | ✅ pass | Phone, touch: gears on tasks, View Schedule, Production, Scheduler, Ingredients and Brands open by tap; every menu and submenu fits on screen (no horizontal scroll, 412px); tapping outside closes them; switches toggle by tap (the dot appears). The phone drawer has no collapse control; sections and links work by tap; Messages channels are listed |

Also checked: **item 15**. With `/api/channels` forced to 500, Messages shows "Couldn't load the channels." with **Retry**, and Retry loads the channels. **Taproom tablet board** gear by touch: Hide shifts hides and restores the 14 shift chips. **Dark**: Extend dialog, gear menus, nav icons, striped drafts and Production all readable.

## Not testable / not tested

- **Q14 tablet check-off end to end** and **item 14** ("Acting as …" bar text on a tablet in Light): both need a staff code. Requested from the lead.
- **Real devices:** everything touch-related was Chromium touch emulation (`hasTouch` / `isMobile`), not a physical Pixel or tablet.
- **Light-mode day lines "lighter":** no pre-D52 baseline to compare against.
- **Migration (abbreviation):** on DEV, SV1–SV4 show their abbreviations, the FV tanks are blank, and add/edit/clear all work. There's no way to observe the migration itself.
- **Phone drag (known flaky):** not exercised; not seen.

## Data created and cleaned

| Data | Persona | Cleanup |
|---|---|---|
| Shift 3472 `[TEST-TEMP] Q7 open shift` (Bar-close, open, Dec 8), **published** | barMgr | deleted (owner) |
| Event 20150 `[TEST-TEMP] Q7 event` (Dec 9), **published** | barMgr | deleted |
| Shifts 3473–3475 `[TEST-TEMP] Q8 draft` (Dec 15–17, drafts) | owner | deleted |
| Tank 2343 `[TEST-TEMP] Q10 tank` | breweryMgr | **retired** (the app has no tank delete; `DELETE` = retire) |
| Task 54166 `[TEST-TEMP] Q12 notes task` | brewer1 | deleted |
| Series `[TEST-TEMP] Q13 A` (54167, 54168, 54175, 54179) | brewer1 / breweryMgr | deleted |
| Series `[TEST-TEMP] Q13 B` (54169, 54170) | brewer1 | deleted |
| Series `[TEST-TEMP] Q14 tablet` (54171 Oct 31, 54172 Nov 7) | brewer1 | **kept** for the staff-code test; delete afterwards |
| Theme (saved per account, server-side) | owner, brewer1, barMgr switched to Dark | all 7 personas I used verified back to Light |
| brewer1 "Hide planned batches" (saved per account) | brewer1 | reset to off |

- Side effects: publishing the Dec 7–13 week notified Taproom staff, as expected. No messages were posted. Buy-a-Beer import was preview only.
- **Found, not mine (left alone):** event `[TEST-TEMP] S4 mvubtxqsgk2x Trivia` (Taproom, Nov 10); 326 retired tanks; `[TEST-TEMP]` templates among the 50 retired; tasks "Test2" (10/13) and "Mh test 1" (Future) on the Brewery board; a Buy-a-Beer import by Casey Tap at 7:59 PM today.

---

## Lead's disposition (2026-10-29)

| # | Disposition |
|---|---|
| 1 | Fixed in `3de8429` (`Series.mark_last` counts the rule's dates; ExUnit + Playwright, revert-and-rerun) |
| 2 | Backlog task 4991 (pre-existing; Matt) |
| 3 | Backlog task 4992 (pre-existing limit; Matt) |
| 4 | Fixed in `3de8429` (icon focusable, Enter/Space; cursor after the notes) |
| 5 | Fixed in `3de8429` (`/settings/categories` redirect) |
| 6 | Backlog task 4993 (pre-existing; Matt) |
| 7 | Fixed in `3de8429` (`?view=history`) |
| 8 | Backlog task 4994 (pre-existing; Matt) |
| 9 | No change: D48 design (a week of history plus N weeks; P118) |
| 10 | No change: DEV ribbon only |
| Q14 / item 14 | Covered: no Extend on the tablet (QA), the prompt isn't offered on a shared device, and the Acting-as contrast check (S43) passed in the DEV Playwright run |
