# D29: RBAC Capability Model — Specification

**Status:** Draft
**Created:** 2026-09-25 (as the D29–D34 plan); **rewritten** 2026-09-26 as D29 only
**Author:** Matt + CC
**Depends On:** D10 (users / tiered authz), D11–D16 (scheduling, time off), D17 (calendar feeds), D18 (notifications), D23 (messaging), D25 (availability)
**Roadmap:** `planning/rbac_configurable_authorization_roadmap.md` (Phase 0)
**Backlog:** PortableMind Product Backlog project 254 — epic 3847, task 3848

---

## 1. Problem Statement

Matt wants to **define roles** and grant each role **capabilities at a level
across modules**, instead of the fixed owner / manager / employee scheme
(requested in PortableMind discussion 80, 2026-09-25).

Today that scheme is hardcoded, and — contrary to the original plan — not
centralized. `Authz.can?/3` is called only by `shift_controller` and
`position_controller`; about 50 other decisions across ~15 files read
`is_owner` / `memberships.role` directly, several of them as **scoped list
queries** or **self-service rules** that a simple read/edit/manage/full ladder
cannot express, and some role-derived behavior (messaging recipients) isn't an
access check at all.

Building roles-as-data on that base would either silently change behavior or
only cover shifts and positions. D29 produces the **model** every later phase
builds on: a complete inventory of today's decisions and a vocabulary proven
able to reproduce all of them. **No code changes.**

---

## 2. Requirements

### Functional

- [ ] **Decision inventory.** Every authorization decision in `rockcut_api` and
      every permission-based gate in `rockcut-ui`, each with: file:line, what it
      decides, who passes today, and whether it is a *yes/no check*, a *scoped
      list query*, a *self-service rule*, or *role-derived behavior*. §3.1 is the
      starting inventory; D29 completes and verifies it.
- [ ] **Module set**, decoupled from department rows (departments are *where*
      a capability applies, modules are *what*).
- [ ] **Level definitions.** A ladder (starting proposal
      `none ⊂ read ⊂ edit ⊂ manage ⊂ full`) with a one-sentence meaning per
      level and the verbs each level unlocks — in particular what separates
      `edit`/`manage`/`full`, or a decision to use fewer levels.
- [ ] **Scope dimension.** Where a capability applies: `own` (records about the
      actor), `department` (departments the role is held in), `all`. D29 decides
      whether scope is part of each capability (level + scope) or implied by
      where the role is held.
- [ ] **Role placement.** Roles global, per-department (via memberships), or
      both — and how `is_owner` fits.
- [ ] **Verb mapping.** For every inventoried decision: `(module, level, scope)`
      required, plus any **item conditions** that stay in code (e.g. a claim
      requires the shift be published, unassigned, and in the actor's
      department).
- [ ] **List-scoping rule.** How list queries derive their filter from the model
      (the set of departments / own-only / all where the actor holds ≥ level).
- [ ] **Owner-only set.** Actions that stay tied to the owner flag and can
      **never** be granted by a role (starting set in §3.4).
- [ ] **Role-derived behavior.** A decision for each non-access use of roles —
      Managers channel membership and recipients, time-off review notifications —
      e.g. "holders of ≥ `manage` on scheduling in that department", or an
      explicit role attribute.
- [ ] **Today-as-matrix.** The owner / manager / employee roles expressed in the
      new vocabulary, with a line-by-line check against the inventory showing it
      reproduces today exactly (or listing each deliberate difference for
      sign-off).

### Non-Functional

- [ ] **Security:** the model keeps the server (`Authz`) as the only
      enforcement boundary; UI gating stays a convenience.
- [ ] **Escalation-safe:** the model makes it impossible to express a role that
      grants owner-only actions or lets an assigner grant beyond their own scope.
- [ ] **Buildable incrementally:** each later roadmap phase can adopt the model
      with no behavior change until custom roles exist.

---

## 3. Design

### Approach

1. Complete and verify the inventory (§3.1) by reading each site — start from
   `grep -rnE 'is_owner|Authz\.|role_in|can_manage|managed_department|"manager"'`
   over `rockcut_api/lib` and `is_owner|manages_departments|can_manage_users|modules`
   over `rockcut-ui/src`.
2. Classify each decision (check / list / self-service / role-derived).
3. Choose modules, levels, scope, and role placement to cover every class.
4. Express today's three roles as a matrix; diff against the inventory.
5. Record decisions and the matrix in this spec (appendix) and get Matt + Rick
   sign-off in discussion 80.

### 3.1 Starting inventory (from the 2026-09-26 review — to verify)

| Area | Where | Kind | Rule today |
|------|-------|------|-----------|
| Shifts | `authz.ex` `can?(_, _, %Shift{})`; `shift_controller` (7 calls) | check | read published = anyone; draft read + create/update/assign/delete/publish/unpublish = manager of shift's dept; claim = member of dept, published + unassigned |
| Shift visibility | `scheduling.ex:246` `restrict_visibility` | list | owner all; others published + drafts in managed depts |
| Positions | `authz.ex` `can?(_, _, %Position{})`; `position_controller` (3) | check | read anyone; write = any manager |
| Shift / schedule templates | `shift_template_controller:47`, `schedule_template_controller:16,26` | check | any manager |
| Roster | `roster_controller:14` | check | any manager |
| Time off — list | `time_off.ex:26,34` `list_for` | list | owner all; others own + requests of **users who are members of** managed depts |
| Time off — view / review | `time_off.ex:161-174` | check + self | owner; self; manager of requester's dept |
| Time off — on behalf | `time_off.ex:102` | check | `can_manage_user?` of target |
| Availability — list | `availability.ex:28,106` | list | owner all; others own + slots of users who are members of managed depts |
| Availability — manage | `availability.ex:80-89` | check + self | owner; self; `can_manage_user?` |
| Messaging — channels | `messaging.ex:20-45` | list + check | All-staff anyone; Managers = any manager; dept channel = member (owner all) |
| Messaging — recipients | `messaging.ex:145-173` | role-derived | Managers = users with a manager membership + owners |
| Calendar feeds | `calendar_feeds.ex:48-68` | check + self | user feed self/owner; dept feed owner/manager of dept; whole-schedule owner |
| Users — list | `accounts.ex:240-245` `list_users_for` | list | owner all; manager users in managed depts |
| Users — manage | `user_controller:12,22,49,76`; `accounts.ex:266` | check | any manager to list/create; `can_manage_user?` to edit |
| Owner flag | `user_controller:89`; `accounts.ex:156-177,419` | owner-only | only owner sets `is_owner`; last-active-owner guard |
| Memberships | `membership_controller:18`; `accounts.ex:413` | check | any manager; only within managed depts (owner all) |
| Departments | `department_controller:15` | owner-only | owner |
| Owner activity / audit | `owner_activity_controller:10,21` | owner-only | owner |
| Brewing | `ModuleAccessPlug` (`module: :brewery`); `authz.ex` Brewing clause (**no callers**) | check | any brewery member (owner all) |
| `/api/me` capabilities | `accounts.ex:274-292` | projection | modules, manages_departments, can_manage_users |
| UI gates | `App.tsx`, `Home.tsx`, `Schedule.tsx`, `TimeOff.tsx`, `Availability.tsx`, `UserManagement.tsx`, `UserFormDialog.tsx`, `lib/types.ts` | UI | `is_owner` / `manages_departments` / `can_manage_users` |

Note: time-off, availability and user lists scope by **person** (users who
belong to a managed department), while shifts scope by the **record's**
department — the list-scoping rule must handle both.

Note: "any manager" (`can_manage_any?`) means a manager of **any** department
acts company-wide for positions, templates, roster and user creation — the
model must reproduce that or flag it as a deliberate change.

### 3.2 Candidate modules

scheduling (shifts), positions, templates, roster, time-off, availability,
messaging, calendar-feeds, users, memberships, departments, brewing,
owner-activity. D29 may merge or split these.

### 3.3 Candidate capability shape

```
capability = { module, level: none|read|edit|manage|full, scope: own|department|all }
role       = { name, system?, capabilities: [capability] }
held via   = membership (per-department) and/or global assignment (D29 decides)
```

Item conditions (published/unassigned/in-department for claims, last-owner
guards) stay in code and are listed per verb in the matrix.

### 3.4 Starting owner-only set

Setting / clearing `is_owner`; department create/edit/delete; owner activity
log; whole-schedule calendar feed; defining or editing roles. D29 confirms or
amends; the rule "no role can grant these" is fixed.

### Key outputs

| Output | Purpose |
|--------|---------|
| Decision inventory (appendix A) | Parity checklist for the consolidation phase |
| Vocabulary: modules, levels, scope, role placement | Schema + API contract for later phases |
| Verb mapping + item conditions | What `Authz` evaluates |
| List-scoping rule | Replaces `list_for` / `restrict_visibility` logic |
| Owner-only set | Escalation guardrail |
| Role-derived behavior decisions | Messaging / notifications with custom roles |
| Today-as-matrix (appendix B) | Seed data for system roles; parity target |

---

## 4. Success Criteria

- [ ] Every site found by the §3 Approach greps appears in appendix A, or is
      noted as not an access decision.
- [ ] Every appendix-A row maps to `(module, level, scope)` + item conditions.
- [ ] The today-as-matrix reproduces every appendix-A rule; any deliberate
      difference is listed and signed off.
- [ ] Levels, scope, and role placement are defined in plain language a
      non-developer (Matt, as the future role editor) can apply.
- [ ] Owner-only set and role-derived behavior decisions are recorded.
- [ ] Matt + Rick sign off (discussion 80).
- [ ] Roadmap updated with anything D29 changes about later phases.

---

## 5. Out of Scope

- Any code, schema, or UI change (roadmap Phases 1–6).
- Consolidating the scattered checks behind `Authz` (roadmap Phase 1 — next
  deliverable).
- Building the role editor or custom-role assignment.

---

## 6. Open Questions

- [ ] Global roles, per-department roles, or both?
- [ ] Does "manager of any department acts company-wide" (positions, templates,
      roster, user creation) stay, or become department-scoped?
- [ ] Are four levels needed, or do fewer (e.g. read / edit / manage) plus scope
      cover everything?
- [ ] Should Brewing get per-action checks, or is module-level gating enough?
- [ ] With custom roles, who counts as a "manager" for the Managers channel and
      notification recipients?
- [ ] Owner as a locked system role vs. keeping the `is_owner` flag.
