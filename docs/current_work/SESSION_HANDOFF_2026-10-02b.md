# Session Handoff — 2026-10-02 (b, late evening)

Follows `SESSION_HANDOFF_2026-10-02.md`.

This session: closed out the release watch, then built **D34 (revocable sign-in
sessions + profile page, task 3991)** through the local gate and the DEV
automated gate. The **independent DEV pass FAILED with one must-fix gap (G1)**.
Matt went to bed before choosing how to proceed. **Nothing is running.**

## Start here next session

1. **Ask Matt to choose** how to handle the QA gaps (below). Recommended: (a).
2. Fix → redeploy DEV → rerun the full suite and the S6/G2 paths → post the
   verdict on PR #9 → merge `--no-ff` to `develop` → redeploy `develop` to DEV →
   post "DEV: free" in conv 80.
3. Then the next deliverables, in the order Matt set (§ "Queue" below).

---

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.02`, API v21 / UI v17. Staff confirmed the schedule works (Matt, this session), so release item 1 is closed. Prod logs at 03:17–03:28 UTC Oct 3 were clean (`fly logs` keeps only ~10 min). |
| **DEV** | **Claimed for D34** in conv 80 (msg 84632, "DEV: deploying `a3e94e0`"); never released. Runs API **v17** (`6c5fb25`) / UI **v10** (`a3e94e0`; UI code unchanged since). `seed_synthetic()` was last run ~05:20 UTC. |
| **Branch** | `d34-session-revocation`, pushed; HEAD `cb335d1` + this handoff. **PR #9** to `develop`, body = `docs/current_work/prompts/d34_handoff_note.md` (written at `a3e94e0`; needs the DEV results added). |
| **Local** | Main checkout on `d34-session-revocation`. Servers stopped. Deploy worktree removed. Dev DB migrated to D34. |
| **QA folder** | `~/src/rockcut-d34-qa/`: the brief, scripts, `shots/`, the report, and **live 8-hour persona tokens** (`auth/`, expire ~13:20 UTC Oct 3). It's outside the repo; delete it when the gate is done. Report copied to `docs/current_work/stepwise_results/d34_dev_pass_1_qa_report.md`. |

## D34 so far

- **Spec** (approved, Q1–Q5 answered by Matt): `docs/current_work/specs/d34_session_revocation_spec.md`.
  - Q1: pre-D34 tokens are honored until they expire, with a per-user cutoff.
  - Q2: tablet sign-ins last 15 idle minutes, 12 hours at most.
  - Q3: one "Sign out of all other devices" button.
  - Q4: a profile page with Change password and that button.
  - Q5: a show/hide toggle on every typed password.
- **Plan:** `docs/current_work/planning/d34_session_revocation_plan.md`.
- **Local gate: passed.**
  - `mix test`: 847 tests, 0 failures.
  - UI checks: `tsc` clean; `vite build` OK; lint 27 (the baseline, none in D34 files).
  - Playwright local: 109 passed, 1 skipped (the DEV-only banner).
  - Revert-and-rerun recorded twice: the ExUnit sign-out test, and the UI Logout bug (Logout sent no token).
- **DEV automated gate: passed** (run 13: 110/110), after three fix cycles:
  1. `0086bfe`, product code: a normal session never writes `last_seen_at`
     (only tablet sessions, for the idle limit), and `create_user` hashes
     before its transaction. The full suite had caused 164 `dropped from
     queue` errors on the single SQLite connection.
  2. `6c5fb25`, tests: `mint_tokens` now returns 40 spare `bartender2`
     sessions; specs that only sign a session out claim one
     (`tests/regression/auth/spares.ts`, exclusive claim files). Throwaway
     `[TEST-TEMP]` people are used only where a password is needed. D34 spec
     files run in order. Argon2 had starved DEV's one vCPU: password change
     averaged 6.3 s.
  3. `cb335d1`, tests, authorized by Matt: `apiAs()` keeps one cached client
     per persona per worker, every API call has a 20 s timeout, and the auth
     helpers dispose what they open. Fresh connections had intermittently
     hung before reaching the app.
  - Run 12 had 1 failure, `smoke/login` "inactive persona refused": a 5 s
    expect on an Argon2 sign-in under load. It's a pre-D34 spec, so consider
    a longer timeout there.
- **DEV data cleaned by hand.**
  - A stray weekly series "TEST-TEMP Trivia" (series 229, 53 dates, no
    brackets) and six `[TEST-TEMP]` events, both colliding with D32 event
    specs.
  - **Backlog candidate:** `seed_synthetic()`'s `delete_tagged` doesn't clean
    schedule events or series.
- **Verified on DEV myself:**
  - migrations ran at boot;
  - the CORS preflight allows `X-Rockcut-Device`;
  - a **pre-D34 token minted before the deploy still worked after it** (S12);
  - bundle check OK.

## Independent pass (DEV pass 1): FAIL. Matt to choose

The report is `stepwise_results/d34_dev_pass_1_qa_report.md`: 19 PASS, 1 FAIL
(S6), 2 NOT RUN (S12/S13: no pre-D34 token; S12 was verified by the lead,
S13 is covered by ExUnit).

- **G1, must-fix: a network drop at the idle return unpairs the tablet.**
  - **Root cause (lead's diagnosis, not yet fixed):** `useAuth.loadMe()`'s
    catch clears `rockcut_token` on *any* non-401 error.
    1. The idle return restores the device token and reloads.
    2. `/api/me` fails offline.
    3. `loadMe` deletes the device token, and the tablet lands on the normal
       login screen.
  - It's pre-existing (D33, and any user opening the app offline), and
    exposed by D34's S6. The local spec only aborted the DELETE.
  - **Proposed fix:** on a network error or 5xx, keep the token and show
    "Can't reach the server, retrying…". Retry on `online` and on an interval;
    only a 401 signs out.
  - **Test:** a Playwright spec with `context.setOffline(true)` across the
    idle return and a reload. Revert-and-rerun.
- **G2, minor: a "Sign in as me" session can call `DELETE /api/sessions/others`
  and `POST /api/session/password` by hand** (the UI hides both). Proposed:
  the server returns 403 for tablet-marked sessions (`device_token_id` set).
- **G3, minor: Change password accepts the current password as the new one.**
  Proposed: refuse it with "The new password must be different".
- **G4, minor: the owner's profile says "ask a manager or the owner".**
  Proposed: owners get "Change these in Users & Roles".

**Options put to Matt:**
- **(a) Recommended:** fix G1–G4 in one cycle (it would be the 4th) and
  rerun.
- **(b)** Fix G1 only, and file G2–G4 as backlog.
- **(c)** File everything and merge. Advised against.

## Still open from the release

- **Pair the prod tablets** (Oct 3 or later): Admin → Shared devices →
  "Taproom tablets" (home: Taproom), then `docs/process/taproom_tablet_setup.md`.
  - D34 isn't on prod, so the D33 behavior applies: a personal sign-in on a
    tablet is only dropped by the client.
  - G1's offline wipe also exists on prod today. A Wi-Fi drop during a
    personal session can unpair a tablet. Worth telling Matt before he pairs.

## Queue (Matt: "take them on in the order you listed")

1. **3991 → D34** (in progress).
2. A "new version available, tap to reload" prompt (no task yet).
3. The deferred D32 event features: events in calendar feeds (spec Q3);
   company-wide events (spec Q7).
4. Small: 4001, 4002, 4003, 3992, 3997, 3942.
5. **3994**, the monthly `decimal` advisory check, due **2026-10-30**.

**At the D34 release:** file the follow-up to remove the pre-D34 token path,
`users.legacy_tokens_revoked_at`, synthetic-salt verification, and the 22 test
files that sign legacy tokens. Due about 30 days after the release.

## Gotchas (new this session)

- **Anything that ends a session in a spec must use a spare or a throwaway
  person.** D34 makes sign-out real, so revoking a shared persona token signs
  that persona out for every later spec.
- **MUI password fields:** `getByLabel('Password')` now also matches the
  "Show password" button. Use the field's `data-testid` + `locator('input')`.
- **Logout's DELETE must carry the token explicitly:** the axios interceptor
  runs after `removeItem`.
- **`fly logs --no-tail` keeps only the last 100 lines.** For a run, stream
  `timeout 420 fly logs -a rockcut-api-dev > file` in the background.
- **Don't dump Playwright trace step parameters:** they include filled values
  and expected tokens. This session printed a DEV `taproomDevice` token and a
  throwaway password that way. Both are DEV-only: the token is pruned after
  8 h, and the user is deactivated.
- **`pkill -f` from a Bash call** can match the calling shell (exit 144).
  Kill by the listening port's PID instead.
