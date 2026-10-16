# D45: "New version available" prompt + View Schedule default range — Spec

**Status:** APPROVED (Matt, 2026-10-15)
**Backlog:** task 4054 (item 1)
**Concept:** 02_scaffold_ui
**Follows:** `v2026.10.15` (D43)

---

## 1. What changes

| # | Item | Source | Where |
|---|---|---|---|
| 1 | When a new build is deployed, the running app shows a small **"New version available · Reload"** prompt; Reload loads the new build | Task 4054 (Matt, 2026-10-02) | UI, service worker |
| 2 | **View Schedule** opens on **today through six days later** (7 days) instead of every shift since the first published | Matt, 2026-10-15 (a D43 follow-up) | UI, `schedule/Schedule.tsx` |

No API change, migration, secret or dependency (item 1 uses `vite-plugin-pwa`'s
`virtual:pwa-register`, already installed).

## 2. Today

- The service worker (`src/sw.ts`) calls `skipWaiting()` and `clientsClaim()`
  (`registerType: 'autoUpdate'`): a new worker takes over at once, but an
  open page keeps running the old JavaScript until it reloads. Installed apps
  and the always-on taproom/brewhouse tablets can run an old build for days
  after a release (they did after `v2026.10.15`).
- The browser checks for a new worker only on navigation, and at most about
  once a day for a page that never navigates.
- View Schedule's From / To start empty, so the agenda lists every shift and
  event from the first published one onward.

## 3. Behavior

### 3.1 The prompt (item 1)

- **Detection:** switch to prompt mode (`registerType: 'prompt'`; the worker
  no longer calls `skipWaiting()` on install). A new worker that installs
  waits, and the app is told (`onNeedRefresh`). The app also asks the browser
  to check for an update **when the page comes back into view** and **once a
  day** while open (Q2), so a tablet that never navigates still finds
  out.
- **The prompt:** a small bar at the bottom: "New version available" and a
  **Reload** button (plus × to dismiss for now). It never blocks the page,
  so a half-filled form isn't lost. Dismissed, it comes back on the next
  check (or the next page view).
- **Reload:** tells the waiting worker to take over, then reloads the page.
- **Shared tablets** (Q1, decided): a tablet on its **shared screen** (no
  one signed in with "Sign in as me", no "Acting as" window, no dialog open)
  reloads **by itself** after a short delay, so the bar staff never have to;
  while a person is signed in, acting, or has a dialog open, it shows the
  prompt like everyone else and waits.
- Push notifications, the precache and the SPA fallback keep working as now.
- **First rollout:** devices running `v2026.10.15` or older have no prompt
  code, and D45's worker waits instead of taking over, so each device needs
  **one** reload (or closing and reopening the app) to get D45. After that,
  every release announces itself. The release note in conv 80 says so, and
  someone reloads the two tablets.

### 3.2 View Schedule default (item 2)

- **From** = today (Colorado), **To** = today + 6, when the page opens.
- The person can change or clear either date as now; clearing both shows
  everything, as today.
- Applies everywhere View Schedule shows, including shared tablets and
  phones. The Scheduler (week grid) is unchanged.
- Q3 (decided): a changed range is not remembered; every visit reopens on
  today + 6.

## 4. Decisions

- **Q1.** Shared tablets **reload by themselves** when idle on the shared
  screen; with a person signed in, acting, or a dialog open they show the
  prompt and wait (Matt, 2026-10-15).
- **Q2.** An open app checks **once a day**, plus whenever the page comes
  back into view (Matt, 2026-10-15).
- **Q3.** View Schedule **always reopens on today + 6** (Matt, 2026-10-15).

## 5. Testing notes

The prompt needs the service worker, so it can't be tested on the dev server
(:5174, SW disabled): test with `vite preview` (:4173) by building twice, and
on DEV (deploy, open, deploy again). Playwright can drive two builds against
`vite preview`. Matt checks on the Pixel and a taproom tablet after a DEV
redeploy.


## 6. Scenarios

"Build A" is what the device is running; "build B" is a newer deploy.

| # | Persona | Path | Expected |
|---|---|---|---|
| S170 | `brewer1` (phone, installed app) | app open on build A; deploy B; bring the app back into view | "New version available · Reload" bar at the bottom within seconds; the page still works underneath |
| S171 | `brewer1` | S170, tap **Reload** | Page reloads into build B; the bar is gone; still signed in |
| S172 | `brewer1` | S170, tap **×** | Bar hides; it comes back on the next check or the next page view |
| S173 | `breweryMgr` | half-filled Add task dialog when build B lands | The bar shows; the dialog and its text stay until the person chooses to reload |
| S174 | `taproomDevice` | idle on the shared screen, page never leaves view; deploy B | Within a day (simulated with Playwright's clock) the tablet reloads itself into B, no tap needed |
| S175 | `taproomDevice` | screen wakes (page comes back into view) after B | Checks at once; reloads by itself if idle on the shared screen |
| S176 | `taproomDevice` | a person signed in with "Sign in as me" when B lands | Prompt shows; no automatic reload; after the person signs out and the tablet is idle, it reloads by itself |
| S177 | `breweryDevice` | "Acting as" window open, or a dialog open (staff-code, task) when B lands | No automatic reload until the window ends / the dialog closes |
| S178 | `brewer1` | push notification after Reload into B | Push still arrives; tapping it opens the right page (D21 unchanged) |
| S179 | `brewer1` | View Schedule | From = today, To = today + 6 (Colorado); only those days listed |
| S180 | `brewer1` | change To to a month out; leave and come back | Reopens on today + 6 |
| S181 | `brewer1` | clear From and To | Everything from the first published shift, as before |
| S182 | `taproomDevice` | View Schedule | Same 7-day default |
| S183 | `owner` | Scheduler | Unchanged (week grid) |

## 7. Acceptance criteria

- [ ] Prompt mode: a new worker waits; the app shows the bar; Reload
      activates it and reloads (S170–S172).
- [ ] Checks for an update when the page comes back into view and once a
      day while open (S174, S175).
- [ ] Shared tablets reload by themselves only when idle on the shared
      screen (no personal sign-in, no "Acting as", no dialog) (S174–S177).
- [ ] Nothing forces a reload over a person's open form (S173).
- [ ] Push, precache and SPA fallback unchanged (S178; D19/D21 specs green).
- [ ] View Schedule defaults to today + 6, not remembered; clearing shows
      everything (S179–S182); Scheduler unchanged (S183).
- [ ] Tested against `vite preview` with two builds and on DEV with two
      deploys; Matt checks the Pixel and a taproom tablet.

## 8. Out of scope

Release notes in the prompt, forcing old clients to update, task 4053's
error-boundary reload button (may share the component later), any API
version check.
