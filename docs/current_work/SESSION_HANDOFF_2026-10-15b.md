# Session Handoff — 2026-10-15 (b)

Supersedes `SESSION_HANDOFF_2026-10-15.md`. **D43 was specced, built, gated
and released today; prod is `v2026.10.15`.** Nothing is in flight.

## Where things are

| | State |
|---|---|
| **Prod** | **`v2026.10.15`** (PR #27 squash `66032c9`), ~21:27 Colorado (03:27 UTC 10-16): **API v27** `…01M51BXZ4RMS12SCHP5PDB93MB` / **UI v22** `…01M51C0K71NZG9H1Z2NBYEBN41`. Migration `add_color_mode_to_users` up. Rollback: API v26 `…01M4Y6D14CF0G0B8Y2MAK1CD39`, UI v21 `…01M4Y6ESCJ5TRX8PZ1WHFEN12K`; snapshot `vs_Aqb8a3KXyAnRCv98JJbvJ8q` (volume `vol_vden5mz7qg3d2864`). Agent smoke green; Matt's checks 1–4 passed. Announced in conv 80 (msg 89763, with a staff heads-up that Log out moved into the account icon). |
| **DEV** | **Free** (released msg 89762). Runs `develop` `a0fa758` (API v42 / UI v40), reseeded. |
| **develop** | D43 merged (PR #25 `a0fa758`), sync PR #26 (`-s ours` after v2026.10.14, plus the release plan), and the close-out branch `close-out-v2026.10.15` (`-s ours` sync after v2026.10.15, records, this handoff) merged after it. `main` is an ancestor of `develop` again. |
| **Backlog** | New: **4298** (Light "Acting as" bar text 2.6:1, D43 QA G7, low). |
| **Local** | Checkout on `develop`; herdr tab `theme-servers` runs the local API and UI; builder idle. Local branch `local/theme-preview` (the D43 prototype) can be deleted. |

## Done today

- **D43 UI tweaks**: prototype with Matt (14 items) → spec (S143–S169)
  approved → plan → builder Tasks 1–4 (+ a `fix:` for 9 API tests pinned to
  2026-10-14) → local gate (379/1 skipped, 1470/0) → DEV: runs 377/1 (a
  pre-existing stale-tab timing race; test hardened) → 380/0 → QA pass 1
  (PASS with gaps G1–G5, title) → fixes `6259eb1` → 391/0 → QA recheck PASS
  (G7 → 4298, backlog per Matt) → Matt's DEV checks → merged → released.
  Record: `stepwise_results/d43_ui_tweaks_COMPLETE.md`; QA:
  `stepwise_results/d43_dev_qa_report.md`; decisions:
  `prompts/d43_lead_decisions_1…5.md`; release:
  `planning/release_d43_plan.md`.
- **D44** scoped (time off dialogs in the Scheduler), questions deferred.

## Open

- **Next deliverable:** Matt's call. D44 (draft scope), or D45 for task 4054
  (reload prompt; proposed so later releases can announce themselves). Then
  4055 / 4056 and the small tasks (CLAUDE.md).
- **Matt:** create and pair the brewhouse tablet on prod (carried over); set
  tablet themes in Admin → Shared devices if wanted.
- Task 3994 (`decimal`, `bandit`) due 2026-10-30; 4058 due 2026-11-04.
- Can be deleted: `~/src/rockcut-d43-qa/`, `~/src/rockcut-d43-scratch/`,
  `~/src/rockcut-d40-qa/`, `~/src/rockcut-d41-qa/`, `~/src/rockcut-d42-qa/`,
  and the local branch `local/theme-preview`.

## Gotchas (new)

- **The machine runs out of memory** with several Playwright browsers plus
  the servers: Claude Code then kills background watchers. Keep Playwright at
  `--workers=2` (or 1) and never run two suites at once.
- **`herdr agent wait` can return early** (agent "done" while its own shell
  runs). Watch with a loop that needs the agent non-working for two checks 30 s
  apart.
- **MUI `createTheme(base, dark)`** builds a *light* theme and layers the dark
  options on it, so unset dark defaults stay light. Merge the options first
  (D43 `theme.ts`).
- **`on_device_id`** is only set while acting with a staff code; a "Sign in as
  me" session links to its tablet through `user_sessions.device_token_id`.
- The Taproom board's path is `/tasks/bar` (key `bar` since D32).
- A DEV-only failure on `device_signout` G4 was a request racing a logout;
  the test now holds tab B's reads. Same app behavior on `develop`.
