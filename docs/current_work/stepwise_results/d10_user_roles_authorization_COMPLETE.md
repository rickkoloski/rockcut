# D10: Users, Departments & Tiered Authorization — Complete

**Spec:** `d10_user_roles_authorization_spec.md`
**Plan:** `d10_user_roles_authorization_plan.md`
**Completed:** 2026-09-20

---

## Summary

Replaced the single-admin `EnvAuth` with a full multi-user identity and
authorization system: real users authenticated against the database, four
company departments (Brewery, Bar, Office, Sales), per-department role
memberships (owner / manager / employee), and an action-aware `Authz` layer that
gates both API routes and the React UI. Owners see and manage everything;
managers manage users only within the departments they manage; employees have
scoped access. Delivered in three committed phases (foundation → management API
→ frontend).

---

## Implementation Details

### What Was Built

- **Identity model** — `users` (with `is_owner`, `active`, `must_reset_password`,
  `COLLATE NOCASE` email uniqueness), `departments` (seeded four), `memberships`
  (per-department `manager|employee`), `audit_log`.
- **Authentication** — Argon2 login against the users table (constant-time on
  miss), bearer token carrying `user_id`, `AuthPlug` loads the full user and
  re-checks `active` per request (soft revocation). EnvAuth removed.
- **Authorization** — `Rockcut.Authz` (`owner?`, `role_in`, `member_of?`,
  `can_manage_users_in?`, `managed_department_ids/keys`, `can_manage_any?`,
  action-aware `can?/3`) and `ModuleAccessPlug` gating brewing routes behind
  Brewery membership.
- **Management API** — declarative membership reconciliation with escalation
  guards and the last-owner invariant; user CRUD; `/api/me` capabilities;
  password lifecycle; owner activity feed.
- **Frontend** — capability-filtered nav, User Management screen with a scoped
  per-department role editor, forced-reset interstitial, owner activity feed.
- **Owner notification (in-app)** — manager actions are recorded to `audit_log`
  and surfaced via `/api/owner/activity` plus a `pending_owner_reviews` badge on
  `/api/me`.

### Files Created (API)

| File | Purpose |
|------|---------|
| `priv/repo/migrations/20260920120001_create_users.exs` … `_04_create_audit_log.exs` | Schema |
| `lib/rockcut_api/accounts.ex` | Accounts context (auth, reads, writes, capabilities) |
| `lib/rockcut_api/accounts/{user,department,membership,audit_entry}.ex` | Schemas |
| `lib/rockcut_api/authz.ex` | Central authorization decisions |
| `lib/rockcut_api_web/plugs/module_access_plug.ex` | Module (department) route gate |
| `lib/rockcut_api_web/controllers/{me,department,user,membership,owner_activity}_controller.ex` | Endpoints |
| `test/support/accounts_fixtures.ex` + 6 test files | Coverage |

### Files Created (UI)

| File | Purpose |
|------|---------|
| `src/pages/users/UserManagement.tsx`, `UserFormDialog.tsx` | User & role management |
| `src/pages/auth/ForcePasswordReset.tsx` | Forced-reset interstitial |
| `src/pages/activity/OwnerActivity.tsx` | Owner audit feed |

### Files Modified

| File | Changes |
|------|---------|
| `lib/rockcut_api_web/controllers/session_controller.ex` | Real login, `user_id` token, self change-password |
| `lib/rockcut_api_web/plugs/auth_plug.ex` | Loads full user, active check |
| `lib/rockcut_api_web/controllers/json_helpers.ex` | user/membership/department/me/audit views |
| `lib/rockcut_api_web/router.ex` | Brewery gate + management routes |
| `priv/repo/seeds.exs` | Departments + bootstrap owner |
| `rockcut-ui/src/hooks/useAuth.ts`, `src/App.tsx`, `src/lib/types.ts` | `/api/me` wiring, nav gating, types |

---

## Testing

### Tests Run
- [x] ExUnit: **86 tests, 0 failures** (was 57; +29 for authz matrix, management
      guards, declarative membership diff, last-owner invariant, password flows,
      capabilities, and per-endpoint authorization). Existing brewing tests
      unaffected.
- [x] `mix compile --warnings-as-errors`: clean.
- [x] UI: `vite build` passes; new files ESLint- and type-clean.
- [x] Manual end-to-end (curl): owner login → `/api/me` (all modules); create a
      sales manager (temp password, forced reset); that manager sees only
      `sales`, gets 403 on brewing routes / owner activity / cross-department
      user creation; owner activity feed shows the `user.created` +
      `membership.added` entries.

### Test Coverage
Authorization decisions, escalation guards, and the last-owner invariant are
covered at both the context (unit) and controller (integration) levels.

---

## Deviations from Spec

- **`tsc -b` is pre-existingly broken** by the linked `datagrid-extended`
  package (cannot resolve `@mui/x-data-grid` from its location); identical
  failure exists on `HEAD` before this work. UI verification therefore uses
  `vite build` + scoped `tsc --noEmit`/ESLint, which are clean. Not caused by
  D10.
- Otherwise implemented as specified (all five §6 decisions honored).

---

## Follow-Up Items

- [ ] **D11 — Scheduling module**: `schedule_items` (`department_id`,
      `assignee_id`, `employee_write_scope`), cross-department read, department-
      scoped write. `Authz.can?/3` already accepts the resource for this.
- [ ] Email/push delivery of owner notifications (currently in-app only).
- [ ] Real email invitations (currently admin-set temp password + forced reset).
- [ ] Fine-grained verb policies for brewing resources (manager vs employee),
      if desired later.
- [ ] Repo-wide `mix format` drift remains (unrelated); see memory
      `rockcut-mix-format-churn`.

---

## Notes

- Bootstrap owner seeds from the `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` Fly
  secrets in prod (hash copied as-is), or a deterministic dev owner
  (`matt@rockcut.com` / `rockcut2026`) in dev. No accept-any auth path remains.
- **Prod cutover:** existing bearer tokens are invalidated (payload changed from
  email to `user_id`) — users re-login. Run migrations + seed on deploy; verify
  the owner can log in before relying on it.
- Commits: `447d064` (phase 1), `86a638f` (phase 2), `e29fb78` (phase 3),
  on branch `practice1` (not yet pushed).
