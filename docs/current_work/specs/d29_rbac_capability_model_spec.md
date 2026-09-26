# D29: RBAC Capability Model — Specification

**Status:** Draft — model decisions made by Matt 2026-09-26; one policy question (§6 B2) under discussion; Rick sign-off pending
**Created:** 2026-09-25 (as the D29–D34 plan); **rewritten** 2026-09-26 as D29 only;
proposed model + inventory added 2026-09-26
**Author:** Matt + CC
**Depends On:** D10 (users / tiered authz), D11–D16 (scheduling, time off), D17 (calendar feeds), D18 (notifications), D23 (messaging), D25 (availability)
**Roadmap:** `planning/rbac_configurable_authorization_roadmap.md` (Phase 0)
**Backlog:** PortableMind Product Backlog project 254 — epic 3847, task 3848

---

## 1. Problem Statement

Matt wants to **define roles** and grant each role **capabilities at a level
across modules**, instead of the fixed owner / manager / employee scheme
(requested in PortableMind discussion 80, 2026-09-25).

Today that scheme is hardcoded, and not centralized. `Authz.can?/3` is called
only by `shift_controller` and `position_controller`; the other decisions
(Appendix A) read `is_owner` / `memberships.role` directly, several of them as
**scoped list queries** or **self-service rules** that a simple ladder cannot
express, and some role-derived behavior (the Managers channel) isn't an access
check at all.

Building roles-as-data on that base would either silently change behavior or
only cover shifts and positions. D29 produces the **model** every later phase
builds on: a complete inventory of today's decisions and a vocabulary proven
able to reproduce all of them. **No code changes.**

---

## 2. Requirements

### Functional

- [x] **Decision inventory** — Appendix A (API + UI, verified against code).
- [x] **Module set**, decoupled from department rows — §3.2.
- [x] **Level definitions** — §3.3 (decided: three levels).
- [x] **Scope dimension** — §3.4.
- [x] **Role placement** — §3.1.
- [x] **Verb mapping** with item conditions — Appendix A, "Maps to" column.
- [x] **List-scoping rule** — §3.5.
- [x] **Owner-only set** — §3.6.
- [x] **Role-derived behavior** — §3.7.
- [x] **Today-as-matrix** — Appendix B, with the parity check.
- [ ] **Sign-off** on §3 recommendations and the §6 policy questions.

### Non-Functional

- [x] **Security:** the server (`Authz`) stays the only enforcement boundary;
      UI gating is convenience (the UI reads the same model via `/api/me`).
- [x] **Escalation-safe:** owner-only actions are outside the capability
      vocabulary (§3.6); assignment is bounded by the assigner's own grants
      (§3.8).
- [x] **Buildable incrementally:** the system roles in Appendix B reproduce
      today, so Phases 1–3 of the roadmap change no behavior.

---

## 3. Design — proposed model

> Model choices in this section were **decided by Matt on 2026-09-26** (§6 A);
> Rick's sign-off is pending.

### 3.1 Three layers, evaluated in order

```
1. Owner flag     users.is_owner       → every capability at every scope, plus the owner-only set
2. Baseline       every active user    → self-service + company-wide reads (fixed, not editable)
3. Roles          held per department  → capabilities (module, level, scope), via memberships
```

- **Roles are held per department**, exactly as today (a membership =
  user + department + role). No global roles in this release: "company-wide"
  authority is expressed by a capability with scope `all` inside a
  department-held role (that's how today's "any manager acts company-wide"
  rules are reproduced).
- **Owner stays a flag**, not a role. It can't be granted by a role, and the
  last-active-owner guard stays. (Modelling it as a locked system role is a
  cosmetic Phase-6 choice.)
- **Baseline** captures what every signed-in user can do regardless of role
  (Appendix B, first block). Today a user with **no memberships** still gets
  all of it; keeping baseline separate preserves that and keeps custom roles
  from accidentally removing self-service.

A user's effective grant for a module = the **maximum** over owner, baseline,
and every role they hold — each role's scope is resolved relative to the
department the role is held in.

### 3.2 Modules

| Module | Covers | Kind |
|--------|--------|------|
| `schedule` | shifts: view, draft, assign, publish, claim | record-scoped (shift's department) |
| `schedule_setup` | positions, shift templates, schedule templates, roster order | company data (no department) |
| `time_off` | time-off requests: view, request on behalf, review | person-scoped (requester's departments) |
| `availability` | availability slots | person-scoped |
| `calendar_feeds` | department feed tokens | record-scoped (feed's department) |
| `people` | users, password reset, memberships | person-scoped |
| `messaging` | department channels, Managers channel | record-scoped (channel's department) |
| `brewing` | recipes, ingredients, lots, batches, brew turns, logs, formulas | company data, **bound to a department** |

**Department-bound modules.** Brewing data has no department, but only Brewery
members may use it (today's `ModuleAccessPlug module: :brewery`). Proposal: a
module may be **bound** to departments (`brewing → brewery`); a role's grant on
a bound module is effective **only when that role is held in a bound
department**. So the same "Employee" role gives brewing access in Brewery and
nothing in Taproom — today's behavior — and future modules (e.g. a taproom
POS) bind the same way. This replaces the module/department conflation without
losing it.

Departments, owner activity, and role definitions are **not** modules — they
are owner-only (§3.6).

### 3.3 Levels

Proposal: **`none < read < edit < manage`** — three granting levels.

| Level | Meaning (plain language for the role editor) |
|-------|---------------------------------------------|
| `read` | See it. |
| `edit` | Do your own work in it: add and change records that are yours or that you're taking on (claim a shift, log a batch). |
| `manage` | Run it for others: create, change, assign, approve, publish and delete other people's records; set it up. |

**Why not `full`?** No current rule separates "manage" from a higher level —
managers who can edit a shift can also delete and publish it; brewery members
who can edit a recipe can delete it. A `full` level would have nothing to be
tested against for parity. It can be added later, without migration, as
`manage + delete/irreversible` if Matt wants to withhold deletes from someone.
**Decided (2026-09-26): three levels.**

### 3.4 Scope

Each capability carries a scope (not implied by where the role is held):

| Scope | Record-scoped module | Person-scoped module | Company / bound module |
|-------|---------------------|----------------------|------------------------|
| `own` | records assigned to / created by me | records about me | — |
| `department` | records in the department the role is held in | records about people who are members of that department | — (n/a) |
| `all` | every department | everyone | the whole module |

For company and bound modules only `all` is meaningful; the editor offers level
only.

### 3.5 List scoping

`Authz` exposes one query-scope function used by every list:

```
Authz.scope(user, module, level) ::
  :all | {:departments, [dept_id]} | {:own, user_id} | {:union, [scope]} | :none
```

It unions, across the user's grants with ≥ `level`: `all` wins; `department`
grants contribute the holding department ids; `own` contributes the user.
Each context applies it by its module kind — record-scoped lists filter
`record.department_id in ids`; person-scoped lists filter
`record.user_id in (members of ids)` (today's `managed_member_ids` pattern) —
plus baseline rules (e.g. published shifts visible to all). This replaces
`restrict_visibility`, both `list_for`s, `list_users_for`, and
`entitlements`.

### 3.6 Owner-only set (never grantable)

- Set / clear `is_owner`; the last-active-owner guard (deactivate or demote).
- Department create / edit / delete (palette colour included).
- Owner activity log (read + mark seen) and the pending-review badge.
- Whole-schedule calendar feed.
- Define, edit, delete roles; edit capability grants.

These live outside the module vocabulary, so no role can express them.

### 3.7 Role-derived behavior

- **Managers channel** (view, post, recipients): members = owners + anyone
  holding a role with **`counts_as_manager: true`** (decided 2026-09-26 — an
  explicit per-role flag, not derived from capabilities). The Manager system
  role has it; Employee doesn't — so today's audience is reproduced exactly,
  and Matt decides per custom role who belongs in the managers' room.
- **Open-shift notifications** go to department **members**, independent of
  role — unchanged, not a capability.
- **Audit logging** records every actor — unchanged.
- **Time-off review notifications:** none exist today; if added, recipients =
  holders of `time_off: manage` over the requester (via `Authz.scope`).

### 3.8 Assignment guardrails (for roadmap Phase 4)

- Only owners define roles (§3.6). An actor may assign a role in department D
  only if, for every capability in that role, the actor holds ≥ the same level
  at ≥ the same scope in D. Only capabilities **effective in D** are compared:
  a grant on a module bound elsewhere (e.g. brewing, when D isn't Brewery) is
  inert in D and ignored. (Today: managers assign manager/employee within
  departments they manage — both system roles pass this rule.)
- Assigning a role with `counts_as_manager` requires the actor to count as a
  manager too (or be an owner).
- System roles (Manager, Employee) are immutable.
- Validate module ∈ §3.2, level ∈ §3.3, scope ∈ §3.4.

---

## 4. Success Criteria

- [x] Every site found by the greps (`is_owner|Authz\.|role_in|can_manage|managed_department|"manager"|owner\?` over `rockcut_api/lib`; `is_owner|manages_departments|can_manage_users|capabilities|modules` over `rockcut-ui/src`) appears in Appendix A, or is noted as not an access decision.
- [x] Every Appendix-A row maps to `(module, level, scope)` + item conditions.
- [x] Appendix B reproduces every Appendix-A rule; deliberate-difference
      candidates are listed in §6 for decision, and the proposal changes none.
- [x] Levels, scope and placement are defined in plain language (§3.3–3.4).
- [x] Owner-only set and role-derived behavior are recorded (§3.6–3.7).
- [ ] Matt + Rick sign off (discussion 80).
- [ ] Roadmap updated with anything sign-off changes.

---

## 5. Out of Scope

- Any code, schema, or UI change (roadmap Phases 1–6).
- Consolidating the scattered checks behind `Authz` (roadmap Phase 1 — next
  deliverable).
- Building the role editor or custom-role assignment.

---

## 6. Decisions and Open Questions

### A. Model decisions — decided by Matt, 2026-09-26

- [x] Roles held per department only (§3.1) — **yes**.
- [x] Three levels, no `full` (§3.3) — **yes**.
- [x] Brewing as a department-bound module (§3.2) — **yes**.
- [x] Managers channel — **explicit `counts_as_manager` role flag** (§3.7).

### B. Current behaviors — decided by Matt, 2026-09-26

1. [x] **Self-approval of time off** (a manager of any department approves
   their own request, `time_off.ex:167`) — **keep**.
2. [ ] **"Any manager" acts company-wide** (positions, templates, roster order,
   user creation) — **change wanted**: managers create users and edit
   positions **only in their own departments**. Design in §6 C; under
   discussion.
3. [x] **Brewery employees have full brewing access** — **keep** (to confirm:
   recorded as "keep" from Matt's "yes").
4. [x] **Everyone sees every department's published shifts** — **keep**.
5. [x] **Owners can't cancel someone else's time off** — **change**: owners can
   cancel. Details in §6 D.
6. [x] **"Other" department is owner-only** — **keep for now**.

### C. Department-scoped managers (B2) — proposal

In the model this is **a scope change on the Manager system role**, not a new
mechanism: `schedule_setup` becomes a record-scoped module and the Manager
role holds it at `department` instead of `all`. Custom roles can still be
given `all` (e.g. an operations manager).

| Thing | Department comes from | Rule for a department-scoped manager |
|-------|----------------------|--------------------------------------|
| Position | `positions.department_id` (already required) | create/edit/delete positions in managed departments; moving a position needs both old and new department (like shifts) |
| Shift template | its position's department | follows the position |
| Schedule template | the positions of its items (may span departments) | create/delete only if the actor manages **every** department its items touch; applying one still checks each resulting shift |
| User create | the new user's memberships | must include **≥ 1** membership, all in managed departments (no creating users nobody manages) |
| Roster order | none — one company-wide `users.schedule_order` | *open*: see below |

Consequences: positions in "Other" become owner-only (managers can edit them
today); the positions dialog and user form show managers only their
departments. Everything else (reads) is unchanged.

**Roster order is the open piece.** It's one list shared by every department's
grid. Options: (a) keep reordering at any-manager (`schedule_setup: manage`
kept at `all` for this one verb); (b) owner-only; (c) per-department order
(move order onto memberships — a schema change and grid change). Recommend
(a) for now, (c) if managers step on each other.

### D. Owners cancel time off (B5)

Why it isn't so today: D16 defined **cancel** as "the requester withdraws their
own request"; D25 added undoing an **approved** request, and gave
managers/owners **deny** (approved → denied) for that instead of cancel. So an
owner can already remove approved time off, but it's recorded as *denied*,
and a pending request can only be denied, not cancelled.

Proposal: cancel is allowed for the requester **or anyone with
`time_off: manage` over the requester** (owners always; managers of the
requester's departments — they can already deny). Record who cancelled
(`cancelled_by_id`, or reuse `reviewed_by_id`) so a cancel-by-other is
distinguishable from a withdrawal. *Open:* owners only, or managers too?
Notify the requester?

### E. Sequencing of the changes

B2 and B5 are deliberate behavior changes. Roadmap Phases 1–3 are
behavior-preserving, so: **B5** is small and independent — ship it as its own
fix before or alongside Phase 1. **B2** lands once the resolver exists
(Phase 2): changing the Manager role's `schedule_setup` scope is then a data
change plus the user-create rule, with the parity tests for those rows
flipped deliberately.

---

## Appendix A — Decision inventory (verified 2026-09-26)

Kinds: **check** (yes/no on an item) · **list** (filters rows) · **self**
(about the actor's own records) · **derived** (role picks an audience, not
access) · **owner** (owner-only) · **UI** (client gate).
Maps-to uses §3 vocabulary; "baseline" = every active user; conditions in
*italics* stay in code.

| # | Area | Where | Kind | Rule today | Maps to |
|---|------|-------|------|-----------|---------|
| 1 | Shift read | `authz.ex` Shift clause; `shift_controller:23` | check | published: anyone; draft: manager of shift's dept | baseline read (*published*); draft: `schedule` read-draft = `manage`, department |
| 2 | Shift list | `scheduling.ex:246` `restrict_visibility` | list | owner all; others published + drafts in managed depts | `Authz.scope(schedule, manage)` ∪ *published* |
| 3 | Shift create | `shift_controller:32` | check | manager of target dept | `schedule` manage, department |
| 4 | Shift update / move | `shift_controller:53-54` | check | manager of current **and** new dept | `schedule` manage, department — *both old and new dept* |
| 5 | Shift assign / delete / publish / unpublish | `shift_controller:141` | check | manager of shift's dept | `schedule` manage, department |
| 6 | Publish batch | `shift_controller:89` | check | filters to shifts the actor may publish | `schedule` manage, department (per shift) |
| 7 | Claim open shift | `shift_controller:116`; `authz.ex` | self | member of shift's dept | `schedule` edit, department — *published, unassigned* |
| 8 | Positions read | `authz.ex` Position clause | check | anyone | baseline read |
| 9 | Positions write | `position_controller:17,29,43` | check | any manager | `schedule_setup` manage |
| 10 | Shift templates read | `shift_template_controller:9` | check | anyone | baseline read |
| 11 | Shift templates write | `shift_template_controller:14,24,36,47` | check | any manager | `schedule_setup` manage |
| 12 | Schedule templates read | `schedule_template_controller:9` | check | anyone | baseline read |
| 13 | Schedule templates write | `schedule_template_controller:16,26` | check | any manager | `schedule_setup` manage |
| 14 | Roster read | `roster_controller:8` | check | anyone | baseline read |
| 15 | Roster order | `roster_controller:14` | check | any manager | `schedule_setup` manage |
| 16 | Time off list | `time_off.ex:26-49` | list | owner all; own + members of managed depts | baseline own ∪ `Authz.scope(time_off, manage)` (person) |
| 17 | Time off view | `time_off.ex:161-163` | check | owner; self; manager of a requester dept | baseline own; `time_off` manage, department (person) |
| 18 | Time off request (self) | `time_off.ex:63-102` | self | anyone, pending | baseline own |
| 19 | Time off on behalf | `time_off.ex:102`, `:74` | check | `can_manage_user?` target; auto-approved | `time_off` manage, department (person) — *created approved* |
| 20 | Time off review | `time_off.ex:116-118,165-170` | check | owner; manager of a requester dept | `time_off` manage, department (person) |
| 21 | Time off self-review | `time_off.ex:167-168` | self | own request, if a manager anywhere | `time_off` manage, any scope — *own request* (see §6 Q1) |
| 22 | Time off cancel | `time_off.ex:143-146` | self | requester only; pending/approved | baseline own — *pending or approved* |
| 23 | Availability list | `availability.ex:28-40,106` | list | owner all; own + members of managed depts | baseline own ∪ `Authz.scope(availability, manage)` (person) |
| 24 | Availability create / delete | `availability.ex:71,80-89` | check + self | owner; self; `can_manage_user?` | baseline own; `availability` manage, department (person) |
| 25 | Calendar feeds list | `calendar_feeds.ex:46-60` `entitlements` | list | own feed; managed depts (owner: all); whole-schedule: owner | baseline own; `Authz.scope(calendar_feeds, manage)`; whole = owner |
| 26 | Calendar feed rotate | `calendar_feeds.ex:38,63-69` | check + self | user: self/owner; dept: owner/manager of dept; all: owner | baseline own; `calendar_feeds` manage, department; owner |
| 27 | Calendar feed fetch | `router.ex` public `/calendar/:token` | — | token is the credential | not an access decision |
| 28 | Channels list | `messaging.ex:20-36` | list | All-staff; Managers if any manager; member depts (owner: all assignable) | baseline All-staff; §3.7; `Authz.scope(messaging, edit)` |
| 29 | Channel view / post / read | `messaging.ex:37-45` | check | same as list | baseline (All-staff); §3.7; `messaging` edit, department |
| 30 | Managers-channel recipients | `messaging.ex:147-160` | derived | manager memberships + owners | §3.7 |
| 31 | Dept-channel recipients | `messaging.ex:161-170` | derived | department members | membership (unchanged) |
| 32 | Open-shift notifications | `notifications.ex:138` | derived | department members | membership (unchanged) |
| 33 | Users list | `user_controller:12`; `accounts.ex:240-245` | list | any manager; owner all, else members of managed depts | `Authz.scope(people, manage)` (person) |
| 34 | User create | `user_controller:22`; `accounts.ex:126` | check | any manager; memberships limited to managed depts | `people` manage, any scope — memberships per #37 (see §6 Q2) |
| 35 | User update / reset password | `user_controller:49,76`; `accounts.ex:266-270` | check | owner; manager of a dept the target is in | `people` manage, department (person) |
| 36 | Owner flag + last-owner guard | `user_controller:89`; `accounts.ex:156-177,419` | owner | only owner sets; can't remove/deactivate last active owner | owner-only (§3.6) |
| 37 | Set memberships | `membership_controller:18`; `accounts.ex:198,317-417` | check | any manager; add/remove only in managed depts; non-assignable depts rejected | `people` manage, department (per dept) + §3.8 — *dept assignable* |
| 38 | Departments list | `department_controller:9` | check | anyone | baseline read |
| 39 | Department update | `department_controller:15` | owner | owner | owner-only |
| 40 | Owner activity | `owner_activity_controller:10,21` | owner | owner | owner-only |
| 41 | Brewing routes | `router.ex` `:brewery` pipeline; `ModuleAccessPlug` | check | owner or any Brewery member: all CRUD + formulas | `brewing` manage (bound: brewery) (see §6 Q3) |
| 42 | Brewing `can?` clause | `authz.ex` Brewing clause | — | **no callers** | superseded by #41 |
| 43 | Notifications, push, prefs, session | `notification_*`, `push_controller`, `session_controller` | self | actor's own records only | baseline own |
| 44 | `/api/me` capabilities | `accounts.ex:274-292` | projection | modules, manages_departments, can_manage_users, pending_owner_reviews | adds module → level/scope map (roadmap Phase 2) |
| 45 | UI nav / home | `App.tsx:141-150`, `Home.tsx:24-28` | UI | brewery module; manage-schedule = owner or manages any dept; manage users | reads capability map |
| 46 | UI schedule / time off / availability | `Schedule.tsx:59-62`, `TimeOff.tsx:68-69`, `Availability.tsx:57-58` | UI | owner / managed dept keys | reads capability map |
| 47 | UI user admin | `UserFormDialog.tsx:42-94`, `UserManagement.tsx:11` | UI | owner sees owner toggle + all depts; manager sees managed depts | reads capability map; owner toggle stays owner-only |
| 48 | UI types | `lib/types.ts:240-265` | UI | closed `Role` union + capabilities shape | opened in roadmap Phase 5 |

Grep hits not listed: `user.ex:10,36,57-58` (schema field + guarded changeset
for #36), `json_helpers.ex:14` (serializes `is_owner`), `accounts.ex:312`
(owner count for #36), `authz.ex` helpers (implementation of the above).

## Appendix B — Today as a matrix

**Baseline — every active user** (fixed; not a role)

| Module | Grant |
|--------|-------|
| schedule | read published shifts, all departments |
| schedule_setup | read positions, templates, roster |
| time_off | request, view, cancel **own** |
| availability | create, delete **own** |
| calendar_feeds | own "My shifts" feed |
| messaging | All-staff channel: view + post |
| departments | read |
| notifications / push / prefs | own |

**System role: Employee** (held in department D)

| Module | Level | Scope |
|--------|-------|-------|
| schedule | edit | department — *claims only; no draft visibility* |
| messaging | edit | department (D's channel) |
| brewing | manage | all — *effective only if D is bound (Brewery)* |

**System role: Manager** (held in department D)

| Module | Level | Scope |
|--------|-------|-------|
| schedule | manage | department |
| schedule_setup | manage | all |
| time_off | manage | department (person) |
| availability | manage | department (person) |
| calendar_feeds | manage | department |
| people | manage | department (person); create users: any |
| messaging | edit | department — role has `counts_as_manager` (§3.7) |
| brewing | manage | all — *effective only if D is bound (Brewery)* |

**Owner** — flag: every module at `manage` / `all` (messaging: all assignable
departments), plus §3.6.

### Parity check

Each Appendix-A row, evaluated against the matrix, gives today's result:

- Shifts #1–7: drafts and writes need `schedule: manage` in the shift's dept —
  managers only; claims need `schedule: edit` in the dept — every member
  (employee `edit`, manager `manage ≥ edit`). ✔
- `schedule_setup` #9–15: `manage/all` in the Manager role = "any manager". ✔
- Person-scoped #16–24, #33–35: `department (person)` = members of managed
  depts, matching `managed_member_ids` / `can_manage_user?`. ✔ Self-review #21
  = `time_off: manage` at any scope, matching `can_manage_any?`. ✔
- Feeds #25–26: manager `calendar_feeds: manage/department` + owner-only
  whole feed. ✔
- Messaging #28–31: dept channels via membership-held `messaging: edit`;
  Managers channel via `counts_as_manager` (Manager role only) = exactly the
  users with a manager membership, plus owners. ✔
- Memberships #37: §3.8 — a manager holds every capability of both system
  roles in departments they manage, so may assign either there, and nowhere
  else. ✔
- Brewing #41: bound module — any role held in Brewery grants `manage`. ✔
- "Other" dept: non-assignable → no memberships → only owners act. ✔
