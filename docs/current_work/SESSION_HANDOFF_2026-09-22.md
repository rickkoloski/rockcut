# Session Handoff — 2026-09-22

**Purpose:** Context preservation before closing. Pick up from here.
Supersedes `SESSION_HANDOFF_2026-09-21.md` (which predates D15–D18).

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
- Dev email mailbox: http://localhost:4002/dev/mailbox
- Note: this machine reaps background servers under memory pressure; just restart them.

**Branch:** `practice1` — **pushed to `origin` (rickkoloski/rockcut) through `a55b4c6`.** Clean tree.

**Next deliverable: D19.** Tests: `cd rockcut_api && MIX_ENV=test mix test` → **141 passing**.

---

## State: D10–D18 complete (all pushed)

Specs + plans in `docs/current_work/{specs,planning}/`; completion records in
`docs/current_work/stepwise_results/*_COMPLETE.md`.

- **D10 — Users & Tiered Authorization.** users/departments/memberships, Argon2
  auth (replaced EnvAuth), `Authz.can?/3`, module gating, user management, owner
  activity. Owner / manager / employee tiers.
- **D11 — Staff Scheduling.** Positions + department shifts, draft→publish,
  open-shift claim, agenda view.
- **D12 — Weekly grid + color palette.** Mon–Sun grid (all staff × 7 days),
  department colors, unpublish, publish-week, `/api/roster`.
- **D13 — Grid drag-and-drop.** Reschedule/reassign/unassign (auto-drafts); any
  employee schedulable in any department.
- **D14 — Templates.** Per-position standard hours, copy previous week, named
  week/day templates.
- **D15 — Bulk actions & roster controls.** Delete/publish week (whole + per
  employee), hide-from-schedule (`schedulable`), saved employee order.
- **D16 — Time-off requests.** PTO/Sick/Unpaid/Personal, partial/full day,
  approve-deny, grid "Off" markers.
- **D17 — Calendar feeds.** ICS user/department/whole-schedule feeds (Google/
  Apple sync), public tokenized `.ics`, rotate. (Real subscription needs a
  public host — Google can't reach localhost.)
- **D18 — Notifications.** Core (events → per-user prefs → channels) + in-app
  bell + email (Swoosh). Events: shift_published, shift_assigned, open_shift.

Positions belong to a department; a shift's department derives from its position.
"Other" is a scheduling-only, non-assignable department (Training/Event-offsite).

---

## Remaining "When I Work"-style features (not built)

Suggested order:
1. **SMS notifications** — Twilio + **A2P 10DLC** registration (mostly Matt's
   account/registration work; then wire the adapter + phone/consent fields +
   STOP/HELP). See the detailed SMS write-up in the D18 conversation.
2. **Web push** notifications — VAPID keys + service worker + subscriptions.
3. **Reminders** (`shift.reminder`) — needs a job scheduler (**Oban**) to scan
   upcoming shifts (e.g. 24 h / 1 h before).
4. **Availability** (employees mark when they can work) + hard **conflict
   warnings** when scheduling over time-off/availability.
5. **Shift swaps / drops** (employee-initiated, manager approval).
6. Time clock + timesheets; labor cost/budgeting; touch-drag; **weekly grid** is
   done (D12) — a fuller calendar/month view could come later.
7. Production **email provider** config (Mailgun/SendGrid/SMTP) for D18 email.

---

## Gotchas (also in memory)

- **Do NOT run repo-wide `mix format`** in `rockcut_api` — it reflows the whole
  legacy tree. Format only files you changed. (memory: `rockcut-mix-format-churn`)
- **`tsc -b` is pre-broken** by the linked datagrid-extended package. Verify UI
  with `vite build` + `tsc --noEmit -p tsconfig.app.json` (ignore `../../shared`
  errors) + ESLint.
- **No server timezone library on purpose** — the frontend does Denver↔UTC; the
  server stores/emits UTC. Keep it that way unless a feature truly needs server
  tz (then add `tzdata`).
- **Prod cutover caveat (D10):** deploying is a breaking auth change — run
  migrations **and** the seed (bootstraps owner from `ADMIN_*` Fly secrets);
  bearer tokens invalidated (email→user_id). Not yet deployed.
- SDLC flow: spec → plan → implement, commit at phase boundaries; scheduling
  concept is `07_scheduling`, notifications `08_notifications`.

---

## Resume Instructions

1. Start API + UI (above); `mix ecto.reset` if the dev DB needs the latest seed
   (owner, 5 departments incl. Other, positions w/ standard hours, sample
   shifts).
2. Read this file + `CLAUDE.md`; deliverable docs in `docs/current_work/`.
3. `MIX_ENV=test mix test` (expect 141 passing).
4. Pick the next feature (SMS / push / reminders / availability) → spec it as
   **D19**.
