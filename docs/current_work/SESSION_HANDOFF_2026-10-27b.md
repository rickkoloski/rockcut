# Session Handoff: 2026-10-27 (b)

Supersedes `SESSION_HANDOFF_2026-10-27.md`. **v2026.10.27 is on prod: production scheduling (D46–D49).** Next: D50.

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.10.27` (PR #38, squash `957dadf`): API v28 / UI v25, build id `v2026.10.27`. Snapshot before the deploy `vs_QeGMQlYOLoayhmbw3Dm2ZKO6` (volume `vol_vden5mz7qg3d2864`). Rollback: API v27 `registry.fly.io/rockcut-api:deployment-01M51BXZ4RMS12SCHP5PDB93MB`, UI v24 `registry.fly.io/rockcut-ui:deployment-01M5HBKWF18E1E3QEAY4DQFN92`. |
| **Prod data** | 9 phases, 19 step types (seeded). Matt's first template "Standard Ale" (id 1) and two trial batches (one pencilled). No §3.14 clean-up was needed (0 old batches). |
| **DEV** | Free; `develop` at `e253c09` (API v62 / UI v65). Plus two templates for Matt's testing: "Standard Ale (copy of prod)" (538) and "Standard ale (example)" (539). A DEV reseed leaves them (it only replaces `[SEED]` templates). |
| **`develop`** | Close-out sync `-s ours` of `main` + these docs (PR "v2026.10.27 close-out"). |
| **Local** | `~/src/rockcut` on `develop`; API and UI running in the lead tab. No worktrees. |
| **PortableMind** | 4629–4632 (D46–D49) **Completed**. 4934 (D50) open. Backlog 4949, 4950. |

## Open from the release: the move prompt and phase markers

Matt: "when I move a task on the gantt it's not prompting to move other tasks in that batch with it."
- **Cause:** in his prod template every step "comes after" a **phase marker** (Lag → Set temp, Fermentation → Yeast harvest, Diacetyl rest → Set temp / Diacetyl test, …), and nothing comes after the steps themselves. Moving a step with nothing following it moves it alone, by design (`Steps` moduledoc: "With nothing following there's no prompt"). Markers have no dot in the collapsed row, so the chain's hubs are hidden there.
- **On DEV for Matt:** the copy (538) reproduces it; dragging the Lag marker (expanded row) prompts. The example (539) chains step to step (FDH → the crash ramp → Conditioning → Carb → Package → CIP); dragging FDH prompts.
- **Waiting on Matt** (2026-10-27) to decide what he likes. Candidates: re-link his template in the editor; or a change (a step inherits its marker's following steps; markers shown in the collapsed row; the template editor nudging "comes after" to the previous step). A change would be a new task or part of D50.
- Scripts used (one-off, outside the repo): `/tmp/claude-501/prodseed/example_template.exs`, `matts_copy.exs`.

## Next steps

1. Hear back from Matt on the template / move prompt question; file the task he wants.
2. **D50** (task 4934): the brewhouse tablet on the schedule (§3.13, P104–P107). Plan from the spec; branch from `develop`.
3. Matt pairs the brewhouse tablet on prod (Admin → Shared devices, home Brewery).

## Habits (from the last two sessions)

- Long runs on screen: `| tee` in their own tab plus `/tmp/claude-501/pwlogs/pwwatch.sh <log>` in a split (step n/N, failures).
- Local and DEV Playwright share `rockcut-ui/tests/.playwright-auth/`; never run both at once.
- `fly ssh … rpc` strings: use `~s|…|` and avoid `||` and nested `~s(...)` inside it (both broke queries today).
- Prod reads are `SELECT` / `PRAGMA` only, through `rpc`; any prod write needs Matt's go.

## Other open items

- **Due soon:** 3994 (`decimal` / `bandit`), Oct 30; 4058 (pre-D34 token path), Nov 4.
- **Open tasks:** D44 item 0 (`Schedule.tsx` split); 4707; flakes 4706, 4933.
- **REMIND:** 4055 / 4056 (events in calendar feeds, company-wide events) when planning the next deliverable.
