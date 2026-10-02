# D31: RBAC Consolidation — Completion Record

**Status:** DEV gate passed (2026-09-29). **Not yet merged or on prod:** merging
waits on the workflow §2 branch cleanup, which is on hold until Matt and Rick
discuss it in person.
**Spec:** `specs/d31_rbac_consolidation_spec.md` · **Plan:** `planning/d31_rbac_consolidation_plan.md`
**Concept:** 06_auth_roles · roadmap Phase 1 (`planning/rbac_configurable_authorization_roadmap.md`)
**Branch:** `d31-rbac-consolidation` (off `d30-dev-server-synthetic-accounts`), PR #3. Code SHA **`2e28039`**.
**Backlog:** PortableMind project 254, task 3887 (in progress until merged and released)

---

## Summary

Every authorization decision now goes through `RockcutApi.Authz`. Before D31,
`can?/3` was called only by the shift and position controllers; ~46 other
decisions read `is_owner` or `memberships.role` directly across ~15 files.

A parity suite was written first, **green on the pre-refactor code**, and not
edited since. It proves the refactor changed no observable behavior. The one
intended change is in the UI: Brewery pages are now gated by route (the
blank-table bug from Matt's DEV walkthrough, 81853).

---

## What shipped

- **Parity suite** (`test/rockcut_api/authz_parity/`, 11 files): 394 persona ×
  decision tests over the D29 inventory, using a direct-insert
  `PersonaFixtures`. Frozen since `f0ecc07`.
- **`Authz` API:**
  - `can?/3` over every area: shifts, positions, templates, roster, time off,
    availability, calendar feeds, channels, people, memberships, departments,
    owner activity, modules;
  - `scope/3` for list queries;
  - `member_ids_in/1`, `counts_as_manager?/1`, `managers_audience_query/0`.
- **Callers moved** (10 commits `8239ec7` … `bbdbf53`):
  - contexts: time off, availability, calendar feeds, messaging, scheduling, accounts;
  - 7 controllers;
  - the module access plug;
  - `/api/me` capabilities.
- **Old paths removed:** `Accounts.can_manage_user?`,
  `Authz.can_manage_any?`, `managed_department_keys`, the unused Brewing struct
  clause, and `TimeOff.can_view?/2` (it had no callers).
- **Boundary test** (`authz_boundary_test.exs`): a new owner or role check
  outside `Authz` fails the build. It was verified with a planted violation. A
  genuine data rule can be marked `# authz-boundary: data invariant`.
- **UI route gating:** `App.tsx` redirects non-Brewery users away from
  `/brands`, `/ingredients`, `/batches`, `/settings` and `/brewery`. The Add
  buttons have `data-testid`s. Regression spec:
  `tests/regression/brewery/route_gating.spec.ts`.
- **Bug fixed along the way** (`f0ecc07`): deleting a position used by a
  schedule template returned 500. It now deactivates the position instead.

41 files changed, +2761 / −266 (`git diff --stat 49ca92f 2e28039`). No migrations.

## Behavior the parity suite found and kept

- Time-off cancel is requester-only, **owners included**.
- An owner has no "Other" channel but does get an "Other" calendar feed.
- Unknown calendar-feed types are refused, even for owners.
- A manager's membership PUT that lists any unmanaged department is refused
  (403), even when that entry is unchanged.
- Creating a user with **no** memberships is allowed for any manager. The D29
  §6 C change (roadmap Phase 2) will change this.

Three rules bind owners and therefore sit **above** the owner shortcut in
`can?/3`: cancel, channels, and feed types.

---

## Testing

### Local gate (2026-09-28)
- [x] `MIX_ENV=test mix test`: **605 passing** (197 before D31).
- [x] `vite build` green. Playwright local: 28 passed, 1 skipped (the DEV-only banner test).
- [x] Revert-and-rerun on the route fix: 8 failed without it, 21 passed with it.
- [x] **Waived by Matt:** `tsc` (3 errors, in the shared `datagrid-extended`
      package) and `pnpm lint` (27 problems in 17 older files). Both failed before D31.

### DEV gate (2026-09-29)
- [x] Clean checkout of `2e28039` deployed: `rockcut-api-dev` v3, `rockcut-ui-dev` v2.
- [x] Pre-flight: `synthetic_status()` 17/17, then `seed_synthetic()`.
- [x] `E2E_TARGET=dev npx playwright test`: **29 passed, 0 failed**.
- [x] **Independent pass** (a fresh agent with only the scenarios, persona keys,
      DEV URL, token recipe and §3.11): **S1–S8 all PASS**, with extra coverage as
      bartender2, office1, sales1, hidden, noDept, breweryMgr, brewer2 and owner2.
      It logged in through the harness's storageState files and never handled a token.
- [x] Verdict on PR #3 (comment 5903799771). DEV released in discussion 80 (82601).
- Fix cycles used: 0. Box-only findings: none.

---

## Deviations from Spec

- None in behavior.
- `tsc` and lint gate items were waived by Matt (pre-existing failures, recorded above).

---

## Follow-Up Items

- [ ] **Merge and release:** waits on the workflow §2 branch cleanup (Rick, in
      person). Then: merge to `develop`, release PR → `main`, tag, prod deploy
      and smoke, close backlog 3887.
- [ ] **3939:** a forbidden or unknown channel URL renders as a working channel
      and sending fails silently (found on DEV; predates D31). Fix in D33.
- [ ] **3940:** Add shift defaults to today instead of the week being viewed
      (found on DEV; predates D31).
- [ ] **3941:** `seed_synthetic()` doesn't clean `[TEST-TEMP]` users or brands.
- [ ] Fix the waived `tsc` and lint failures (backlog task still to be created).
- [ ] Build SHA on `/api/health` and in the DEV ribbon (workflow §8). The
      independent pass couldn't confirm the build from the app itself.

---

## Notes

- **Agent logins on DEV:** Claude Code's auto-mode check refuses an agent that
  reads or injects a persona token. What works: the Playwright run mints tokens
  straight into `tests/.playwright-auth/<persona>.json` (gitignored), and the
  independent agent's throwaway scripts pass those paths as `storageState`. The
  token never enters the model's context. Use this for every later DEV gate.
- Next: D32 (schedule events + Taproom rename) branches from this branch, and D33
  (taproom device access) builds on D32.
