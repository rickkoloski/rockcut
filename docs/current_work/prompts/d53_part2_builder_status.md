# D53 Part 2: builder status

Builder → lead. Branch `d53-part2-idea-boards` in `~/src/rockcut-d53p2`. Nothing pushed.

## Stop 1 (2026-11-08): stages 1 and 2

Gate so far: `MIX_ENV=test mix test` **2026 passed, 0 failures** (one full run). No UI changes yet, so
`tsc`/`vite build`/lint weren't run. Formatted only the files I changed.

### Stage 1: Data (commit `a3ffe6d`)

**What changed**
- Migration `20261108120001_create_idea_boards.exs` (`change`, reversible): `idea_lists`, `idea_cards`,
  `idea_card_assignees`, `idea_labels`, `idea_card_labels`, `idea_checklist_items`, `idea_notes`,
  `idea_card_tasks`, `idea_events`, `idea_watches`, `idea_watch_pending`, columns as spec §4.1.
  - Deleting a card cascades to its assignees, labels, checklist, notes, watches, pending rows and
    `idea_card_tasks` rows; a list cascades to its cards. Users: `nilify` for authors, lockers,
    creators and actors (notes stay under their name only while the user row exists; we deactivate,
    never delete); `delete_all` for assignee, watch and pending rows.
  - `idea_card_tasks`: `task_id` and `task_series_id` `nilify_all`; `department_id`, `task_title`,
    `removed_at`, timestamps (`inserted_at` = when it was sent).
  - `idea_card_assignees` has a `position` (order), as Part 1's `task_assignees`.
  - `idea_events`: `board`, `card_id`/`list_id` without foreign keys, `action`, `title`, `actor_id`,
    `detail`, `inserted_at` (as `task_events`).
  - `idea_watch_pending`: `card_id`, `watcher_id`, `actor_id`, `change`, `detail`, `inserted_at`.
- Migration `20261108120002_add_idea_board_starter_lists.exs`: Ideas / Planned / Doing / Done
  (positions 1–4) on all five boards. A board that already has lists is skipped, so up is
  idempotent; down deletes only lists with those names that hold no cards.
- Checked on the dev DB: up → 20 rows, rollback 2, up again → 20 rows.
- Schemas under `lib/rockcut_api/idea_boards/`: `IdeaList`, `Card`, `CardAssignee`, `Label`
  (palette keys `green yellow orange red purple blue sky lime pink grey`), `ChecklistItem`, `Note`,
  `CardTask`, `Event`, `Watch`, `WatchPending`, with the spec's length limits in their changesets.

**Tests added:** `test/rockcut_api/migrations/create_idea_boards_test.exs` (3): the 20 starter rows;
down drops all 11 tables and up recreates them with the starters; starter down keeps a list holding
a card and an added list, and up again adds nothing to a board that has lists.

### Stage 2: Authz + plug + read API (commit with "stop 1")

**What changed**
- `Authz.can?/3`: area `{:idea_board, board}`, `board` = `{:department, %Department{}}` or
  `:company`. Department: `:read`/`:write` = `member_of?`; `:manage`/`:history` = the department's
  manager. Company: `:read`/`:write` = any active person; `:manage`/`:history` owners only (owner
  clause). **Lock checks are in `Authz` now** (ready for stage 3):
  `can?(user, :change, {:idea_board, board, %IdeaList{} | %Card{list: preloaded}})` = `:write` and
  (not locked, or `:manage`); a card is locked on its own or through its list
  (`Authz.idea_locked?/1`).
- `Authz.Device`: `:read` on the home department's board and `:company`; everything else falls to
  the catch-all deny.
- `Plugs.IdeaBoard` (pipeline `:idea_board`): `:board` → `{:department, dept}` (assignable only) or
  `:company`; anything else (`other`, `all`, junk) 404. Assigned as `conn.assigns.idea_board`.
- `RockcutApi.IdeaBoards` (read side): `boards_for/1`, `board_for_key/1`, `board_key/1`,
  `board/2`, `labels/1`, `get_card/3`, `fetch_card/2` (scoped to the board), `archived/1`,
  `list_events/3`, `sent_state/1`.
- `IdeaBoardController` + `IdeaBoardErrors`. Routes:
  - device-allowed: `GET /api/idea_boards`, `GET /api/idea_boards/:board/lists` (the board read:
    lists + card faces + labels), `…/labels`, `…/cards/:id` (full card).
  - people only: `…/history` (`:history`), `…/archived` (`:read`).
  - Access is checked before ids: a board you can't open is 403 even with a junk id; a card from
    another board is 404.
- Card face JSON: `label_ids`, `assignee_ids` + `assignees`, `checklist {done,total}`,
  `note_count`, `locked`/`locked_at`/`locked_by`, `watching` (the viewer's), `sent_tasks` chips
  (`state` = `on_list` | `done` | `repeating` | `removed`, department, `due_on`, `completed_on`,
  `series {frequency, interval}`). A sent task whose row was nulled by the FK reads as `removed`
  even before `removed_at` is set. Full card adds `description`, `list`, `labels`, `created_by`,
  `checklist_items` (with `done_by`), `notes` newest first (with `author`, `edited_at`).
- `/api/me` gains `idea_boards` (same entries as `GET /api/idea_boards`: `key`, `name`, `color`,
  `manage`, `history`; departments in id order, Company last). `JSONHelpers.me/3` defaults it to `[]`.

**Tests added**
- `test/rockcut_api_web/idea_board_route_matrix_test.exs` (18): every `/api/idea_boards` route ×
  all five boards × {bartender1, brewer1, barMgr, breweryMgr, owner, noDept, taproomDevice,
  breweryDevice}, plus `GET /api/idea_boards` per actor (keys, `manage`, `history`), plus foreign
  card ids → 404. Generated from the router: a new Idea Board route fails until it's classified.
- `test/rockcut_api/authz_parity/idea_boards_test.exs` (61): the D31 parity personas × five
  boards: `:read`, `:write`, `:manage`, `:history`, and `:change` on open/locked lists and cards
  (card locked itself or through its list); a deactivated person has no Company board.
- `test/rockcut_api_web/controllers/idea_board_controller_test.exs` (14): board read shape and
  card faces, `watching` per viewer, archived and other boards' rows kept off, chip states, full
  card with notes newest first, archived card opens, 404/403 order, unknown boards 404, labels,
  Archived, History (board-only, per card, names), `/api/idea_boards` = `/api/me` `idea_boards`.
- Support: `test/support/idea_board_fixtures.ex` (direct inserts until the write API exists).

**Tests changed (shape only, nothing weakened)**
- `device_route_matrix_test.exs`: the four device reads in `@device_ok`, History and Archived in
  `@denied`; `fill/3` fills `:board` with `bar` and makes a Taproom card for `/cards/:id`.
- `authz_device_test.exs`: a D53 block (home board + Company read only; no write/manage/history/
  change; other boards denied).

**Nothing deleted or weakened.**

### Judgment calls (tell me if any is wrong)

1. **Archived is people-only.** A tablet can't restore anything, so I left `…/archived` out of the
   device allowlist. The spec only says tablets view the board.
2. **Label names are unique per board** (unique index on `[board, name]`). That stops "pick or
   create" making duplicates. The spec doesn't say either way. Case-sensitive for now.
3. **No separate `GET /api/idea_boards/:board`.** `GET …/lists` is the board read (it matches S227's
   `GET /api/idea_boards/bar/lists`) and carries the labels too.
4. **Deleting a card for good removes its `idea_card_tasks` rows.** The tasks stay (§4.1). Their
   "From idea" line then has nothing to show. The other option is to keep the row with
   `card_id` nulled and show the title without a link; that needs the column nullable.
5. **Assignee pickers' people** aren't in the board read yet. I'll add them in stage 3 alongside
   the assignee rules, unless you want them here.

### LEAD:

- **LEAD-1:** Judgment call 4: do sent tasks keep "From idea: <title>" (no link) after the card is
  deleted for good? If yes, I'll make `idea_card_tasks.card_id` nullable with `nilify_all` and keep a
  `card_title` copy. It's simplest to change now, before stage 3.
- **LEAD-2:** Judgment call 2 (unique label names per board): OK?
- **Carry to stage 8:** `mix rockcut.synthetic.setup`'s DEV reseed doesn't clear Idea Board rows
  yet. I'll do that with the `[SEED]` data.
