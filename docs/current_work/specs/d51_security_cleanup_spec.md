# D51: Security and cleanup sweep

2026-10-28 · Matt asked to finish 3994 and 4058 and group related backlog items; he added 4669.

| Task | What | Part |
|---|---|---|
| 3994 | `decimal` advisories (and every other `mix hex.audit` finding) | 1 |
| 4119, 4233 | UI `source-map-js` advisory (the two tasks are duplicates), plus the other `pnpm audit` findings | 1 |
| 4058 | Remove the pre-D34 token path | 2 |
| 4231 | Creating a user can echo a caller-typed password | 2 |
| 4669 | Build commit on `/api/health` and in the DEV ribbon | 2 |
| 4060, 4064, 4057 | Flaky tests in the synthetic-token and sign-in suites that 4058 rewrites | 2 |

**Two releases.** Part 1 is a hotfix (branch `hotfix-d51-deps` from `main`, merged to `main` and `develop`), because the `bandit` advisories are HIGH on an internet-facing server. Part 2 is a normal deliverable branch (`d51-auth-cleanup` from `develop`); it can be built now but **must not deploy to prod before 2026-11-05** (pre-D34 tokens, issued up to the D34 deploy on 2026-10-05 UTC with a 30-day max age, can be valid until 2026-11-04).

## Part 1: dependency advisories

### Found at the start (2026-10-28)

`mix hex.audit` on `main` (`957dadf`):

| Package | Locked | Advisories | Fixed in |
|---|---|---|---|
| bandit | 1.12.5 | 11 HIGH, 3 MEDIUM | 1.14.1 |
| jose (via `web_push_ex`) | 1.11.12 | 1 HIGH, 7 MEDIUM | 1.11.13 |
| plug_crypto | 2.2.0 | 1 MEDIUM | 2.2.1 |
| decimal | 2.4.1 | 2 MEDIUM (CVE-2026-32686, the one accepted on 2026-09-30, and CVE-2026-97853, `Decimal.round/3`) | 3.2.0 |

The 3994 blocker is gone: Ecto 3.14 (May 2026) requires `decimal ~> 3.0`. Moving to it takes `ecto` 3.14.2, `ecto_sql` 3.14.0, `ecto_sqlite3` 0.26.0 (with `exqlite` 0.43.0) and `db_connection` 2.10.2.

`pnpm audit` in `rockcut-ui`:
- **prod:** `follow-redirects` 1.16.0 via `axios` (2 HIGH). `axios` uses XHR in the browser, so `follow-redirects` doesn't ship in the bundle, but it's listed.
- **build/dev only:** `source-map-js` 1.2.1 (HIGH; 4119/4233), `vite` 7.3.6 (`launch-editor`, `server.fs.allow`), `zod` 4.3.6 (via `eslint-plugin-react-hooks`), `@vitest/mocker` 4.1.11, `fast-uri` 3.1.8, `serialize-javascript` 7.1.2.

### Change

- `mix.exs`: `ecto_sql ~> 3.14`, `bandit ~> 1.14`; `mix deps.update` for the packages above.
- `package.json`: `vite ^7.3.7`, `vitest 4.1.12`; `pnpm update --depth 99` for the transitive packages. `axios` stays 1.20.0, so `check-bundle-versions.mjs` is unaffected.
- No application code changes. `decimal` 3's breaking changes are decimal128 limits (34 digits, exponent ±6144) on parse/cast and operation results; brewing values are far inside them. Our code calls only `add`, `cast`, `equal?`, `gt?`, `lt?`, `new`, `to_float`, `to_string`.

### Accepted

- `deepmerge` (LOW, no patched version) via `vite-plugin-pwa > workbox-build`, build-time only.

### Scenarios (regression, no new behavior)

The change is under every request, so the gate is the full suites plus these, driven on DEV:
1. **Brewing decimals:** as `breweryMgr` from Brewery → Brands, edit a brand's target ABV to `5.25`, reload, the value persists. `1e9999` is refused with a field error ("is invalid"), not a 500. ExUnit: `test/rockcut_api/brewing/brand_test.exs` (fails on decimal 2.4.1, passes on 3.2.0).
2. **Web push (jose):** as `bartender1`, Notification preferences → Enable push, then a shift publish delivers a push (DEV only; HTTPS).
3. **Sign-in and sessions (plug_crypto):** sign in, sign out, Profile → Sign out of all other devices; a paired tablet's "Sign in as me".
4. **HTTP server (bandit):** the full DEV Playwright suite exercises it; prod smoke (health 200, UI 200, `sw.js` no-cache).

### Gate

Local: `mix test` green; `tsc`, `vite build`, unit tests green; lint no worse than `main` (26 known errors, task 4084); full local Playwright green. DEV: full suite at the hotfix SHA; independent pass on the scenarios above. Prod: tag on `main`, deploy both apps, smoke incl. `mix hex.audit` / `pnpm audit --prod` clean, then merge `main` into `develop` normally (workflow §5.6).

## Part 2: auth cleanup, build commit, flakes

### 4058: remove the pre-D34 token path

- `AuthPlug`: drop `legacy_auth`; only `ses_` sessions and `dev_` device tokens authenticate. Anything else is 401 as today for an unknown token.
- `SessionController.verify_token/1`: drop the `Phoenix.Token` `"user auth"` verify and the synthetic-salt verify (personas mint sessions via `Sessions.create`).
- `Sessions`: drop `legacy_tokens_revoked?` and the `legacy_tokens_revoked_at` writes; a migration removes the column.
- Tests: move the 22 test files that sign legacy tokens to sessions (`PersonaFixtures`). Add a test that a validly signed old-style `Phoenix.Token` is refused (401).
- **Before the prod deploy:** confirm the date is 2026-11-05 or later. Legacy tokens aren't stored, so there is nothing to query; the date is the check.

### 4231: never return a password the caller typed

The UI doesn't send a password when creating a user; the server generates one and the dialog shows it once for the manager to hand over. That stays. Change: `Accounts.create_user` ignores any `password` in the request and always generates. Tests: a create request with `password` gets a different, generated `temp_password`; the response never echoes the sent value; `filter_parameters` still masks it in logs.

### 4669: build commit

Pass `GIT_SHA` as a Docker build arg to both apps (`fly deploy --build-arg GIT_SHA=$(git rev-parse HEAD)`). `/api/health` returns `{status, app, env, sha}` (`sha` `"unknown"` when unset); the DEV ribbon shows the short SHA; the UI exposes it the same way as `VITE_BUILD_ID`. Add "deployed SHA == tested SHA / tag" to the DEV pre-flight and prod smoke in `three_environment_workflow.md` and `tests/RUNNING.md`.

### Flakes

- **4060** (ExUnit pairing rate limiter): make the limiter's state resettable per test, or scope the cap so earlier tests can't exhaust it.
- **4064** (S13 under parallel load) and **4057** (G1 "Try now" on DEV): investigate with `--repeat-each` and traces; fix or, if the cause is the harness, make the wait deterministic. Close 4057 if it can't be reproduced again.

### Scenarios

1. `owner` signs in on the web; every page loads; sign out works. (Sessions only.)
2. A request with a pre-D34-style signed token gets 401 and the UI shows the sign-in page.
3. A paired tablet (`taproomDevice`) keeps working; "Sign in as me" works.
4. Minted persona tokens work locally and on DEV (`mix rockcut.synthetic.token`, `mint_tokens_json`).
5. As `barMgr`, Users & Roles → Add person: the dialog shows a temporary password once; the person signs in with it and is asked to set their own.
6. `curl /api/health` on DEV shows the deployed SHA; the DEV ribbon shows the same short SHA.

### Migration

One: drop `users.legacy_tokens_revoked_at` (SQLite table rebuild via Ecto; reversible by re-adding the nullable column).
