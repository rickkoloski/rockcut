# Session Handoff — 2026-09-23

**Purpose:** Context preservation before closing. Pick up from here.
Supersedes `SESSION_HANDOFF_2026-09-22.md` (which predates D19–D23 and the
`scheduler-pwa` branch).

---

## Project

**Rockcut Brewing Co** — brewery + staff management app for Matt, Estes Park, CO.

**Stack:** Phoenix 1.8 / Elixir / SQLite (API :4002) · React 19 / Vite / MUI 7 /
pnpm (UI :5174) · **installable PWA** (vite-plugin-pwa, custom service worker) ·
Fly.io. Shared dep `datagrid-extended` from `~/src/shared/`.

**Run locally (native, no Docker):**
- API: `cd rockcut_api && MIX_ENV=dev mix phx.server` → http://localhost:4002
- UI (dev): `cd rockcut-ui && pnpm dev --port 5174` → http://localhost:5174
- **UI (built, for PWA/push/messaging install testing): `pnpm build && pnpm
  preview`** → http://localhost:4173 (the service worker is **off** under `pnpm
  dev`; preview has a matching `/api` proxy). See memory `rockcut-pwa-testing`.
- Login: `matt@rockcut.com` / `rockcut2026` (owner)
- DB reset: `cd rockcut_api && MIX_ENV=dev mix ecto.reset`
- Dev email mailbox: http://localhost:4002/dev/mailbox
- Note: this machine reaps background servers under memory pressure; just restart.
  Adding/removing pnpm or mix deps can leave a *running* server stale — restart it.

**Branch:** `scheduler-pwa` (off `practice1`) — **pushed to `origin`
(rickkoloski/rockcut).** Clean tree. No PR opened (by choice).

**Next deliverable: D24.** Tests: `cd rockcut_api && MIX_ENV=test mix test` →
**159 passing**.

---

## State: D10–D23 complete (all committed; D19–D23 on `scheduler-pwa`)

Specs + completion records in `docs/current_work/{specs,stepwise_results}/`.
D10–D18 recap is in the 2026-09-22 handoff. This session added:

- **D19 — Installable PWA.** `vite-plugin-pwa` (Workbox), manifest, icons
  (`scripts/gen-pwa-icons.cjs`), custom service worker (`src/sw.ts`), install
  prompt. App-shell precache only — **no API caching**. SW off in dev.
- **D20 — Department-grouped nav.** Collapsible left nav: **Schedule** (View
  Schedule = agenda `/schedule`, Scheduler = grid `/scheduler` owner/mgr, Time
  off), per-department headings (shown by membership via `capabilities.modules`),
  **Admin**, **Messages**. Schedule page split by a `forceView` prop.
- **D21 — Web push.** `web_push` channel (`:push`) in the D18 dispatcher via
  `web_push_ex` + `Req`; `push_subscriptions`; custom SW push handlers; per-device
  enable UI. VAPID: dev keypair in `config.exs`, **prod needs Fly secrets**
  (`WEB_PUSH_EX_VAPID_{PUBLIC,PRIVATE}_KEY`). Also: coalesced bulk-publish
  notifications; merged `shift_published`+`shift_assigned` → **`shift_scheduled`**
  ("You've been scheduled"); new **`shift_changed`** ("Your schedule has changed",
  on time/position edit of a published shift).
- **D22 — Shift reminders.** One reminder ~1h before a published shift
  (`shift_reminder`); lightweight `Reminders.Scheduler` GenServer (every 5 min,
  off in test) + `shift_reminders` dedup ledger. Offset configurable
  (`:reminder_offset_minutes`, default 60). No Oban.
- **D23 — Team messaging.** Derived pre-defined channels (no channels table):
  `all` (All-staff), `managers` (managers+owners), `dept:<key>` per assignable
  department. Access from membership/role → full history incl. pre-join. New
  messages notify via **email + push** (`message_posted`; bell off by default via
  per-event notification defaults) + unread badges. `/messages` page (thread-only;
  **each channel is listed individually in the Messages nav** with unread badges).

Notification events now: `shift_scheduled`, `shift_changed`, `shift_reminder`,
`open_shift`, `message_posted`. Owner activity feed moved to **Admin → "User
change log"** (`/activity`).

---

## Remaining "When I Work"-style features (not built)

Suggested order:
1. **Availability** (employees mark when they can work) + hard **conflict
   warnings** when scheduling over time-off/availability.
2. **Shift swaps / drops** (employee-initiated, manager approval).
3. **SMS** notifications — Twilio + A2P 10DLC (mostly Matt's account work).
4. Reminders: **24h + 1h** windows (offset list already supported); reminders for
   open shifts; suppress when the assignee has approved time-off.
5. Messaging: DMs / private channels, threads, reactions, attachments, @mentions,
   real-time via Phoenix Channels (currently polling); per-channel mute.
6. Mobile **weekly-grid redesign** (agenda/tap-to-claim) — deferred D19 "bucket 3".
7. Time clock + timesheets; labor cost/budgeting.
8. Production **email provider** config (Mailgun/SendGrid/SMTP).

---

## Gotchas (also in memory)

- **PWA/push/messaging testing needs the built app** (`pnpm preview`, :4173), not
  the dev server (:5174) — SW is disabled in dev. (memory: `rockcut-pwa-testing`)
- **Message notifications exclude the author**, so testing message email/push
  needs a **second user**; unread also excludes your own posts.
- **Prod VAPID secrets** must be set before push works in prod (dev keypair is
  local-only, committed).
- **Do NOT run repo-wide `mix format`** in `rockcut_api` — format only changed
  files. (memory: `rockcut-mix-format-churn`)
- **`tsc -b` is pre-broken** by linked datagrid-extended. Verify UI with
  `vite build` + `tsc --noEmit -p tsconfig.app.json` (ignore `../../shared`) +
  ESLint.
- **No server timezone library on purpose** — frontend does Denver↔UTC; server
  stores/emits UTC (reminders/messaging all use UTC math).
- **Prod cutover caveat (D10):** deploying is a breaking auth change (migrations +
  seed; bearer tokens invalidated). **Not yet deployed.** New tables since:
  push_subscriptions, shift_reminders, messages, channel_reads.
- SDLC flow: spec → (plan) → implement, commit at phase boundaries; scheduling
  concept `07_scheduling`, notifications/messaging `08_notifications`.

---

## Resume Instructions

1. Start API + UI (above); `mix ecto.reset` if the dev DB needs the latest seed.
   For PWA/push/messaging, use `pnpm build && pnpm preview` (:4173).
2. Read this file + `CLAUDE.md`; deliverable docs in `docs/current_work/`.
3. `MIX_ENV=test mix test` (expect 159 passing).
4. Pick the next feature (availability + conflicts / shift swaps / mobile grid) →
   spec it as **D24**.
5. `scheduler-pwa` is pushed but has **no PR**; open one (→ `practice1`) when ready.
