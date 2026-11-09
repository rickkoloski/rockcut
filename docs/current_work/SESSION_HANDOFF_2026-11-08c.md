# Session Handoff: 2026-11-08 (c)

Supersedes `SESSION_HANDOFF_2026-11-08b.md`. **D55 passed its DEV gate and is merged to `develop`
(`1b08caa`, PR #57). It is not on prod.** The release waits on Matt's tablet check.

## FIRST: remind Matt (morning of 2026-11-09)

**Task 5164:** his prod sign-in and the three tablet checks, covering D54 and D53: on each tablet, it
updated (idle, prompt or reopen), still paired, tablet view, no "Sign in as me", a staff code write
works, and Boards open view only (home board + Company). **It gates the D55 release:** D55 removes
`leftoverTabletSession.ts` (commit `35c6c7b`). If any tablet hasn't updated to the D54 app, revert
`35c6c7b` on a branch from `develop` before releasing. While he's at it: create and pair the
brewhouse tablet on prod (Admin → Shared devices, home Brewery), which D50 needs.

## State

| | |
|---|---|
| **Prod** | `v2026.11.08` (D53): API v34 / UI v30. Rollback API v33 / UI v29, snapshot `vs_Byb8e0vN5JnMhenvv030ekG9`. |
| **DEV** | **Free** (conv 80 msg 103367). Runs `c3c3308` (API v76 / UI v79) = `develop`'s app code; reseeded. Pre-D55 DEV snapshot `vs_lb5Qzzp54OASe6pg6K43`. |
| **develop** | `1b08caa` (D55 merged) + this handoff. |
| **D55** | Gate passed on `c3c3308`; verdict on PR #57. Fix cycles used: 1 of 2. |

## D55 release: what's left, in order

1. Matt's check (above); revert `35c6c7b` if needed.
2. The usual release flow (memory `rockcut-deploy-plan`): check main's tree equals a `develop` commit,
   `-s ours` sync PR of `main` into `develop` if needed, release PR `develop` → `main` (squash), **prod
   snapshot** (`fly volumes list -a rockcut-api` first), tag `v2026.11.09` (or the day's date), clean
   worktree of the tag, API deploy (migration runs at boot), UI deploy (`VITE_BUILD_ID=<tag>`), smoke,
   Matt's checks, close-out PR (another `-s ours` sync + docs).
3. **Rollback note:** D55's migration drops `users.legacy_tokens_revoked_at` and
   `user_sessions.device_token_id`. An older API image selects them, so rolling the API back past D55
   needs the pre-release snapshot, not just the old image.
4. Close-out: `stepwise_results/d55_tablets_and_tidy_COMPLETE.md`, CLAUDE.md's table (D55 row), close
   tasks 5120, 5119, 4985, 4983, 4981, 4993, 5165, 4963 (and 5164 once Matt's done).

## What D55 contains (for the release notes)

§2.1 a stray 401 is rechecked with `/api/me` before unpairing or signing out, with a retry banner
mid-session; §2.2 tablet "Page not found"; §2.3 readable 400/413 with CORS in every env; §2.4
memberships 422s; §2.5/§2.10 empty Sort Order = the end (grain bill, category fields, categories);
§2.6 "not found" pages (categories, brands, recipes, ingredients, batches); §2.7 warnings-as-errors;
§2.8 leftovers dropped; §2.9 "Rock Cut Brewing"; §2.11 out-of-range and wrong-type ids → 404/422
(`PathIds`, `ParamIds` plugs; T13 route sweep); §2.12 a missing parent → 422
(`RockcutApi.Changeset.validate_parents/2`, 34 changesets; T14). Final gate: `mix test` 2182, Vitest
242, DEV Playwright green.

## Backlog added today

5203 (9 unlabelled brewing dropdowns), 5204 (shift assigned to a deactivated person), 5205 (blank page
while `/api/me` hangs at start-up), 5206 (unknown Boards card URL shows the board silently).

## Next after D55 (decided by Matt, 2026-11-08)

- **D50 next: spec APPROVED** (`specs/d50_brewhouse_device_spec.md`, task 4934). The brewhouse device
  (any shared device with Chrome 107+, touch or mouse; the old Chromebit can't run the app) works the
  whole schedule with a staff code, plans batches and signs off flags; setup stays read-only. Also the
  template link bug (§2.6: picking a link and pressing Save silently drops it; reproduced locally) and
  link editing on an existing batch's steps (§2.7). Next: branch from `develop` after D55 is released,
  a plan, a builder brief. Matt pairs the brewhouse device on prod.
- **D56** (task 5207): production timing, pre-brew (negative) days and multi-day steps.
- **D57** (task 5208): test results and automatic retests (a failed D-test).
- Also open: a 15-minute decisions session (4991, 4994, 4992, 4984, 5202); schedule events (4055,
  4056, 4261); brewing and polish bundles.

## herdr, worktrees, folders

- Tabs: `lead`, `ops`, `build`, `d55 build` (`builder55`, idle), `d55 dev playwright`,
  `d55 dev deploy`, `d55 qa` (`qa55`, idle). The D55-specific tabs can be closed once the release is
  out; keep `d55 dev deploy`'s pattern for the prod deploy (its own tab).
- **Local servers** (lead tab's api/ui panes) run `~/src/rockcut-d55` on :4002/:5174.
- Worktrees: `~/src/rockcut-d55` (branch, merged), `~/src/rockcut-d55-deploy` (detached at
  `c3c3308`), QA folder `~/src/rockcut-d55-qa` (BRIEF, BRIEF2, scripts, results). Removable once
  released: those, plus `~/src/rockcut-d53`, `rockcut-d53p2`, `rockcut-d53p2-deploy`,
  `rockcut-release-20261108`, `rockcut-d53p1-qa`.
- Logs: `/tmp/claude-501/pwlogs/d55_*.log`.

## Lessons from today

- **Watcher in zsh:** `set -- $R` doesn't split words; use `read ST SQ <<< "$R"` (in memory).
- **QA agents and destructive clicks:** `qa55` revoked a seeded DEV tablet token through a locator
  that matched two cards. BRIEF2's rule (revoke/delete/deactivate only by exact id on the agent's own
  `[TEST-TEMP]` row) belongs in every future QA brief. The seeded token is re-minted by Playwright's
  auth setup, so it healed itself.
- **Order of runs:** a builder's `mix compile --force` during a local Playwright run rebuilt the dev
  server's build mid-run; tell builders not to while a run is going (decisions 5 did).
- **Specs that assert "at the end of a shared list"** race with parallel specs; compare only with rows
  that existed before the test (gap 8 spec).
