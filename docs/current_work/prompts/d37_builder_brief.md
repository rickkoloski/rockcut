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
