# Session Handoff: 2026-10-30

Supersedes `SESSION_HANDOFF_2026-10-28.md`. **D52 (refinements) is on prod as `v2026.10.30`** (Matt checked it, 2026-10-30) and closed out. Next: plan D53.

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.10.30` (D52; release PR #46, squash `c19a604`): API v31 / UI v28. Rollback: API v30 `deployment-01M62XHR3QFT2TESVHEX3MXVXP`, UI v27 `deployment-01M62XJZDS15TCQDHYJJTAYN91`; pre-release snapshot `vs_8AV7OevqPlxLcoX73eNb9Ko6`. Conv 80 msg 100886. |
| **DEV** | Runs `3de8429` (API v66 / UI v69) = `develop`'s app code; reseeded; **released** (conv 80 msg 100878). Pre-D52 DEV snapshot `vs_77y1bblyXY0i95V3Kkwz`. |
| **`develop`** | D52 merge (PR #44), docs (PR #45), then the close-out (`-s ours` sync of `main`, completion record). |
| **Local** | `~/src/rockcut` on `develop`; API and UI running from it. Local DB has the D52 migration and the reseed. QA folder `~/src/rockcut-d52-qa` (outside the repo). |
| **PortableMind** | Task limit fixed by Russell (counts active tasks only). Held items filed as 4981–4990; D52 QA backlog 4991–4994. D52's own tasks (4707, 4232, 4949, 4318, 4298, 4706, 4063, 4062) are closed. |

## D52 in short

Spec `specs/d52_refinements_spec.md` (24 items, S190–S215). Nav icons and collapsed rail; one top row with a settings gear on seven pages (`PageToolbar`, `SettingsGear`); `Schedule.tsx` split (D44 item 0); striped drafts; Publish confirm; Gantt Task list, no legend, full height, tank abbreviation (migration), template preview steps; notes on hover; extend a series; ingredient categories under the library; eight backlog tasks. QA fixes in `3de8429` (count-ended series' last occurrence, notes by keyboard, `/settings/categories`, Buy-a-Beer History URL).

## Release notes (as released)

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

1. Matt: add tank abbreviations on prod (Set up → Tanks).
2. Plan D53: candidates in CLAUDE.md (D44 items 1–2, D52 QA backlog 4991–4994, 4950, 4061, 4319, Buy-a-Beer 4115/4116/4118, 4084 lint).
3. Still open from before: pair the brewhouse tablet on prod; D50 (4934); 4963 (drop `legacy_tokens_revoked_at`) after a release or two.
4. **REMIND:** 4055 / 4056 when planning a features deliverable.
