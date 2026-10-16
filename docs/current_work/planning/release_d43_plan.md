# Release plan: D43 to prod (UI tweaks)

**Status:** IN PROGRESS 2026-10-15 (Matt: "deploy d43 to production").
**Tag:** `v2026.10.15` · **Prod volume:** `vol_vden5mz7qg3d2864`

## 1. What ships

**D43 UI tweaks** (PR #25, `develop` merge `a0fa758`): Hop Field light theme
and Hop Field Night dark mode (per person in the account menu, per tablet in
Admin → Shared devices, Match this device), board layer colors, logos, page
title in the top bar, account menu (Profile, Theme, Log out), Tasks under
Home, View Schedule / Scheduler button moves, Scheduler week totals and Move
mode, finished Daily card, In-app/Push-only notification preferences,
position menu, day header in start-time order. Record:
`stepwise_results/d43_ui_tweaks_COMPLETE.md`.

## 2. Migrations (1, additive)

- `20261018120001_add_color_mode_to_users`: `users.color_mode` string, not
  null, default `"light"`. Old code never reads it.

## 3. Secrets, config, dependencies

None. `mix.lock`, `mix.exs`, `package.json` and `pnpm-lock.yaml` are
unchanged since `v2026.10.14`, so the audits recorded then stand (`decimal`,
`bandit` → task 3994; `source-map-js` build-time only).

## 4. Impact on people and devices

- Everyone sees the new green look at once (default Light); nobody gets dark
  mode until they choose it. Tablets stay Light until a manager sets them.
- **Logout moved** into the account icon (top right) for people; tablets and
  "Sign in as me" keep a visible Sign out. Worth a heads-up to staff.
- Installed apps (PWA) pick up the new UI on their next reload, as usual.

## 5. Pre-flight

- [x] D43 passed its DEV gate (391/0, QA recheck PASS) and is merged.
- [x] Lockfiles unchanged (audits stand).
- [x] `main` synced into `develop` with `-s ours` (only two older docs
      differed; no file changes).
- [x] DEV runs `develop` HEAD (`a0fa758`, API v42 / UI v40).

## 6. Steps

1. Release PR `develop → main`, "Release v2026.10.15: UI tweaks (D43)".
2. Snapshot the prod volume; record the id.
3. Squash-merge, tag `v2026.10.15`, push the tag.
4. Clean worktree of the tag; deploy the API (`--remote-only --depot=false`);
   machine started; `Release.migrate()`; confirm the migration is up.
5. Deploy the UI.
6. Record new versions and rollback targets in the PR.

## 7. Smoke

**Agent:** health and UI 200; `sw.js` `no-cache`; migration up; synthetic
sign-in 401 and 0 synthetic users; bundle check; API logs clean.

**Matt** (as himself): the green look; account icon → Theme → Dark and back;
a board (title in the top bar, add / tick / delete a task); a Taproom tablet
when convenient.

## 8. Rollback

| App | Now (rollback target) | Image |
|---|---|---|
| rockcut-api | v26 | `registry.fly.io/rockcut-api:deployment-01M4Y6D14CF0G0B8Y2MAK1CD39` |
| rockcut-ui | v21 | `registry.fly.io/rockcut-ui:deployment-01M4Y6ESCJ5TRX8PZ1WHFEN12K` |

`fly deploy --image <ref> -a <app>`, UI first if only the UI misbehaves. The
new column is ignored by the old code; no restore needed. The snapshot is the
last resort. Post in conv 80 which was done.
