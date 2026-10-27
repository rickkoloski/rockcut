# Session Handoff: 2026-10-27

Supersedes `SESSION_HANDOFF_2026-10-26c.md`. **D49 is complete and merged to `develop`.** Next: the D46–D49 prod release.

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.22` (UI v24 / API v27). |
| **DEV** | **Free.** Runs `develop` at `e253c09` (API v62 / UI v65), reseeded. Released in discussion 80 (msg 99580). |
| **`develop`** | `e253c09`, "Merge D49 … (PR #36)", `--no-ff`, pushed. PR #36 shows merged. |
| **Local** | `~/src/rockcut` on `develop`. API (:4002) and UI (:5174) running in the lead tab; local DB migrated to `20261027120001`. The deploy worktree is removed. |
| **Herdr** | Workspace `rockcut`: **lead** (me + API + UI panes), **build** (the `builder`, idle, ~D49 context), **ops**. |

## D49 in short

- **Scope:** §3.12 task list linkage, §3.12a Clean not sanitized, §3.12b Pencilled batches, D48's BB1/BB2. Record: `stepwise_results/d49_schedule_task_list_COMPLETE.md`. Decisions: `prompts/d49_lead_decisions_1.md` … `_10.md`.
- **Matt's calls this session:** phase markers never get a task; the Dashboard card opens the schedule when a prompt is needed (8.3); QA 1 option a ("Mark not done" puts back what its check-off moved); QA minors 3–5, 8 fixed, 6 and 9 no change, 7 → 4949; recheck minors A–C → 4950.
- **Gate:** DEV run 2 at `fe26ae3`: 571 / 0. ExUnit 1786. QA first pass 2 must-fix + 7 minor → fix cycle 1 → recheck: no must-fix.
- **PortableMind:** 4632 (D49) **In Review** (like D48's 4631) until the release. New: 4934 (D50), 4949, 4950.

## Next steps

1. **Plan the D46–D49 prod release** (`planning/release_d46_d49_plan.md`, from `release_d43_plan.md`): `-s ours` sync of `main` into `develop` → release PR `develop` → `main` (squash) → snapshot (check `fly volumes list -a rockcut-api`) → tag → clean worktree of the tag → API (`--depot=false`), migrations, UI with `VITE_BUILD_ID` → smoke → Matt's checks → close-out sync.
   - **§3.14 prod clean-up:** a read-only count of the old unused batches first; deletion only on Matt's go.
   - All D46–D49 migrations run at boot (D49 adds five).
   - Needs Matt's go for each outward step.
2. **After the release:** Matt creates and pairs the brewhouse tablet on prod (Admin → Shared devices, home Brewery); mark 4629–4632 done.
3. **D50** (task 4934): the brewhouse tablet writes the schedule (§3.13, P104–P107).

## Habits learned this session

- **Long runs on screen:** every Playwright / ExUnit / deploy run is `| tee` in its own tab, with `/tmp/claude-501/pwlogs/pwwatch.sh <log>` in a split pane for step n/N and failures (Matt). Logs in `/tmp/claude-501/pwlogs/`, never `rockcut-ui/test-results/` (Playwright empties it).
- **Shared auth files:** local and DEV Playwright both write `rockcut-ui/tests/.playwright-auth/`. Never run both at once; `--no-deps` reuses whatever is there.
- **QA folder:** `~/src/rockcut-d49-qa/` (BRIEF.md, RECHECK1.md, `auth/` copied by the lead, reports). The QA agent runs with Read denied on the checkouts and `auth/`.
- **Local dev DB** is `rockcut_api/rockcut_api_dev.db` (not the repo root). Reseed: `mix rockcut.synthetic.reset`; DEV: `Release.reset_synthetic()`.

## Other open items (unchanged)

- **Due soon:** 3994 (`decimal` / `bandit`), Oct 30; 4058 (pre-D34 token path), Nov 4.
- **Open tasks:** D44 item 0 (`Schedule.tsx` split); 4707; flakes 4706, 4933.
- **REMIND:** 4055 / 4056 (events in calendar feeds, company-wide events) when planning the next deliverable.
