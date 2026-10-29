# D51: Security and Cleanup Sweep — Completion Record

**Status:** COMPLETE. **On prod** in two releases on 2026-10-28: part 1 as `v2026.10.28` (hotfix, PR #40), part 2 as `v2026.10.28-2` (PR #41, release PR #42).
**Spec:** `specs/d51_security_cleanup_spec.md`
**Brief / lead decisions / status:** `prompts/d51_builder_brief.md`, `prompts/d51_lead_decisions_1.md`, `_2.md`, `prompts/d51_builder_status.md`
**QA:** `stepwise_results/d51_qa_report.md` (part 1), `stepwise_results/d51p2_qa_report.md` (part 2)
**PortableMind:** done 3994, 4119, 4233 (part 1); 4058, 4231, 4669, 4060, 4933 (part 2); 4064, 4057 closed as not reproducible. New: 4963 (drop `users.legacy_tokens_revoked_at` later). Items that couldn't be filed (75-task limit): `backlog_pending_tasks.md`.

## What shipped

| Part | Item |
|---|---|
| 1 | **Dependency advisories (3994, 4119, 4233).** API: bandit 1.12.5 → 1.14.1 (11 HIGH), jose 1.11.13, plug_crypto 2.2.1, decimal 2.4.1 → 3.2.0 via Ecto 3.14 / ecto_sql 3.14 / ecto_sqlite3 0.26 (the "Ecto doesn't allow decimal 3" blocker was gone). UI: vite 7.3.7, vitest 4.1.12, follow-redirects 1.16.2, source-map-js 1.2.2, zod, fast-uri, serialize-javascript. `mix hex.audit` and `pnpm audit --prod` clean; accepted: `deepmerge` LOW (build-time, no fix). |
| 2 | **4058:** the pre-D34 `Phoenix.Token` path is gone; only `ses_` sessions and `dev_` tablet tokens authenticate. **No date hold** (Matt: a few employees, a re-sign-in is fine). `users.legacy_tokens_revoked_at` stays unused so a rollback works (4963 drops it). |
| 2 | **4231:** `create_user` always generates the temporary password; a typed one is ignored. The dialog still shows the generated one once. |
| 2 | **4669:** `/api/health` → `{status, app, env, sha}`; DEV ribbon `DEV · <short sha>`; `<html data-sha>`. Build args `GIT_SHA` / `VITE_GIT_SHA` in every deploy command (workflow doc, runbook, `tests/RUNNING.md`, CLAUDE.md). |
| 2 | **Brewing ranges (part 1 QA G1/G5):** `RockcutApi.Brewing.Ranges` on all 33 brewing `:decimal` fields (ABV 0–100, gravity SG 0.950–1.200, pH 0–14, °F temperatures, % 0–100, volumes ≤ 10,000, …); inputs carry `min`/`max`/`step="any"`; the Water tab shows a refused save. Gravity is SG only for now; Matt wants °Plato when brewing work resumes. |
| 2 | **Flakes:** pairing and staff-code limiters reset centrally in `DataCase` (4060, reproduced with a seed); G4 no longer depends on B's banner (4933: 15/20 → 20/20); task-board drags size the viewport to the board (DEV S13). |

**Migrations:** none (part 2's drop of `legacy_tokens_revoked_at` was pulled to keep rollback safe).

## Testing

- **Part 1:** local ExUnit 1786/0, Playwright 571 (reruns: G4 flake, S13 drag, two Gantt tests on a stale seed). Revert check: `brand_test` fails on decimal 2.4.1. DEV `4a5921c`: 570/571 (S13: DEV data drift, passes at a taller viewport). QA: no regressions; pre-existing G1–G6.
- **Part 2:** local ExUnit 1823/0 twice, Playwright 572/0. Revert checks for the 401 on old tokens, 4231, the ranges (1/37 → 37/37) and the brand-ranges spec. DEV `f948575`: **573/0**; QA: no regressions; pre-existing #1–#10 (to `backlog_pending_tasks.md`).
- **Prod:** both smokes green; part 2's `/api/health` reports the tag's SHA. Matt signed in after each release.

## Releases

| | Tag | API / UI | Rollback | Snapshot |
|---|---|---|---|---|
| Part 1 | `v2026.10.28` (`4dc8efe`) | v29 / v26 | v28 / v25 | `vs_xBYZv4pm5jQ9skgVJJ3JeDL` |
| Part 2 | `v2026.10.28-2` (`3d21eee`) | v30 / v27 | v29 / v26 | `vs_Mao4VyOmLXNYHKO5gbQBnGp` |

## Lessons

- The MacBook idle-sleeps mid-run: odd timeouts → check `pmset -g log`; wrap long runs in `caffeinate -ims` (plug in, lid open).
- A column drop in the same release that stops reading it breaks image rollback; drop it a release later.
- PortableMind counts completed tasks toward the 75-task plan limit (asked Rick, msg 100296).
