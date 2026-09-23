# D19: PWA — Installable App Shell + Mobile Baseline — Complete

**Spec:** `d19_pwa_installable_spec.md`
**Completed:** 2026-09-22
**Concept:** 02_scaffold_ui

---

## Summary

Made the React SPA an **installable PWA** on Android and iOS with no app-store or
developer-account involvement — the "bucket 1" scope: manifest + service worker +
icons + an install affordance. Frontend/build only; no backend changes. The
weekly-grid touch redesign, push, and offline remain deferred (see spec §5).

---

## Implementation Details

### Build / service worker

- Added **`vite-plugin-pwa` 1.3.0** (Workbox) to `vite.config.ts`,
  `registerType: 'autoUpdate'` (SW auto-updates on redeploy; injected registration
  via `registerSW.js`).
- **Precache = app shell only** (`**/*.{js,css,html,ico,png,svg,woff,woff2}`, 18
  entries). **No `runtimeCaching`** — API/schedule data is never cached (dynamic +
  authed). SPA `navigateFallback: /index.html` with `/api` + `/dev` denylisted.
- `devOptions.enabled: false` — the SW does **not** run under `pnpm dev` (avoids
  cache-trapping HMR). Testing therefore uses the built app via `vite preview`.

### Manifest + icons

- Manifest: `Rockcut Scheduler` / `Rockcut`, `display: standalone`, `start_url: /`,
  `theme_color #5C4033`, `background_color #FAF6F0`, portrait.
- Icons generated from `public/rockcut-logo.png` via
  `scripts/gen-pwa-icons.cjs` (sharp, installed on demand then removed):
  `pwa-192x192`, `pwa-512x512`, `maskable-512x512` (brand tile, large safe zone),
  `apple-touch-icon` (180), `favicon-32x32`. All committed under `public/`.

### iOS / standalone

- `index.html`: `apple-mobile-web-app-capable`/`-status-bar-style`/`-title`,
  `mobile-web-app-capable`, `theme-color`, `apple-touch-icon`, and
  `viewport-fit=cover` (notch-safe). Title set to "Rockcut Scheduler".

### Install affordance

- `src/components/InstallPrompt.tsx` (mounted once in `App`): a dismissible
  bottom hint. **Android/desktop Chrome** — captures `beforeinstallprompt` and
  offers **Install**; **iOS Safari** (no such event) — a **How-to** dialog with the
  Share → Add to Home Screen steps. Dismissal persisted in `localStorage`; hidden
  when already running standalone.

### Preview proxy

- `vite preview` doesn't inherit `server.proxy`, so added a matching
  `preview.proxy` for `/api` → `:4002`, making the built PWA fully testable
  (login + data) at `http://localhost:4173`.

### Key Files

| File | Change |
|------|--------|
| `rockcut-ui/vite.config.ts` | VitePWA plugin, manifest, workbox, `preview.proxy` |
| `rockcut-ui/index.html` | iOS/standalone meta, theme-color, icons, title |
| `rockcut-ui/src/components/InstallPrompt.tsx` | install hint (Android + iOS) |
| `rockcut-ui/src/App.tsx` | mounts `<InstallPrompt />` |
| `rockcut-ui/public/*.png` | generated PWA icons |
| `rockcut-ui/scripts/gen-pwa-icons.cjs` | icon regeneration script |

---

## Testing

- [x] `vite build` emits `sw.js`, `manifest.webmanifest`, `registerSW.js`; icons
      precached; manifest link + apple meta injected into `dist/index.html`.
- [x] `tsc --noEmit -p tsconfig.app.json` clean (only pre-broken `../../shared`
      datagrid errors remain); ESLint clean on changed files.
- [x] `vite preview` (:4173) serves manifest/SW/icons (200) and proxies `/api`
      (login `POST /api/session` → 200).
- [x] Backend untouched → ExUnit unaffected (141 passing baseline).

### To verify installability by hand

Run `pnpm build && pnpm preview` in `rockcut-ui`, open `http://localhost:4173`
(localhost is a secure context, so the SW + install work): Chrome DevTools →
Application → Manifest shows "Installable"; the address-bar install icon appears.
On a phone, HTTPS is required (Fly provides it in prod).

---

## Deviations from Spec

- None material. Open questions resolved with the spec's defaults: reused the
  existing logo (padded for the maskable safe zone); install affordance is a
  dismissible first-run hint (no separate Settings entry — deferred).

---

## Follow-Up Items

- [ ] Weekly-grid mobile redesign (agenda / tap-to-claim) — the deferred bucket 3.
- [ ] Web push (VAPID + SW push + a push channel in the D18 dispatcher).
- [ ] Broader mobile-responsive audit as new features land (build responsive).
- [ ] Deploy note: SW/install need HTTPS (Fly provides it); confirm cache headers
      let the SW update (`sw.js` served no-cache).

---

## Notes

Commit: `f97411e`. Distribution decision (PWA, not native/app-store) recorded in
spec §6; a Capacitor + Apple Developer path is only needed later if iOS web push
proves too weak.
