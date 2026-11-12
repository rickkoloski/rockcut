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

## Next

1. **Stage 4 brief:** Playwright for S1–S28 + `COVERAGE.md`. The Playwright setup project must clear
   every persona's `board_settings` (settings now persist server-side across specs). Update the 3
   old specs that read local board keys (`task-board-follow-ups:365`, `task-board-departments:369/523`,
   `task-board-hide-shifts:164`).
2. **Stop 2:** the full local Playwright suite (lead, in its own tab), then the DEV gate (claim,
   snapshot, deploy, reseed, DEV Playwright, independent QA).
