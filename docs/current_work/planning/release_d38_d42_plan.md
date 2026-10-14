# Release plan: D38, D39, D41, D42, D40 to prod (task boards)

**Status:** RELEASED 2026-10-14 ~21:52 UTC: API v26 / UI v21, snapshot `vs_3278xNvpqVDOS9JlkgpeX` (volume `vol_vden5mz7qg3d2864`; see PR #24's comment). Matt's checks passed.
**Prepared:** 2026-10-14 (lead)
**Process:** `docs/process/three_environment_workflow.md` §5. Runbook:
`docs/chronicle_by_concept/03_deployment/ref/production_deploy_runbook.md`
("Routine redeploy").
**Tag:** `v2026.10.14` (or the release day's date).

## 1. What ships

| | What staff will notice |
|---|---|
| **D38: Brewery Task Board** (PR #18, task 4211) | A task board: day columns with who's scheduled, tasks with assignees, drag between days, Unfinished and Future, the Daily checks card, History for managers. |
| **D39: Recurring tasks** (PR #19, 4212) | Weekly/monthly/quarterly/annual repeating tasks, "Just this one" / "This and all following" edits; phone vertical view. |
| **D41: Department task boards** (PR #20, 4237) | **Tasks** in the main nav: one board per department (Brewery, Taproom, Office, Sales), a board switcher for people in more than one, and an **All departments** view for owners. |
| **D42: Board follow-ups + password reset** (PR #21, 4260, 4117) | **First day** of the board (Today / Sunday / Monday, past days dimmed); settings remembered per board; delete never-ticked retired Daily items; repeating-task fixes. **Security:** someone who still has to set a new password can't use the API until they do. |
| **D40: Tablets, reminder, dashboard** (PR #22, 4213) | The **Taproom tablet gets the Taproom board** (writes need a staff code; "Acting as … · Done" for 5 minutes). **Any employee can have a staff code** (managers set them in Users & Roles). Brewery staff get a **push about 1 hour before their shift ends** listing what's still open (opt-out in the bell's ⚙ Preferences). **Today's tasks** card on the Brewery Dashboard. A brewhouse tablet can be paired for the Brewery board. |

**Prod fix this release also ships (live today):** task 4117: the API
accepted writes from someone who still had to reset their password.

## 2. Migrations (9, all additive or renames of new tables)

Prod has none of the task tables, so **no existing prod data moves**. They
run in order at boot (`Ecto.Migrator`); running `Release.migrate()` as well
is harmless.

| Migration | From | Change |
|---|---|---|
| `20261011120001_create_brewery_tasks` | D38 | new table |
| `20261011120002_create_brewery_daily` | D38 | new tables (Daily items, checks); inserts the Brewery's 4 Daily items (Backups, Gravities, Temps, Pressures) |
| `20261011120003_create_brewery_task_events` | D38 | new table |
| `20261012120001_create_brewery_task_series` | D39 | new table |
| `20261014120001_add_continues_series_id_…` | D39 | new column on the new table |
| `20261015120001_add_internal_end_…` | D39 | new column on the new table |
| `20261016120001_rename_brewery_task_tables` | D41 | renames the five new tables to `tasks`, `task_series`, … (empty on prod) |
| `20261016120002_add_department_id_to_task_events` | D41 | new column (backfill: no rows on prod) |
| `20261017120001_create_task_reminders` | D40 | new table |

All were rollback-checked (up/down/up) on local copies and ran at boot on
DEV's volume with real data (D41: row counts identical).

## 3. Secrets, config, dependencies

- **No new secrets.** D40 reuses `STAFF_CODE_KEY` (D37). Don't rotate it.
- `fly.toml`, Dockerfiles and nginx unchanged.
- **New UI dependencies:** `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable`
  10.0.0, `@dnd-kit/utilities` 3.2.2 (D38); `vitest` 4.1.11 (dev only).
  Lockfile updated; the Docker build installs `--frozen-lockfile`.
- No new API dependency.

## 4. Impact on people and devices

- **Nobody is signed out.** Sessions and tablet pairings are unchanged.
- **People with a pending password reset** (new hires with a temporary
  password) can only reach "Set a new password" until they set one. The UI
  already sent them there; now the API agrees.
- **Taproom tablet:** gets **Tasks**. Existing Taproom staff codes keep
  working (now also for the board).
- **Push:** Brewery staff with a published shift start getting the
  shift-end reminder from the first shift after the release; it's on by
  default.
- **Daily checks:** the Brewery board starts with its four Daily items
  (inserted by the D38 migration). Other boards have none until a manager
  uses ⋮ → **Set up Daily checks**.

## 5. Pre-flight (agent, before Matt's go)

- [ ] D40 passed its DEV gate and is merged to `develop`.
- [ ] **Sync `main` into `develop`** (`git merge -s ours origin/main`, as
      PR #16): verified 2026-10-14 that `origin/main`'s tree equals
      `develop` commit `0ed1afa` (D37 merged), so the sync changes no file.
- [ ] `develop` merges into `main` cleanly and the result equals `develop`
      (dry run).
- [x] Audits (2026-10-14): none introduced by this release (`mix.lock`
      unchanged since `v2026.10.07`; `source-map-js` unchanged in the lockfile).
      `mix hex.audit`: `decimal` 2.4.1 (EEF-CVE-2026-32686, accepted, task
      3994; and new EEF-CVE-2026-97853, `Decimal.round` places), `bandit`
      1.12.5 (EEF-CVE-2026-105659, HTTP/2 only: `fly.toml` doesn't enable h2
      to the app, so Fly's proxy speaks HTTP/1.1). `pnpm audit --prod`:
      `source-map-js` 1.2.1 (build-time via Tailwind/PostCSS, not in the
      shipped bundle). Proposed: fold the bandit upgrade into 3994.
- [ ] DEV runs `develop` HEAD with the full suite green.

## 6. Steps (on Matt's go)

1. **Release PR** `develop → main`, "Release v2026.10.14: task boards (D38–D42, D40)", body = §1–§4 + §8.
2. **Snapshot:** `fly volumes snapshots create vol_vden5mz7qg3d2864 -a rockcut-api`; record the id. (The volume moved hosts on 2026-10-09; `vol_rkgemljzzkozz3w4` is gone. Check `fly volumes list -a rockcut-api` first.)
3. **Merge** the release PR (squash, as #17), **tag** `v2026.10.14`, push the tag.
4. **Clean worktree of the tag.** Never deploy from the working tree.
5. **Deploy the API:** `fly deploy --remote-only --depot=false`; machine `started`.
6. **Migrate** (`Release.migrate()`), confirm all 9 `up`.
7. **Deploy the UI:** `fly deploy --remote-only --depot=false`.
8. **Record** the new versions (expected API v26 / UI v21) and the rollback targets in the PR.

## 7. Smoke

**Agent:** `/api/health` and the UI 200; `sw.js` `no-cache`; 9 migrations
up; a synthetic sign-in 401 and 0 synthetic users; the bundle check; API
logs clean for the first minutes (no `database is locked`, 5xx).

**Matt** (as himself; the agent never signs in on prod):
1. **Tasks** in the nav → the board switcher lists the four boards and All
   departments.
2. Brewery board: add a task, drag it to tomorrow, tick it, delete it.
3. The Brewery board's Daily card shows Backups, Gravities, Temps,
   Pressures.
4. Users & Roles → a Brewery employee → **Staff code** section shows.
5. The Taproom tablet (next time someone's there): Tasks opens the Taproom
   board; a write asks for a staff code.

## 8. Rollback

| App | Now (rollback target) | Image |
|---|---|---|
| rockcut-api | v25 | `registry.fly.io/rockcut-api:deployment-01M4BXXJ944WKQEQY4FBB25CX0` |
| rockcut-ui | v20 | `registry.fly.io/rockcut-ui:deployment-01M4BYQ7FGJ2RY5QQBKXKW66ER` |

- `fly deploy --image <ref> -a <app>`.
- The migrations only add tables and columns the old code never reads, so
  no restore is needed. Tasks created after the release stay in the
  database, unseen, until a fixed release.
- Roll back the **UI first** if only the UI misbehaves (the old UI has no
  Tasks entry and ignores the new API fields).
- The §6 snapshot is the last resort.
- Post in conv 80 which was done.

## 9. Timing

- When the taproom isn't serving (a few seconds of downtime on the swap).
- After the smoke: pair the **brewhouse tablet** (Admin → Shared devices,
  home Brewery) when Matt is at the brewery; managers set Brewery staff
  codes.

## 10. After the release

- [ ] Close-out: CLAUDE.md (D42 and D40 rows, "Next deliverable"), the
      `stepwise_results/*_COMPLETE.md` for D42 and D40, tasks 4260, 4117,
      4213 closed.
- [ ] Deploy-plan memory, session handoff, release post in conv 80, "DEV:
      free".
