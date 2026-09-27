# Session Handoff — 2026-09-26

**Purpose:** Context preservation before closing. Pick up from here.
Follows `SESSION_HANDOFF_2026-09-24.md`. This session: **closed out D28**,
**reworked and completed D29** (RBAC capability model), **built, deployed, and
verified D30** (shared DEV server + synthetic test accounts), and **deployed
D30 to prod**. Coordinated with Rick in PortableMind **discussion 80**.

---

## Project

**Rockcut Brewing Co** — Phoenix 1.8 / Elixir / **SQLite** (API :4002) · React 19 /
Vite / MUI 7 / pnpm (UI :5174) · PWA · Fly.io (`rockcut` org). See `CLAUDE.md`.
Memories: `rockcut-local-dev-native`, `rockcut-pwa-testing`,
`rockcut-mix-format-churn`, `rockcut-deploy-plan`.

| Environment | API | UI | Notes |
|---|---|---|---|
| **Prod** | `rockcut-api` **v19** | `rockcut-ui` **v15** | D28 + D30 code. Rollback: API v18, UI v14 |
| **DEV** (new) | `rockcut-api-dev` | `rockcut-ui-dev` | fictional personas only; orange DEV ribbon |
| **Local** | :4002 | :5174 | synthetic personas; servers stopped at end of session |

**Branch:** `d30-dev-server-synthetic-accounts` (off `d28-production-deploy-readiness`).
Working tree **clean**, **pushed**.

**PRs (both open, awaiting review/merge):**
- **#1** `d28-production-deploy-readiness` → `scheduler-pwa` — D28 + D29 docs.
- **#2** `d30-dev-server-synthetic-accounts` → `d28-production-deploy-readiness`
  (stacked). Retarget to `scheduler-pwa` after #1 merges.
- ⚠️ **Prod runs code not yet on `scheduler-pwa`.** Merge #1 then #2.

**Tests:** `cd rockcut_api && MIX_ENV=test mix test` → **197 passing**.
E2E: `cd rockcut-ui && npx playwright test` (local 8/8) · `E2E_TARGET=dev` (9/9).

**Next deliverable: D31 — RBAC consolidation** (PortableMind task **3887**).

---

## What happened this session

### D28 closed out
- Live site verified; branch pushed; **PR #1** opened.
- Spec → Complete; `stepwise_results/d28_production_deploy_readiness_COMPLETE.md`.
- **Prod snapshot retention was 5 days, not 14** — `fly.toml snapshot_retention`
  only applies at volume creation. Fixed with `fly volumes update --snapshot-retention 14`.

### D29 — RBAC capability model (design only) — Complete, signed off by Matt
- Review found the old D29–D34 plan's premise wrong: **`Authz.can?/3` is only
  called by shift/position controllers**; ~46 other decisions read `is_owner` /
  `memberships.role` directly. Rewrote D29 as Phase 0 only; phases moved to
  `planning/rbac_configurable_authorization_roadmap.md` with a new
  **consolidation phase (D31)** before roles-as-data. No more reserved IDs.
- Spec `specs/d29_rbac_capability_model_spec.md`: Appendix A = **48 decisions**
  (file:line); model = owner flag + fixed baseline + **per-department roles**;
  8 modules (brewing **department-bound**); **read/edit/manage** × own/department/all;
  `Authz.scope/3` for lists; owner-only set; **`counts_as_manager`** role flag.
- **Matt's decisions:** keep manager self-approval of time off, brewery
  employees' full brewing access, global published-shift visibility,
  requester-only cancel (managers deny), owner-only "Other" dept.
  **One deliberate change (§6 C):** managers create users and edit
  positions/templates **only in their own departments**; roster order
  **owner-only**. Lands in the resolver phase, not D31.

### D30 — DEV server + synthetic accounts — Complete, on prod
- Built Rick's plan (#3944) with Matt's change: **secret seed password +
  8-hour minted tokens** (no password in git).
- 17 personas (Rick's 12 + `dualMgr`, `splitRole`, `noDept`, `owner2`, `sales1`),
  current-week `[SEED]` data, `[TEST-TEMP]` cleanup; fail-closed guard
  (`ROCKCUT_ENV` + host allowlist); Playwright scaffold; credentials policy at
  `docs/process/test-credentials-policy.md`; runbook DEV section.
- **Bugs found and fixed:** (1) `seeds.exs` would create
  `matt@rockcut.com`/`rockcut2026` as owner anywhere `ADMIN_*` was unset —
  prod included; removed. (2) Failed logins reloaded the page so errors never
  showed; fixed in `src/lib/api.ts`. (3) Token minting from `fly ssh … eval`
  crashed (`:plug_crypto` not started); fixed.
- **Prod verified after deploy:** `deploy_env="prod"`; `seed_synthetic` /
  `mint_token` refuse; synthetic login → 401; DEV token → 401; 0 synthetic users.
- Seed password: private PortableMind file **#3958**
  (`/rockcut/secrets/Rock Cut DEV seed password.txt`), shared with Rick.

### Housekeeping at end of session
- Stopped local API/UI servers; deleted `matt@rockcut.com` from the local dev DB
  (local owners are now `owner@` / `owner2@rockcut-test.com`).
- Product Backlog (254): **3848** completed; created **3887** (D31, next) and
  **3888** (D30, completed).

### Rick (discussion 80)
- 80591 — D28/D29 status + RBAC rework. 80592 — D30 spec + answers to his
  three questions. **80658 — DEV live + the secret-password question.**
  No reply yet as of end of session.

---

## Open items

1. **Merge PR #1, then #2** (retarget #2 to `scheduler-pwa`). Until then prod ≠ main line.
2. **Rick's answer** on secret password + tokens vs. PortableMind's published
   password pattern (msg 80658).
3. **Matt to confirm on prod:** a wrong password now shows "Invalid credentials"
   (agents don't test on prod, per policy).
4. **Stale backlog tasks 3849–3853** still describe the *old* phase plan and
   deliverable numbers. The roadmap is authoritative; update or close them when
   each phase is specified.
5. Optional: rotate the seed password — a time-limited signed download URL for
   #3958 appeared in this session's log (~1 h expiry, contents never opened).

---

## Gotchas

- **Deploy from the right branch** — `fly deploy` builds the checked-out tree.
  Prod and DEV currently deploy from `d30-dev-server-synthetic-accounts`.
- **API machines can come up `stopped`** (`auto_start_machines=false`, prod and
  DEV): `fly machine start <id>`. Boot runs migrations; running
  `Release.migrate()` explicitly is harmless.
- **`fly ssh … eval` starts only the repo** — anything needing other apps
  (e.g. `:plug_crypto`) must start them itself.
- **Local seed password** lives in gitignored `rockcut_api/.env.synthetic` and
  `rockcut-ui/.env.test.local` (now the shared value). Tests never read it
  (`config/test.exs` sets `:seed_env_file` nil).
- **Agents: synthetic personas + minted tokens only, never prod hosts.** See the
  credentials policy and `rockcut-ui/tests/RUNNING.md`.
- **`gh pr edit` fails** on this repo (Projects classic deprecation) — update PR
  bodies with `gh api -X PATCH repos/rickkoloski/rockcut/pulls/<n> -F body=@file`.
- **PortableMind `LlmFile` details return a signed download URL** — to check a
  secret file's settings, use `list` instead.
- Servers get reaped under memory pressure; don't run repo-wide `mix format`.

---

## Resume instructions

1. Check Rick's replies in discussion 80 (after msg 80658) and PR #1/#2 status.
2. Sanity: `curl https://rockcut-api.fly.dev/api/health` and
   `curl https://rockcut-api-dev.fly.dev/api/health`.
3. Start local servers (`CLAUDE.md`); `mix rockcut.synthetic.status` should show
   16 personas authenticating.
4. **Start D31:** write `specs/d31_…_spec.md` from roadmap Phase 1 + D29
   Appendix A (task 3887). Parity tests first, using the synthetic personas;
   no behavior change.
