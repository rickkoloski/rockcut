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
