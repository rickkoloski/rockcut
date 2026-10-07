# D37 builder brief

**From:** the lead (the Claude in the Herdr `lead` tab), for Matt.
**Branch:** `d37-buy-a-beer-board`, in `~/src/rockcut`. Steps 1–4 are
committed; the branch isn't pushed.

## Read first

1. `CLAUDE.md` (repo root).
2. `docs/process/three_environment_workflow.md` §3 (the local gate) and §6
   (Playwright rules).
3. `docs/current_work/specs/d37_buy_a_beer_board_spec.md`: approved. §3.6
   (import/export) is your step.
4. `docs/current_work/planning/d37_buy_a_beer_board_plan.md`: "Approach →
   Import", "Changes", "Order of work".
5. `docs/current_work/SESSION_HANDOFF_2026-10-05b.md`: what's built, plus
   **Gotchas**. Read them all; they cost time to learn.

## Your limits

**You may:**
- edit code, docs and tests on this branch;
- run `mix` (including `mix deps.get`), `pnpm`, `npx playwright` and
  `curl localhost`;
- commit on this branch, using the repo's commit format and the attribution
  line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Never:**
- `git push`, `gh`, `fly`, merge, rebase, branch delete, `git stash`, or
  switching branches;
- anything on DEV or prod;
- posting in PortableMind.

**Format only the files you changed.** Never run a repo-wide `mix format`
or `mix precommit`.

**Servers:** the local API (:4002) and UI (:5174) run in the lead's tab. Use
them, but don't start, stop or kill them. After adding `nimble_csv` the API
needs a restart. **Stop and ask the lead:** say "LEAD: please restart the
API" in your reply and wait.

**When a decision isn't in the spec,** don't guess. Stop and write the
question in your reply, starting with `LEAD:`. The lead answers or asks
Matt.

## Task 1: plan step 5, CSV import and export

Build spec §3.6 and scenarios **S20–S30**, as the plan describes:

**API:**
- Add `{:nimble_csv, "~> 1.2"}`.
- `RockcutApi.BeerBoard.Csv`:
  - **parse:** BOM, CRLF, header matching ignoring case and spaces, the
    alias `Date added` → moved-off, the `Imported` column ignored, 1 MB and
    1,000-row limits, row-numbered errors, and one leading `'` stripped
    before `= + - @ \t \r`;
  - **write:** entries (For, Bought by, Beers, Moved off board, Imported)
    and history, with the same formula guard.
- `RockcutApi.BeerBoard.Import`:
  - **`plan/3`** (pure): groups on the normalized **For** name only. Add
    mode groups board entries and file rows together; Replace mode groups
    file rows only. A group needs at least one file row.
  - **`apply`:**
    - one transaction;
    - re-plans inside it and compares a group signature with the preview's
      → 409 "The board changed since your preview". Replace also signs the
      whole board;
    - Allow / Combine / Pick as spec §3.6 step 3 describes;
    - events carry `detail.source = "import"`;
    - created entries get `imported_at` = now, and a file's moved-off date
      or the import time;
    - `audit_log` `beer_board.import`.
- `BeerBoardAdminController` (the **people-only** scope; add each route to
  the route matrix's `@denied`):
  - `GET /api/beer_board/export.csv`;
  - `GET /api/beer_board/history/export.csv`;
  - `POST /api/beer_board/import/preview` (multipart `file` + `mode`);
  - `POST /api/beer_board/import`.

  Each checks `Authz.can?(user, :import | :export | :history, :beer_board)`.
- **ExUnit:**
  - `beer_board_csv_test.exs` and `beer_board_import_test.exs`;
  - fixtures in `test/fixtures/beer_board/`: a clean file, one with errors,
    an Excel-saved file (BOM + CRLF), one with quoted commas, one with a
    formula-like name, and one with For-name duplicates;
  - controller tests for 403s, including a manager's staff code on the
    tablet.

**UI** (`pages/taproom/`):
- **Export CSV** on the Board tab and on History. Managers only
  (`beerBoardManage`); not on a device. Download with a fetch + Blob helper,
  since a link can't carry the bearer token.
- **`BeerBoardImportDialog`:**
  - upload + mode (Add, the default / Replace);
  - preview: row errors block the import; **New** rows; one **card per
    group** listing every item (On the board / From the file) with Allow /
    Combine / Pick:
    - Combine shows an editable joined Bought by and is disabled over 99;
    - Pick shows a checkbox per item, with the warning "Deletes N entries
      on the board";
  - Confirm stays disabled until every group has a choice;
  - Replace: a summary, an **Export first** button, and typing `REPLACE`;
  - a 409 shows Re-preview;
  - the result message.
- **Playwright:** `tests/regression/taproom/beer-board-import.spec.ts` for
  S20–S30.
  - `[TEST-TEMP]` names only, and clean up after each test.
  - **Replace (S25, S28) wipes the shared board.** Mark those tests serial
    and restore the board, or run them against a board you've emptied and
    refilled within the test. Say which you chose.

**Done means:**
- the API suite, `tsc`, `vite build` and the taproom Playwright folder all
  pass;
- lint adds no new errors; there are 26 already on `develop`;
- **Persist-verify:** drive S21–S23 and S25 in a browser as `barMgr`, using
  throwaway scripts in your scratchpad with
  `tests/.playwright-auth/barMgr.json`. Never read token files.
- Commit as `feat: D37 step 5 — CSV import and export`, then **stop**.
- **Reply with:**
  1. what you built;
  2. the test counts;
  3. any deviation from the spec, and why;
  4. open `LEAD:` questions.

Don't start step 6.

---

## Task 2: plan step 6, synthetic seed and COVERAGE.md

**Also read:** `d37_lead_decisions_1.md` (all four sections). Lint is waived for
D37. **Don't touch Brewery, Settings or `ComponentShowcase` files.**

Build plan step 6 ("Changes → Synthetic seed" and "Config and deps"):

**Seed (`lib/rockcut_api/seeds/synthetic.ex`):**
- **`[SEED]` board entries**, rebuilt by `setup/0`. Include:
  - an entry with 1 beer left;
  - a pair with the same For name (for an import duplicate group);
  - a few ordinary entries.

  Give the bought-by names the `[SEED]` tag, or tag them however the other `[SEED]` rows
  are tagged, so `reset/0`'s `delete_tagged` removes them.
- **Persona staff codes** for `bartender1`, `bartender2` and `barMgr`:
  - read `SYNTHETIC_STAFF_CODES` (`bartender1:1234,…` format), from the
    environment first and then from `.env.synthetic`, the way
    `Seeds.Credentials` reads `SEED_PASSWORD`;
  - **when it's unset,** skip setting codes and log one line saying so. Don't fail:
    DEV doesn't have the variable yet;
  - `setup/0` **restores** each persona's code to its listed value and clears
    codes on the other personas, so leftovers (like `bartender2`'s from step 4)
    go away;
  - validate the codes with the same rules as the API (4 digits, unique), and
    reject a bad list with a clear error.
- **`cleanup_temp/0`:** delete `beer_board_entries` whose For or Bought by starts
  with `[TEST-TEMP]`. Leave `beer_board_events` alone: they're history (plan).
- **ExUnit:** extend the synthetic seed tests to cover:
  - the entries;
  - codes set from the env;
  - codes skipped when it's unset;
  - leftover codes cleared;
  - `cleanup_temp` removing `[TEST-TEMP]` entries;
  - `setup/0` run twice giving the same result.

**Local env:**
- Add `SYNTHETIC_STAFF_CODES=…` to the gitignored `rockcut_api/.env.synthetic`.
  Pick three distinct codes.
- **Don't print the codes in your replies or commit them.** Treat them like
  `SEED_PASSWORD`.
- If any spec uses persona codes (none should; device specs make
  `[TEST-TEMP]` people), say so.
- Update `docs/process/test-credentials-policy.md` and `tests/RUNNING.md` where
  they list the synthetic secrets: name the new variable, but give no values.

**Local leftovers:** run `mix rockcut.synthetic.setup` and check:
- the step 4 walkthrough entries ("Pat W…", "Ana W…", not tagged) are gone;
- if `setup` doesn't remove them, delete just those entries by hand (through the
  API as `barMgr`, or `mix run`) and tell me which way you used;
- don't add a "delete everything untagged" rule to the seed.

**`tests/COVERAGE.md`:** add a D37 section in the same format, with S1–S31 → where
each is tested (ExUnit file and/or Playwright file). Mark any **GAP** or
**Manual** row honestly. Pixel keypad, Android CSV download, and real Excel or
Numbers export are DEV checks (plan LIMITATIONS).

**Done means:**
- the API suite, `tsc`, `vite build` and the taproom Playwright folder (which now
  runs the full main suite plus Replace) all pass;
- lint is still at 26 errors with none added;
- after `mix rockcut.synthetic.setup`, the board shows the `[SEED]` entries.

**Then:**
- commit as `feat: D37 step 6 — synthetic seed, staff codes, coverage`;
- **stop**;
- reply with: what you built, the test counts, the leftover check result,
  any GAP rows, and `LEAD:` questions.

Don't start step 7, and don't push.

---

## Task 3: plan step 7, the local gate and the handoff note

**Also read:** `d37_lead_decisions_2.md`, and `three_environment_workflow.md` §3
("Local gate" and "The handoff note"). Lint is waived (decisions 1 §3). Don't touch
Brewery, Settings or `ComponentShowcase` files.

**1. Run the whole gate on the final branch.** Run every item, even ones that passed
earlier, and record the HEAD SHA:
- `cd rockcut_api && MIX_ENV=test mix test`;
- `cd rockcut-ui && npx tsc --noEmit -p tsconfig.app.json && pnpm exec vite build && pnpm lint`.
  Lint is expected at 26 errors and 1 warning. Confirm none are in D37 files: list
  them by file.
- `cd rockcut-ui && npx playwright test`: the **whole** local suite, not just
  taproom. Run `mix rockcut.synthetic.setup` first and again afterwards.
- **Flakes:** a failure that passes on retry is still reported. Re-run that spec
  alone with `--repeat-each 5` and say whether it predates D37 (task 4064 is a known
  one).
- **Persist-verify, one final pass:** as throwaway scripts in your scratchpad,
  with the auth files, never reading tokens:
  - as `bartender1`: add, redeem, edit and delete;
  - on the tablet with a `[TEST-TEMP]` person's code: redeem;
  - as `barMgr`: import (Add mode) and both exports.

  Reload after each step and check the result is still there. Delete the
  scripts afterwards.
- No bug-fix revert check is needed. D37 is a feature, not a fix.

**2. Write the handoff note:** `docs/current_work/prompts/d37_handoff_note.md`, in
the D36 note's shape (`d36_handoff_note.md`):
- deliverable, spec and branch, plus the SHA to put on DEV (leave it as
  `<filled by lead at push>`, since the note's own commit changes it);
- **What changed:** grouped by area (staff codes, board, History, import/export,
  seed), with the scenarios and the tests that cover them;
- **Migrations:** list them, and say whether each is reversible. Check `down`
  actually works by rolling back and migrating forward on a **scratch copy** of
  the dev DB, never the real one;
- **New dependency** (`nimble_csv`) and the **new secrets:**
  - `STAFF_CODE_KEY`: the API refuses to boot without it;
  - `SYNTHETIC_STAFF_CODES`: DEV only, and optional.

  Give no values;
- **Personas and scenarios DEV must exercise;**
- **Local gate:** the results with counts and the date;
- **The lint waiver:** 26 errors already on `develop`, 0 from D37, Matt's waiver
  (2026-10-06), and task 4084;
- **⚠ LIMITATIONS:** the plan's list, plus decisions 2 §2 and §3. Add anything
  else local couldn't show.

**3. Commit** as `docs: D37 handoff note + local gate results`.

**Then stop. Don't push.** The lead pushes and opens the PR, once Matt says so.

**Reply with:**
- the gate results (counts, the lint file list, any flakes);
- the migration rollback result;
- anything the note flags as a risk;
- `LEAD:` questions.

## Task 4: DEV pass 1 fixes (QA gaps G1, G3, G4, G5, G9 + spec wording)

**Context:** the branch is pushed (PR #15) and on DEV at `b71174b`. The full Playwright
suite passed on DEV (175/175). The independent QA pass found the gaps below; read
`docs/current_work/stepwise_results/d37_dev_qa_report.md` for the paths and evidence.
Matt's decisions (2026-10-07): fix G1, G3, G4, G5 and G9 in D37, and fix the spec
wording for G2 and G8. G6 and G7 go to the backlog (the lead files them). Everything
in your limits above still applies, and so do Task 3's rules (lint waived; don't
touch Brewery, Settings or `ComponentShowcase`).

**One commit per item,** as `fix: D37 DEV pass 1 G<n> — <what>` (`docs:` for the spec).

### G1 (must-fix): a manager's save that removes someone from their department says "Forbidden"

- **Cause:** `rockcut-ui/src/pages/users/UserFormDialog.tsx` `save()`. Unless the person
  is being deactivated, it sends `PUT …/memberships` first and then `PATCH /api/users/:id`.
  When a non-owner manager removes the person from the manager's (only shared)
  department, the PATCH runs after they stopped managing that person, so it gets 403.
  The membership change landed, but the name/active/schedulable edits are lost and
  the dialog says "Forbidden".
- **This predates D37:** the order came from D35 (`112a715`), so it affects any
  department manager, not just the Taproom. The D35 comment explains why memberships
  go first: so that **removing the owner flag** only resets the calendar links the
  person doesn't keep. Only owners can send `is_owner`.
- **Fix:** keep the D35 order when the actor is an owner. When the actor isn't an owner,
  send the PATCH first, then the memberships (the PATCH carries no `is_owner`, so the
  D35 reason doesn't apply). Update the comment to say both. Don't change the API.
- **Staff code in the same save:** if the new memberships leave the person with no
  Taproom membership, don't send the staff-code PUT, even if a code was typed (the
  server clears the code on removal).
- **Tests:**
  - Playwright (a `[TEST-TEMP]` Taproom employee with a code): as `barMgr`, rename them
    **and** remove them from the Taproom in one save → the dialog closes, no error,
    the new name is saved, the membership is gone, `has_staff_code` is false.
  - The same shape for another department (as `breweryMgr` on a `[TEST-TEMP]` Brewery
    person) to cover the D35 regression outside the Taproom.
  - The existing D35 owner-flag ordering tests must still pass.

### G3: Users & Roles shows a staff code in clear text while it's typed

- `rockcut-ui/src/pages/users/StaffCodeSection.tsx`. A saved code reopens masked (right),
  but digits being typed for a new or changed code are plain text, with no eye toggle.
- **Fix:** the typed code is masked like the tablet field (same CSS approach), with the
  same eye toggle to show it, hidden again each time the dialog opens. Keep
  `inputMode="numeric"`. Revealing a **typed** code doesn't fetch anything or write
  `staff_code.reveal` (that's only for the saved code).
- **Test:** Playwright checks the field is masked while typing (computed style), and that
  the eye shows and hides it.

### G4: pasting a code with a space or dash keeps only 3 digits

- The tablet's code field (`BoardActionDialog.tsx` / `EntryDialog.tsx`, wherever the
  field lives) has `maxLength=4`, so the browser truncates the raw paste **before** the
  digit filter: `" 1234"`, `"12 34"`, `"12-34"` become 3 digits, fail as a wrong code
  and spend a lockout attempt.
- **Fix:** drop `maxLength` (or use a shared field component), and in `onChange` keep
  digits only, then cut to 4. Do the same in `StaffCodeSection.tsx`. Share one helper
  (`src/lib/staffCode.ts`) if that's simpler.
- **Test:** Playwright fills/pastes `" 1234"`, `"12-34"` and `"123456"` → the field holds
  `1234` each time. Use `fill` or a dispatched paste; don't submit (no limiter spend).

### G5: an extra column refuses the whole import (Matt: ignore it and say so)

- `rockcut_api/lib/rockcut_api/beer_board/csv.ex` `map_header/1` turns any unknown header
  into a row-1 error. Hand-kept sheets often have a `Notes` column.
- **Fix:** ignore unknown columns. The preview response lists them (for example
  `ignored_columns: ["Notes"]`), and the import dialog's preview shows one line such as
  "Ignored columns: Notes". Missing required columns and repeated columns stay errors.
  The import (apply) step works on the previewed rows, so it needs no change; check it.
- **Spec:** update §3.6's file format with one bullet: "Other columns are ignored; the
  preview lists them."
- **Tests:** update `beer_board_csv_test.exs:91` (it asserts the old error). Add an ExUnit
  case (Notes + an unknown column in the middle → rows parse, both listed), and a
  Playwright check that the preview shows the ignored-columns line and the import applies.

### G9: after "Only N left" the Redeem dialog keeps the old count

- `rockcut-ui/src/pages/taproom/RedeemDialog.tsx`. After a 422 "Only N left", the dialog
  still says "· 5 left", keeps the stepper at 5 and keeps the "last 5 beers … removes the
  entry" wording.
- **Fix:** on that error, refresh the board, then update the dialog from the fresh entry:
  the header count, the stepper's max (clamp the current value to it), and the
  last-beer wording. Keep the inline "Only N left" message. If the entry has gone, show
  the existing "This entry was already removed" handling.
- **Test:** Playwright with two contexts (or one context plus an API redeem): open
  Redeem at 5, another redeem takes 2, press Redeem → "Only 3 left", the header shows
  3, the stepper is at most 3, nothing changed.

### Spec wording (no code): G2 and G8

- **G2:** the 5th wrong code is the one that locks, which matches "5 wrong codes within
  10 minutes locks". Reword **S9**: attempts 1–4 show the inline error; the 5th shows
  "Too many wrong codes. Try again in N minutes, or use Sign in as me."; later attempts,
  even with a valid code, stay locked. Nothing changes.
- **G8:** the History tab shows **Added** / Redeemed / Edited / Deleted (with "(import)");
  the API and CSV keep `created` / `redeemed` / `edited` / `deleted`. Say so in §3.5's
  History tab, and change the History text in S6, S7, S19, S22 and S23 to the UI labels.
- One `docs:` commit for both.

### Then

1. **Coverage:** add the new tests to `rockcut-ui/tests/COVERAGE.md` (as "DEV pass 1").
2. **Local gate again, in full,** as in Task 3 step 1: API tests, `tsc` + `vite build`,
   lint (still 26 errors + 1 warning, none in files you changed), the **whole**
   Playwright suite (run setup before and after), and a short persist-verify of each fix
   (G1 as `barMgr`, G5 with a Notes column, G9 with two sessions).
3. **Handoff note:** add a "DEV pass 1 fixes" section to `d37_handoff_note.md` (each gap,
   the fix, the test), and set "SHA for DEV" back to `<filled by lead at push>`. Commit
   as `docs: D37 handoff note — DEV pass 1 fixes`.

**Then stop. Don't push.** **Reply with:** the commits, the gate results (counts, lint
file list, any flakes), anything you changed beyond this brief and why, and `LEAD:`
questions.
