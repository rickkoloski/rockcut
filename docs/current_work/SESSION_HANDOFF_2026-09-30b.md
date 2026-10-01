# Session Handoff — 2026-09-30 (b)

**Purpose:** Context preservation before `/clear`. Pick up from here.
Follows `SESSION_HANDOFF_2026-09-30.md`.

This session:
- **D33** was specced, planned, built, reviewed and put through its first DEV gate run, then fix cycle 1.
- **Rick's branch cleanup (#4058)** was run.
- The **security hotfix (#4059)** got to a passing local gate. **It's waiting on one answer from Rick.**

Matt is travelling Oct 1–5 but working.

---

## Where things are

| Environment | State |
|---|---|
| **Prod** | `rockcut-api` **v19** / `rockcut-ui` **v15** = `49ca92f` (D28 + D30), tag `v2026.09.26`. **Still has the vulnerable dependencies.** 5 DB connections. |
| **DEV** | `rockcut-api-dev` **v10** / `rockcut-ui-dev` **v6** = **D33 `1aa70d5`** (before fix cycle 1). **Claimed for D33** (conv 80, msg 82938); not released. |
| **Local** | Three worktrees (below). The **hotfix servers are running** on :4002 / :5174. D33's are stopped. |

**GitHub (`rickkoloski/rockcut`), after the cleanup:**
- **Branches:**
  - `main` = `49ca92f`;
  - `develop` = `dc979a0` (D28–D32);
  - `d33-taproom-device-access` = **`f775063`** (pushed; PR **#5** → `develop`, open).
- **Tags:** `v2026.09.26` and `archive/feature/*` ×3.
- **PRs:** #1–#4 MERGED.
- **Still the default branch: `main`.** Rick does step 8 (default → `develop`, branch protection).
- **New model:** every deliverable branches from `develop` as one flat PR. Nothing stacks.

**Local worktrees:**

| Path | Branch | Notes |
|---|---|---|
| `~/src/rockcut` | `develop` | the main checkout; clean |
| `~/src/rockcut-d33` | `d33-taproom-device-access` | its own dev DB (D33 migrations + `taproomDevice`) |
| `~/src/rockcut-hotfix` | `hotfix-deps-2026-09` (from `origin/main`, **upstream unset on purpose**) | **uncommitted, prepared changes**; its own fresh dev DB |

**Hotfix working notes** live **outside the repo**, in `~/src/rockcut-hotfix-notes/`:
- `BRIEF.md`;
- `PR_BODY.md`, nearly complete;
- the before and after audit outputs.

They're outside because #4059 limits which files the branch may change.

---

## 1. Security hotfix (#4059): WAITING ON RICK

**Rick's approvals** (conv 80):
- **83055:** decimal accepted with a written reason; `req` 0.6.1; base images option (b); include the UI; three separate commits.
- **83066:** option **B**, meaning narrow `req` in `mix.exs` to `~> 0.6.1` and accept the transitive `idna` 7, `phoenix_live_view` 1.2 and `websock_adapter` 0.6. He also asked for the `/live` socket removal as its own deliverable (task 3997).

**Prepared on `hotfix-deps-2026-09`** (not yet committed). Only the allowed files changed:

| Area | Change |
|---|---|
| API | `mix.lock`, plus the one-line `mix.exs` `req` narrowing. `req` is at **0.6.3**. |
| UI | `package.json`, `package.docker.json` (floors raised to match) and `pnpm-lock.yaml`: axios 1.20.0, react-router 7.18.4, vite 7.3.6, plus dev tooling within range |
| Images | `rockcut_api/Dockerfile`: `hexpm/elixir:1.19.5-erlang-28.5.0.5-debian-bookworm-20260824-slim` and `debian:bookworm-20260824-slim` |

- **Audits after:** API shows only `decimal` 2.4.1 EEF-CVE-2026-32686 (MEDIUM, accepted; monthly check task 3994). UI shows **0** (prod and all).
- **Local gate PASSED:**
  - 197 tests;
  - tsc 3, lint 27 and the build, all identical to `main`;
  - Playwright smoke 8 passed, 1 skipped (DEV-only);
  - `MIX_ENV=prod mix release`;
  - malformed JSON → 400, a 9 MB body → 413, health stays 200.

**Waiting on Rick** (asked in 83446, summarized in **83512**):
1. **axios transitive moves:** `proxy-from-env` 2.x, `https-proxy-agent` and `agent-base`. They're Node-only; we **verified they're not in `dist/`**. **This blocks the commits.**
2. Agreement that the Docker-lockfile issue (task 3999) goes separately, after the hotfix.
3. Step 8 (his GitHub settings).

**When he OKs item 1:**
1. Tell the `hotfix` builder to commit in order: **API, UI, images**, each with `git add` on specific paths only.
2. Push with an explicit refspec (`git push origin hotfix-deps-2026-09`).
3. **Gate 0b. Matt has pre-approved these posts:**
   - post "DEV: D33 gate paused for security hotfix";
   - then "DEV: deploying `<sha>` (security hotfix)".
4. Deploy both apps to DEV with **`--no-cache`**, from a clean worktree under `~/src` (not `/tmp`).
5. Run `seed_synthetic()`, then the DEV checks:
   - Playwright;
   - **web push delivers** (Req 0.6.3);
   - the reminder scanner ticks;
   - oversized and malformed JSON;
   - login, messaging and the scheduler as `owner`, `barMgr` and `bartender1`;
   - a short QA pass.
6. Write the DEV verdict into `PR_BODY.md`, then open the **PR `hotfix-deps-2026-09` → `main`**.
7. **Prod needs Matt's go**, at a time he can watch the next 24 hours. Then:
   1. merge with `--no-ff`;
   2. tag `v2026.09.30` (or the ship date);
   3. deploy from the tag with `--no-cache`;
   4. Matt does the smoke login.
8. **Step 9:** merge `main` into `develop`. Then merge `develop` into D33 **in `~/src/rockcut-d33`**, not the main checkout.
9. **Step 10:** verify against the running systems. Run the 10C audit in a worktree **under `~/src`**, not `/tmp` (the datagrid link breaks there). Then the 24-hour watch.
10. **Step 11:** report in conv 80.
11. **"Afterwards":** add the two audits to the workflow §5 release gate.

**Unrelated finding (task 3999):** the UI Dockerfile runs `pnpm install --no-frozen-lockfile` from `package.docker.json` **before** the lockfile is copied. So prod's UI versions are resolved at build time, not pinned by the lockfile.

---

## 2. D33: PAUSED after DEV fix cycle 1

**Docs:**
- spec: `specs/d33_taproom_device_access_spec.md` (approved; Q1 = 5 minutes);
- plan: `planning/d33_taproom_device_access_plan.md`;
- prompts: `prompts/d33_builder_brief.md`, `d33_lead_decisions_1..3.md`, `d33_handoff_note.md`;
- QA report: `stepwise_results/d33_dev_pass_1_qa_report.md`.

**Local gate:** 799 API tests, Playwright 76 passed, 1 skipped. Then fix cycle 1 (below).

**Reviewer (pre-DEV):** items 1–7 were fixed (`93bcadc`…`1b83e9b`):
- pairing codes use the OS CSPRNG;
- nobody, owners included, acts on behalf of a device;
- the idle return survives sleep;
- a wrong code no longer takes the write lock;
- the limiter is hardened (`fly-client-ip` trusted only on Fly, IPv6 counted per /64, atomic counts, a global cap of 50 per 10 minutes, a sweep).

**DEV run 1 at `1aa70d5`:**
- Playwright **77/77**.
- QA: 13 of 14 scenarios pass; **S12 failed** (gaps G1–G9, all about ending sessions).
- The lead ran the rate-limit checks: 6 wrong codes → 422 ×5, then 429; spoofed `fly-client-ip` ×6 → 429 ×6, so **Fly overwrites the header**.

**Fix cycle 1 (1 of 2) is done and pushed** (`8ace5b6`…`f775063`):
- G1: deactivation revokes the tablets' tokens.
- G2: a personal session ends when its tablet is revoked or deactivated.
- G3: other tabs follow a sign-out, and Availability shows load errors.
- G4: a tablet unpairs only on a confirmed, successful sign-out.
- G5: Deactivate asks first.
- G6: no Calendar sync on a tablet.
- G7: an unpaired tablet lands on setup and explains why.
- **G8: no staff email in anything a device can read.**
- G9: no "Pair a tablet" on a deactivated device.

**To resume (after the hotfix releases DEV):**
1. If the hotfix was merged forward into D33 by then (step 9), the D33 branch head moves. Redeploy **that** head.
2. Deploy D33's head to DEV and run `seed_synthetic()`.
3. Playwright on DEV.
4. A **fresh qa agent re-check** of G1–G9, plus S1–S14. Frame it as **QA acceptance**: a "break it" framing tripped model safeguards today. The lead runs any abuse checks itself.
5. **Matt's real-iPad check for S13:** lock the iPad for more than 5 minutes, wake it, and it should be back on the shared screen.
6. Post the verdict in PR #5, merge `--no-ff` into `develop`, and release DEV.

**The QA agent printed the DEV owner persona's calendar-feed URLs to its log.** Rotate the DEV owner's feeds before releasing DEV.

---

## Decisions and policy from today

- **Deliverable numbering is ON HOLD (Matt).**
  - Don't assign D34 or later.
  - The hotfix is a named branch, not a D number.
  - Taproom components are "later deliverables".
  - Task 3997 (`/live` removal) gets its number from Matt.
- **D33 product decisions (Matt):**
  - a device-only "not available" page;
  - a "Sign in as me" button;
  - a device's home department can be any department;
  - server-side token revocation deferred (task 3991).
- **Order (Rick):** cleanup ✅ → hotfix (alone, through to step 10 verification) → D31–D33 release.
  - The D31–D33 release carries **the single DB connection**, **five migrations** (D32 ×3, D33 ×2) and `tz`.
- **Herdr tooling is local-only** (Matt): `~/.config/herdr/`, including `rockcut-workflow.md`. Never commit it.

## New backlog tasks (PortableMind project 254)

| Task | What |
|---|---|
| 3991 | sign-out doesn't revoke personal tokens server-side |
| 3992 | calendar feeds survive user deactivation (workaround: rotate feeds by hand) |
| 3994 | **monthly** decimal DoS check, due 2026-10-30 |
| 3997 | remove `/live` from the prod endpoint (Rick wants it as its own deliverable) |
| 3999 | the UI Docker build ignores the lockfile |

## After the D31–D33 release

- COMPLETE records for D31, D32 and D33, plus the CLAUDE.md Completed table.
- Close tasks 3887, 3937, 3940, 3938 and 3939.
- **CLAUDE.md and `three_environment_workflow.md` still say the §2 cleanup is "on hold". It's done; update both.**
- Next-candidates list (Matt to prioritize):
  - 3997;
  - the build SHA on `/api/health` (§8, which Rick raised again);
  - 3999, 3991, 3992;
  - the REMIND items: events in calendar feeds, company-wide events;
  - taproom components.

## Gotchas (new today)

- **`mix deps.update <pkg>`** goes to the newest version the range allows, and moves children too. A loose `~> 0.x` can jump minors, so check against what was approved.
- **GitHub retarget:** a PR whose commits are already in the new base can't be retargeted (422). Mark it merged by fast-forwarding its own base to its head. A retargeted PR's diff can go stale after the base moves; re-PATCH `base` to refresh it.
- **Worktrees:**
  - put them directly under `~/src` (the `datagrid-extended` link);
  - unset the upstream when cutting from `origin/main`;
  - give each its own DB;
  - run one local stack at a time (hardcoded ports);
  - the UI dev server needs `--port 5174`.
- **The PortableMind MCP server** is configured only for `~/src`. An agent started in `~/src/rockcut` can't see it.
- **Prod images carry no SHA.** Prove what's deployed from timestamps until §8 is done.
