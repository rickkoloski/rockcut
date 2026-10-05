# Session Handoff — 2026-10-04

Follows `SESSION_HANDOFF_2026-10-02b.md`.

This session finished **D34** (three more fix cycles and QA passes), triaged
the backlog, built **D35** (task 3992), and released both to prod as
**`v2026.10.04`**. Matt's prod checks passed and the close-out is done.
**Nothing is running.**

## Start here next session

1. **Pair the prod taproom tablets.** Admin → Shared devices → "Taproom
   tablets" (home: Taproom), then `docs/process/taproom_tablet_setup.md`. It's
   safe now: with D34, a Wi-Fi drop no longer unpairs a tablet.
2. **Tell staff** to copy their Calendar sync links again; the old ones never
   worked on prod.
3. **Next deliverable, D36:** task **4054**, the "new version available, tap
   to reload" prompt. Spec first.
   - Test it with `vite preview`/DEV, not the dev server.
   - Decide how tablets behave during "Sign in as me".

## Where things are

| | State |
|---|---|
| **Prod** | `v2026.10.04` (`e35fd3f`, PR #11): API **v22** / UI **v18**, since 2026-10-05 ~00:30 UTC. Rollback targets are API v21 and UI v17 (image refs on PR #11). Pre-release snapshot `vs_bZZv95L658ySkDeOyv2J0RR`. The smoke was green, and so was Matt's check (sign-in, Profile, a Calendar sync link downloads `.ics`). |
| **DEV** | **Free.** It runs `develop` `b8421e4` (API v23 / UI v18). |
| **Branches** | `develop` = `main` content plus this close-out. The D34/D35 branches are merged (PRs #9 and #10). |
| **QA folders** | `~/src/rockcut-d34-qa{,2,3}` and `~/src/rockcut-d35-qa`. Their tokens are deleted, and only scripts, screenshots and reports remain (the reports are copied into `stepwise_results/`). They can be deleted. |

## What was done

- **D34 → COMPLETE** (`stepwise_results/d34_session_revocation_COMPLETE.md`).
  - Pass 1 G1–G4 fixed (`8f3f12a`).
  - Pass 2 G1/G4 fixed (`e708a70`): only a 401 ends a session, plus a 15 s
    `/api/me` timeout and captive-page detection.
  - Pass 3 G1/G2 fixed (`a0846b3`): "Try now" replaces a stalled check, and
    the service worker no longer skips `/devices`.
- **Backlog triage (Matt):**
  - RBAC 3847 and 3849–3853 moved to Backlog, renumbered to the roadmap's
    phases, and 3847 refreshed;
  - 3843 and 3855 moved to Backlog;
  - 3856 raised to medium, 3992 raised to high;
  - 3941 extended (events, series, devices);
  - new tasks: 4050–4053 (D34 minors), 4054 (reload prompt), 4055/4056
    (D32 deferred features), 4057 (flaky "Try now" spec), and 4058 (D34
    legacy-token cleanup, **due 2026-11-04**).
- **D35 → COMPLETE** (`stepwise_results/d35_calendar_feed_rotation_COMPLETE.md`).
  - Spec Q1–Q4 answered by Matt.
  - Independent pass 1 gaps G1–G7 all fixed. G6 and G7 went beyond the spec
    at Matt's request.
- **Release** `v2026.10.04`: plan in
  `planning/release_d34_d35_plan.md`; record on PR #11; announced in conv 80.

## Open tasks (PortableMind project 254)

- **Dated:**
  - 3994, the `decimal` advisory check, due **2026-10-30**;
  - 4058, the D34 legacy-token cleanup, due **2026-11-04**.
- **Queue (Matt's order):**
  1. 4054;
  2. 4055 / 4056;
  3. small tasks: 3997, 4001, 4002, 4003, 3942, 3941, 4050–4053, 4057;
  4. 3856 (telemetry).
- **Backlog:** RBAC 3847 + 3849–3853, 3843, 3855.

## Gotchas (new this session)

- **`fly deploy` can hang at "Waiting for depot builder…"** without
  creating a release. Use `--depot=false`, which worked every time.
- **Kill a stuck deploy by the `fly` PID.** `pgrep -f "fly deploy"` matches
  the wrapper shell first.
- **A chained deploy command that removes its worktree at the end will
  still do so after you kill the deploy,** so recreate the worktree before
  retrying.
- **Tests deliver notification email and push inline**
  (`config :rockcut_api, :async_delivery, false`). A push task that outlived
  its test broke the SQLite sandbox for the next test.
- **The calendar feed URL is `/api/calendar/:token.ics` on the API host.**
  Tests that cache feed tokens break, because retiring a `[TEST-TEMP]`
  manager now resets the Taproom feed.
- **The D31 boundary test** flags any `.is_owner` or role read outside
  `Authz`, audit code included. Take values from the changeset instead.
- **The Users & Roles grid shows at most 100 rows.** DEV has many
  `[TEST-TEMP]` users, so give a UI-test person an email that sorts first
  (`a-…@rockcut-test.com`).
