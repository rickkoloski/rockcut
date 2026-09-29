# D31: RBAC Consolidation — Specification

**Status:** Approved — decisions recorded (§6), Matt 2026-09-28
**Created:** 2026-09-28
**Author:** Matt + CC
**Depends On:** D29 (capability model, decision inventory), D30 (synthetic personas), D10–D25 (the code being consolidated)
**Roadmap:** `planning/rbac_configurable_authorization_roadmap.md` (Phase 1)
**Backlog:** PortableMind Product Backlog project 254 — epic 3847, task 3887

---

## 1. Problem Statement

D29 found that `Authz.can?/3` is called only by `shift_controller` and
`position_controller`. The other authorization decisions (D29 Appendix A) read
`is_owner`, `memberships.role`, `Authz.role_in/2`, `can_manage_any?/1` or
`managed_department_ids/1` directly, spread across ~15 files. Two functions
named `can_manage_user?` exist (`Authz`, by id; `Accounts`, by struct).

The resolver (roadmap Phase 2) and roles-as-data (Phase 3) can only replace
`Authz` internals. Until every decision goes **through** `Authz`, changing its
internals would silently leave most of the app on the old rules.

D31 makes `Authz` the **only** place that turns "who is this user" into "may
they do this", and proves with tests that **nothing observable changes**.

---

## 2. Requirements

### Functional

- [ ] **Parity tests first.** A persona × decision test suite covering every
      D29 Appendix-A row of kind check / list / self / derived / owner
      (rows 1–41, 43), green against the **current** code before any refactor
      (§3.2).
- [ ] **Item decisions via `Authz.can?/3`.** Every yes/no decision in
      contexts and controllers calls `can?/3` with a resource (§3.3).
- [ ] **List decisions via `Authz.scope/3`.** The four scoped list queries and
      calendar-feed entitlements use one scope function (§3.4).
- [ ] **Role-derived audiences via `Authz`.** The Managers-channel audience
      (visibility and recipients) comes from one `Authz` function (§3.5).
- [ ] **One `can_manage_user?`.** `Accounts.can_manage_user?/2` removed;
      callers use `Authz` (§3.3).
- [ ] **Brewing gate through `Authz`.** `ModuleAccessPlug` asks `Authz`; the
      dead Brewing `can?/3` clause is replaced (§3.6).
- [ ] **`/api/me` unchanged.** `capabilities/1` returns the same shape and
      values, computed from `Authz` (§3.7).
- [ ] **Boundary test.** A test fails if code outside the allowlist reads the
      role model for an access decision (§3.8).
- [ ] **UI: gate the Brewery pages** in the router like `/brewery` already is
      (§3.9).

### Non-Functional

- [ ] **No behavior change.** Every parity test written in step 1 passes,
      unmodified, at the end. The only deliberate change (D29 §6 C,
      department-scoped managers) is **not** in D31; it lands in Phase 2.
- [ ] **Security:** the server stays the only enforcement boundary; the UI
      change in §3.9 is convenience.
- [ ] **Performance:** no extra queries per request beyond what the replaced
      code ran (list scopes stay single queries; memberships are already
      preloaded by `AuthPlug`).

---

## 3. Design

### 3.1 Order of work

1. **Persona fixture + parity suite** (§3.2) — written and passing on today's
   code. Commit.
2. **`Authz` API additions** (§3.3–3.5) — new clauses and functions,
   implemented with today's rules and unit-tested, but not yet called.
3. **Move callers**, one area per commit, full suite after each:
   scheduling lists → time off → availability → calendar feeds → messaging →
   users/memberships → templates/roster → departments/owner activity →
   module plug → `capabilities/1`.
4. **Delete the old paths** (`Accounts.can_manage_user?`, the Brewing clause,
   now-unused helpers) and turn on the boundary test (§3.8).
5. **UI router gating** (§3.9).

Any parity test that has to change during steps 2–5 means behavior changed:
stop and raise it, don't edit the test.

### 3.2 Parity tests

**Personas.** Use the D30 personas so the tests, DEV, and the Playwright
suite share one vocabulary. A new `test/support/persona_case.ex` builds them
from `RockcutApi.Seeds.Synthetic.personas/0` (the single source of truth for
keys, names and memberships). It inserts users + memberships directly from
`personas/0`: no password and no scenario data; each test adds only the
records it needs (decided, §6 Q2).

**Personas exercised** (each covers a distinct shape):

| Persona | Shape |
|---------|-------|
| `owner`, `owner2` | owner flag, no memberships; two owners for the last-owner guard |
| `breweryMgr` | manager in the bound (Brewery) department |
| `barMgr` | manager, single department |
| `dualMgr` | manager in two departments (Bar, Office) |
| `splitRole` | manager in Bar, employee in Brewery |
| `brewer1` | employee in the bound department |
| `bartender1` | employee, single department |
| `floater` | employee in two departments |
| `office1`, `sales1` | employees in departments with no app pages |
| `noDept` | active, no memberships (baseline only) |

**Shape of the suite.** One file per module area under
`test/rockcut_api/authz_parity/`, each a table of
`{persona, action, target, expected}` rows run through the **public entry
point that exists today** (the context function or the HTTP endpoint), so
the same test runs unchanged before and after the refactor. Each row names
its Appendix-A number in the test name, e.g.
`"#20 time off review: barMgr approves bartender1 → allowed"`.

**Coverage required per Appendix-A row** — at least one allow and one deny,
plus the edge personas where the rule has one:

| Rows | Area | Existing tests | Parity additions |
|------|------|----------------|------------------|
| 1–7 | shifts | `authz_scheduling_test`, `shift_controller_test` | dualMgr in each of its depts; splitRole can't draft Brewery; floater claims in both depts; move needs both depts |
| 8–15 | positions, templates, roster | one allow/deny each | office1/noDept denied; dualMgr/splitRole allowed ("any manager") |
| 16–22 | time off | good controller coverage | list contents per persona (dualMgr sees Bar + Office members, not Brewery); self-review for splitRole; floater's request visible to both dept managers |
| 23–24 | availability | good controller coverage | list contents per persona; noDept own-only |
| 25–26 | calendar feeds | 3 tests | entitlements list per persona; dualMgr rotates both dept feeds, not Brewery's |
| 28–31 | messaging | 4 tests | channel list per persona (floater: Bar + Brewery; splitRole: Managers + Bar + Brewery; noDept: All-staff only); recipients of Managers = exactly managers + owners |
| 33–37 | users, memberships, owner flag | good coverage | list contents for dualMgr; splitRole can't manage brewer1; non-owner `is_owner` param dropped; "Other" not assignable |
| 38–40 | departments, owner activity | 1 test | owner2 allowed; every non-owner denied |
| 41 | brewing routes | `authz_test` (dead clause only) | HTTP: brewer1/breweryMgr/splitRole/floater 200; barMgr/bartender1/noDept 403 |
| 43 | own notifications/push/prefs | controller tests | one cross-user deny per endpoint |
| 44 | `/api/me` capabilities | 2 tests | snapshot of the full capabilities map for every persona |

Row 27 (public ICS fetch) and row 42 (no callers) need no parity test.
Rows 45–48 are UI; §3.9 covers the one UI change.

### 3.3 `Authz.can?/3` — item decisions

Resource conventions:

- A **struct** when the decision is about a record: `%Shift{}`, `%Position{}`,
  `%TimeOff.Request{}` (with `user.memberships` preloaded, as today),
  `%Availability.Slot{}`, `%User{}` (the target user), `%ShiftTemplate{}`,
  `%ScheduleTemplate{}`, `%Department{}`.
- A **tagged tuple** when there is no record: `{:calendar_feed, type, id}`,
  `{:channel, key}`, `{:memberships, dept_id}`, `{:user_for, user_id}`
  (act on behalf of a user by id).
- An **atom** for company-level surfaces: `:roster`, `:owner_activity`,
  `{:module, :brewery}`.

New clauses (behavior copied from today; Appendix-A row in brackets):

| Resource | Actions → rule today |
|----------|---------------------|
| `%TimeOff.Request{}` | `:view` owner / self / manages a requester dept [17]; `:review` owner / manages a requester dept / own request if manager anywhere [20, 21]; `:cancel` requester only [22] |
| `{:user_for, id}` | `:manage` owner, or manager of a dept `id` belongs to [19, 24] |
| `%Availability.Slot{}` | `:delete` owner / self / `{:user_for, uid}` [24] |
| `{:calendar_feed, type, id}` | `:rotate` user: self or owner; department: owner or its manager; all: owner [26] |
| `{:channel, key}` | `:view`, `:post` per `messaging.ex:37-45` [29] |
| `%User{}` | `:list` any manager/owner [33]; `:create` any manager/owner [34]; `:update`, `:reset_password` owner or manages a target dept [35]; `:set_owner` owner [36] |
| `{:memberships, dept_id}` | `:assign` owner, or manager of `dept_id`; dept must be assignable [37] |
| `%ShiftTemplate{}`, `%ScheduleTemplate{}`, `:roster` | `:read` anyone; `:write` / `:reorder` any manager/owner [10–15] |
| `%Department{}` | `:read` anyone; `:update` owner [38, 39] |
| `:owner_activity` | `:read`, `:mark_seen` owner [40] |
| `{:module, :brewery}` | `:access` owner or Brewery member [41] |

`Authz.can_manage_user?/2` accepts a `%User{}` or an id; the `Accounts`
version is deleted and `user_controller` calls `Authz.can?(actor, :update,
target)`.

Invariants that are **data rules, not access decisions**, stay where they are:
the last-active-owner guard (`accounts.ex:166-169, 312, 419`) and "only
assignable departments" validation. They are listed in the §3.8 allowlist.

### 3.4 `Authz.scope/3` — list decisions

```elixir
@spec scope(User.t(), module :: atom(), level :: :read | :edit | :manage) ::
        :all | {:departments, [integer()]} | :none
```

D29 §3.5 also defines `{:own, user_id}` and `{:union, [...]}`. D31 does not
need them: today every list is "baseline rows ∪ managed departments", and the
baseline part (own rows, published shifts) stays in the context query. They
arrive with Phase 2 if the resolver needs them.

| Caller | Today | After |
|--------|-------|-------|
| `Scheduling.restrict_visibility` [2] | owner → all; else published ∪ drafts in managed depts | `scope(user, :schedule, :manage)` ∪ published |
| `TimeOff.list_for` [16] | owner → all; else own ∪ members of managed depts | own ∪ members of `scope(user, :time_off, :manage)` |
| `Availability.list_for` [23] | same pattern | own ∪ members of `scope(user, :availability, :manage)` |
| `Accounts.list_users_for` [33] | owner → all; else members of managed depts | members of `scope(user, :people, :manage)` |
| `CalendarFeeds.entitlements` [25] | own ∪ managed depts; whole-schedule if owner | own ∪ `scope(user, :calendar_feeds, :manage)`; whole-schedule via `can?(user, :rotate, {:calendar_feed, "all", nil})` |
| `Messaging.channels_for` [28] | All-staff ∪ Managers if manager ∪ member depts (owner: all assignable) | All-staff ∪ Managers via §3.5 ∪ `scope(user, :messaging, :edit)` |

Today `scope/3` returns `:all` for owners, and otherwise `{:departments, ids}`
(managed dept ids for `:manage`, member dept ids for `:edit`), or `:none`.
The "members of" join (today's private `managed_member_ids` in two contexts)
moves into one shared helper.

### 3.5 Role-derived audience

`Authz.counts_as_manager?/1` (owner, or holds any manager membership) and
`Authz.managers_audience_query/0` (active users with a manager membership, plus
active owners) replace `Messaging.manager?/1` and the query in
`Messaging.recipients("managers")`. The name matches D29's `counts_as_manager`
role flag, so Phase 3 changes only this function's internals.

### 3.6 Brewing gate

`ModuleAccessPlug` calls `Authz.can?(user, :access, {:module, module})`
instead of reading `owner?` / `member_of?` itself. The unused Brewing
struct clause of `can?/3` is deleted, and its `authz_test` case is rewritten
against `{:module, :brewery}`. That is a test **move**, not a behavior change:
the clause had no callers. Brewing controllers keep no per-action checks, per
D29 row 41 (any Brewery member has full brewing access; §6 B3 decided keep).

### 3.7 `/api/me` capabilities

`Accounts.capabilities/1` keeps its location and output shape, but computes
every field through `Authz` (`scope/3`, `counts_as_manager?/1`,
`can?(user, :list, %User{})`). The per-persona snapshot test from §3.2 pins
the output.

### 3.8 Boundary test

`test/rockcut_api/authz_boundary_test.exs` scans `lib/**/*.ex` and fails on
any line matching `is_owner`, `.role ==`, `role: "manager"`, `role_in(`,
`managed_department_ids(`, `can_manage_any?(` outside an explicit allowlist:

- `lib/rockcut_api/authz.ex` (the boundary itself)
- `lib/rockcut_api/accounts/user.ex` (schema field, guarded changeset)
- `lib/rockcut_api_web/controllers/json_helpers.ex` (serializes `is_owner`)
- `lib/rockcut_api/accounts.ex` — only the last-owner invariant lines and
  membership writes (data, not access), marked with a
  `# authz-boundary: data invariant` comment that the test honors
- `lib/rockcut_api/seeds/**` (persona definitions)

A plain grep in ExUnit, not a Credo check: no new dependency, and it runs with
`mix test` everywhere.

### 3.9 UI: Brewery route gating

`App.tsx:458-466` registers `/brands`, `/ingredients`, `/batches`,
`/settings` (and their detail routes) for every user. Only `/brewery` is
wrapped in `hasBrewery`. Wrap them all, so a non-brewery user who types one of
these URLs lands on Home (the existing catch-all), as with `/brewery`.

Found in the 2026-09-28 DEV walkthrough: `barMgr` and `bartender1` saw empty
tables with working-looking "Add" buttons while the API returned 403. The
server already denies, so this changes presentation only. Add a Playwright
check (`tests/smoke/roles.spec.ts`): as `bartender1`, `/brands` redirects to
`/`.

---

## 4. Success Criteria

- [ ] Parity suite (§3.2) merged first, green on the pre-refactor code.
- [ ] Same parity suite green, **unmodified**, after steps 2–5.
- [ ] Boundary test (§3.8) passes, and fails when a direct `is_owner` check is
      added to a context (verified once by hand).
- [ ] `Accounts.can_manage_user?/2` and the Brewing `can?/3` clause are gone.
- [ ] `/api/me` capabilities snapshot identical for all 16 active personas.
- [ ] Full API suite passes (`MIX_ENV=test mix test`; 197 today plus the new
      tests).
- [ ] Playwright smoke passes locally and with `E2E_TARGET=dev`, including
      the new Brewery-route check.
- [ ] DEV walkthrough repeated as `owner`, `barMgr`, `bartender1`: same
      menus and pages as 2026-09-28, and `/brands` now redirects for non-brewery users.
- [ ] Stepwise result written; roadmap marks Phase 1 complete; backlog 3887
      closed.

---

## 5. Out of Scope

- **Any authorization behavior change**, including D29 §6 C
  (department-scoped managers, owner-only roster order). That is Phase 2.
- The module → level/scope map in `/api/me` (Phase 2).
- `{:own}` / `{:union}` scope values (Phase 2, if needed).
- `roles` / `role_capabilities` tables, custom roles, role editor (Phases 3–5).
- Frontend gating off a capability map (Phase 5). The only UI change here is
  §3.9.
- Seed-data gaps from the DEV walkthrough (no brewing data, stale "current
  week", empty owner activity). These belong in a D30 follow-up, not here.
- Stale backlog tasks 3849–3853 (updated when each phase is specified).

---

## 6. Decisions (Matt, 2026-09-28)

- [x] **Q1 — Brewing gate: yes, through `Authz`.** Route `ModuleAccessPlug` through
      `can?(user, :access, {:module, :brewery})` and delete the dead struct
      clause (§3.6)? *Recommended.* The alternative is to keep the plug as-is and
      document it as the intended gate, which leaves one access decision
      outside `Authz` and needs a boundary-test exemption.
- [x] **Q2 — Persona fixture: (b), direct inserts.** (a) `Synthetic.setup/0` for exact DEV data, or
      (b) direct inserts from `Synthetic.personas/0`? *Recommend (b):* same
      personas and names, faster, no password handling in tests, and each
      parity row creates only the records it needs. `synthetic_test.exs`
      already covers `setup/0` itself.
- [x] **Q3 — UI route fix (§3.9): included, last step.** It's small and was
      promised to Rick in discussion 80. It is presentation only, so it could
      also be a standalone `fix:` commit ahead of D31. *Recommend: include it, as
      the last step.*
- [x] **Q4 — `capabilities/1`: stays in `Accounts`.** Keep it in `Accounts`, computed via
      `Authz` (§3.7), or move it to `Authz.capabilities/1`? *Recommend keep:*
      Phase 2 extends it, and moving it now is churn with no behavior benefit.
