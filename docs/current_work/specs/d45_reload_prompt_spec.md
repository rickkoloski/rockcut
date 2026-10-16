# D45: "New version available" prompt + View Schedule default range — Spec

**Status:** DRAFT (Matt, 2026-10-15)
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
  to check for an update **when the page comes back into view** and **every
  N minutes** while open (Q2), so a tablet that never navigates still finds
  out.
- **The prompt:** a small bar at the bottom: "New version available" and a
  **Reload** button (plus × to dismiss for now). It never blocks the page,
  so a half-filled form isn't lost. Dismissed, it comes back on the next
  check (or the next page view).
- **Reload:** tells the waiting worker to take over, then reloads the page.
- **Shared tablets** (Q1): proposal: a tablet on its **shared screen** (no
  one signed in with "Sign in as me", no "Acting as" window, no dialog open)
  reloads **by itself** after a short delay, so the bar staff never have to;
  while a person is signed in, acting, or has a dialog open, it shows the
  prompt like everyone else and waits.
- Push notifications, the precache and the SPA fallback keep working as now.

### 3.2 View Schedule default (item 2)

- **From** = today (Colorado), **To** = today + 6, when the page opens.
- The person can change or clear either date as now; clearing both shows
  everything, as today.
- Applies everywhere View Schedule shows, including shared tablets and
  phones. The Scheduler (week grid) is unchanged.
- Q3: remember a changed range for the session, or always reopen on the
  7 days? Proposal: always reopen on the 7 days.

## 4. Open questions

- **Q1.** Shared tablets: reload by themselves when idle on the shared
  screen (proposal), or always show the prompt like a person's device?
- **Q2.** How often an open app checks for a new version: proposal **every
  15 minutes**, plus whenever the page comes back into view.
- **Q3.** View Schedule: always reopen on today + 6 (proposal), or remember
  a changed range?

## 5. Testing notes

The prompt needs the service worker, so it can't be tested on the dev server
(:5174, SW disabled): test with `vite preview` (:4173) by building twice, and
on DEV (deploy, open, deploy again). Playwright can drive two builds against
`vite preview`. Matt checks on the Pixel and a taproom tablet after a DEV
redeploy.

Scenarios and acceptance criteria follow once Q1–Q3 are settled.
