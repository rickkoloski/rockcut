# D55: Tablets and tidy-up — Complete

**Spec:** `specs/d55_tablets_and_tidy_spec.md`
**Plan:** `planning/d55_tablets_and_tidy_plan.md`
**Completed:** 2026-11-08 (on prod as `v2026.11.08-2`). **Matt's sign-in and tablet checks are still
open (task 5164).** They now cover D53, D54 and D55.

---

## Summary

D55 makes shared tablets more robust and sweeps the backlog: tablets stop unpairing on a stray
401, errors are readable, ids are checked, "not found" pages are added, and leftovers are removed.
It shipped **without** §2.8's removal of D54's `leftoverTabletSession` start-up shim. Matt released
before his tablet check, so `35c6c7b` was reverted (PR #59) and the shim stays until every tablet is
confirmed on the new app.

## What Was Built

- **§2.1:** a stray 401 is rechecked with one shared `GET /api/me` before a tablet unpairs or a
  person is signed out. A retry banner shows mid-session.
- **§2.2:** a tablet's unknown route shows "Page not found". Real personal pages keep "Not
  available on a shared device".
- **§2.3:** readable 400/413 errors, with CORS in every environment (`CORSPlug` before
  `Plug.Parsers`).
- **§2.4:** malformed `memberships` answer 422, with nothing saved.
- **§2.5 / §2.10:** an empty Sort Order means the end (grain bill, category fields, categories).
- **§2.6:** "… not found" pages for categories, brands, recipes, ingredients and batches.
- **§2.7:** `mix compile --warnings-as-errors` is clean.
- **§2.8:** a migration drops `users.legacy_tokens_revoked_at` and
  `user_sessions.device_token_id`. **The shim removal was reverted for the release.**
- **§2.9:** "Rock Cut Brewing".
- **§2.11:** URL ids that aren't usable ids answer 404 (`PathIds`); out-of-range or wrong-type body
  and query ids answer 422 (`ParamIds`). The T13 route sweep covers them.
- **§2.12:** a missing parent answers 422 (`RockcutApi.Changeset.validate_parents/2`, 34
  changesets; T14).

### Migration

`20261108140001_drop_unread_session_columns`. An API image from before D55 selects those columns,
so a rollback past D55 needs the pre-release snapshot.

## Testing

- **Local and DEV gate on `c3c3308`:** `mix test` 2182, vitest 242, full DEV Playwright green.
  Fix cycles used: 1 of 2.
- **Independent QA:** `stepwise_results/d55_dev_qa_report.md` and the recheck
  `d55_dev_qa_recheck_report.md`. Verdict: pass with gaps; every fix-cycle-1 gap is fixed, and one
  new minor gap (14) is open.
- **#59 (shim kept):** `tsc`, vitest 246, `vite build`, and `shared_device_no_personal_login.spec.ts`
  12/12 locally, including the restored S249 and S251.

## Release

- PR #57 → `develop` (`1b08caa`); #59 → `develop` (`cb6ea51`); release PR #60 squash `b248d65`;
  tag `v2026.11.08-2`. No sync PR was needed before the release.
- Prod API v35 `registry.fly.io/rockcut-api:deployment-01M6Z7HP49YRH2YQZC1B013JVH`, UI v31
  `registry.fly.io/rockcut-ui:deployment-01M6Z7KPQ5MA6TQG23J1GYDPP1` (build id `v2026.11.08-2`).
- **Rollback:** restore snapshot `vs_Aqb8a3KXyAnRCwp3lP5lok3q`, then API v34
  `…deployment-01M6Y81NMM9ZFQK4SJD23PX8PV` and UI v30 `…deployment-01M6Y83YB817HF2XQKRCA42YYD`.
- **Smoke checks:**
  - `/api/health` reports `b248d65`, and the migration is recorded with the columns gone;
  - the UI answers 200, `sw.js` is served `no-cache`, and the bundle carries the build id;
  - a signed-out `/api/me` answers 401, and a malformed JSON request gets a 400 with its CORS
    header;
  - the title reads "Rock Cut Brewing".

## Follow-ups

- **5164:** Matt's sign-in and three tablet checks. After them, re-remove the shim (re-apply
  `35c6c7b`) in a later release.
- QA gap 14 (a card with a missing list answers 404, not 422).
- Backlog 5203–5206.
