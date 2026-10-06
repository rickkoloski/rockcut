# D37: Buy-a-Beer Board + Staff Codes — Specification

**Status:** Approved (Matt, 2026-10-05; Q1–Q8 answered)
**Created:** 2026-10-05
**Author:** Matt + CC
**Depends On:** D33 (shared devices, `Authz.Device`), D31 (every authorization decision goes through `Authz`), D30 (synthetic personas, DEV)
**Process:** `docs/process/three_environment_workflow.md` (spec with persona scenarios → local gate → DEV gate → release)
**Backlog:** PortableMind project 254, task 4083
**Branch:** `d37-buy-a-beer-board`, cut from `develop`

---

## 1. Problem Statement

The taproom has a chalkboard of pre-purchased beers. It works like a public
gift card. Each line says:
- who the beers are **for**;
- who **bought** them;
- **how many** beers are left.

When the chalkboard fills up, staff erase lines to make room, and today those
lines are lost. D37 gives the Taproom a page where an erased line is
recorded and then redeemed beer by beer. Every change is logged with who made
it and when.

Most changes happen at the bar tablet, which is signed in as the shared
device (D33). A change made there would otherwise be logged as the device.
D33 deferred a staff PIN "to the first editable component" (D33 §5), and
this is that component. Each Taproom staff member gets a short **staff
code**. Typing it on the tablet attributes the change to them without a full
"Sign in as me".

## 2. Decisions (Matt, 2026-10-05)

- **Fields:**
  - recipient ("for");
  - purchaser ("bought by");
  - number of beers;
  - date the line was moved off the chalkboard and added here.

  Nothing else. The change log records who changed what and when.
- **Moved-off date = the moment the entry is saved.** It's recorded
  automatically, not typed.
- **Import date (Matt, 2026-10-05):**
  - an entry created by an import records the date of that import in its own
    field, `imported_at`;
  - an import file may give the moved-off ("date added") date separately;
    when it doesn't, it defaults to the import date;
  - entries added by hand have no import date.
- **Count reaches 0 → the entry is deleted.** The change log keeps its
  history.
- **Any Taproom staff member** can add entries, redeem beers and correct
  mistakes (edit names, raise or lower a count, delete an entry).
- **Sortable and searchable** by recipient or purchaser.
- **Staff codes (Q1, Q2):**
  - owners and Taproom managers **type in** each person's 4-digit code;
  - the codes are listed in Admin → Users & Roles, **hidden by default**,
    with a toggle to show them.
- **Attribution (Q3):** signed in directly, including "Sign in as me" on a
  tablet, the log shows just the person's name. A change made on the shared
  device with a code shows "<name> **on Shared Device**".
- **Limits (Q4):** 1–99 beers per entry, names up to 80 characters. 5 wrong
  codes in 10 minutes locks code entry on that tablet for 10 minutes.
- **History is for owners and Taproom managers only (Q5).**
- **Import and export (Q6):** CSV, **owners and Taproom managers only**.
  Import either replaces the board or adds to it.
- **Duplicates (Q7):** a match on the **For** name alone. For each duplicate
  group the person chooses one of:
  - **Allow** the duplicates;
  - **Combine** them (add the beer counts together);
  - **Pick** which ones remain and delete the rest.

## 3. Requirements

### 3.1 Data

**`beer_board_entries`**

| Column | Notes |
|---|---|
| `recipient_name` | string, required, trimmed, 1–80 characters |
| `purchaser_name` | string, required, trimmed, 1–80 characters |
| `beers_remaining` | integer, required, 1–99 |
| `moved_off_board_at` | utc_datetime, the "date added": set by the server on create, or taken from an import file and defaulting to the import time (§3.6). Never edited. |
| `imported_at` | utc_datetime, null unless an import created the entry; then the time of that import. Never taken from a file, never edited. |
| `created_by_id` | the person who recorded it (never the device) |
| timestamps | |

Names are free text: recipients and purchasers are customers, not app users.

**`beer_board_events`** (the change log, append-only)

| Column | Notes |
|---|---|
| `entry_id` | integer, **no foreign key**: the entry may be deleted later |
| `action` | `created`, `redeemed`, `edited`, `deleted`. `detail.source` is `"import"` when an import made the change. |
| `actor_id` | the **person** who made the change, FK to `users` |
| `device_id` | the shared device it was made from, or null; FK to `users` |
| `recipient_name`, `purchaser_name` | a snapshot after the change, so history reads correctly after a delete |
| `beers_before`, `beers_after` | integers; `beers_after` is 0 for a full redemption or a delete |
| `detail` | map: for `edited`, the old and new names; for an import, `combined_from` ids |
| `inserted_at` | |

**`users`** (new columns)
- `staff_code_digest`: an HMAC of the code with a server secret (the `ses_`
  token pattern). It has a unique index, so a code is unique and a tablet
  lookup is one indexed query.
- `staff_code_encrypted`: the code encrypted with AES-256-GCM (OTP
  `:crypto`, no new dependency). This is what lets managers see codes in
  Users & Roles (Q2).
  - The key comes from a new secret, `STAFF_CODE_KEY`: a Fly secret on DEV
    and prod, and from `.env` locally.
  - Without the key, the database alone doesn't reveal codes.
- `staff_code_set_at`.

### 3.2 Staff codes

- **Setting a code:**
  - Users & Roles → edit person → **Staff code**: a 4-digit field
    (`0000`–`9999`, numeric keypad).
  - **Suggest** fills in a random code that isn't in use. Save stores it.
  - A code already in use is refused with "That code is already in use".
    Telling a manager that is fine, because the same manager can see every
    code anyway.
  - Changing a code makes the old one stop working immediately. **Remove**
    clears it.
- **Listing codes:**
  - The Users & Roles grid gets a **Staff code** column. It shows `••••`, or
    "—" when the person has no code.
  - A **Show codes** toggle in the grid toolbar reveals them. It's **off
    each time the page loads**.
  - The plain codes are only fetched when the toggle is turned on, from
    their own endpoint, so they're never in the normal users payload.
  - Turning it on writes one `audit_log` entry (`staff_code.reveal`).
- **Who sees and sets codes:**
  - owners, for everyone with a Taproom membership;
  - Taproom managers, for Taproom members.

  Nobody else sees the column, the toggle or the edit section.
- **Who can have one:** active people with a Taproom membership. The server
  clears the code when the person is:
  - deactivated;
  - removed from the Taproom.
- **What a code does:** it identifies the person **for this one request from
  a shared device**. It isn't a sign-in: it gives no token or session and
  opens no other page. Only actions that allow a code accept one (in D37,
  the board's add, redeem, edit and delete).
- **Wrong codes:** rate-limited **per device token**.
  - 5 wrong codes within 10 minutes locks code entry on that tablet for 10
    minutes.
  - While locked, the tablet shows "Too many wrong codes. Try again in N
    minutes, or use Sign in as me."
  - Same pattern as D33 pairing (`PairingRateLimiter`).
- **Audit:** `staff_code.set`, `staff_code.remove` and `staff_code.reveal`
  go to `audit_log` (actor → target). The code itself is never logged.

### 3.3 Who can do what (`Authz`)

| | Taproom employee | Taproom manager / owner | Shared device (Taproom) | Anyone else |
|---|---|---|---|---|
| View board, search, sort | ✓ | ✓ | ✓ | 403 |
| Add, redeem, edit, delete | ✓ | ✓ | ✓ **with a staff code** | 403 |
| History (view, export) | — | ✓ | — | 403 |
| Export board, import | — | ✓ | — | 403 |
| See and set staff codes | — | ✓ (Taproom members) | — | — |

**People:** "Taproom" means a membership in the `bar` department. Owners can
do everything. A UI action someone can't perform is hidden, and the matching
API call returns 403.

**Shared device:** the `Authz.Device` allowlist gets read access to the board
and nothing else.
- A **write** from a device needs a staff code. The server:
  1. resolves the code to a person;
  2. checks **that person** with `Authz.can?/3`;
  3. logs the change with `actor_id` = the person and `device_id` = the
     device.
- A manager's code on the tablet still only allows board writes. History,
  import and export stay off the device whatever the code.
- No code or a wrong code returns 422 with `staff_code_required` /
  `staff_code_invalid`, and nothing changes.
- A device from another department can't read or write the board.

**Signed in as a person,** including "Sign in as me" on the tablet: no code
is needed, and the log shows just their name (Q3).

### 3.4 API

| Route | Who | Does |
|---|---|---|
| `GET /api/beer_board` | Taproom, device | open entries |
| `POST /api/beer_board` | Taproom, device + code | create: `recipient_name`, `purchaser_name`, `beers` |
| `POST /api/beer_board/:id/redeem` | Taproom, device + code | `count` (default 1). Decrements atomically: `UPDATE … SET beers_remaining = beers_remaining - n WHERE id = ? AND beers_remaining >= n`. Deletes the entry when it reaches 0. Redeeming more than remain → 422 "Only N left". |
| `PATCH /api/beer_board/:id` | Taproom, device + code | edit names and/or set `beers_remaining` (1–99; to go to 0, redeem or delete) |
| `DELETE /api/beer_board/:id` | Taproom, device + code | delete |
| `GET /api/beer_board/history` | managers | events, newest first, paged (50), optional `q` (matches recipient or purchaser) |
| `GET /api/beer_board/history/export.csv` | managers | the full change log as CSV |
| `GET /api/beer_board/export.csv` | managers | the open entries as CSV (§3.6) |
| `POST /api/beer_board/import/preview` | managers | multipart CSV + `mode` (`add` / `replace`). Validates; **changes nothing**. Returns the rows, errors and duplicate groups. |
| `POST /api/beer_board/import` | managers | `mode`, the previewed rows, and a resolution for every duplicate group. One transaction. |
| `GET /api/staff_codes` | managers | `{user_id: code}` for the people the caller may see. Writes `staff_code.reveal`. |
| `PUT /api/users/:id/staff_code` | managers | `{code}` to set or change. `DELETE` removes it. |

"Managers" means owners and Taproom managers.

- Board writes take an optional `staff_code` (required from a device).
- Each write and its event rows are one transaction.
- An entry that's already gone returns 404 "This entry was already removed".
  That happens when two bartenders redeem the last beer at once.

### 3.5 UI

**Where:** Taproom → **Buy-a-Beer Board** at `/taproom/beer-board`. It's the
first page under the Taproom heading (`App.tsx` `DEPT_META.bar.children`).

**Board list (everyone with access):**
- Columns: For, Bought by, Beers left, Moved off the board (date), Imported
  (date, blank for entries added by hand).
- Every column sorts. The default sort is For, A–Z.
- **One search box** matches recipient **or** purchaser: case-insensitive, a
  substring match, filtering as you type.
- Sized for the landscape tablet first (Samsung, Chrome PWA), then phone
  width.

**Actions:**
- **Add from chalkboard:** a dialog with For, Bought by and Beers.
- **Redeem** on each row: redeems 1, with a stepper to redeem more. When the
  last beer is redeemed, a confirm reads "This uses the last beer for <name>
  and removes the entry."
- **Edit** (names, count) and **Delete** (with a confirm) in each row's menu.

**On the shared device:**
- Each action's dialog ends with a **Staff code** field: 4 digits, a numeric
  keypad (`inputMode="numeric"`), masked.
- After a successful save, a toast names the person: "Redeemed 1 for Pat,
  recorded as Sam Pour".
- A wrong code shows an inline error and keeps the dialog open.

**Managers also see:**
- a **History** tab;
- **Export CSV** and **Import CSV** buttons.

Staff and the tablet don't see them.

**History tab (managers):**
- Each row shows:
  - when;
  - who: "Sam Pour", or "Sam Pour on Shared Device" when a code was used;
  - the action, with "(import)" for import changes;
  - For / Bought by;
  - the count change (e.g. 3 → 2).
- It has the same search box as the board, plus **Export CSV**.
- Deleted and fully redeemed entries appear here.

### 3.6 Import and export (CSV, managers only)

**Why CSV:** it opens in Excel, Numbers and Google Sheets. Those are the
tools anyone would use to type up a chalkboard or keep a backup. A spreadsheet
format (`.xlsx`) adds a dependency for no gain at this size.

**File format:**
- UTF-8, comma-separated, with a header row. The columns, in any order:

  | Header | Required | Notes |
  |---|---|---|
  | `For` | yes | recipient |
  | `Bought by` | yes | purchaser |
  | `Beers` | yes | whole number, 1–99 |
  | `Moved off board` (or `Date added`) | no | `YYYY-MM-DD`, or the date-time an export wrote. Blank or missing means the import date. It keeps the original dates when a backup is restored. |
  | `Imported` | no | **Ignored on import.** Exports include it for reference, and every imported entry gets the current import time. |

- Header matching ignores case and surrounding spaces.
- Files saved by Excel are accepted: a byte-order mark and CRLF line endings
  are both fine.
- Limits: 1 MB and 1,000 rows.

**Export:**
- **Board → Export CSV** downloads `buy-a-beer-board-YYYY-MM-DD.csv`. It
  writes For, Bought by, Beers, Moved off board (a full date-time) and
  Imported. It can be re-imported unchanged: the moved-off dates are kept and
  the import date becomes the new import's.
- **History → Export CSV** downloads the change log: when, who, shared device
  (yes/no), action, source, For, Bought by, before, after.
- **Spreadsheet-formula safety:** a value that starts with `=`, `+`, `-`,
  `@`, a tab or a carriage return is written with a leading `'`, so a name
  can't run as a formula when the file is opened in Excel. Import strips one
  leading `'` from such values.

**Import: upload → preview → resolve duplicates → confirm.**

1. **Upload and pick a mode:**
   - **Add to the board** (the default);
   - **Replace the whole board.**
2. **Preview:** the server validates every row and nothing changes yet.
   - **Errors** are listed by row number: a missing name, a count outside
     1–99, a bad date, an unknown or missing column, too many rows.
   - **Any error blocks the whole import.** Fix the file and upload it again.
3. **Duplicate groups (Q7).**
   - **How names match:** **For** names match after trimming, collapsing
     inner spaces and ignoring case ("pat  smith" = "Pat Smith"). Bought by
     isn't compared.
   - **What forms a group:**
     - in **Add** mode, the open entries **and** the file's rows that share a
       For name;
     - in **Replace** mode, only the file's rows, since the board is
       cleared.

     A group needs at least one file row: entries already on the board that
     share a name, with nothing new in the file, aren't raised.
   - **Each group is shown as a card.** It lists every item with Bought by,
     beers, moved-off date, and whether it's **On the board** or **From the
     file**. The person chooses one of:
     - **Allow duplicates:**
       - every file row is imported as its own entry;
       - entries on the board are left alone.
     - **Combine:**
       - the group becomes **one** entry with beers = the **sum** over every
         item;
       - Bought by **joins** the group's purchasers, earliest first, with
         repeats dropped ("Chris & Lee"; Q8). It's shown in an editable
         field, which must fit in 80 characters;
       - the moved-off date is the earliest in the group;
       - the import date: a group with a board entry keeps that entry's
         `imported_at` (null if it was added by hand). A group of file rows
         only is a new entry with the current import date.

       Unavailable if the sum is over 99.
     - **Pick which remain:** a checkbox on each item.
       - A checked board entry stays and a checked file row is imported.
       - **An unchecked board entry is deleted** and an unchecked file row is
         skipped.
       - If any board entry is unchecked, the card warns "Deletes 1 entry on
         the board".
   - **Confirm stays disabled until every group has a choice.** There are no
     defaults and no "apply to all", because each one is verified.
   - File rows outside any group are listed as **New**.
4. **Replace mode:**
   - The preview shows "This deletes all N entries on the board (total B
     beers) and imports M." Confirm requires typing `REPLACE`.
   - **Export first** is offered on the same screen as a backup.
5. **Confirm:**
   - Everything is applied in **one transaction**: it all lands, or none of
     it does.
   - The server rebuilds the duplicate groups **at confirm time**. If they
     differ from the preview, it returns 409 "The board changed since your
     preview" and nothing is applied. For example, a bartender added "Pat",
     or redeemed someone's last beer.
   - The result: "Imported N, combined M groups, deleted D, skipped K", or
     "Replaced: N removed, M imported".

**Change log** (`detail.source = "import"`, actor = the person who
confirmed):
- a new entry → `created`, with `imported_at` = the import time;
- **Combine** → the earliest board entry in the group is `edited` (beers and
  Bought by before → after). Any other board entries in the group are
  `deleted` with `detail.combined_into`. With no board entry in the group,
  one `created`.
- **Pick** → `deleted` for each unchecked board entry, and `created` for each
  checked file row;
- **Replace** → a `deleted` for each old entry, then the above for the file.

`audit_log` also gets one `beer_board.import` entry (mode, counts, file
name).

**Not on the shared device.** The buttons are hidden there, and the API
returns 403 even with a manager's staff code. A manager can use "Sign in as
me" on the tablet to import.

### 3.7 Test support

- **Synthetic seed:**
  - `[SEED]` board entries: a few names, counts 1–5, including one with 1
    left and two entries for the same For name;
  - staff codes for `bartender1`, `bartender2` and `barMgr`.

  Seeded codes come from `.env.synthetic`, like the password (not committed).
  Playwright reads them from the same place on DEV.
- `[TEST-TEMP]` entries created by specs are cleaned up by the spec and by
  setup.
- **Import fixtures** in `rockcut_api/test/fixtures/beer_board/`:
  - a clean file;
  - one with errors;
  - an Excel-saved file (BOM + CRLF);
  - one with quoted commas;
  - one with a formula-like name;
  - one with For-name duplicates.

### Non-functional

- **New dependency:** `nimble_csv` (Dashbit, no dependencies of its own) for
  parsing and writing CSV on the API. It handles quoted names with commas
  and quotes in them. Nothing is added to the UI.
- **New secret:** `STAFF_CODE_KEY` (32 random bytes, base64) on
  `rockcut-api-dev` and `rockcut-api`. It's staged before the deploy, per the
  prod runbook, and listed in the release PR.
- Board lists are small (tens of rows), so sorting and search run in the
  browser over one fetch. History is paged server-side (50 per page).
- **Migrations:** three, all additive: two new tables (`beer_board_entries`
  includes `imported_at`) and three nullable `users` columns. Reversible.

## 4. Persona scenarios

| # | Persona | Entry point | Mode / state | Expected |
|---|---|---|---|---|
| S1 | `barMgr` | Users & Roles → edit `bartender1` → Staff code | no code yet | Types `4821`, Save. The grid shows `••••`, and Show codes reveals `4821`. After a reload the toggle is off again. `audit_log`: `staff_code.set`, then `staff_code.reveal`. |
| S2 | `barMgr` | edit `bartender2` → Staff code `4821` | `bartender1` has `4821` | "That code is already in use". Suggest fills in an unused code, which saves. |
| S3 | `barMgr` | Users & Roles → `brewer1` | not a Taproom member | No Staff code section, and `—` in the column. `PUT …/staff_code` returns 422. |
| S4 | `breweryMgr`, `bartender1` | Users & Roles / API | | No Staff code column, toggle or section. `GET /api/staff_codes` and `PUT …/staff_code` return 403. |
| S5 | `bartender1` | Taproom → Buy-a-Beer Board → Add | signed in as themself | Adds "Pat / Chris / 3" with no code prompt. After a reload it's listed with today's date. No History tab, no Import or Export. |
| S6 | `barMgr` | Board → History | after S5 | "Sam Pour · created · Pat / Chris · 3". |
| S7 | `taproomDevice` | Board → Redeem on Pat's row | Pat has 3 | The code field is shown. `bartender2`'s code: count 2, toast "recorded as Alex Draft". `barMgr`'s History: "Alex Draft on Shared Device · redeemed · 3 → 2". |
| S8 | `taproomDevice` | Redeem, last beer | entry has 1 | A confirm, then the entry is gone after a reload. History still shows it, 1 → 0. |
| S9 | `taproomDevice` | any write | wrong code ×5 | Inline error each time. The 6th attempt is locked with "Try again in N minutes". Nothing changed. |
| S10 | `taproomDevice` | `POST /api/beer_board` with no `staff_code` | | 422 `staff_code_required`. |
| S11 | `taproomDevice` | History, import and export APIs with `barMgr`'s code | | 403 for each. No History tab or file buttons on the tablet. |
| S12 | `barMgr` | Users & Roles → remove `bartender2` from the Taproom | `bartender2` has a code | The code is cleared. On the tablet it's now a wrong code. |
| S13 | `bartender1` | tablet → Sign in as me → Redeem | personal session on the tablet | No code prompt. History shows "Sam Pour" without "on Shared Device". |
| S14 | `floater` | Board | Taproom + Brewery member | Same access as `bartender1`. |
| S15 | `office1` / `brewer1` | typed `/taproom/beer-board`, and the API | not Taproom | No nav entry. The page shows a refusal, and the API returns 403. |
| S16 | `owner` | Board, History, Users & Roles | no memberships | Full access, including every Taproom member's code. |
| S17 | `bartender1` + `bartender2` | Redeem the last beer at the same time | entry has 1 | One succeeds. The other gets "This entry was already removed" and the list refreshes. |
| S18 | `bartender1` | search "chr" | entries for and by "Chris" | Shows rows where either name matches. Sorting by Bought by and Beers left works. |
| S19 | `bartender1` | Edit Pat's entry → count 5 | count was 2 | Saved. History "Sam Pour · edited · 2 → 5". |
| S20 | `barMgr` | Board → Export CSV | 4 entries, one name with a comma | Header plus 4 rows. It opens in a spreadsheet with the comma name intact. |
| S21 | `barMgr` | Import → Add | board: "Pat / Chris / 2". File: "pat / Lee / 3", "Sam / Jo / 1", "Sam / Kim / 2", "Ana / Bo / 1" | Preview: 1 New (Ana) and 2 groups. **Pat** has one board entry and one file row; **Sam** has two file rows. Confirm stays disabled until both are resolved. |
| S22 | `barMgr` | S21 → Combine Pat (Bought by pre-filled "Chris & Lee"), Allow Sam | | After a reload: Pat / Chris & Lee / 5 with its original moved-off date and no import date, then two Sam entries and Ana, each with today's import date. History (import): Pat `edited` 2 → 5, plus `created` ×3. |
| S23 | `barMgr` | S21 → Pick for Pat: uncheck the board entry, check the file row | | The card warns "Deletes 1 entry on the board". After a reload: Pat / Lee / 3 only. History: `deleted` (Pat / Chris) + `created` (Pat / Lee). |
| S24 | `barMgr` | Combine on a group totalling 120 beers | | Combine is unavailable, with "Over 99". Allow and Pick still work. |
| S25 | `barMgr` | Import → Replace | board has 4 entries; file has 2 rows, both "Ana" | The warning shows 4 entries and their beer total. The Ana group must be resolved, and Confirm needs `REPLACE`. After a reload the board matches the file and the choice. History: 4 `deleted`, then the file's effects. |
| S26 | `barMgr` | Import | blank name on row 3 and `Beers` = 0 on row 5 | Preview lists both errors by row. Nothing can be imported, and the board is unchanged. |
| S27 | `barMgr` previews; `bartender1` adds "Pat" before `barMgr` confirms | Import → Add | | Confirm returns "The board changed since your preview". Nothing is applied, and re-previewing shows the new group member. |
| S28 | `barMgr` | Export, then Replace with that same file | no duplicate For names | A round trip: the same names, counts and moved-off dates. Every entry's import date is now today. |
| S29 | `barMgr` | Export | a name `=HYPERLINK(...)` | Written as `'=HYPERLINK(...)`. Re-importing it restores the original name. |
| S30 | `barMgr` | Import → Add | file without a `Moved off board` column; another file with it filled on one row and blank on the other | Rows with no date get the import date as their moved-off date. The filled row keeps its date. All rows get today's import date. |
| S31 | `bartender1` | Board → Add by hand | | The entry shows a moved-off date of today and a blank Imported. |

## 5. Out of Scope

- Payment, prices or a link to a POS. The board records counts only.
- Customer accounts or contact details for recipients and purchasers.
- Staff codes for anything beyond the board's writes. The mechanism is
  general; each later feature opts in.
- A duplicate warning when adding a single entry by hand. That's only checked
  on import.
- Notifications about board changes.
- Removing "Sign in as me" from the tablets (decided 2026-10-05: keep it).

## 6. Questions

- [x] **Q1: who picks the digits** → managers type them in. A Suggest button
  fills an unused one.
- [x] **Q2: seeing codes later** → shown in Users & Roles, hidden by default
  behind a Show codes toggle. Stored encrypted, plus a digest for lookup.
- [x] **Q3: attribution** → just the name when signed in directly (including
  "Sign in as me" on a tablet); "<name> on Shared Device" with a code.
- [x] **Q4: limits** → as drafted: 1–99 beers, 80-character names, 5 wrong
  codes in 10 minutes → a 10-minute lock.
- [x] **Q5: History** → owners and Taproom managers only.
- [x] **Q6: import and export** → owners and Taproom managers only. Staff
  add entries by hand.
- [x] **Q7: duplicates** → the For name alone. Per group: Allow, Combine (sum
  the beers) or Pick which remain (unchecked board entries are deleted).
- [x] **Q8: Combine's Bought by** → join the purchasers ("Chris & Lee"),
  earliest first with repeats dropped. The field is editable and limited to
  80 characters.
