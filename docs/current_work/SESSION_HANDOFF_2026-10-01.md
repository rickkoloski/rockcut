# Session Handoff — 2026-10-01

**Purpose:** context preservation before `/clear`. Pick up from here.
Follows `rockcut-d33/docs/current_work/SESSION_HANDOFF_2026-09-30b.md`.

This session (about 00:50–04:30 UTC Oct 1):
- **The security hotfix shipped to prod.**
- **Task 3999 was done.**
- **D33 passed its DEV gate and merged.**
- **Release PR #8 (D31–D33) was drafted** and Rick was asked to review it.

Matt is travelling Oct 1–5 but working. **Staff are on the app now**, and Matt plans to publish next week's schedule to them on it.

---

## Where things are

| Environment | State |
|---|---|
| **Prod** | `rockcut-api` **v20** / `rockcut-ui` **v16** = **`v2026.10.01`** (`0e0e025`, the security hotfix), deployed about 01:55 UTC Oct 1. **24-hour watch until about 01:55 UTC Oct 2**; clean so far (0 errors at 04:25). Rollback targets: API v19 `…01M3GC4S93TNVW3985CE94P6TC`, UI v15 `…01M3GC6TF2V8EMV2GCNBQN1PFV`. |
| **DEV** | `rockcut-api-dev` v14 / `rockcut-ui-dev` v9 = `921dfd8` (`develop`'s code). **Free** (conv 80, msg 83614). Reseeded; only the `[SEED] Playwright tablet` is paired. |

**GitHub (`rickkoloski/rockcut`):**
- `main` = `0e0e025`, tag `v2026.10.01`.
- `develop` = `073efac` plus this handoff commit. Default branch; protected against force-push and delete; PRs not required.
- PRs:
  - **#5** (D33): merged;
  - **#6** (hotfix → `main`): merged;
  - **#7** (3999): merged;
  - **#8**: the release, **`develop` → `main`, DRAFT**, waiting on Rick's review and Matt's window.

## 1. Next: the D31–D33 release (PR #8)

The PR body has the full plan, migrations, config and rollback. Local copy: `~/src/rockcut-release-notes/PR_BODY.md`.

- **Asked Rick to review** (conv 80, msg 83615). Matt said he thinks it's ready, but it's his first real feature change to prod since the initial deploy. **Check for Rick's reply first.**
- **Window:** after the hotfix watch ends (about 01:55 UTC Oct 2), at a quiet time when Matt can watch the logs. **Not in the middle of publishing next week's schedule.**
- **Open decision:** include task 4003, the one-line nginx manifest content-type fix? Including it means a DEV redeploy and check first.
- **Plan:**
  1. Volume snapshot: `fly volumes snapshots create vol_rkgemljzzkozz3w4 -a rockcut-api`.
  2. Merge `--no-ff`, tag `vYYYY.MM.DD`.
  3. Deploy the API, then the UI, from a clean checkout of the tag with `--no-cache`. Migrations run at boot.
  4. Smoke:
     - all 5 migrations are up;
     - the department is named "Taproom";
     - `node rockcut-ui/scripts/check-bundle-versions.mjs https://rockcut-ui.fly.dev`;
     - `pnpm audit --prod` and `mix hex.audit`;
     - Matt's login.
  5. Shared-devices setup on prod, **the next day**.
- **Watch list I gave Matt:**
  - **Before:** check that prod's department is named exactly "Bar", plus position groups "Bar" (the rename only matches that). Take a copy of next week's schedule to compare. Matt declined both tonight; offer again before the window.
  - **After:**
    - **the single DB connection** (`connection not available … dropped from queue`, `database is locked`, slow requests). Fix: `fly secrets set POOL_SIZE=5 -a rockcut-api`;
    - shifts that cross midnight land on the same days (D32's Colorado day bounds);
    - one real manager and one real employee log in (D31 rewired every permission check);
    - calendar feeds still refresh;
    - shift reminders and pushes still arrive.
  - **Tell staff:** Bar is now Taproom, there's a new events row, and close and reopen the app if it looks old.
- **After the release:**
  - COMPLETE records for D32 and D33, and the CLAUDE.md Completed table (D31 is already done). Update CLAUDE.md's "Next deliverable" line too; it's stale.
  - Close tasks 3887, 3937, 3938, 3939, 3940 and 3999.
  - Report in conv 80.

## 2. What happened this session

**Security hotfix (#4059):**
- Rick OK'd the axios dependencies (83548) and added a check: after each deploy, the deployed bundle must contain axios ≥ 1.20.
- Commits `26ec9c2`, `f728e47`, `a819ff1`; PR #6.
- DEV: Playwright 9/9, and web push confirmed end to end.
- Prod `v2026.10.01`:
  - smoke all green; axios 1.20.0 in both bundles;
  - audits: API shows only the accepted `decimal` advisory, UI shows 0;
  - Matt's login works.
- Step 9: `main` merged into `develop` (`bc19d07`; a `mix.lock` conflict with `tz`, both kept), then into D33. Report in conv 80, msg 83592.
- **DEV's VAPID private key was malformed** (48 characters containing a `.`), so every push send on DEV had failed silently. Regenerated straight into Fly secrets; the values were never displayed. Prod's keys were checked read-only: well-formed and matching.

**Task 3999 (PR #7, merged as `30e43a4`):**
- Rick chose option A (83601).
- `datagrid-extended` is vendored at `rockcut-ui/vendor/datagrid-extended` (a plain MUI grid, which is the intended behavior). The link, `package.docker.json`, `pnpm-workspace.docker.yaml` and the shim are gone.
- The Docker build uses `pnpm install --frozen-lockfile`, with pnpm pinned at 12.3.4 via `packageManager`. Prod images had been built with `pnpm@latest`, which is 12.8.1.
- `tsc` now has **0 errors**, down from 3.
- New script `rockcut-ui/scripts/check-bundle-versions.mjs` is in the workflow §5 smoke.
- `~/src/shared` is no longer needed on `develop`.

**D33 (PR #5, merged as `073efac`):**
- Merged with `develop`.
- `921dfd8`:
  - **PWA `orientation: 'any'`** (it was `portrait`, which Android enforces). **The bar tablets are Samsung Android tablets mounted in landscape.**
  - `taproom_tablet_setup.md` rewritten for Samsung with Chrome: Chrome only, Pin windows, Never sleeping apps.
- DEV gate:
  - Playwright **94/94**;
  - QA pass 2 (`stepwise_results/d33_dev_pass_2_qa_report.md`): **S1–S14 and G1–G9 all pass**, at 1280×800 landscape;
  - **S13 on Matt's Pixel**, as an installed Chrome app: back on the shared screen after the screen was off for more than 5 minutes. The Pixel was revoked afterwards;
  - 429 confirmed.
- The DEV owner's 7 calendar feeds were rotated. Verdict comment on PR #5.

## Backlog (PortableMind project 254)

| Task | What |
|---|---|
| 3991 | sign-out doesn't revoke a person's token server-side (QA pass 2, gap 1) |
| 3992 | calendar feeds survive user deactivation |
| 3994 | monthly `decimal` DoS check, due 2026-10-30 |
| 3997 | remove `/live` (Matt assigns the number) |
| **4001** | a tablet's blocked or unknown channel URL redirects silently instead of showing "Not available" |
| **4002** | shared-device header cramped at phone width |
| **4003** | nginx serves `manifest.webmanifest` as octet-stream (a one-line fix) |
| (idea, no task) | a "new version available, tap to reload" prompt. After a deploy the first load is the cached old app; Matt hit this on DEV. Raise it if staff get confused after the release. |

## Housekeeping (not done; safe to do any time)

- Remove the worktrees: `git -C ~/src/rockcut worktree remove ../rockcut-hotfix` (likewise `rockcut-hotfix-deploy`, `rockcut-3999`). Keep `rockcut-d33` until the release is out, or remove it as well; the branch is merged.
- Remove the folders `~/src/rockcut-hotfix-notes`, `~/src/rockcut-d33-qa-2` (QA scripts and copies of persona sign-in files that expire in 8 hours) and, after the release, `~/src/rockcut-release-notes`.
- `~/src/shared/ui-components/datagrid-extended` is no longer used by `develop`.

## Gotchas (new this session)

- **`develop`'s UI needs `develop`'s API.** Deploying only the UI to DEV over an older API failed 24 events tests. Deploy both from the same commit.
- **Cached PWA after a deploy:** the first load serves the old build (`autoUpdate` plus `skipWaiting`). Reload once more. Matt "couldn't see Shared devices" because of this.
- **A Fly remote `--build-only --no-cache`** tests an image without releasing it. There's no Docker on this machine.
- **Don't pipe `fly deploy` into `head`.** It can cut the build short; log to a file instead.
- **Every new worktree needs `rockcut-ui/.env.test.local`** (gitignored) for the 2 Playwright login tests, or they skip. Copy it without reading it.
- **A manager doesn't see "Add shared device".** Creating the device account is owner-only (spec Q2); managers pair and revoke.
- **`gh pr edit` fails** (deprecated classic Projects). Use `gh api -X PATCH repos/rickkoloski/rockcut/pulls/N -F body=@file`.
- **Herdr panes didn't keep their agents** across the session restart. Start new agents with `herdr agent start` (the `qa` role flags are in the workflow doc §3).
- **The QA brief template** for a DEV pass is in `~/src/rockcut-d33-qa-2/BRIEF.md`: persona storage states copied into `auth/`, `node_modules` linked to the worktree, and the agent restricted with `--disallowedTools`.
