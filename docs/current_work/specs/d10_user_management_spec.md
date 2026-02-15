# D10: User Management — Spec

**Status:** DRAFT
**Created:** 2026-02-15
**Depends On:** D4 (auth foundation)
**Concept:** 07_user_management

---

## 1. Problem Statement

Rockcut currently uses a single-user `EnvAuth` pattern — Matt's credentials are stored as Fly.io secrets (`ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`). This works for a solo operator, but Matt wants to give his staff access to the app with appropriate permissions. We need a database-backed multi-user system with two roles (admin, user) and basic user management.

Additionally, when Matt creates accounts for staff, he needs a simple way to issue a temporary password and force the user to set their own password on first login.

---

## 2. Requirements

### Functional — Core Auth Migration (D10a)

- [ ] `users` table: `id, email (unique), password_hash, name, role ("admin"/"user"), active (bool), must_change_password (bool, default false), timestamps`
- [ ] New `Accounts` context replaces `EnvAuth` for authentication
- [ ] `Accounts.authenticate/2` returns `{:ok, %User{}}` on success, `:error` on failure
- [ ] Uses Argon2 (already a dependency) for password hashing
- [ ] User schema with two changesets:
  - `registration_changeset` — requires password (for create)
  - `changeset` — optional password (for update)
  - Virtual `:password` field hashed to `:password_hash` via `maybe_hash_password/1`
- [ ] SessionController signs `user.id` (integer) instead of email
- [ ] SessionController returns `{token, email, name, role, must_change_password}` on login
- [ ] AuthPlug loads user by ID, rejects if nil or `active == false`
- [ ] `EnvAuth` module deleted after migration

### Functional — User Management API (D10b)

- [ ] `RequireAdminPlug` — returns 403 if `current_user.role != "admin"`
- [ ] CRUD endpoints: `GET/POST /api/users`, `GET/PUT/DELETE /api/users/:id`
- [ ] Admin-only — piped through `[:api, :authenticated, :admin]`
- [ ] `user/1` JSON helper excludes `password_hash`
- [ ] Admin can set/reset password via `PUT /api/users/:id` with `password` field
- [ ] `POST /api/users/:id/reset_password` — admin-only endpoint that:
  - Generates a random temporary password (8 chars, alphanumeric)
  - Sets user's `must_change_password` to `true`
  - Returns the temporary password in the response (admin shares it with user verbally/in-person)

### Functional — Frontend Auth Updates (D10c)

- [ ] `useAuth` stores `name`, `role`, `isAdmin`, `mustChangePassword` in state
- [ ] Persist `rockcut_name`, `rockcut_role` in localStorage; clear on logout/401
- [ ] 401 interceptor clears `rockcut_name` and `rockcut_role`
- [ ] AppBar shows `name` (or email fallback) instead of just email
- [ ] "Users" nav item visible only when `isAdmin`
- [ ] Route `/settings/users` added for admin UsersPage

### Functional — User Management UI (D10d)

- [ ] UsersPage with PageHeader, breadcrumbs (Home > Settings > Users), "Add User" button
- [ ] DataGridExtended with columns: Name, Email, Role, Active (chip), Created
- [ ] Row click opens edit dialog
- [ ] Search bar for filtering
- [ ] UserFormDialog: Name, Email, Password (required on create, optional on edit with "leave blank" hint), Role (select: Admin/User), Active (checkbox, edit only)
- [ ] "Reset Password" button in edit dialog (admin action) — calls reset endpoint, shows temporary password in a confirmation dialog so admin can share it

### Functional — Password Change Gate (D10c/D10d)

- [ ] When `must_change_password` is `true` after login, frontend shows a "Change Password" dialog before allowing access to the app
- [ ] Dialog: "Please update your password" with New Password + Confirm Password fields
- [ ] On submit: `PUT /api/session/password` with `{password, password_confirmation}`
- [ ] Backend sets new password and clears `must_change_password` flag
- [ ] User proceeds to the app normally after password change
- [ ] Cannot dismiss the dialog or navigate away — it gates the entire app

### Functional — Deployment & Cleanup (D10e)

- [ ] Seed: idempotent creation of `matt@rockcut.com` / `rockcut2026` as admin
- [ ] Remove EnvAuth config from `runtime.exs`
- [ ] Update test helpers (tokens sign user.id, not email)
- [ ] Deploy: migration auto-runs, seed via `fly ssh console`, then `fly secrets unset ADMIN_EMAIL ADMIN_PASSWORD_HASH`

### Non-Functional

- [ ] No new npm dependencies
- [ ] Follows existing patterns (BrandController, FormDialog, useApiQuery/useApiMutation)
- [ ] Backward compatible — existing brewing CRUD unaffected for both roles
- [ ] Deactivated user's token rejected by AuthPlug on next request

---

## 3. Design

### Database

```
users
├── id (integer, PK)
├── email (string, unique, not null)
├── password_hash (string, not null)
├── name (string, not null)
├── role (string, default "user") — "admin" or "user"
├── active (boolean, default true)
├── must_change_password (boolean, default false)
├── inserted_at (utc_datetime)
└── updated_at (utc_datetime)
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/session` | Public | Login (returns token + user info) |
| GET | `/api/session` | Authenticated | Current user info |
| PUT | `/api/session/password` | Authenticated | Change own password |
| GET | `/api/users` | Admin | List users |
| POST | `/api/users` | Admin | Create user |
| GET | `/api/users/:id` | Admin | Show user |
| PUT | `/api/users/:id` | Admin | Update user |
| DELETE | `/api/users/:id` | Admin | Delete user |
| POST | `/api/users/:id/reset_password` | Admin | Reset password + set must_change flag |

### Password Reset Flow

```
Admin clicks "Reset Password" on user row
  → POST /api/users/:id/reset_password
  → Backend generates temp password, hashes it, sets must_change_password=true
  → Response: { temp_password: "abc12xyz" }
  → Frontend shows dialog: "Temporary password: abc12xyz — share this with the user"
  → Admin tells user their temp password (in person, verbally, etc.)

User logs in with temp password
  → POST /api/session returns { ..., must_change_password: true }
  → Frontend gates app with "Change Password" dialog
  → User enters new password
  → PUT /api/session/password { password, password_confirmation }
  → Backend clears must_change_password, user proceeds to app
```

### Files Changed

| Action | File |
|--------|------|
| Create | `priv/repo/migrations/YYYYMMDD_create_users.exs` |
| Create | `lib/rockcut_api/accounts/user.ex` |
| Create | `lib/rockcut_api/accounts.ex` |
| Create | `lib/rockcut_api_web/plugs/require_admin_plug.ex` |
| Create | `lib/rockcut_api_web/controllers/user_controller.ex` |
| Create | `src/pages/settings/UsersPage.tsx` |
| Create | `src/pages/settings/UserFormDialog.tsx` |
| Create | `src/components/ChangePasswordDialog.tsx` |
| Modify | `lib/rockcut_api_web/controllers/session_controller.ex` |
| Modify | `lib/rockcut_api_web/plugs/auth_plug.ex` |
| Modify | `lib/rockcut_api_web/controllers/json_helpers.ex` |
| Modify | `lib/rockcut_api_web/router.ex` |
| Modify | `src/hooks/useAuth.ts` |
| Modify | `src/lib/api.ts` |
| Modify | `src/lib/types.ts` |
| Modify | `src/App.tsx` |
| Modify | `priv/repo/seeds.exs` |
| Modify | `config/runtime.exs` |
| Delete | `lib/rockcut_api/auth/env_auth.ex` |

---

## 4. Sub-Deliverables

| ID | Name | Dependencies | Parallelizable |
|----|------|--------------|----------------|
| D10a | Backend — Users table, Accounts context, auth migration | None | Yes (with D10c prep) |
| D10b | Backend — User Management API + password reset endpoint | D10a | Yes (with D10c) |
| D10c | Frontend — Auth updates + password change gate | D10a | Yes (with D10b) |
| D10d | Frontend — User Management UI + reset password UX | D10b, D10c | No |
| D10e | Deployment & cleanup | D10a-D10d | No |

---

## 5. Success Criteria

- [ ] POST `/api/session` returns token + name + role + must_change_password
- [ ] GET `/api/session` returns current user info
- [ ] Regular user gets 403 on `/api/users/*`
- [ ] Admin gets 200 on `/api/users/*` — full CRUD works
- [ ] POST `/api/users/:id/reset_password` returns temp password, sets must_change flag
- [ ] PUT `/api/session/password` changes password and clears must_change flag
- [ ] Frontend: admin sees "Users" nav, regular user does not
- [ ] Frontend: user with `must_change_password` sees gate dialog on login
- [ ] Frontend: after changing password, user can access app normally
- [ ] Frontend: "Reset Password" button in edit dialog shows temp password
- [ ] All 13 brewing CRUD endpoints still work for both roles
- [ ] Deactivated user's token is rejected by AuthPlug
- [ ] Matt can log in after deployment with existing credentials

---

## 6. Out of Scope

- Email-based password reset (no email infrastructure)
- Self-service password change (users can't change their own password except after admin reset)
- User profile editing (users can't edit their own name/email)
- Permission granularity beyond admin/user (no per-entity permissions)
- Session management (no "log out all devices" or session listing)
- Audit logging (no tracking of who changed what)
