# Release plan: D46–D49 to prod (production scheduling)

**Status:** PLANNED 2026-10-27. Waiting on Matt's go for each outward step (§5).
**Tag:** `v2026.10.DD` (the release day) · **Prod volume:** `vol_vden5mz7qg3d2864` (check `fly volumes list -a rockcut-api` on the day)
**Prod now:** `v2026.10.22`: API v27, UI v24.

## 1. What ships

The production scheduling feature, four deliverables, all merged to `develop` and through their DEV gates:

| | What | PR | Record |
|---|---|---|---|
| **D46** | Production setup: Brewery → Production hub, tanks with out-of-service periods, phases and step types, process templates | #32 | `d46_tanks_templates_COMPLETE.md` |
| **D47** | The production schedule: batches from templates, P-numbers and batch numbers, the Gantt, moves with the move prompt, check-offs, flags with sign-off, CIPs, Undo | #33 | `d47_batch_schedule_gantt_COMPLETE.md` |
| **D48** | Changing a batch: add/remove steps, ramps, transfers, splits into parts, multi-select, clean/dirty marks | #34 | `d48_batch_changes_COMPLETE.md` |
| **D49** | Steps on the Brewery task board (two-way), the Task list panel, Show planned batches; Clean not sanitized and the CIP variants; pencilled batches; Undo retries; the Notification preferences fix | #36 | `d49_schedule_task_list_COMPLETE.md` |

Plus the §3.14 prod clean-up of the old batches (§4), and a small release task to do it (§3).

## 2. Migrations (16, at boot)

Run by `Ecto.Migrator` in the supervision tree when the new API boots, in order:

| Migration | What | Risk |
|---|---|---|
| `20261020120001_create_tanks` … `20261020120004_create_process_templates` | new tables; **phases and step types seeded** | additive |
| `20261021120001_add_split_method_and_package_partial_to_template_steps` | columns | additive |
| **`20261021130001_change_batches_for_schedule`** | **rebuilds `batches`** (batch number nullable and unique ignoring case; `volume_bbl`, `template_id`, `brew_two_days`), copying every existing row, foreign keys off during the rebuild, `foreign_key_check` before commit | **see the pre-checks (§4.1)**: two numbers equal ignoring case would fail the unique index; an orphan row would fail the FK check. Either aborts the migration and the boot |
| `20261021130002_create_production_steps`, `20261021130003_create_flag_signoffs_and_production_undos` | new tables | additive |
| `20261022120001_add_batch_changes_columns`, `20261022120002_create_tank_condition_marks`, `20261022140001_add_split_stays_and_links` | columns / table | additive |
| `20261026120001_add_cip_method`, `20261026140001_add_pencilled_to_batches`, `20261026160001_add_production_step_to_tasks`, `20261026160002_add_show_planned_batches_to_users`, `20261027120001_add_checkoff_move_to_production_steps` | columns (D49) | additive |

All 16 have a `down`. The batches rebuild's `down` only works while every batch has a number.

## 3. Secrets, config, dependencies, code to add

- **No** new secrets or config. `fly.toml`, `runtime.exs` and the Dockerfiles are unchanged since `v2026.10.22`.
- **No** dependency changes: `mix.lock`, `mix.exs`, `package.json` and `pnpm-lock.yaml` are unchanged since `v2026.10.22`, so the audits recorded then stand (task 3994, due Oct 30).
- **To add before the release (small, on `develop`, with ExUnit):** `RockcutApi.Release.production_cleanup/1`:
  - `production_cleanup(:count)`: read-only. Counts `batches`, `brew_turns` and `batch_log_entries`, plus the two pre-checks below. Prints and returns them.
  - `production_cleanup({:delete, expected})`: deletes all batches with their brew turns and log entries in one transaction, **only if the live counts equal `expected`** (so it deletes exactly what Matt saw), and fails otherwise. Logs the counts deleted.
  - Guarded like the synthetic tasks' fail-closed checks: refuses unless called deliberately with the counts.
  - Tested in ExUnit, then run once on DEV (count, then delete with DEV's counts, then reseed) before prod.

## 4. Prod data clean-up (§3.14)

1. **Read-only count and pre-checks** (needs Matt's go to ssh to prod, read-only). Before the release, with the current prod code (raw SQL through `rpc`, no writes):
   - `SELECT count(*) FROM batches`, `… FROM brew_turns`, `… FROM batch_log_entries`;
   - duplicates ignoring case: `SELECT lower(batch_number), count(*) FROM batches GROUP BY 1 HAVING count(*) > 1`;
   - orphans: `PRAGMA foreign_key_check`.

   Reported to Matt. If a pre-check finds rows, stop and plan around it before the deploy (for example, clean up first with the old code).
2. **Delete** (needs Matt's go, with the counts from step 1). Right after the new API boots and the migrations are up: `Release.production_cleanup({:delete, %{batches: N, brew_turns: N, batch_log_entries: N}})`. Recorded in the release PR and conv 80.
3. Prod then has the seeded phases and step types, **no tanks and no templates**: the brewers set those up (D46).

## 5. Steps (each outward step needs Matt's go)

**Before the day**
1. Build and test `production_cleanup/1` (§3), merge to `develop`, deploy `develop` to DEV, run it there (count → delete → reseed). DEV gate for this small change: ExUnit plus the production project on DEV.
2. **Go 1:** the read-only count and pre-checks on prod (§4.1). Report to Matt.
3. Sync `main` into `develop` with `-s ours` (the squash `f5cb9c5` from hotfix #35; the hotfix commit itself is already in `develop`), so the release PR shows only the new work.

**Release**
4. **Go 2:** release PR `develop → main`, "Release v2026.10.DD: production scheduling (D46–D49)". Heads-up in conv 80.
5. Snapshot the prod volume, and record the id.
6. Squash-merge, tag `v2026.10.DD`, push the tag.
7. Clean worktree of the tag. Deploy the API (`fly deploy --remote-only --depot=false`, from `rockcut_api`). Start the machine if it came up stopped. Watch the boot log for the 16 migrations; confirm `schema_migrations` reaches `20261027120001`.
8. **Go 3:** the clean-up delete (§4.2) with step 2's counts.
9. Deploy the UI with `--build-arg VITE_BUILD_ID=v2026.10.DD`.
10. Record the new versions and rollback targets in the PR; close-out sync of `main` into `develop` (`-s ours`).

## 6. Smoke

**Agent:**
- API `/api/health` and UI 200; `sw.js` `no-cache`; `<html data-build="v2026.10.DD">`;
- migrations up to `20261027120001`; `production_phases` and `production_step_types` seeded; 0 batches after the clean-up; 0 synthetic users, and a synthetic sign-in gives 401;
- bundle check; API logs clean for 10 minutes.

**Matt** (as himself, as owner):
1. Brewery → Production opens; Set up shows the seeded phases and step types.
2. Add a tank; make a template; plan a batch → its task-list steps appear on Tasks → Brewery with the Planned batch pill.
3. Check a step off on the board → done on the Gantt; Undo.
4. Then delete the trial batch, template and tank (or keep them as the real first ones).
5. An installed app shows "New version available · Reload".

## 7. Impact on people and devices

- **Brewery** members and owners get Brewery → Production. Other departments see nothing new.
- **The Brewery board** shows production tasks once batches are planned (none at first). Each person can hide planned batches' tasks (Show planned batches).
- **Shift-end reminders** (D40) start listing production tasks once there are any.
- **Tablets:** the Taproom tablet is unchanged. The brewhouse tablet (not paired on prod yet) would see production tasks read-only; writing the schedule is D50.
- **Notification preferences:** the fix (a change lost when the first read lands late) ships to everyone.
- **Flag sign-off signatures:** from this release on, a change to the flag-signature recipe reopens every sign-off on prod, so later recipe changes must be deliberate (D48, `v1` tag).
- Installed apps (PWA) show "New version available · Reload"; shared tablets reload themselves when idle.

## 8. Rollback

| App | Now (rollback target) | Image |
|---|---|---|
| rockcut-api | v27 | `registry.fly.io/rockcut-api:deployment-01M51BXZ4RMS12SCHP5PDB93MB` |
| rockcut-ui | v24 | `registry.fly.io/rockcut-ui:deployment-01M5HBKWF18E1E3QEAY4DQFN92` |

- **UI only misbehaving:** `fly deploy --image <ui ref> -a rockcut-ui`. The old UI works against the new API (new routes and columns are unused by it).
- **API:** the old API on the migrated DB mostly works, but `batches` was rebuilt (batch number now nullable) and old code expects a number. After the clean-up there are no batches, so the old API is safe. Before the clean-up, prefer the snapshot.
- **Last resort:** restore the step 5 snapshot to a new volume and point the machine at it (runbook `03_deployment/ref/production_deploy_runbook.md`). Anything written on prod after the snapshot is lost.
- Post in conv 80 which was done.

## 9. After the release

- Matt creates and pairs the brewhouse tablet on prod (Admin → Shared devices, home Brewery).
- PortableMind: 4629–4632 done; release record `stepwise_results/release_d46_d49_COMPLETE.md` (or the status line above); CLAUDE.md "Prod is …"; handoff.
- Next: **D50** (task 4934), the brewhouse tablet on the schedule.
