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

## Stop 2 (2026-11-08): decision 4 and stage 3

Gate so far: `MIX_ENV=test mix test` **2058 passed, 0 failures** (one full run). Still no UI
changes. Formatted only the files I changed.

### Stage 1 change for lead decisions 2 and 4 (commit `f75912c`)

- `create_idea_boards` edited in place: `idea_card_tasks.card_id` is nullable with `nilify_all`,
  plus `card_title` (not null). Deleting a card for good keeps the row, so the task can still show
  "From idea: <title>" (stage 5 shows it without a link).
- Label names: unique index on `[board, lower(name)]` (same index name), and the changeset trims.
  The duplicate message is "There's already a label with that name". SQLite's `lower()` folds
  ASCII only.
- I rolled back both migrations and migrated again on the local dev DB and the test DB. Anyone
  else's local DB on this branch needs `mix ecto.rollback --step 2 && mix ecto.migrate`.

### Stage 3: write API (commit with "stop 2")

**Context** (`lib/rockcut_api/idea_boards/`, each write in one transaction with its History row):
- `Lists`: create (last), rename, move (`before_id`; nil or archived → last; another board's →
  404), lock/unlock (no-op if already), archive (the rest close up), restore (last), delete for
  good (archived only, else 422 `not_archived`; cascades to cards, notes, checklists, watches).
- `Cards`: create (bottom of an unarchived list), edit (`title`, `description`, `due_on`,
  `assignee_ids`, `label_ids`), move (`list_id` + `before_id`, both lists renumbered), lock/unlock,
  archive, restore (last in its list; 422 `list_archived` if the list is archived), delete for good
  (archived only).
- `Labels` (create, rename/recolor, delete; the delete strips the label from every card, locked
  ones too), `Checklist` (add, edit text, tick/untick with `done_by`, remove, reorder with every id
  once or 422 `invalid_order`), `Notes` (add, author edit sets `edited_at`, delete), `Watches`
  (idempotent on; off also clears that person's pending rows on the card).
- `People`: the only writer of `idea_card_assignees`. It reuses `Tasks.Assignees.given/1` for
  parsing (same 100 cap), checks only newly added people through the new
  `Authz.can_take_idea_card?/2`, and returns 422 naming each person ("Jake Brewer must be a Bar
  member"). `pickable/1` is the picker: the department's active members (owners only if they're
  members), or every active person on Company.
- **People leaving:** `People.drop_if_ineligible/2` runs in `Accounts`, right after
  `Tasks.unassign_if_ineligible/2`, in both the user-update and membership transactions. On every
  board the person can no longer open, it takes them off every card (archived cards too, so a
  restored card doesn't bring back someone who left) and drops their watches and pending rows.
  History gets `card_unassigned` with `reason` `left_<key>` or **`deactivated`** (the Idea Board
  side of Gap 9 is already right). Notes stay.
- `Log`: `log!/5` (one place for History rows, so stage 4 can add the watcher ledger there),
  `place/3`, `renumber!/2`.
- **History actions:** `list_created/renamed/moved/locked/unlocked/archived/restored/deleted`,
  `card_created/edited/moved/locked/unlocked/archived/restored/deleted/unassigned`,
  `label_created/updated/deleted`, `checklist_added/edited/ticked/unticked/removed`,
  `note_added/edited/deleted`.
  - `card_edited` is one row per save, listing each changed field old → new. The description is
    only marked `true`, so 10,000 characters aren't stored twice.
  - Reordering cards within a list and reordering the checklist aren't logged. Moving a card to
    another list is.
  - History's `names.users` now also covers edit, unassign and deleted-note ids.

**Authz** (all decisions there; boundary test passes):
- `can?(user, :archive, {:idea_board, board, %IdeaList{}})` = `:change`, and for non-managers no
  unarchived locked card in the list (S257).
- Notes, **above the owner clause** so they bind owners too: `:edit` = author and `:write`
  (an owner can't edit someone else's note); `:delete` = `:edit`, or `:manage`.
- `can_take_idea_card?/2`.

**Web:** `IdeaBoardAccess` (shared checks in the spec's order: board 403 → id 404 → lock 423),
`IdeaListController`, `IdeaCardController` (cards, checklist, notes, watch),
`IdeaLabelController`, `IdeaBoardController.people`. `IdeaBoardErrors` adds 423 `locked` ("Locked
by a manager") and 423 `holds_locked_card`, plus 422 `archived`, `list_archived`, `not_archived`,
`invalid_order`. All 31 new routes are people-only (`:authenticated`):
`GET …/people`; `POST …/lists`, `PATCH|DELETE …/lists/:id`,
`POST …/lists/:id/{move,lock,unlock,archive,restore}`; `POST …/cards`, `PATCH|DELETE …/cards/:id`,
`POST …/cards/:id/{move,lock,unlock,archive,restore}`; `POST …/cards/:id/checklist`,
`PUT …/checklist/order`, `PATCH|DELETE …/checklist/:item_id`; `POST …/cards/:id/notes`,
`PATCH|DELETE …/notes/:note_id`; `PUT|DELETE …/cards/:id/watch`; `POST …/labels`,
`PATCH|DELETE …/labels/:id`. Card writes answer with the whole card.

**Rules as built (§4.5):**
- Adding a card is `:change` on its list. Editing, archiving, restoring and checklist writes are
  `:change` on the card (its own lock or its list's).
- Moving a card is `:change` on the card **and** on the target list, so cards can't move in or
  out of a locked list. Moving a list is `:change` on that list only, so others reorder around a
  locked one.
- Notes and Watch are never blocked by a lock.
- Lock, unlock and delete-for-good are `:manage` (403 for others, not 423).
- Label rename, recolor and delete are `:manage`. I treated recolor like rename.

**Tests added**
- `test/rockcut_api_web/controllers/idea_board_write_test.exs` (31). Every write is read back
  through the API.
  - Scenarios: S224, edits/limits, S232 and the assignee rules (named 422, owner accepted, device,
    junk, 101 people), the picker.
  - Moves: dense positions, only moves between lists logged; lists left/right.
  - **Lock matrix:** 12 non-manager writes in or into a locked list → 423 with nothing changed;
    unlock is 403. barMgr edits without unlocking. Other lists reorder around a locked one. Plus
    S229, S255, S257, and unlock.
  - S230 and S231. S237 with delete for good (cascade; the task stays with `card_id` nil and
    `card_title`).
  - Cards archive/restore/delete, restore while the list is archived, nothing into an archived
    list. S256 plus case-insensitive names.
  - Checklist (ticked by, untick, edit, reorder, remove, bad order), S261 (newest first, edited
    mark, bartender2 403, owner can't edit, barMgr deletes, 2,001 characters 422), a note from
    another card 404, Watch.
  - S243 (leaving the Taproom; Brewery and Company untouched), S260 (deactivation; notes stay;
    reason `deactivated`).
- `idea_board_route_matrix_test.exs` rewritten to cover all 34 board routes (5 reads + 29 writes;
  `GET /api/idea_boards` separately) × 5 boards × 8 actors. Each call gets fresh records. Two more
  tests: another board's list, label, `before_id` and card are 404 on writes too, and a foreign
  label in `label_ids` is 422.

**Tests changed (shape only):**
- `device_route_matrix_test.exs`: all 31 new routes in `@denied` (the tablet gets 403 from
  `DeviceGate`).
- `authz_parity/idea_boards_test.exs`: note edit and delete rows per persona and board.
- `idea_board_controller_test.exs`: `card_title` on sent-task fixtures (part of `f75912c`).

**Nothing deleted or weakened.**

### Judgment calls (tell me if any is wrong)

1. **Leaving removes the person from archived cards too,** not only open ones. Otherwise
   restoring an archived card would bring back someone who can't open the board.
2. **Editing an archived card is allowed** (PATCH works on it); moving it is 422 `archived`. The
   UI won't offer edits from Archived. Say if the API should refuse them.
3. **No History for reordering within a list or reordering the checklist.** Watchers won't hear
   about those either in stage 4.
4. **Lock, unlock and delete-for-good return 403 for non-managers, not 423.** 423 means "the lock
   stopped you". These actions were never theirs.
5. **The checklist on a card inside a locked list** is frozen for non-managers, as §4.5 says.
   Adding and removing items are frozen too, not only ticks.

### LEAD:

- None blocking. Please confirm judgment calls 1 and 2, since stage 4's notifications follow
  whatever History logs.

## Stop 3 (2026-11-08): decision 2, stages 4 and 5

Gate so far:
- `MIX_ENV=test mix test`: **2089 passed, 0 failures** (one full run).
- UI: `tsc` clean; eslint clean on the one file changed.
- The suite now prints "older migration … has already run" warnings. They come from the existing
  migration tests running older migrations down and up while ours (20261108…) are newer. They
  don't affect results.

### Lead decision 2: archived cards are read-only (commit `5ef6dd0`)

- In `IdeaCardController`, every card write first checks the card is live:
  `IdeaBoards.archived?/1` (the card or its list is archived) → 422 `archived`. This runs before
  the lock check.
- Refused: edit, move, lock/unlock, all checklist writes, and adding, editing or deleting a note.
  I counted deleting a note as "changing" a read-only card. Say if a manager should still be able
  to delete one.
- Still allowed: Watch on/off, restore (`:change` only, so a locked one stays a manager's), and a
  manager's delete for good.
- Test: `idea_board_write_test.exs` "archived cards are read-only". It covers an archived card and
  a card in an archived list, 10 refused writes each, nothing changed, Watch still works, then
  restore → edit, and delete for good.

### Stage 4: Watch notifications (commit `44a78b7`)

- `IdeaBoards.Watchers`:
  - **Ledger:** `pending!/4` runs from `Log.log!/5`, inside the write's transaction. Each watcher
    except the actor gets one `idea_watch_pending` row. Only these card actions count: edit, move,
    lock/unlock, archive/restore, unassign (leaving), send, checklist add/edit/tick/untick/remove,
    note add/edit/delete. Reorders within a list and of the checklist aren't History, so they
    aren't here either.
  - **Flush:** `flush/1` finds cards whose oldest pending row is ≥ 600 s old. Each watcher gets
    one `idea_card_changed` notification, then the rows covered are deleted. A watcher who has
    lost the board, been deactivated or stopped watching gets nothing.
  - **Wording:** "Casey changed Taproom remodel" / "2 notes, moved to Doing, locked". Two people
    read "Casey and Sam"; more read "Casey and 2 others". Phrases follow the order the changes
    happened. An edit's fields follow the dialog's order: renamed, description, due date, people,
    labels.
  - **Data:** `url` `/ideas/<board>/cards/<id>`, plus `board` and `card_id`.
- `Reminders.Scheduler` calls `Watchers.flush/0` on its 5-minute tick, in its own `try`, so a
  notification arrives 10–15 minutes after the first change.
- `Notifications`: `idea_card_changed` defaults in-app on, push on, email off, and
  `Notifications.idea_card_changed/2`.
- **UI** `NotificationPreferencesDialog.tsx`: a row "Changes to Idea Board cards you watch",
  `EVENT_DEFAULTS` `{email: false, push: true}`, and email in `NOT_SENT` (shown "—"), as
  `task_shift_end`. The diff is 4 lines added, 1 changed.
- Tests: `test/rockcut_api/idea_boards/watchers_test.exs` (8).
  - S225: one notification naming both changes, nothing inside 9 minutes, none to the actor.
  - Your own change makes no rows.
  - S242: two notifications 15 minutes apart, none after Watch off.
  - Several people and kinds; the card's window carrying a late change.
  - S243: leaving drops the watch and pending rows.
  - Access lost before the flush: nothing sent.
  - The defaults.

### Stage 5: Send to task list (commit with "stop 3")

- `IdeaBoards.Send.send/7` runs in one immediate transaction. Each task goes through
  `Tasks.create/4`, and so through `Tasks.Assignees` and, for a repeat, `Tasks.Series`. There is no
  second writer. The transaction also writes an `idea_card_tasks` row per task (with `card_title`),
  the `card_sent` History row (which watchers hear about: "sent to the Taproom task list"), and
  the "Then" step (stay, `Cards.move`, `Cards.archive`). Any failure rolls back everything: no
  tasks, no rows, no History.
- **Params:**
  - `checklist`: `notes` (default) or `per_item`, which makes one task per **open** item, with no
    notes.
  - `due_on`: absent → the card's date, Today if it's past, Future if none. `nil`/`""` → Future.
  - `assignee_ids`: absent → the card's people who can take a task there.
  - `repeat*`: one-task mode only, else 422 `repeat_per_item`.
  - `then`: `stay`, `move` + `then_list_id`, or `archive`.
  - `department`: a department card goes to its own board; a Company card must name a board
    (422 `department_required`), and one the person can't write on is 403.
- **Notes:** the description, a blank line, then `☐`/`☑` lines. Over 2,000 characters, the
  description is cut with "… see the Idea Board card" so the checklist survives. If the checklist
  alone doesn't fit, it's cut at a whole line with the same pointer on its own line, and the
  description is dropped.
- `GET …/cards/:id/send_to_tasks` (new, people-only) gives the dialog its defaults: `departments`
  (each with `assignee_ids` and `left_off` `[{id, name}]`), `due_on`, checklist `{total, open}`,
  and `already_sent`. It's guarded like a card change, so it's 423 for a non-manager on a locked
  card and 422 on an archived one.
- **Who:** `IdeaBoards.send_departments/2` (Authz `:write` on `{:tasks, dept}`). Owners get all
  four boards for a Company card; `noDept` gets none.
- **"From idea":**
  - Task JSON has `from_idea` (`nil` by default in `JSONHelpers.task/1`).
  - `TaskBoardController` fills it per viewer for the board, the All departments view and every
    task write response, using `IdeaBoards.from_idea/2`: `{title, board, card_id, link}`.
  - It matches the task, or any occurrence of a sent series.
  - `link` is false (board and card id nil, title kept) when the card was deleted for good or the
    viewer can't open its board.
- **Chips:** `on_list` → `done` (task completed, with `completed_on`); `repeating` (series still
  there); `removed` once the foreign key nulls the task or series.
  - **`removed_at` stays unused.** The state is derived from the nulled ids, which covers every
    delete path (single task, series, following) without touching `Tasks`.
  - The cost: no "removed on" date. Say if you want it set; that means a hook in `Tasks`' delete
    paths.
- Tests: `idea_board_send_test.exs` (22).
  - S233 (task, people, notes, From idea, chip, History); ☑ lines.
  - S234 (per item, then move to Done); S235 (completed → Done).
  - S236 (dialog defaults, `left_off`, Office only; Brewery 403; none named 422; `noDept`; owner
    all four).
  - S258 (past → Today; Future and explicit days; repeat per item 422; locked card 423 for
    bartender1 and 201 for barMgr; archived card; archived "Then" list; a bad assignee rolls back
    everything; Then archive).
  - S259 (deleted task → Removed, title kept).
  - A repeating send (series chip; From idea on every occurrence); watchers hear about a send.
  - From idea: after the card is deleted for good; a viewer who can't open the board; a plain task
    has none; write responses carry it.
  - The 2,000-character rule (4 cases).
- **Matrices:** both new routes are in `idea_board_route_matrix_test.exs`. The new kind `:send`
  is like `:write`, except that on Company a person with no department gets 403. Both routes are
  in the device matrix's `@denied`.

**Nothing deleted or weakened.** Every task JSON gained a `from_idea` key.

### LEAD:

- **LEAD-3:** On an archived card, should a manager still be able to delete a note? I refuse it
  now (read-only).
- **LEAD-4:** Should the chip show a "Removed <date>"? Today it's just "Removed", and
  `removed_at` is never set.
- For stage 6: the UI's `Task` type needs `from_idea`, and the Send dialog reads
  `GET …/send_to_tasks`.

## Stop 4 (2026-11-08): decision 2 and stage 6 (the UI)

### Gate (non-Playwright), all passing

- `MIX_ENV=test mix test` twice: **2089 passed** both runs.
- `tsc -p tsconfig.app.json`: clean. `vite build`: OK. `vitest`: **196 passed** (6 new, `src/lib/ideas.test.ts`).
- `pnpm lint`: **26 errors, 1 warning**, the same as before; none are in files I touched.
- `tsc -p tsconfig.e2e.json`: clean for `tests/regression/ideas/`. Three errors in other spec files
  (`task-board-phone`, `beer-board-import`) were already there.
- **New Playwright: `npx playwright test --project idea-boards` → 11 passed** (local servers from this
  worktree; `E2E_TARGET` not set).

### Lead decisions 3, item 2 (commit `f900d21`)

- `idea_card_tasks.removed_at` is gone from the migration (edited in place), the schema, the JSON
  and `sent_state/1`. Spec §4.1's table now lists `card_title` and says "Removed" comes from the
  nulled task or series.
- I rolled back and re-migrated the local dev and test DBs (both migrations). The dev DB had no
  Idea Board data that mattered.

### Stage 6: the UI (commit `a20d93c`)

**New files** (`src/pages/ideas/`, `src/lib/ideas.ts`):
- `IdeaBoardRoutes.tsx`: `/ideas` opens the remembered board. `/ideas/:board` and
  `/ideas/:board/cards/:cardId` fall back to the first board the person has (S227: `/ideas/brewery`
  → `/ideas/bar`; S238: → `/ideas/company`).
- `IdeaBoard.tsx`, the board:
  - Lists side by side with sideways scroll and "+ Add a list" at the end.
  - Cards drag within and between lists through the shared `SortableLists` / `useOptimisticLists`.
  - A non-manager can't drag a locked card or into a locked list.
  - Refetch on focus and every 60 s, as the task boards.
  - The gear holds Show (All / My cards / Watching / each label), Archived (people) and History
    (`history` flag). A "Showing: … · Show all" button appears while a filter is on.
  - **Phone:** one list at a time under scrollable tabs (name and count). Each tab is a
    `DropTarget`, so a long-pressed card can be dropped on another list's tab.
- `IdeaListColumn.tsx`: name (click to rename), count ("3", or "2/3" under a filter), lock icon
  and "Locked by Casey · Nov 8", ⋮ menu (Rename, Move left/right, Lock/Unlock for managers,
  Archive), inline "+ Add a card". Controls a person can't use are hidden, not refused (§4.5).
- `IdeaCardFace.tsx`: label bars, title, due date (red and bold when past), checklist "2/5"
  (green when done), note count, a small eye when you watch it, the lock (when it's the card's own),
  up to 3 initials then "+N", and the latest send's chip ("On the task list" / "✓ Done Nov 12" /
  "Repeats on the task list" / "Removed from the task list").
- `IdeaCardDialog.tsx`, the card at its own URL:
  - Title (saved on Enter or blur), description (Save/Cancel), People (autocomplete), Due date,
    Labels (pick, or type to "Add the label …"; managers also get "Edit labels").
  - Checklist: tick (optimistic), click text to edit, ↑/↓, remove, add.
  - Notes: the add box on top, entries newest first ("Casey Tap · Nov 6, 2:14 PM · edited");
    edit for the author, delete for the author or a manager.
  - Watch / Watching toggle, Send to task list, Lock/Unlock (managers), Archive, Restore, Delete
    for good (managers, archived), the sent chips, and History for this card (`history` flag).
  - **Read-only:** on a tablet; for a non-manager when the card or its list is locked (a banner
    names who locked it, and notes stay open); for everyone while archived (decision 2; Watch and
    Restore stay).
  - Closing returns to the board: `navigate(-1)` when opened from the board, so Android back does
    the same; `/ideas/<board>` when opened from a link.
  - **Phone:** full screen. Watch sits under the title, and People, date, labels and actions come
    before the checklist and notes.
- `SendDialog.tsx` (`GET …/send_to_tasks` for defaults):
  - Task board (fixed for a department card, a pick for Company), Assigned to with "X: not in
    Office, left off".
  - Day with No day (Future), and a note when the card was due before today.
  - Checklist radios (only with a checklist). Repeat (the task dialog's `RepeatFields`; hidden in
    per-item mode).
  - Then (stay / move to a list, Done preselected / archive). An "Already on the task list"
    warning when it was sent before.
- `ArchivedDialog.tsx` (lists with card counts, cards; Restore; Delete for good for managers, with
  a confirm), `IdeaHistoryDialog.tsx` (paged, `describeIdeaEvent`), `LabelsDialog.tsx` (managers:
  recolor, rename, delete with confirm).
- `lib/ideas.ts`: paths, the remembered board, `ideaBoardTarget`, the label palette (one color
  per theme for each of the API's 10 keys), the filter, date formats, `sentChipText`,
  `ideaError`, and `describeIdeaEvent` (History in words).

**Changed files:**
- `App.tsx`: "Idea Boards" (lightbulb) in the nav after Tasks, and the three routes for people and
  for tablets.
- `useAuth`: `ideaBoards` from `/api/me`.
- `types.ts`: Idea Board types, plus `TaskCardData.from_idea` / `FromIdea`.
- `TaskDialog.tsx`: the **"From idea: <title>"** line; a link to the card only when `link` is
  true.
- `BoardSwitcher.tsx`: an optional `titleOf` ("Taproom ideas"); the task boards are unchanged.
- `FormDialog.tsx`: an optional `submitLabel` (the Send dialog's "Send"); default "Save".
- `playwright.config.ts`: a one-worker `idea-boards` project. `chromium` ignores
  `regression/ideas/`, as it does for production.

**Screenshots:** `/tmp/claude-501/pwlogs/d53p2shots/*.png` (42 files: each screen × light/dark ×
1280/390). The throwaway script is `shots.mjs` in the same folder. It seeds `[TEST-TEMP]` lists,
cards, labels and one sent task through the API, and cleans up after (checked: 0 `[TEST-TEMP]`
cards, lists, labels or tasks left).
- `board-*`: several lists; labels; 4 people (+1); past and future due dates; a checklist 2/5; 6
  notes; a watched card; a locked card; a sent card's chip.
- `card-*`, `card-notes-*`: the dialog with a 6-note timeline. `card-sent-mgr-*`: the manager's
  view with the task-list chip, Lock and History.
- `send-dept-*` (bartender1), `send-company-*` (owner: four boards, "left off" line).
- `archived-*`, `history-*` (barMgr), `tablet-*`, `tablet-card-*` (taproomDevice), and
  `phone-tab-remodel-390-*` (the phone tabs on a locked list).
- **Fixed after looking:**
  - Phone card dialog: the Watch button crowded the title (it moved under it); People and
    labels sat below a long notes timeline (now right after the description).
  - Phone tabs: upper-case, clipped names (now normal case, ellipsis, the count always shown).

**Playwright smoke** (`tests/regression/ideas/idea-boards-smoke.spec.ts`, helpers in `helpers.ts`;
11 tests, each in its own `[TEST-TEMP]` list):
- S223 (nav, four lists, switcher Taproom + Company) and S227 (`/ideas/brewery` → `/ideas/bar`).
- S224 smoke, all through the UI: list, card, description, due date, checklist tick, note, Watch;
  reload keeps everything; Close goes to the board, and back closes a card opened from the board.
- Mouse drag between lists (persisted through the API).
- S233 smoke: Send → chip → task board → task dialog "From idea" → the link opens the card.
- S237 smoke: archive a list from ⋮, Archived shows "1 card" (no Delete for bartender1), Restore.
- S228 smoke: bartender1 sees "Locked by Casey", no add, no menu; barMgr keeps add and has Unlock.
- S240 smoke: History for barMgr, not for bartender1.
- S241 smoke: the tablet sees no add or menu; the card dialog has no inputs, Watch, notes box or
  Send; its switcher shows Taproom and Company.
- S239 smoke: 390 px tabs, one list showing, the card URL, back closes.

### Not done, or done differently

1. **Lists don't drag; they move with ⋮ → Move left / Move right.** Spec §4.4 says lists drag
   left and right. The cards already drag inside `SortableLists` (one vertical-list `DndContext`),
   and the list columns render inside it. Dragging columns needs a second, horizontal sortable
   around them: either restructuring `SortableLists` to accept an outer container sortable, or a
   separate `DndContext` with the card layer nested inside it. I didn't want to change the shared
   layer the task boards use without asking. → **LEAD-5**
2. **Checklist reorder** uses ↑/↓ buttons, not drag. The spec says "reorder" without saying how.
3. The phone's long-press drop onto another list's tab is built but not in a spec yet (stage 8,
   S239 in full, with `touchDrag`).
4. `tests/COVERAGE.md` isn't updated yet (stage 8).
5. The Send dialog's assignee picker reads `/api/roster` (schedulable people), as the task
   dialog does. A department member who isn't schedulable can't be picked there, the same as on
   the task board.

### LEAD:

- **LEAD-5:** Drag lists left and right: build it in stage 6 (a change to the shared drag layer,
  with the task-board drag specs re-run), or keep Move left/right and note the difference in the
  spec?

## Stop 5 (2026-11-08): stages 7 and 8, plus Matt's three changes

### Gate

- `MIX_ENV=test mix test` twice: **2103 passed** both runs.
- `tsc -p tsconfig.app.json`: clean. `vite build`: OK. `vitest`: **201 passed**.
- `pnpm lint`: **26 errors, 1 warning**, the same as before.
- `tsc -p tsconfig.e2e.json`: 2 errors, both in specs I didn't touch (`task-board-phone`,
  `beer-board-import`).
- **Playwright** (local, one project at a time, `E2E_TARGET` unset):
  - `--project idea-boards --no-deps`: **40 passed**.
  - `--project brewery-board --no-deps` after stage 7: **226 passed** (17 min), and again after
    the rename and `/boards` changes: **226 passed** (18 min).
- I reseeded the local dev DB (`mix rockcut.synthetic.setup`) for the new `[SEED]` data.

### Stage 7: §4.8 follow-ups (commit `d61e6a3`)

Each item has a test from its repro, and each failed with the fix reverted and passed with it
restored. I reverted by reversing the diff; I checked by running the tests, not by reading.

| Item | Fix | Test |
|---|---|---|
| Gap 4 | A "following" edit logs `people: {removed, added}` over every occurrence it reaches (before the edit), and History names them ("Assigned Riley Wort to …; removed Jake Brewer, Morgan Mash (this and following)"). `from`/`to` stay as they were. | ExUnit `tasks/qa_followups_test` (gap 4 ×2); Vitest `tasks.test`; Playwright `task-board-qa-followups` (gap 4, History through the UI) |
| Gap 5 | Leaving: one `unassigned` row per series, on its first open occurrence, with `count`; one-offs as before. "… (left the Brewery) (52 occurrences)". | ExUnit, Vitest |
| Gap 6 | Mark not done takes off anyone who can no longer take the task (left, or deactivated), logged `unassigned` with the reason. A finished task still keeps who did it. | ExUnit (fix + control) |
| Gap 9 | Reason `deactivated` when the person is inactive (`Tasks` and the Idea Boards); History "(deactivated)". | ExUnit, Vitest |
| Gap 11 | `TaskCard`: one person sits beside the title only when there's no repeat or notes icon; otherwise the initials get their own row, as for two or more people. | Playwright `task-board-qa-followups` (gap 11: the initials sit below the title at 1440 px) |
| Gap 13 | A split from the series' **first** date: what stays (kept exceptions, finished ones) joins the new series as it is (flag, people, title, notes). It doesn't become one-offs. The new series already skips their days. Series Delete following now reaches them. | ExUnit (gap 13 ×2) |
| Gap 14 | **Behaviour unchanged; the confirm says so.** `change_preview` gains `keeps_moved`, and the rule-change confirm adds "Kept, the one moved to another day stays there, and the new pattern can make its old day too." See judgment call 1. | ExUnit (gap 14), Vitest `repeat.test` |
| Recheck 2 obs. 1 | `change_preview` gains `removes_noted`. The confirm adds "N removed ones have their own notes, which go too." History `removed_with_notes` reads "removed 4 (1 with their own notes)". | ExUnit (×2), Vitest |
| Recheck 2 obs. 2 | `taskSaveError`: a repeat field's error (`count`, `until_date`, …) reads as a sentence with no `count:` prefix. | Vitest `tasks.test` |

**Tests changed (meaning kept):** none of the existing ones.

### Stage 8: seed, specs, COVERAGE

**Seed** (`seeds/synthetic.ex`, `seed_idea_boards/2`, rebuilt on every setup):
- **Taproom:**
  - "[SEED] Big job" and "Quick win" labels.
  - A **locked** "[SEED] Taproom remodel" list. Its "[SEED] New bar top" card has a description,
    due date, bartender1 and bartender2, a 1/3 checklist and 2 notes, and bartender1 watches it.
  - A **locked** "[SEED] Raise tap prices" card in Planned.
  - An overdue "[SEED] Patio heaters for fall".
  - "[SEED] Deep clean the lines", **sent** to the Taproom task list (its task is titled `[SEED]`
    too).
- **Brewery:** "[SEED] Equipment" label; "[SEED] New canning line" with people, a checklist and a
  note.
- **Company:** "[SEED] Events" label; "[SEED] Holiday party" with office1 and bartender1, and a
  note.
- **Clean-up:**
  - `delete_tagged/1` (used by `cleanup_temp` for `[TEST-TEMP]` and by setup for `[SEED]`)
    removes tagged lists (with their cards), cards and labels on **every board**, and the sent-task
    rows of tagged cards. Then it renumbers every board's lists and every list's cards.
  - The starter lists are never touched.
- **Tests:**
  - Added to `seeds/synthetic_test` ("Idea Boards" ×3): the contents; setup twice gives the same
    data with the starter lists unchanged; `cleanup_temp` on all five boards.
  - Changed: D41's `board_titles` helper leaves out the one task sent from a card, so its counts
    (6 and 7 Taproom tasks) keep their meaning. That task is checked with the Idea Boards.

**Playwright:**
- `regression/ideas/boards-scenarios.spec.ts` (new, 29 tests) covers S224–S243 and S255–S261 as
  the personas, with S239's long press dropped onto a list's tab. `helpers.ts` gains `touchDropOn`
  and `cardListId`. Together with the 11 smoke tests that's 40 in the `idea-boards` project.
- What a browser can't show in a spec's time stays in ExUnit:
  - Watch's 10-minute batching (S225's and S242's notifications), and S243, which would change a
    shared persona's memberships.
  - The browser specs check the parts they can: the Watch toggle, the eye, the Watching filter.
- `tests/COVERAGE.md`: a D53 Part 2 section covering every scenario and every §4.8 item.

### Matt's changes (lead decisions 4, later sections)

- **No list dragging:** Move left/right stays.
- **Search in Archived:**
  - A search box at the top narrows lists by name and cards by title or description, ignoring
    case, as you type. "Nothing archived matches" when nothing does.
  - `…/archived` returns everything, so it filters in the browser (`archivedMatching`). The API
    only adds `description` to archived cards.
  - Tests: Vitest; Playwright S237 (description, list name, no match, restore).
  - Screenshots `archived-search-{1280,390}-{light,dark}.png` and `archived-search-none-*`.
- **"Boards":**
  - **Board names:** nav "Boards" with `ViewKanbanOutlined`; titles and switcher "Taproom
    board"; "History: Taproom board".
  - **Notification preferences:** "Changes to board cards you watch".
  - **Send's cut-off text:** "… see the card on the board".
  - **Task dialog:** "From the Taproom board: <title>". The API's `from_idea` gains `board_name`;
    with no name (card deleted for good) it reads "From a board: <title>".
  - The starter list "Ideas" keeps its name. Code names and `/api/idea_boards` are unchanged.
- **`/boards` URLs:**
  - `/boards`, `/boards/:board` and `/boards/:board/cards/:id` for people and tablets, built by
    `boardUrl()` everywhere (board, routes, task dialog link).
  - The Watch notification's `url` is now `/boards/<board>/cards/<id>`. No `/ideas` redirect.
- **No auto-watch:** already the case (S224's spec checks bartender2 isn't watching).
- **Screenshots** re-taken in both themes at 1280 and 390, with the new names and URLs:
  `/tmp/claude-501/pwlogs/d53p2shots/*.png`. Clean-up checked: no `[TEST-TEMP]` cards, lists,
  labels or tasks left.

### Judgment calls (tell me if any is wrong)

1. **Gap 14: I took the spec's second option ("the confirm says so").** D39 pins the opposite
   choice in an existing test ("Its old Wednesday is free, so the new series makes one there",
   `series_edits_test`). Skipping the date would have reversed a pinned decision and changed that
   test's meaning. If Matt prefers no twin, it's a one-line change in `skip_kept_days/6` (skip
   `series_date` as well as `due_on`) plus that test.
2. **Gap 6:** reopening takes off anyone who can't take the task now, including someone
   deactivated, with History saying why.
3. **Gap 13** applies only to a rule change (split). Delete following and Stop repeating from a
   series' first date behave as before. They delete the series, and anything finished there becomes
   a one-off, as D39 says.
4. **S226's order:** the switcher lists boards in department order, Brewery before Taproom (as the
   task boards do). The spec's row lists Taproom first. The spec asserts the three boards, with
   Company last.

### LEAD:

- **LEAD-6:** Is judgment call 1 (gap 14 confirm, not skip) acceptable?

## Stop 5b (2026-11-08): lead decisions 5

1. **S152's nav order (a change of meaning, required by spec §4.4).** `ui/layout.spec.ts` now expects
   Home, Tasks, **Boards**, Schedule on desktop and in the phone drawer. D43's spec row for S152 and
   `tests/COVERAGE.md` note the D53 order.
2. **S26's dark colour.** None of my specs or screenshot runs changed a theme; the screenshot script
   only rewrites `/api/me` inside its own browser. The cause is D43's `ui/theme.spec.ts`:
   - It put **brewer1** in Dark during its tests and back to Light in `afterAll`. `brewery-board`
     runs beside `chromium`, so S26 (brewer1) could load in the dark palette.
   - On this machine brewer1 was also **still stored as `dark`**, from an interrupted earlier run.
     That made S26 fail 5 of 5 even run on its own.
   - **Fix:** `theme.spec.ts` now creates and signs in a `[TEST-TEMP]` Brewery person in a
     file-level `beforeAll`, gives it to its person-theme tests through a `storageState` fixture,
     and retires it in `afterAll`. No shared persona's theme is touched; the owner and device tests
     are unchanged. S26 itself is unchanged.
   - I reset brewer1 to Light on the local DB (`PUT /api/me/color_mode`).
3. **Reruns, one at a time:**
   - `--project chromium --no-deps tests/regression/ui`: **49 passed**.
   - `--project idea-boards --no-deps`: **40 passed**.
   - S26 with `--repeat-each 5`: **5 passed**, after the reset. Before it, 0 of 5.

**LEAD:** DEV may also have brewer1 stored as `dark` from earlier runs. A reseed (or one
`PUT /api/me/color_mode` with light) clears it.

## Lead decisions 6 (DEV suite): done

Test-side only; no app changes.

**1. S261 (and the same pattern elsewhere).** New helper `written(page, method, path)` in
`tests/regression/ideas/helpers.ts`. It waits for the next Board write's answer and checks it's OK.
Each one is started before the click and awaited before the reload. I checked every `page.reload()` in
both ideas specs. These followed a UI write without waiting, and are fixed:
- `boards-scenarios.spec.ts`:
  - S261: the note's PATCH, the DEV failure.
  - S255: the note's POST. It had no wait at all.
  - S224: the people and due-date PATCHes, and both checklist POSTs.
  - S232: the people PATCH.
- `idea-boards-smoke.spec.ts` S224 smoke: the description and due PATCHes, the checklist POST and tick
  PATCH, the note POST and the Watch PUT.

The other reloads (S258 after the lock, S242, S231) follow API calls that were already
awaited. Nothing was weakened; every assertion is unchanged.

**2. S160 vs the theme person: kept out of the roster (the preferred option).** The roster only lists
`schedulable` people (`Accounts.list_roster`). `createTempPerson` gains `schedulable: false`, which
PATCHes `/api/users/:id` right after the create and checks for 200. `ui/theme.spec.ts` uses it. S160 is
unchanged. One gap remains: create always makes a schedulable person, so the person is on the roster
for the milliseconds between the create and the PATCH. The S160 failure on DEV needed them to appear
during S160's seconds-long read-reorder-read. Removing the gap entirely would need `schedulable` on
create, which is an app change.

**Runs (local, servers from this worktree, setup first, never `E2E_TARGET=dev`):**
- `tsc` clean. `pnpm lint` shows 26 errors, the same as before, none in the changed files.
- `idea-boards`, both ideas files `--repeat-each 3`: **120/120 passed**.
- `chromium`, `ui/theme.spec.ts` with `ui/schedule.spec.ts`:
  - `--repeat-each 3` at default workers: 2 failed, 7 did not run, 61 passed. Both failures came from
    the repeat itself. The copies of the serial Move-mode block ran at once on different workers and
    reordered the same roster: G4 copy #19 ran beside S160 copy #18. G1 ("owner has notifications to
    show") failed once in three while other copies of the owner tests ran. This would happen on any
    branch.
  - `--repeat-each 3 --workers 1`: **70/70 passed**.
  - The pair three separate times at default workers (4), so theme runs beside schedule as in the full
    suite: **24/24, 24/24, 24/24 passed**.

## Lead decisions 7: fix cycle 1 (DEV QA), done

All nine gaps are fixed. Each has a test built from the report's repro, and I checked that each test
fails with its fix reverted:
- API: I reverse-applied all `lib/` changes. 8 of the 9 new ExUnit tests failed. The ninth is the
  "no locked card, anyone restores" guard, which should pass either way.
- UI: I reverse-applied one file at a time. Gaps 1, 2, 3 and 5 each failed.
- Gap 9 is a vitest test.

New tests:
- `test/rockcut_api_web/controllers/idea_board_fix_cycle_1_test.exs`: 9 tests.
- A "fix cycle 1 (DEV QA)" block in `ideas/boards-scenarios.spec.ts`: 4 tests.
- `sentFaceChip` and the gap 9 wording in `ideas.test.ts`.

No existing test was deleted or weakened.

**Must-fix**
- **Gap 6 (blank title or name → 500).** `cast` turns `""` and `"   "` into `nil`, and
  `update_change(&String.trim/1)` then crashed on `nil`. The new `Log.trim/1` keeps `nil`, so
  `validate_required` answers 422 "can't be blank". The checklist item and note changesets had the same
  line and use it too: editing a note to blank was the same crash. Covered: card title, list name and
  label name, each with `""`, `"   "` and `null`, on create and update; the record is unchanged afterwards.
- **Gap 7 (out-of-range ids → 500).**
  - New module `RockcutApi.Ids`. `parse/1` accepts only a positive integer up to SQLite's maximum, or
    digits for one. `page/1` returns 1 for junk and caps the page at 1,000,000.
  - Boards: `Log.to_id` delegates to it, and `IdeaBoards.fetch_card` and the `card_id` filter use it.
    Every row in the report's table is now 404 for a URL id and 404 or 422 for a body id. No tasks are
    made, and nothing moves.
  - A float such as `1e20` was already nil. Only the oversized integers reached SQLite.
  - **Part 1 task boards had the same 500, and the same helper fixes them:**
    - `Tasks.to_int` (task and Daily item URL ids, `before_id`).
    - `Tasks.Assignees.to_id` (`assignee_ids`, `assignee_id`).
    - History `task_id`.
    - Covered by a test. The D38 Daily items and checks go through `Tasks.to_int`, so they're fixed too.
  - An out-of-range `before_id` on a task move is 200, last in the day. That's D38's rule for a
    `before_id` that names no task.
  - **A huge History `page` was also a 500** (the offset overflowed) on both History endpoints. It's now
    capped through `Ids.page/1`. The two now-unused `int_param` helpers are removed.

**Should-fix**
- **Gap 1 (⋮ → Rename).** The menu handed focus back to ⋮, which blurred the new name field and ended
  the rename. The field now opens in the menu's `onExited`.
- **Gap 5 (face chip).** `sentFaceChip` in `lib/ideas.ts` replaces the face's latest-send-only logic:
  - Anything still on a list wins: "On the task list", "2 on the task list", or "Repeats on the task
    list" when every live one repeats.
  - Then the latest "✓ Done <day>".
  - "Removed from the task list" only when every task is gone.
  - I kept the spec's "On the task list" wording rather than naming the department.

**Minor**
- **Gap 2 (unsaved description).**
  - `DescriptionField` reports unsaved typing. While there is some, ✕, Escape and the backdrop ask
    "Discard your changes to the description?" (Discard / Keep editing).
  - Back asks too: `useBackCloses` holds a history entry while unsaved. Back pops it, the confirm shows,
    and the URL stays on the card.
  - With nothing unsaved, the dialog closes at once.
  - `ConfirmDialog` gains an optional `cancelLabel` (default "Cancel").
- **Gap 3 (Enter on "Add the label").** Added `autoHighlight`, so Enter takes the highlighted option.
  When the typed name matches nothing, that's "Add the label …".
- **Gap 4 (restore a list holding a locked card).** The `Authz` rule that guarded `:archive` now covers
  `:restore`. A non-manager gets **423 `holds_locked_card`**, the same code as archiving, with the
  message "This list holds a locked card, so only a manager can restore it". A manager restores it.
- **Gap 8 (rename an archived list).** `Lists.rename` returns 422 `archived` "That's archived. Restore it
  first", like `Lists.move`.
- **Gap 9 (History names the department).** `describeIdeaEvent` takes the board and says "(left the
  Taproom)". It never shows the key; without the board it says "(left the department)". The task boards'
  History already said "(left the Taproom)" from the board's name (`lib/tasks.ts`), so nothing there
  changed.

**Gate (local; servers from this worktree; setup first; never `E2E_TARGET=dev`)**
- `mix test` twice: **2112 passed** both times.
- `tsc` clean. Vitest **202 passed**. `vite build` OK.
- Lint: 26 errors, the same as before, none in the changed files.
- Playwright `idea-boards`, both ideas files `--repeat-each 2`: **89 passed** (44 tests × 2, plus setup).
- I changed no task-board specs. The task-board API changes are covered by ExUnit.

**LEAD: out-of-range URL ids return 500 across the app.** I sampled 13 routes outside the Boards and
the task boards, as owner, with id `99999999999999999999`. All 13 returned 500 (`Exqlite.Error`):
- `GET /api/shifts/:id`
- `PATCH /api/users/:id`
- `PATCH /api/beer_board/:id`
- `GET /api/schedule_events/:id`
- `POST /api/time_off/:id/cancel`
- `DELETE /api/availability/:id`
- `POST /api/notifications/:id/read`
- `PATCH /api/production/tanks/:id`
- `GET /api/production/templates/:id`
- `GET /api/brands/:id`
- `GET /api/recipes/:id`
- `PATCH /api/departments/:id`
- `PATCH /api/devices/:id`

Many contexts parse ids themselves with `Integer.parse` or `Repo.get`. Not fixed here, as you asked.
Two possible fixes, if wanted later:
- One plug that turns an out-of-range `:id`-style path param into 404.
- Moving those contexts onto `RockcutApi.Ids`.
