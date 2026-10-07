# D37 handoff note (PR description)

**Deliverable:** D37 — Buy-a-Beer Board + staff codes (PortableMind task 4083)
**Spec:** `docs/current_work/specs/d37_buy_a_beer_board_spec.md` (approved 2026-10-05, Q1–Q8; §3.6 amended for `M/D/YYYY` dates, lead decisions 1)
**Plan:** `docs/current_work/planning/d37_buy_a_beer_board_plan.md`
**Branch:** `d37-buy-a-beer-board`, cut from `develop` (`ade4433`). One commit per plan step, plus lead-decision follow-ups.
**SHA for DEV:** `<filled by lead at push>`

## What changed

Scenario → test detail for every row is in `rockcut-ui/tests/COVERAGE.md` (D37 section, no GAP rows).

| Area | Change | Scenarios | Tests |
|---|---|---|---|
| **Staff codes** | 4-digit code per active Taproom member. Stored as an HMAC digest (unique; tablet lookup) plus an AES-256-GCM copy (`STAFF_CODE_KEY`, user id as associated data) so managers can see it. Users & Roles edit dialog: Staff code section (owners + Taproom managers), masked with an eye toggle that fetches one code and audits `staff_code.reveal`; Suggest; Remove. Cleared on deactivation or leaving the Taproom. Wrong codes: 5 in 10 minutes locks that tablet token for 10 minutes. Routes: `GET/PUT/DELETE /api/users/:id/staff_code`, `GET /api/staff_codes/suggest`; `/api/me` gains top-level `staff_codes` | S1–S4, S9, S12, S16 | ExUnit `staff_codes_test`, `staff_codes/rate_limiter_test`, `staff_code_controller_test`; Playwright `taproom/staff-codes` |
| **Board** | Taproom → Buy-a-Beer Board (`/taproom/beer-board`): add, redeem (atomic conditional UPDATE; the last beer deletes the entry), edit, delete; client-side search and sort. On the Taproom tablet every write needs a staff code and is logged as "<name> on Shared Device"; "Sign in as me" writes need none. `Authz` rules for `:beer_board`; `Authz.Device` grants the tablet read only. Routes in the `:device_allowed` + `:taproom` scope; route matrix gains `@device_with_code` | S5, S7–S10, S13–S15, S17–S19, S31 | ExUnit `beer_board_test`, `beer_board_controller_test`, `device_route_matrix_test`, `authz_device_test`; Playwright `taproom/beer-board-staff`, `taproom/beer-board-device` |
| **History** | Append-only `beer_board_events` (names snapshotted, no FK to the entry). History tab for owners + Taproom managers: paged (50), searchable, "(import)" marked. People-only route (`BeerBoardAdminController`), so no staff code opens it on the tablet. `/api/me` gains top-level `beer_board_manage` | S6, S11, S16 | ExUnit `beer_board_controller_test`, `beer_board_admin_controller_test`; Playwright `beer-board-staff` (S6) |
| **Import / export** | `nimble_csv`. Export CSV on Board and History (fetch + Blob download, managers only, never on a tablet). Import: upload + Add/Replace → preview (row-numbered errors block; New rows; one card per For-name duplicate group with Allow / Combine / Pick) → confirm in one transaction. Confirm re-plans and compares a signature: board changed → 409 "The board changed since your preview" + Re-preview. Replace needs `REPLACE` typed and offers Export first. Formula guard (`'` before `= + - @` tab CR) on write, stripped on read. Dates: `YYYY-MM-DD`, `M/D/YYYY`, or the export's date-time. Limits 1 MB / 1,000 rows. Audit `beer_board.import`. Four people-only routes, all in the route matrix's `@denied` | S20–S30 | ExUnit `beer_board_csv_test`, `beer_board_import_test`, `beer_board_admin_controller_test` (6 fixtures in `test/fixtures/beer_board/`); Playwright `taproom/beer-board-import`, `taproom/beer-board-replace` |
| **Seed** | `[SEED]` board entries (one with 1 left, a For-name pair; tag on Bought by). Persona staff codes from `SYNTHETIC_STAFF_CODES` (restored each setup; other personas' codes cleared; unset → warning, codes left alone; a bad list is refused without echoing values). `cleanup_temp` removes `[TEST-TEMP]` board entries (history kept) | — | ExUnit `seeds/synthetic_test` |

**Test infrastructure:**
- New Playwright project `board-replace` (one worker, depends on `chromium`) for the two Replace specs, which clear the shared board and restore it from an export snapshot. Because of the dependency, any path-filtered run also runs the whole `chromium` project; `tests/RUNNING.md` has the split commands.
- After a full run, re-run setup (`mix rockcut.synthetic.setup` / `reset_synthetic()`): Replace leaves the `[SEED]` entries marked as imported. The specs don't depend on it.
- `dev.exs` raises the wrong-code limit to 1,000 for local reruns (like pairing).

## Migrations

| Migration | Change | Reversible |
|---|---|---|
| `20261006120001_add_staff_codes_to_users` | `users`: `staff_code_digest`, `staff_code_encrypted`, `staff_code_set_at` (nullable) + unique index on the digest | Yes |
| `20261006120002_create_beer_board` | `beer_board_entries`, `beer_board_events` (+ indexes on `inserted_at`, `entry_id`) | Yes |

All additive. **Rollback checked** on a scratch copy of the local dev DB (2026-10-06): `down` 2 steps dropped both tables, the three columns and the index, leaving other data intact (19 users, 22 shifts); `up` restored the same shape. A rollback **loses** board entries, history and staff codes.

The spec's Non-functional originally said "three migrations"; the two tables are in one file, so there are two, with the same schema. The spec now says two (corrected before the push).

## New dependency and secrets

- **`nimble_csv ~> 1.2`** (Dashbit, no dependencies of its own). Nothing added to the UI.
- **`STAFF_CODE_KEY`** (32 random bytes, base64): required on `rockcut-api-dev` and `rockcut-api`. **The API refuses to boot without it** in prod config. Stage it before the deploy, per the prod runbook.
- **`SYNTHETIC_STAFF_CODES`** (`bartender1:<code>,bartender2:<code>,barMgr:<code>`): **DEV only, optional.** Kept like `SEED_PASSWORD` (PortableMind file, Fly secret, local `.env.synthetic`). No spec needs it.

No values here or in git.

## Scenarios DEV must exercise

Spec §4, S1–S31. Personas: `barMgr`, `bartender1`, `bartender2`, `taproomDevice`, `owner`, `floater`, `breweryMgr`, `office1`, `brewer1`. With real-device emphasis:
- **On the Taproom tablet (Samsung / Pixel):** S7–S11 and S13 by hand once (code keypad, toast, lock message, "Sign in as me" → Redeem).
- **As `barMgr` on DEV's cross-origin hosts:** S20 (both exports download), S21–S23, S25 / S28 (Replace, with Export first), S27, S29.
- **Users & Roles:** S1, S2, S12, S16.

## Local gate (2026-10-06, run at `1296569`)

- `MIX_ENV=test mix test`: **1,001 tests, 0 failures** (one run, no reruns needed).
- `tsc` clean; `vite build` OK.
- `pnpm lint`: **26 errors, 1 warning**, all pre-existing (lint waiver below). By file: `src/datagrid-extended.d.ts` (10), and 1 each in `ComponentShowcase.tsx`, `batches/BatchFormDialog`, `batches/BatchLogEntryDialog`, `batches/BrewTurnDialog`, `brands/BrandFormDialog`, `ingredients/IngredientDetail`, `ingredients/IngredientFormDialog`, `ingredients/IngredientLotDialog`, `ingredients/IngredientsList` (+ the warning), `recipes/MashStepDialog`, `recipes/ProcessStepDialog`, `recipes/RecipeFormDialog`, `recipes/RecipeIngredientDialog`, `recipes/tabs/WaterTab`, `settings/CategoryFormDialog`, `settings/FieldDefinitionDialog`. D37 touches none of these files.
- **Playwright, whole local suite** (setup before and after): **174 passed, 1 skipped** (`smoke/roles` "DEV shows the banner", DEV-only), 0 failed, no retries. The known parallel flake (task 4064, `devices/personal_signin` S13) passed.
- **Persist-verify (final pass, browser, throwaway scripts):** as `bartender1` add → redeem (4 → 3) → edit (Chris & Lee, 7) → delete, each checked after a reload; on the tablet, redeem with a `[TEST-TEMP]` person's code (2 → 1, recorded as that person); as `barMgr`, import (Add, 2 rows incl. a `9/1/2026` date) persisted, and both exports downloaded with the rows.
- No revert check: D37 is a feature, not a bug fix.

## DEV pass 1 fixes (2026-10-07)

The DEV QA pass on `b71174b` (`stepwise_results/d37_dev_qa_report.md`) found G1–G9. Matt's decisions: fix G1, G3, G4, G5 and G9 here and reword the spec for G2 and G8; G6 and G7 go to the backlog. One commit each, `27c2979`..`f98b550`.

| Gap | Fix | Test |
|---|---|---|
| **G1** (must-fix) a manager removing someone from their department got "Forbidden" and lost the rest of the save | `UserFormDialog` `save()`: a non-owner sends the `PATCH` first, then the memberships (owners keep D35's memberships-first order, for the owner flag). A typed staff code isn't sent when the save takes the person out of the Taproom or deactivates them (the server clears it). Predates D37 (D35 order, any department manager). No API change. | Playwright `auth/manager_removes_member` (barMgr: rename + leave Taproom with a code → saved, membership gone, `has_staff_code` false; breweryMgr: the same for the Brewery). D35 ordering: `scheduler/calendar_feed_rotation` still passes. |
| **G2** the 5th wrong code locks | Spec S9 reworded (no code). | as S9 |
| **G3** a typed code was clear text in Users & Roles | `StaffCodeSection`: typed/suggested digits masked with the tablet's CSS (`maskedCodeSx` in `lib/staffCode.ts`); the eye shows/hides them without a fetch or `staff_code.reveal`; hidden on each open. `inputMode="numeric"` kept. | Playwright `staff-codes` "DEV pass 1 G3" (computed `-webkit-text-security`, no GET) |
| **G4** a paste with a space or dash kept 3 digits | `maxLength` removed from the tablet field; both fields use `staffCodeDigits` (digits only, then 4). | Playwright `beer-board-device` "DEV pass 1 G4" (`" 1234"`, `"12 34"`, `"12-34"`, `"123456"` by `fill` and `insertText`; no submit). Fails with `maxLength` put back (`123`). |
| **G5** an extra column refused the import | `Csv.parse/1` returns `{:ok, rows, ignored_columns}`; preview JSON gains `ignored_columns`; the dialog shows "Ignored columns: Notes". Missing / repeated columns stay errors. Apply works on the previewed rows, unchanged. Spec §3.6 gains the bullet. | ExUnit `beer_board_csv_test` (G5; the old "Unknown column" assertion removed), `beer_board_admin_controller_test` (G5: preview + apply; clean fixtures list none); Playwright `beer-board-import` "DEV pass 1 G5" |
| **G8** History says Added, the spec said created | Spec §3.5 (UI labels vs API/CSV values) and S6, S7, S19, S22, S23, S25 use the UI labels. | as those scenarios |
| **G9** after "Only N left" the Redeem dialog kept the old count | `RedeemDialog`: on the 422 it refetches the board and shows the fresh entry (header, stepper clamped, last-beer wording); the inline error stays; an entry gone meanwhile gets "This entry was already removed". | Playwright `beer-board-staff` "DEV pass 1 G9" (API redeem by bartender2 mid-dialog) |

**Local gate after the fixes (2026-10-07, at `f98b550`):**
- `MIX_ENV=test mix test`: **1,003 tests, 0 failures.**
- `tsc` clean; `vite build` OK; `pnpm lint` **26 errors, 1 warning**, the same files as above, none changed by D37.
- **Playwright, whole suite** (setup before and after), run twice:
  - Run 1: 174 passed, 4 failed, 1 skipped, 2 did not run (`board-replace`, skipped because `chromium` failed). Failed: `devices/device_permissions` S12, `devices/personal_signin` S13 (task 4064), `devices/pairing` S11, `scheduler/events_manager` S2: all timeouts.
  - Run 2: 176 passed, 2 failed (`personal_signin` S13 again; `taproom/staff-codes` "Remove clears the code at once": the `DELETE` took 8 s), 1 skipped, 2 did not run.
  - Each failed test alone with `--repeat-each 5 --workers=1`: **5/5 passed** (all six). `pairing` S11 also passed 5/5 in parallel; the others fail 4 of 5 when the repeats run in parallel, because they share a persona/tablet/week. `board-replace` alone: 2/2 after each run.
  - None of the failing specs exercises a file this pass changed except `staff-codes` (its Remove path is unchanged). The box had under 1.3 GB of memory free (10 GB, no swap) during the runs, and page loads took 2–3 s. That's my read of the timeouts, not a proven cause.
- **Persist-verify** (throwaway script, auth files, deleted): G1 as barMgr (rename + leave Taproom → after reload: renamed, no Taproom, no code); G5 (Notes column → "Ignored columns: Notes", 2 entries after reload); G9 with two sessions (bartender2 redeems 2 in the UI while bartender1 holds 5 → "Only 3 left", header and stepper at 3; 3 left after reload).
- Test-only changes beyond the brief: `openUser` moved to `taproom/helpers.ts` (shared with the G1 spec) and waits 15 s for the grid; `staff-codes.spec.ts` has a 60 s test timeout (each test loads Users several times).

## Lint waiver

`pnpm lint` shows **26 errors (and 1 warning), all already on `develop`; D37 adds 0.** Matt waived them for D37's local gate on 2026-10-06 (lead decisions 1 §3). A follow-up task, **4084**, fixes them on their own branch. D37 doesn't touch the Brewery, Settings or `ComponentShowcase` files.

## ⚠ LIMITATIONS: what local could NOT tell us

1. **`STAFF_CODE_KEY` must be set on `rockcut-api-dev` before the deploy,** or the API won't boot. That failure is intended; DEV is the first place it's checked. Same for prod at release.
2. **`SYNTHETIC_STAFF_CODES` isn't on DEV yet** (lead decision 2: the lead asks Matt and sets it at the DEV gate, with `STAFF_CODE_KEY`). Until then DEV setup logs a warning and leaves persona codes alone. No spec needs them.
3. **After a full Playwright run on DEV, run `reset_synthetic()`:** the Replace specs mark the `[SEED]` board entries as imported (decision 3). Replace also wipes and restores DEV's board during the run, so nobody should be using the DEV board by hand meanwhile; restored entries get new ids.
4. **Tablet code entry on the real Samsung / Pixel:** the field is `type="text"` + `inputMode="numeric"` + CSS masking. Check that the numeric keypad appears and the digits stay masked.
5. **Cross-origin calls:** locally the UI reaches the API through Vite's `/api` proxy (same origin). On DEV, UI and API are different hosts, so the CSV download (fetch + Blob with the bearer header) and the multipart upload go through CORS for the first time. Check both exports download and an import previews.
6. **CSV download in the Android Chrome PWA:** a desktop check can't show that the Blob download saves a file there.
7. **A real Excel or Numbers export:** the "Excel-saved" fixture (BOM, CRLF, `M/D/YYYY`) was made by hand. Re-save an export in Excel and in Numbers and import it once. Day-first dates (`1/9/2026` meaning 1 September) are read as US order or refused; that's the spec.
8. **The wrong-code limiter is per machine** (ETS) and **DEV keeps the real limit** (5 per 10 minutes; `dev.exs`'s 1,000 is local only). Each full run spends one wrong code on the shared `taproomDevice` token (S9), so 5 full runs inside 10 minutes would lock it: wait 10 minutes. One machine per app (D28) keeps the per-machine limiter correct.
9. **Concurrency on a slower box:** S17 (two bartenders on the last beer) and S27 (board changed before confirm) rely on SQLite's single connection; they passed locally, but DEV latency is different.
