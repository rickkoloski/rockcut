# D10: User Management — Plan

**Spec:** `d10_user_management_spec.md`
**Branch:** `feat/d10-user-management`

---

## Task Breakdown

### D10a: Backend — Users Table, Accounts Context, Auth Migration

**Files to create:**
1. `rockcut_api/priv/repo/migrations/20260215000001_create_users.exs`
   - `users` table: id, email (unique index), password_hash, name, role (default "user"), active (default true), must_change_password (default false), timestamps

2. `rockcut_api/lib/rockcut_api/accounts/user.ex`
   - Ecto schema with fields matching migration
   - Virtual `:password` field
   - `registration_changeset/2` — requires email, password, name; validates email format, password min 6 chars
   - `changeset/2` — optional password; for updates
   - `password_changeset/2` — requires password + password_confirmation; for self-service password change
   - Private `maybe_hash_password/1` — if password present, hash with Argon2 and put `password_hash`

3. `rockcut_api/lib/rockcut_api/accounts.ex`
   - `authenticate(email, password)` — find by email (case-insensitive), verify with Argon2, return `{:ok, user}` or `:error`
   - `list_users/0`, `get_user!/1`, `get_user/1`
   - `create_user/1` (uses `registration_changeset`)
   - `update_user/2` (uses `changeset`)
   - `change_password/2` (uses `password_changeset`)
   - `reset_password/1` — generates random 8-char password, applies it via `changeset` with `must_change_password: true`, returns `{:ok, user, temp_password}`
   - `delete_user/1`

**Files to modify:**
4. `rockcut_api/lib/rockcut_api_web/controllers/session_controller.ex`
   - `create/2`: Call `Accounts.authenticate` instead of `EnvAuth`. Sign `user.id` (integer). Return `%{token, email, name, role, must_change_password}`.
   - `show/2`: Read `conn.assigns.current_user` as `%User{}`. Return `%{email, name, role, must_change_password}`.
   - New `change_password/2`: Accepts `{password, password_confirmation}`. Calls `Accounts.change_password(current_user, params)`. Clears `must_change_password`. Returns `%{ok: true}`.

5. `rockcut_api/lib/rockcut_api_web/plugs/auth_plug.ex`
   - After verifying token (now integer user_id), load via `Accounts.get_user/1`
   - Reject if user is nil or `active == false`
   - Assign full `%User{}` struct to `conn.assigns.current_user`

**Files to delete:**
6. `rockcut_api/lib/rockcut_api/auth/env_auth.ex`

---

### D10b: Backend — User Management API + Password Reset

**Files to create:**
1. `rockcut_api/lib/rockcut_api_web/plugs/require_admin_plug.ex`
   - Check `conn.assigns.current_user.role == "admin"`, otherwise 403

2. `rockcut_api/lib/rockcut_api_web/controllers/user_controller.ex`
   - Standard CRUD following `BrandController` pattern
   - Import `user/1` from JSONHelpers
   - New `reset_password/2` action: calls `Accounts.reset_password(user)`, returns `%{data: %{temp_password: ...}}`

**Files to modify:**
3. `rockcut_api/lib/rockcut_api_web/controllers/json_helpers.ex`
   - Add `user/1` function — renders id, email, name, role, active, must_change_password, inserted_at, updated_at (excludes password_hash)

4. `rockcut_api/lib/rockcut_api_web/router.ex`
   - New pipeline `:admin` with `RequireAdminPlug`
   - New scope piped through `[:api, :authenticated, :admin]`:
     - `resources "/users", UserController, except: [:new, :edit]`
     - `post "/users/:id/reset_password", UserController, :reset_password`
   - New authenticated route: `put "/session/password", SessionController, :change_password`

---

### D10c: Frontend — Auth Updates + Password Change Gate

**Files to modify:**
1. `rockcut-ui/src/hooks/useAuth.ts`
   - Add `name`, `role`, `isAdmin`, `mustChangePassword` to state
   - On login: persist `rockcut_name`, `rockcut_role` to localStorage; set `mustChangePassword` from response
   - On `checkAuth`: hydrate name/role from session response
   - On logout/401: clear `rockcut_name`, `rockcut_role`
   - Add `clearMustChangePassword()` to call after successful password change
   - Add `changePassword(password, passwordConfirmation)` action

2. `rockcut-ui/src/lib/api.ts`
   - Add `rockcut_name` and `rockcut_role` to 401 cleanup

3. `rockcut-ui/src/lib/types.ts`
   - Add `User` interface: `id, email, name, role, active, must_change_password, inserted_at, updated_at`

4. `rockcut-ui/src/App.tsx`
   - Show `name` (or email fallback) in AppBar
   - Conditionally show "Users" nav item when `isAdmin` (PeopleIcon)
   - Add Route for `/settings/users`
   - After `isAuthenticated` check, if `mustChangePassword`, render `<ChangePasswordDialog>` instead of main layout

**Files to create:**
5. `rockcut-ui/src/components/ChangePasswordDialog.tsx`
   - Full-screen blocking dialog: "Please update your password"
   - Fields: New Password, Confirm Password
   - Submit calls `useAuth.changePassword()` then `clearMustChangePassword()`
   - Cannot dismiss — no close button, no backdrop click

---

### D10d: Frontend — User Management UI + Reset Password UX

**Files to create:**
1. `rockcut-ui/src/pages/settings/UsersPage.tsx`
   - PageHeader with breadcrumbs (Home > Settings > Users), "Add User" action button
   - DataGridExtended with columns: Name, Email, Role (chip), Active (chip), Created
   - Row click opens UserFormDialog in edit mode
   - Search bar for filtering
   - `useApiQuery(['users'], '/api/users')` for data
   - `columnVisibilityToggle` enabled

2. `rockcut-ui/src/pages/settings/UserFormDialog.tsx`
   - FormDialog wrapper
   - Fields: Name (text), Email (text), Password (text, required on create, "leave blank to keep" on edit), Role (select: Admin/User), Active (checkbox, edit only)
   - "Reset Password" button (edit only) — calls `POST /api/users/:id/reset_password`
   - On reset success: shows a secondary dialog with the temp password for admin to share
   - Uses `useApiCreate`/`useApiUpdate` with `['users']` query key invalidation

---

### D10e: Deployment & Cleanup

1. `rockcut_api/priv/repo/seeds.exs` — add idempotent admin seed:
   ```elixir
   unless Accounts.get_user_by_email("matt@rockcut.com") do
     Accounts.create_user(%{email: "matt@rockcut.com", password: "rockcut2026", name: "Matt", role: "admin"})
   end
   ```

2. `rockcut_api/config/runtime.exs` — remove `admin_email` and `admin_password_hash` config

3. Test helpers — update `auth_conn` in `formula_controller_test.exs`:
   - Create a real user via `Accounts.create_user`
   - Sign `user.id` instead of email string

4. `CLAUDE.md` — update Auth section, add D10 to completed deliverables

---

## Implementation Order

```
D10a (backend auth) ──┬──→ D10b (user API) ──┬──→ D10d (user UI) ──→ D10e (deploy)
                      └──→ D10c (frontend auth) ──┘
```

D10a must go first (everything depends on the new user model).
D10b and D10c can run in parallel after D10a.
D10d depends on both D10b and D10c.
D10e is final cleanup.

---

## Team Structure (for Claude Code team)

| Agent | Sub-deliverable | Type |
|-------|----------------|------|
| backend | D10a, D10b, D10e (backend parts) | general-purpose |
| frontend | D10c, D10d, D10e (frontend parts) | general-purpose |

Backend agent completes D10a first (blocking), then D10b.
Frontend agent starts D10c once D10a is done, then D10d after both D10b and D10c.
Both agents coordinate on D10e.
