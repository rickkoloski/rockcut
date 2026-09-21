# Session Handoff — 2026-09-20

**Purpose:** Context preservation before conversation compact. Pick up from here.

---

## Project

**Rockcut Brewing Co** — brewery + staff management app for Matt, Estes Park, CO.

**Stack:**
- API: Phoenix 1.8 / Elixir, SQLite (WAL), port 4002 locally
- UI: React 19 / Vite / MUI 7 / pnpm, port 5174 locally
- Hosting: Fly.io (`rockcut-api.fly.dev`, `rockcut-ui.fly.dev`)
- Shared dep: `datagrid-extended` from `~/src/shared/ui-components/` (sibling of `rockcut/`)

**Running locally (native — no Docker on this machine):**
- API: `cd rockcut_api && MIX_ENV=dev mix phx.server` → http://localhost:4002
- UI: `cd rockcut-ui && pnpm dev --port 5174` → http://localhost:5174 (Vite proxies `/api` → :4002)
- Login: `matt@rockcut.com` / `rockcut2026` (the seeded **owner**)
- DB reset: `cd rockcut_api && MIX_ENV=dev mix ecto.reset` (drops, migrates, seeds)

**Branch:** `practice1` — **8 new commits this session, NOT pushed to origin yet.**

**Next deliverable: D12** (D10 + D11 complete).

---

## Completed This Session

### D10 — Users, Departments & Tiered Authorization (COMPLETE, 3 phases)

Replaced the single-admin `EnvAuth` with a real multi-user RBAC system.

- **Model:** `users` (`is_owner`, `active`, `must_reset_password`, `COLLATE NOCASE`
  email), `departments` (Brewery/Bar/Office/Sales, seeded), `memberships`
  (per-department `manager|employee`), `audit_log`.
- **Auth:** Argon2 login against `users`; token payload is now `user_id` (was
  email — **existing tokens invalidated**); `AuthPlug` loads the full user and
  re-checks `active` each request (soft revocation). `EnvAuth` removed.
- **Authz** (`lib/rockcut_api/authz.ex`): `owner?`, `role_in`, `member_of?`,
  `can_manage_users_in?`, `managed_department_ids/keys`, `can_manage_any?`, and
  action-aware `can?/3` (takes the resource). `ModuleAccessPlug` gates brewing
  routes behind Brewery membership.
- **Management API:** declarative `set_memberships/3` with escalation guards
  (managers confined to their departments; only owners set `is_owner`; **last
  active owner can't be demoted/deactivated**); `GET /api/me` capabilities;
  users CRUD; password lifecycle; owner activity feed (`/api/owner/activity`).
- **Frontend:** capability-filtered nav, User Management screen with a scoped
  role editor, forced-reset interstitial, owner activity feed.
- **Owner notification** of manager actions = in-app (audit feed +
  `pending_owner_reviews` on `/api/me`). Email/push deferred.
- Completion doc: `stepwise_results/d10_user_roles_authorization_COMPLETE.md`.

### D11 — Staff Scheduling (COMPLETE, 2 phases)

Shift scheduling in the spirit of *When I Work* (not task tracking). First real
consumer of D10 authz.

- **Model:** `positions` (**company-wide** list; name + cosmetic `group` +
  `active`) and `shifts` (department, position, nullable assignee = open shift,
  UTC `starts_at`/`ends_at`, `draft|published`, notes, created_by).
- **Rules:** global read of **published** shifts (all departments); **drafts**
  visible only to that department's managers/owners; managers create/edit/assign/
  delete/**publish** their department's shifts; employees **claim** open
  published shifts in their own department. Positions managed by any manager/owner.
- **Authz:** `can?/3` clauses for `%Shift{}` (incl. draft visibility + claim +
  publish) and `%Position{}`. `list_shifts/2` enforces draft visibility in the
  query. `"schedule"` added to every user's `capabilities.modules`.
- **API:** `/api/positions` (index/create/update/delete, soft-deactivate if
  referenced) and `/api/shifts` (index/show/create/update/delete + `/publish`,
  `/claim`).
- **Frontend:** Schedule agenda (day-grouped, all departments, filters), shift
  create/edit dialog with Publish/Delete, positions management dialog, employee
  Claim button, Schedule nav for all. Times stored UTC, displayed
  **America/Denver** (`rockcut-ui/src/lib/datetime.ts`).
- **Seed:** 10 starter positions (Brewer; Bar-open/mid/close/Event-bar; Office;
  Sales/Delivery; Training/Event-offsite) + 3 sample shifts.

**Tests:** 107 ExUnit tests, 0 failures (57 → 86 after D10, → 107 after D11).

---

## Current State of Key Files

| File | What it is |
|---|---|
| `rockcut_api/lib/rockcut_api/accounts.ex` | Users/departments/memberships context + auth, capabilities, audit |
| `rockcut_api/lib/rockcut_api/authz.ex` | Central `can?/3` + role helpers (D10 + D11 shift/position clauses) |
| `rockcut_api/lib/rockcut_api/scheduling.ex` | Positions + shifts context; `list_shifts/2` draft visibility |
| `rockcut_api/lib/rockcut_api/scheduling/{position,shift}.ex` | Schemas |
| `rockcut_api/lib/rockcut_api_web/plugs/{auth_plug,module_access_plug}.ex` | Load user + gate modules |
| `rockcut_api/lib/rockcut_api_web/controllers/*` | session, me, user, membership, department, owner_activity, position, shift |
| `rockcut_api/priv/repo/seeds.exs` | Departments + owner + positions + sample shifts (idempotent) |
| `rockcut-ui/src/hooks/useAuth.ts` | Zustand store; login → `/api/me` (user + capabilities) |
| `rockcut-ui/src/App.tsx` | Nav gating by capabilities, forced-reset gate, routes |
| `rockcut-ui/src/pages/{users,activity,schedule,auth}/*` | D10/D11 screens |
| `rockcut-ui/src/lib/datetime.ts` | UTC ↔ America/Denver helpers |

Specs/plans: `docs/current_work/specs/d10_*`, `d11_*`; `docs/current_work/planning/d10_*`, `d11_*`.

---

## Known Gaps / Next Work

- [ ] **D11 completion doc** not yet written (`stepwise_results/d11_scheduling_COMPLETE.md`).
- [ ] **D12 — weekly grid view** (staff × days) for the schedule; v1 is a
      day-grouped agenda list.
- [ ] **Scheduling follow-ons** (each its own deliverable): availability,
      time-off requests, shift swaps/drops, time clock, notifications, recurring
      shifts, overlap/double-booking warnings.
- [ ] **Push `practice1`** to origin (`rickkoloski/rockcut`, Matt has write).
- [ ] Sample seed shifts use arbitrary UTC hours → one displays at an odd local
      time. Cosmetic only.

### Prod cutover caveat (D10)
Deploying D10 is a **breaking auth change**: run migrations **and** the seed on
deploy (seeds the owner from `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` Fly secrets,
hash copied as-is). Existing bearer tokens are invalidated — everyone re-logs-in.
Verify the owner can log in before relying on it.

### Environment gotchas
- **Do NOT run repo-wide `mix format`** in `rockcut_api` — it reflows the whole
  legacy tree (huge unrelated churn). Format only the files you changed. (Memory:
  `rockcut-mix-format-churn`.)
- **`tsc -b` is pre-existingly broken** by the linked `datagrid-extended`
  package (can't resolve `@mui/x-data-grid` from its path). Verify UI with
  `vite build` + `tsc --noEmit -p tsconfig.app.json` (ignore `../../shared`
  errors) + ESLint. The app runs fine via Vite.

---

## Resume Instructions

1. Start services (see **Running locally** above); `mix ecto.reset` if the dev DB
   needs the latest seed.
2. Read this file and `CLAUDE.md`; specs/plans live in `docs/current_work/`.
3. Verify: `cd rockcut_api && MIX_ENV=test mix test` (expect 107 passing).
4. Likely next topics: write the D11 completion doc; start D12 (weekly grid);
   or push `practice1`. Follow the SDLC flow (spec → plan → implement) for new
   deliverables; commit at phase boundaries; keep `mix format` scoped to touched
   files.
