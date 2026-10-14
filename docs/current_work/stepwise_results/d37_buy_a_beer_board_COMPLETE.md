# D37: Buy-a-Beer Board + Staff Codes — Completion Record

**Status:** COMPLETE. On prod since 2026-10-07 (~19:52 UTC) in release
`v2026.10.07` (`853983b`, PR #17; API v25, UI v20). Matt's prod check passed.
**Spec:** `specs/d37_buy_a_beer_board_spec.md` (approved 2026-10-05, Q1–Q8;
amended: §3.6 `M/D/YYYY` dates, two migrations, DEV pass 1 wording and
ignored columns)
**Plan:** `planning/d37_buy_a_beer_board_plan.md`
**Concept:** 09_taproom (new: the board); 06_auth_roles (staff codes)
**Branch:** `d37-buy-a-beer-board`, PR #15, merged 2026-10-07 as `0ed1afa`.
DEV gate SHAs: **`0b91066`** / **`b71174b`** (pass 1), **`60417ed`** (pass 2,
after the fixes).
**Backlog:** PortableMind project 254. Closed: 4083. Filed: 4084 (lint),
4115, 4116, 4117, 4118, 4119.
**QA reports:** `stepwise_results/d37_dev_qa_report.md` (pass 1),
`d37_dev_qa2_report.md` (pass 2)

---

## Summary

The taproom's Buy-a-Beer chalkboard (customers prepay beers for a named friend)
moved into the app. Staff add, redeem, edit and delete entries from their phones
or the shared Taproom tablet; managers see a change log and can export and
import the board as CSV. On the shared tablet, each write asks for the person's
4-digit **staff code**, so the change log says who did it without anyone
signing in.

## What shipped

| Area | Change |
|---|---|
| **Board** | Taproom → Buy-a-Beer Board (`/taproom/beer-board`): For, Bought by, Beers left, Moved off the board, Imported; every column sorts; one search box over both names. Add, Redeem (stepper, last-beer confirm), Edit, Delete. Atomic redeem; "This entry was already removed" when two people take the last beer. |
| **Staff codes** | Users & Roles → Staff code for Taproom members (owners and Taproom managers): masked, eye to reveal (audited), Suggest, Remove. HMAC digest (unique) + AES-256-GCM copy under the new `STAFF_CODE_KEY`. Cleared on deactivation or leaving the Taproom. |
| **Tablet** | Every board write asks for a staff code; the toast names the person; 5 wrong codes in 10 minutes lock code entry on that tablet for 10 minutes. A code is not a sign-in: History, import and export stay off the device. |
| **History** | Managers: who (with "on Shared Device"), action (Added / Redeemed / Edited / Deleted, "(import)"), names, before → after; searchable, paged, CSV export. Survives deletes. |
| **Import / export** | CSV (`nimble_csv`). Export with formula-safe values. Import Add / Replace with a no-change preview, row errors, duplicate groups (Combine / Allow / Pick), a stale-preview check, `M/D/YYYY` and ISO dates; unknown columns ignored and listed. |
| **Seed** | `[SEED]` board entries, persona staff codes from `SYNTHETIC_STAFF_CODES` (DEV), `[TEST-TEMP]` cleanup. |
| **Prod fix (D35)** | A non-owner manager removing someone from their department got "Forbidden" and lost the rest of the save. The user change now goes before the memberships for non-owners. |

**Migrations (2, additive, reversible):** staff-code columns on `users`; the two
board tables. **New secret:** `STAFF_CODE_KEY` (DEV and prod). **New
dependency:** `nimble_csv`.

## Testing

- **Local gate:** API 1,003 tests, 0 failures; `tsc` + build pass; lint 26 + 1,
  all pre-existing (waived by Matt, task 4084); Playwright 180 passed, 1 skipped
  (with `--workers=2`; default-worker runs timed out under memory pressure).
- **DEV gate, pass 1 (`b71174b`):** full suite 175/175 after a test-only fix to
  the D34 "Try now" spec (a race in the test, exposed by DEV latency).
  Independent QA: PASS with gaps, 31/31 scenarios; 1 must-fix (the D35 bug
  above) + 9 minor.
- **DEV pass 1 fixes:** G1 (the D35 bug), G3 (code masked while typed), G4
  (paste keeps 4 digits), G5 (ignore extra columns), G9 (fresh count after
  "Only N left"); spec wording for G2 and G8. G6/G7 → 4115/4116.
- **DEV gate, pass 2 (`60417ed`):** full suite 181/181. Focused QA: PASS with 6
  minor gaps → 4118.
- **Prod smoke (agent):** health, UI 200, `sw.js` no-cache, board route live,
  both migrations applied, synthetic login 401, 0 synthetic users, bundle check;
  `hex.audit` `decimal` only (3994); `pnpm audit` one new build-time advisory
  (4119, not from this release). **Matt's login check passed.**

## Release incident

~8 minutes of API downtime (19:41–19:49 UTC): the staged prod `STAFF_CODE_KEY`
was malformed, so v24 refused to boot (by design) before any migration. Matt set
a fresh key with `fly secrets set`, and the machine came up on the D37 image as
v25. No data affected. Lesson: check a new key decodes to 32 bytes before
deploying. Details on PR #17.

## Follow-ups

- **4117 (medium):** the API accepts writes from someone who still has to reset
  their password (app-wide, pre-existing).
- 4115 / 4116: History export follows search; search matches "who".
- 4118: staff-code Remove, import header edge cases, stale Redeem dialog after
  removal, "— None —" select, Activity labels.
- 4119: `source-map-js` advisory. 4084: the 26 lint errors on `develop`.
- **Humans:** set staff codes for Taproom staff before the tablets use the board.
