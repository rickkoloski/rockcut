# D36: Backlog Sweep + Time-Off Conflict Fix — Completion Record

**Status:** COMPLETE. On prod since 2026-10-05 (~04:31 UTC) in release
`v2026.10.05` (`b483dbd`, PR #13; API v23, UI v19). Matt's prod check
passed.
**Spec:** `specs/d36_backlog_sweep_spec.md` (approved 2026-10-04, Q1–Q3)
**Concept:** 07_scheduling (item L); the rest are small fixes across areas
**Branch:** `d36-backlog-sweep`, PR #12, merged 2026-10-05 as `0207fcd`.
DEV gate SHAs: **`aafff58`**, plus **`d6fae38`** (the QA gap 1 fix).
**Backlog:** PortableMind project 254. Closed: 3941, 3942, 3997, 4001,
4002, 4003, 4050, 4051, 4052, 4053, 4059. Left open: 4057 (Matt).
**QA report:** `stepwise_results/d36_dev_qa_report.md`

---

## Summary

Matt's bug was the main item: a bartender with time off in the morning was
flagged as conflicting with an evening shift that day. Time-off conflicts are
now checked by time, not by day. The same deliverable swept up eleven small
backlog tasks: tablet edge cases, the channel URLs, the manifest content type,
and the `/live` socket.

## What shipped

| Item | Task | Change |
|---|---|---|
| **L** | 4059 | Timed time off flags only shifts that overlap its hours ("…time off then"). All-day time off still covers whole Denver days ("…that day"). Pending time off never conflicts. **After QA:** the Scheduler loads time off through the next Monday, so a Sunday overnight shift sees Monday's time off (the grid still clips to the week). |
| A | 3997 | The LiveView `/live` socket is mounted only with dev routes, so prod answers 404. `phoenix_live_view` stays for the dev dashboard. |
| B | 4001 | An unknown or blocked channel URL shows "Channel not found" (people) or "Not available on a shared device" (tablet), instead of a silent redirect. |
| C | 4002 | The tablet header fits at 412 px: the pill drops the department, and the button reads "Sign in" (its accessible name is "Sign in as me"). |
| D | 4003 | nginx serves `manifest.webmanifest` as `application/manifest+json`. |
| E | 3942 | Extending an all-draft series you can't see answers 404, not 403. |
| F | 3941 | The DEV reseed also removes `[TEST-TEMP]` events, series and brands (with their recipes, batches and brew turns). |
| G | 4050 | The tablet idle timer uses the newest last-activity time from any tab, and keeps saving it during continuous activity. |
| H | 4051 | A sign-out that can't reach the server is kept as pending, sent with `keepalive`, and retried at start-up and on `online`. |
| I | 4052 | An abandoned "Sign in as me" form returns to the shared screen after 5 idle minutes and clears the email. |
| J | 4053 | Null nav lists render as empty. A top-level error boundary shows "Something went wrong" + Reload. |
| K | 4057 | The flaky DEV "Try now" spec. Not reproduced in 41 DEV runs, and the cause wasn't found. **Left open** with the findings. |

No migration, no new secret, no dependency change. Config: `rockcut-ui/nginx.conf` only.

## Testing

- **Local gate:**
  - `mix test`: 876 tests, 0 failures, in 3 full runs. One earlier run had an intermittent pairing failure, now task 4060.
  - Playwright: 140 passed, 1 skipped.
  - Revert-and-rerun for every item except D and K (DEV only).
- **DEV gate:**
  - D and A were checked with `curl`.
  - K: 10/10 with traces, then 30/31. The one failure was a setup `POST /api/users` timeout, not the flake.
  - Full suite 141/141, with clean API logs.
- **Independent QA:** PASS with gaps. All 16 scenarios passed: L1–L6, A1, B1–B2, C1, D1, E1, G1, H1, I1, J1.
  - G was tested with 3 real tabs in real time, and H with a tab closed right after Logout.
  - L held across the DST change and across weeks.
  - Gap 1 (the Sunday overnight shift) was fixed in D36, with `scheduler/time_off_window.spec.ts`, which fails without the fix.
- **After the fix:**
  - Full local Playwright: 141 passed, 1 skipped, 1 failed. The failure is S13, a parallel-only local flake that predates D36 (task 4064).
  - Full DEV suite: 142/143. G4 timed out once and passed 16/16 on rerun.
- **Prod smoke (agent):**
  - Health and the UI answer 200.
  - `sw.js` is served `no-cache`, and the manifest has its content type.
  - `/live` answers 404.
  - A synthetic sign-in gets 401, and there are 0 synthetic users.
  - Bundle check OK; logs clean.
- **Prod (Matt):** checks passed.

## Follow-Up

- **QA gaps filed:**
  - 4061: the tablet header wraps at 384 px and below.
  - 4062: a channel page shows "Loading…" forever when `/api/channels` fails (this predates D36).
  - 4063: malformed lists crash Messages, Scheduler and Time off to the full-screen Reload.
- **Flakes filed:**
  - 4060: the ExUnit pairing test.
  - 4064: the local parallel S13 failure.
  - 4057 (K) stays open.
- **Considered and kept (Matt, 2026-10-05):** personal "Sign in as me" on the shared tablets. It causes most of the device complexity. A phone QR hand-off is a possible future alternative.
- **Release process:** release PRs are squash-merged, so `main` had to be merged back into `develop` (PR #14, `-s ours` after checking the trees were identical) before PR #13 would merge cleanly.
