# D19: PWA — Installable App Shell + Mobile Baseline — Specification

**Status:** Complete (2026-09-22) — see `stepwise_results/d19_pwa_installable_COMPLETE.md`
**Created:** 2026-09-22
**Author:** Matt + CC
**Depends On:** D5 (Scaffold UI), D10–D18 (Scheduler feature set)

---

## 1. Problem Statement

Get the app onto employees' phones **without app-store or developer-account
friction**. The chosen distribution path is a **PWA** (installed from the browser,
no Apple Developer Program, no Android sideloading/verification, no review — see
§7). D19 does only the cheap, one-time, additive part of that path — **"bucket 1"**
from the sequencing discussion:

1. Make the existing React SPA an **installable PWA** (manifest + service worker +
   icons + an install affordance).
2. Establish a **mobile-responsive baseline** so the app is *usable* at phone
   width and new features are built responsive-from-the-start.

D19 deliberately does **not** redesign the desktop-bound screens for touch (the
weekly grid + drag-and-drop → agenda/day view) and does **not** add native/push
capabilities. Those are separate, later deliverables done when the feature set is
stable (see §5). This keeps one codebase — the PWA *is* the web app plus a
manifest, a service worker, and responsive layouts; there is no second app to
maintain.

**Why now:** the plumbing is ~half a session, purely additive, and lets Matt
**dogfood every subsequent feature on a real phone** instead of discovering
mobile problems at launch.

---

## 2. Requirements

### Functional

- [ ] **Installable** on Android (Chrome shows an install prompt / WebAPK) and iOS
      (Safari → Share → Add to Home Screen), launching **standalone** (no browser
      chrome), with the Rockcut name, icon, and theme color.
- [ ] **Web app manifest**: `name`/`short_name`, `start_url`, `display:
      standalone`, `theme_color`, `background_color`, and icon set (incl. a
      **maskable** icon and Apple touch icon).
- [ ] **Service worker** that precaches the built app shell so the app opens fast
      and survives a flaky connection, and **auto-updates** when a new build
      deploys (a new version activates without the user reinstalling).
- [ ] **Install affordance in-app**: on Android, an "Install app" action wired to
      the `beforeinstallprompt` event; on iOS (no prompt exists), a short
      **"Add to Home Screen" instructions** helper. Both discoverable but
      unobtrusive (e.g. a one-time hint / a settings entry).
- [ ] **Mobile-responsive baseline**: every *currently shipped* screen is
      **usable** (no horizontal scroll, tappable controls, nav reachable) at
      360 px width — **except** the weekly grid, which stays as-is on mobile for
      now (§5). App bar / navigation collapses appropriately on narrow viewports.

### Non-Functional

- [ ] Uses **`vite-plugin-pwa`** (Workbox) with the existing Vite 7 config; must
      not break the `datagrid-extended` dev/Docker resolution or the `/api` proxy.
- [ ] Service worker is **HTTPS-only** in prod (Fly provides TLS); disabled or
      dev-safe in local dev so it doesn't cache-trap the dev server.
- [ ] **No API-response caching** by the service worker in D19 — schedule data is
      dynamic and authed; stale shifts are worse than a spinner. React Query keeps
      handling in-memory data caching. (Offline data/mutations are out of scope.)
- [ ] Passes browser **installability** checks (Chrome DevTools "Installable";
      Lighthouse PWA installable criteria).
- [ ] `vite build` + `tsc --noEmit -p tsconfig.app.json` + ESLint clean; existing
      ExUnit suite still **141 passing** (backend untouched).

---

## 3. Design

### Build / config (`rockcut-ui`)

- Add `vite-plugin-pwa` to `vite.config.ts` alongside `react()`, leaving the
  existing `resolve`/`server`/`proxy` blocks intact.
  - `registerType: 'autoUpdate'` (simple update story; SPA reloads to the new SW).
  - `workbox`: precache the build manifest (app shell + static assets). **No**
    runtime caching route for `/api`.
  - `devOptions.enabled: false` (avoid SW caching during `pnpm dev`).
  - `manifest`: see below.

### Manifest

```
name:             "Rockcut Scheduler"
short_name:       "Rockcut"
start_url:        "/"
display:          "standalone"
theme_color:      <brand primary>       # match MUI theme
background_color: <app background>
icons:            192, 512 (any) + 512 maskable   # from public/rockcut-logo.png
```

### Icons / `index.html`

- Generate PWA icons (192/512 + maskable) from `public/rockcut-logo.png`; add an
  `apple-touch-icon`.
- Add iOS/standalone meta to `index.html`: `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, `theme-color`, and
  `viewport-fit=cover` (notch-safe) on the existing viewport meta.

### Install affordance

- Small `useInstallPrompt` hook: capture `beforeinstallprompt` (Android/desktop
  Chrome) → expose a callable "Install"; detect iOS Safari + not-standalone →
  surface the "Add to Home Screen" instructions instead.
- Surface in a low-friction spot (Settings entry and/or a dismissible first-run
  hint). No blocking modal.

### Mobile-responsive baseline

- Audit shipped screens at 360 px; fix layout offenders with MUI responsive props
  (`sx` breakpoints, stack-on-small, `useMediaQuery`). Ensure the app bar / nav is
  reachable on mobile (drawer/collapse if not already).
- **Explicitly excluded:** `Schedule.tsx` / `WeekGrid.tsx` touch redesign — the
  grid may overflow/scroll on mobile for now; its agenda/day rework is a later
  deliverable (§5). Document the convention: **new features ship responsive.**

### Backend

- **None.** D19 is frontend + build only. (Web-push, which *would* touch the
  backend, is out of scope.)

---

## 4. Success Criteria

- [ ] Installs and launches **standalone** on a real Android phone (install prompt)
      and a real iPhone (Add to Home Screen), showing the Rockcut icon/name.
- [ ] Chrome DevTools reports the app **Installable**; Lighthouse PWA installable
      checks pass.
- [ ] After a redeploy, an installed instance **auto-updates** to the new build
      (no reinstall).
- [ ] All shipped screens except the weekly grid are usable at 360 px (no
      horizontal scroll, controls tappable, nav reachable).
- [ ] Service worker caches the app shell; **no** stale API/schedule data served
      from cache.
- [ ] `vite build` / `tsc --noEmit -p tsconfig.app.json` / ESLint clean; ExUnit
      still 141 passing.

---

## 5. Out of Scope (later deliverables)

- **Weekly-grid mobile redesign** — agenda / "my shifts" / tap-to-claim view
  replacing the desktop grid + drag-and-drop on phones (the ~1.5–2 session
  "bucket 3"; do once the feature set is stable).
- **Web push notifications** — VAPID + service-worker push + subscription
  storage + a push channel in the D18 dispatcher. (Native/APNs push would require
  the Capacitor + Apple Developer path — also out of scope.)
- **Offline data & offline mutations** — reading/queuing schedule changes offline.
- **Capacitor / app-store packaging** — only if PWA push later proves too weak.

---

## 6. Resolved Decisions

1. **Distribution = PWA**, not native/app-store, for an internal ~12-person tool
   (no Apple $99 review, no Android sideloading/verification — a PWA is a WebAPK
   on Android and Add-to-Home-Screen on iOS, so neither gatekeeper applies).
2. D19 = **installability + responsive baseline only**; grid redesign, push, and
   offline are explicitly deferred.
3. **One codebase** — no separate "mobile app"; new features are built responsive
   as they land, so no big retrofit accrues.
4. Service worker precaches the **app shell only**; **no** API-response caching
   (avoid stale schedule data); `autoUpdate`.
5. Tooling = **`vite-plugin-pwa`** (Workbox) on the existing Vite 7 setup.

## 7. Open Questions

- [ ] Icon: reuse `public/rockcut-logo.png` as-is for maskable (needs safe-zone
      padding) or produce a dedicated maskable asset? (Non-blocking; padded
      derivative is the default.)
- [ ] Install affordance placement — Settings entry, first-run hint, or both?
      (Default: a dismissible first-run hint + a Settings entry.)
- [ ] iOS web-push appetite later — informs whether the Capacitor path ever gets
      picked up (not a D19 blocker).
