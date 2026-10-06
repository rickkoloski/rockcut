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
