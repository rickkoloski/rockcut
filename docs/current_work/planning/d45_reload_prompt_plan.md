# D45: Reload prompt + View Schedule default — Implementation Plan

**Spec:** `specs/d45_reload_prompt_spec.md` (APPROVED 2026-10-15)
**Created:** 2026-10-15 · **Branch:** `d45-reload-prompt` from `develop`

## Approach

Frontend only. Switch the service worker from auto-update to prompt mode,
add one `UpdatePrompt` component that owns detection, the bar and the
tablets' self-reload, and give View Schedule a 7-day default.

## Changes (`rockcut-ui`)

1. **`vite.config.ts`:** `registerType: 'prompt'`. Keep `injectManifest`,
   `devOptions.enabled: false`.
2. **`src/sw.ts`:** remove the unconditional `self.skipWaiting()`; add a
   `message` listener: `{type: 'SKIP_WAITING'}` → `self.skipWaiting()` (what
   `updateServiceWorker(true)` sends). Keep `clientsClaim()`, precache, the
   navigation route and the push handlers unchanged.
3. **`src/components/UpdatePrompt.tsx`** (new), mounted once in `App.tsx`
   (inside the auth context, so it knows device / personal session):
   - `useRegisterSW` from `virtual:pwa-register/react`. In
     `onRegisteredSW(url, reg)`: `reg.update()` on `visibilitychange` →
     `visible`, and every 24 h (`setInterval`). Guard: skip when offline.
   - `needRefresh` → a bottom `Snackbar` (not a dialog; doesn't steal
     focus): "New version available", **Reload** (`updateServiceWorker(true)`)
     and **×** (hide until the next check or route change).
   - **Shared tablet self-reload:** when `needRefresh` and the session is a
     device on its shared screen (no "Sign in as me" session, no "Acting as"
     window, no open dialog/menu: `document.querySelector('[role="dialog"],
     [role="menu"], [role="presentation"].MuiModal-root:not(.MuiModal-hidden)')`
     or a better signal from the existing state), wait 10 s and reload
     (`updateServiceWorker(true)`); re-check every 30 s while waiting.
     Expose the timings as constants for tests.
   - Above the DEV ribbon and the phone bottom edge; readable in both themes.
4. **View Schedule** (`pages/schedule/Schedule.tsx`): initial `filters.from`
   = today in Colorado (`localDayKey(new Date().toISOString())`), `to` =
   `addDaysKey(from, 6)` for the agenda (`forceView === 'agenda'`). Not
   persisted. The Scheduler (week) path unchanged.
5. **Dependency:** `virtual:pwa-register/react` needs `workbox-window`. It is
   already in `node_modules` and the lockfile (through `vite-plugin-pwa`); if
   the Docker build (`--frozen-lockfile`, hoisted) can't resolve it, add it as
   a direct dependency at the lockfile's version and say so (spec said "no
   dependency": the lead amends it).

## Tests

- **Unit (Vitest):** the tablet idle rule (device + no personal session + not
  acting + no dialog → reload; each blocker → wait).
- **Playwright against `vite preview` (:4173, API :4002 via its proxy):** a
  new spec project (e.g. `pwa-update`) that builds A, serves it, opens the
  app, then rebuilds B (a different build id, e.g. an env-stamped constant) and
  triggers the check (visibility change; and the 24 h interval via
  `page.clock`): S170–S177 as far as they can run headless. Document how to
  run it in `tests/RUNNING.md`; it's not part of the default `npx playwright
  test` run if it needs two builds (keep the default suite fast).
- **Default suite:** S179–S183 (View Schedule default / clear / tablet /
  Scheduler). Update any spec that opens `/schedule` and expects shifts or
  events beyond 7 days (`scheduler/events_visibility`, `events_recurring`,
  `devices/device_session`, `devices/sw_navigation`, `ui/layout`,
  `ui/schedule`, `tasks/task-board-dashboard`: check each).
- `devices/sw_navigation` and the D19/D21 push specs must stay green.

## Order of work

1. Item 2 (View Schedule) + its specs. 2. Item 1 (sw.ts, config,
UpdatePrompt) + unit tests + a manual `vite preview` two-build check with
screenshots. 3. The `pwa-update` Playwright project. 4. Full default suite
locally (`--workers=2`). Commit per step.

## Risks

- **A worker that never activates** (bad message wiring) strands people on an
  old build: the two-build preview test is the guard; DEV gets two deploys.
- **Tablet reload at a bad moment:** the idle rule; S176/S177.
- **First rollout:** each device needs one manual reload (spec §3.1).
