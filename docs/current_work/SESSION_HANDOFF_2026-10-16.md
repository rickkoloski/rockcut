# Session Handoff — 2026-10-16

Supersedes `SESSION_HANDOFF_2026-10-15b.md`. **D45 was specced, built, gated
and released; prod is `v2026.10.16`.** Nothing is in flight.

## Where things are

| | State |
|---|---|
| **Prod** | **`v2026.10.16`** (PR #30 squash `a30a4eb`), **UI only**: **UI v23** `…01M52QNWFYNPE7R305T8H928M3` (build id `v2026.10.16`); **API v27** unchanged (`v2026.10.15`). Rollback: UI v22 `…01M51C0K71NZG9H1Z2NBYEBN41`. Snapshot `vs_l03KbyLXg4j1tewzvl2XXXmw` (volume `vol_vden5mz7qg3d2864`). Smoke green; Matt's checks 1–4 passed. Announced in conv 80 (msg 90146) with the one-time-reload heads-up. |
| **DEV** | **Free** (msg 90142). Runs `develop` `dded6b0` (API v42 / UI v45), reseeded. |
| **develop** | D45 merged (PR #29 `dded6b0`), release plan, and the close-out branch `close-out-v2026.10.16` (`-s ours` sync after v2026.10.16, records, this handoff). `main` is an ancestor of `develop`. |
| **Backlog** | New: **4318** (`/tasks/taproom` link lands on Brewery), **4319** (Enable push silent in private windows). Still open from D43: **4298**. Task **4054** done (D45). |
| **Local** | Checkout on `develop`; `theme-servers` tab runs the local API/UI; builder idle. |

## Done (2026-10-15 evening → 2026-10-16)

- **D43 released** as `v2026.10.15` (see the 10-15b handoff).
- **D45**: spec with Matt (items 1–3; Q1 tablets reload themselves, Q2 daily
  check, Q3 View Schedule always today + 6, Q4 Hide shifts keeps events, Q5
  first rollout auto-reloads once) → plan → builder Tasks 1–4 → local gate →
  DEV: two-deploy-plus checks (old build reloads itself once; person sees the
  bar and Reload works; idle tablet reloads itself 16 s after a screen-wake
  check), runs 400/1 (S43 test race, test-only fix) → 401/0, QA PASS with gaps
  (G1 → 4318, G2 → 4319), Matt's Pixel + tablet + push checks → merged →
  released UI-only. Record: `stepwise_results/d45_reload_prompt_COMPLETE.md`;
  QA: `stepwise_results/d45_dev_qa_report.md`; release:
  `planning/release_d45_plan.md`.

## Open

- **Next deliverable:** Matt's call. D44 (time off dialogs in the Scheduler;
  draft scope, questions deferred), then 4055 / 4056 and the small tasks
  (CLAUDE.md). D46 is the next free ID.
- **From now on, releases announce themselves**: people see "New version
  available · Reload"; idle shared tablets reload themselves (within a day,
  or on screen wake). Stamp prod UI builds with `--build-arg
  VITE_BUILD_ID=<tag>` (shows as `<html data-build>`).
- **Matt:** pair the brewhouse tablet on prod (carried over); tablet themes in
  Shared devices.
- Task 3994 (`decimal`, `bandit`) due 2026-10-30; 4058 due 2026-11-04.
- Can be deleted: `~/src/rockcut-d4*-qa/`, `~/src/rockcut-d43-scratch/`,
  local branch `local/theme-preview`.

## Gotchas (new)

- **Testing the update prompt needs two different builds**: an identical
  rebuild gives the same service worker. Use `--build-arg VITE_BUILD_ID=…`
  (UI Dockerfile) on DEV; locally the `PWA_UPDATE=1` Playwright project builds
  twice behind `vite preview` (see `tests/RUNNING.md`).
- **A rollback to UI ≤ v22** ships the old auto-update worker again, which
  takes over at once (fine, but the prompt disappears until D45 is back).
- **Optimistic UI vs server reads in specs**: a checkbox shows ticked before
  the save lands; read the server with `expect.poll` (S43, D45).
- Watching herdr agents: wait for "not working" twice, 30 s apart, **and** no
  "shell still running" on the agent's screen.
