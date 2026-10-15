# D43: UI tweaks — Spec

**Status:** APPROVED (Matt, 2026-10-15). Scope closed at items 1–14; scenarios S143–S169. Next: planning.
**Backlog:** none yet
**Concept:** 02_scaffold_ui
**Prototype:** local branch `local/theme-preview` (not pushed); comparison
page https://claude.ai/artifact/PDcDf5SPGwDdYmGSRWXk1E, screenshots
https://claude.ai/artifact/Drfanx5MKm3QGr32ffCcUG

---

## Scope rule

D43 is **look and feel only**: colors, theme, contrast, spacing, layout
polish, wording on screen. It belongs here when it changes how existing
screens look or read.

It does **not** belong here when it needs any of:

- an API, database or migration change (beyond, at most, storing one
  per-user display preference);
- new behavior or a new feature (for example task 4054's "new version
  available" prompt, 4055 events in calendar feeds, 4056 company-wide events);
- a change to permissions, notifications or data.

Items that fail the rule go to the backlog or their own deliverable.

## 1. Items

| # | Item | Source | Where |
|---|---|---|---|
| 1 | **Hop Field** replaces Brown & Amber as the app's color scheme | Matt, 2026-10-14 | UI theme |
| 2 | **Hop Field Night** dark mode | Matt, 2026-10-14 | UI theme |
| 3 | Task boards: columns and lists get their own color, separate from the page and the cards | Matt, 2026-10-14 | UI, `pages/tasks/` |
| 4 | Logo: black-only main logo (white parts made clear), plus a pale green version for dark mode | Matt, 2026-10-14 | UI, `public/` |
| 5 | Nav: **Tasks** moves up beside Home, above Schedule, so the plain links sit together above the expandable headings | Matt, 2026-10-14 | UI, `App.tsx` |
| 6 | Page title moves into the top bar; breadcrumbs become a "‹ Parent" link on detail pages | Matt, 2026-10-14 | UI, `PageHeader`, `PageTitle`, boards |
| 7 | Account menu: email, Profile and Log out behind one account icon | Matt, 2026-10-14 | UI, `App.tsx` |
| 8 | Schedule buttons: View Schedule drops Templates, Positions, Add event, Add shift; Calendar sync moves into its filter box (after Open only) for everyone; the Scheduler drops Calendar sync | Matt, 2026-10-14 | UI, `schedule/Schedule.tsx` |
| 9 | Scheduler: week totals under **Staff** (Scheduled = published hours, Draft = draft hours) | Matt, 2026-10-14 | UI, `schedule/WeekGrid.tsx` |
| 10 | Scheduler: reorder arrows hidden; **Move** in a row's ⋮ menu starts a move mode (↑ ↓ or arrow keys; Enter, Esc or **Finished** ends it) | Matt, 2026-10-14 | UI, `schedule/WeekGrid.tsx` |
| 11 | Task boards: a Daily card with every item ticked looks finished (dimmed, "Daily 4/4" struck through) and starts closed | Matt, 2026-10-14 | UI, `tasks/DailyCard.tsx` |
| 12 | Notification preferences show only **In-app** and **Push** (Email and SMS hidden) | Matt, 2026-10-15 | UI, `NotificationPreferencesDialog.tsx` |
| 13 | Add/Edit shift → Position menu: department headings read as headings; positions indented with their shift color | Matt, 2026-10-15 | UI, `schedule/ShiftFormDialog.tsx` |
| 14 | Task board day header: shifts in start-time order (people by first shift, open shifts mixed in) | Matt, 2026-10-15 | UI, `tasks/DayHeader.tsx` |

### 1.1 Hop Field (item 1)

Prototype values (`ThemePreviewSwitch.tsx`): primary `#2F5A20`, secondary
`#C99A2E`, page `#EEF2E8`, paper `#FFFFFF`, text `#172014`, nav `#E6ECDD`.
Department and position colors don't change (they are per-department
settings). Also update the PWA `theme_color` (`vite.config.ts`,
`index.html`, now `#5C4033`) and `background_color` (`#FAF6F0`).

### 1.2 Hop Field Night (item 2)

Prototype values: primary `#8DBF6A` (dark text on it), secondary `#D3A640`,
page `#151915`, paper `#1F241E`, nav `#2B3428` with a `#4A5745` edge and a
shadow, divider `#333B30`, text `#E6E9E2` / `#A1A99B`. Nav icons in the
primary green `#8DBF6A`, like the logo and the Home page icons (Matt,
2026-10-15); nav text stays light. The same green for the account icon in
the top bar and for icons in menus (the account menu's Profile and Log out,
and any other menu with icons).

Known fixes before it ships:

- ~~the logo is black artwork~~ done in the prototype (item 4);
- unselected toggle buttons and disabled arrows are too dim;
- check every screen for hard-coded light colors (none found on the screens
  shot so far).

**Who gets it (Q1, Matt 2026-10-14):** it follows the **person**, and each
**shared tablet** has its own setting. One stored setting, `color_mode`, on
`users` covers both, since tablets are `users.kind` device accounts. This is
the one API/database change the scope rule allows (one migration, one
column, read in `/api/me`, written by the person or, for a tablet, by a
manager). Choices, default and where it's set: Q3–Q5 (decided).

### 1.3 Board layers (item 3)

New theme colors `background.boardColumn`, `boardToday`, `boardCard`, used by
the day columns, Unfinished, Future, the All-departments board, task cards
and the Daily card (prototyped in all three themes).

### 1.4 Logo (item 4)

`public/rockcut-logo.png` becomes black on clear: every pixel keeps its
shape, with alpha = original alpha × darkness, so white is fully clear and
anti-aliased edges stay smooth. `public/rockcut-logo-light.png` is the same
shape in Hop Field Night's primary green `#8DBF6A`, the color of the
Home page icons (Matt, 2026-10-14); if the dark primary changes, regenerate
it. The nav, the phone header and the sign-in page pick by theme mode. Prototyped (made in Chromium's canvas; no image tools needed). The PWA
icons (`pwa-*.png`, `maskable-512x512.png`, `apple-touch-icon.png`,
favicon) are unchanged unless Matt asks.

### 1.5 Nav order (item 5)

Desktop nav, rail and phone drawer: Home, **Tasks**, Schedule, the
department headings, Admin, Messages. Tasks still shows only when the person
(or tablet) has a board. Prototyped. No Playwright spec checks the nav order
(checked `tests/`); the full DEV run will confirm.

### 1.6 Title in the top bar (item 6)

`components/PageTitle.tsx`: the top bar holds an empty slot and each page
portals its title (an `h1`, so role-based tests still find it) into it.
`PageHeader` (19 pages) does this for every page that uses it: the title
goes up, top-level pages lose their breadcrumbs, and a detail page shows one
"‹ Parent" link (the last crumb that links somewhere other than Home). A
page's buttons stay on the page, right-aligned in a row of their own. The
task boards (`TaskBoard`, `AllBoard`) put the board switcher (dot, name, ▾)
in the slot on every screen size; it used to sit above the toolbar on
desktop and inside it on phones. At phone width the title replaces the small
logo in the bar (CSS `:has`, so pages without a title keep the logo). Home
keeps its own "Welcome back" heading. Saves about 70 px on most pages.
Prototyped.

Watch in the build:

- Pages whose only header content is icon buttons (e.g. a category's edit
  and delete) now spend a row on them; consider moving those into the top
  bar too.
- ~~The Scheduler's actions wrap to two lines at 1366 px~~ fixed by §1.8.

### 1.7 Account menu (item 7)

People: one account icon at the right of the bar opens a menu with their
name, email (and "Owner"), **Profile**, **Theme** (Light / Dark / Match this
device, see Q4) and **Log out**. It replaces the
email link, the phone-only profile icon and the Logout button. Test ids
keep their meaning (`profile-link`, `logout-button` are now menu items;
`account-menu` opens it), so specs that click `logout-button` must open the
menu first (`session_revocation`, `personal_signin`,
`personal_signin_revoke`, `offline_logout`). A person signed in on a shared
tablet keeps a visible **Sign out** button and their email, so the next
person never has to look for it. Shared-device headers don't change.
Prototyped.

### 1.8 Schedule buttons (item 8)

- **View Schedule** (`/schedule`, everyone): no header buttons at all.
  **Calendar sync** is the last thing in the filter box, after Open only
  (still hidden on shared tablets, DEV G6). Managers set up the schedule in
  the Scheduler.
- **Scheduler** (`/scheduler`, managers and owners): Publish week, Copy last
  week, Delete week, Templates, Positions, Add event, Add shift. No Calendar
  sync. The row now fits on one line at 1366 px (resolves the 1.6 note).
- Specs that click `add-event` or Add shift must do so on `/scheduler`; the
  Calendar sync specs open it from `/schedule` (`?calendar_sync=1` still
  works). Check in the full run.

Prototyped.

### 1.9 Week totals (item 9)

The grid's top-left cell reads "Staff", then "Scheduled N hr" (published)
and "Draft N hr" (drafts only). Summed from the shifts the grid already
loads: the week on screen, open shifts included, following the Department,
Position, My shifts and Open only filters (a tooltip says so). No API. Note
the per-person label reads differently ("8 hr / 16 hr draft" = published /
published + draft); decide in the build whether to align them. Prototyped.

### 1.10 Move mode for the staff order (item 10)

Amends D15 (always-visible ↑ ↓) and D27 (arrows beside the name). Each row
shows only its name and ⋮; names get the room the arrows took. ⋮ → **Move**
(first item, above Publish / Delete this week's shifts) highlights that row
and shows ↑ ↓ and a **Finished** button under the name; every other row's ⋮
hides until the move ends. The ↑ / ↓ keys move the row too; **Enter** or
**Esc** ends the mode, as does Finished. Each step saves through the same
reorder call as before (no API change; still managers and owners only), so
there is nothing to cancel. The row scrolls into view as it moves.
Prototyped and checked in the browser (moved a row up with the keyboard,
Enter; moved it back with the button, Finished). No Playwright spec covers
the Scheduler's reorder today (only the task boards' Move up / Move down);
add one in the build.

### 1.11 Finished Daily card (item 11)

Amends D38 §3.8 ("expanded on today"). When `done == total` (and total > 0)
the card gets the finished-task look: opacity 0.65 like a done `TaskCard`,
and "Daily 4/4" struck through. It starts **closed**, today included; an
unfinished today card still starts open, other days closed as before.
Clicking the header still opens it (to see who ticked what, or untick).
Ticking the last item doesn't snap it shut; it's closed on the next load.
`data-complete` on the card for tests. `task-board-daily.spec.ts:49`
expects today's card open: still true while today is unfinished (seeded),
but check it. Prototyped.

### 1.12 Notification channels (item 12)

The preferences table has two columns, In-app and Push; the "SMS is coming
soon" line goes. UI only: the channels stay in the code (`hidden: true`) and
people's stored email preferences are kept. Nothing changes in delivery:
prod email has been a no-op (`MailerNoop`, D28) and SMS was never built.

**When real email arrives** (a mail provider replaces `MailerNoop`), email
defaults to **on** for most events in `Notifications` (`@default_on`), and
nobody could see or turn it off. That deliverable must show the column
again (or flip the default) before it switches the provider on.

Prototyped.

### 1.13 Position menu (item 13)

In the shift dialog's Position menu, each department heading is small
uppercase letter-spaced text with the department's color **dot**, on a
tinted band (`background.boardColumn`) with a divider above it. Positions
are indented further and each has a small rounded **square** in the color
its shifts get in the week grid (`shiftColor`, the D27 shade), so the two
levels differ in weight, case, indent, background and marker shape, not just
color. Checked in both themes. Same treatment is a candidate for the
Scheduler's Position filter and the Positions / Templates dialogs if they
group positions the same way (check in the build).

### 1.14 Day header order (item 14)

Amends D38 §3.2 ("ordering follows the Scheduler's roster order", open
shifts after the people). The header lists people and open shifts together
by start time: a person by their earliest shift that day, an open shift by
its own start. Ties keep roster order (the order the API sends). Events stay
last. A person's own shifts were already in time order. Done in the UI
(`DayHeader`), so no API change. Applies on every board and screen size
(they share `DayHeader`). Checked on the Taproom board: Tue 10/13 now Sam
Pour 8a before Jordan Float 12p (roster had Jordan first); Sat 10/17 the
open 12p shift before Alex Draft 5p (open shifts used to come last).
`task-board-header.spec.ts` checks line text, not order; add an order check
in the build.

## Moved out

- **Time off in the Scheduler opens a dialog** (approved: details; pending:
  request, notes, Approve / Deny): new behavior, so it is **D44**
  (`specs/d44_scheduler_time_off_dialogs_spec.md`, Matt 2026-10-14).

## 2. Open questions

- ~~Q1. How does someone get dark mode?~~ Per person, plus a per-tablet
  setting (Matt, 2026-10-14). See 1.2.
- ~~Q2. Light logo~~ Made from the PNG (Matt, 2026-10-14). See 1.4.
- ~~Q3. Choices~~ **Light / Dark / Match this device**; default **Light** for
  everyone (Matt agreed, 2026-10-14).
- ~~Q4. Where a person sets it~~ **The account menu** (top right): a
  "Theme" section with Light / Dark / Match this device, a check on the
  current one, between Profile and Log out (Matt, 2026-10-15; replaces "Profile
  page, plus possibly a header toggle"). Prototyped with the choice kept in the
  browser; the build saves it on the user so it follows them. A person signed
  in on a shared tablet has no account menu (the tablet's setting applies).
- ~~Q5. Tablets~~ A manager sets it in **Admin → Shared devices**; "Sign in
  as me" on a tablet keeps the tablet's setting (Matt agreed, 2026-10-14).

## 3. Scenarios

Desktop is 1366×860, tablet 1280×800 (landscape, Samsung / Chrome PWA), phone
412×915 (Pixel). "Light" is Hop Field, "Dark" is Hop Field Night.

| # | Persona | Path | Expected |
|---|---|---|---|
| S143 | `brewer1` (no setting saved) | sign in, any page | Light: hop green buttons, pale green page, sage nav, black logo; nothing asks to choose |
| S144 | `brewer1` | account menu → Theme → Dark | Page reloads dark: green logo, green nav / account / menu icons, lifted nav panel; ✓ on Dark |
| S145 | `brewer1` | after S144, sign in on another browser | Dark there too (the setting is on the person) |
| S146 | `brewer1` | Theme → Match this device, browser set to dark, then to light | Follows the browser: dark, then light |
| S147 | `breweryMgr` | Admin → Shared devices → Brewhouse tablet → Dark | Saved; `breweryDevice` shows dark on its next load |
| S148 | `breweryDevice` (Dark) | `brewer1` uses "Sign in as me" (brewer1 is Light) | Stays dark; brewer1's header shows email + visible **Sign out**, no account menu |
| S149 | `bartender1` | Shared devices page, API `PATCH` of a device's setting | Not available / 403 (managers and owners only, as other device edits) |
| S150 | `owner` (Dark) | walk every page in the nav, plus dialogs (Add shift, Add event, task edit, Buy-a-Beer redeem, notification preferences, Templates, Positions) | No white panels, unreadable text or near-invisible controls; unselected toggle buttons readable |
| S151 | `owner` (Light, then Dark) | Brewery board | Page, columns (and today's column) and cards are three distinct shades in both |
| S152 | `brewer1` | Home, desktop and phone | Nav order Home, **Tasks**, Schedule, …; phone drawer the same |
| S153 | `owner` | Brewery board, Scheduler, Settings → a category | Title in the top bar (h1); board switcher (dot, name, ▾) in the bar; "‹ Settings" back link on the category; no breadcrumbs |
| S154 | `brewer1` at 412×915 | Brewery board, Schedule | Title replaces the small logo in the bar; Home (no title) keeps the logo |
| S155 | `owner` | account icon | Menu: name, email · Owner, Profile, Theme (3), Log out; Profile opens `/profile`; Log out signs out |
| S156 | `brewer1` | View Schedule | No header buttons; **Calendar sync** after Open only opens the dialog |
| S157 | `breweryMgr` | View Schedule; Scheduler | View Schedule: no Templates / Positions / Add event / Add shift. Scheduler: those plus Publish / Copy / Delete week; no Calendar sync |
| S158 | `taproomDevice` | View Schedule | No Calendar sync (DEV G6 unchanged) |
| S159 | `owner` | Scheduler; then Department = Brewery | Under Staff: "Scheduled N hr" and "Draft N hr" match the sum of the rows; filtering changes both |
| S160 | `owner` | Scheduler row ⋮ → Move; ↑ twice; Enter | Row highlighted with ↑ ↓ Finished; moves up two; other ⋮ hidden while moving; order saved (reload keeps it) |
| S161 | `owner` | Move; ↓ button; **Finished**; then Move, Esc | Moves down; Finished and Esc both end the mode |
| S162 | `brewer1` | Scheduler | No ⋮ and no arrows (not a manager; unchanged access) |
| S163 | `brewer1` | today's Daily, tick every item; reload | Before reload: open, "Daily 4/4" struck and dimmed. After: closed, struck, dimmed |
| S164 | `brewer1` | a day with Daily 2/4 | Normal look; today open, other days closed (D38) |
| S165 | `brewer1` | notification preferences | Columns In-app and Push only; no "SMS is coming soon" |
| S166 | `owner` | Scheduler → Add shift → Position | Department headings: caps, color dot, tinted band; positions indented with a square in their shift color; both themes |
| S167 | `floater` | Taproom board, a day with 8a, 12p and an open 10a shift | Lines in time order: 8a, open 10a, 12p |
| S168 | `breweryMgr` | a brewer with 7a and 3p shifts, another at 11a | First brewer's line (both shifts) first, then the 11a brewer |
| S169 | anyone | sign-in page in Dark (Match this device, dark browser) | Green logo on the dark page |

S101–S142 (task boards, D38–D42) stay green, with the test-id moves noted in
§1.7 and §1.8.

## 4. Acceptance criteria

- [ ] Hop Field is the light theme everywhere; PWA `theme_color` and
      `background_color` match it (§1.1).
- [ ] Hop Field Night: nav, logo, icons as §1.2; toggle buttons and disabled
      controls readable; S150 walk finds nothing unreadable.
- [ ] `users.color_mode` (`light` | `dark` | `device`, default `light`):
      one migration, returned in `/api/me`, set by the person (account
      menu) and, for a device account, by a manager or owner (Shared
      devices). The only API change in D43.
- [ ] A shared tablet uses its own setting, including while someone is
      signed in with "Sign in as me".
- [ ] Board layer colors in every theme (§1.3).
- [ ] Logos: black-on-clear main, green dark version; nav, phone bar and
      sign-in page pick by mode (§1.4).
- [ ] Nav order (§1.5); title in the top bar and back links (§1.6); account
      menu (§1.7).
- [ ] Schedule buttons (§1.8); week totals (§1.9); move mode with keyboard
      and Finished (§1.10).
- [ ] Finished Daily card (§1.11); two notification columns (§1.12);
      position menu (§1.13); header order (§1.14).
- [ ] The prototype's `ThemePreviewSwitch.tsx` and its localStorage key are
      gone; the theme comes from `color_mode`.
- [ ] Specs updated for moved controls (Logout in the menu; Add shift / Add
      event on `/scheduler`) and new ones for S143–S169; full suite green
      locally and on DEV.
- [ ] Checked by hand on the Pixel and a taproom tablet in both modes.

## 5. Out of scope

D44 (time off from the Scheduler), D45 / task 4054 (reload prompt), email or
SMS delivery, the PWA icons and favicon, changing department or position
colors, and restyling pages beyond what the dark-mode sweep needs to stay
readable.
