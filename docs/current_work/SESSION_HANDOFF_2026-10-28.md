# Session Handoff: 2026-10-28

Supersedes `SESSION_HANDOFF_2026-10-27b.md`. **D51 is complete and on prod, in two releases today.** Next: D52, a refinement round Matt picks from the backlog (he has UI items of his own to look at first).

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.10.28-2` (D51 part 2, PR #41, release PR #42, squash `3d21eee`): API v30 / UI v27. `/api/health` → `{"env":"prod","sha":"3d21eee…"}`. Rollback API v29 `registry.fly.io/rockcut-api:deployment-01M61VPK4TFM95FMS43NVQ7A8N`, UI v26 `registry.fly.io/rockcut-ui:deployment-01M61VS462Z3KP91H5ZN6ARW2H`; snapshot `vs_Mao4VyOmLXNYHKO5gbQBnGp`. Before that today: `v2026.10.28` (part 1, hotfix PR #40, API v29 / UI v26, snapshot `vs_xBYZv4pm5jQ9skgVJJ3JeDL`). Matt signed in after each. |
| **DEV** | Runs `f948575` (D51 part 2, API v64 / UI v67), the same code as `develop`. **Released** at close-out. |
| **`develop`** | The close-out PR (this handoff, the D51 record, CLAUDE.md, the `-s ours` sync of `main`). |
| **Local** | `~/src/rockcut` on `develop` (`8f4c760`, new deps installed, local DB migrated and reseeded). API and UI running in the lead tab from it. No worktrees. QA folders `~/src/rockcut-d51-qa`, `~/src/rockcut-d51p2-qa` (outside the repo; reports copied into `stepwise_results/`). |
| **PortableMind** | Done today: 3994, 4119, 4233, 4058, 4231, 4669, 4060, 4933; closed as not reproducible: 4064, 4057. New: 4963. **At the 75-task limit** (completed tasks count): Matt asked Rick why (discussion 80, msg 100296). |

## Waiting on others

- **Rick:** the 75-task limit. Until it's lifted, new items go in `docs/current_work/backlog_pending_tasks.md` (10 entries from D51 QA, incl. G2 CORS on parser errors, G4 batch log timezone, °Plato, the recipe-ingredient Sort Order 500, comma decimals). File them when there's room and delete them from the file.
- **Matt:** his UI items, then which backlog items join D52.

## Next steps

1. Hear Matt's UI items; suggest which backlog items fit the same screens. The candidate sets are in CLAUDE.md "Next deliverable" (daily-use polish 4707, 4232, 4318, 4298, 4061, 4319, 4062, 4063; Gantt 4949/4950 plus the phase-marker move-prompt question; Buy-a-Beer 4115/4116/4118; code health 4084, the `Schedule.tsx` split).
2. Spec D52 with persona scenarios; branch from `develop`.
3. Still open from before: Matt pairs the brewhouse tablet on prod; the template / move-prompt question (DEV templates 538 and 539); D50 (4934).

## Habits (from today)

- **The MacBook sleeps** (idle, lid, battery): odd timeouts or an 8-minute hang → `pmset -g log | grep -E "Entering Sleep|Wake from"`. Wrap long runs in `caffeinate -ims` (plugged in, lid open; `-i` alone wasn't enough).
- **Deploys pass the build commit:** API `--build-arg GIT_SHA=$(git rev-parse HEAD)`, UI `--build-arg VITE_GIT_SHA=$(git rev-parse HEAD)` (and `VITE_BUILD_ID`); smoke checks `/api/health` `sha` == the tag / tested SHA.
- **Rollback-safe migrations:** don't drop a column in the release that stops reading it.
- **Playwright `--repeat-each` on a whole sign-in file** exhausts the 40 spare sessions; re-run `--project setup` first.
- `fly ssh … rpc`: `~s|…|` strings (a plain `\"` broke a query again today).
- Prod reads are `SELECT` only; prod writes need Matt's go.

## Other open items

- **Open tasks:** D44 item 0 (`Schedule.tsx` split); 4707; 4706 (flake); 4963.
- **REMIND:** 4055 / 4056 (events in calendar feeds, company-wide events) when planning a features deliverable.
