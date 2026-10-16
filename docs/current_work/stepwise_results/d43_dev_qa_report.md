# D43 QA acceptance report: Rockcut UI tweaks (DEV)

- **Tester:** Claude (independent QA, automated), for matthewheiser
- **Time:** 2026-10-15, about 17:55–18:30 UTC (11:55–12:30 America/Denver)
- **Target:** DEV only: UI https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev. Build D43 at `7249387` (API v40, UI v38), as given in the brief. I did not check the build number independently.
- **Method:** Node + Playwright Chromium, timezone `America/Denver`, one browser at a time, closed after each script. Personas loaded from `auth/<persona>.json`. API calls ran inside the page with the page's own token, which was never returned or logged. Viewports: desktop 1366×860, tablet 1280×800, phone 412×915 with `hasTouch`/`isMobile` (**emulated**), plus a 320 px narrow check. To find low-contrast text, light panels and dim icons I combined computed-style checks with screenshots, and confirmed each finding by eye in a screenshot. Scripts are in `scripts/`, logs in `results/`, screenshots in `shots/`.

## Result: **PASS with gaps**

All 27 scenarios ran. 26 pass; S150 fails on dark-mode readability. I found no functional or permission defects in the theme setting, the tablet theme, the account menu, the top bar, the nav, the boards, the Scheduler totals or Move. The gaps are dark-mode legibility (G1, G2, G3) and one Move-mode edge case (G4).

## Gaps

| # | Severity | Path → expected → observed → repro |
|---|---|---|
| G1 | **must-fix** | **Bell popover timestamps unreadable in Dark.** `owner` (any persona) in Dark → bell icon → Notifications popover → expected readable text (S150) → every notification timestamp ("10/15/2026, 11:54:42 AM") is drawn in `rgba(0,0,0,0.38)` on the dark popover, contrast about 1.1:1, so it is effectively invisible. The ⚙ "Notification preferences" icon in the popover header is also dim. Repro: account menu → Theme → Dark → click the bell. Screenshots: `shots/s150_dark_bell_popover.png`, `shots/zoom_dark_bell_popover.png`. |
| G2 | **must-fix** | **Plain icon buttons stay black in Dark.** Any page in Dark → expected no near-invisible controls (S150) → icon-only buttons using the default action color keep `rgba(0,0,0,0.54)` on the dark background. The worst case is the task board's **‹ Previous / › Next** date arrows: almost invisible, contrast about 1.1:1 (`shots/zoom_dark_board_nav.png`, `shots/s151_board_dark.png`, phone `shots/lim1_phone_board_dark.png`). Also dim: the board "Board menu" ⋮ and phone "Days shown" control, the Scheduler ‹ › week arrows, the row ⋮ "options" buttons (dim but visible: `shots/zoom_dark_scheduler_row_kebab.png`), and the Edit pencil on Settings category, Ingredient, Brand, Recipe and Batch detail pages (`shots/lim1_dark_batch_detail.png`). On the dark **sign-in page** and Profile, the "Show password" eye icon is barely visible (`shots/s169_login_dark_device.png`, `shots/s150_dark_profile.png`). The trash icons in Manage positions and Settings → Grains field rows are dim too. Repro: Theme → Dark, open Tasks → Brewery board and look at the arrows left and right of TODAY. |
| G3 | minor | **Low-contrast text on light shift colors (Scheduler, View Schedule, Positions).** Scheduler in Dark → expected readable chips → white text on the light "Brewer" (`#D6934A`, about 2.6:1), "Bar-mid" (`#7EABDE`, about 2.4:1) and "Event-offsite" (about 2.2:1) shift chips. The same white-on-light chips appear in Light, so this is not only a dark-mode problem, but S150 asks for readable text. On boards in Dark, the dimmed done-task "✓ Riley" / "✓ Jake" lines and the avatar initials are about 1.8–2.5:1. Screenshot: `shots/s150_dark_scheduler.png`. |
| G4 | minor | **Move mode: an arrow key behind an open dialog reorders and saves staff.** `owner` → Scheduler → a row's ⋮ → Move → click an empty day cell (another row) → expected: the click ends Move, or arrow keys stop moving the row while a modal is open → observed: Move stays active, the "Add shift?" confirmation opens, and pressing ↑ while the modal is open moves the highlighted row behind it and **saves** (`POST /api/roster/order` 200; the order survives a reload). Repro: Move on "Morgan Mash", click an empty cell in Alex Draft's row on Tue, press ↑ → Morgan Mash moves up one, saved. The order was restored afterwards. Screenshots: `shots/l5_click_elsewhere.png`, `shots/l5_arrow_with_confirm_dialog.png`. Log: `results/s09_move_dialog.log`. |
| G5 | minor | **Failed theme save (offline) gives no feedback.** `brewer1` → go offline → Theme → Dark → expected: the change applies, or a "couldn't save" message appears → observed: nothing changes, no error, and the menu still shows ✓ Light (the server stayed Light). Repro: DevTools offline, then pick Dark. Log: `results/s02_theme_person.log` lines "L3 offline …". |
| G6 | minor | **Open tablet does not pick up a theme change until it navigates.** `breweryMgr` sets the Brewhouse tablet to Dark while the tablet page is open → the tablet stays Light (checked about 10 s later, no polling) and turns Dark on its next in-app navigation or load. This matches S147 ("on its next load"); I note it only for LIMITATIONS 3. A person's own second browser behaves the same way (it updates on the next navigation, not live). |
| obs | – | Nav item "User change log" opens a page titled **"Activity"** (the top-bar title does not match the nav label). The new person's Home showed a "Messages 0" text node in the nav. Neither is a D43 regression as far as I can tell. |

## Scenario table

| # | Result | Evidence |
|---|---|---|
| S143 | PASS | `brewer1` and a brand-new throwaway person (no setting saved; dark browser): body `#EEF2E8` pale green, sage nav `#E6ECDD`, hop-green buttons (`rgb(47,90,32)`), black logo `/rockcut-logo.png`, no theme prompt. `shots/s143_home_light.png`, `shots/s143_new_person_home.png` |
| S144 | PASS | Dark applied without a reload (window marker kept): body `#151915`, nav panel lifted `#2B3428`, logo `/rockcut-logo-light.png` (green), account and nav icons green `rgb(141,191,106)`, ✓ on Dark; API `color_mode=dark`. `shots/s144_menu_dark.png` |
| S145 | PASS | New context with the cached `rockcut_color_mode` cleared → Dark from the server. `shots/s145_other_browser.png` |
| S146 | PASS | Match this device: emulated dark → dark, emulated light → light, no reload; API `device`. `shots/s146_device_*.png` |
| S147 | PASS | `breweryMgr` → Admin → Shared devices → Brewhouse tablet Theme → Dark; saved (still Dark after reload, API dark); `breweryDevice` dark on its next load. `shots/s147_mgr_set_dark.png`, `shots/s147_tablet_dark.png` |
| S148 | PASS | Ran with a throwaway person (Light) per rule 3, not `brewer1`. Tablet stayed dark; header shows `temp-…@rockcut-test.com` and a visible SIGN OUT, no account menu. The person's own saved Light was not changed (checked in a separate browser). `shots/s148_signed_in_as_me_dark.png`, `shots/s148_header.png`, `results/s16_*.log` |
| S149 | PASS | `bartender1`: no Shared devices in the nav; `/devices` redirects Home; `PATCH /api/devices/1556 {color_mode}` → 403 |
| S150 | **FAIL** | Walked every nav page plus dialogs (Add shift, Add event, Templates, Positions, Add task, Buy-a-Beer redeem/add/history, Add user, Edit user, Add device, Notification preferences, Add brand/batch/ingredient/category, Edit ingredient). No white panels; toggle buttons readable. Fails on G1 (bell timestamps), G2 (near-invisible icon buttons), G3. `shots/s150_dark_*.png` |
| S151 | PASS | Light: page `#EEF2E8` / column `#E1E8D7` / card `#FFFFFF`. Dark: page `#151915` / column `#20271E` / card `#2D362A`. Today's column has the same column shade plus a green outline. Light page vs column is subtle but distinct. `shots/s151_board_*.png` |
| S152 | PASS | Desktop and phone drawer: Home, Tasks, Schedule (View Schedule, Time off, Availability), Brewery, Messages. `shots/s152_phone_drawer.png` |
| S153 | PASS | The h1 is in the top bar (`.page-title-slot`); the board switcher (dot, "Brewery tasks", ▾) is in the bar and opens Brewery/Taproom/Office/Sales/All departments; Settings → Grains shows "‹ Settings Grains"; no breadcrumbs anywhere. `shots/s153_*.png` |
| S154 | PASS (emulated) | 412×915: Board, Schedule, Time off, Availability, Brands, Ingredient, Profile and Messages show the title and hide the small logo; Home keeps the logo with no title. `shots/s154_phone_*.png` |
| S155 | PASS | Owner menu: "Olivia Owner", "owner@rockcut-test.com · Owner", Profile, Theme (Light/Dark/Match this device), Log out; Profile → `/profile`. Log out was tested on a throwaway: returned to sign-in, token cleared, deep links show sign-in. `shots/s155_owner_menu.png` |
| S156 | PASS | `brewer1` View Schedule: no header buttons; CALENDAR SYNC sits inside the filter box after "Open only" (at 1366 px it wraps to its own line under From) and opens only the Calendar sync dialog. `shots/s156_*.png` |
| S157 | PASS | `breweryMgr` View Schedule: only Calendar sync and Claim (no Templates/Positions/Add event/Add shift). Scheduler: Publish/Copy/Delete week, Templates, Positions, Add event, Add shift; no Calendar sync. `shots/s157_*.png` |
| S158 | PASS | `taproomDevice` /schedule: no Calendar sync, no buttons. `shots/s158_taproomDevice_schedule.png` |
| S159 | PASS | This week: Scheduled 144 hr = rows 128 + Open shifts 16; Department = Brewery → 56 = 48 + open 8. Next week: "Draft 32 hr", rows read "0 hr · 8 hr draft". `results/s07_*.log`, `results/s20_*.log` |
| S160 | PASS | ⋮ → Move: row highlighted with ↑ ↓ FINISHED; the other 15 ⋮ hidden; ↑↑ Enter moved Jake Brewer from 5th to 3rd; kept after reload. `shots/s160_move_mode.png` |
| S161 | PASS | ↓ button moved Avery Owner down one; FINISHED ended the mode; Move then Esc ended it too. |
| S162 | PASS | `brewer1` has no Scheduler in the nav; `/scheduler` redirects Home (no ⋮, no arrows). |
| S163 | PASS | Ticked all of today's Daily: "Daily 4/4" open, line-through, opacity 0.65; after reload: closed, struck, dimmed. Unticked my 3 ticks afterwards (back to the seed's 1/4). `shots/s163_*.png` |
| S164 | PASS | Today at 2/4 (one tick added, then removed): open, no strike, full opacity. Seed Tue 10/13 at 2/4: closed, no strike. Future-day Daily items are disabled (can't be ticked ahead). |
| S165 | PASS | Columns In-app and Push only; no "SMS is coming soon". `shots/s165_notif_prefs_brewer1.png` |
| S166 | PASS | Light and Dark: headings BREWERY/OFFICE/… in caps with a round color dot on a tinted band; positions indented 32 px with a 14 px square in their shift color. `shots/s166_position_menu_*.png` |
| S167 | PASS | Test shifts on Tue 10/20, created out of order: `floater` Taproom board shows Sam Pour 8:00a, Open 10:00a, Alex Draft 12:00p. Shifts deleted afterwards. |
| S168 | PASS | `breweryMgr`: "Jake Brewer · Brewer · 7:00a–11:00a, 3:00p–7:00p" first, then "Riley Wort · 11:00a–3:00p". Shifts deleted. |
| S169 | PASS | Sign-in page in Dark (Match this device, dark browser, including right after Log out): dark page, green logo. A dark browser with no stored setting shows Light. The eye icon is dim (G2). `shots/s169_*.png` |

## LIMITATIONS: what I found

1. **Dark mode on screens without local data.** DEV had no brands, recipes or batches, so I created a `[TEST-TEMP] QA Brand`, a recipe v1.0 and batch `TEST-TEMP-QA-1`, checked them in Dark and then deleted them. Brand detail, recipe page with its tabs (Grain bill, Mash, Process, Water), batch detail, batch edit, Settings → Grains, ingredient detail and edit, and the phone nav drawer: no white panels or unreadable text, and back links read "‹ Brands", "‹ [TEST-TEMP] QA Brand", "‹ Batches", "‹ Settings". The only problem is the dim Edit pencil and trash icons (G2). `shots/lim1_dark_*.png`
2. **Dark mode with real DEV data.** The Scheduler with conflicts (red outlines plus banner), time-off chips ("Off 2:00 PM–5:00 PM") and availability chips ("Prefers …") is readable. Messages (All-staff, Managers), the Buy-a-Beer Board and history, Users & Roles plus the edit dialog, Shared devices and Activity have no panel problems. Findings: G1, G2, G3.
3. **Theme across sessions.** A second open browser for the same person does not update live; it picks up the change on its next navigation or reload (G6). A fresh browser follows the server setting. An open tablet whose theme is changed updates on its next navigation (G6). "Sign in as me": the tablet's theme wins; while signed in, `/api/me` reports the tablet's mode, but the person's saved setting is untouched. The 5-minute return happened between 4:00 and 5:10 (simulated with Playwright's clock) and kept the tablet theme. A tablet theme changed while a person is signed in applies on reload. An offline save fails silently (G5).
4. **Who can set a tablet's theme.** All checks matched the spec:
   - **Allowed (200):** owner; `breweryMgr` on the Brewhouse tablet; `barMgr` on the Taproom tablets (the change was reverted at once).
   - **403 Forbidden:**
     - `PATCH /api/devices/1556` as `bartender1`, `brewer1`, `office1`.
     - `PATCH /api/devices/1556` as other-department managers `barMgr` and `dualMgr`.
   - **403 "Not available on a shared device":**
     - Each tablet `PATCH`ing its own device or the other one.
     - `PUT /api/me/color_mode` as either tablet.
   - **UI:** managers see only their home department's tablet card.
   - **Invalid value:** `color_mode: "purple"` → 422.
5. **Move mode under latency.** Each key press sends its own `POST /api/roster/order`:
   - **Fast keys:** 6× ↑ then Enter ended at the expected position, matching what was shown before the reload.
   - **Alternating keys:** ↓↓↓↑↓↑↑ ended at the right position.
   - **Changing week or the Department filter while moving:** ends Move and keeps the steps already taken.
   - **Clicking a cell mid-move:** opens "Add shift?" with Move still active, and an arrow key reorders behind the modal (G4).
6. **Top-bar title.** Every page in the owner nav has its h1 in the bar and no breadcrumbs. The title fits at 412 and 320 px with no horizontal page scroll; the longest board name available is "All departments". I could not test longer board names: boards can't be renamed without changing seed data.

## Put back (rule 4)

Final state check (`results/s99_final_state.log`):
- **Themes:** every persona I touched (`owner`, `brewer1`, `breweryMgr`, `barMgr`, `dualMgr`, `bartender1`, `floater`, `office1`) is on **Light**. Both tablets are **Light**; the Brewhouse tablet was reset as `owner` in Admin → Shared devices.
- **Staff order:** matches the order I recorded first (`results/staff_order_original.json`), restored after every Move test.
- **Daily ticks:** all of mine unticked; today's Brewery Daily is back to the seed's 1/4. The four Daily items themselves were not changed.
- **Test data deleted:** 6 test shifts, the test brand, recipe and batch. Zero `[TEST-TEMP]` shifts remain; brands and batches lists are empty, as before.
- **Throwaway people:** 3 created (`[TEST-TEMP] QA D43 tablet`, `… 2`, `… 3`, ids 1718–1720) and all **deactivated**.

**Could not put back:**
- **Messages read:** visiting /messages/all as `brewer1` and `owner` marked those channels read for them (the unread badge cleared). There is no unread control.
- **Notifications:** publishing the test shifts and creating users may have created notifications ("You've been scheduled", open shift) for Sam Pour, Alex Draft, Jake Brewer and Riley Wort, which can't be deleted. The shifts themselves were removed.

No credential outside the brief was needed. No tokens or passwords appear in the logs or screenshots.

---

## Recheck (pass 2)

- **Tester:** Claude (independent QA, automated)
- **Time:** 2026-10-16, about 00:30–00:57 UTC
- **Target:** DEV, API v41 / UI v39 (D43 fixes at `6259eb1`, as given in RECHECK.md). Fresh `auth/` files; DEV reseeded.
- **Method:** Same rules and setup as pass 1. Contrast is the WCAG ratio of the computed color (including opacity) against the effective background; each result was also checked in a screenshot. Scripts are `scripts/r01_*`–`r05_*`, logs `results/r0*.log`, screenshots `shots/r_*.png`.

### Result: **PASS**

All six items (G1–G5 and obs) are fixed. The Dark re-walk of banners, alerts and every nav page found nothing that got worse. One banner, the "Acting as" bar, could not be reached (see below).

### Gap recheck

| # | Result | Evidence |
|---|---|---|
| G1 | FIXED | In Dark, the bell-popover timestamps are `rgb(161,169,155)` at **5.1:1**; the ⚙ is white at **15.8:1**; the popover audit is clean. `shots/r_g1_bell_popover_dark.png` |
| G2 | FIXED | In Dark, all of these are white `#FFF`:<br>• board ‹ › and ⋮ **17.8:1**; Daily ⋮ 12.6:1<br>• phone hamburger 15.8:1 and "Days shown" 17.8:1 (emulated)<br>• Scheduler ‹ › week and every row ⋮ **15.8:1**<br>• Edit pencils on Settings → Grains and the ingredient **17.8:1**<br>• trash icons in Manage positions and Grains field rows 15.8:1<br>• password eye on the sign-in page (Dark, Match this device) and on Profile 15.8:1<br>The red Delete-ingredient icon is 4.8:1. `shots/r_g2_*.png`, `shots/r_g2_board_nav_zoom.png` |
| G3 | FIXED | Chip text now switches between black and white by contrast, the same in both themes:<br>• Brewer: black, 8.1:1<br>• Bar-mid: black, 8.8:1<br>• Event-offsite: black, 9.7:1<br>• Bar-open: white, 8.4:1<br>• Bar-close: white, 11.4:1<br>• Office and Sales: about 5.2–5.9:1<br>Done cards: "✓ name" is now full opacity (Light 5.1:1, Dark 5.3:1), and the initials are Light 5.7:1, Dark 7.3:1. `shots/r_g3_scheduler_light.png`, `shots/r_g2_scheduler_dark.png` |
| G4 | FIXED | Repeated the pass-1 repro: Move on Morgan Mash → click an empty cell. Move ends, "Add shift?" opens, and ↑ sends **no** `POST /api/roster/order`; the order is unchanged after reload. Variants:<br>• Department menu opened during Move: ↑↑ sends nothing<br>• clicking the top bar ends Move<br>• the ↑ button inside Move still works<br>Order restored. `results/r02_g4_g5.log` |
| G5 | FIXED | Offline → Theme Dark: stays or reverts to Light within 0.3 s, and the toast **"Couldn’t save your theme. Try again."** shows. Escape and a page click do not hide it; it disappeared between 5.8 s and 6.3 s after the click. The menu keeps ✓ Light and the server stays light. Stalled save (request never answered): Dark applies right away, then reverts to Light with the same message at **10.2 s**. In Dark the toast is a light snackbar with dark text, 15.5:1. `shots/r_g5_*.png`, `shots/r_toast_dark_phone.png` |
| obs | FIXED | `/activity` top-bar title and h1 read "User change log". |

### Banners and alerts in Dark

| Item | Result |
|---|---|
| Tablet personal-session banner ("Signed in as [TEST-TEMP] … returns to the shared screen after 5 minutes without activity.") | Readable: amber `rgb(255,183,77)` on brown `rgb(89,58,13)`, about **6:1** (from screenshot pixels). The header shows email + Sign out, and the screen returned to the tablet after 5:30. `shots/r_tablet_personal_session_dark.png` |
| "Sign in as me" screen on the Dark tablet | Audit clean. |
| Scheduler conflict banner | Text `rgb(255,226,183)` on `rgb(25,18,7)` **14.9:1**; icon 7.9:1. |
| Dialog alert (Notification preferences "Notifications are blocked…") | 14.9:1; icon 7.9:1. |
| Sign-in error alert ("Invalid credentials") | 12.7:1. |
| Redeem dialog on the Taproom tablet (Dark, staff-code field) | Audit clean. `shots/r_taproom_redeem_dialog_dark.png` |
| Toast | See G5 (15.5:1). On the phone it sits just above the DEV ribbon and is not covered by it. |
| DEV ribbon | White on orange, **3.8:1**: below 4.5:1, but it is bold, it has not changed since pass 1, and it only appears on DEV. Noted, not a gap. |
| **"Acting as" bar** | **NOT REACHED.** I gave a throwaway person a staff code and typed it into the Taproom tablet's Redeem dialog. The code is only a field there and no "Acting as" bar appeared. I cancelled without redeeming, so no data changed, and I found no other place that shows the bar. I'd like a pointer to where it appears so I can check it. |

### Quick S150 pass (Dark)

I walked every owner nav page (Home, Brewery/Taproom/All boards, View Schedule, Scheduler, Time off, Availability, Brewery dashboard, Brands, Ingredients, Batches, Settings, Buy-a-Beer, Users & Roles, Shared devices, User change log, both Messages channels, Profile) plus the Add shift, Add event, Templates, Positions, Redeem and Notification preferences dialogs. There were no light panels, low-contrast text or dim icons. (On Home the audit flagged the cards' hidden focus-highlight spans, which are invisible; the screenshot is clean.) Nothing got worse; the amber/orange accents now use MUI's dark warning colors. `shots/r_s150_dark_*.png`

### Put back (pass 2)

- **Themes:** `owner`, `brewer1`, `breweryMgr`, `barMgr`, `dualMgr`, `bartender1`, `floater` and `office1` are on **Light**. Both tablets are **Light**; they were set Dark as owner for the banner checks and reset in Admin → Shared devices.
- **Staff order:** matches what I recorded first (`results/staff_order_original_pass2.json`).
- **Throwaway person:** `[TEST-TEMP] QA D43 recheck` (id 1765, with a staff code) was **deactivated**.
- **No other data changed:** no shifts, brands, batches or Daily ticks were added; the Redeem dialog was cancelled.

**Could not undo:** creating the throwaway may have created notifications. No tokens, passwords or staff codes appear in logs or screenshots, and nothing asked for a credential outside the brief.

### Addendum: "Acting as" bar (Brewhouse tablet), 2026-10-16 about 01:15 UTC

This replaces the "NOT REACHED" row above. Method:
- Created a throwaway Brewery employee, `[TEST-TEMP] QA D43 acting` (id 1766), and gave them a staff code in Users & Roles; they set their own password first (rule 3).
- As owner, set the Brewhouse tablet to **Dark**.
- As `breweryDevice`, on Tasks (Brewery board), ticked today's Daily "Gravities".
- The tablet asked "Who's making this change? Your staff code … remembered for 5 minutes, until you tap Done" (Cancel / Continue); I entered the code.
- Unticked the item, pressed Done, then repeated the same steps with the tablet on **Light**.

Script `scripts/r06_acting_as.mjs`, log `results/r06_acting_as.log`.

| Theme | Bar | Text "Acting as [TEST-TEMP] · ends after 5 minutes without activity" | Done button | Result |
|---|---|---|---|---|
| Dark | `rgb(16,72,98)` (dark info), pinned to the top of the board | light blue `rgb(79,195,247)`, **4.9:1** | outlined, light blue text and border, **4.9:1** | PASS (just above 4.5:1) |
| Light | `rgb(3,169,244)` (MUI info) | white, **2.6:1** | grey filled, dark-blue text `rgb(1,87,155)`, **5.6:1** | **FAIL** on the text |

Screenshots: `shots/r_acting_as_{dark,light}.png`, `shots/r_acting_as_bar_{dark,light}.png`, prompt `shots/r_acting_prompt_*.png`.

Behaviour in both themes:
- The tick records "Gravities — [TEST-TEMP], 7:00p".
- Unticking during the same session did not ask for the code again.
- Done removes the bar.
- After a reload the Daily is back to its original 1/4.

**New gap:**

| # | Severity | Path → expected → observed → repro |
|---|---|---|
| G7 | minor | **"Acting as" bar text is low-contrast in Light.** Brewhouse tablet on Light → Brewery board → tick a Daily item → enter a staff code → expected: bar text readable (≥ 4.5:1, as for the other banners) → observed: white "Acting as <name> · ends after 5 minutes without activity" on `#03A9F4`, **2.6:1**. The Done button (5.6:1) and the Dark version (4.9:1) are fine. This is in Light, not Dark, so it may predate D43. |

**Recheck result (updated): PASS with gaps.** G1–G5 and obs stay FIXED; G7 (minor) is new.

**Put back:**
- Gravities unticked (today's Brewery Daily is back to 1/4) and Done pressed in both runs.
- Brewhouse tablet set back to **Light** as owner in Admin → Shared devices; the Taproom tablets were not touched and are Light.
- Throwaway `[TEST-TEMP] QA D43 acting` (id 1766) **deactivated**.

The staff code and passwords were never logged.

## Lead note (2026-10-15)

G7 filed as PortableMind **task 4298** (low); Matt accepted it for the
backlog rather than a D43 fix. G6 is by design (S147). All other gaps fixed
in `6259eb1` and confirmed in the recheck.
