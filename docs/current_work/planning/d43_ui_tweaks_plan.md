# D43: UI tweaks — Implementation Plan

**Spec:** `specs/d43_ui_tweaks_spec.md` (APPROVED 2026-10-15)
**Created:** 2026-10-15
**Branch:** `d43-ui-tweaks` from `develop` (one flat PR, per
`docs/process/three_environment_workflow.md`)
**Reference:** the prototype on local branch `local/theme-preview`
(`31e6fc0`, `2a7e54b`). Port from it; don't merge it. Never push it.

---

## Approach

Most of D43 already exists as prototype code. The build is mostly a port, with
three real pieces of new work:

1. **`color_mode`** replaces the prototype's localStorage picker: one column
   on `users`, resolved by the API, applied live by a theme root in the UI.
2. **The dark-mode sweep** (S150): every page and the main dialogs, fixing
   hard-coded light colors and the dim toggle buttons.
3. **Tests**: update the specs that use moved controls; add S143–S169.

### Where the theme comes from

- **Server.** `users.color_mode` is `"light" | "dark" | "device"`, default
  `"light"`, for people and device accounts alike. `/api/me` sends
  **`color_mode`** at the top level (beside `capabilities`, like
  `shared_devices`): the **device's** setting when the session is a personal
  sign-in on a tablet (`on_device_id` set), otherwise the user's own. So the
  UI never has to know which applies.
- **UI.** A `ThemeRoot` replaces the static `createTheme` in `main.tsx`. It
  reads `color_mode` from the `/api/me` query; `"device"` follows
  `useMediaQuery('(prefers-color-scheme: dark)')` live, no reload. Before
  `/api/me` answers (and on the sign-in page) it uses the last mode seen in
  this browser (`localStorage.rockcut_color_mode`, a per-browser cache only,
  try/catch), falling back to light. That avoids a light flash for dark users.
- Choosing a theme in the account menu calls the API, then updates the
  `/api/me` cache; the theme changes in place (no reload).

## Changes

### API (`rockcut_api`)

1. **Migration** `add_color_mode_to_users`: `color_mode :string, null:
   false, default: "light"`.
2. **`Accounts.User`**: `field :color_mode, :string, default: "light"`;
   `color_mode_changeset/2` validating inclusion in the three values; add
   `:color_mode` to `device_update_changeset`'s cast list (same validation).
3. **`PUT /api/me/color_mode`** `{color_mode}` → 200 `{color_mode}` / 422.
   People only: put it in the person-authenticated scope, **not**
   `device_allowed`. A personal session on a tablet may still set its own
   person's mode (it applies on their own devices, not the tablet). Add the
   route to `device_route_matrix_test.exs` as device-denied.
4. **`PATCH /api/devices/:id`** accepts `color_mode` (existing
   `:manage_device` check; nothing new in `Authz`).
5. **`/api/me`**: `MeController` passes `color_mode: effective_color_mode(user)`
   in the flags map; `JsonHelpers.me/3` defaults it to `"light"`. Effective =
   the device's when `user.on_device_id` is set (load the device's
   `color_mode`), else the user's. `JsonHelpers.device/1` also returns
   `color_mode` for the Shared devices list. The D31 parity suite pins
   `capabilities` keys only; `color_mode` sits beside it.
6. Changing color mode writes no change-log entry (it's a display
   preference, like notification prefs).

### UI (`rockcut-ui`)

Port from `local/theme-preview` file by file (`git checkout local/theme-preview
-- <path>` then edit), except the theme files:

1. **`src/theme.ts`** (new, replaces `ThemePreviewSwitch.tsx`): `lightTheme`
   and `darkTheme` options from the prototype (Hop Field, Hop Field Night,
   including the nav / account / menu icon greens and the board layers), the
   `TypeBackground` augmentation (`boardColumn`, `boardToday`, `boardCard`),
   and `ColorMode` type. The base typography/shape stays in one place.
2. **`src/ThemeRoot.tsx`** (new): resolves the mode as above, builds the
   theme with `useMemo`, wraps `ThemeProvider` + `CssBaseline`; sets
   `<meta name="theme-color">` to the top bar color for the mode.
3. **`main.tsx`**: use `ThemeRoot`; drop the prototype import.
4. **Account menu** (`App.tsx`): the prototype's Theme section, wired to
   `PUT /api/me/color_mode` (optimistic, revert + toast on error). The
   `themeMenuItems` helper moves into `App.tsx` or a small component.
5. **Shared devices** (`pages/devices/SharedDevices.tsx`): a Theme select
   (Light / Dark / Match this device) in the device edit form, sent with
   `PATCH /api/devices/:id`; shown in the list row.
6. **PWA** (`vite.config.ts`, `index.html`): manifest `theme_color`
   `#2F5A20` (Hop Field primary, used before the app loads) and
   `background_color` `#EEF2E8`. At runtime `ThemeRoot` sets the
   `theme-color` meta tag to the top bar's color (light `#FFFFFF`, dark
   `#1F241E`) so the browser's bar matches the app's.
7. **Ported as prototyped** (spec §1.3–§1.14): `components/PageTitle.tsx`,
   `PageHeader.tsx`, `App.tsx` (provider, slot, nav order, account menu,
   logo by mode), `pages/Login.tsx`, `pages/tasks/*` (board layers, switcher
   in the bar, `DailyCard`, `DayHeader`), `pages/schedule/Schedule.tsx`,
   `WeekGrid.tsx`, `ShiftFormDialog.tsx`,
   `components/NotificationPreferencesDialog.tsx`, `public/rockcut-logo.png`,
   `public/rockcut-logo-light.png`.
8. **Dark-mode sweep** (S150): with `owner` in Dark, every nav page plus Add
   shift, Add event, task edit / series dialogs, Daily items, History,
   Buy-a-Beer add / redeem / import, notification preferences, Templates,
   Positions, Users & Roles, Profile, Shared devices, Messages. Fix:
   - unselected `ToggleButton` text and disabled `IconButton`s (theme
     override: `MuiToggleButton` color `text.secondary` at full opacity);
   - any literal light color (`grep -rn "'#fff\|#ffffff\|'white'\|grey\.[1-3]00"
     src/`): move to theme tokens;
   - `warning.light` banners (personal-session banner, conflict banner):
     check contrast in dark.
   Take a screenshot per page in both modes; keep them for the PR.
9. **Small decisions left to the build** (spec): align the per-person hours
   label with the new totals ("8 hr · 8 hr draft"); give the Scheduler's
   Position filter the §1.13 treatment if it groups positions.

## Tests

**API (ExUnit)**
- `users.color_mode` default `"light"`; invalid value → 422.
- `PUT /api/me/color_mode`: person 200 and persisted; device token denied
  (matrix); unauthenticated 401.
- `PATCH /api/devices/:id` with `color_mode`: brewery manager 200,
  `bartender1` 403 (S149).
- `/api/me` `color_mode`: person's own; device's; personal session on a
  device returns the **device's** (S148).

**Playwright** (new specs under `tests/regression/ui/`, one per area)
- Theme: S143–S147 (S145 via a second context with the same persona), S148
  (personal sign-in on `breweryDevice`), S169 (`colorScheme: 'dark'`).
- Layout: S152–S155. Schedule: S156–S162. Boards: S151, S163, S164,
  S167, S168. Prefs: S165. Position menu: S166.
- S150 is a manual walk with screenshots, not a spec.

**Updates to existing specs**
- Open the account menu before `logout-button` / `profile-link`:
  `auth/session_revocation`, `devices/personal_signin`,
  `devices/personal_signin_revoke`, `auth/offline_logout` (and any other
  hit from `grep -rn "logout-button\|profile-link\|profile-icon" tests`).
- `add-event` / Add shift only on `/scheduler`: `scheduler/add_dialog_week`,
  `events_visibility`, `events_recurring` (check each `goto`).
- `board-title` now lives in the top bar (same test id; scope any
  `getByTestId('task-board').getByTestId('board-title')` to the page).
- `task-board-daily.spec.ts:49` (today's Daily open) and the header specs:
  confirm with the seeded data.

## Order of work

1. Branch `d43-ui-tweaks` from `develop`; API: migration, schema,
   endpoints, `/api/me`, ExUnit tests. `mix test` green.
2. UI: `theme.ts` + `ThemeRoot`, account menu and Shared devices wired to
   the API; remove the prototype switch.
3. Port §1.3–§1.14 from the prototype; typecheck and lint.
4. Dark-mode sweep with screenshots; fixes.
5. Update existing specs; write the new ones; full local Playwright run.
6. Local gate → claim DEV (discussion 80) → deploy, reseed, full Playwright
   on DEV → independent QA pass → Matt on the Pixel and a taproom tablet in
   both modes.

## Risks

- **A screen missed in the sweep** shows unreadable text in dark mode. The
  default is Light, so only people who choose Dark see it; the S150 walk and
  QA's independent pass cover the rest.
- **Personal sign-in on a tablet** must keep the tablet's mode; the effective
  mode lives in the API, so the UI can't get it wrong, but S148 is the check.
- **Test churn** from moved controls (Logout, Add shift); the grep lists above
  are the starting point, the full DEV run the backstop.
- **`:has()` CSS** (phone logo swap) needs Chrome 105+: fine for the Samsung
  tablets and the Pixel; older browsers just keep showing the logo.

## LIMITATIONS to carry to DEV

- Email and SMS are hidden, not removed; turning real email on later needs
  the column back (spec §1.12).
- PWA icons and favicon unchanged.
