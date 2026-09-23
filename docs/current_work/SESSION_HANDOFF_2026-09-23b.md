# Session Handoff — 2026-09-23 (b)

**Purpose:** Context preservation before closing. Pick up from here.
Supersedes `SESSION_HANDOFF_2026-09-23.md` (which predates D24–D26). Adds
scheduling **conflict warnings**, employee **availability**, a batch of
**time-off** enhancements, and a **company-wide home page**.

---

## Project

**Rockcut Brewing Co** — brewery **+ company-wide** staff management app for Matt,
Estes Park, CO. (Originally brewing-only; now schedule/time-off/availability/
messaging for every department.)

**Stack:** Phoenix 1.8 / Elixir / SQLite (API :4002) · React 19 / Vite / MUI 7 /
pnpm (UI :5174) · **installable PWA** (vite-plugin-pwa, custom service worker) ·
Fly.io. Shared dep `datagrid-extended` from `~/src/shared/`.

**Run locally (native, no Docker):**
- API: `cd rockcut_api && MIX_ENV=dev mix phx.server` → http://localhost:4002
- UI (dev): `cd rockcut-ui && pnpm dev --port 5174` → http://localhost:5174
- **UI (built, for PWA/push/messaging): `pnpm build && pnpm preview`** →
  http://localhost:4173 (SW is **off** under `pnpm dev`). See memory
  `rockcut-pwa-testing`. Note `pnpm build` runs `tsc -b && vite build`; **`tsc -b`
  is pre-broken** by linked datagrid-extended — build with `pnpm exec vite build`
  directly, and verify types with `tsc --noEmit -p tsconfig.app.json`.
- Login: `matt@rockcut.com` / `rockcut2026` (owner)
- DB migrate/reset: `cd rockcut_api && MIX_ENV=dev mix ecto.migrate` (or `ecto.reset`)
- Dev email mailbox: http://localhost:4002/dev/mailbox
- This machine reaps background servers under memory pressure; just restart.

**Branch:** `scheduler-pwa` (off `practice1`) — **pushed to `origin`
(rickkoloski/rockcut).** No PR opened (by choice).

**Tests:** `cd rockcut_api && MIX_ENV=test mix test` → **181 passing**.
**Next deliverable: D27.**

---

## State: D10–D26 complete. This session added D24–D26.

Specs + completion records in `docs/current_work/{specs,stepwise_results}/`.
D10–D23 recap is in the 2026-09-23 (a) handoff. This session:

- **D24 — Scheduling conflict warnings.** Non-blocking, client-side detection
  (`rockcut-ui/src/lib/conflicts.ts`): approved **time-off overlap** +
  **double-booking**. Marked chips (red border + ⚠ + tooltip) + week banner in the
  Scheduler grid; live warning in the Add/Edit shift dialog.
- **D25 — Employee availability.** Recurring weekly self-declared slots
  (`unavailable`/`preferred`): `availability_slots` table, `RockcutApi.Availability`
  context/controller, `GET/POST/DELETE /api/availability`, `/availability` editor
  page (Schedule nav). `unavailable` slots feed `conflicts.ts` as a third
  `availability` conflict kind; the grid shows availability + time-off chips per
  cell (with times).
- **D25 also — time-off enhancements** (built as follow-ups; see the D25 result):
  - **Cross-day timed** time-off (start date+time → end date+time), not just
    within one day.
  - Grid **off-chips show times**; **pending** requests shown too (amber dashed,
    distinct from approved grey); conflicts still fire on **approved** only.
  - **On-behalf entry:** managers/owners can enter **time off and availability
    for employees they manage** (owner → anyone; manager → managed depts' members),
    via `Authz.can_manage_user?/2`. Time off entered on-behalf is created
    **approved** (actor is the reviewer); unmanaged target → 403.
  - **Approval workflow:** managers/owners can approve **their own** requests
    (still start pending); the requester can **cancel** their own request even
    after it's **approved**; managers/owners can **deny/remove** an approved
    request (with a **confirm step**). Time-off page lists (for managers/owners),
    date-sorted: **My requests → Pending (others) → Approved (others)**; approved
    rows show **"Approved by {name}"**.
- **D26 — Company-wide home.** New generic `/` landing (welcome + quick-link
  cards) for **all** employees; the old brewers' dashboard moved to **`/brewery`**
  (brewery-only, via **Brewery → Dashboard**). Top-level **Home** nav link;
  catch-all route → `/`. Intentionally a shell for future home **widgets**.

- **Fix — change-log badge.** The Admin → "User change log" nav badge used a
  7-day "user.created" heuristic (always lit for a week, no read state). Now it's
  a real unread count: `users.activity_seen_at` + `POST /api/owner/activity/seen`
  (called when the owner opens `/activity`, then `loadMe()` refreshes the badge);
  `pending_owner_reviews` counts audit entries newer than `activity_seen_at` that
  the owner didn't make. Opening the log clears the dot.

**New DB tables since 2026-09-23 (a):** `availability_slots`
(+ column `users.activity_seen_at`).
**New key UI modules:** `lib/conflicts.ts`, `lib/timeoff.ts`,
`pages/availability/Availability.tsx`, `pages/brewery/BreweryDashboard.tsx`.

---

## Remaining "When I Work"-style features (not built)

Availability + hard conflict warnings are now **done** (D24/D25). Suggested next:
1. **Home widgets** (D26 left the page a shell): next shift, unread messages,
   pending approvals (managers), open shifts, announcements.
2. **Shift swaps / drops** (employee-initiated, manager approval).
3. **SMS** notifications — Twilio + A2P 10DLC (mostly Matt's account work).
4. Reminders: **24h + 1h** windows; reminders for open shifts; suppress when the
   assignee has approved time-off.
5. Messaging: DMs / private channels, threads, reactions, attachments, @mentions,
   real-time via Phoenix Channels (currently polling); per-channel mute.
6. Mobile **weekly-grid redesign** (agenda/tap-to-claim).
7. Time clock + timesheets; labor cost/budgeting.
8. Production **email provider** config (Mailgun/SendGrid/SMTP).
9. Conflict/availability polish: partial-day time-off in the grid uses day-level
   markers for conflicts; a server-side conflict check; `preferred` as a soft
   warning; a "Team time off" list on the Time off page for on-behalf approved.

---

## Gotchas (also in memory)

- **PWA/push/messaging testing needs the built app** (`pnpm preview`, :4173), not
  dev (:5174). (memory: `rockcut-pwa-testing`)
- **Message notifications exclude the author** — test with a **second user**.
- **Prod VAPID secrets** must be set before push works in prod.
- **Do NOT run repo-wide `mix format`** in `rockcut_api` (reformats the legacy
  tree) — **and don't run `mix precommit`** (its alias runs `format`). Format only
  changed files. (memory: `rockcut-mix-format-churn`)
- **`tsc -b` is pre-broken** by linked datagrid-extended. Verify UI with
  `vite build` + `tsc --noEmit -p tsconfig.app.json` (ignore `../../shared`) + ESLint.
- **No server timezone library on purpose** — frontend does Denver↔UTC; server
  stores/emits UTC. Availability times are Denver wall-clock (`:time`); the
  frontend maps a shift's Denver weekday/time for availability conflicts.
- **On-behalf entry** is enforced server-side (`Authz.can_manage_user?`): owner →
  anyone; manager → members of departments they manage; else 403.
- **Prod cutover caveat (D10):** deploying is a breaking auth change. **Not yet
  deployed.** New tables since D18: push_subscriptions, shift_reminders, messages,
  channel_reads, **availability_slots**.
- **Dev DB has demo data** seeded this session for the new features (a conflict/
  overlap shift, availability slots, approved/pending/timed time-off for "Kate S").
  Run `mix ecto.reset` to clear.

---

## Resume Instructions

1. Start API + UI (above); `mix ecto.migrate` (or `ecto.reset`) for the new
   `availability_slots` table + latest seed. For PWA use `pnpm build && pnpm
   preview` (:4173).
2. Read this file + `CLAUDE.md`; deliverable docs in `docs/current_work/`.
3. `MIX_ENV=test mix test` (expect **178 passing**).
4. Pick the next feature (home widgets / shift swaps / mobile grid) → spec as **D27**.
5. `scheduler-pwa` is pushed but has **no PR**; open one (→ `practice1`) when ready.
