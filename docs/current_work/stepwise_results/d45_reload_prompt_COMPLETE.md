# D45: "New version available" Prompt, View Schedule 7 Days, Hide Shifts — Completion Record

**Status:** COMPLETE, merged to `develop` (PR #29), 2026-10-16. Not yet on prod.
**Spec:** `specs/d45_reload_prompt_spec.md` (scenarios S170–S189)
**Plan:** `planning/d45_reload_prompt_plan.md`
**Concept:** 02_scaffold_ui
**Backlog:** 4054 (item 1). New from the gate: 4318, 4319.
**QA report:** `stepwise_results/d45_dev_qa_report.md`
**Lead decisions:** `prompts/d45_lead_decisions_1.md`, `_2.md`
**DEV:** UI v41 (`cc37ff5`, build `-1`), v42–v44 (`e6d05d6`, builds `-2`…`-4`); API unchanged.

## What shipped

| # | Item |
|---|---|
| 1 | **"New version available · Reload"** (task 4054): service worker in prompt mode (`registerType: 'prompt'`, `SKIP_WAITING` message); `UpdatePrompt` checks on visibility and every 24 h; bottom bar with Reload and ×; shared tablets reload themselves 10 s after a new build when idle on the shared screen (blocked by "Sign in as me", "Acting as", the staff-code dialog, any open dialog/menu/drawer, or typing). **First rollout (Q5):** the first D45 worker takes over and reloads open pages once (marker in a cache); later workers prompt. Optional `VITE_BUILD_ID` → `<html data-build>`. |
| 2 | **View Schedule** opens on today through today + 6 (Colorado), not remembered; clearing shows everything. |
| 3 | **Hide shifts** on the task boards: beside Hide completed; hides people, open shifts and "No one scheduled", keeps events, no empty header box; per board, per browser (`rockcut.tasks.hideShifts.<board>`); not on All departments (no headers). |

No API change, migration, secret or dependency (`workbox-window` resolves
through `vite-plugin-pwa`). UI Dockerfile gained the optional `VITE_BUILD_ID`
build arg.

## Testing

- **Local:** default suite 397 passed / 1 skipped / 1 known flake
  (`events_manager` S1, passed on rerun); `PWA_UPDATE=1` 10/10 (S170–S177,
  S189, two builds behind `vite preview`); unit 128/128; tsc clean.
- **DEV run 1** (`cc37ff5`): 400 / 1 (S43, a test race reading the Daily card
  before the second tick's save landed; test-only fix `e6d05d6`, 5/5 on DEV).
- **DEV run 2** (`e6d05d6`): **401 passed, 0 failed.**
- **Lead on DEV:** a profile on the old build reloaded itself into D45 once
  (S189); a person's browser showed the bar and Reload moved it to the next
  build (S170, S171); an idle Taproom tablet reloaded itself 16 s after a
  screen-wake check, no taps (S174, S175).
- **QA:** PASS with gaps (S179–S188 pass; no D45 regression in the SW change;
  no stray bar or reload in 30 simulated hours). G1 → 4318, G2 → 4319, both
  older than D45, backlog per Matt.
- **Matt on DEV (UI v44):** the Pixel showed the bar and Reload worked; the
  taproom tablet reloaded itself; a push arrived on the Pixel after the Reload
  (S178); View Schedule "looks good too".

## Notes for the release

- The first time, every open device reloads itself once into D45 (only when
  the browser next checks: a real page load or a push). A tablet open for days
  needs one reload after the release, or its next page load.
- From then on, releases show the prompt; tablets update within a day (or on
  screen wake).
