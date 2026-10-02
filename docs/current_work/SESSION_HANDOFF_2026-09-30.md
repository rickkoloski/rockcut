# Session Handoff — 2026-09-30

**Purpose:** Context preservation before closing. Pick up from here.
Follows `SESSION_HANDOFF_2026-09-28.md`. This session (2026-09-29 → 30):
- **D31 passed its DEV gate.**
- The taproom tablet idea was reviewed by Rick and **split into D32 and D33**.
- **D32 (schedule events, including recurring) was specced, built and passed its DEV gate.**
- A dependency security issue was raised with Rick.

---

## Project

**Rockcut Brewing Co** — Phoenix 1.8 / Elixir / **SQLite** (API :4002) · React 19 /
Vite / MUI 7 / pnpm (UI :5174) · PWA · Fly.io (`rockcut` org). See `CLAUDE.md`.
Memories: `rockcut-local-dev-native`, `rockcut-pwa-testing`, `rockcut-mix-format-churn`,
`rockcut-deploy-plan`, `rockcut-browser-testing`, `rockcut-d32-shared-device-decisions`,
`rockcut-deferred-event-features`.

| Environment | API | UI | Notes |
|---|---|---|---|
| **Prod** | `rockcut-api` **v19** | `rockcut-ui` **v15** | Unchanged (D28 + D30 code). Rollback: API v18, UI v14 |
| **DEV** | `rockcut-api-dev` **v9** (`6a15f39`) | `rockcut-ui-dev` **v5** (`1725b70`) | D32 code (= `d4b3ef1`); released ("DEV: free", msg 82654) |
| **Local** | :4002 | :5174 | Servers stopped. Local dev DB has the D32 migrations |

**Branches / PRs** (all stacked, none merged):

| PR | Branch | Base |
|---|---|---|
| **#1** | `d28-production-deploy-readiness` | `scheduler-pwa` |
| **#2** | `d30-dev-server-synthetic-accounts` | #1 |
| **#3** | `d31-rbac-consolidation` | #2 |
| **#4** | `d32-schedule-events` | #3 (HEAD `d4b3ef1` + this handoff) |

- #3: DEV gate PASS, verdict comment 5903799771.
- #4: DEV gate PASS, verdict comment 5911292658.
- ⚠️ **Still on hold (Rick, 81856/81857):** no merging, retargeting, moving
  `main`, creating `develop` or deleting branches. The branch cleanup is for an
  in-person discussion; Matt also wants to revisit feature-branch structure then.

**Tests:**
- `cd rockcut_api && MIX_ENV=test mix test` → **685 passing**.
- Playwright local → **53 passed, 1 skipped** (the DEV-only banner test).
- Playwright on DEV → **54 passed**.

---

## What happened this session

### D31 — DEV gate PASSED (`2e28039`)
- 29/29 Playwright on DEV. Independent pass S1–S8 all PASS.
- Two gaps, both predating D31:
  - **3939** (channel URL; fix in D33);
  - **3940** (Add-shift date; fixed in D32).
- 3941 filed: `seed_synthetic()` doesn't clean `[TEST-TEMP]` users or brands.
- Completion record: `stepwise_results/d31_rbac_consolidation_COMPLETE.md`.
- Backlog 3887 stays In Progress until released.

### Taproom tablet → D32 + D33
- **Proposal and review:** Matt's proposal (82247) → Rick's review (82384, file #4026) → Matt's answers (82598).
- **Rick's design is adopted for D33:**
  - a `users` row with `kind: "device"` and no memberships;
  - two deny-by-default gates;
  - `device_tokens`;
  - rate-limited pairing codes.
- **Split:** D32 = schedule events; D33 = device access. The PIN is deferred.
- **Rick's appendix (UDM / Party model):** deliberately paused; revisit only with multi-tenancy.
- **Backlog relabeled:** 3849–3853 are "later". New tasks: **3937** (D32), **3938** (D33), 3939–3942.

### D32 — Schedule events + Taproom rename (PR #4)
Spec `specs/d32_schedule_events_spec.md` (approved). Plan `planning/d32_schedule_events_plan.md`.

**Built:**
- **Events:** no assignee, no claiming, no notifications. Authz mirrors shifts (draft → 404 for employees).
- **Recurring series:**
  - weekly (days, every 1–2 weeks) or monthly by weekday;
  - 12-month cap and Extend;
  - "this / this and following" edits and deletes;
  - Colorado wall-clock times across DST (new `tz` dependency).
- **UI:** an Events row in the grid, the event dialog, the agenda, and Publish week including events.
- **Bar → Taproom** display rename (key stays `bar`).
- **3940:** add dialogs default to the viewed week.
- **A3:** Sunday-evening shifts no longer drop out of the week grid.

**Matt's decisions:**
- R1–R5 (recurrence);
- A1 (404);
- A3 (shift day bounds);
- A4 (a timed event ending by **3 AM** shows on its start day only; longer ones show on each day with continuation labels);
- P1–P2 (Copy/Delete week leave events alone; agenda filters hide events).

**DEV gate, 2 fix cycles:**
1. **Cycle 1:** the week buttons got aria-labels. The specs had relied on MUI icon test ids, which production builds strip.
2. **Cycle 2:** G1–G5, the Extend message, 422 for an unknown repeat type, and split counts.

**G1 root cause:** SQLite with 5 pool connections on DEV's 1 vCPU. Concurrent writers waited inside SQLite's lock handler, so requests stalled for the busy timeout, some failed "database is locked", and even `/api/health` stalled. The fix:
- **Repo defaults to one connection** (`POOL_SIZE` still overrides);
- sequential preloads;
- `BEGIN IMMEDIATE` for series writes;
- busy_timeout 10 s.

### Security (waiting on Rick — msg 82606)
- `mix hex.audit` reports **35 advisories (17 high)** across 10 packages: bandit 1.10.2, mint, phoenix 1.8.3, plug, req and others.
- **Prod is affected;** prod's branch locks the same versions.
- Matt proposed **A:** a hotfix branch off `49ca92f` (what prod runs), through DEV, released from a tag on that branch, then merged forward. **B** is to wait for the branch cleanup.
- The UI's `pnpm audit` hasn't been run yet.

---

## ⚠ When D32 goes to prod
- **Prod will run with ONE DB connection** (it was 5; prod has no `POOL_SIZE` secret). This is intended.
- **Three migrations run at boot:**
  - `schedule_events`;
  - `schedule_event_series`, plus the `series_id` / `series_exception` columns;
  - the Bar → Taproom rename, which skips a name an owner has already changed.
- **New dependency:** `tz`.
- Migrations run automatically on start: `Ecto.Migrator` is in `application.ex`.

---

## Open items

1. **Rick:** the branch cleanup (in person), and the security release path (82606).
2. **D33, taproom device access:**
   - the spec is a draft; open Q1 is the idle timeout for a personal login on a tablet (proposed 5 min);
   - it also includes the 3939 channel-URL fix;
   - branch it from `d32-schedule-events`.
3. **Remind Matt** (memory `rockcut-deferred-event-features`): events in calendar feeds; company-wide events.
4. **Backlog:**
   - 3941 (seed cleanup of users and brands);
   - 3942 (series extend 403 vs 404);
   - the waived `tsc` (3) and lint (27) failures, for which a task is still to be created;
   - build SHA on `/api/health` (workflow §8).
5. **After release:** close 3887 (D31) and 3937/3940 (D32); CLAUDE.md Completed table; D32 COMPLETE record.
6. **Carried over:** Matt to confirm "Invalid credentials" on prod; optionally rotate the seed password.

---

## Gotchas (new this session)

- **DEV logins for agents:**
  1. Run `E2E_TARGET=dev npx playwright test` first; `auth.setup.ts` mints tokens into `rockcut-ui/tests/.playwright-auth/<persona>.json`.
  2. Agent scripts pass those **paths** as `storageState` and never read the files.
  3. Throwaway scripts import Playwright by absolute path (`rockcut-ui/node_modules/@playwright/test/index.mjs`), because Node resolves imports relative to the script's own location.
- **Production-build-only failures:** MUI icons have no `data-testid` in production builds. Use aria-labels or roles in specs.
- **Parallel specs:** each test uses its own week (`weekMonday(n)`) and a unique `tempTag()`, and cleans up only its own tag.
- **DEV cleanup:** `seed_synthetic()` doesn't delete `[TEST-TEMP]` users, brands, or empty series rows (3941). Burst or manual scripts must clean up after themselves.
- **Migrations on DEV/prod:** they run at boot via `Ecto.Migrator` in `application.ex`. Searching the code for "migrate" misses it, so search for `Migrator`.
- **Carried over:**
  - parity files are frozen;
  - boundary test;
  - owner-shortcut trap;
  - `gh pr edit` fails, so use `gh api -X PATCH …/pulls/<n> -F body=@file`;
  - format touched files only.

---

## Resume instructions

1. Check discussion 80 for Rick's replies after 82654: the security path, and the branch cleanup.
2. If Rick OKs hotfix path A:
   1. create it as a new deliverable, D34;
   2. branch from `49ca92f`;
   3. `mix deps.update` the flagged packages, plus `pnpm audit`;
   4. local gate → DEV gate → prod from a tag;
   5. merge forward.
3. Otherwise start **D33**:
   1. read `docs/process/three_environment_workflow.md`;
   2. get Matt's answer to D33 Q1;
   3. mark the spec approved;
   4. write the plan;
   5. branch `d33-taproom-device-access` from `d32-schedule-events`.
