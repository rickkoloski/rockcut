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
- Prod secrets: ADMIN_EMAIL, ADMIN_PASSWORD_HASH (Fly secrets). Humans only.

## Conventions

- **Deliverable IDs**: D1, D2, ... Dnn (sequential, never reused)
- **Next deliverable**: D37 Buy-a-Beer Board + staff codes (task 4083), spec approved 2026-10-05, branch `d37-buy-a-beer-board`; steps 1–7 built and the local gate passed (2026-10-06), not yet pushed. Next: PR + DEV gate (see the latest `SESSION_HANDOFF_*`). Then D38. D36 shipped to prod in `v2026.10.05` (2026-10-05 UTC); D19–D36 complete. Matt's queue: task 4054 ("new version available, tap to reload" prompt), then 4055 (events in calendar feeds) and 4056 (company-wide events), then the small tasks (4060–4064 from D36). Task 3994 (`decimal` advisory) is due 2026-10-30, and 4058 (remove the pre-D34 token path) 2026-11-04.
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

## References

- Data model spec: `docs/chronicle_by_concept/01_data_model/specs/d01_data_model_spec.md`
- UI spec: `docs/chronicle_by_concept/02_scaffold_ui/specs/d05_scaffold_ui_spec.md`
- Deployment docs: `docs/chronicle_by_concept/03_deployment/ref/`
- SDLC process: `docs/process/overview.md`
- Bootstrap guide: `~/src/ops/process/bootstrap-phoenix-react.md`
