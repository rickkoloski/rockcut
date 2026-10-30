# Session Handoff: 2026-10-30

Supersedes `SESSION_HANDOFF_2026-10-28.md`. **D52 (refinements) is merged to `develop` and passed the DEV gate. It is not on prod.** Next: the prod release of D52 when Matt says go.

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.10.28-2` (D51 part 2), unchanged: API v30 / UI v27. |
| **DEV** | Runs `3de8429` (API v66 / UI v69) = `develop`'s app code; reseeded; **released** (conv 80 msg 100878). Pre-D52 DEV snapshot `vs_77y1bblyXY0i95V3Kkwz`. |
| **`develop`** | `b44dbe0`, the D52 merge (PR #44, `--no-ff`). |
| **Local** | `~/src/rockcut` on `develop`; API and UI running from it. Local DB has the D52 migration and the reseed. QA folder `~/src/rockcut-d52-qa` (outside the repo). |
| **PortableMind** | Task limit fixed by Russell (counts active tasks only). Held items filed as 4981–4990; D52 QA backlog 4991–4994. D52's own tasks (4707, 4232, 4949, 4318, 4298, 4706, 4063, 4062) close at the prod release. |

## D52 in short

Spec `specs/d52_refinements_spec.md` (24 items, S190–S215). Nav icons and collapsed rail; one top row with a settings gear on seven pages (`PageToolbar`, `SettingsGear`); `Schedule.tsx` split (D44 item 0); striped drafts; Publish confirm; Gantt Task list, no legend, full height, tank abbreviation (migration), template preview steps; notes on hover; extend a series; ingredient categories under the library; eight backlog tasks. QA fixes in `3de8429` (count-ended series' last occurrence, notes by keyboard, `/settings/categories`, Buy-a-Beer History URL).

## Release notes (for the release plan)

- One additive, nullable migration: safe to roll back the API image.
- No new secrets or dependencies.
- After deploy: none of the prod tanks have abbreviations; Matt adds them in Set up → Tanks.
- The UI release shows "New version available · Reload".
- Follow the usual flow: `-s ours` sync PR of `main` into `develop` → release PR → snapshot → tag → clean worktree → API → UI → smoke → close-out.

## Habits (from this session)

- **Herdr waits:** take the pane id from the `herdr tab create` output (saved to a file), never retype it; twice I waited on a wrong pane.
- **Auth files:** a DEV Playwright run re-mints `tests/.playwright-auth` with DEV tokens; re-run `npx playwright test --project setup` before local runs.
- **No wildcard deletes** in shell chains; zsh's "no matches" saved one.
- **The Mac:** a closed lid on battery sleeps despite `caffeinate -ims`; keep it plugged in and open for long runs.
- Known flake: `task-board-phone` S73 (fails ~1 in 8, on `develop` too).

## Next steps

1. Matt: say go for the D52 prod release (`v2026.10.30` or the next tag).
2. After the release: close D52's tasks, write `stepwise_results/d52_refinements_COMPLETE.md`, update the CLAUDE.md table.
3. Still open from before: pair the brewhouse tablet on prod; D50 (4934); 4963 (drop `legacy_tokens_revoked_at`) after a release or two.
4. **REMIND:** 4055 / 4056 when planning a features deliverable.
