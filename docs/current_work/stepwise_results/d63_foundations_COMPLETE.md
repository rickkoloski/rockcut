# D63: Foundations for recipes (COMPLETE)

**Spec:** `docs/current_work/specs/d63_foundations_spec.md`. **Plan:** `planning/d63_foundations_plan.md`. **Brief:** `prompts/d63_builder_brief.md`.
**Branch:** `d63-foundations` (PR #99, merged `77078d8`). **Tested on DEV:** `d3fc7e6`. **On prod:** `v2026.11.25` (release PR #100, `0f464c2`).

## What changed

| Area | Change |
|---|---|
| Carry-ins | Phone Back closes confirmations (6260); Brink History hides voided records with no entries (6261); order footer unit words (6262); S16, `TaskBoardTest` and `purchasing_schemas_test` fixes (5911); page buttons on one line from `sm` up |
| Catalog | Finings is now Process Aids, four products, units g and mL; seven spice products; EKG; value corrections; calcium chloride on Anhydrous; Pink Boots '23 and '24 |
| Hop use order | One ordered list per hop and form, across makers; drives hop movements and count shortfalls; Hide used-up lots per account |
| Brewery settings | `/brewery/settings`: Brewery members and the brewhouse device view, Brewery managers and owners edit. Nothing reads the values until D68 |
| From local QA | Back after a delete says not found; saving a deleted product, ingredient, offer or lot says so; Count wording; pack-note hint |

**Migrations:** `20261124120001`–`07`. Rollback needs the pre-release snapshot.

## Checks

- **Local:** ExUnit 3,154, vitest 583. Final full Playwright: 1,093 passed, 1 skipped, 1 failed (T9, passed on rerun), 2 not run (passed on rerun).
- **Local QA:** first pass fail (four gaps), recheck pass with gaps (two). No recheck after the last fix (message only, with tests).
- **DEV Playwright:** not one clean run. Full run 559 passed, 1 failed (P26), 537 not run. Rested reruns: P26 5 of 5, production 218, brewery-board 233, ingredients 255 passed and 2 failed, d58 47, board-replace 2. `d63-stop-2` then 18 of 18 with a longer limit; "An offer" (`d63-fix-2.spec.ts:76`) still fails now and then.
- **DEV QA:** pass with gaps (`d63_dev_qa_report.md`; its check counts are estimates). It missed the Use order link below, which Matt found.
- **Phone (Matt, DEV):** Back on confirmations passed. The long-press drag was not checked. The service worker's update from an older build was not tested on DEV.
- **Prod:** pre-checks clean, seven migrations with no skips, seed second run 0, rows read back as specified, integrity and foreign keys clean, 0 synthetic users. Matt's check passed 2026-11-25.

## Carried (Matt)

- **D68 Stop 0, before its hop parts:** no link in the app to a hop's page (Use order) when the hop has products; the long-press drag on a phone with it.
- **D68 Stop 0:** `db_connection` update (EEF-CVE-2026-133555, HIGH); T9; a formulas call for a deleted recipe returns a raw error; Edit offer allows Save before its Pack list loads; a deleted product's page says "Maltster product not found"; the `d63-stop-2` cleanup limit; P26's wait.
- **D66:** a batch deleted on the Gantt may still show from Back (not tested).
- **Backlog (PortableMind):** generic 404 text in five dialogs and two Delete buttons; phone Forward after Back from a delete; a misleading 422 (API only).
