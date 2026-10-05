# D36 handoff note (PR description)

**Deliverable:** D36 — Backlog sweep + time-off conflict fix
**Spec:** `docs/current_work/specs/d36_backlog_sweep_spec.md` (approved 2026-10-04, Q1–Q3)
**Branch:** `d36-backlog-sweep`. One commit per item.

## What changed (one item per task)

| Item | Task | Change | Test (fails without the change) |
|---|---|---|---|
| **L** | 4059 (Matt's report) | Timed time off flags only shifts overlapping its hours ("…time off then"); all-day still covers whole days ("…that day"); pending never conflicts | `scheduler/time_off_conflicts.spec.ts` (3 of 8 fail on the old day rule) |
| A | 3997 | `/live` LiveView socket mounted only with dev routes; prod answers 404 | `live_socket_test.exs` |
| B | 4001 | Unknown or blocked channel URL: "Channel not found" (people) / "Not available on a shared device" (tablet), instead of a silent redirect | `messaging/channel_urls.spec.ts` (updated) |
| C | 4002 | Tablet header fits at phone width: the pill drops the department, and the button reads "Sign in" (aria "Sign in as me") | `devices/device_header.spec.ts` (header 100 px → 64) |
| D | 4003 | nginx serves `manifest.webmanifest` as `application/manifest+json` | DEV `curl -I` (no nginx locally) |
| E | 3942 | Extending an all-draft series you can't see answers 404, not 403 | `schedule_event_series_test.exs` (S18 updated) |
| F | 3941 | DEV reseed also removes `[TEST-TEMP]`/`TEST-TEMP` events and series, and `[TEST-TEMP]` brands with their recipes, batches and brew turns | `seeds/synthetic_test.exs` |
| G | 4050 | Tablet idle timer takes the newest last-activity time from any tab, and keeps saving it during continuous activity | `devices/tablet_idle.spec.ts` |
| H | 4051 | A sign-out that can't reach the server (offline, or the tab closed) is kept as pending, sent with `keepalive`, and retried at start-up and on `online` | `auth/offline_logout.spec.ts` |
| I | 4052 | An abandoned "Sign in as me" form returns to the shared screen after 5 idle minutes and clears the email | `devices/tablet_idle.spec.ts` |
| J | 4053 | Null nav lists render as empty; a top-level error boundary shows "Something went wrong" + Reload | `app/malformed_reply.spec.ts` |
| K | 4057 | The flaky DEV "Try now" spec. The cause is to be found with a DEV trace during the DEV gate | DEV: 10 runs in a row |

**No migration, no new secret, no dependency change.** Item A keeps
`phoenix_live_view` (the dev dashboard needs it) and only stops mounting the
socket.

**Test infrastructure:** none changed in this deliverable.

## Local gate (2026-10-04)

- `mix test`: **876 tests, 0 failures** in 3 consecutive full runs.
  - The first run had 1 intermittent failure: `SyntheticTest` "taproomDevice
    persona (D33) a pairing code for it works in the real exchange".
  - It passed on every rerun, alone (3×) and in the full suite (3×).
  - D36 doesn't touch pairing, so it's likely order-dependent; a candidate
    is the pairing rate limiter's global cap across the run. To be filed.
- `vite build` OK; lint 27 (the baseline, none in D36 files).
- **Playwright: 140 passed, 1 skipped** (the DEV-only banner).
- **Revert-and-rerun** for every item except D (nginx, DEV only) and K (DEV
  only). Each new or updated test fails without its change.

**Stopped after the local gate at Matt's request (2026-10-04).** Nothing is
pushed, DEV isn't claimed, and nothing is deployed.

## Scenarios DEV must exercise

Spec §4: L1–L6, A1, B1–B2, C1, D1, E1, G1, H1, I1, J1.

## ⚠ LIMITATIONS: what local could NOT tell us

1. **D (nginx):** there's no nginx locally. Check the header on DEV, and that
   the PWA still installs (the manifest is still served and parsed).
2. **A:** check on DEV with `curl` that `/live/websocket` and
   `/live/longpoll` answer 404, and that the API still serves everything else.
3. **G and H with real tabs and a real network.** The fake clock can't model
   background-tab timers, so G's test simulates the other tab. H's
   `keepalive` on a closing tab isn't testable locally.
4. **L against real DEV data:** time off across a DST change, and time off
   in another week than the shift being viewed (the Scheduler loads one
   week of time off).
5. **I on the real Samsung/Pixel:** the form returns while the on-screen
   keyboard is open.
6. **K needs DEV** (service worker, latency).
