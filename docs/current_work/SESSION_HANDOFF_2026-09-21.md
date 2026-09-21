# Session Handoff — 2026-09-21

**Purpose:** Context preservation before closing. Pick up from here.
Supersedes `SESSION_HANDOFF_2026-09-20.md` (which predates the scheduling work).

---

## Project

**Rockcut Brewing Co** — brewery + staff management app for Matt, Estes Park, CO.

**Stack:** Phoenix 1.8 / Elixir / SQLite (API :4002) · React 19 / Vite / MUI 7 /
pnpm (UI :5174) · Fly.io. Shared dep `datagrid-extended` from `~/src/shared/`.

**Run locally (native, no Docker):**
- API: `cd rockcut_api && MIX_ENV=dev mix phx.server` → http://localhost:4002
- UI: `cd rockcut-ui && pnpm dev --port 5174` → http://localhost:5174 (Vite proxies `/api`)
- Login: `matt@rockcut.com` / `rockcut2026` (owner)
- DB reset: `cd rockcut_api && MIX_ENV=dev mix ecto.reset`

**Branch:** `practice1` — **pushed to `origin` (rickkoloski/rockcut) through commit `0832791`.** Clean tree.

**Next deliverable: D15.**

---

## State: D10–D14 complete (all pushed)

Full write-ups in `docs/current_work/stepwise_results/*_COMPLETE.md`; specs +
plans in `docs/current_work/{specs,planning}/`.

- **D10 — Users & Tiered Authorization.** Real users/departments/memberships,
  Argon2 auth (replaced EnvAuth), `Authz.can?/3`, module gating, user-management
  UI, owner activity. Owner / manager / employee tiers.
- **D11 — Staff Scheduling.** Positions + department shifts, draft→publish,
  open-shift claim, agenda view. First consumer of D10 authz.
- **D12 — Weekly grid + color palette.** Mon–Sun grid (all staff × 7 days),
  department colors (per-position shades, owner-editable), unpublish, publish-
  week, `/api/roster`.
- **D13 — Grid drag-and-drop.** Drag to reschedule/reassign/unassign
  (auto-unpublishes); any employee schedulable in any department.
- **D14 — Templates.** (A) per-position **standard hours** presets, (B) **copy
  previous week**, (C) named **week/day templates** (save/apply/delete).
- Interleaved refinements (in D13 completion doc): confirm-before-add, split
  day/time + 15-min steps + weekly hours totals, positions-belong-to-a-department
  (shift dept derives from position; "Other" = scheduling-only non-assignable
  dept), duplicate-shift button.

**Tests:** `cd rockcut_api && MIX_ENV=test mix test` → **120 passing**.

---

## Remaining "When I Work"-style features (not built)

Suggested order:
1. **Notifications** — email/SMS/push on publish, new assignment, open shift,
   reminders (only in-app owner activity exists today, for user-mgmt).
2. **Availability** + **Time-off requests** (with approval).
3. **Shift swaps / drops** (employee-initiated, manager approval).
4. **Conflict/overlap warnings** on save.
5. **Time clock** + timesheets; **labor cost/budgeting**; **touch-drag / mobile**.

---

## Gotchas (also in memory)

- **Do NOT run repo-wide `mix format`** in `rockcut_api` — it reflows the whole
  legacy tree. Format only files you changed. (memory: `rockcut-mix-format-churn`)
- **`tsc -b` is pre-broken** by the linked datagrid-extended package. Verify UI
  with `vite build` + `tsc --noEmit -p tsconfig.app.json` (ignore `../../shared`
  errors) + ESLint.
- **Prod cutover caveat (D10):** deploying is a breaking auth change — run
  migrations **and** the seed (bootstraps owner from `ADMIN_*` Fly secrets),
  tokens invalidated (payload email→user_id), verify owner login. Not yet
  deployed.
- Follow the SDLC flow (spec → plan → implement, commit at phase boundaries);
  keep scheduling docs' concept as `07_scheduling`.

---

## Resume Instructions

1. Start API + UI (above); `mix ecto.reset` if the dev DB needs the latest seed
   (seeds owner, 5 departments incl. Other, positions w/ standard hours, sample
   shifts).
2. Read this file + `CLAUDE.md`; deliverable docs in `docs/current_work/`.
3. `MIX_ENV=test mix test` (expect 120 passing).
4. Pick the next feature (notifications suggested) → spec it as **D15**.
