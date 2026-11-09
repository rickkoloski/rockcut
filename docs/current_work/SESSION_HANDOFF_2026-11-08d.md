# Session Handoff: 2026-11-08 (d)

Supersedes `SESSION_HANDOFF_2026-11-08c.md`.

- **D55 is on prod** as `v2026.11.08-2`, shipped with D54's tablet shim kept.
- **D50 passed its local gate**; its draft PR is #58.

## FIRST: remind Matt (morning of 2026-11-09)

**Task 5164.** The checks now cover D53, D54 and D55.
- **Prod:** his own sign-in.
- **On each tablet:**
  - it updated (idle, prompt or reopen);
  - it's still paired and in tablet view;
  - no "Sign in as me";
  - a staff code write works;
  - Boards open view only (home board + Company).
- **Also:** create and pair the brewhouse device on prod (Admin → Shared devices, home Brewery).

Once every tablet is confirmed, re-apply `35c6c7b` (the shim removal) in a later release. D50's is the
natural one.

## State

| | |
|---|---|
| **Prod** | `v2026.11.08-2` (D55; release PR #60 squash `b248d65`): API v35 `…deployment-01M6Z7HP49YRH2YQZC1B013JVH`, UI v31 `…deployment-01M6Z7KPQ5MA6TQG23J1GYDPP1`. **Rollback past D55 needs snapshot `vs_Aqb8a3KXyAnRCwp3lP5lok3q`**, then API v34 / UI v30. |
| **DEV** | Free. It runs `c3c3308` (D55 without #59). |
| **develop** | D55 plus #59 (shim kept) plus this close-out (`-s ours` sync of `main`). |
| **D50** | Branch `d50-brewhouse-device`, draft PR #58, worktree `~/src/rockcut-d50`. `develop` merged in after the close-out. Local gate green: Playwright 691 passed, 1 skipped; `mix test` 2214 ×2; vitest 250. |

## NEXT: D50's DEV gate (needs Matt's OK; it posts in conv 80)

1. Claim DEV in conv 80.
2. Take a DEV snapshot, deploy `d50-brewhouse-device` (API then UI), reseed.
3. Run the full DEV Playwright suite in its own tab.
4. Run an independent QA pass at 1280×800 touch and 1366×768 mouse:
   - a QA folder `~/src/rockcut-d50-qa` with a brief;
   - **the destructive-by-id rule in the brief**;
   - covering the spec §4 scenarios plus the §6 regression sweep.
5. Fix cycles, then take the PR out of draft, merge, and release.
   - Re-remove the shim in that release if Matt's tablet check passed.

## herdr, worktrees, folders

- **Tabs:**
  - `lead`: its api/ui panes run `~/src/rockcut-d50` on :4002/:5174;
  - `ops`, `build`;
  - `d50 build` (`builder50`, idle at Stop 3);
  - `d50 local playwright`;
  - `d55 prod deploy`;
  - the older `d55 dev playwright` and `d55 dev deploy` tabs can be closed.
- **Worktrees removable now:**
  - `~/src/rockcut-d55`, `rockcut-d55-deploy`, `rockcut-d55-shim`;
  - `rockcut-release-20261108`, `rockcut-release-20261108-2`, `rockcut-closeout`;
  - `rockcut-d53`, `rockcut-d53p2`, `rockcut-d53p2-deploy`;
  - QA folders `rockcut-d55-qa`, `rockcut-d53p1-qa`.
- **D50 docs:**
  - `planning/d50_brewhouse_device_plan.md`;
  - `prompts/d50_builder_brief.md`;
  - `prompts/d50_lead_decisions_1.md` and `_2.md`;
  - `prompts/d50_builder_status.md`.

## Lessons from today

- **Playwright from another branch's UI:** `auth.setup.ts` mints tokens with `mix` in
  `../rockcut_api`. To run a spec against a different worktree's UI, keep the API worktree's tests
  folder and only swap the UI server.
- **A builder's `pnpm` in the wrong folder** left `rockcut_api/pnpm-lock.yaml` and
  `rockcut_api/node_modules` behind (the old scaffold `package.json`). Check `git status --ignored` at
  each stop.
