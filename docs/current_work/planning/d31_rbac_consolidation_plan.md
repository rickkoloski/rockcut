# D31: RBAC Consolidation — Implementation Instructions

**Spec:** `d31_rbac_consolidation_spec.md`
**Created:** 2026-09-28
**Branch:** `d31-rbac-consolidation` (stacked on `d30-dev-server-synthetic-accounts`;
retarget once Rick confirms the branch model, workflow §2)
**Process:** `docs/process/three_environment_workflow.md`

---

## Overview

Five phases, one commit (or more) each. Run the **full** API suite after every
step (`cd rockcut_api && MIX_ENV=test mix test`), not just the touched file.
Run `mix format` on touched files only ([[rockcut-mix-format-churn]]).

**The rule for the whole deliverable:** parity tests written in Phase A are
never edited afterwards. If one fails during B–E, the refactor changed
behavior. Stop, find the difference, and ask Matt before touching the test.

| Phase | What | Commit message |
|-------|------|----------------|
| A | Persona fixture + parity suite, green on today's code | `test: D31 authorization parity suite` |
| B | `Authz` API additions (not yet called) + unit tests | `feat: D31 Authz resources, scope/3, managers audience` |
| C | Move callers, one area per commit | `refactor: D31 route <area> through Authz` |
| D | Delete old paths + boundary test | `refactor: D31 remove direct role reads; boundary test` |
| E | UI Brewery route gating + Playwright check | `fix: D31 gate Brewery routes in the UI` |

---

## Prerequisites

- [ ] On branch `d31-rbac-consolidation`; tree clean; spec committed (`deee6d4`).
- [ ] Baseline: `MIX_ENV=test mix test` → 197 passing. Record the number.
- [ ] Local servers only for Phase E (Playwright); A–D are pure ExUnit.

---

## PHASE A — Parity suite

### Step A.1: Persona fixture

**File:** `test/support/persona_fixtures.ex` (new)

```elixir
defmodule RockcutApi.PersonaFixtures do
  @moduledoc "D30 personas for tests: users + memberships from Synthetic.personas/0, no password hashing beyond the fixture default, no scenario data."
  alias RockcutApi.AccountsFixtures
  alias RockcutApi.Seeds.Synthetic

  @doc "Insert every persona (or `keys`); returns %{key => %User{} with memberships preloaded}."
  def personas(keys \\ :all)
end
```

- Create each department a persona references with
  `AccountsFixtures.department_fixture/1`, plus `other` with `assignable: false`
  (needed for row 37 and messaging).
- For each persona: `user_fixture(%{email:, name:, is_owner:, active:, ...})`,
  then `add_membership/3` per `{dept, role}`. Return users re-read with
  `Accounts.get_user!/1` (same preloads as `AuthPlug`).
- `personas/1` accepts a list of keys so a test inserts only what it needs.
- Conn helper for HTTP rows: `bearer(conn, user)`, the per-file helper the
  controller tests already use (`Phoenix.Token.sign(@endpoint, "user auth",
  user.id)`). Define it once in the fixture module instead of per file.

### Step A.2: Parity files

**Directory:** `test/rockcut_api/authz_parity/` (new). One file per area.
Each file holds a list of rows and generates one test per row:

```elixir
@rows [
  # {row_no, persona, description, fun, expected}
  {20, "barMgr", "approves bartender1's request", &review(&1, :bartender1), :allowed},
  {20, "breweryMgr", "approves bartender1's request", &review(&1, :bartender1), :forbidden},
]

for {no, who, desc, fun, expected} <- @rows do
  test "##{no} #{who} #{desc} → #{expected}", ctx do ... end
end
```

Call through the **public entry point that exists today** (context function
or HTTP endpoint), never a private helper, and never a new `Authz` function.
That way the file runs unchanged before and after Phase C.

| File | Rows | Entry points | Must include |
|------|------|--------------|--------------|
| `shifts_test.exs` | 1–7 | `GET/POST/PATCH/DELETE /api/shifts…`, `publish_batch`, `claim` | dualMgr drafts in Bar and Office, not Brewery; splitRole can't draft Brewery; floater claims in both depts; move needs old **and** new dept; draft invisible to employees in list and show |
| `schedule_setup_test.exs` | 8–15 | positions, shift templates, schedule templates, roster | reads allowed for noDept; writes allowed for every manager persona incl. splitRole/dualMgr; denied for office1, noDept, floater |
| `time_off_test.exs` | 16–22 | `TimeOff.list_for/2`, `create`, `review`, `cancel` | list **contents** per persona (assert user ids, not counts); dualMgr sees Bar + Office members only; floater's request visible to barMgr and breweryMgr; splitRole self-approves; bartender1 can't self-approve; cancel requester-only; on-behalf created `approved` |
| `availability_test.exs` | 23–24 | `Availability.list_for/2`, create/delete endpoints | list contents per persona; noDept own-only; manager on-behalf allowed only for members of managed depts |
| `calendar_feeds_test.exs` | 25–26 | `CalendarFeeds.feeds_for/1`, `rotate/3` | entitlement list per persona (subject types and ids); dualMgr rotates Bar and Office, not Brewery; only owners get or rotate `all` |
| `messaging_test.exs` | 28–31 | `Messaging.channels_for/1`, `can_view?/2`, `can_post?/2`, `recipients/1` | channel keys per persona: floater = all + bar + brewery; splitRole = all + managers + bar + brewery; noDept = all; owner = all + managers + every assignable dept; `recipients("managers")` = exactly the manager personas + owners (ids) |
| `people_test.exs` | 33–37 | `/api/users` index/create/update/reset, `PUT memberships` | list contents for dualMgr; splitRole can't update brewer1; non-owner `is_owner` param ignored; last-owner guard with owner2 present/absent; `other` not assignable by owner or manager |
| `owner_only_test.exs` | 38–40 | departments, owner activity | owner and owner2 allowed; every non-owner persona denied |
| `brewing_test.exs` | 41 | one GET per brewing resource (`/api/brands`, `/api/ingredients`, `/api/batches`, `/api/formulas/catalog`) | 200: owner, breweryMgr, brewer1, splitRole, floater; 403: barMgr, bartender1, dualMgr, office1, noDept |
| `own_records_test.exs` | 43 | notifications, push, prefs | each persona sees only their own; one cross-user deny per endpoint |
| `capabilities_test.exs` | 44 | `Accounts.capabilities/1` | full map per active persona, as a literal expected value (the snapshot) |

**Done when:** every file passes on today's code. Commit Phase A. Record the
new test count.

---

## PHASE B — `Authz` additions

**File:** `lib/rockcut_api/authz.ex`; tests in `test/rockcut_api/authz_test.exs`
(extend) — unit tests of the new clauses. Parity files stay untouched.

### Step B.1: `can?/3` clauses

Add the clauses in spec §3.3, each written to reproduce today's code exactly.
Copy the logic from the call site being replaced and cite it in a comment,
e.g. `# was time_off.ex:165-170`.

- Keep `can?(%User{is_owner: true}, _, _) -> true` as the first clause, **except**
  where today's code is not "owner may do anything":
  - `{:memberships, dept_id}` `:assign`: owners still can't assign in a
    non-assignable dept. Check assignability before the owner shortcut, or
    leave assignability in `Accounts` as a data rule (spec §3.3). **Pick the
    latter.**
  - `%TimeOff.Request{}` `:cancel`: requester only, **owners included**
    (`time_off.ex:143-146`). Needs its own clause **above** the owner clause.
  - Check each moved rule for any other owner exception while copying it.
- Replace the Brewing struct clause with `{:module, key}` `:access`, which is
  `owner? or member_of?(user, Atom.to_string(key))`.

### Step B.2: `scope/3`

```elixir
def scope(%User{is_owner: true}, _module, _level), do: :all
def scope(%User{} = user, _module, :manage), do: depts_or_none(managed_department_ids(user))
def scope(%User{} = user, :messaging, :edit), do: depts_or_none(member_department_ids(user))
```

Plus `member_ids_in(scope)`: user ids with a membership in the scoped depts
(`:all` → `:all`, `:none` → `[]`). This replaces the three copies of that
query (`time_off.ex:36-44`, `availability.ex:105-115`, `accounts.ex:245-253`).

Watch for: the owner's messaging channels and `manages_departments` are
**assignable** depts only, not all depts. Callers still filter by assignable
(as today). `:all` means "no department restriction", not "include Other".

### Step B.3: Managers audience

`counts_as_manager?/1` (the current `can_manage_any?/1` body) and
`managers_audience_query/0` (the query from `messaging.ex:147-157`, returning
an `Ecto.Query` so `Messaging` keeps its `Repo.all` and `uniq_by`).

**Done when:** new unit tests pass and the full suite passes (nothing calls
the new code yet). Commit.

---

## PHASE C — Move callers (one commit per bullet)

Full suite after each. Parity files unchanged.

1. **Scheduling list** — `scheduling.ex:246-251` → `scope(user, :schedule, :manage)`.
2. **Time off** — `list_for` → `scope` + `member_ids_in`; `can_view?`,
   `can_review?`, cancel check, on-behalf check → `Authz.can?`. Delete
   `manages_requester_dept?`. Keep `TimeOff.can_view?/can_review?` as thin
   delegates only if controllers call them; otherwise inline `Authz.can?`.
3. **Availability** — `list_for`, `can_manage?`, on-behalf resolution →
   `Authz`; delete `managed_member_ids`.
4. **Calendar feeds** — `entitlements` → `scope` + `can?` for `all`;
   `can_manage_feed?` → `can?(actor, :rotate, {:calendar_feed, type, id})`.
5. **Messaging** — `channels_for`, `can_view?` → `scope(:messaging, :edit)`,
   `counts_as_manager?`; `recipients("managers")` → `managers_audience_query/0`;
   delete `manager?/1`.
6. **Users & memberships** — `user_controller` index/create →
   `can?(actor, :list | :create, %User{})`; update/reset →
   `can?(actor, :update, target)`; `is_owner` param drop →
   `can?(actor, :set_owner, target)`; `list_users_for` → `scope` +
   `member_ids_in`; `membership_controller:18` and
   `authoritative_dept_ids` → `can?(actor, :assign, {:memberships, id})`.
7. **Templates & roster** — `shift_template_controller:47`,
   `schedule_template_controller:16,26`, `roster_controller:14` →
   `can?/3` on the struct / `:roster`.
8. **Departments & owner activity** — `department_controller:15`,
   `owner_activity_controller:10,21` → `can?/3`.
9. **Module plug** — `ModuleAccessPlug` → `can?(user, :access, {:module, m})`.
   Keep the `shared: true` branch as-is (it's "any signed-in user").
10. **Capabilities** — `Accounts.capabilities/1` fields via `scope`,
    `counts_as_manager?`, `can?`. Output must match `capabilities_test.exs`
    exactly.

---

## PHASE D — Delete old paths + boundary test

- Delete `Accounts.can_manage_user?/2`; make `Authz.can_manage_user?/2` accept
  `%User{}` or id (or remove it if Phase C left no callers).
- Delete now-unused `Authz` helpers only if nothing calls them. `role_in/2`,
  `member_of?/2` and `managed_department_ids/1` stay as `Authz` internals.
- Mark the data-invariant lines in `accounts.ex` (last-owner guard, active
  owner count, owner-flag changeset path) with
  `# authz-boundary: data invariant`.
- Add `test/rockcut_api/authz_boundary_test.exs` (spec §3.8): walk
  `lib/**/*.ex`, flag lines matching
  `~r/is_owner|\.role ==|role: "manager"|role_in\(|managed_department_ids\(|can_manage_any\?\(/`,
  skip allowlisted files and lines carrying the marker comment, and fail with
  `file:line` for every hit.
- Verify it bites: temporarily add `if user.is_owner` to a context, see the
  test fail with the right `file:line`, then revert. Note this in the result doc.

Commit.

---

## PHASE E — UI Brewery route gating

**File:** `rockcut-ui/src/App.tsx:458-466`

Wrap the `/brands*`, `/ingredients*`, `/batches*`, `/settings*` routes in
`hasBrewery &&`, as `/brewery` already is. Non-brewery users then fall
through to the catch-all `Navigate to="/"`.

**Files:** the four pages get `data-testid`s on their table and "Add" button
(e.g. `brands-add-button`), in the same commit.

**File:** `rockcut-ui/tests/regression/brewery/route_gating.spec.ts` (new;
workflow §6 layout). Scenarios S1–S3 from the spec:
- `test.use({ storageState: authFile('bartender1') })` and again for
  `barMgr`: for each route, `page.goto(route)`, `await
  expect(page).toHaveURL('/')`, and the `*-add-button` test id has count 0.
- `brewer1`, `floater`, `splitRole`: each route renders its `*-add-button`.
- No `waitForTimeout`; wait on the URL or the element.

**Revert-and-rerun** (workflow §3 local gate): with the `App.tsx` change
reverted, the S1/S2 tests fail; restored, they pass. Record both runs in the
PR. Commit.

---

## Testing

### Automated
- [ ] Phase A parity suite green on the pre-refactor code (commit A).
- [ ] Same files green and **unmodified** at the end (`git diff <commit A> --
      test/rockcut_api/authz_parity/` is empty).
- [ ] Full API suite green; count = baseline + new tests.
- [ ] Boundary test green, and shown to fail on a planted violation.
- [ ] Local gate (workflow §3): `mix test`; `npx tsc --noEmit -p
      tsconfig.app.json && pnpm exec vite build && pnpm lint`; `npx
      playwright test` green including the new regression spec.
- [ ] Revert-and-rerun recorded for `f0ecc07` (position delete) and Phase E.

### PR (after Phase E)
Push the branch and open a PR against `d30-dev-server-synthetic-accounts`
(stacked, like #2; `develop` doesn't exist while workflow §2 is on hold).
Body = the handoff note: SHA, what changed, scenarios S1–S8, migrations:
none, **LIMITATIONS** from spec §3.11, and the revert-and-rerun runs.
Update the body with `gh api -X PATCH repos/rickkoloski/rockcut/pulls/<n> -F body=@file`
(`gh pr edit` fails on this repo).

### DEV gate (workflow §4)
1. Post "DEV: deploying `<sha>` (D31)" in discussion 80.
2. Clean checkout of the SHA; `fly deploy -c fly.dev.toml --remote-only` in
   `rockcut_api`, then `rockcut-ui`; start the API machine if `stopped`.
3. Pre-flight: `synthetic_status()`, then `seed_synthetic()`.
4. `fly releases -a rockcut-api-dev` / `-a rockcut-ui-dev` show the new images.
5. `E2E_TARGET=dev npx playwright test` (full suite).
6. **Independent pass:** a fresh agent gets only the persona keys, S1–S8, the
   DEV URL + token recipe, and §3.11. It reports gaps as path → expected →
   observed → repro. **Blocker:** agent token login is currently refused by
   Claude Code's auto-mode check ([[rockcut-browser-testing]]). Until Matt adds
   a permission rule, Matt signs in for each persona by hand.
7. Verdict in the PR (SHA, pass/fail counts, gaps). Two fix cycles at most,
   then post evidence in discussion 80.
8. Post "DEV: free" in discussion 80.

**No prod deploy in D31** without Matt's go-ahead. Prod still waits on the
branch cleanup (workflow §2, on hold).

---

## Verification Checklist

- [ ] Phases A–E committed in order
- [ ] Parity files unchanged since `f0ecc07` (one comment fixed there; see its commit)
- [ ] `Accounts.can_manage_user?` and the Brewing struct clause removed
- [ ] Boundary test in place and verified
- [ ] PR open with the handoff note; DEV gate passed; verdict in the PR
- [ ] `stepwise_results/d31_rbac_consolidation_COMPLETE.md` written
- [ ] Roadmap: Phase 1 marked complete; CLAUDE.md "Next deliverable" + table updated
- [ ] Backlog 3887 closed; Rick told in discussion 80 (incl. the Brewery-route fix)
