# Release plan: D45 to prod (update prompt, View Schedule 7 days, Hide shifts)

**Status:** IN PROGRESS 2026-10-16 (Matt: "release to prod").
**Tag:** `v2026.10.16` · **UI only** (API unchanged since `v2026.10.15`).

## 1. What ships

**D45** (PR #29, `develop` merge `dded6b0`): "New version available ·
Reload" prompt (service worker in prompt mode; checks on screen wake and
daily; shared tablets reload themselves when idle; first rollout reloads open
pages once), View Schedule opens on today + 6, Hide shifts on the task
boards. Record: `stepwise_results/d45_reload_prompt_COMPLETE.md`.

## 2. Migrations, secrets, config, dependencies

None. API not deployed (stays v27). Lockfiles unchanged since
`v2026.10.15`; audits stand (task 3994).

## 3. Impact

- **First rollout:** every open device reloads itself once into D45 the next
  time the browser checks (a page load or a push). A tablet open for days
  needs one reload after the release (or its next page load). Heads-up in
  conv 80.
- From then on, releases show "New version available · Reload"; tablets
  update themselves within a day or on screen wake.

## 4. Steps

1. Release PR `develop → main`, "Release v2026.10.16: update prompt (D45)".
2. Snapshot the prod volume (precaution; no migration).
3. Squash-merge, tag `v2026.10.16` (build id `v2026.10.16` via
   `--build-arg VITE_BUILD_ID`), push the tag.
4. Clean worktree of the tag; deploy the UI (`--remote-only --depot=false`).
5. Record versions and the rollback target in the PR.

## 5. Smoke

**Agent:** UI 200, `sw.js` `no-cache`, `<html data-build="v2026.10.16">`
(from the bundle), bundle check, API health (unchanged).
**Matt:** open the app (it reloads itself once into D45), View Schedule's 7
days, Hide shifts; reload the taproom tablet once.

## 6. Rollback

| App | Now (rollback target) | Image |
|---|---|---|
| rockcut-ui | v22 | `registry.fly.io/rockcut-ui:deployment-01M51C0K71NZG9H1Z2NBYEBN41` |

`fly deploy --image <ref> -a rockcut-ui`. Note: a rollback ships the old
auto-update worker again, which takes over at once (as before D45). Post in
conv 80.
