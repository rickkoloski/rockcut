# D59: targeted check of gap 9 (fix cycle 2, DEV)

- **Build:** `dc54a1825e322a2531c209f15c32444cb07d2b93` (`GET /api/health` → `env: dev, status: ok`; ribbon `DEV · dc54a18`)
- **Date:** 2026-11-11, about 20:50–20:57 America/Denver. The full Playwright suite was running against DEV at the same time.
- **Method:** one script, `scripts/g9_check.js`, using the fresh `auth/` storageState files. API calls were made from inside each persona's page with that page's own session. No token, code, password or `temp_password` was printed or logged. Desktop 1366×768.
- **Personas used:** `owner`, `breweryMgr`, `dualMgr`, `ownersAsst` (read only). Seeded personas' data was not changed. Every write targeted my own `[TEST-TEMP]` people.

## Verdict: **pass**. Gap 9 is fixed, and no new gaps were found (none numbered from 11).

| Severity | Count |
|---|---|
| must-fix | 0 |
| should-fix | 0 |
| minor | 0 |

## Scenarios

| # | Result | Notes |
|---|---|---|
| G1 | PASS | Health sha and ribbon both show `dc54a18`. |
| G2 | PASS | **Refusals:** as `breweryMgr` (target: a `[TEST-TEMP]` Brewery-only person) and `dualMgr` (target: a `[TEST-TEMP]` Office-only person), Owners as manager and as employee were each tried two ways: alone and mixed with the department they manage. Each was sent as a membership PUT, and as a user create (manager alone, manager + own department, employee + own department). All 14 requests returned **`403 {"error":"You can't assign roles in that department"}`**. No response names Owners. **Unknown key:** `zzz` still gets its own `422 "unknown department"`. **Nothing changed:** both targets' memberships are unchanged, and no user was created. |
| G3 | PASS | **Owner, manager role:** `owner` asking for Owners as manager still gets `422 "Owners has no managers"` (PUT mixed, PUT alone, and create), and the person's memberships are unchanged. **Owner, membership:** `owner` removed the `[TEST-TEMP]` person's Owners membership (employee) and added it back, both `200`. `ownersAsst`'s Owners people list dropped the person, then showed them again. **`dualMgr` save:** the dialog shows "Owners member · Only owners change Owners membership." as read-only. A rename plus Office → Manager saved (`PATCH 200`, memberships `PUT 200`). After a reload the grid shows "Office: manager, Owners: member", and the API agrees. |

The gap 8 oracle on memberships (403 for `owners` vs 422 for an unknown key) is unchanged. Since the 403 is the same one any department you can't assign in gets, it no longer reveals the name.

## Data made and cleaned

| Kind | Id / name | Outcome |
|---|---|---|
| Person | 4016 `[TEST-TEMP] G9 Office+Owners … edited` (Office + Owners; set back to Office employee before cleanup) | deactivated |
| Person | 4017 `[TEST-TEMP] G9 Brewery only …` | deactivated |
| Person | 4018 `[TEST-TEMP] G9 Office only …` | deactivated |

Each was deactivated through the API by exact id, after reading back that its name starts with `[TEST-TEMP]`. None of the refused creates made a user.

**Side effect:** an Office calendar feed rotation ("someone who could see it no longer has access") went to Office feed holders and owners at 03:57:01Z (20:57 local). It matches the end of my run, when I put 4016 back from Office manager to employee and then deactivated my people, so it is most likely mine. The suite was running too, so I can't be certain. Anyone subscribed to DEV's Office feed needs the new link.

## Not covered

Only gap 9 and the G1–G3 checks were in scope. Nothing else from the earlier reports was rechecked.
