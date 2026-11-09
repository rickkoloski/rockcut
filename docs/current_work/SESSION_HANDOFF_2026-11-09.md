# Session Handoff: 2026-11-09

Supersedes `SESSION_HANDOFF_2026-11-08d.md`. **D55 and D50 are both on prod; nothing is in flight.**

## State

| | |
|---|---|
| **Prod** | `v2026.11.09` (D50; release PR #62 squash `dbf80e8`): API v36 `…deployment-01M70MGHPWTT121KN69NTP6DQS`, UI v32 `…deployment-01M70MJ7J1HK31XMZJHMFPX037`. Rollback: API v35 / UI v31 (D50's migration only adds nullable columns). Pre-release snapshot `vs_jQjPb8l52evkFlYkePl5bAZX`. |
| **Before that** | `v2026.11.08-2` (D55, PR #60). Rolling back past D55 needs snapshot `vs_Aqb8a3KXyAnRCwp3lP5lok3q`. |
| **Matt's checks** | All passed on 2026-11-09: his phone; the three Taproom tablets (task 5164); after D50, the brewhouse device and a Taproom tablet. |
| **Prod devices** | Tablet-1, Tablet-2 (Taproom), "Brewery Test 1" (the brewhouse device, home Brewery; a former Taproom Samsung). |
| **DEV** | Free (conv 80 msg 103514). It runs `6593442`, the same app code as `develop`; reseeded. |
| **develop** | D50 merged (`22eff34`) plus this close-out (`-s ours` sync of `main` and docs). The next release PR is conflict-free. |

## Next

- **D56 production timing** (task 5207): pre-brew (negative) days and multi-day steps.
- **D57 test results** (task 5208): results and automatic retests.
- **Backlog from D50 QA:**
  - 5210: template Save isn't all-or-nothing;
  - 5211: a step taken off the task list disappears from the Gantt (medium).
- **Also open:**
  - a 15-minute decisions session (4991, 4994, 4992, 4984, 5202);
  - D55 QA backlog 5203–5206 and gap 14;
  - schedule events (4055, 4056, 4261).

## Lessons

- **Long runs in a herdr tab must show their output:** use `2>&1 | tee <log>`, never `> log`, plus
  a status split (`/tmp/claude-501/pwlogs/pwwatch_list.sh <log> <N>` for the list reporter). QA
  panes get `/tmp/claude-501/pwlogs/qawatch.sh <progress.log>`.
- **S139 is date-dependent:** on a Monday with First day Monday, today is the first day and the
  board doesn't scroll. The test now checks that the board opens at the top in that case.
- **Builders' `pnpm` in `rockcut_api`:** it happened twice in D50 (the old scaffold `package.json`
  there). Check `git status --ignored rockcut_api` at each stop.
- **QA scripts and one-tap deletes:** a QA script removed a seeded mark through "the next Remove".
  Brief rule: click a confirm only inside its dialog, by its exact name.
