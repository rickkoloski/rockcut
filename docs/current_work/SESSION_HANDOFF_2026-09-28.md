# Session Handoff — 2026-09-28

**Purpose:** Context preservation before closing. Pick up from here.
Follows `SESSION_HANDOFF_2026-09-26.md`. This session:
- walked DEV as three personas;
- adopted Rick's three-environment workflow;
- **built D31 (RBAC consolidation) through its local gate and opened PR #3.**

D31's **DEV gate has not run yet.**

---

## Project

**Rockcut Brewing Co** — Phoenix 1.8 / Elixir / **SQLite** (API :4002) · React 19 /
Vite / MUI 7 / pnpm (UI :5174) · PWA · Fly.io (`rockcut` org). See `CLAUDE.md`.
Memories: `rockcut-local-dev-native`, `rockcut-pwa-testing`,
`rockcut-mix-format-churn`, `rockcut-deploy-plan`, `rockcut-browser-testing` (new).

| Environment | API | UI | Notes |
|---|---|---|---|
| **Prod** | `rockcut-api` **v19** | `rockcut-ui` **v15** | unchanged this session (D28 + D30 code). Rollback: API v18, UI v14 |
| **DEV** | `rockcut-api-dev` | `rockcut-ui-dev` | still D30 code; D31 not deployed yet |
| **Local** | :4002 | :5174 | servers stopped at end of session |

**Branch:** `d31-rbac-consolidation` (off `d30-dev-server-synthetic-accounts`),
pushed, including this handoff. PR #3's head is the handoff commit (docs only);
the **DEV SHA stays `2e28039`**, the last code commit, as the PR description says.

**PRs (all open, stacked, none reviewed):**
- **#1** `d28-production-deploy-readiness` → `scheduler-pwa`
- **#2** `d30-dev-server-synthetic-accounts` → `d28-production-deploy-readiness`
- **#3** `d31-rbac-consolidation` → `d30-dev-server-synthetic-accounts`
  (https://github.com/rickkoloski/rockcut/pull/3). DEV SHA **`2e28039`**.
- ⚠️ **Don't merge, retarget, move `main`, create `develop`, or delete branches.**
  Rick put the workflow §2 cleanup **on hold** (msg 81856) and wants to discuss it
  in person (81857). Prod still runs code that isn't on `main`.

**Tests:** `cd rockcut_api && MIX_ENV=test mix test` → **605 passing** (197 at
session start). Playwright local: 28 passed, 1 skipped (DEV-only banner test).

**Next:** the D31 **DEV gate** (see Resume instructions).

---

## What happened this session

### Rick (discussion 80)
- **80659–80663** (09-27): suggested an agent log in and click through the
  menus, and promised a process doc.
- **81853** (Matt → Rick): the DEV walkthrough results.
- **81855:** the three-environment process blueprint (PortableMind file #4003).
  It answers the 80658 question: **keep the secret seed password + minted
  tokens** (closed).
- **81856:** the §2 branch cleanup is **not** approved yet. Hold off on all
  branch operations.
- **81857:** discuss the branch cleanup at the next in-person session.

### DEV walkthrough (Playwright MCP)
- **Browser tooling:** Claude in Chrome was never reachable from Claude Code.
  Installed **Playwright MCP at user scope**, pointed at the cached ARM Chromium.
  Details in memory `rockcut-browser-testing`.
- **Token logins are blocked:** Claude Code's auto-mode check refuses agent
  token injection ("Credential Materialization"), including via a generated
  init-script. So Matt signed in by hand as `owner`, `barMgr` and
  `bartender1`, and the agent clicked through.
- **Results:**
  - All pages loaded and each role's menus were correct.
  - **Bug:** non-brewery users could open `/brands`, `/ingredients`,
    `/batches` and `/settings` by URL and see an empty table with an "Add"
    button, while the API returned 403. Fixed in D31.
  - **Seed gaps:** no brewing data; the "current week" data is stale; the
    owner's change log is empty.

### Process
- `docs/process/three_environment_workflow.md` is committed (Rick's doc, with
  the §2 hold noted at the top) and linked from CLAUDE.md. **Read it at the
  start of every deliverable.**

### D31 — RBAC consolidation (PR #3)
Spec: `specs/d31_rbac_consolidation_spec.md`. Plan:
`planning/d31_rbac_consolidation_plan.md`. Matt's decisions:
- Brewing gate goes through `Authz`.
- Persona fixture uses direct inserts.
- The UI route fix is included.
- `capabilities/1` stays in `Accounts`.

**Phases:**
- **A — parity suite** (`3e4904e`): 394 persona × decision tests in
  `test/rockcut_api/authz_parity/`. Written green on the pre-refactor code and
  unchanged since `f0ecc07`.
- **Position-delete bug** (`f0ecc07`): deleting a position used by a schedule
  template returned 500. Fixed.
- **B — `Authz` API** (`4c2a3a7`): `can?/3` over every area; `scope/3`,
  `member_ids_in/1`, `counts_as_manager?/1`, `managers_audience_query/0`.
- **C — callers moved:** 10 commits, `8239ec7` … `bbdbf53`.
- **D — cleanup + boundary test** (`0c4c301`): removed `Accounts.can_manage_user?`,
  `Authz.can_manage_any?` and `managed_department_keys`. Added
  `authz_boundary_test.exs` and verified it with a planted violation.
- **E — UI route gating** (`2e28039`): `App.tsx` plus
  `tests/regression/brewery/route_gating.spec.ts`. Revert-and-rerun: 8 failed
  without the fix, 21 passed with it.

**Local gate:** `mix test`, `vite build` and Playwright are green.
**`tsc` (3 errors) and `pnpm lint` (27 problems) were waived by Matt**; both
failures existed before D31. The type errors are in the shared
`datagrid-extended` package; the lint problems are in 17 older files.

**Behavior worth knowing, found and preserved by the parity suite:**
- Time-off cancel is requester-only, **owners included**.
- An owner has no channel for "Other" but does get an "Other" calendar feed.
- Unknown calendar-feed types are refused even for owners.
- A manager's membership PUT that lists any unmanaged department is refused
  (403), even when that entry is unchanged.
- User create with **no** memberships is allowed for any manager. D29 §6 C
  changes this in Phase 2.
- `TimeOff.can_view?/2` had no callers (deleted).

---

## Open items

1. **D31 DEV gate** (workflow §4). **Blocker:** the independent agent pass can't
   log in with tokens until Matt adds a permission rule. Otherwise Matt signs
   in by hand per persona.
2. **Branch model** (workflow §2): waiting on Rick; in-person discussion.
   PRs #1–#3 stay open.
3. **Matt to confirm on prod** (carried over): a wrong password shows "Invalid
   credentials".
4. **Backlog tasks to create** (PortableMind 254):
   - DEV data: re-seed before each session or weekly; brewing sample data;
     owner change-log entries (workflow §7).
   - Build SHA on `/api/health` and in the DEV ribbon (workflow §8).
   - Fix the waived `tsc` and lint failures.
5. **Stale backlog tasks 3849–3853** (carried over) still describe the old
   phase plan.
6. **Optional:** rotate the seed password (carried over from 09-26).
7. **After D31 lands:**
   - stepwise result `d31_rbac_consolidation_COMPLETE.md`;
   - roadmap Phase 1 marked complete;
   - CLAUDE.md "Next deliverable" and the Completed table;
   - close backlog 3887;
   - tell Rick.

---

## Gotchas

- **Parity files are frozen.** If one fails, behavior changed. Stop and ask;
  never edit the test. Check with
  `git diff f0ecc07 -- rockcut_api/test/rockcut_api/authz_parity/`.
- **Boundary test:** a new owner or role check outside `Authz` fails
  `authz_boundary_test.exs`. For a genuine data rule, put
  `# authz-boundary: data invariant` on the line above it.
- **Owner-shortcut trap:** `can?(%User{is_owner: true}, …) -> true` comes
  early, so a rule that must bind owners goes **above** it. There are three
  today: cancel, channels, and feed types.
- **Playwright MCP runs `--isolated`:** logins are lost when the browser
  restarts between turns. The window is ~761px wide, so the nav is the mobile
  drawer (hamburger).
- **`gh pr edit` fails** on this repo. Use
  `gh api -X PATCH repos/rickkoloski/rockcut/pulls/<n> -F body=@file`.
- **Formatting:** don't run repo-wide `mix format` or `mix precommit`; format
  touched files only.
- **Test users:** `PersonaFixtures` inserts personas with a placeholder password
  hash, because full-cost Argon2 in tests is slow. Log in by token
  (`as/1`, `call/4`, `status/4`).

---

## Resume instructions

1. Read `docs/process/three_environment_workflow.md`, then check discussion 80
   for anything after 81857, and PR #1–#3 status.
2. Sanity: `curl https://rockcut-api.fly.dev/api/health` and
   `curl https://rockcut-api-dev.fly.dev/api/health`.
3. With Matt's go-ahead, **run the D31 DEV gate**, per the plan's "DEV gate"
   section and PR #3:
   1. Post "DEV: deploying `2e28039` (D31)" in discussion 80.
   2. From a clean checkout of `2e28039`, `fly deploy -c fly.dev.toml --remote-only`
      in `rockcut_api`, then in `rockcut-ui`. Start the machine if it's stopped.
   3. Run `synthetic_status()`, then `seed_synthetic()`.
   4. Check `fly releases` for both DEV apps.
   5. Run `E2E_TARGET=dev npx playwright test`.
   6. Independent pass over S1–S8 (token rule, or Matt signs in).
   7. Post the verdict in PR #3 and "DEV: free" in discussion 80.
