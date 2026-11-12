# Session Handoff: 2026-11-12

Supersedes `SESSION_HANDOFF_2026-11-11.md`. Prod: `v2026.11.11` (D59, done, task 5764 closed). DEV free,
runs `develop`.

## D58 in progress

Branch `d58-board-settings-and-managers` in `~/src/rockcut`, not pushed. Spec and plan are approved;
decision 9 added five UI follow-ups (4118 2–7, 4115, 4116, 4319, 5193).

- **Stages 1, 2, 3 and 3b are done** (through `0fb9b6a`; the builder's full gate passed). Stop 1 was
  reported to Matt.
- **Two migrations:** `users.board_settings` and the `schedule_event_series` chain (4261 found D39's
  gaps and ported the fix). Both are on the local dev DB.
- **Builder notes for Matt to confirm:**
  - 5193: adding or archiving a list clears any half-typed "Add a card" text;
  - §3.12: trailing empty spreadsheet columns are now listed as "(blank)";
  - 5205: the loading screen shows "Rock Cut Brewing" under the spinner.

## Stop 2 reached (local gate green)

- **Stage 4** (`7a80ea4`–`6665a8f`):
  - Playwright for S1–S28 in a one-worker `d58` project (40 specs, passed twice);
  - setup, the token mint and `seed_synthetic()` reset `board_settings`;
  - the old local-key specs moved to the server settings;
  - a `COVERAGE.md` D58 section, with no GAP rows (S27's real private window is manual).
- **Full local Playwright at `6665a8f`:** 757 passed, 1 skipped (DEV-only banner), 39.1 min. An earlier
  run's two Gantt failures were stale local seed data after midnight; they passed after a reseed.
- **Gate:** `mix test` green twice, warnings-as-errors clean, tsc, vitest, build, lint 27.

## Next

1. **Matt confirms the three builder choices:**
   - 5193 clears half-typed "Add a card" text on add/archive list;
   - "(blank)" for trailing empty import columns;
   - "Rock Cut Brewing" under the start-up spinner.
2. **The DEV gate, on Matt's go:**
   1. push, open a draft PR;
   2. claim DEV (conv 80) and snapshot it;
   3. deploy (two migrations), then `seed_synthetic()`;
   4. full DEV Playwright;
   5. an independent QA pass. QA brief: destructive actions by id on `[TEST-TEMP]` rows only; check
      Owners privacy in the users payload as a non-managing manager.
