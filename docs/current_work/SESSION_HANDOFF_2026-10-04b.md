# Session Handoff — 2026-10-04 (b, evening)

Follows `SESSION_HANDOFF_2026-10-04.md`, which covers D34/D35 and the
`v2026.10.04` release.

This session (after that handoff) triaged the backlog with Matt, then built
**D36, the backlog sweep plus Matt's time-off conflict bug**, through the
**local gate**. Matt asked to **stop after the local gate**. **Nothing is
pushed, DEV isn't claimed, and nothing is running.**

## Start here next session (Matt: "start D36 on DEV")

1. `cd ~/src/rockcut && git checkout d36-backlog-sweep`. It's local only; HEAD
   is the handoff commit on top of `95a2742`. Read
   `docs/current_work/prompts/d36_handoff_note.md`, which is the PR body,
   with the item table, local gate results and LIMITATIONS.
2. **Check conv 80 that DEV is free.** It was at the end of the last session
   (msg 85155, "DEV: free"). Then post "DEV: deploying `<sha>` (D36)".
3. **Push the branch and open the PR** to `develop`, with the handoff note as
   the body plus the Claude Code line.
4. **Deploy to DEV from a clean worktree:**
   `fly deploy -c fly.dev.toml --remote-only --depot=false` in `rockcut_api`,
   then in `rockcut-ui`. Always use `--depot=false` (see Gotchas). Then:
   - `seed_synthetic()`;
   - the bundle check, with `node scripts/check-bundle-versions.mjs` run from
     the **main checkout** (a fresh worktree has no node_modules).
5. **DEV-only checks:**
   - **D:** `curl -sI https://rockcut-ui-dev.fly.dev/manifest.webmanifest`
     shows `content-type: application/manifest+json`, and the PWA still
     installs.
   - **A:** `curl` `https://rockcut-api-dev.fly.dev/live/websocket` and
     `/live/longpoll` both answer 404.
6. **K (task 4057), the flaky "Try now" spec:**
   - Run `E2E_TARGET=dev npx playwright test tests/regression/devices/personal_signin_revoke.spec.ts -g "Try now" --repeat-each 10 --trace on`.
   - **Hypothesis, unconfirmed:** on DEV the app is served by the service
     worker. A fresh context installs it, and `clientsClaim` /
     vite-plugin-pwa autoUpdate may reload the page mid-test, which
     detaches "Try now" repeatedly. The failure was seen right after a
     deploy.
   - Second candidate: `set({bootstrapped:false, unreachable:true})` being
     re-applied when the stalled check's native 15 s XHR timeout fires.
   - **Done when** the spec passes 10 runs in a row on DEV. Fix it in the UI
     if it's a real remount or reload; otherwise in the test.
7. **Full suite on DEV**
   (`E2E_TARGET=dev npx playwright test`, with `fly logs` captured).
8. **Independent QA pass:**
   - Use a new folder, `~/src/rockcut-d36-qa/`, with fresh tokens from
     `tests/.playwright-auth` after the DEV setup run.
   - Reuse the brief rules from `~/src/rockcut-d35-qa/BRIEF.md`:
     - never print tokens (calendar feed tokens included);
     - only deactivate, demote or remove `[TEST-TEMP]` people;
     - never prod.
   - Scenarios are spec §4. Limitations are in the PR note.
   - Run it as a fresh `general-purpose` agent in the background.
9. **Report to Matt before merging.** After the merge:
   - restore DEV to `develop`, and post "DEV: free";
   - **tell Rick in conv 80 that 3997 (`/live` removal) was bundled into
     D36** (spec Q3);
   - close tasks 3941, 3942, 3997, 4001, 4002, 4003, 4050, 4051, 4052, 4053,
     4057 and 4059.
10. **File the intermittent ExUnit failure** (see "Local gate" below).

## D36 status

- **Spec** (approved, Q1–Q3): `docs/current_work/specs/d36_backlog_sweep_spec.md`.
  - Q1: an offline Logout is retried later, plus `keepalive`.
  - Q2: an abandoned "Sign in as me" form returns after 5 minutes.
  - Q3: 3997 is bundled into D36.
- **Items, one commit each (`git log develop..d36-backlog-sweep`):**
  - L (4059): time-off conflicts by time. All-day time off still covers the
    day; the message is "…then" or "…that day".
  - A (3997): `/live` is mounted only with dev routes.
  - B (4001): "Channel not found" / "Not available on a shared device".
  - C (4002): the tablet header at phone width.
  - D (4003): the manifest content type, in nginx.
  - E (3942): extending an all-draft series answers 404.
  - F (3941): the reseed also cleans events, series and brands.
  - G (4050): the idle timer works across tabs.
  - H (4051): sign-outs are retried.
  - I (4052): the abandoned form returns.
  - J (4053): null lists are handled, plus an error boundary.
  - **K (4057) isn't done; it's DEV only.**
- **Local gate:**
  - `mix test`: 876 tests, 0 failures, in 3 full runs.
    - The first run had **1 intermittent failure**: `SyntheticTest`
      "taproomDevice persona (D33) a pairing code for it works in the real
      exchange".
    - D36 doesn't touch pairing. A suspect is the pairing rate limiter's
      global cap shared across the test run.
  - Playwright: 140 passed, 1 skipped.
  - `vite build` OK; lint 27 (the baseline).
- **Revert-and-rerun** was recorded for every item except D and K.

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.10.04` (API v22 / UI v18) since 2026-10-05 ~00:30 UTC. Matt's checks passed. Rollback refs are on PR #11. |
| **DEV** | Free. It runs `develop` `b8421e4` (API v23 / UI v18). |
| **Local** | Branch `d36-backlog-sweep` (not pushed). Servers stopped. |
| **Tasks** | D36 covers 12 tasks (above). Still open outside D36: 3856 (telemetry), 3994 (`decimal` advisory, **due 2026-10-30**), 4054 (reload prompt, next feature), 4055/4056 (D32 event features), 4058 (pre-D34 token cleanup, **due 2026-11-04**). In Backlog: RBAC 3847 and 3849–3853, 3843, 3855. |
| **Humans** | Pair the prod taproom tablets. Tell staff to copy Calendar sync links again. |

## Gotchas (new this session)

- **The Playwright fake clock and background tabs.** Timers in a second tab
  don't behave like a real tablet's. For cross-tab behavior, simulate the
  other tab: write the shared `localStorage` value from the one tab.
- **The fake clock can hold up the idle return.** It awaits the revoke
  request, so test whether the tab *decided* to return (a
  `DELETE /api/session` request), not only what's on screen.
- **Pure UI logic can be tested without a browser** by importing `src/...`
  into a Playwright spec, as in `time_off_conflicts.spec.ts` and
  `sw_navigation.spec.ts`. Specs still need the setup project, so the local
  API must be running.
- **The router has a catch-all 404,** so an unmatched path answers 404
  without raising. Use `get(conn, path).status == 404`, not
  `assert_error_sent`.
- **Earlier gotchas still apply** (handoff 2026-10-04):
  - `fly deploy` hangs at "Waiting for depot builder…", so use
    `--depot=false`;
  - kill a stuck deploy by the `fly` PID, not with `pgrep -f`;
  - the Users & Roles grid shows at most 100 rows;
  - tests deliver notifications inline (`async_delivery: false`);
  - the D31 boundary test flags `.is_owner` and role reads outside `Authz`.
