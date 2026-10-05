# Release plan: D34 + D35 to prod

**Status:** Ready. Waiting on Matt's go and timing.
**Prepared:** 2026-10-04
**Process:** `docs/process/three_environment_workflow.md` §5. Runbook:
`docs/chronicle_by_concept/03_deployment/ref/production_deploy_runbook.md`
("Routine redeploy").
**Tag:** `vYYYY.MM.DD` of the release day (for example `v2026.10.05`).

## 1. What ships

| | What staff will notice |
|---|---|
| **D34: revocable sign-in sessions + profile page** (PR #9, task 3991) | Signing out really ends the session on the server. There's a new **Profile** page (name or account icon) with **Change password** and **Sign out of all other devices**, and show/hide eye buttons on every password field. On the taproom tablets, a "Sign in as me" session ends on the server at sign-out or the 5-minute idle return, and lapses after 15 idle minutes if the tablet is offline. |
| **D35: calendar links reset when someone leaves or loses access** (PR #10, task 3992) | When someone is deactivated or loses manager or owner access, the shared calendar links they could see are reset. Everyone still using those links gets a "Re-subscribe to your Rockcut calendar" notification, in-app and by push, not by email. The Reset button in Calendar sync asks first and notifies too. The User change log shows link resets and owner-access changes. |

**Prod bugs this release also fixes (they're live today):**

1. **Calendar sync links don't work.** The link points at the UI host, which
   serves the app's web page, not a calendar. Anyone who subscribed got
   nothing. After the release, people need to copy the link again.
2. **A Wi-Fi drop can unpair a taproom tablet.** If the network is down
   while the tablet starts up or comes back from a "Sign in as me" session,
   it wipes its own pairing (D34 DEV pass 1 G1). After the release it shows
   "Can't reach the server, retrying…" and recovers on its own.
3. **Admin → Shared devices fails to load offline.** The service worker
   skipped `/devices` (D34 DEV pass 3 G2).

## 2. Migrations (2, both from D34, additive)

| Migration | Change |
|---|---|
| `20261002120001_create_user_sessions` | new table `user_sessions` (hashed `ses_` tokens; indexes on token_hash, user_id+revoked_at, device_token_id) |
| `20261002120002_add_legacy_tokens_revoked_at_to_users` | nullable column `users.legacy_tokens_revoked_at` |

- Both run at boot through the `Ecto.Migrator` child. Running
  `Release.migrate()` explicitly as well is harmless; the runbook does it.
- Neither touches existing rows.
- D35 has no migration.

## 3. Secrets and config

- **No new secrets.** D34 hashes session tokens with HMAC keyed by the
  existing `SECRET_KEY_BASE`.
- **Don't rotate `SECRET_KEY_BASE` during this release.** Every D34 session
  would stop matching its stored hash, which signs everyone out.
- Config changes: only `config/test.exs` (test-only).
- `fly.toml`, Dockerfiles and nginx are unchanged.
- Dependencies are unchanged since `v2026.10.02`, so the lockfiles are
  identical.

## 4. Sign-in impact (D34 Q1)

- **Nobody is signed out by the deploy.** Tokens issued before D34 are still
  accepted until they expire, which takes at most 30 days.
- New sign-ins get revocable `ses_` sessions.
- Paired taproom tablets stay paired; the D33 `dev_` tokens are unchanged.

## 5. Pre-flight (agent, before Matt's go)

- [x] `develop` merges into `main` cleanly, and the result is identical to `develop` (dry run, 2026-10-04).
- [x] DEV runs `develop` HEAD (`b8421e4`), with the full suite green apart from known flakes. See PR #9 and PR #10.
- [x] `mix hex.audit`: only the accepted `decimal` advisory (EEF-CVE-2026-32686, task 3994).
- [x] `pnpm audit --prod`: no known vulnerabilities.
- [ ] On release day, re-run both audits at the tag, and check that the
      new advisory feeds show nothing.

## 6. Steps (on Matt's go)

1. **Release PR** `develop → main`, titled "Release vYYYY.MM.DD: D34 + D35".
   The body lists §1–§4 and the rollback references from §8.
2. **Volume snapshot** before deploying:
   `fly volumes snapshots create vol_rkgemljzzkozz3w4 -a rockcut-api`.
   Record the snapshot id.
3. **Merge** the release PR, using the same method as #8. Then **tag** it
   and push the tag.
4. **Clean checkout of the tag** (a worktree). Never deploy from the
   working tree.
5. **Deploy the API:** `fly deploy --remote-only --depot=false`. Check that
   the machine is `started`, and start it if not.
6. **Migrate:**
   `fly ssh console -a rockcut-api -C "/app/bin/rockcut_api eval RockcutApi.Release.migrate()"`.
   Then confirm both migrations show `up`.
7. **Deploy the UI:** `fly deploy --remote-only --depot=false`.
8. **Record** the new versions in the release PR (API v22 and UI v18 are
   expected), with the rollback targets.

## 7. Smoke

**Agent:**
- `/api/health` returns 200, and the UI returns 200.
- `sw.js` is served `no-cache`.
- Both migrations are up.
- A synthetic sign-in gets 401, and there are 0 synthetic users.
- The bundle check against `https://rockcut-ui.fly.dev` passes.
- The API logs are clean in the first minutes: no `database is locked`,
  `dropped from queue` or 5xx.

**Matt** (signed in as himself; the agent never signs in on prod):
1. Sign out and sign back in.
2. Open **Profile**. The page shows your details and both actions. Don't
   press "Sign out of all other devices" unless you mean it.
3. Open Schedule → **Calendar sync** and copy a link. Opening it should
   **download a calendar** (`.ics`), not show the app.
4. Check that the Scheduler and Messages work as before.

**Staff (the next day):** a taproom employee opens their schedule.

## 8. Rollback

| App | Now (rollback target) | Image |
|---|---|---|
| rockcut-api | v21 | `registry.fly.io/rockcut-api:deployment-01M3YNX5X4JM877NSZV445A8VK` |
| rockcut-ui | v17 | `registry.fly.io/rockcut-ui:deployment-01M3YP2J2FRQ6ENX74B0SM95T2` |

- To roll back an app: `fly deploy --image <ref> -a <app>`.
- The migrations are additive, so the old code ignores the new table and
  column. No database restore is needed.
- **Side effect of rolling back the API:** sessions created after the
  release use `ses_` tokens, which the old code doesn't know. People who
  signed in after the release are signed out and sign in again. Tokens from
  before D34 keep working.
- The snapshot from §6 step 2 is a last resort only.
- Post in conv 80 which of these was done.

## 9. Timing

- Pick a time when the taproom isn't serving; Fly swaps the machine with a
  few seconds of downtime.
- After the smoke passes, **pair the prod tablets**, which is still an open
  item. With D34 live, a Wi-Fi drop can no longer unpair them.
- Tell staff that anyone who subscribed to a Rockcut calendar needs to copy
  the link again from Calendar sync.

## 10. After the release

- [ ] Write the close-out: CLAUDE.md (D34 and D35 under Completed
      Deliverables, and the "Next deliverable" line), plus
      `stepwise_results/d34_COMPLETE.md` and `d35_COMPLETE.md`.
- [ ] **File the D34 follow-up**, due about 30 days after the release.
      Remove:
  - the pre-D34 token path;
  - `users.legacy_tokens_revoked_at`;
  - synthetic-salt verification;
  - the 22 test files that sign legacy tokens.
- [ ] Update the deploy-plan memory, and write a session handoff.
- [ ] Post the release in conv 80.
