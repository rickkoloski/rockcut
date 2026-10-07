# Session Handoff — 2026-10-05 (b)

Follows `SESSION_HANDOFF_2026-10-05.md` (D36 released, nothing in progress).

This session:
- set up a Herdr workspace for Matt;
- specced D37 with him: the Buy-a-Beer Board plus staff codes;
- built steps 1–4 of the plan's 7.

**D37 is in progress on `d37-buy-a-beer-board`. It's local only, not pushed,
and there's no PR yet.**

## Where things are

| | State |
|---|---|
| **Prod** | Unchanged: `v2026.10.05` (D36), API v23 / UI v19. |
| **DEV** | Free; it runs `develop` `0207fcd`. D37 hasn't been near DEV. |
| **Branch** | `d37-buy-a-beer-board`, cut from `develop` (`ade4433`). There are 10 commits, listed below. **Not pushed**, and there's no upstream. |
| **Task** | PortableMind **4083** (project 254), "D37: Buy-a-Beer Board + staff codes". Its status in PortableMind is still "Not Started" (not updated this session). |
| **Spec** | `docs/current_work/specs/d37_buy_a_beer_board_spec.md`. **Approved** by Matt; Q1–Q8 answered; S1–S31. |
| **Plan** | `docs/current_work/planning/d37_buy_a_beer_board_plan.md`. "Order of work" has steps 1–7. |
| **Local servers** | Running in the Herdr `rockcut` workspace, **build** tab: API in pane `w1:p2` (:4002), UI in `w1:p3` (:5174). The local dev DB is migrated through `20261006120002`. |
| **Herdr** | Updated to 0.9.3. Rick's config (#4060) is restored in `~/.config/herdr/config.toml`. Workspace `rockcut`: tab **build** (`builder` Claude in `~/src` + 2 server panes) and tab **ops** (shell in `~/src/rockcut`). Default layout documented in `~/.config/herdr/rockcut-workflow.md` (local only, never commit). |

### Commits on the branch (oldest first)

| SHA | What |
|---|---|
| `569365b` | spec (approved) |
| `dc9cf62` | plan; spec linked to 4083 |
| `a906535` | CLAUDE.md points at D37 |
| `8c7609c`, `58adce6` | spec/plan: staff code visible in the user **edit dialog only**, masked with an eye toggle, no list column (Matt) |
| `9f76f7d` | **step 1:** staff codes (storage, `Authz`, wrong-code limiter) |
| `3750a14` | **step 2:** staff codes in the Users & Roles edit dialog |
| `d18aaae` | **step 3:** board API (entries, change log, tablet writes) |
| `93c402c` | **step 4:** board page (board, tablet staff code, History) |

## Decisions this session (Matt)

These are all in the spec's §2 / §6. In short:
- **Fields:**
  - For, Bought by, Beers;
  - the moved-off date, which is set automatically when the entry is saved;
  - `imported_at`, set only by an import. An import file may carry the
    moved-off date, and it defaults to the import date.
- **Count reaches 0:** the entry is **deleted**. History keeps it.
- **Who does what:**
  - any Taproom staff member can add, redeem, edit and delete;
  - **History, import and export** are for owners and Taproom managers only.
- **Staff codes:**
  - 4 digits, **typed in by owners and Taproom managers** (with a Suggest
    button);
  - visible only in the user **edit dialog**, masked behind an eye toggle;
  - "<name> **on Shared Device**" in History when a change comes from the
    tablet with a code; just the name when signed in directly, including
    "Sign in as me".
- **Lockout:** 5 wrong codes in 10 minutes locks that tablet for 10 minutes.
- **Import duplicates:**
  - matched on the **For name only**;
  - per group the manager chooses **Allow**, **Combine** (sum the beers;
    Bought by is joined as "Chris & Lee" in an editable field, ≤ 80
    characters) or **Pick which remain** (an unchecked board entry is
    deleted).
- **CSV** is the format.

## Built (steps 1–4)

**API:**
- `RockcutApi.StaffCodes`:
  - each code is stored as an HMAC digest (unique, used for lookup) plus an
    AES-256-GCM copy (`STAFF_CODE_KEY`, with the user id as associated data);
  - codes are cleared on deactivation and when someone leaves the Taproom
    (inside the `Accounts` transactions).
- `StaffCodes.RateLimiter` (GenServer, per device token).
- `RockcutApi.BeerBoard`:
  - entries plus append-only `beer_board_events` (names snapshotted, no FK
    to the entry);
  - redeem is one conditional UPDATE.
- **Routes:**
  - `BeerBoardController` (`:device_allowed` + new `:taproom` pipeline): a
    device write needs a `staff_code`;
  - `BeerBoardAdminController` (people only): `GET /api/beer_board/history`;
  - `StaffCodeController`: `GET`/`PUT`/`DELETE /api/users/:id/staff_code`
    and `GET /api/staff_codes/suggest`.
- **`/api/me`:** new **top-level** flags `staff_codes` and
  `beer_board_manage`. They're not in `capabilities`, because the D31
  parity suite pins its keys.
- **`Authz`:**
  - `can_hold_staff_code?/1`;
  - `:set_staff_code` / `:reveal_staff_code`;
  - `:beer_board` `:read`/`:write` (Taproom member) and
    `:history`/`:import`/`:export` (Taproom manager);
  - `Authz.Device`: a Taproom tablet may `:read` `:beer_board`, nothing more.
- **Route matrix:** it has a new class, `@device_with_code` (board writes →
  422 `staff_code_required` without a code).

**UI:**
- `pages/users/StaffCodeSection.tsx` (in `UserFormDialog`).
- `pages/taproom/`:
  - `BeerBoard`, `BeerBoardHistory`;
  - `BoardActionDialog` (the shared frame, with the staff-code field on a
    device);
  - `EntryDialog`, `RedeemDialog`, `DeleteEntryDialog`.
- `lib/beerBoard.ts`, `lib/staffCode.ts`.
- Nav: Taproom → Buy-a-Beer Board.

**Tests (all green at `93c402c`):**
- API: 946 (`MIX_ENV=test mix test`).
- Playwright `tests/regression/taproom/`:
  - `staff-codes.spec.ts`, `beer-board-staff.spec.ts`,
    `beer-board-device.spec.ts` (20 tests);
  - the devices, app and smoke folders still pass (64).

## Next: step 5 (import/export), then 6 and 7

**Step 5: CSV import and export** (spec §3.6, plan "Import"):
- Add `{:nimble_csv, "~> 1.2"}`.
- `BeerBoard.Csv`:
  - parse: BOM, CRLF, header aliases (`Date added`), `Imported` ignored,
    1 MB / 1,000-row limits;
  - write: formula guard, a leading `'`.
- `BeerBoard.Import.plan/3`, which is pure. Groups use the For name only. In
  Replace mode, only rows within the file are grouped.
- `apply/5`:
  - one transaction;
  - re-plans inside it and compares the group signature → 409;
  - writes events with `detail.source = "import"`;
  - Combine keeps the earliest board entry and its `imported_at`;
  - audits `beer_board.import`.
- Routes go in the **people-only** board scope
  (`BeerBoardAdminController`):
  - `GET /api/beer_board/export.csv`;
  - `GET /api/beer_board/history/export.csv`;
  - `POST /api/beer_board/import/preview` (multipart);
  - `POST /api/beer_board/import`.

  Add each to the route matrix's `@denied` list.
- **UI:**
  - `BeerBoardImportDialog`: upload → preview (errors | New | group cards
    with Allow / Combine / Pick) → confirm, with the `REPLACE` gate in
    Replace mode and Re-preview on a 409;
  - Export buttons, using a fetch + Blob download helper in `api.ts`.
- **Fixtures** go in `rockcut_api/test/fixtures/beer_board/`.
- **Scenarios:** S20–S30.
- **Split option:** if the gate drags, step 5 can become D38 (plan, Risks).

**Step 6:**
- **Synthetic seed:**
  - `[SEED]` board entries: one with 1 left, plus a For-name pair;
  - persona codes for `bartender1`, `bartender2` and `barMgr`, from a new
    `SYNTHETIC_STAFF_CODES` in `.env.synthetic` (also needed in DEV's
    secret source);
  - `[TEST-TEMP]` cleanup of `beer_board_entries`.
- `tests/COVERAGE.md` rows for D37.

**Step 7, the local gate (workflow §3):**
- the full API suite;
- `tsc` + `vite build` + **lint** (see gotchas);
- the full local Playwright suite;
- persist-verify;
- push, then a PR to `develop` with the handoff note. Its LIMITATIONS are
  in the plan.
- **Before the DEV deploy,** `STAFF_CODE_KEY` must be set on
  `rockcut-api-dev`, or the API won't boot. That's an outward-facing step:
  ask Matt first.

## Gotchas (new this session)

- **`pnpm lint` already fails on `develop`** with 26 errors (mostly
  `react-hooks/set-state-in-effect` in old Brewery/Settings dialogs). D37
  adds none. The workflow's local gate wants lint green, so before step 7
  either fix them in a separate commit or get Matt's waiver recorded in the
  PR.
- **The D31 parity suite pins the `capabilities` keys.** Put new UI flags at
  the top level of `/api/me` (`JSONHelpers.me/3` takes a flags map).
- **The users grid shows 100 rows per page.** Locally there are about 180
  users, mostly `[TEST-TEMP]` leftovers. `staff-codes.spec.ts`'s `openUser`
  pages through the grid. Reuse it.
- **Nav items are buttons, not links.** In Playwright use
  `getByRole('button', { name: 'Taproom' })`, then
  `getByRole('button', { name: 'Buy-a-Beer Board' })`.
- **The D31 boundary test** fails any `kind:` / `member_of?(` / `role_in(`
  read outside `Authz`. Put such rules in `Authz` (as done for
  `can_hold_staff_code?/1`).
- **Lint rule:** avoid resetting dialog state in a `useEffect`. Remount the
  dialog with a `key` and initialize from props (see `EntryDialog`,
  `RedeemDialog`).
- **Staff-code input on the tablet** is `type="text"` +
  `-webkit-text-security: disc` + `inputMode="numeric"`. A password field
  can bring up a full keyboard on Android. The keypad is still unverified on
  the Pixel (a LIMITATION for DEV).
- **`herdr update` refuses to run inside Herdr.** Detach (`ctrl+b` `q`), run
  `herdr update --handoff`, then reattach.
- **Local leftovers:**
  - a few non-`[TEST-TEMP]` board entries ("Pat W…", "Ana W…") from the
    step 4 walkthrough;
  - `bartender2` has a staff code.

  Step 6's reseed (`mix rockcut.synthetic.setup`) should clean these up.
  Check that it does.
- **Playwright walkthroughs** run as throwaway scripts in the scratchpad,
  copied into `rockcut-ui` to run, using
  `tests/.playwright-auth/<persona>.json` (`npx playwright test
  --project=setup` mints them). Tokens never enter the context.
