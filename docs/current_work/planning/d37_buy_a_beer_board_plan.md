# D37: Buy-a-Beer Board + Staff Codes — Plan

**Spec:** `specs/d37_buy_a_beer_board_spec.md` (approved 2026-10-05)
**Branch:** `d37-buy-a-beer-board`
**Task:** PortableMind 4083

## Approach

The work comes in three layers. Each builds on the one before and lands as
its own commit:

1. **Staff codes:** a `StaffCodes` context on `users`. It's independent of
   the board and usable by later tablet features.
2. **The board:** a `BeerBoard` context with entries and an append-only event
   log, routes, `Authz` and `Authz.Device` rules, and the page.
3. **Import and export:** CSV on top of the board context, with the
   preview/confirm flow and duplicate groups.

**How a device write works:**
- Board routes live in the router's **`:device_allowed`** scope plus a new
  `:taproom` pipeline (`ModuleAccessPlug, module: :bar`). The Taproom device
  already passes the module check (`Authz.Device` grants its home module), so
  the plug needs no device special-case.
- The controller resolves the **acting person** with one helper,
  `BeerBoardController.actor/2`:
  - a person → `{person, nil}`;
  - a device → it reads `staff_code`, rate-limits by device token, looks up
    the code, and returns `{person, device}`, or 422.
- From there every decision is `Authz.can?(person, action, resource)`, and
  every event row records `actor_id` = person and `device_id` = device.
  - The device's own `Authz.Device` grant is **read-only**.
  - A manager's code can't reach history, import or export, because those
    routes are in the people-only `:authenticated` scope (DeviceGate). The
    restriction doesn't depend on `Authz` being right.

**Staff code storage:**
- **Lookup:** `staff_code_digest` = `Tokens.hash(code)`, the existing
  HMAC-SHA256 keyed by `secret_key_base`, with a unique index.
- **Display:** `staff_code_encrypted` = AES-256-GCM (`:crypto.crypto_one_time_aead`)
  with `STAFF_CODE_KEY`, a random 12-byte IV per value, and the user id as
  AAD. Using the user id means a ciphertext can't be pasted onto another
  user's row.
- **Errors:** if `STAFF_CODE_KEY` is missing in prod, boot fails with a
  clear message (`runtime.exs`). Dev and test use a fixed key from config.

**Atomic redeem:** `Repo.update_all` with
`where: e.id == ^id and e.beers_remaining >= ^n` and `inc: [beers_remaining: -n]`.
- 0 rows affected → re-read: the entry is gone (404) or there's "Only N left"
  (422).
- 1 row affected → re-read. If the count is 0, delete the entry and log
  `redeemed` with `beers_after` 0.

All of it, with the event insert, runs in one `Repo.transaction`. SQLite runs
with a single connection (D32 G1), so the transaction is the
serialization point.

**Import:** preview and confirm both call one pure function,
`BeerBoard.Import.plan(rows, board_entries, mode)`. It returns `{new_rows,
groups, errors}`.
- Confirm sends the parsed rows (not the file) and the resolutions. The
  server re-parses nothing.
- Confirm re-runs `plan/3` against the board **inside the transaction** and
  compares a **group signature** (sorted normalized For names, plus the
  board entry ids and counts in each group) with the one the preview
  returned. A mismatch → 409.
- The Replace check also signs the full board (ids + counts), so any change
  since the preview → 409.

## Changes

### API (`rockcut_api`)

**Migrations (3, additive):**
1. `users`: `staff_code_digest` (binary, unique index where not null),
   `staff_code_encrypted` (binary), `staff_code_set_at` (utc_datetime).
2. `beer_board_entries`: `recipient_name`, `purchaser_name`,
   `beers_remaining`, `moved_off_board_at`, `imported_at` (null), and
   `created_by_id` (FK users, `on_delete: :nilify_all`). Timestamps. Index on
   `lower(recipient_name)`.
3. `beer_board_events`: `entry_id` (integer, no FK), `action`, `actor_id`
   (FK), `device_id` (FK, null), `recipient_name`, `purchaser_name`,
   `beers_before`, `beers_after`, `detail` (map), `inserted_at`. Index on
   `inserted_at`.

**`RockcutApi.StaffCodes`** (new):
- `set(target, code, actor)`:
  - validates `^\d{4}$` and checks that the target is eligible;
  - checks `Authz.can?(actor, :set_staff_code, target)`;
  - a unique-constraint error → `{:error, :code_in_use}`;
  - audits `staff_code.set`.
- `remove(target, actor)`: audits `staff_code.remove`.
- `suggest()`: a random unused code. It retries on a hit; at most about 20
  members exist, so collisions are rare.
- `reveal(actor)`: `%{user_id => code}` for the people the actor may see.
  Decrypts and audits `staff_code.reveal` once.
- `reveal_one(target, actor)`: one code, for the dialog. Audits
  `staff_code.reveal`.
- `resolve(code)`: an active Taproom member, or `nil`.
- `clear_if_ineligible(user_id)`: called inside the existing transactions
  of `Accounts.update_user` (deactivation) and `Accounts.set_memberships`
  (lost `bar`). It sits next to the D35 `rotate_lost_feeds` call.
- `eligible?(user)`: active, not a device, and `Authz.member_of?(user,
  "bar")`. An owner without a Taproom membership doesn't get a code. They
  can use Sign in as me on the tablet.

**`RockcutApi.StaffCodes.RateLimiter`** (new):
- It follows `PairingRateLimiter`: an ETS table, fixed 10-minute windows,
  sweeping.
- Keyed by **device token id**, limit 5, with no global bucket.
- A request already locked is refused **before** the code is checked, so a
  correct code during the lock also fails. That's the "locked" behavior in
  S9.
- Add it to `application.ex`. Raise the limit in `config/dev.exs` for local
  Playwright reruns, as pairing does.

**`RockcutApi.BeerBoard`** (new) + schemas `Entry` and `Event`:
- `list_entries/0`
- `create(attrs, actor, device)`
- `redeem(id, n, actor, device)`
- `update(id, attrs, actor, device)`
- `delete(id, actor, device)`
- `list_events(q, page)`
- `normalize_name/1`: trim, collapse whitespace, downcase. Used by search and
  duplicate matching.

**`RockcutApi.BeerBoard.Csv`** (new; `NimbleCSV.RFC4180`):
- `parse(binary)`:
  - strips the BOM and handles CRLF;
  - maps headers (aliases `Date added` → moved-off; `Imported` ignored);
  - enforces the 1 MB / 1,000-row limits;
  - returns `{:ok, rows}` or `{:error, [row_errors]}`;
  - strips one leading `'` before `= + - @ \t \r`.
- `entries_csv/1` and `events_csv/1` apply the same formula guard when
  writing.

**`RockcutApi.BeerBoard.Import`** (new):
- `plan/3` (pure);
- `apply(mode, rows, resolutions, signature, actor)`: one transaction. It
  writes the events with `detail.source = "import"` and `imported_at`, and
  audits `beer_board.import`.
- **Combine:**
  - sums the counts and validates ≤ 99;
  - joins the distinct purchasers, earliest first; the client may send an
    edited value, validated ≤ 80;
  - takes the earliest moved-off date;
  - keeps the earliest board entry and its `imported_at`, and deletes the
    other board entries with `combined_into`.

**`Authz`** (all decisions here; `authz_boundary_test` enforces it):
- `can?(user, action, :beer_board)` for `:read`, `:write` → `member_of?(user, "bar")`.
  Owners are allowed by the existing owner clause.
- `can?(user, action, :beer_board)` for `:history`, `:import`, `:export` →
  `role_in(user, "bar") in [:owner, :manager]`.
- `can?(user, :set_staff_code, %User{} = target)` and `:reveal_staff_codes` →
  the actor is an owner or a Taproom manager, and the target is eligible.
- **`Authz.Device`:** `can?(device, :read, :beer_board)` when
  `home_key(device) == "bar"`. Nothing else, so the catch-all denies writes.
  Pin it in `authz_device_test.exs`.

**Controllers and router:**
- **`BeerBoardController`** (`:device_allowed` + `:taproom`):
  - `index`, `create`, `redeem`, `update`, `delete`;
  - `actor/2` as above;
  - a wrong code → `count_attempt`, 422 `staff_code_invalid`;
  - locked → 429 with `retry_after_minutes`.
- **`BeerBoardAdminController`** (`:authenticated` + `:taproom`):
  - `history`, `history_csv`, `export_csv`, `import_preview` (multipart),
    `import`.
- **`StaffCodeController`** (`:authenticated`):
  - `GET /staff_codes`;
  - `GET /staff_codes/suggest`;
  - `GET /users/:id/staff_code` (one code, for the dialog);
  - `PUT` / `DELETE /users/:id/staff_code`.
- **`device_route_matrix_test.exs`:** classify every new route.
- **`MeController` capabilities:** add `beer_board_manage: boolean` (history,
  import and export) and `staff_codes_manage: boolean`, so the UI doesn't
  re-derive roles.

**Config and deps:**
- `{:nimble_csv, "~> 1.2"}`;
- `STAFF_CODE_KEY` read in `runtime.exs` (prod), with a fixed test/dev key
  in `config/dev.exs` and `config/test.exs`;
- `.env.synthetic`: add `SYNTHETIC_STAFF_CODES=bartender1:…,bartender2:…,barMgr:…`.

**Synthetic seed (`seeds/synthetic.ex`):**
- `[SEED]` entries, including a one-beer entry and a For-name pair;
- staff codes from the env;
- `[TEST-TEMP]` cleanup covers `beer_board_entries`. Events are left alone:
  they're history, and harmless on DEV.

### UI (`rockcut-ui`)

- **`DEPT_META.bar.children`:** add "Buy-a-Beer Board" → `/taproom/beer-board`.
- **Routes:** add to both the device block (`App.tsx:630`) and the person
  block, gated on `capabilities.modules` including `bar`.
- **`src/pages/taproom/BeerBoard.tsx`:**
  - tabs Board | History (History only with `beer_board_manage`);
  - the grid follows the vendored DataGrid pattern, with client-side sort
    and one search box over both names;
  - row actions: Redeem (with a stepper), Edit, Delete.
- **`BeerBoardEntryDialog.tsx`** (add/edit) and **`RedeemDialog.tsx`**, both
  built on `FormDialog`.
  - On a device, they render `StaffCodeField`:
    - masked, `inputMode="numeric"`, `maxLength=4`;
    - an inline error for `staff_code_invalid`;
    - a lock message for 429.
- **`BeerBoardHistory.tsx`:** a paged server query, "<name> on Shared
  Device", and Export CSV.
- **`BeerBoardImportDialog.tsx`:**
  - steps: upload → preview (errors | New | group cards) → confirm;
  - a group card has the radio choices Allow / Combine / Pick:
    - Combine shows an editable Bought by and is disabled over 99;
    - Pick shows a checkbox per item and the delete warning;
  - Replace mode shows a summary, an Export first button and a `REPLACE`
    text gate;
  - a 409 → "The board changed since your preview", with a Re-preview
    button.
- **CSV downloads:** `api.ts` gains a `download(path, filename)` that
  fetches with the bearer header and saves a Blob. A plain link can't carry
  the token.
- **`UserManagement.tsx`:**
  - a Staff code column and a Show codes toggle, both shown only with
    `staff_codes_manage`;
  - the toggle state isn't persisted, and turning it on fetches
    `/api/staff_codes`.
- **`UserFormDialog.tsx`:** a Staff code section for eligible users, with
  Suggest, Save and Remove.
  - An existing code is shown masked, with an eye toggle that fetches
    `GET /api/users/:id/staff_code`.
  - It's hidden again each time the dialog opens.
- **`lib/types.ts`:** `BeerBoardEntry`, `BeerBoardEvent`, `ImportPreview`,
  and the new capabilities.

### Tests

**ExUnit:**
- `staff_codes_test.exs`:
  - set, remove and reveal, with their audits;
  - uniqueness;
  - eligibility;
  - clearing on deactivation and on losing `bar`;
  - encryption round trip, and that the AAD binds to the user.
- `staff_code_rate_limiter_test.exs`: 5 wrong → locked; a correct code while
  locked → still refused; per-device isolation; sweep.
- `beer_board_test.exs`:
  - create, redeem, update and delete, each with its event row;
  - redeem to 0 deletes the entry;
  - over-redeem → 422;
  - a concurrent last redeem (two `Task`s) → exactly one succeeds;
  - validation limits.
- `beer_board_csv_test.exs`: every fixture; a formula-guard round trip;
  header aliases; size and row limits.
- `beer_board_import_test.exs`:
  - `plan/3` groups in add and replace modes;
  - Allow, Combine (purchaser join, the 99 cap, keeping `imported_at`) and
    Pick (deleting board entries);
  - signature mismatch → 409;
  - default dates;
  - all-or-nothing on a failing row.
- Controller tests:
  - a device with and without a code;
  - a manager's code on admin routes → 403;
  - other departments → 403;
  - the route matrix;
  - `authz_device_test` pins.

**Playwright** (`tests/regression/taproom/`, one file per scenario group):
- `beer-board-staff.spec.ts`: S5, S14, S15, S17–S19, S31.
- `beer-board-device.spec.ts`: S7–S11, S13. Uses the device storageState
  and codes from env.
- `beer-board-import.spec.ts`: S20–S30.
- `staff-codes.spec.ts`: S1–S4, S12, S16.
- Update `tests/COVERAGE.md`.

**Rules:**
- Persist-verify every write (act, reload, assert).
- `data-testid` on every new control.
- No `waitForTimeout`.

## Order of work

1. Migrations + `StaffCodes` + rate limiter + `Authz` rules + ExUnit.
2. `StaffCodeController` + the Users & Roles UI. Drive S1–S4 in a browser.
3. `BeerBoard` context + controllers + router + ExUnit.
4. The board page + device code field. Drive S5–S19 as the personas, then
   write the Playwright specs.
5. CSV + import (context, controller, UI). Drive S20–S30, then write the
   specs.
6. Synthetic seed + `.env.synthetic` + COVERAGE.md.
7. Local gate (workflow §3), then a PR to `develop` with the handoff note.

## Handoff-note LIMITATIONS to carry to DEV

- **`STAFF_CODE_KEY` must be set on `rockcut-api-dev`** before the deploy, or
  boot fails. That failure is intended; DEV is the first place it's checked.
- **The tablet's code entry** is untested on the Samsung keyboard locally.
  Check on the Pixel that the numeric keypad appears.
- **The rate limiter is per machine.** That's fine while there's one machine
  per app (D28).
- **CSV downloads** go through a fetch + Blob. Check the Chrome PWA on
  Android saves the file, which a desktop check can't show.
- **The Excel-saved fixture** was made by hand (BOM + CRLF). Check a real
  Excel or Numbers export once on DEV.

## Risks

- **Scope:** this is the largest deliverable since D33. If the gate drags,
  import/export (step 5) can split out as D38 without touching steps 1–4.
- **Losing `STAFF_CODE_KEY`** makes the stored codes unreadable. Lookups
  still work, because the digest uses `secret_key_base`. The recovery is to
  re-enter codes. Keep the key in the same place as the other prod secrets.
- **Rotating `secret_key_base`** breaks code lookups, as it already breaks
  `ses_` and `dev_` tokens. The recovery is to re-save each code.
- **The duplicate rule (For name only)** may raise more groups than
  expected on a big first import. That's intended (Q7), and the cards are
  quick to resolve.
