> **Source:** Rick, PortableMind file #4003, discussion 80 msg 81855 (2026-09-28).
> **Status note:** the §2 one-time branch cleanup is **done** (task 4058, 2026-09-30;
> step 8 confirmed by Rick, msg 83548). `develop` is the default branch; `main` and
> `develop` are protected against force-pushes and deletion (PRs not yet required).

# Rockcut three-environment workflow: Local → DEV → Prod

**Process blueprint for Claude Code (and humans).** Follow it for every deliverable.

2026-09-28 · Rick, for Matt · builds on D28 (prod runbook), D30 (DEV + synthetic personas), `docs/process/test-credentials-policy.md` and `rockcut-ui/tests/RUNNING.md`. It mirrors the process PortableMind runs (feature branch → local gate → shared box → `develop` → `main`), so Rick and Matt work from the same playbook in both codebases.

> **For the agent:** read this file, the credentials policy and `tests/RUNNING.md` at the start of any deliverable. Each numbered step below ends in a **gate**. Don't move to the next step until the gate passes, or until a human explicitly waives it and you've recorded the waiver in the PR.

---

## 1 · The three environments: what each one is for

| | **Local** | **DEV** (shared) | **Prod** |
|---|---|---|---|
| Hosts | `localhost:4002` / `:5174` | `rockcut-api-dev.fly.dev` / `rockcut-ui-dev.fly.dev` | `rockcut-api.fly.dev` / `rockcut-ui.fly.dev` |
| Code | your feature branch, uncommitted OK | **one pinned SHA** at a time | a **tagged** SHA from `main` |
| Data | synthetic personas + `[SEED]` rows | synthetic personas + `[SEED]` rows, disposable | **real** people and data |
| Who tests there | the author (you) | the author **and** an independent pass | **nobody**: humans do the smoke check only |
| Agents may | anything | act as synthetic personas only; create only `[TEST-TEMP]` data | run the read-only smoke `curl`s and, when a human says go, the deploy commands. **Never** log into the prod UI; **never** seed, reset or mint |
| Question it answers | "Does my change work?" | "Does it work **deployed**: real release build, real Fly machine, real SQLite volume, the whole persona matrix, and someone other than the author driving it?" | "Did the release land?" |

**What local structurally can't tell you.** This is the reason DEV exists. A problem found only on DEV is a *normal* result, not a failure:
- **The release build:** `MIX_ENV=prod` compile, runtime.exs, Docker image, the nginx and PWA/service-worker caching.
- **Fly itself:** the machine coming up `stopped`, migrations at boot, the volume, secrets, CORS between the two `*.fly.dev` hosts, HTTPS-only behavior (push, service worker).
- **Timing:** a slower, remote UI, and Playwright against real network latency.
- **The full persona matrix:** local runs usually cover the persona you were thinking about. DEV runs all of them.
- **Stale assumptions in seed data:** dates, missing brewing data. See §7.

## 2 · Branches and promotion

**The problem today:**
- Prod runs `d30-dev-server-synthetic-accounts`, which isn't merged anywhere.
- `origin/main` is still June's code (2ff0473).
- PRs #1 and #2 are stacked.

Prod should always be something you can find on `main`.

**Target model** (same as PortableMind's `develop` / `main`):

```
feature branch dNN-slug ──PR──▶ develop ──release PR──▶ main ──tag vYYYY.MM.DD[-n]──▶ prod
        │                          │
        └── local gate             └── DEV runs develop (or a feature SHA pre-merge, §4)
```

- **`main`** = what's on prod. Every prod deploy is from a tag on `main`.
- **`develop`** = integration. Feature PRs merge here (`--no-ff`) **only after the DEV gate is green** (§4).
- **Feature branches** `dNN-short-slug` are cut from `develop`, one per deliverable.
- **Hotfix** `hotfix-slug` is cut from `main` and merged to `main` *and* `develop`.

**One-time cleanup** (done 2026-09-30, task 4058; kept for the record):
1. Merge PR #1 into `scheduler-pwa`. Retarget PR #2 to `scheduler-pwa` and merge it.
2. Fast-forward `main` to `scheduler-pwa`. It's linear from 2ff0473, so there's no merge commit. Tag it `v2026.09.26` (what prod runs today: API v19, UI v15).
3. Create `develop` from `main`. Set the GitHub default branch to `develop`.
4. Retire `scheduler-pwa`, `practice1` and Rick's three old `feature/*` branches (Brewhouse/Postgres era, superseded). Rick decides whether to delete them or tag-and-delete.

## 3 · Step 1: Spec, then build locally

1. **Spec first**, per CLAUDE.md SDLC: `docs/current_work/specs/dNN_…_spec.md`. Include a **persona-goal scenario list**: *"As `barMgr`, entering from the Scheduler nav, approving `bartender1`'s pending time off, the grid shows the off-marker after a reload."* Name the **persona, entry point, mode and state**, because gaps hide in those four. Matt reviews and adds business reality; agents miss that.
2. **Build on the feature branch** against local servers seeded with the synthetic personas: `mix rockcut.synthetic.setup`.
3. **Drive the new flow in a browser as the personas first** (Claude in Chrome, or Playwright MCP), then write the Playwright spec from what you saw. Log in by **token injection**, never by typing:
   ```
   mix rockcut.synthetic.token barMgr        # → token
   # in the page: localStorage.setItem('rockcut_token','<token>'); location.reload()
   ```
   With Playwright MCP, do the `setItem` through its evaluate/run-JS tool, so no human has to type a login.

### Local gate: all must pass before DEV
- [ ] `cd rockcut_api && MIX_ENV=test mix test`: all green. **Format only the files you changed.** Never repo-wide `mix format`, never `mix precommit`.
- [ ] `cd rockcut-ui && npx tsc --noEmit -p tsconfig.app.json && pnpm exec vite build && pnpm lint`
- [ ] `cd rockcut-ui && npx playwright test`: local suite green, **including the new spec(s)** from §6.
- [ ] **Bug fixes:** the new test **fails with the fix reverted and passes with it restored**. Actually revert and re-run; judging it by eye doesn't count. Record both runs in the PR.
- [ ] **Writes are persist-verified:** do the action, reload or navigate away, come back, and confirm it's still there. An optimistic UI update or a 200 isn't proof.
- [ ] Committed and pushed; the PR is open against `develop` with the handoff note (below).

### The handoff note (PR description)
- **Branch + SHA** to put on DEV. A branch name moves; a SHA doesn't.
- **What changed**, and **which personas/scenarios** DEV must exercise.
- **Migrations?** Yes/no; if yes, whether they're reversible.
- **⚠ LIMITATIONS: what local could NOT tell us** about *this* change. This is the most important section: it's the spec for the DEV run. For example: "service-worker update path untested locally (dev server has no SW)" or "manager-scope 403s only exercised as barMgr, not breweryMgr".

## 4 · Step 2: DEV gate

DEV is **shared**, so only one change is on it at a time.
1. **Claim DEV:** post "DEV: deploying `<sha>` (Dnn)" in conv 80. Release it when you're done ("DEV: free, `develop` restored").
2. **Deploy the SHA:** a clean checkout of that SHA, then `fly deploy -c fly.dev.toml --remote-only` in `rockcut_api`, then `rockcut-ui`. Start the machine if it came up `stopped`.
3. **Pre-flight** (the `RUNNING.md` table), *plus* **run `synthetic_status`, then `seed_synthetic()`**. Setup heals personas, rebuilds `[SEED]` scenario data *relative to this week* and deletes `[TEST-TEMP]` rows. **Always run it before a DEV session**; that's what keeps the data from being a week old.
4. **Confirm what's actually on DEV:** `fly releases -a rockcut-api-dev` and `fly releases -a rockcut-ui-dev` show the image you just built. Don't trust memory or a doc (see §8, build SHA).
5. **Automated:** `E2E_TARGET=dev npx playwright test`, the full regression suite, not just smoke.
6. **Independent pass:** the author doesn't grade their own work. Start a **fresh** agent (a new Claude Code session, or a sub-agent) and give it **only**:
   - the persona keys;
   - the spec's scenario list;
   - the DEV URL + token recipe;
   - the handoff's LIMITATIONS;
   - **not** your implementation notes.

   Its charter is *"find a path that breaks this as a real user"*. It reports each gap as **path → expected → observed → repro**, and it doesn't fix anything.
7. **Verdict in the PR:** SHA tested, pass/fail counts, independent-pass gaps (or "none found"), and any box-only findings.

**A box-only finding** (fails on DEV, passed locally) is normal:
- Fix it on the same branch, add a test that would have caught it (the revert-and-rerun rule), redeploy and re-run.
- **Budget: two fix cycles.** If the third run is still red, stop and post the evidence (spec, line, error, trace/screenshot) to Rick/Matt in conv 80 rather than guessing.

### DEV gate
- [ ] Full Playwright suite green on DEV at the PR's SHA
- [ ] Independent pass done; every gap either fixed (with a test) or filed as a backlog task and **accepted by Matt**
- [ ] Verdict posted in the PR → **merge to `develop` with `--no-ff`**, then redeploy `develop` HEAD to DEV and release the claim

## 5 · Step 3: Release to prod

A human (Matt) decides *when*. The agent can prepare and run the commands on his go.
1. **Release PR** `develop → main`: its body lists every deliverable in the release, **every migration**, and any new secret or config.
2. **Merge, then tag** `vYYYY.MM.DD` (add `-2` for a second release that day). Push the tag.
3. **Deploy from a clean checkout of the tag**, never from a working tree. Follow the prod runbook order: staged secrets → volume/scale unchanged → `fly deploy` API → start the machine if stopped → `Release.migrate()` if there are migrations → `fly deploy` UI.
4. **Record** the new `fly releases` versions (API vN, UI vN) and the **previous** ones (the rollback target) in the release PR.
5. **Prod smoke** (the runbook's step 7):
   - health 200, UI 200, `sw.js` is `no-cache`;
   - **dependency check (task 3999):** `pnpm audit --prod` (in `rockcut-ui`) and `mix hex.audit` (in `rockcut_api`) at the tag show nothing new beyond accepted advisories, and `node rockcut-ui/scripts/check-bundle-versions.mjs https://rockcut-ui.fly.dev` passes (the shipped bundle's axios and react-router match `pnpm-lock.yaml`). Run the same script against `https://rockcut-ui-dev.fly.dev` after each DEV deploy;
   - **synthetic login → 401** and **0 synthetic users**;
   - **Matt** logs in as himself. The agent never does.
6. **Rollback** if the smoke fails: `fly deploy --image <previous ref>` for the affected app. Migrations are forward-only; a migration that has to be undone needs a new forward migration plus a volume-snapshot restore as the last resort. Say which you did in conv 80.

### Prod gate
- [ ] Deployed SHA == tag on `main` · smoke green · release versions recorded · CLAUDE.md "Completed Deliverables" + `stepwise_results/…_COMPLETE.md` updated · session handoff written

## 6 · Playwright: from smoke to a regression suite

D30's scaffold is the base: `tests/config/{test-env.ts,e2e-targets.json,targets.ts}`, `auth.setup.ts` (per-persona storageState via minted tokens), and `tests/smoke/`. Grow it like this:
- **Layout:**
  - `tests/smoke/`: fast, every run.
  - `tests/regression/<module>/`, with modules `scheduler`, `timeoff`, `availability`, `messaging`, `notifications`, `admin`, `brewery`.
  - One spec file per persona-goal scenario group.
- **Every spec declares its persona** with `test.use({ storageState: authFile('<key>') })`. It never logs in through the UI; only `smoke/login.spec.ts` uses the form.
- **Negative personas matter as much as positive ones.** For each gated page or action: the allowed persona succeeds, and a disallowed persona gets the right refusal (redirect, hidden control, or API 403 *with a visible error*). Matt's 81853 found exactly this gap: `/brands` etc. show a blank table to non-brewery users. That becomes a regression spec in D31.
- **Selectors:** `data-testid` first, then role + accessible name. Never CSS classes or text that copy edits will change. Add the `data-testid` to the component in the same PR.
- **No `waitForTimeout`.** Wait for the real signal: a network response, a visible element, a URL. An arbitrary sleep is a bug report.
- **Test data:** anything a spec creates is named `[TEST-TEMP] …`, and the spec cleans up after itself. `setup` removes whatever leaks.
- **Persist-verify** every write: act, then `page.reload()`, then assert.
- **Every bug fix adds or extends a spec** at the level the bug lived: ExUnit for API logic, Playwright for UI flow.
- **`tests/COVERAGE.md`:** scenario → layer (ExUnit / Playwright / manual-only / **GAP**). Gaps you can see get fixed; gaps you can't see don't.
- **Later:** a GitHub Action on PRs to `develop` runs `mix test` + the build + the local Playwright suite. DEV runs stay human/agent-triggered until then.

## 7 · DEV data: keep it useful

From Matt's walkthrough (81853), as backlog tasks:
1. **Refresh before every session:** `seed_synthetic()` in the DEV pre-flight (§4.3) rebuilds the week-relative `[SEED]` rows. Optional: a DEV-only weekly re-seed on Monday mornings, guarded by `ROCKCUT_ENV=dev`.
2. **Brewing sample data:** `[SEED]` brands, recipes (with ingredients, which also fixes DR-3) and a batch or two, so Brewery pages can be exercised on DEV.
3. **Change-log entries:** have `setup` perform a few audited actions as `owner2` so the owner's User change log isn't empty.

## 8 · Small infrastructure worth adding

- **Build SHA on `/api/health`, and in the DEV ribbon.** Pass `GIT_SHA` as a Docker build arg and return `{status, app, env, sha}`. Then "what's on DEV/prod?" is answered by asking the system, not by remembering it.
- **No debug routes without auth.** This is a standing rule across Rick's projects, after an open debug endpoint was found on another product's prod. Never expose Swoosh's mailbox preview or any inspection route on DEV or prod without authentication; keep it off by default.
- **CI token minting:** if a CI runner later needs persona tokens, give it a **DEV-app-scoped** Fly token (`fly tokens create deploy -a rockcut-api-dev`) and keep using `fly ssh … mint_token`. Don't add an HTTP mint endpoint.

## 9 · On keeping the seed password secret and minting tokens (Matt, 80658)

Keep it; it's the stronger design. Minted 8-hour tokens mean no spec and no agent handles a password, and the password never touches git. The only cost is that minting needs `fly` access, and the DEV-scoped token in §8 covers CI. PortableMind's published password is a historical convenience; this is the model it should move toward.

## 10 · Quick reference: one deliverable, end to end

```
spec (persona scenarios) → branch dNN-slug from develop → build + browser-drive as personas (tokens)
→ LOCAL GATE (mix test · tsc/vite/lint · playwright local · revert-and-rerun · persist-verify)
→ PR to develop with SHA + LIMITATIONS
→ claim DEV → deploy SHA → seed_synthetic() → playwright E2E_TARGET=dev → independent pass → verdict
→ DEV GATE → merge --no-ff to develop → release DEV
→ (Matt says go) release PR develop→main → tag → deploy tag → prod smoke (Matt logs in) → record versions
→ close out: COMPLETE.md, CLAUDE.md table, handoff
```
