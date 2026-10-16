# Rockcut Brewing Co

Brewery management app for Matt at Rockcut Brewing Co, Estes Park, Colorado.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| API | Phoenix 1.8 (Elixir) — port 4002 locally |
| Database | SQLite (WAL mode) |
| Frontend | React 19 SPA (Vite, MUI 7, pnpm) — port 5174 locally |
| Hosting | Fly.io (rockcut-api.fly.dev, rockcut-ui.fly.dev) |
| Auth | Bearer tokens, EnvAuth pattern |
| Data Grid | datagrid-extended (vendored stub in `rockcut-ui/vendor/`, task 3999) |

## Current Work

Active deliverables live in `docs/current_work/`:
- `specs/` — What to build
- `planning/` — How to build it
- `prompts/` — CC instructions
- `stepwise_results/` — Completion records
- `issues/` — Blocked items

## Project Structure

```
rockcut/
├── rockcut_api/          # Phoenix API
│   ├── lib/rockcut_api/brewing/  # 13 Ecto schemas + context
│   ├── lib/rockcut_api_web/      # Controllers, router, plugs
│   └── priv/repo/                # Migrations, seeds
├── rockcut-ui/           # React SPA
│   ├── src/pages/        # Route pages (brands, recipes, ingredients, batches, settings)
│   ├── src/components/   # Shared components (FormDialog, PageHeader, StatusChip, etc.)
│   ├── src/hooks/        # useApiQuery, useApiMutation, useAuth
│   └── src/lib/          # api.ts, types.ts, queryClient.ts, parseApiError.ts
└── docs/                 # SDLC documentation
    ├── current_work/     # Active deliverables
    ├── chronicle_by_concept/  # Completed work by domain
    ├── templates/        # Doc templates
    └── process/          # SDLC workflow docs
```

## Running the Project

```bash
# API
cd rockcut_api && mix phx.server    # http://localhost:4002

# UI
cd rockcut-ui && pnpm dev           # http://localhost:5174

# Deploy
cd rockcut_api && fly deploy --remote-only
cd rockcut-ui && fly deploy --remote-only

# Seed prod
fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval 'RockcutApi.Release.seed()'"
```

## Key Patterns

- **API params**: Flat (not nested). `{ name, category_id }` not `{ ingredient: { name } }`
- **useApiUpdate**: Callers spread payload: `{ id: item.id, ...payload }`
- **FormDialog**: Handles preventDefault internally; child dialogs just pass `async () => {}`
- **Error handling**: All form dialogs catch mutations, display via `parseApiError` + FormDialog `error` prop
- **Batch size units**: LOV — `bbls`, `gallons`, `liters` (backend + frontend must stay in sync)
- **datagrid-extended**: a vendored stub (`rockcut-ui/vendor/datagrid-extended`, plain MUI `DataGrid`) imported through a Vite alias; types come from `src/datagrid-extended.d.ts`. The plain grid is intended (Rick, msg 83601). The UI Docker build installs from `pnpm-lock.yaml` with `--frozen-lockfile`, and pnpm is pinned via `packageManager` (task 3999).

## Auth

- **Local dev + DEV server:** fictional `@rockcut-test.com` personas only (D30). Agents log in with a minted token (`mix rockcut.synthetic.token <persona>`), not a password — see `docs/process/test-credentials-policy.md` and `rockcut-ui/tests/RUNNING.md`. The seed password is a secret (PortableMind file shared by Matt + Rick; locally in gitignored `rockcut_api/.env.synthetic`).
- Prod secrets: ADMIN_EMAIL, ADMIN_PASSWORD_HASH, STAFF_CODE_KEY (D37: 32 bytes base64; the API won't boot without it, and losing it makes stored staff codes unreadable) (Fly secrets). Humans only.

## Conventions

- **Deliverable IDs**: D1, D2, ... Dnn (sequential, never reused)
- **Next deliverable**: **D44** time off from the Scheduler (draft scope, questions deferred); D46 is the next free ID. **D45** (update prompt, View Schedule 7 days, Hide shifts) is merged to `develop` (PR #29), not yet on prod. **Prod is `v2026.10.15`** (2026-10-15, PR #27): D43 UI tweaks (Hop Field themes, dark mode) on top of `v2026.10.14`'s task boards; D19–D43 complete. Task 4298 (Light "Acting as" bar contrast) from D43's gate is in the backlog. Open after the release: Matt creates and pairs the brewhouse tablet on prod (Admin → Shared devices, home Brewery). Matt's queue: task 4054 ("new version available, tap to reload" prompt), then 4055 (events in calendar feeds) and 4056 (company-wide events), then the small tasks (4060–4064 from D36; 4115, 4116, 4118, 4119 from D37; 4231–4233 and 4238 from D38; 4261 from D39). Task 3994 (`decimal` advisories, plus the `bandit` HTTP/2 advisory found at the release) is due 2026-10-30, and 4058 (remove the pre-D34 token path) 2026-11-04.
- **Commit format**: `feat: implement D6 feature name` or `fix: description`

## SDLC Process Compliance

This project follows the SDLC framework from `~/src/pm-sdlc/`.

**Every deliverable follows `docs/process/three_environment_workflow.md`** (Rick, 2026-09-28): spec with persona scenarios → local gate → DEV gate (claim DEV in PortableMind discussion 80, full Playwright on DEV, independent agent pass) → prod release from a tag. Read it at the start of each deliverable. The §2 one-time branch cleanup is **done** (2026-09-30): `develop` is the default branch and every deliverable branches from it as one flat PR; `main` is what prod runs, and hotfixes branch from `main` and merge to both.

**CC must:**
- Follow the deliverable workflow (Spec → Planning → Implementation → Result)
- Use deliverable IDs (D1, D2, ...) for all new work
- Create specs before implementing non-trivial features
- Document completions in stepwise_results/
- Ask before deviating from established process

**Do not:**
- Skip the spec phase for significant work
- Implement features without deliverable IDs
- Deviate from the process without explicit approval

If unsure about process, reference `~/src/pm-sdlc/lifecycles/native.md`.

## Completed Deliverables

| ID | Description | Concept |
|----|-------------|---------|
| D1 | Data Model — 13 tables, migrations, seeds | 01_data_model |
| D2 | CRUD APIs — 13 controllers, 65+ routes | 01_data_model |
| D3 | Deployment — Both apps on Fly.io | 03_deployment |
| D4 | Auth — Login gate, bearer tokens, EnvAuth | 04_auth |
| D5 | Scaffold UI — Full React SPA with CRUD forms | 02_scaffold_ui |
| D6 | Formula Execution Service — FormulaCatalog, FormulaRuntime, 3 brewing formulas | 05_dynamic_formulas |
| D7 | DataGrid Formula Engine — parser, evaluator, remote functions, visual indicators | 05_dynamic_formulas |
| D8 | Formula Editing UX | 05_dynamic_formulas |
| D9 | Column Visibility Toggle — 8 grids | 02_scaffold_ui |
| D10 | Users & Tiered Authorization — users/departments/memberships, Authz, module gating, user management (replaces EnvAuth) | 06_auth_roles |
| D11 | Staff Scheduling — company-wide positions, department shifts, draft→publish, open-shift claim, agenda UI | 07_scheduling |
| D12 | Schedule Weekly Grid + Color Palette — Mon–Sun grid, department colors, unpublish, publish-week, roster | 07_scheduling |
| D13 | Schedule Grid Drag-and-Drop — reschedule/reassign/unassign (auto-draft); any employee any department | 07_scheduling |
| D14 | Scheduling Templates — position standard hours, copy previous week, named week/day templates | 07_scheduling |
| D15 | Schedule Bulk Actions & Roster Controls — delete/publish week, hide-from-schedule, employee order | 07_scheduling |
| D16 | Time-Off Requests — PTO/Sick/Unpaid/Personal, partial/full day, approve-deny, grid off-markers | 07_scheduling |
| D17 | Calendar Feeds — ICS user/department/whole-schedule feeds (Google/Apple sync), rotatable tokens | 07_scheduling |
| D18 | Notifications — core + in-app bell + email, per-user prefs; publish/assign/open events | 08_notifications |
| D19 | PWA — installable app shell (vite-plugin-pwa/Workbox manifest + service worker + icons + install prompt); app-shell precache, no API caching | 02_scaffold_ui |
| D20 | Department-Grouped Navigation — collapsible left nav (Schedule, per-department headings, Admin, Messages); /schedule agenda + /scheduler grid split | 06_auth_roles |
| D21 | Web Push Notifications — web_push channel in the D18 dispatcher (VAPID/web_push_ex + Req), push_subscriptions, custom service worker push handlers, per-device enable UI | 08_notifications |
| D22 | Shift Reminders — one reminder ~1h before a published shift (shift_reminder event); lightweight GenServer scanner + shift_reminders dedup ledger | 08_notifications |
| D23 | Team Messaging — derived pre-defined channels (All-staff, Managers, per-department); full-history access from membership; message_posted email+push; /messages UI + unread badges | 08_notifications |
| D24 | Scheduling Conflict Warnings — non-blocking, client-side detection (approved time-off overlap + double-booking); marked chips + tooltip + week banner in the grid, live warning in the shift dialog (src/lib/conflicts.ts) | 07_scheduling |
| D25 | Employee Availability — recurring weekly self-declared slots (unavailable/preferred), availability_slots table + RockcutApi.Availability + /api/availability + /availability editor page; unavailable slots feed conflicts.ts as an `availability` conflict kind. **+ Time-off enhancements** (same push): cross-day timed requests; grid off-chips show times + pending (amber) distinctly; managers/owners enter time off & availability on-behalf of managed employees (Authz.can_manage_user?); approval workflow — approve own, cancel/deny an approved request (confirm step), date-sorted lists, "Approved by" | 07_scheduling |
| D26 | Company-wide Home + Brewery Dashboard — new generic `/` landing (quick-link cards) for all employees; old brewers' dashboard moved to `/brewery` (brewery-only), reached via Brewery → Dashboard; top-level Home nav link; catch-all route → `/` | 02_scaffold_ui |
| D27 | Per-position color shades + scheduler polish — `positions.color_shade` (HSL lightness of the dept hue) with a swatch picker; color controls moved **into** the Manage-positions dialog (standalone Colors dialog removed); agenda chip shows position only; week-grid name row = name + reorder arrows + ⋮ menu on one line | 07_scheduling |
| D28 | Production deploy readiness — first prod deploy of the scheduler-pwa line (fresh SQLite DB, shared `rockcut` Fly org): UI Docker build fixed (PWA deps, `vite build`, pnpm-workspace.docker.yaml), nginx `no-cache` for SW/shell, prod mail no-op stub, always-on single API machine + snapshots, reference-data + owner-only seed; runbook in `03_deployment/ref/production_deploy_runbook.md` | 03_deployment |
| D29 | RBAC capability model (design only) — inventory of all 48 authorization decisions; model = owner flag + fixed baseline + per-department roles; 8 modules (brewing department-bound); read/edit/manage × own/department/all; `Authz.scope` for lists; owner-only set; `counts_as_manager` role flag; decided change: managers limited to own departments for positions/templates/user create, roster order owner-only | 06_auth_roles |
| D30 | Shared DEV server + synthetic test accounts — `rockcut-api-dev`/`rockcut-ui-dev` (fly.dev.toml, DEV ribbon); 17 fictional `@rockcut-test.com` personas + scenario data behind a fail-closed guard (`ROCKCUT_ENV` + host allowlist); secret seed password (private PortableMind file) and 8-hour minted tokens for agents; Playwright scaffold (`rockcut-ui/tests`); credentials policy in `docs/process/test-credentials-policy.md` | 03_deployment |
| D31 | RBAC consolidation — every authorization decision through `Authz` (`can?/3` over every area, `scope/3` for lists, managers audience); frozen 394-test parity suite; boundary test fails the build on owner/role checks outside `Authz`; Brewery routes gated in the UI | 06_auth_roles |
| D32 | Schedule events — one-off and recurring (weekly/monthly-by-weekday, 12-month cap + Extend, this/following edits, Colorado wall-clock via `tz`), Events row in the Scheduler, published with the week; Bar → Taproom display rename (key stays `bar`); Colorado day bounds for week queries; SQLite single-connection default (G1) | 07_scheduling |
| D33 | Taproom device access — `users.kind` device accounts, one-time pairing codes (rate-limited) and revocable `dev_` tokens, deny-by-default `DeviceGate` + `Authz.Device`, read-only tablet UI with "Sign in as me" and a 5-minute idle return, Admin → Shared devices; PWA `orientation: any`; setup guide `docs/process/taproom_tablet_setup.md` | 06_auth_roles |
| D34 | Revocable sign-in sessions + profile page — `user_sessions` (HMAC-hashed `ses_` tokens; sign-out, password change/reset and deactivation revoke); pre-D34 tokens honored to expiry with a per-user cutoff; tablet "Sign in as me" sessions die at sign-out/idle return or after 15 idle minutes; Profile (Change password, Sign out of all other devices); show/hide on passwords; "Can't reach the server, retrying…" instead of signing out on network/proxy errors | 04_auth |
| D35 | Calendar feed links reset when someone leaves or loses access — shared feeds rotate in the same transaction (deactivation, demotion, owner flag removed); one "Re-subscribe" notification per recipient (in-app + push); Reset button asks and notifies; change-log entries for link resets and owner access; Calendar sync links on the API host (they never worked on prod before) | 07_scheduling |
| D36 | Backlog sweep + time-off conflict fix — timed time off conflicts only with overlapping shifts (all-day covers the day; Scheduler loads through the next Monday); `/live` socket dev-only; "Channel not found" / "Not available on a shared device"; tablet header at phone width; manifest content type; series-extend 404; DEV reseed cleans events/series/brands; tablet idle across tabs, abandoned "Sign in as me" form returns, offline sign-outs retried; null nav lists + top-level error boundary | 07_scheduling |
| D37 | Buy-a-Beer Board + staff codes — Taproom board of prepaid beers (add/redeem/edit/delete, atomic redeem), manager History + CSV export/import (Add/Replace, duplicate groups, stale-preview check, ignored columns); 4-digit staff codes (HMAC digest + AES-GCM under `STAFF_CODE_KEY`) identify the person for writes on the shared tablet, rate-limited per device; `nimble_csv`; fixes the D35 manager-removal "Forbidden" in Users & Roles | 09_taproom |
| D38 | Brewery Task Board — Brewery → Tasks: day columns with the published schedule header, Daily checks card, drag within/between days and to Future (shared `@dnd-kit` layer in `components/dnd/`), Unfinished card + Move all to today, "where should it show" for tasks finished on another day, History, Edit Daily items; Colorado "today"; phone width one day at a time with a bottom-sheet menu that Android back closes. On prod in `v2026.10.14` | 10_brewery_tasks |
| D39 | Recurring Brewery tasks + D38 follow-ups — weekly/monthly/quarterly/annual repeats kept 12 months ahead by the daily scheduler (`brewery_task_series`, shared `Recurrence`), this/following edits with split chains (`continues_series_id`, `internal_end`), Stop repeating, keep-or-remove for occurrences changed on their own, one-off → repeat; phone vertical all-days view with long-press drag between days and Android back closing every dialog; restore retired Daily items. On prod in `v2026.10.14` | 10_brewery_tasks |
| D41 | Department task boards — one board per department (Brewery, Taproom, Office, Sales) at `/tasks/:dept` with its own tasks, repeats, Daily items, History and schedule header; tables and modules renamed (`tasks`, `RockcutApi.Tasks`, `/api/boards/:dept`), access before the id, assignees from the board's department, leaving a department unassigns on that board; top-level Tasks nav + board switcher; Daily card hidden until a board has items; owners' read-only All departments view (`/tasks/all`). On prod in `v2026.10.14` | 10_brewery_tasks |
| D42 | Task board follow-ups + required password reset (4117) — the API refuses all but the reset flow while a reset is required (`PasswordResetGate`); First day (Today / Sunday / Monday, past days dimmed) and per-board settings; delete never-ticked retired Daily items; greyed-out cap; notes-only edits and Ends-only changes in repeating tasks; "After N times" kept across a split; foreign `before_id` 404; `no_one_scheduled`. On prod in `v2026.10.14` | 10_brewery_tasks |
| D40 | Shared tablets on the boards, shift-end reminder, dashboard card — a tablet reads/writes its home department's board with a staff code (`StaffCodeActing`, code in the body only, 5-minute "Acting as" window in the UI); staff codes for every employee; Brewery shift-end push (`task_reminders` ledger, D22 scanner); Brewery Dashboard Today's tasks card; `breweryDevice` persona. On prod in `v2026.10.14` | 10_brewery_tasks |
| D43 | UI tweaks — Hop Field light theme and Hop Field Night dark mode (`users.color_mode`: per person in the account menu, per tablet in Shared devices, Match this device), board layer colors, logos, title in the top bar, account menu, Tasks under Home, schedule button moves, Scheduler week totals and Move mode, finished Daily card, In-app/Push-only preferences, position menu, day header by start time. On prod in `v2026.10.15` | 02_scaffold_ui |
| D45 | "New version available · Reload" prompt (task 4054): service worker in prompt mode, checks on screen wake and daily, shared tablets reload themselves when idle, first rollout reloads open pages once; View Schedule opens on today + 6; Hide shifts on the task boards (events stay). Merged to `develop`, not yet on prod | 02_scaffold_ui |

## References

- Data model spec: `docs/chronicle_by_concept/01_data_model/specs/d01_data_model_spec.md`
- UI spec: `docs/chronicle_by_concept/02_scaffold_ui/specs/d05_scaffold_ui_spec.md`
- Deployment docs: `docs/chronicle_by_concept/03_deployment/ref/`
- SDLC process: `docs/process/overview.md`
- Bootstrap guide: `~/src/ops/process/bootstrap-phoenix-react.md`
